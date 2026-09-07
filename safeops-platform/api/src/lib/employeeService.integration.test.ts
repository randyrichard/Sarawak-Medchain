import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { EmployeeError, EmployeeService, MEDICAL_WARN_DAYS } from './employeeService.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The workforce register holds personal and medical data and is the thing every other
 * module points at, so most of what is tested here is what must NOT happen: a supervisor
 * reading another site's people, a safety officer reading medical notes, a leaver being
 * deleted along with the certificate that proves they were trained.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new EmployeeService(db)

const COMPANY = 'emp-itest-co'
const SITE_A = 'emp-itest-site-a'
const SITE_B = 'emp-itest-site-b'

const admin: Caller = {
  userId: 'emp-admin', name: 'ITest Admin',
  roles: [{ companyId: COMPANY, role: 'admin', siteIds: [] }],
}
const officer: Caller = {
  userId: 'emp-officer', name: 'ITest Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [] }],
}
/** Scoped to site A only — the row-level restriction under test. */
const supervisor: Caller = {
  userId: 'emp-sup', name: 'ITest Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE_A] }],
}
const outsider: Caller = {
  userId: 'emp-out', name: 'ITest Outsider',
  roles: [{ companyId: 'some-other-co', role: 'admin', siteIds: [] }],
}

const inDays = (n: number) =>
  new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

d('EmployeeService — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Employee ITest Co' },
    })
    for (const id of [SITE_A, SITE_B]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId: COMPANY, name: `Site ${id}`, short: id.slice(-1).toUpperCase(), city: 'Kuching' },
      })
    }
  })

  afterAll(async () => {
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
  })

  const newEmployee = (over: Partial<Parameters<typeof svc.create>[2]> = {}) => ({
    name: 'Test Person', siteId: SITE_A, position: 'Fitter', department: 'Maintenance', ...over,
  })

  // ── Identity ─────────────────────────────────────────────────────────────

  it('allocates sequential employee numbers per company', async () => {
    const a = await svc.create(admin, COMPANY, newEmployee({ name: 'First' }))
    const b = await svc.create(admin, COMPANY, newEmployee({ name: 'Second' }))
    expect(a.employeeNo).toMatch(/^EMP-\d+$/)
    expect(b.employeeNo).toMatch(/^EMP-\d+$/)
    expect(a.employeeNo).not.toBe(b.employeeNo)
  })

  it('allocates unique numbers under concurrent creation', async () => {
    const made = await Promise.all(
      Array.from({ length: 8 }, (_, i) => svc.create(admin, COMPANY, newEmployee({ name: `Race ${i}` }))),
    )
    expect(new Set(made.map((m) => m.employeeNo)).size).toBe(8)
  })

  it('lists the distinct job titles in use, for the position picker', async () => {
    /*
     * The curated register in OrgConfigItem is administrator-only, and on most workspaces
     * it holds nothing at all - the deployment this was written for had an empty register
     * and three employees carrying "Process Operator", "Op" and "Op". So this is the half
     * that makes the picker useful on day one, and the half an HSE manager can read.
     */
    await svc.create(admin, COMPANY, newEmployee({ name: 'A', position: 'Process Operator' }))
    await svc.create(admin, COMPANY, newEmployee({ name: 'B', position: 'Op' }))
    await svc.create(admin, COMPANY, newEmployee({ name: 'C', position: 'Op' }))
    // Blank rather than absent: a register with people whose title was never filled in
    // must not offer an empty option.
    await svc.create(admin, COMPANY, newEmployee({ name: 'D', position: '' }))

    const titles = await svc.positions(admin, COMPANY)
    expect(titles).toEqual(['Op', 'Process Operator'])
  })

  it("keeps one workspace's job titles out of another's", async () => {
    await svc.create(admin, COMPANY, newEmployee({ name: 'Ours', position: 'Rigger' }))
    await expect(svc.positions(outsider, COMPANY)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('refuses a site belonging to another workspace', async () => {
    await expect(svc.create(admin, COMPANY, newEmployee({ siteId: 'not-our-site' })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses a duplicate email among active people', async () => {
    await svc.create(admin, COMPANY, newEmployee({ email: 'clash@itest.local' }))
    await expect(svc.create(admin, COMPANY, newEmployee({ name: 'Other', email: 'clash@itest.local' })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Permissions ──────────────────────────────────────────────────────────

  it('lets only admins and HSE managers write', async () => {
    await expect(svc.create(officer, COMPANY, newEmployee())).rejects.toMatchObject({ status: 403 })
    await expect(svc.create(supervisor, COMPANY, newEmployee())).rejects.toMatchObject({ status: 403 })
    await expect(svc.create(outsider, COMPANY, newEmployee())).rejects.toMatchObject({ status: 403 })
  })

  it('keeps another workspace out entirely', async () => {
    await expect(svc.list(outsider, { companyId: COMPANY, page: 1, pageSize: 25 }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('restricts a site-scoped supervisor to their own site', async () => {
    await svc.create(admin, COMPANY, newEmployee({ name: 'At A', siteId: SITE_A }))
    const atB = await svc.create(admin, COMPANY, newEmployee({ name: 'At B', siteId: SITE_B }))

    const seen = await svc.list(supervisor, { companyId: COMPANY, page: 1, pageSize: 25 })
    expect(seen.rows.map((r) => r.name)).toEqual(['At A'])

    // ...and cannot open the other site's record by guessing its id.
    await expect(svc.get(supervisor, atB.id)).rejects.toMatchObject({ status: 403 })
  })

  it('hides medical detail from roles that may not see it', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee({
      medicalExpiry: inDays(200), bloodGroup: 'O+', medicalNotes: 'No working at height.',
    }))

    const asSupervisor = await svc.get(supervisor, made.id)
    expect(asSupervisor.medicalNotes).toBeNull()
    expect(asSupervisor.bloodGroup).toBeNull()
    // The status itself is not confidential: a supervisor must know whether they can send
    // this person into a vessel.
    expect(asSupervisor.medicalStatus).toBe('valid')

    const asOfficer = await svc.get(officer, made.id)
    expect(asOfficer.medicalNotes).toBe('No working at height.')
  })

  // ── Medical fitness ──────────────────────────────────────────────────────

  it('derives medical status from the date', async () => {
    const cases: [string | undefined, string][] = [
      [inDays(365), 'valid'],
      [inDays(MEDICAL_WARN_DAYS - 5), 'expiring'],
      [inDays(-1), 'expired'],
      [undefined, 'missing'],
    ]
    for (const [expiry, expected] of cases) {
      const e = await svc.create(admin, COMPANY, newEmployee({ name: `Medical ${expected}`, medicalExpiry: expiry }))
      expect(e.medicalStatus).toBe(expected)
    }
  })

  it('filters and counts by medical status', async () => {
    await svc.create(admin, COMPANY, newEmployee({ name: 'Fit', medicalExpiry: inDays(300) }))
    await svc.create(admin, COMPANY, newEmployee({ name: 'Soon', medicalExpiry: inDays(10) }))
    await svc.create(admin, COMPANY, newEmployee({ name: 'Lapsed', medicalExpiry: inDays(-10) }))
    await svc.create(admin, COMPANY, newEmployee({ name: 'Unknown' }))

    const expired = await svc.list(admin, { companyId: COMPANY, page: 1, pageSize: 25, medical: 'expired' })
    expect(expired.rows.map((r) => r.name)).toEqual(['Lapsed'])

    const expiring = await svc.list(admin, { companyId: COMPANY, page: 1, pageSize: 25, medical: 'expiring' })
    expect(expiring.rows.map((r) => r.name)).toEqual(['Soon'])

    const stats = await svc.stats(admin, COMPANY)
    expect(stats).toMatchObject({ headcount: 4, medicalExpired: 1, medicalExpiring: 1, medicalMissing: 1 })
  })

  it('records the before and after when a medical date is changed', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee({ medicalExpiry: inDays(-5) }))
    await svc.update(admin, made.id, { medicalExpiry: inDays(300) })

    const entry = await db.adminAuditEntry.findFirst({
      where: { companyId: COMPANY, action: 'Edited employee' },
      orderBy: { at: 'desc' },
    })
    // Backdating an expiry is how an expiry problem is made to vanish, so the trail keeps
    // both values rather than just noting that an edit happened.
    expect(entry?.oldValue).toBe(inDays(-5))
    expect(entry?.newValue).toBe(inDays(300))
  })

  // ── Search, sort, paginate ───────────────────────────────────────────────

  it('searches by name, number, email and position', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee({
      name: 'Siti Aminah', email: 'siti@itest.local', position: 'Scaffolder',
    }))
    for (const q of ['siti', 'SITI AMINAH', made.employeeNo.toLowerCase(), 'scaffold', 'itest.local']) {
      const found = await svc.list(admin, { companyId: COMPANY, page: 1, pageSize: 25, q })
      expect(found.rows.map((r) => r.id), `query: ${q}`).toContain(made.id)
    }
  })

  it('sorts and paginates', async () => {
    for (const n of ['Charlie', 'Alpha', 'Bravo']) {
      await svc.create(admin, COMPANY, newEmployee({ name: n }))
    }
    const asc = await svc.list(admin, { companyId: COMPANY, page: 1, pageSize: 25, sort: 'name', dir: 'asc' })
    expect(asc.rows.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])

    const desc = await svc.list(admin, { companyId: COMPANY, page: 1, pageSize: 25, sort: 'name', dir: 'desc' })
    expect(desc.rows.map((r) => r.name)).toEqual(['Charlie', 'Bravo', 'Alpha'])

    const page2 = await svc.list(admin, { companyId: COMPANY, page: 2, pageSize: 2, sort: 'name', dir: 'asc' })
    expect(page2.total).toBe(3)
    expect(page2.rows.map((r) => r.name)).toEqual(['Charlie'])
  })

  // ── Leaving ──────────────────────────────────────────────────────────────

  it('deactivates and reactivates rather than deleting', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())
    expect((await svc.setActive(admin, made.id, false)).active).toBe(false)

    const activeOnly = await svc.list(admin, { companyId: COMPANY, page: 1, pageSize: 25, status: 'active' })
    expect(activeOnly.rows.map((r) => r.id)).not.toContain(made.id)

    expect((await svc.setActive(admin, made.id, true)).active).toBe(true)
  })

  it('deletes a record created in error, but refuses one with history', async () => {
    const clean = await svc.create(admin, COMPANY, newEmployee({ name: 'Typo' }))
    await expect(svc.remove(admin, clean.id)).resolves.toBeUndefined()

    const worked = await svc.create(admin, COMPANY, newEmployee({ name: 'Has history' }))
    await svc.issuePpe(admin, worked.id, { item: 'Full body harness' })
    // Deleting them would take the record that proves the harness was issued with them.
    await expect(svc.remove(admin, worked.id)).rejects.toMatchObject({ code: 'validation' })
  })

  // ── Emergency contacts ───────────────────────────────────────────────────

  it('keeps exactly one primary contact', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())

    const first = await svc.addContact(admin, made.id, { name: 'Spouse', phone: '0123' })
    expect(first.isPrimary).toBe(true) // the first one added is who you ring

    const second = await svc.addContact(admin, made.id, { name: 'Brother', phone: '0456', isPrimary: true })
    expect(second.isPrimary).toBe(true)

    const after = await svc.get(admin, made.id)
    expect(after.emergencyContacts.filter((c) => c.isPrimary)).toHaveLength(1)
    expect(after.emergencyContacts.find((c) => c.isPrimary)?.name).toBe('Brother')
  })

  it('promotes another contact when the primary is removed', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())
    const first = await svc.addContact(admin, made.id, { name: 'Spouse', phone: '0123' })
    await svc.addContact(admin, made.id, { name: 'Brother', phone: '0456' })

    await svc.removeContact(admin, first.id)

    const after = await svc.get(admin, made.id)
    // Never leave someone with contacts but nobody flagged to ring first.
    expect(after.emergencyContacts).toHaveLength(1)
    expect(after.emergencyContacts[0].isPrimary).toBe(true)
  })

  it('requires a phone number on a contact', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())
    await expect(svc.addContact(admin, made.id, { name: 'No phone', phone: '  ' }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── PPE ──────────────────────────────────────────────────────────────────

  it('tracks PPE issue, replacement due and return', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())
    await svc.issuePpe(admin, made.id, { item: 'Full body harness', size: 'L', replaceDue: inDays(-3) })
    await svc.issuePpe(admin, made.id, { item: 'Safety boots', size: '9' })

    const view = await svc.get(admin, made.id)
    expect(view.ppeIssues).toHaveLength(2)
    const harness = view.ppeIssues.find((p) => p.item === 'Full body harness')!
    expect(harness.overdue).toBe(true)
    expect(harness.issuedBy).toBe(admin.name)

    const stats = await svc.stats(admin, COMPANY)
    expect(stats.ppeOverdue).toBe(1)

    const returned = await svc.returnPpe(admin, harness.id)
    expect(returned.returnedAt).toBeTruthy()
    // A returned item is no longer outstanding, however overdue it was.
    expect((await svc.stats(admin, COMPANY)).ppeOverdue).toBe(0)
    await expect(svc.returnPpe(admin, harness.id)).rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses to issue PPE to someone who has left', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())
    await svc.setActive(admin, made.id, false)
    await expect(svc.issuePpe(admin, made.id, { item: 'Hard hat' }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Audit trail ──────────────────────────────────────────────────────────

  it('writes an audit entry for every mutation', async () => {
    const made = await svc.create(admin, COMPANY, newEmployee())
    await svc.update(admin, made.id, { position: 'Senior Fitter' })
    await svc.setActive(admin, made.id, false)
    await svc.setActive(admin, made.id, true)
    await svc.addContact(admin, made.id, { name: 'Spouse', phone: '0123' })
    await svc.issuePpe(admin, made.id, { item: 'Hard hat' })

    const entries = await db.adminAuditEntry.findMany({
      where: { companyId: COMPANY, module: 'employees' },
      orderBy: { at: 'asc' },
    })
    expect(entries.map((e) => e.action)).toEqual([
      'Added employee', 'Edited employee', 'Deactivated employee', 'Reactivated employee',
      'Added emergency contact', 'Issued PPE',
    ])
    expect(entries.every((e) => e.actor === admin.name)).toBe(true)
  })

  it('reports a missing employee as not found rather than forbidden', async () => {
    await expect(svc.get(admin, 'no-such-employee')).rejects.toMatchObject({ status: 404 })
    expect(EmployeeError).toBeTruthy()
  })
})
