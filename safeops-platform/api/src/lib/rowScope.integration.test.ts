import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IncidentService } from './incidentService.js'
import { InvestigationService } from './incidentInvestigation.js'
import { SearchService } from './searchService.js'
import { EmployeeService } from './employeeService.js'
import { NotificationService, visibleToRole } from './notificationService.js'
import type { Caller } from './incidentService.js'

/**
 * Row-level scope, on the paths that reach a record without going through its module's
 * front door.
 *
 * Tenant isolation was never the gap — every service checks membership. The gap was one
 * level down: an incident the caller's role is not entitled to *within* their own tenant,
 * reachable through a sibling router, a search box, or a notification feed. `IncidentService`
 * re-applies `incidentScopeWhere` to a direct id fetch and says why ("a guessed id must not
 * bypass row-level access"); three other paths did not, and the rows behind them are injury
 * type, body part, treatment and witness statements.
 *
 * These tests are the regression net for that, and for the medical redaction the same
 * classes of bug defeated. They assert refusals, so a fix that quietly stops applying is a
 * failing test rather than a silent leak.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const incidents = new IncidentService(db)
const investigation = new InvestigationService(db)
const search = new SearchService(db)
const employees = new EmployeeService(db)
const notifications = new NotificationService(db)

const CO = 'rowscope-itest-co'
const SITE_A = 'rowscope-itest-site-a'
const SITE_B = 'rowscope-itest-site-b'

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }

/** The reporter of the incident under test — an HSE manager, so nothing is scoped away. */
const manager: Caller = {
  userId: 'rowscope-mgr', name: 'Manager Zainab',
  roles: [{ companyId: CO, role: 'hse_manager', siteIds: [] }],
}
/** An employee who reported nothing. Their incident scope is `{ reporterId: self }`. */
const employee: Caller = {
  userId: 'rowscope-emp', name: 'Employee Kumar',
  roles: [{ companyId: CO, role: 'employee', siteIds: [] }],
}
/** A supervisor assigned to site B only. The incident under test is at site A. */
const supervisor: Caller = {
  userId: 'rowscope-sup', name: 'Supervisor Lee',
  roles: [{ companyId: CO, role: 'supervisor', siteIds: [SITE_B] }],
}

let incidentId = ''
let personId = ''

async function purge() {
  await db.notification.deleteMany({ where: { companyId: CO } })
  await db.incident.deleteMany({ where: { companyId: CO } })
  await db.employee.deleteMany({ where: { companyId: CO } })
  await db.site.deleteMany({ where: { companyId: CO } })
  await db.company.deleteMany({ where: { id: CO } })
}

d('row-level scope inside a tenant', () => {
  beforeAll(async () => {
    await purge()
    await db.company.create({
      data: { id: CO, name: 'RowScope ITest', industry: 'Testing', plan: 'standard' } as never,
    })
    for (const [id, name] of [[SITE_A, 'Site A'], [SITE_B, 'Site B']]) {
      await db.site.create({
        data: { id, companyId: CO, name, short: name, city: 'Kuching', timezone: 'Asia/Kuching' } as never,
      })
    }

    // Reported by the manager at site A: out of scope for both the employee (not theirs)
    // and the supervisor (wrong site).
    const inc = await incidents.create(manager, {
      companyId: CO, siteId: SITE_A,
      title: 'Crush injury at the press',
      description: 'Operator caught a hand in the guard.',
      type: 'injury', severity: 'lost_time_injury',
      location: 'Press shop', department: 'Production',
      occurredAt: new Date().toISOString(),
    })
    incidentId = inc.id

    const person = await investigation.addPerson(manager, incidentId, {
      role: 'injured', name: 'Grace Lim',
      injuryType: 'crush', bodyPart: 'left hand', treatment: 'hospital',
    } as never)
    personId = (person as { id: string }).id
  }, 120_000)

  afterAll(async () => { await purge(); await db.$disconnect() })

  // ── The control this all rests on ─────────────────────────────────────────

  it('refuses the incident itself to a caller outside its row scope', async () => {
    // The baseline. If this ever passes for these two, everything below is moot.
    await expect(incidents.get(employee, incidentId)).rejects.toThrow(/do not have access/i)
    await expect(incidents.get(supervisor, incidentId)).rejects.toThrow(/do not have access/i)
    await expect(incidents.get(manager, incidentId)).resolves.toBeTruthy()
  })

  // ── The investigation router ──────────────────────────────────────────────

  it('refuses the people on an incident the caller cannot open', async () => {
    /*
     * The worst of the set: IncidentPerson carries injury type, body part, treatment, days
     * lost and the witness statement. This router checked the tenant and, for writes, the
     * role — never the row — so every employee in the workspace could read all of it.
     */
    await expect(investigation.listPeople(employee, incidentId)).rejects.toThrow(/do not have access/i)
    await expect(investigation.listPeople(supervisor, incidentId)).rejects.toThrow(/do not have access/i)
  })

  it('refuses the investigation findings to a caller outside row scope', async () => {
    await expect(investigation.getInvestigation(employee, incidentId)).rejects.toThrow(/do not have access/i)
    await expect(investigation.getInvestigation(supervisor, incidentId)).rejects.toThrow(/do not have access/i)
  })

  it('refuses the linked records to a caller outside row scope', async () => {
    await expect(investigation.listLinks(employee, incidentId)).rejects.toThrow(/do not have access/i)
  })

  it('refuses a WRITE reached through a child id, not just through the incident', async () => {
    /*
     * `updatePerson` and `removePerson` resolve the incident from a person id and checked
     * only tenant + role. A supervisor holds a write role, so site scope was the only thing
     * standing between them and editing the injury record of an incident at another site —
     * and it was not being applied.
     */
    await expect(
      investigation.updatePerson(supervisor, personId, { treatment: 'edited by the wrong site' }),
    ).rejects.toThrow(/do not have access/i)

    const after = await db.incidentPerson.findUniqueOrThrow({ where: { id: personId } })
    expect(after.treatment).toBe('hospital')
  })

  it('still lets an in-scope caller do all of it', async () => {
    // The guard must refuse the right people, not everybody.
    await expect(investigation.listPeople(manager, incidentId)).resolves.toBeTruthy()
    await expect(investigation.getInvestigation(manager, incidentId)).resolves.toBeTruthy()
    await expect(
      investigation.updatePerson(manager, personId, { treatment: 'hospital, discharged' }),
    ).resolves.toBeTruthy()
  })

  // ── Search ────────────────────────────────────────────────────────────────

  it('does not return an out-of-scope incident through search', async () => {
    /*
     * Search was the id-disclosure path that made the above reachable: it scoped by tenant
     * and site but never by row, so an employee could search a colleague's name or a term
     * from a report and get back the reference, title and severity of incidents the
     * register refuses them — then use the id against the investigation router.
     */
    const mine = await search.search(manager, CO, 'Crush injury')
    expect(mine.some((h) => h.id === incidentId)).toBe(true)

    for (const caller of [employee, supervisor]) {
      const hits = await search.search(caller, CO, 'Crush injury')
      expect(hits.some((h) => h.id === incidentId)).toBe(false)
    }
  })

  it('does not leak an incident through a search for a named person on it', async () => {
    // The people match is the sharpest oracle: it answers "is my colleague in an incident".
    const hits = await search.search(employee, CO, 'Grace Lim')
    expect(hits.some((h) => h.id === incidentId)).toBe(false)
  })

  // ── Medical redaction ─────────────────────────────────────────────────────

  it('withholds the medical expiry date in every form, not just the date field', async () => {
    /*
     * `medicalExpiry` was redacted while `daysToMedicalExpiry` beside it was not, and the
     * latter is an exact day count from today's UTC midnight — so the withheld date was
     * recoverable as today + N. The redaction was visibly succeeding and failing on one line.
     */
    const expiry = new Date(Date.now() + 137 * 86_400_000)
    await db.employee.create({
      data: {
        companyId: CO, siteId: SITE_A, name: 'Medical Subject',
        employeeNo: `RS-${uniq()}`, position: 'Operator',
        medicalExpiry: expiry, medicalNotes: 'Asthma — no confined space entry',
      } as never,
    })

    const asManager = await employees.list(manager, { companyId: CO, page: 1, pageSize: 100 })
    const seenByManager = (asManager.rows as unknown as Record<string, unknown>[])
      .find((r) => r.name === 'Medical Subject')!
    expect(seenByManager.medicalExpiry).not.toBeNull()
    expect(seenByManager.daysToMedicalExpiry).not.toBeNull()

    for (const caller of [employee, supervisor]) {
      const res = await employees.list(caller, { companyId: CO, page: 1, pageSize: 100 })
      const row = (res.rows as unknown as Record<string, unknown>[])
        .find((r) => r.name === 'Medical Subject')
      if (!row) continue // site scoping may already exclude them, which is also correct
      expect(row.medicalExpiry).toBeNull()
      expect(row.medicalNotes).toBeNull()
      expect(row.bloodGroup).toBeNull()
      // The derived value must go too, or the redaction above is decorative.
      expect(row.daysToMedicalExpiry).toBeNull()
      // The coarse bucket stays: a supervisor has to know they cannot send someone in.
      expect(row.medicalStatus).toBeTruthy()
    }
  })

  // ── Notification audience ─────────────────────────────────────────────────

  it('keeps a medical-tagged notification away from roles that may not see medical data', async () => {
    /*
     * The medical sweep names an employee and states the exact expiry date. The feed had no
     * role filter and the table has no site column, so the reminder broadcast to the whole
     * workspace exactly what the register withholds.
     */
    await db.notification.create({
      data: {
        companyId: CO, kind: 'system',
        title: 'Medical expired — Grace Lim',
        detail: "EMP-0142's fitness-to-work certificate lapsed on 2026-08-14.",
        href: `/employees?open=rowscope-${uniq()}&medical=expired`,
        recipientRole: 'medical',
      } as never,
    })

    const seenByManager = await notifications.list(manager, CO)
    expect(seenByManager.some((n) => n.title.startsWith('Medical expired'))).toBe(true)

    for (const caller of [employee, supervisor]) {
      const feed = await notifications.list(caller, CO)
      expect(feed.some((n) => n.title.startsWith('Medical expired'))).toBe(false)
    }
  })

  it('leaves untagged notifications broadcast to everyone', async () => {
    // The rule restricts only what it is told to. A new tag has to be added deliberately;
    // forgetting cannot silently hide a workspace's reminders.
    await db.notification.create({
      data: {
        companyId: CO, kind: 'system',
        title: 'Permit expiring shortly',
        detail: 'PTW-9001 lapses in two hours.',
        href: `/permits?open=rowscope-${uniq()}`,
      } as never,
    })

    for (const caller of [manager, employee, supervisor]) {
      const feed = await notifications.list(caller, CO)
      expect(feed.some((n) => n.title === 'Permit expiring shortly')).toBe(true)
    }
  })

  it('builds a restriction only for roles outside the audience', () => {
    // Unit-level guard on the clause itself, so a typo in the role list is caught here
    // rather than as a puzzling absence in somebody's feed.
    expect(visibleToRole('hse_manager')).toEqual({})
    expect(visibleToRole('admin')).toEqual({})
    expect(visibleToRole('safety_officer')).toEqual({})

    /*
     * The null branch matters. `recipientRole` is nullable and SQL's `NOT (col IN (…))` is
     * NULL, not TRUE, for a NULL column — a plain negation silently drops every untagged
     * broadcast. The first version of this shipped that bug and the feed test caught it.
     */
    const restricted = { OR: [{ recipientRole: null }, { recipientRole: { notIn: ['medical'] } }] }
    expect(visibleToRole('employee')).toEqual(restricted)
    expect(visibleToRole('supervisor')).toEqual(restricted)
    expect(visibleToRole('ceo')).toEqual(restricted)
  })
})
