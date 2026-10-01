import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PermitService } from './permitService.js'
import { PermitPeopleService } from './permitPeople.js'
import { EmployeeService } from './employeeService.js'
import { ContractorService } from './contractorService.js'
import type { Caller } from '../domain/caller.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * This is the join between the permit module and the two workforce registers, so almost
 * everything tested here is a refusal: the whole value of naming real people on a permit
 * is that the unfit ones cannot be named.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const permits = new PermitService(db)
const people = new PermitPeopleService(db)
const employees = new EmployeeService(db)
const contractors = new ContractorService(db)

const COMPANY = 'ptwppl-itest-co'
const SITE = 'ptwppl-itest-site'

const manager: Caller = {
  userId: 'ptwppl-mgr', name: 'ITest Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const admin: Caller = {
  userId: 'ptwppl-admin', name: 'ITest Admin',
  roles: [{ companyId: COMPANY, role: 'admin', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'ptwppl-out', name: 'ITest Outsider',
  roles: [{ companyId: 'other-co', role: 'admin', siteIds: [] }],
}

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

d('Permit people — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'PTW People ITest Co' } })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: COMPANY, name: 'PTW People ITest Site', short: 'PTP', city: 'Bintulu' },
    })
  })

  afterAll(async () => {
    await db.permit.deleteMany({ where: { companyId: COMPANY } })
    await db.contractorCompany.deleteMany({ where: { companyId: COMPANY } })
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.permit.deleteMany({ where: { companyId: COMPANY } })
    await db.contractorCompany.deleteMany({ where: { companyId: COMPANY } })
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
  })

  /** A permit of the given type, in draft. */
  const newPermit = (type = 'cold_work') =>
    permits.create(manager, {
      companyId: COMPANY, siteId: SITE, type: type as never,
      title: `${type} job`, location: 'Unit 4',
      validFrom: hoursFromNow(1), validTo: hoursFromNow(5),
    } as never)

  const fitEmployee = (over: Record<string, unknown> = {}) =>
    employees.create(admin, COMPANY, {
      name: 'Fit Employee', siteId: SITE, medicalExpiry: inDays(200), ...over,
    } as never)

  async function fitContractorWorker(over: Record<string, unknown> = {}) {
    const firm = await contractors.createCompany(admin, COMPANY, { name: 'ITest Contracting' })
    const worker = await contractors.createWorker(admin, COMPANY, {
      contractorCompanyId: firm.id, siteId: SITE, name: 'Fit Worker',
      medicalExpiry: inDays(200), inductionExpiry: inDays(200), ...over,
    } as never)
    return { firm, worker }
  }

  // ── The four validation rules ────────────────────────────────────────────

  it('names a fit employee and a fit contractor worker', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    const { worker } = await fitContractorWorker()

    const a = await people.add(manager, p.id, { employeeId: e.id, role: 'supervisor' })
    const b = await people.add(manager, p.id, { contractorWorkerId: worker.id })

    expect(a.kind).toBe('employee')
    expect(a.reference).toBe(e.employeeNo)
    expect(b.kind).toBe('contractor')

    const named = await people.list(manager, p.id)
    expect(named).toHaveLength(2)
    // The worker count the older screens render is kept truthful rather than drifting.
    expect((await permits.get(manager, p.id)).workerCount).toBe(2)
  })

  it('refuses a worker whose medical has expired or was never recorded', async () => {
    const p = await newPermit()
    const lapsed = await fitEmployee({ name: 'Lapsed', medicalExpiry: inDays(-1) })
    const none = await fitEmployee({ name: 'No Medical', medicalExpiry: undefined })

    await expect(people.add(manager, p.id, { employeeId: lapsed.id })).rejects.toThrow(/medical expired/i)
    await expect(people.add(manager, p.id, { employeeId: none.id })).rejects.toThrow(/no medical/i)
  })

  it('refuses a worker from a suspended contractor', async () => {
    const p = await newPermit()
    const { firm, worker } = await fitContractorWorker()
    await contractors.updateCompany(admin, firm.id, { status: 'suspended' })

    await expect(people.add(manager, p.id, { contractorWorkerId: worker.id }))
      .rejects.toThrow(/suspended/i)
  })

  it('refuses a contractor worker whose induction has lapsed', async () => {
    const p = await newPermit()
    const { worker } = await fitContractorWorker({ name: 'No Induction', inductionExpiry: inDays(-2) })
    await expect(people.add(manager, p.id, { contractorWorkerId: worker.id }))
      .rejects.toThrow(/induction/i)
  })

  it('refuses someone without the competency the permit type demands', async () => {
    // Confined space entry without confined space training is the textbook fatality.
    const p = await newPermit('confined_space')
    const { worker } = await fitContractorWorker()

    await expect(people.add(manager, p.id, { contractorWorkerId: worker.id }))
      .rejects.toThrow(/Confined Space Entry/i)

    await contractors.addCertificate(admin, worker.id, {
      name: 'Confined Space Entry', issuedBy: 'NIOSH', expiryDate: inDays(300),
    })
    await expect(people.add(manager, p.id, { contractorWorkerId: worker.id })).resolves.toBeTruthy()
  })

  it('treats an expired competency as no competency', async () => {
    const p = await newPermit('confined_space')
    const { worker } = await fitContractorWorker()
    await contractors.addCertificate(admin, worker.id, {
      name: 'Confined Space Entry', expiryDate: inDays(-1),
    })
    await expect(people.add(manager, p.id, { contractorWorkerId: worker.id }))
      .rejects.toThrow(/Confined Space Entry/i)
  })

  it('does not demand a competency for a type that needs none', async () => {
    const p = await newPermit('cold_work')
    const { worker } = await fitContractorWorker()
    await expect(people.add(manager, p.id, { contractorWorkerId: worker.id })).resolves.toBeTruthy()
  })

  // ── Guards ───────────────────────────────────────────────────────────────

  it('refuses a closed permit any change at all', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    await db.permit.update({ where: { id: p.id }, data: { status: 'closed' } })
    await expect(people.add(manager, p.id, { employeeId: e.id })).rejects.toThrow(/closed/i)
  })

  it('refuses someone from another workspace', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    await expect(people.add(outsider, p.id, { employeeId: e.id })).rejects.toMatchObject({ status: 403 })
  })

  it('refuses naming both an employee and a contractor worker at once', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    const { worker } = await fitContractorWorker()
    await expect(people.add(manager, p.id, { employeeId: e.id, contractorWorkerId: worker.id }))
      .rejects.toThrow(/either/i)
    await expect(people.add(manager, p.id, {})).rejects.toThrow(/either/i)
  })

  it('refuses naming the same person twice', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    await people.add(manager, p.id, { employeeId: e.id })
    await expect(people.add(manager, p.id, { employeeId: e.id })).rejects.toThrow(/already named/i)
  })

  // ── Occupancy ────────────────────────────────────────────────────────────

  it('tracks who is inside the work area', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    const a = await people.add(manager, p.id, { employeeId: e.id })

    // Not live yet: signing in to a permit that has not been issued is the thing an
    // approval step exists to prevent.
    await expect(people.setInside(manager, a.id, true)).rejects.toThrow(/active/i)

    await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })
    const inside = await people.setInside(manager, a.id, true)
    expect(inside.inside).toBe(true)
    expect(inside.enteredAt).toBeTruthy()

    await expect(people.setInside(manager, a.id, true)).rejects.toThrow(/already signed in/i)

    const out = await people.setInside(manager, a.id, false)
    expect(out.inside).toBe(false)
    expect(out.exitedAt).toBeTruthy()
  })

  it('keeps a standby attendant outside the work area', async () => {
    const p = await newPermit('confined_space')
    const { worker } = await fitContractorWorker()
    await contractors.addCertificate(admin, worker.id, {
      name: 'Confined Space Entry', expiryDate: inDays(300),
    })
    const a = await people.add(manager, p.id, { contractorWorkerId: worker.id, role: 'standby' })
    await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })

    // The whole point of a standby is that they stay out and can pull you out.
    await expect(people.setInside(manager, a.id, true)).rejects.toThrow(/standby/i)
  })

  it('will not release someone who is still signed in', async () => {
    const p = await newPermit()
    const e = await fitEmployee()
    const a = await people.add(manager, p.id, { employeeId: e.id })
    await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })
    await people.setInside(manager, a.id, true)

    await expect(people.remove(manager, a.id)).rejects.toThrow(/signed in/i)
    await people.setInside(manager, a.id, false)
    await expect(people.remove(manager, a.id)).resolves.toBeUndefined()
  })

  // ── The picker ───────────────────────────────────────────────────────────

  it('returns blocked people with the reason rather than hiding them', async () => {
    const p = await newPermit('confined_space')
    await fitEmployee({ name: 'Unqualified' })
    await fitEmployee({ name: 'Lapsed Medical', medicalExpiry: inDays(-3) })

    const rows = await people.eligible(manager, p.id)
    const lapsed = rows.find((r) => r.name === 'Lapsed Medical')
    // An issuer who cannot find someone assumes the system is broken and writes the name
    // on the paper copy; one who sees the reason goes and fixes it.
    expect(lapsed?.blockedReason).toMatch(/medical expired/i)
    expect(rows.find((r) => r.name === 'Unqualified')?.blockedReason).toMatch(/Confined Space Entry/i)
  })

  // ── Extensions ───────────────────────────────────────────────────────────

  describe('extensions', () => {
    it('records a request and only moves the end time on approval', async () => {
      const p = await newPermit()
      await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })

      const ext = await permits.requestExtension(manager, p.id, hoursFromNow(8), 'Weld took longer than planned.')
      expect(ext.approvedAt).toBeNull()
      // Still the original window until somebody approves it.
      expect((await permits.get(manager, p.id)).validTo).toEqual(p.validTo)

      await permits.approveExtension(admin, ext.id)
      const after = await permits.get(manager, p.id)
      expect(new Date(after.validTo).getTime()).toBeGreaterThan(new Date(p.validTo).getTime())
    })

    it('refuses self-approval', async () => {
      const p = await newPermit()
      await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })
      const ext = await permits.requestExtension(manager, p.id, hoursFromNow(8), 'Overran.')
      await expect(permits.approveExtension(manager, ext.id)).rejects.toThrow(/other than the requester/i)
    })

    it('will not let repeated extensions outlive the type maximum', async () => {
      // A confined space permit runs 8 hours; four extensions must not make it thirty.
      const p = await permits.create(manager, {
        companyId: COMPANY, siteId: SITE, type: 'confined_space',
        title: 'Vessel entry', location: 'V-101',
        validFrom: hoursFromNow(0), validTo: hoursFromNow(4),
      } as never)
      await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })

      await expect(permits.requestExtension(manager, p.id, hoursFromNow(30), 'Still going.'))
        .rejects.toThrow(/more than 8 hours/i)
    })

    it('refuses a second request while one is pending, and a backwards extension', async () => {
      const p = await newPermit()
      await db.permit.update({ where: { id: p.id }, data: { status: 'active' } })
      await permits.requestExtension(manager, p.id, hoursFromNow(8), 'First.')

      await expect(permits.requestExtension(manager, p.id, hoursFromNow(9), 'Second.'))
        .rejects.toThrow(/already awaiting/i)
      await expect(permits.requestExtension(admin, p.id, hoursFromNow(1), 'Backwards.'))
        .rejects.toThrow(/already awaiting|later than/i)
    })
  })

  // ── Who may perform the safety steps ─────────────────────────────────────

  describe('who may perform the safety steps', () => {
    const as = (role: string, userId = `ptwppl-${role}`): Caller => ({
      userId, name: `ITest ${role}`, roles: [{ companyId: COMPANY, role: role as never, siteIds: [] }],
    })
    const reading = { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 0 }

    it('refuses an employee and the read-only executive every step, before anything changes', async () => {
      const p = await newPermit()
      const e = await fitEmployee()
      const named = await people.add(manager, p.id, { employeeId: e.id })
      const iso = (await permits.addIsolation(manager, p.id, { description: 'MCC-4 breaker', tagId: 'LOTO-17' })).isolations[0]

      for (const who of [as('employee'), as('ceo')]) {
        await expect(people.add(who, p.id, { employeeId: e.id })).rejects.toMatchObject({ status: 403 })
        await expect(people.remove(who, named.id)).rejects.toMatchObject({ status: 403 })
        await expect(permits.addGasTest(who, p.id, reading)).rejects.toMatchObject({ status: 403 })
        await expect(permits.addIsolation(who, p.id, { description: 'Valve', tagId: 'T-1' })).rejects.toMatchObject({ status: 403 })
        await expect(permits.releaseIsolation(who, p.id, iso.id)).rejects.toMatchObject({ status: 403 })
      }
      const after = await permits.get(manager, p.id)
      expect(after.isolations.find((i) => i.id === iso.id)?.removedAt).toBeNull()
      expect(await people.list(manager, p.id)).toHaveLength(1)
    })

    it('lets the supervisor running the job perform them', async () => {
      const p = await newPermit()
      const e = await fitEmployee()
      const sup = as('supervisor')
      const named = await people.add(sup, p.id, { employeeId: e.id })
      await permits.addGasTest(sup, p.id, reading)
      const iso = (await permits.addIsolation(sup, p.id, { description: 'Pump P-2', tagId: 'LOTO-3' })).isolations[0]
      await permits.releaseIsolation(sup, p.id, iso.id)
      await people.remove(sup, named.id)
      expect(await people.list(manager, p.id)).toHaveLength(0)
    })

    it('lets an employee record a gas test on a permit that names them as its gas tester, and no other', async () => {
      const user = await db.user.upsert({
        where: { email: 'ptwppl-tester@itest.local' }, update: {},
        create: { id: 'ptwppl-tester', email: 'ptwppl-tester@itest.local', name: 'Tester', passwordHash: 'x' },
      })
      try {
        const tester = as('employee', user.id)
        const e = await fitEmployee({ name: 'Gas Tester' })
        await db.employee.update({ where: { id: e.id }, data: { userId: user.id } })

        const theirs = await newPermit()
        await people.add(manager, theirs.id, { employeeId: e.id, role: 'gas_tester' })
        await expect(permits.addGasTest(tester, theirs.id, reading)).resolves.toBeTruthy()

        const other = await newPermit()
        await expect(permits.addGasTest(tester, other.id, reading)).rejects.toMatchObject({ status: 403 })
      } finally {
        await db.employee.updateMany({ where: { userId: user.id }, data: { userId: null } })
        await db.user.delete({ where: { id: user.id } })
      }
    })
  })
})
