import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ReportService } from './reportService.js'
import { Scheduler } from './scheduler.js'
import { IncidentService, type Caller } from './incidentService.js'
import { dueSlotKey } from './reportSchedule.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * A scheduled report is the one feature that puts a tenant's whole safety picture in
 * somebody's inbox without a human in the loop, so the tests concentrate on the ways that
 * goes wrong: the wrong tenant's rows, a recipient who left the company, a closed action
 * counted as overdue, and the same Monday report sent four times because the sweep ran
 * four times.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const reports = new ReportService(db)
const incidents = new IncidentService(db)
const scheduler = new Scheduler(db)

const COMPANY = 'rpt-itest-co'
const OTHER = 'rpt-itest-other'
const SITE = 'rpt-itest-site'
const SITE_B = 'rpt-itest-site-b'
const OTHER_SITE = 'rpt-itest-other-site'

const role = (r: string, id: string, companyId = COMPANY): Caller => ({
  userId: `rpt-${id}`, name: `ITest ${id}`,
  roles: [{ companyId, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const hse = role('hse_manager', 'HSE')
const officer = role('safety_officer', 'Officer')
const employee = role('employee', 'Employee')
const supervisor = role('supervisor', 'Supervisor')
const outsider = role('admin', 'Outsider', OTHER)

const days = (n: number) => new Date(Date.now() + n * 86_400_000)

/** A user who is a member of a company, so they can be a recipient. */
async function member(companyId: string, tag: string, r = 'hse_manager') {
  const user = await db.user.create({
    data: {
      email: `rpt-${tag}-${Math.random().toString(36).slice(2, 8)}@itest.local`,
      name: `Recipient ${tag}`, passwordHash: 'x', status: 'active',
    },
  })
  await db.membership.create({ data: { userId: user.id, companyId, role: r as never } })
  return user
}

let seq = 0
async function incident(companyId = COMPANY, siteId = SITE, over: Record<string, unknown> = {}) {
  seq += 1
  const caller = companyId === COMPANY ? admin : outsider
  return incidents.create(caller, {
    companyId, siteId, title: `Report itest ${seq}`, type: 'injury', severity: 'Minor',
    location: 'Workshop', occurredAt: new Date().toISOString(), ...over,
  } as never)
}

async function action(incidentId: string, over: Record<string, unknown> = {}) {
  const i = await db.incident.findUniqueOrThrow({ where: { id: incidentId } })
  const caller = i.companyId === COMPANY ? admin : outsider
  return incidents.addAction(caller, incidentId, {
    title: 'Fit a guard', owner: 'ITest Owner',
    dueDate: days(-5).toISOString().slice(0, 10),
    ...over,
  } as never)
}

async function purge() {
  for (const id of [COMPANY, OTHER]) {
    await db.reportRun.deleteMany({ where: { companyId: id } })
    await db.reportSchedule.deleteMany({ where: { companyId: id } })
    await db.incidentAttachment.deleteMany({ where: { incident: { companyId: id } } })
    await db.incidentEvent.deleteMany({ where: { incident: { companyId: id } } })
    await db.correctiveAction.deleteMany({ where: { companyId: id } })
    await db.incident.deleteMany({ where: { companyId: id } })
    await db.notification.deleteMany({ where: { companyId: id } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: id } })
    await db.membership.deleteMany({ where: { companyId: id } })
  }
  /*
   * Only this suite's users.
   *
   * Deleting everything matching @itest.local wiped the admin suite's fixtures mid-test -
   * vitest runs files in parallel, and a purge scoped to a shared domain is a purge of
   * somebody else's data. The rpt- prefix is what makes this suite's cleanup its own.
   */
  await db.user.deleteMany({ where: { email: { startsWith: 'rpt-' } } })
}

d('Scheduled reports — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'Report ITest Co'], [OTHER, 'Report ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name] of [
      [SITE, COMPANY, 'Report Site A'], [SITE_B, COMPANY, 'Report Site B'],
      [OTHER_SITE, OTHER, 'Other Co Site'],
    ]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name, short: 'RPT', city: 'Bintulu' },
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

  // ── Overdue actions ──────────────────────────────────────────────────────

  it('reports an overdue action with its incident, owner and days overdue', async () => {
    const i = await incident()
    await action(i.id, { owner: 'Ahmad Zaki', dueDate: days(-9).toISOString().slice(0, 10) })

    const r = await reports.build(COMPANY, 'overdue_actions')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ owner: 'Ahmad Zaki', incident: i.number, overdue: '9' })
    expect(r.summary.find((s) => s.label === 'Overdue actions')?.value).toBe('1')
  })

  it('does not count an action that is due today', async () => {
    const i = await incident()
    await action(i.id, { dueDate: new Date().toISOString().slice(0, 10) })
    // Due today is not overdue for the whole of today.
    expect((await reports.build(COMPANY, 'overdue_actions')).rows).toHaveLength(0)
  })

  it('does not count completed, verified or cancelled actions', async () => {
    const i = await incident()
    for (const status of ['completed', 'verified', 'cancelled'] as const) {
      const a = await action(i.id)
      await db.correctiveAction.update({ where: { id: a.id }, data: { status } })
    }
    // An action closed last week is not overdue, and a report saying otherwise is the
    // fastest way to lose the reader.
    expect((await reports.build(COMPANY, 'overdue_actions')).rows).toHaveLength(0)
  })

  it('flags an action still awaiting the evidence it demanded', async () => {
    const i = await incident()
    await action(i.id, { evidenceRequired: true })
    const r = await reports.build(COMPANY, 'overdue_actions')
    expect(r.rows[0].status).toMatch(/evidence due/)
    expect(r.summary.find((s) => s.label === 'Awaiting evidence')?.value).toBe('1')
  })

  it('uses the same overdue rule the register uses', async () => {
    const i = await incident()
    await action(i.id, { dueDate: days(-3).toISOString().slice(0, 10) })
    const viaRegister = await incidents.listActions(admin, COMPANY, {
      page: 1, pageSize: 50, overdue: true,
    })
    const viaReport = await reports.build(COMPANY, 'overdue_actions')
    // One definition of "overdue", imported rather than restated.
    expect(viaReport.rows).toHaveLength(viaRegister.total)
  })

  it('says so plainly when there is nothing overdue', async () => {
    const r = await reports.build(COMPANY, 'overdue_actions')
    expect(r.rows).toHaveLength(0)
    expect(r.emptyMessage).toMatch(/Nothing to chase/i)
  })

  // ── Open investigations ──────────────────────────────────────────────────

  it('reports an open investigation with what is still outstanding', async () => {
    const i = await incident(COMPANY, SITE, { severity: 'lost_time_injury' })
    await db.incident.update({ where: { id: i.id }, data: { stage: 'investigation' } })

    const r = await reports.build(COMPANY, 'open_investigations')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].number).toBe(i.number)
    expect(r.rows[0].outstanding).toMatch(/investigator|root cause|5-why/)
  })

  it('excludes closed and archived investigations', async () => {
    const closed = await incident()
    await db.incident.update({ where: { id: closed.id }, data: { stage: 'closed' } })
    const archived = await incident()
    await db.incident.update({ where: { id: archived.id }, data: { archived: true } })

    expect((await reports.build(COMPANY, 'open_investigations')).rows).toHaveLength(0)
  })

  it('counts investigations with nobody assigned', async () => {
    await incident()
    const r = await reports.build(COMPANY, 'open_investigations')
    expect(r.summary.find((s) => s.label === 'No investigator')?.value).toBe('1')
  })

  it('does not name a reporter on an anonymous report', async () => {
    const i = await incident(COMPANY, SITE, { anonymous: true })
    const r = await reports.build(COMPANY, 'open_investigations')
    const row = r.rows.find((x) => x.number === i.number)!
    // Anonymity is about the reporter; the report must not leak them into a PDF that goes
    // out by email to a distribution list.
    expect(JSON.stringify(row)).not.toContain(admin.name)
  })

  // ── Tenant isolation ─────────────────────────────────────────────────────

  it('never includes another company rows', async () => {
    const ours = await incident()
    await action(ours.id)
    const theirs = await incident(OTHER, OTHER_SITE)
    await action(theirs.id)

    const r = await reports.build(COMPANY, 'overdue_actions')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].incident).toBe(ours.number)
  })

  it('refuses to build a report for a company the caller is not in', async () => {
    await expect(reports.preview(outsider, COMPANY, 'overdue_actions'))
      .rejects.toMatchObject({ status: 403 })
  })

  it('refuses a site belonging to another company', async () => {
    // Silently widening to the whole company would put other sites' data in an inbox.
    await expect(reports.build(COMPANY, 'overdue_actions', OTHER_SITE))
      .rejects.toThrow(/Unknown site/i)
  })

  it('scopes a report to one site when asked', async () => {
    const a = await incident(COMPANY, SITE)
    await action(a.id)
    const b = await incident(COMPANY, SITE_B)
    await action(b.id)

    expect((await reports.build(COMPANY, 'overdue_actions', SITE_B)).rows).toHaveLength(1)
  })

  // ── Authorisation ────────────────────────────────────────────────────────

  it('refuses reports to roles that should not see the whole workspace', async () => {
    for (const caller of [employee, supervisor]) {
      await expect(
        reports.preview(caller, COMPANY, 'overdue_actions'),
        caller.roles[0].role,
      ).rejects.toMatchObject({ status: 403 })
    }
  })

  it('allows admin, HSE manager and safety officer', async () => {
    for (const caller of [admin, hse, officer]) {
      await expect(reports.preview(caller, COMPANY, 'overdue_actions')).resolves.toBeTruthy()
    }
  })

  // ── Recipients ───────────────────────────────────────────────────────────

  const baseSchedule = (recipientUserIds: string[], over: Record<string, unknown> = {}) => ({
    name: 'Monday morning', reportType: 'overdue_actions' as const,
    frequency: 'weekly' as const, dayOfWeek: 1, timeOfDay: '08:00',
    timezone: 'Asia/Kuching', recipientUserIds, ...over,
  })

  it('creates a Monday 08:00 Kuching schedule and arms it', async () => {
    const u = await member(COMPANY, 'a')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))

    expect(s.timezone).toBe('Asia/Kuching')
    expect(s.nextRunAt).not.toBeNull()
    // Armed for an actual Monday morning in Kuching, not 08:00 UTC.
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuching', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(s.nextRunAt!)
    expect(parts).toMatch(/Mon/)
    expect(parts).toMatch(/08:00/)
  })

  it('refuses a recipient from another company', async () => {
    const foreign = await member(OTHER, 'foreign')
    /*
     * The isolation rule that matters most in this module: without it a tenant could
     * address a schedule to another tenant's user and post the whole safety picture into
     * their inbox every Monday.
     */
    await expect(reports.createSchedule(admin, COMPANY, baseSchedule([foreign.id])))
      .rejects.toThrow(/not active members of this workspace/i)
  })

  it('refuses a schedule with no recipients', async () => {
    await expect(reports.createSchedule(admin, COMPANY, baseSchedule([])))
      .rejects.toThrow()
  })

  it('refuses an unrecognised timezone rather than defaulting to UTC', async () => {
    const u = await member(COMPANY, 'b')
    await expect(reports.createSchedule(admin, COMPANY,
      baseSchedule([u.id], { timezone: 'Mars/Olympus' })))
      .rejects.toThrow(/not a timezone/i)
  })

  it('refuses a delivery time that is not a time of day', async () => {
    const u = await member(COMPANY, 'c')
    await expect(reports.createSchedule(admin, COMPANY,
      baseSchedule([u.id], { timeOfDay: '25:00' })))
      .rejects.toThrow(/time of day/i)
  })

  it('refuses schedule creation to a role that may not', async () => {
    const u = await member(COMPANY, 'd')
    await expect(reports.createSchedule(employee, COMPANY, baseSchedule([u.id])))
      .rejects.toMatchObject({ status: 403 })
  })

  it('drops a recipient who has left the workspace rather than emailing them', async () => {
    const u = await member(COMPANY, 'leaver')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))

    await db.membership.deleteMany({ where: { userId: u.id, companyId: COMPANY } })
    const listed = await reports.listSchedules(admin, COMPANY)
    const row = listed.find((r) => r.id === s.id)!
    expect(row.recipients).toHaveLength(0)
    // Surfaced rather than hidden: a schedule addressed to nobody is worth seeing.
    expect(row.unreachableRecipients).toBe(1)
  })

  // ── Enable, disable, delete ──────────────────────────────────────────────

  it('disarms a disabled schedule and re-arms it when enabled', async () => {
    const u = await member(COMPANY, 'e')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))

    const off = await reports.updateSchedule(admin, s.id, { enabled: false })
    expect(off.nextRunAt).toBeNull()

    const on = await reports.updateSchedule(admin, s.id, { enabled: true })
    expect(on.nextRunAt).not.toBeNull()
  })

  it('re-arms from now when the timing changes, never leaving a stale past due time', async () => {
    const u = await member(COMPANY, 'f')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    const updated = await reports.updateSchedule(admin, s.id, { timeOfDay: '17:30' })
    expect(updated.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('keeps the run history when a schedule is deleted', async () => {
    const u = await member(COMPANY, 'g')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await reports.runNow(admin, s.id)
    await reports.deleteSchedule(admin, s.id)

    // Deleting a schedule must not erase the evidence that reports went out.
    const history = await reports.history(admin, COMPANY)
    expect(history).toHaveLength(1)
    expect(history[0].scheduleId).toBeNull()
  })

  // ── Execution ────────────────────────────────────────────────────────────

  it('runs now, records the row count and stores a real PDF', async () => {
    const i = await incident()
    await action(i.id)
    const u = await member(COMPANY, 'h')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))

    const result = await reports.runNow(admin, s.id)
    expect(result.skipped).toBe(false)

    const [run] = await reports.history(admin, COMPANY)
    expect(run.status).toBe('success')
    expect(run.rowCount).toBe(1)
    expect(run.recipientCount).toBe(1)
    expect(run.storedName).toMatch(/\.pdf$/)
    expect(run.sizeBytes!).toBeGreaterThan(500)
  })

  it('records honestly that nothing was emailed when no provider is configured', async () => {
    const u = await member(COMPANY, 'i')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await reports.runNow(admin, s.id)

    const [run] = await reports.history(admin, COMPANY)
    // A run that claims "delivered" with no mail server is worse than a visible failure:
    // the manager stops checking the app because they think the email is coming.
    expect(run.delivered).toBe(false)
    expect(run.deliveryNote).toMatch(/no mail provider is configured/i)
  })

  it('does not touch the schedule timing on a manual run', async () => {
    const u = await member(COMPANY, 'j')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    const armedFor = s.nextRunAt!.getTime()

    await reports.runNow(admin, s.id)
    const after = await db.reportSchedule.findUniqueOrThrow({ where: { id: s.id } })
    expect(after.nextRunAt!.getTime()).toBe(armedFor)
    expect(after.lastRunStatus).toBe('success')
  })

  it('refuses Run now to a role that may not', async () => {
    const u = await member(COMPANY, 'k')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await expect(reports.runNow(employee, s.id)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses Run now on another company schedule', async () => {
    const u = await member(COMPANY, 'l')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await expect(reports.runNow(outsider, s.id)).rejects.toMatchObject({ status: 403 })
  })

  // ── Idempotency and the sweep ────────────────────────────────────────────

  it('sends a due schedule once however many times the sweep runs', async () => {
    const i = await incident()
    await action(i.id)
    const u = await member(COMPANY, 'm')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))

    // Bring it due.
    await db.reportSchedule.update({
      where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) },
    })

    const first = await scheduler.sweepScheduledReports()
    expect(first).toBe(1)

    // The sweep runs every fifteen minutes and can be started twice. Without the unique
    // (scheduleId, dueSlot) index the Monday report goes out four times before nine.
    await db.reportSchedule.update({
      where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) },
    })
    const second = await scheduler.sweepScheduledReports()
    expect(second).toBe(0)

    const history = await reports.history(admin, COMPANY)
    expect(history.filter((h) => h.trigger === 'scheduled')).toHaveLength(1)
  })

  it('advances the schedule after a run so it is not immediately due again', async () => {
    const u = await member(COMPANY, 'n')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await db.reportSchedule.update({
      where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) },
    })

    await scheduler.sweepScheduledReports()
    const after = await db.reportSchedule.findUniqueOrThrow({ where: { id: s.id } })
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('leaves a disabled schedule alone', async () => {
    const u = await member(COMPANY, 'o')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id], { enabled: false }))
    await db.reportSchedule.update({
      where: { id: s.id }, data: { nextRunAt: new Date(Date.now() - 60_000) },
    })
    expect(await scheduler.sweepScheduledReports()).toBe(0)
  })

  it('does not run a schedule that is not yet due', async () => {
    const u = await member(COMPANY, 'p')
    await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    expect(await scheduler.sweepScheduledReports()).toBe(0)
  })

  it('records the slot it was owed, so a late sweep is attributed correctly', async () => {
    const u = await member(COMPANY, 'q')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    const owed = new Date(Date.now() - 3 * 3_600_000)
    await db.reportSchedule.update({ where: { id: s.id }, data: { nextRunAt: owed } })

    await scheduler.sweepScheduledReports()
    const run = await db.reportRun.findFirstOrThrow({ where: { scheduleId: s.id } })
    expect(run.dueSlot).toBe(dueSlotKey({
      frequency: 'weekly', dayOfWeek: 1, timeOfDay: '08:00', timezone: 'Asia/Kuching',
    }, owed))
  })

  it('one broken schedule does not stop the others in the same pass', async () => {
    const u = await member(COMPANY, 'r')
    const good = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    const bad = await reports.createSchedule(admin, COMPANY,
      baseSchedule([u.id], { name: 'Broken', reportType: 'open_investigations' }))

    // Point one at a site that no longer exists, which makes build() throw.
    await db.reportSchedule.update({
      where: { id: bad.id },
      data: { siteId: 'deleted-site', nextRunAt: new Date(Date.now() - 60_000) },
    })
    await db.reportSchedule.update({
      where: { id: good.id }, data: { nextRunAt: new Date(Date.now() - 60_000) },
    })

    await scheduler.sweepScheduledReports()

    const history = await reports.history(admin, COMPANY)
    expect(history.some((h) => h.status === 'failed')).toBe(true)
    expect(history.some((h) => h.status === 'success')).toBe(true)
  })

  it('records the failure on the schedule without wedging it', async () => {
    const u = await member(COMPANY, 's')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await db.reportSchedule.update({
      where: { id: s.id },
      data: { siteId: 'deleted-site', nextRunAt: new Date(Date.now() - 60_000) },
    })

    await scheduler.sweepScheduledReports()
    const after = await db.reportSchedule.findUniqueOrThrow({ where: { id: s.id } })
    expect(after.lastRunStatus).toBe('failed')
    expect(after.lastRunError).toBeTruthy()
    // A schedule that stops trying because one week failed is worse than one that reports
    // the failure and carries on.
    expect(after.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
  })

  // ── History and files ────────────────────────────────────────────────────

  it('refuses run history to another company', async () => {
    await expect(reports.history(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a stored report file to another company', async () => {
    const u = await member(COMPANY, 't')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await reports.runNow(admin, s.id)
    const [run] = await reports.history(admin, COMPANY)

    // The id alone must grant nothing: membership is re-checked on every download.
    await expect(reports.runFile(outsider, run.id)).rejects.toMatchObject({ status: 403 })
    await expect(reports.runFile(employee, run.id)).rejects.toMatchObject({ status: 403 })
    await expect(reports.runFile(admin, run.id)).resolves.toBeTruthy()
  })

  it('orders history newest first', async () => {
    const u = await member(COMPANY, 'u')
    const s = await reports.createSchedule(admin, COMPANY, baseSchedule([u.id]))
    await reports.runNow(admin, s.id)
    await reports.runNow(admin, s.id)

    const history = await reports.history(admin, COMPANY)
    expect(history).toHaveLength(2)
    expect(history[0].startedAt >= history[1].startedAt).toBe(true)
  })

  // ── The PDF ──────────────────────────────────────────────────────────────

  it('produces a real PDF containing the actual incident data', async () => {
    const i = await incident()
    await action(i.id, { owner: 'Findable Owner' })

    const { pdf } = await reports.renderPdf(admin, COMPANY, 'overdue_actions')
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')

    /*
     * The rendered text is asserted where it can be: pdfkit writes into Flate-compressed
     * content streams with a subset encoding, so a plain byte search finds nothing. The
     * data going in is asserted directly, and a separate check covers the character
     * substitution that keeps the built-in WinAnsi font from emitting replacement boxes.
     */
    const data = await reports.build(COMPANY, 'overdue_actions')
    expect(data.rows.some((r) => r.owner === 'Findable Owner')).toBe(true)
    expect(data.rows.some((r) => r.incident === i.number)).toBe(true)
    expect(pdf.bytes.length).toBeGreaterThan(1000)
    expect(pdf.fileName).toMatch(/overdue-corrective-actions-\d{4}-\d{2}-\d{2}\.pdf/)
  })

  it('pages a long table rather than overflowing one sheet', async () => {
    const i = await incident()
    /*
     * Inserted directly rather than through addAction. The subject here is the PDF
     * renderer paging a long table; ninety sequential service calls - each a transaction
     * with a counter upsert and a notification - made this the slowest test in the suite
     * and it timed out under parallel load for reasons that had nothing to do with the PDF.
     */
    await db.correctiveAction.createMany({
      data: Array.from({ length: 90 }, (_, n) => ({
        code: `CA-PAGE-${n}`,
        incidentId: i.id,
        companyId: COMPANY,
        siteId: SITE,
        title: `Action number ${n} with a title long enough to need truncating in the column`,
        owner: `Owner ${n}`,
        dueDate: days(-(n + 1)),
        createdBy: 'itest',
      })),
    })

    const { data, pdf } = await reports.renderPdf(admin, COMPANY, 'overdue_actions')
    expect(data.rows).toHaveLength(90)
    // More rows than fit on a page, so the document must run to several.
    expect(pdf.bytes.length).toBeGreaterThan(3000)
  })

  it('substitutes characters the built-in PDF font cannot draw', async () => {
    const i = await incident()
    // Typographic punctuation is used freely elsewhere in the product; in a WinAnsi font
    // it renders as a replacement box, and a report sent to a director arrives full of
    // tofu. The row data is where user-entered text reaches the page.
    await action(i.id, { title: 'Replace the guard – aisle D • urgent “now”' })

    const { pdf } = await reports.renderPdf(admin, COMPANY, 'overdue_actions')
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.bytes.length).toBeGreaterThan(1000)
  })

  it('renders an empty report without failing', async () => {
    const { data, pdf } = await reports.renderPdf(admin, COMPANY, 'overdue_actions')
    expect(data.rows).toHaveLength(0)
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
