import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ContractorService, EXPIRY_WARN_DAYS, expiryStatus } from './contractorService.js'
import { Scheduler } from './scheduler.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * Contractors are where most industrial fatalities happen and where the tenant's control
 * is weakest, so the tests concentrate on the gate: who may be admitted, who may operate
 * the gate, and what must stop someone walking onto a live site.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new ContractorService(db)

const COMPANY = 'con-itest-co'
const SITE_A = 'con-itest-site-a'
const SITE_B = 'con-itest-site-b'

const admin: Caller = {
  userId: 'con-admin', name: 'ITest Admin',
  roles: [{ companyId: COMPANY, role: 'admin', siteIds: [] }],
}
const officer: Caller = {
  userId: 'con-officer', name: 'ITest Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [] }],
}
const supervisor: Caller = {
  userId: 'con-sup', name: 'ITest Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE_A] }],
}
const employee: Caller = {
  userId: 'con-emp', name: 'ITest Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'con-out', name: 'ITest Outsider',
  roles: [{ companyId: 'some-other-co', role: 'admin', siteIds: [] }],
}

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

/** A worker who clears every gate check, unless overridden. */
const compliant = { medicalExpiry: inDays(200), inductionExpiry: inDays(200) }

d('ContractorService — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Contractor ITest Co' },
    })
    for (const id of [SITE_A, SITE_B]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId: COMPANY, name: `Site ${id}`, short: id.slice(-1).toUpperCase(), city: 'Bintulu' },
      })
    }
  })

  afterAll(async () => {
    await db.notification.deleteMany({ where: { companyId: COMPANY } })
    await db.contractorWorker.deleteMany({ where: { companyId: COMPANY } })
    await db.contractorCompany.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.contractorWorker.deleteMany({ where: { companyId: COMPANY } })
    await db.contractorCompany.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
  })

  const newFirm = (over: Record<string, unknown> = {}) =>
    svc.createCompany(admin, COMPANY, { name: 'Sarawak Scaffolding Sdn Bhd', ...over })

  async function newWorker(firmId: string, over: Record<string, unknown> = {}) {
    return svc.createWorker(admin, COMPANY, {
      contractorCompanyId: firmId, siteId: SITE_A, name: 'Ahmad bin Yusof',
      ...compliant, ...over,
    } as never)
  }

  // ── Contractor firms ─────────────────────────────────────────────────────

  it('allocates sequential contractor codes and rejects a duplicate registration', async () => {
    const a = await newFirm()
    const b = await newFirm({ name: 'Miri Welding Works' })
    expect(a.code).toMatch(/^CON-\d+$/)
    expect(a.code).not.toBe(b.code)

    await svc.updateCompany(admin, a.id, { registrationNumber: '199801012345' })
    await expect(newFirm({ name: 'Clone', registrationNumber: '199801012345' }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('derives insurance status from the date', async () => {
    const cases: [string | undefined, string][] = [
      [inDays(365), 'valid'],
      [inDays(EXPIRY_WARN_DAYS - 5), 'expiring'],
      [inDays(-1), 'expired'],
      [undefined, 'missing'],
    ]
    for (const [expiry, expected] of cases) {
      const f = await newFirm({ name: `Firm ${expected}`, insuranceExpiry: expiry })
      expect(f.insuranceStatus).toBe(expected)
    }
  })

  it('refuses deletion once workers are registered, and suspends instead', async () => {
    const clean = await newFirm({ name: 'Typo Contractor' })
    await expect(svc.removeCompany(admin, clean.id)).resolves.toBeUndefined()

    const used = await newFirm({ name: 'Real Contractor' })
    await newWorker(used.id)
    await expect(svc.removeCompany(admin, used.id)).rejects.toMatchObject({ code: 'validation' })

    const suspended = await svc.updateCompany(admin, used.id, { status: 'suspended' })
    expect(suspended.status).toBe('suspended')
  })

  // ── Permissions ──────────────────────────────────────────────────────────

  it('lets only admins and HSE managers write', async () => {
    for (const caller of [officer, supervisor, employee, outsider]) {
      await expect(svc.createCompany(caller, COMPANY, { name: 'Nope' }))
        .rejects.toMatchObject({ status: 403 })
    }
  })

  it('lets everyone in the workspace read, and nobody outside it', async () => {
    await newFirm()
    for (const caller of [officer, supervisor, employee]) {
      expect((await svc.listCompanies(caller, COMPANY)).length).toBeGreaterThan(0)
    }
    await expect(svc.listCompanies(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.stats(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })

  it('restricts a site-scoped supervisor to workers at their own site', async () => {
    const firm = await newFirm()
    await newWorker(firm.id, { name: 'At A', siteId: SITE_A })
    const atB = await newWorker(firm.id, { name: 'At B', siteId: SITE_B })

    const seen = await svc.listWorkers(supervisor, { companyId: COMPANY, page: 1, pageSize: 25 })
    expect(seen.rows.map((r) => r.name)).toEqual(['At A'])
    await expect(svc.getWorker(supervisor, atB.id)).rejects.toMatchObject({ status: 403 })
  })

  // ── The gate ─────────────────────────────────────────────────────────────

  it('admits a compliant worker and records who is on site', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)
    expect(w.clearedForSite).toBe(true)
    expect(w.onSite).toBe(false)

    const checked = await svc.checkIn(admin, w.id)
    expect(checked.onSite).toBe(true)
    expect(checked.checkedInAt).toBeTruthy()
    expect((await svc.stats(admin, COMPANY)).onSite).toBe(1)

    // Already inside: a second check-in is a mistake, not a no-op.
    await expect(svc.checkIn(admin, w.id)).rejects.toMatchObject({ code: 'validation' })

    const out = await svc.checkOut(admin, w.id)
    expect(out.onSite).toBe(false)
    expect((await svc.stats(admin, COMPANY)).onSite).toBe(0)
  })

  it('refuses entry on an expired or missing medical', async () => {
    const firm = await newFirm()
    const lapsed = await newWorker(firm.id, { name: 'Lapsed Medical', medicalExpiry: inDays(-1) })
    expect(lapsed.clearedForSite).toBe(false)
    await expect(svc.checkIn(admin, lapsed.id)).rejects.toThrow(/medical/i)

    const none = await newWorker(firm.id, { name: 'No Medical', medicalExpiry: undefined })
    await expect(svc.checkIn(admin, none.id)).rejects.toThrow(/medical/i)
  })

  it('refuses entry on an expired or missing induction', async () => {
    const firm = await newFirm()
    const lapsed = await newWorker(firm.id, { name: 'Lapsed Induction', inductionExpiry: inDays(-1) })
    await expect(svc.checkIn(admin, lapsed.id)).rejects.toThrow(/induction/i)

    const none = await newWorker(firm.id, { name: 'No Induction', inductionExpiry: undefined })
    await expect(svc.checkIn(admin, none.id)).rejects.toThrow(/induction/i)
  })

  it('refuses entry when the contractor is suspended, however compliant the worker', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)
    await svc.updateCompany(admin, firm.id, { status: 'suspended' })

    const after = await svc.getWorker(admin, w.id)
    expect(after.contractorSuspended).toBe(true)
    expect(after.clearedForSite).toBe(false)
    await expect(svc.checkIn(admin, w.id)).rejects.toThrow(/suspended/i)
  })

  it('refuses entry to a deregistered worker', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)
    await svc.setWorkerActive(admin, w.id, false)
    await expect(svc.checkIn(admin, w.id)).rejects.toMatchObject({ code: 'validation' })
  })

  it('takes a deregistered worker off site so the evacuation list stays true', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)
    await svc.checkIn(admin, w.id)
    expect((await svc.stats(admin, COMPANY)).onSite).toBe(1)

    await svc.setWorkerActive(admin, w.id, false)
    expect((await svc.stats(admin, COMPANY)).onSite).toBe(0)
  })

  it('lets supervisors and officers work the gate, but not employees', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)

    // A supervisor runs the gate at shift start; a gate only an admin can open is a gate
    // nobody uses, which leaves the evacuation list wrong.
    await svc.checkIn(supervisor, w.id)
    await svc.checkOut(officer, w.id)
    await expect(svc.checkIn(employee, w.id)).rejects.toMatchObject({ status: 403 })
  })

  it('always lets someone already inside leave', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)
    await svc.checkIn(admin, w.id)
    // Their medical lapses while they are inside — they must still be able to walk out.
    await svc.updateWorker(admin, w.id, { medicalExpiry: inDays(-1) })
    await expect(svc.checkOut(admin, w.id)).resolves.toMatchObject({ onSite: false })
  })

  // ── Workers ──────────────────────────────────────────────────────────────

  it('allocates worker numbers and rejects a duplicate IC among active workers', async () => {
    const firm = await newFirm()
    const a = await newWorker(firm.id, { icPassport: '900101-13-5001' })
    expect(a.workerNo).toMatch(/^CW-\d+$/)
    await expect(newWorker(firm.id, { name: 'Clone', icPassport: '900101-13-5001' }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses a contractor or site from another workspace', async () => {
    const firm = await newFirm()
    await expect(newWorker(firm.id, { siteId: 'not-our-site' })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createWorker(admin, COMPANY, {
      contractorCompanyId: 'not-our-contractor', siteId: SITE_A, name: 'Ghost', ...compliant,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('filters workers by compliance and by who is on site', async () => {
    const firm = await newFirm()
    await newWorker(firm.id, { name: 'Fit', ...compliant })
    await newWorker(firm.id, { name: 'Lapsed', medicalExpiry: inDays(-3) })
    await newWorker(firm.id, { name: 'Induction due', inductionExpiry: inDays(5) })
    const onsite = await newWorker(firm.id, { name: 'Inside' })
    await svc.checkIn(admin, onsite.id)

    const q = (f: Record<string, unknown>) =>
      svc.listWorkers(admin, { companyId: COMPANY, page: 1, pageSize: 25, ...f } as never)

    expect((await q({ medical: 'expired' })).rows.map((r) => r.name)).toEqual(['Lapsed'])
    expect((await q({ induction: 'expiring' })).rows.map((r) => r.name)).toEqual(['Induction due'])
    expect((await q({ onSite: true })).rows.map((r) => r.name)).toEqual(['Inside'])

    const stats = await svc.stats(admin, COMPANY)
    expect(stats).toMatchObject({ activeWorkers: 4, onSite: 1, medicalExpired: 1 })
  })

  it('searches workers by name, number, IC and position', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id, {
      name: 'Bujang Anak Lasah', icPassport: '880202-13-5117', position: 'Rigger',
    })
    for (const q of ['bujang', w.workerNo.toLowerCase(), '880202', 'rigg']) {
      const found = await svc.listWorkers(admin, { companyId: COMPANY, page: 1, pageSize: 25, q })
      expect(found.rows.map((r) => r.id), `query: ${q}`).toContain(w.id)
    }
  })

  it('sorts and paginates workers', async () => {
    const firm = await newFirm()
    for (const n of ['Charlie', 'Alpha', 'Bravo']) await newWorker(firm.id, { name: n })

    const asc = await svc.listWorkers(admin, { companyId: COMPANY, page: 1, pageSize: 25, sort: 'name', dir: 'asc' })
    expect(asc.rows.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])

    const page2 = await svc.listWorkers(admin, { companyId: COMPANY, page: 2, pageSize: 2, sort: 'name', dir: 'asc' })
    expect(page2.total).toBe(3)
    expect(page2.rows.map((r) => r.name)).toEqual(['Charlie'])
  })

  // ── Competency evidence ──────────────────────────────────────────────────

  it('records and removes competency evidence with a derived status', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)

    const cert = await svc.addCertificate(admin, w.id, {
      name: 'Working at Height', issuedBy: 'NIOSH', expiryDate: inDays(-2), reference: 'WAH-991',
    })
    expect(cert.status).toBe('expired')

    const view = await svc.getWorker(admin, w.id)
    expect(view.certificates).toHaveLength(1)
    expect(view.certificateCount).toBe(1)

    // Competency history is why a worked-on record cannot simply be deleted.
    await expect(svc.removeWorker(admin, w.id)).rejects.toMatchObject({ code: 'validation' })

    await svc.removeCertificate(admin, cert.id)
    expect((await svc.getWorker(admin, w.id)).certificates).toHaveLength(0)
    await expect(svc.removeWorker(admin, w.id)).resolves.toBeUndefined()
  })

  // ── Audit trail ──────────────────────────────────────────────────────────

  it('writes an audit entry for every mutation, including gate movements', async () => {
    const firm = await newFirm()
    const w = await newWorker(firm.id)
    await svc.checkIn(admin, w.id)
    await svc.checkOut(admin, w.id)
    await svc.updateCompany(admin, firm.id, { status: 'suspended' })

    const entries = await db.adminAuditEntry.findMany({
      where: { companyId: COMPANY, module: 'contractors' },
      orderBy: { at: 'asc' },
    })
    expect(entries.map((e) => e.action)).toEqual([
      'Added contractor', 'Registered contractor worker',
      'Checked in contractor worker', 'Checked out contractor worker',
      'Suspended contractor',
    ])
  })

  it('keeps a before and after when insurance or compliance dates move', async () => {
    const firm = await newFirm({ insuranceExpiry: inDays(-5) })
    await svc.updateCompany(admin, firm.id, { insuranceExpiry: inDays(300) })

    const entry = await db.adminAuditEntry.findFirst({
      where: { companyId: COMPANY, action: 'Edited contractor' },
      orderBy: { at: 'desc' },
    })
    expect(entry?.oldValue).toBe(inDays(-5))
    expect(entry?.newValue).toBe(inDays(300))
  })

  it('exposes the pure expiry helper the register and the sweep share', () => {
    expect(expiryStatus(null)).toBe('missing')
    expect(expiryStatus(new Date(Date.now() - 86400_000))).toBe('expired')
    expect(expiryStatus(new Date(Date.now() + 400 * 86400_000))).toBe('valid')
  })

  /**
   * The reminder sweep.
   *
   * The tenant has no other visibility of these dates — nobody's HR system tracks a
   * subcontractor's induction — so if the sweep misses one, the first anyone hears is a
   * worker turned away on the morning of a shutdown.
   */
  describe('reminder sweep', () => {
    const scheduler = new Scheduler(db)

    async function sweepTitles() {
      await scheduler.sweepContractors()
      const rows = await db.notification.findMany({
        where: { companyId: COMPANY },
        select: { title: true },
      })
      return rows.map((r) => r.title)
    }

    beforeEach(async () => {
      await db.notification.deleteMany({ where: { companyId: COMPANY } })
    })

    it('warns at each band and flags a lapse, for both worker dates', async () => {
      const firm = await newFirm()
      // 30, 14 and 7 days are the bands the customer specified.
      await newWorker(firm.id, { name: 'Medical 14', medicalExpiry: inDays(14) })
      await newWorker(firm.id, { name: 'Induction 7', inductionExpiry: inDays(7) })
      await newWorker(firm.id, { name: 'Medical lapsed', medicalExpiry: inDays(-2) })
      // Between bands: no reminder, or every sweep would nag daily.
      await newWorker(firm.id, { name: 'Medical 21', medicalExpiry: inDays(21) })

      const titles = await sweepTitles()
      expect(titles).toContain('Medical expires in 14 days — Medical 14')
      expect(titles).toContain('Site induction expires in 7 days — Induction 7')
      expect(titles).toContain('Medical expired — Medical lapsed')
      expect(titles.some((t) => t.includes('Medical 21'))).toBe(false)
    })

    it('chases the contractor\'s insurance too', async () => {
      await newFirm({ name: 'Lapsing Insurer', insuranceExpiry: inDays(30) })
      await newFirm({ name: 'Uninsured Now', insuranceExpiry: inDays(-1) })

      const titles = await sweepTitles()
      expect(titles).toContain('Contractor insurance expires in 30 days — Lapsing Insurer')
      expect(titles).toContain('Contractor insurance expired — Uninsured Now')
    })

    it('does not chase a suspended contractor or a deregistered worker', async () => {
      const firm = await newFirm({ name: 'Stood Down', insuranceExpiry: inDays(-1) })
      const w = await newWorker(firm.id, { name: 'Gone Home', medicalExpiry: inDays(-1) })
      await svc.setWorkerActive(admin, w.id, false)
      await svc.updateCompany(admin, firm.id, { status: 'suspended' })

      const titles = await sweepTitles()
      // Neither is working, so neither is anyone's problem to chase this morning.
      expect(titles.some((t) => t.includes('Gone Home'))).toBe(false)
      expect(titles.some((t) => t.includes('Stood Down'))).toBe(false)
    })

    it('does not raise the same reminder twice', async () => {
      const firm = await newFirm()
      await newWorker(firm.id, { name: 'Repeat Check', medicalExpiry: inDays(-3) })

      const first = await sweepTitles()
      const again = await sweepTitles()
      expect(again.length).toBe(first.length)
    })
  })
})
