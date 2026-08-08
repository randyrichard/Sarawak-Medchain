import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IncidentService, SORT_KEYS, type Caller } from './incidentService.js'
import { SEVERITY_RANK } from './incidentCatalog.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The subject is the register behind the incident board: whether a filter narrows what it
 * claims to, whether an ordering is stable enough to page through without losing rows, and
 * whether any of it can be used to reach another company's data.
 *
 * Sorting gets particular attention because the obvious implementation is wrong: Postgres
 * orders an enum by declaration order, and severity values have been appended over time,
 * so ordering by the enum put a near miss above a Critical.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const incidents = new IncidentService(db)

const COMPANY = 'board-itest-co'
const OTHER = 'board-itest-other'
const SITE = 'board-itest-site'
const SITE_B = 'board-itest-site-b'
const OTHER_SITE = 'board-itest-other-site'

const role = (r: string, id: string, companyId = COMPANY): Caller => ({
  userId: `board-${id}`, name: `ITest ${id}`,
  roles: [{ companyId, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const hse = role('hse_manager', 'HSE')
const outsider = role('admin', 'Outsider', OTHER)

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000)

let seq = 0
async function make(over: Record<string, unknown> = {}) {
  seq += 1
  return incidents.create(admin, {
    companyId: COMPANY, siteId: SITE,
    title: `Board itest ${seq}`, type: 'injury', severity: 'Minor',
    location: 'Workshop', occurredAt: new Date().toISOString(),
    ...over,
  } as never)
}

const listFor = (caller: Caller, p: Record<string, unknown> = {}) =>
  incidents.list(caller, { companyId: COMPANY, page: 1, pageSize: 50, ...p } as never)

async function purge() {
  for (const id of [COMPANY, OTHER]) {
    await db.incidentPerson.deleteMany({ where: { incident: { companyId: id } } })
    await db.incidentLink.deleteMany({ where: { incident: { companyId: id } } })
    await db.incidentEvent.deleteMany({ where: { incident: { companyId: id } } })
    await db.correctiveAction.deleteMany({ where: { companyId: id } })
    await db.incident.deleteMany({ where: { companyId: id } })
    await db.notification.deleteMany({ where: { companyId: id } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: id } })
  }
}

d('Incident board and register — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'Board ITest Co'], [OTHER, 'Board ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name] of [
      [SITE, COMPANY, 'Board Site A'], [SITE_B, COMPANY, 'Board Site B'],
      [OTHER_SITE, OTHER, 'Other Co Site'],
    ]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name, short: 'BRD', city: 'Bintulu' },
      })
    }
  })

  afterAll(async () => {
    await purge()
    await db.site.deleteMany({ where: { id: { in: [SITE, SITE_B, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  beforeEach(purge)

  // ── Sorting ──────────────────────────────────────────────────────────────

  it('ranks severity by meaning, not by the order the enum was written', async () => {
    // The bug this column exists to fix: appended enum values sorted a near miss above a
    // legacy Critical, burying the serious incidents at the bottom of the register.
    expect(SEVERITY_RANK.Critical).toBeGreaterThan(SEVERITY_RANK.near_miss)
    expect(SEVERITY_RANK.catastrophic).toBeGreaterThan(SEVERITY_RANK.Critical)

    await make({ severity: 'near_miss', title: 'A near miss' })
    await make({ severity: 'Critical', title: 'A legacy critical' })
    await make({ severity: 'catastrophic', title: 'A catastrophe' })

    const { rows } = await listFor(admin, { sort: 'severity' })
    expect(rows.map((r) => r.title)).toEqual([
      'A catastrophe', 'A legacy critical', 'A near miss',
    ])
  })

  it('stores the rank alongside the severity it was written with', async () => {
    const i = await make({ severity: 'lost_time_injury' })
    const row = await db.incident.findUnique({ where: { id: i.id }, select: { severityRank: true } })
    expect(row?.severityRank).toBe(SEVERITY_RANK.lost_time_injury)
  })

  it('defaults to the serious and long-outstanding first', async () => {
    await make({ severity: 'Minor', occurredAt: daysAgo(1).toISOString(), title: 'Minor today' })
    await make({ severity: 'fatality', occurredAt: daysAgo(0).toISOString(), title: 'Fatality today' })
    await make({ severity: 'fatality', occurredAt: daysAgo(20).toISOString(), title: 'Fatality three weeks ago' })

    const { rows } = await listFor(admin)
    // Most serious first, and the oldest of those first: an untouched three-week-old
    // fatality is more urgent than one reported this morning.
    expect(rows[0].title).toBe('Fatality three weeks ago')
    expect(rows[1].title).toBe('Fatality today')
    expect(rows[2].title).toBe('Minor today')
  })

  it('orders newest and oldest by when it happened, not when it was typed in', async () => {
    await make({ occurredAt: daysAgo(10).toISOString(), title: 'Older event' })
    await make({ occurredAt: daysAgo(1).toISOString(), title: 'Newer event' })

    expect((await listFor(admin, { sort: 'newest' })).rows[0].title).toBe('Newer event')
    expect((await listFor(admin, { sort: 'oldest' })).rows[0].title).toBe('Older event')
  })

  it('offers every advertised sort key and none of them throw', async () => {
    await make()
    for (const sort of SORT_KEYS) {
      const res = await listFor(admin, { sort })
      expect(res.total, `sort=${sort}`).toBe(1)
    }
  })

  // ── Pagination ───────────────────────────────────────────────────────────

  it('pages deterministically, losing and repeating nothing', async () => {
    // All the same severity and the same instant, which is exactly when an ordering
    // without a unique tiebreak starts shuffling rows between pages.
    const when = daysAgo(3).toISOString()
    for (let n = 0; n < 12; n++) await make({ occurredAt: when, title: `Row ${n}` })

    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const res = await listFor(admin, { page, pageSize: 5 })
      expect(res.total).toBe(12)
      seen.push(...res.rows.map((r) => r.id))
    }
    expect(new Set(seen).size).toBe(12)
  })

  it('reports the total independently of the page size', async () => {
    for (let n = 0; n < 7; n++) await make()
    const res = await listFor(admin, { page: 1, pageSize: 3 })
    expect(res.rows).toHaveLength(3)
    expect(res.total).toBe(7)
    expect(res.totalPages).toBe(3)
  })

  it('returns an empty page rather than an error past the end', async () => {
    await make()
    const res = await listFor(admin, { page: 9, pageSize: 10 })
    expect(res.rows).toEqual([])
    expect(res.total).toBe(1)
  })

  // ── Filters ──────────────────────────────────────────────────────────────

  it('filters by type, severity and site', async () => {
    await make({ type: 'injury', severity: 'Minor' })
    await make({ type: 'chemical_spill', severity: 'environmental_major' })
    await make({ siteId: SITE_B, type: 'fire' })

    expect((await listFor(admin, { type: 'chemical_spill' })).total).toBe(1)
    expect((await listFor(admin, { severity: 'environmental_major' })).total).toBe(1)
    expect((await listFor(admin, { siteId: SITE_B })).total).toBe(1)
  })

  it('filters by department, case-insensitively', async () => {
    await make({ department: 'Maintenance' })
    await make({ department: 'Operations' })
    expect((await listFor(admin, { department: 'maintenance' })).total).toBe(1)
  })

  it('filters by the date the incident happened, inclusive at both ends', async () => {
    const day = daysAgo(5)
    await make({ occurredAt: day.toISOString(), title: 'On the day' })
    await make({ occurredAt: daysAgo(1).toISOString(), title: 'Later' })

    const iso = day.toISOString().slice(0, 10)
    // Same day at both ends must match: the incident happened at some time of day, not at
    // midnight, and a range that misses it is how people stop trusting the filters.
    const res = await listFor(admin, { from: iso, to: iso })
    expect(res.total).toBe(1)
    expect(res.rows[0].title).toBe('On the day')
  })

  it('ignores an unparseable date rather than returning nothing', async () => {
    await make()
    const res = await listFor(admin, { from: 'not-a-date' })
    expect(res.total).toBe(1)
  })

  it('filters by investigator across both investigator fields', async () => {
    const a = await make({ title: 'Triage assigned' })
    const b = await make({ title: 'Lead assigned' })
    await db.incident.update({ where: { id: a.id }, data: { investigator: 'Marcus Tan' } })
    await db.incident.update({ where: { id: b.id }, data: { leadInvestigator: 'Marcus Tan' } })

    // "Mine" means mine, not "mine but only in the right one of two columns".
    expect((await listFor(admin, { investigator: 'Marcus' })).total).toBe(2)
  })

  it('treats the anonymous filter as three states, not two', async () => {
    await make({ anonymous: true })
    await make({ anonymous: false })

    expect((await listFor(admin, { anonymous: true })).total).toBe(1)
    expect((await listFor(admin, { anonymous: false })).total).toBe(1)
    // Absent means either, which is not the same as false.
    expect((await listFor(admin)).total).toBe(2)
  })

  it('filters by emergency response and by shift', async () => {
    await make({ emergencyResponseActivated: true, shift: 'Night' })
    await make({ emergencyResponseActivated: false, shift: 'Day' })

    expect((await listFor(admin, { emergencyResponse: true })).total).toBe(1)
    expect((await listFor(admin, { shift: 'night' })).total).toBe(1)
  })

  it('combines filters rather than replacing one with another', async () => {
    await make({ severity: 'fatality', department: 'Maintenance' })
    await make({ severity: 'fatality', department: 'Operations' })
    await make({ severity: 'Minor', department: 'Maintenance' })

    const res = await listFor(admin, { severity: 'fatality', department: 'Maintenance' })
    expect(res.total).toBe(1)
  })

  it('searches number, title, location and reporter together', async () => {
    const i = await make({ title: 'Findable event', location: 'Jetty 4' })
    for (const q of ['Findable', 'Jetty 4', i.number]) {
      expect((await listFor(admin, { q })).total, `q=${q}`).toBe(1)
    }
  })

  // ── Tenant isolation ─────────────────────────────────────────────────────

  it('refuses a company the caller is not a member of', async () => {
    await make()
    await expect(listFor(outsider)).rejects.toMatchObject({ status: 403 })
  })

  it('never returns another company rows, whatever the filters say', async () => {
    await make({ title: 'Ours', severity: 'fatality' })
    await incidents.create(outsider, {
      companyId: OTHER, siteId: OTHER_SITE, title: 'Theirs',
      type: 'injury', severity: 'fatality', location: 'Elsewhere',
      occurredAt: new Date().toISOString(),
    } as never)

    const ours = await listFor(admin, { severity: 'fatality' })
    expect(ours.rows.map((r) => r.title)).toEqual(['Ours'])

    // And a filter naming their site does not reach across.
    const crossed = await listFor(admin, { siteId: OTHER_SITE })
    expect(crossed.total).toBe(0)
  })

  it('does not let a sort key reach across companies either', async () => {
    await make({ title: 'Ours' })
    await incidents.create(outsider, {
      companyId: OTHER, siteId: OTHER_SITE, title: 'Theirs',
      type: 'injury', severity: 'catastrophic', location: 'Elsewhere',
      occurredAt: new Date().toISOString(),
    } as never)

    for (const sort of SORT_KEYS) {
      const res = await listFor(admin, { sort })
      expect(res.rows.every((r) => r.title === 'Ours'), `sort=${sort}`).toBe(true)
    }
  })

  // ── The board ────────────────────────────────────────────────────────────

  it('counts the board against the same scope the register uses', async () => {
    await make({ severity: 'lost_time_injury' })
    await make({ severity: 'near_miss' })
    await incidents.create(outsider, {
      companyId: OTHER, siteId: OTHER_SITE, title: 'Theirs',
      type: 'injury', severity: 'fatality', location: 'Elsewhere',
      occurredAt: new Date().toISOString(),
    } as never)

    const board = await incidents.board(admin, COMPANY)
    expect(board.total).toBe(2)
    expect(board.lostTime).toBe(1)
    expect(board.nearMisses).toBe(1)
  })

  it('refuses the board to another company', async () => {
    await expect(incidents.board(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })

  it('scopes the board to one site when asked', async () => {
    await make({ siteId: SITE })
    await make({ siteId: SITE_B })
    expect((await incidents.board(admin, COMPANY, SITE_B)).total).toBe(1)
  })

  it('gives an honest empty board rather than failing', async () => {
    const board = await incidents.board(hse, COMPANY)
    expect(board.total).toBe(0)
    expect(board.bySeverity).toEqual([])
    expect(board.topRootCauses).toEqual([])
  })
  // -- severityRank integrity -----------------------------------------------

  it('keeps the rank correct when a row is written straight to the table', async () => {
    // The seed, a bulk import and any hand-run SQL all bypass the service. The database
    // trigger is what makes those safe; without it every seeded incident ranked 0 and
    // sorted below a near miss.
    const row = await db.incident.create({
      data: {
        number: `INC-RAW-${Math.random().toString(36).slice(2, 8)}`,
        companyId: COMPANY, siteId: SITE, title: 'Written directly',
        type: 'injury', severity: 'fatality', location: 'Nowhere',
        occurredAt: new Date(), reporter: 'ITest',
      },
      select: { id: true, severityRank: true },
    })
    expect(row.severityRank).toBe(SEVERITY_RANK.fatality)
  })

  it('re-derives the rank when the severity is changed', async () => {
    const i = await make({ severity: 'Minor' })
    await db.incident.update({ where: { id: i.id }, data: { severity: 'catastrophic' } })

    const after = await db.incident.findUnique({
      where: { id: i.id }, select: { severityRank: true },
    })
    expect(after?.severityRank).toBe(SEVERITY_RANK.catastrophic)
  })

  it('ignores a rank supplied by the caller', async () => {
    const i = await make({ severity: 'near_miss' })
    // A client-chosen rank would be a way to reorder somebody else's board.
    await db.incident.update({
      where: { id: i.id }, data: { severity: 'near_miss', severityRank: 99 },
    })
    const after = await db.incident.findUnique({
      where: { id: i.id }, select: { severityRank: true },
    })
    expect(after?.severityRank).toBe(SEVERITY_RANK.near_miss)
  })

  it('leaves no row in the table disagreeing with its own severity', async () => {
    await make({ severity: 'lost_time_injury' })
    await make({ severity: 'Serious' })
    const adrift = await db.$queryRawUnsafe<{ n: number }[]>(
      'select count(*)::int as n from "Incident" where "severityRank" is distinct from incident_severity_rank(severity)',
    )
    expect(adrift[0].n).toBe(0)
  })

  it('re-sorts the board correctly after a severity is corrected', async () => {
    const a = await make({ severity: 'Minor', title: 'Reclassified later' })
    await make({ severity: 'Serious', title: 'Serious from the start' })

    // Triage decides it was worse than first reported.
    await db.incident.update({ where: { id: a.id }, data: { severity: 'fatality' } })

    const { rows } = await listFor(admin, { sort: 'severity' })
    expect(rows[0].title).toBe('Reclassified later')
  })
  // -- RCA authorisation ----------------------------------------------------

  const RCA_BODY = {
    causes: [{ id: 'c1', category: 'Management System Failure', description: 'No review of legacy plant.' }],
    fiveWhys: {
      problem: 'Hand caught in the drive',
      whys: ['Reached past the guard', 'Guard removed to clear a jam', 'No lock-off point', '', ''],
      rootStatement: 'Legacy machines were never re-assessed.',
    },
  }

  it('saves a root cause analysis and reads it back', async () => {
    const i = await make()
    await db.incident.update({ where: { id: i.id }, data: { stage: 'rca' } })
    await incidents.saveRca(admin, i.id, RCA_BODY as never)

    const row = await db.incident.findUnique({
      where: { id: i.id }, select: { rcaFiveWhys: true, rcaCauses: true },
    })
    const whys = (row?.rcaFiveWhys as { whys: string[] }).whys
    expect(whys.filter(Boolean)).toHaveLength(3)
    expect((row?.rcaCauses as { category: string }[])[0].category).toBe('Management System Failure')
  })

  it('refuses to rewrite the analysis of a closed incident', async () => {
    const i = await make()
    await db.incident.update({ where: { id: i.id }, data: { stage: 'closed' } })
    /*
     * The screen hides the editor once the incident leaves the rca stage, but the screen is
     * not the control. Rewriting the root cause of a closed investigation through the API
     * is precisely what an audit trail exists to prevent.
     */
    await expect(incidents.saveRca(admin, i.id, RCA_BODY as never))
      .rejects.toThrow(/closed.*part of the record/i)
  })

  it('refuses to rewrite the analysis of an archived incident', async () => {
    const i = await make()
    await db.incident.update({ where: { id: i.id }, data: { archived: true } })
    await expect(incidents.saveRca(admin, i.id, RCA_BODY as never))
      .rejects.toThrow()
  })

  it('keeps the approval lock as well as the closed rule', async () => {
    const i = await make()
    await db.incident.update({
      where: { id: i.id }, data: { stage: 'rca', rcaApprovedBy: 'Somebody' },
    })
    await expect(incidents.saveRca(admin, i.id, RCA_BODY as never))
      .rejects.toThrow(/approved and is locked/i)
  })

  it('refuses a root cause analysis from a role that may not record one', async () => {
    const i = await make()
    await db.incident.update({ where: { id: i.id }, data: { stage: 'rca' } })
    const employee = role('employee', 'Employee')
    await expect(incidents.saveRca(employee, i.id, RCA_BODY as never))
      .rejects.toMatchObject({ status: 403 })
  })

  it('refuses a root cause analysis on another company incident', async () => {
    const i = await make()
    await db.incident.update({ where: { id: i.id }, data: { stage: 'rca' } })
    await expect(incidents.saveRca(outsider, i.id, RCA_BODY as never)).rejects.toThrow()
  })
})
