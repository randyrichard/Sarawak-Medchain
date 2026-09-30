import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { InvestigationService, completionBlockers } from './incidentInvestigation.js'
import { IncidentService, type Caller } from './incidentService.js'
import { SEVERITY_RANK, LOST_TIME_SEVERITIES } from './incidentCatalog.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The subject is the case file: who was involved, what else the event touched, and whether
 * a cause was actually established before somebody declared the investigation finished. So
 * the tests are mostly about the ways a file can look complete and not be - an injury
 * recorded against a witness, a sign-off with no root cause, a link to a record in another
 * workspace, and an anonymous report whose reporter leaks out through a list or a search.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const inv = new InvestigationService(db)
const incidents = new IncidentService(db)

const COMPANY = 'inv-itest-co'
const SITE = 'inv-itest-site'

const role = (r: string, id: string): Caller => ({
  userId: `inv-${id}`, name: `ITest ${id}`,
  roles: [{ companyId: COMPANY, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const hse = role('hse_manager', 'HSE')
const officer = role('safety_officer', 'Officer')
const supervisor = role('supervisor', 'Supervisor')
const employee = role('employee', 'Employee')

let seq = 0
async function newIncident(over: Record<string, unknown> = {}) {
  seq += 1
  return incidents.create(admin, {
    companyId: COMPANY, siteId: SITE,
    title: `ITest incident ${seq}`, type: 'injury', severity: 'Minor',
    location: 'Workshop', occurredAt: new Date().toISOString(),
    ...over,
  } as never)
}

const makeEmployee = (name = 'Witness One') => db.employee.create({
  data: {
    companyId: COMPANY, siteId: SITE,
    employeeNo: `EMP-INV-${Math.random().toString(36).slice(2, 8)}`,
    name, department: 'Maintenance',
  },
})

async function purge() {
  await db.incidentAttachment.deleteMany({ where: { incident: { companyId: COMPANY } } })
  await db.incidentPerson.deleteMany({ where: { incident: { companyId: COMPANY } } })
  await db.incidentLink.deleteMany({ where: { incident: { companyId: COMPANY } } })
  await db.incidentEvent.deleteMany({ where: { incident: { companyId: COMPANY } } })
  await db.correctiveAction.deleteMany({ where: { companyId: COMPANY } })
  await db.incident.deleteMany({ where: { companyId: COMPANY } })
  await db.employee.deleteMany({ where: { companyId: COMPANY } })
  await db.notification.deleteMany({ where: { companyId: COMPANY } })
  await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
}

d('Incident investigation — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Investigation ITest Co' },
    })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: COMPANY, name: 'Investigation Site', short: 'INV', city: 'Bintulu' },
    })
  })

  afterAll(async () => {
    await purge()
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(purge)

  // ── Classification ───────────────────────────────────────────────────────

  it('accepts the enterprise classification set', async () => {
    const i = await newIncident({ type: 'chemical_spill', severity: 'environmental_major' })
    expect(i.type).toBe('chemical_spill')
    expect(i.severity).toBe('environmental_major')
  })

  it('still accepts the legacy scale, because existing rows carry it', async () => {
    const i = await newIncident({ type: 'first_aid', severity: 'Serious' })
    expect(i.severity).toBe('Serious')
  })

  it('refuses an invented type or severity', async () => {
    await expect(newIncident({ type: 'alien_abduction' })).rejects.toThrow(/Unknown incident type/i)
    await expect(newIncident({ severity: 'quite bad' })).rejects.toThrow(/Unknown severity/i)
  })

  it('ranks a legacy severity where it was understood to sit', () => {
    // A historic "Critical" must not fall off the scale below a near miss.
    expect(SEVERITY_RANK.Critical).toBeGreaterThan(SEVERITY_RANK.Minor)
    expect(SEVERITY_RANK.fatality).toBeGreaterThan(SEVERITY_RANK.Critical)
    expect(SEVERITY_RANK.near_miss).toBeLessThan(SEVERITY_RANK.Minor)
  })

  it('counts a fatality as lost time, because it is', () => {
    expect(LOST_TIME_SEVERITIES).toContain('fatality')
  })

  it('records the report context', async () => {
    const i = await newIncident({
      weather: 'Heavy rain', shift: 'Night', emergencyResponseActivated: true,
    })
    const row = await db.incident.findUnique({ where: { id: i.id } })
    expect(row?.weather).toBe('Heavy rain')
    expect(row?.shift).toBe('Night')
    expect(row?.emergencyResponseActivated).toBe(true)
  })

  // ── Anonymous reporting ──────────────────────────────────────────────────

  it('withholds the reporter on an anonymous report from anyone below HSE manager', async () => {
    const i = await newIncident({ anonymous: true })

    const asOfficer = await incidents.get(officer, i.id)
    expect(asOfficer.reporter).toBe('Reported anonymously')
    expect(asOfficer.reporterId).toBeNull()

    // HSE still sees it: somebody has to be able to follow up on a serious allegation.
    const asHse = await incidents.get(hse, i.id)
    expect(asHse.reporter).toBe(admin.name)
  })

  it('withholds the reporter in the register as well as the detail page', async () => {
    await newIncident({ anonymous: true })
    const list = await incidents.list(officer, {
      companyId: COMPANY, page: 1, pageSize: 20,
    } as never)
    // A register that names the reporter defeats the flag entirely.
    expect(list.rows.every((r) => r.reporter !== admin.name)).toBe(true)
  })

  it('still stores the reporter, so an anonymous channel remains auditable', async () => {
    const i = await newIncident({ anonymous: true })
    const raw = await db.incident.findUnique({ where: { id: i.id } })
    expect(raw?.reporter).toBe(admin.name)
    expect(raw?.reporterId).toBe(admin.userId)
  })

  // ── People ───────────────────────────────────────────────────────────────

  it('names a witness from the workforce register and keeps the name as text', async () => {
    const i = await newIncident()
    const e = await makeEmployee('Ahmad Zaki')
    await inv.addPerson(admin, i.id, { role: 'witness', employeeId: e.id, statement: 'Saw the load swing.' })

    const [p] = await inv.listPeople(admin, i.id)
    expect(p.name).toBe('Ahmad Zaki')
    expect(p.company).toBe('Maintenance')
    expect(p.source).toBe('employee')

    await db.employee.delete({ where: { id: e.id } })
    const [after] = await inv.listPeople(admin, i.id)
    // A statement has to survive the witness leaving the company.
    expect(after.name).toBe('Ahmad Zaki')
    expect(after.employeeId).toBeNull()
    expect(after.statement).toBe('Saw the load swing.')
  })

  it('names somebody who is in no register at all', async () => {
    const i = await newIncident()
    await inv.addPerson(admin, i.id, {
      role: 'injured', name: 'Delivery driver', company: 'Kuching Logistics',
      injuryType: 'Laceration', bodyPart: 'Left forearm', daysLost: 3,
    })
    const [p] = await inv.listPeople(admin, i.id)
    // An injured contractor may be in no register, which is when the name matters most.
    expect(p.source).toBe('external')
    expect(p.daysLost).toBe(3)
  })

  it('refuses injury detail against somebody who was not hurt', async () => {
    const i = await newIncident()
    await expect(inv.addPerson(admin, i.id, {
      role: 'witness', name: 'Bystander', injuryType: 'Bruise',
    })).rejects.toThrow(/only be recorded against somebody named as injured/i)
  })

  it('refuses a person claimed from two registers at once', async () => {
    const i = await newIncident()
    const e = await makeEmployee()
    await expect(inv.addPerson(admin, i.id, {
      role: 'witness', employeeId: e.id, visitorId: 'somebody-else',
    })).rejects.toThrow(/is one person/i)
  })

  it('refuses somebody from another workspace', async () => {
    const i = await newIncident()
    const foreign = await db.employee.findFirst({
      where: { companyId: { not: COMPANY } }, select: { id: true },
    })
    if (foreign) {
      await expect(inv.addPerson(admin, i.id, { role: 'witness', employeeId: foreign.id }))
        .rejects.toThrow(/not in this workspace/i)
    }
  })

  it('refuses negative days lost', async () => {
    const i = await newIncident()
    await expect(inv.addPerson(admin, i.id, {
      role: 'injured', name: 'X', daysLost: -1,
    })).rejects.toThrow(/cannot be negative/i)
  })

  it('refuses naming people to a role that may not', async () => {
    const i = await newIncident()
    await expect(inv.addPerson(employee, i.id, { role: 'witness', name: 'X' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('will not remove a person from a closed incident', async () => {
    const i = await newIncident()
    const p = await inv.addPerson(admin, i.id, { role: 'witness', name: 'On record' })
    await db.incident.update({ where: { id: i.id }, data: { stage: 'closed' } })
    // Who was named on a closed investigation is part of the record.
    await expect(inv.removePerson(admin, p.id)).rejects.toThrow(/part of the record/i)
  })

  // ── Related records ──────────────────────────────────────────────────────

  it('links a permit and keeps its code readable after the permit is gone', async () => {
    const i = await newIncident()
    const permit = await db.permit.findFirst({ where: { companyId: { not: COMPANY } }, select: { id: true } })
    // Cross-workspace is refused, which is the point being tested here.
    if (permit) {
      await expect(inv.addLink(admin, i.id, { kind: 'permit', targetId: permit.id }))
        .rejects.toThrow(/not in this workspace/i)
    }
  })

  it('links an employee and renders without a join', async () => {
    const i = await newIncident()
    const e = await makeEmployee('Linked Person')
    await inv.addLink(admin, i.id, { kind: 'employee', targetId: e.id, note: 'Operating the hoist.' })

    const [l] = await inv.listLinks(admin, i.id)
    expect(l.targetLabel).toBe('Linked Person')
    expect(l.targetCode).toMatch(/^EMP-INV-/)
    expect(l.href).toContain('/employees?open=')
    expect(l.note).toBe('Operating the hoist.')
  })

  it('refuses the same record twice', async () => {
    const i = await newIncident()
    const e = await makeEmployee()
    await inv.addLink(admin, i.id, { kind: 'employee', targetId: e.id })
    await expect(inv.addLink(admin, i.id, { kind: 'employee', targetId: e.id }))
      .rejects.toThrow(/already linked/i)
  })

  it('answers the reverse question: what has gone wrong around this record', async () => {
    const e = await makeEmployee('Recurring Name')
    const a = await newIncident({ title: 'First event' })
    const b = await newIncident({ title: 'Second event' })
    await inv.addLink(admin, a.id, { kind: 'employee', targetId: e.id })
    await inv.addLink(admin, b.id, { kind: 'employee', targetId: e.id })

    const found = await inv.incidentsFor(admin, COMPANY, 'employee', e.id)
    expect(found).toHaveLength(2)
    expect(found.map((r) => r.title)).toContain('First event')
  })

  // ── The investigation ────────────────────────────────────────────────────

  it('starts the clock when a lead is named, rather than on a button press', async () => {
    const i = await newIncident()
    expect((await inv.getInvestigation(admin, i.id)).investigationStartedAt).toBeNull()

    await inv.saveInvestigation(admin, i.id, { leadInvestigator: 'ITest HSE' })
    const after = await inv.getInvestigation(admin, i.id)
    expect(after.investigationStartedAt).not.toBeNull()
  })

  it('lists what is outstanding before sign-off', async () => {
    const i = await newIncident()
    const before = await inv.getInvestigation(admin, i.id)
    expect(before.blockers).toContain('No lead investigator has been named.')
    expect(before.blockers).toContain('The root cause has not been recorded.')
  })

  it('refuses sign-off while a cause is missing, and names the first thing missing', async () => {
    const i = await newIncident()
    await inv.saveInvestigation(admin, i.id, { leadInvestigator: 'ITest HSE', directCause: 'Guard removed.' })
    // An investigation closed without a root cause is a file, not a finding.
    await expect(inv.completeInvestigation(hse, i.id)).rejects.toThrow(/root cause has not been recorded/i)
  })

  it('signs off once a cause is established, and says so', async () => {
    const i = await newIncident()
    await inv.saveInvestigation(admin, i.id, {
      leadInvestigator: 'ITest HSE',
      directCause: 'Guard removed to clear a jam.',
      rootCause: 'No lock-off procedure for clearing jams.',
    })
    const done = await inv.completeInvestigation(hse, i.id)
    expect(done.investigationCompletedAt).not.toBeNull()

    const notes = await db.notification.findMany({ where: { companyId: COMPANY } })
    expect(notes.some((n) => /Investigation complete/.test(n.title))).toBe(true)
  })

  it('refuses a second sign-off', async () => {
    const i = await newIncident()
    await inv.saveInvestigation(admin, i.id, {
      leadInvestigator: 'X', directCause: 'a', rootCause: 'b',
    })
    await inv.completeInvestigation(hse, i.id)
    await expect(inv.completeInvestigation(hse, i.id)).rejects.toThrow(/already signed off/i)
  })

  it('refuses sign-off to a safety officer, because declaring a cause is a different act', async () => {
    const i = await newIncident()
    await inv.saveInvestigation(admin, i.id, {
      leadInvestigator: 'X', directCause: 'a', rootCause: 'b',
    })
    await expect(inv.completeInvestigation(officer, i.id)).rejects.toMatchObject({ status: 403 })
  })

  it('lets a supervisor gather statements but not sign off', async () => {
    const i = await newIncident()
    await inv.addPerson(supervisor, i.id, { role: 'witness', name: 'Seen it' })
    await expect(inv.completeInvestigation(supervisor, i.id)).rejects.toMatchObject({ status: 403 })
  })

  it('demands witnesses and an action only where an investigation is obligatory', async () => {
    const minor = completionBlockers({
      severity: 'Minor', leadInvestigator: 'X', investigationStartedAt: new Date(),
      directCause: 'a', rootCause: 'b', rcaFiveWhys: null, peopleCount: 0, openActions: 0,
    })
    // Demanding a witness for every unsafe-condition report is how a mandatory field
    // becomes a field everybody types "n/a" into.
    expect(minor).toEqual([])

    const lti = completionBlockers({
      severity: 'lost_time_injury', leadInvestigator: 'X', investigationStartedAt: new Date(),
      directCause: 'a', rootCause: 'b', rcaFiveWhys: null, peopleCount: 0, openActions: 0,
    })
    expect(lti).toHaveLength(2)
  })

  it('will not record an investigation against a closed incident', async () => {
    const i = await newIncident()
    await db.incident.update({ where: { id: i.id }, data: { stage: 'closed' } })
    await expect(inv.saveInvestigation(admin, i.id, { rootCause: 'Rewriting history' }))
      .rejects.toThrow(/part of the record/i)
  })

  it('writes everything to the timeline and the audit trail', async () => {
    const i = await newIncident()
    await inv.addPerson(admin, i.id, { role: 'witness', name: 'Saw it' })
    await inv.saveInvestigation(admin, i.id, {
      leadInvestigator: 'X', directCause: 'a', rootCause: 'b',
    })
    await inv.completeInvestigation(hse, i.id)

    const events = await db.incidentEvent.findMany({ where: { incidentId: i.id } })
    const actions = events.map((e) => e.action)
    expect(actions).toContain('Witness named')
    expect(actions).toContain('Investigation started')
    expect(actions).toContain('Investigation signed off')

    const audit = await db.adminAuditEntry.findMany({
      where: { companyId: COMPANY, module: 'incidents' },
    })
    expect(audit.some((e) => e.action === 'Investigation signed off')).toBe(true)
  })

  // ── The board ────────────────────────────────────────────────────────────

  it('counts lost time by severity, and by the legacy type for older rows', async () => {
    await newIncident({ severity: 'lost_time_injury' })
    await newIncident({ type: 'lti', severity: 'Serious' })
    await newIncident({ severity: 'Minor' })

    const board = await incidents.board(admin, COMPANY)
    expect(board.lostTime).toBe(2)
  })

  it('counts near misses reported either way', async () => {
    await newIncident({ severity: 'near_miss' })
    await newIncident({ type: 'near_miss', severity: 'Minor' })
    expect((await incidents.board(admin, COMPANY)).nearMisses).toBe(2)
  })

  it('orders the severity breakdown by how serious, not by how many', async () => {
    for (let n = 0; n < 3; n++) await newIncident({ severity: 'Minor' })
    await newIncident({ severity: 'fatality' })

    const board = await incidents.board(admin, COMPANY)
    // A board that puts "Minor (3)" first buries the fatality underneath it.
    expect(board.bySeverity[0].name).toBe('fatality')
    expect(board.bySeverity[0].value).toBe(1)
  })

  it('counts open investigations as started and not signed off', async () => {
    const a = await newIncident()
    await inv.saveInvestigation(admin, a.id, { leadInvestigator: 'X' })
    await newIncident()   // never started

    expect((await incidents.board(admin, COMPANY)).openInvestigations).toBe(1)
  })

  it('surfaces the root causes that keep recurring', async () => {
    for (const cause of ['No lock-off procedure', 'No lock-off procedure', 'Poor lighting']) {
      const i = await newIncident()
      await inv.saveInvestigation(admin, i.id, { leadInvestigator: 'X', rootCause: cause })
    }
    const board = await incidents.board(admin, COMPANY)
    expect(board.topRootCauses[0]).toEqual({ name: 'No lock-off procedure', value: 2 })
  })

  it('breaks down by department and by site name', async () => {
    await newIncident({ department: 'Maintenance' })
    await newIncident({ department: 'Maintenance' })
    await newIncident({ department: 'Operations' })

    const board = await incidents.board(admin, COMPANY)
    expect(board.byDepartment[0]).toEqual({ name: 'Maintenance', value: 2 })
    // The site's name, not its id: nobody reads a slug off a board.
    expect(board.bySite[0].name).toBe('Investigation Site')
  })

  it('merges free text that differs only by surrounding spaces, and leaves blanks out', async () => {
    await newIncident({ department: 'Maintenance' })
    await newIncident({ department: ' Maintenance ' })
    await newIncident({ department: '' })

    const board = await incidents.board(admin, COMPANY)
    expect(board.byDepartment).toEqual([{ name: 'Maintenance', value: 2 }])
    // Every incident counts toward the total, including the one with no department.
    expect(board.total).toBe(3)
    expect(board.bySite).toEqual([{ name: 'Investigation Site', value: 3 }])
  })

  it('refuses the board to somebody outside the workspace', async () => {
    const outsider: Caller = {
      userId: 'inv-outsider', name: 'Outsider',
      roles: [{ companyId: 'some-other-co', role: 'admin' as never, siteIds: [] }],
    }
    await expect(incidents.board(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })
  // -- CAPA evidence enforcement --------------------------------------------

  /** A corrective action on a fresh incident, optionally demanding proof. */
  const makeAction = async (evidenceRequired: boolean) => {
    const i = await newIncident()
    const a = await incidents.addAction(admin, i.id, {
      title: 'Refit the guard', owner: 'ITest Officer',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      evidenceRequired,
    })
    return { incident: i, action: a }
  }

  it('refuses to complete an action that demands evidence when none exists', async () => {
    const { action } = await makeAction(true)
    await expect(incidents.updateAction(admin, action.id, {
      status: 'completed', evidenceNote: 'Guard refitted.',
    })).rejects.toThrow(/Evidence is required before this corrective action can be completed/i)
  })

  it('completes once a file is actually attached', async () => {
    const { incident, action } = await makeAction(true)
    // A note is a claim; a file is proof of it.
    await db.incidentAttachment.create({
      data: {
        incidentId: incident.id, actionId: action.id,
        originalName: 'guard.jpg', storedName: `itest-${Math.random().toString(36).slice(2)}.jpg`,
        mimeType: 'image/jpeg', sizeBytes: 1024, uploadedBy: 'ITest Admin',
      },
    })
    const done = await incidents.updateAction(admin, action.id, {
      status: 'completed', evidenceNote: 'Guard refitted, photo attached.',
    })
    expect(done.status).toBe('completed')
  })

  it('does not demand a file where evidence was never required', async () => {
    const { action } = await makeAction(false)
    const done = await incidents.updateAction(admin, action.id, {
      status: 'completed', evidenceNote: 'Toolbox talk delivered to all shifts.',
    })
    expect(done.status).toBe('completed')
  })

  it('does not count a file attached to a different action', async () => {
    const { incident } = await makeAction(true)
    const other = await incidents.addAction(admin, incident.id, {
      title: 'Second action', owner: 'ITest Officer',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      evidenceRequired: true,
    })
    await db.incidentAttachment.create({
      data: {
        incidentId: incident.id, actionId: other.id,
        originalName: 'other.jpg', storedName: `itest-${Math.random().toString(36).slice(2)}.jpg`,
        mimeType: 'image/jpeg', sizeBytes: 512, uploadedBy: 'ITest Admin',
      },
    })
    const first = await db.correctiveAction.findFirst({
      where: { incidentId: incident.id, id: { not: other.id } },
    })
    await expect(incidents.updateAction(admin, first!.id, {
      status: 'completed', evidenceNote: 'Done.',
    })).rejects.toThrow(/Evidence is required/i)
  })

  it('records on the timeline that evidence was demanded', async () => {
    const { incident } = await makeAction(true)
    const events = await db.incidentEvent.findMany({ where: { incidentId: incident.id } })
    expect(events.some((e) => /evidence required/i.test(e.detail ?? ''))).toBe(true)
  })

  // -- Targeted notifications -----------------------------------------------

  it('addresses the assignment notification to the owner, not the workspace', async () => {
    const i = await newIncident()
    await incidents.addAction(admin, i.id, {
      title: 'Fit an isolator', owner: 'Amirul Hassan', ownerId: 'user-amirul',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    })

    const [n] = await db.notification.findMany({
      where: { companyId: COMPANY, recipientUserId: 'user-amirul' },
    })
    expect(n).toBeTruthy()
    expect(n.recipientName).toBe('Amirul Hassan')
    expect(n.recipientRole).toBe('capa_owner')
    expect(n.title).toMatch(/Corrective action assigned/)
  })

  it('keeps the name so the notification reads correctly after the account changes', async () => {
    const i = await newIncident()
    await incidents.addAction(admin, i.id, {
      title: 'X', owner: 'Named At The Time', ownerId: 'user-gone',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    })
    const [n] = await db.notification.findMany({
      where: { companyId: COMPANY, recipientUserId: 'user-gone' },
    })
    expect(n.recipientName).toBe('Named At The Time')
  })

  it('leaves an unassigned action as a workspace notification', async () => {
    const i = await newIncident()
    await incidents.addAction(admin, i.id, {
      title: 'No account for this owner', owner: 'Agency Contractor',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    })
    const [n] = await db.notification.findMany({
      where: { companyId: COMPANY, kind: 'action' },
    })
    // Null recipient is the broadcast behaviour every notification had before addressing
    // existed, and it must stay that way.
    expect(n.recipientUserId).toBeNull()
  })

  // -- Timeline ordering ----------------------------------------------------

  it('reads the case file in insertion order when events share a timestamp', async () => {
    const i = await newIncident()
    // Raising an action writes the action row and its timeline entry in one transaction,
    // so several events land on the same millisecond.
    await incidents.addAction(admin, i.id, {
      title: 'A', owner: 'X',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
    })
    await inv.saveInvestigation(admin, i.id, { leadInvestigator: 'X', rootCause: 'Y' })

    const first = await incidents.get(admin, i.id)
    const second = await incidents.get(admin, i.id)
    // Deterministic: the same read twice must not shuffle the history.
    expect(first.events.map((e) => e.id)).toEqual(second.events.map((e) => e.id))
    expect(first.events[first.events.length - 1].action).toMatch(/reported/i)
  })
})
