import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, type PermitType } from '@prisma/client'
import { PermitService, PermitError } from './permitService.js'
import { ProvisioningService } from './provisioningService.js'
import { hashPassword } from './password.js'
import { ISOLATION_REQUIRED } from './permitCatalog.js'

/**
 * Separation of duties on permit issue.
 *
 * A permit to work is an authorisation given *to* somebody *by* somebody else who has
 * independently walked the job and checked the controls. One person doing both turns the
 * document into a self-declaration, and it is the first thing an auditor looks for on a hot
 * work permit.
 *
 * Found by testing rather than reading: the same account raised a hot work permit and
 * approved it, and nothing objected. These tests hold that shut for the three types where
 * self-approval is indefensible, and - just as importantly - prove it is still allowed
 * everywhere else. A rule that blocked a supervisor issuing their own working-at-height
 * permit would be wrong for the sites this product serves, and they would work around it by
 * sharing a login, which is worse than the thing the rule protects.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const permits = new PermitService(db)
const provisioning = new ProvisioningService(db)
const ctx = { ip: '203.0.113.11', device: 'vitest' }
const PREFIX = 'permitsep-itest'

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`

let companyId = ''
let siteId = ''
/** One issuer, used as both applicant and approver — the situation under test. */
let issuer: { userId: string; name: string; roles: { companyId: string; role: 'admin'; siteIds: string[] }[] }
/** A second issuer, to prove an independent approval still works. */
let other: typeof issuer

async function purge() {
  const companies = await db.company.findMany({
    where: { name: { startsWith: 'PermitSep ITest' } }, select: { id: true },
  })
  const ids = companies.map((c) => c.id)
  if (ids.length) {
    await db.permit.deleteMany({ where: { companyId: { in: ids } } })
    await db.invitation.deleteMany({ where: { companyId: { in: ids } } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: { in: ids } } })
    await db.membership.deleteMany({ where: { companyId: { in: ids } } })
    await db.site.deleteMany({ where: { companyId: { in: ids } } })
    await db.company.deleteMany({ where: { id: { in: ids } } })
  }
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })
  const uids = users.map((u) => u.id)
  if (uids.length) {
    await db.membership.deleteMany({ where: { userId: { in: uids } } })
    await db.user.deleteMany({ where: { id: { in: uids } } })
  }
}

/** Raise a permit, confirm every required control, and record a passing gas test. */
async function readyToIssue(type: PermitType, applicantName: string) {
  const from = new Date(Date.now() + 3600_000)
  const to = new Date(Date.now() + 6 * 3600_000)
  const p = await permits.create(issuer, {
    companyId, siteId, type,
    title: `Separation probe ${uniq()}`,
    description: 'Raised by the test to exercise the issue gates.',
    location: 'Test bay', department: 'Ops',
    applicant: applicantName, workerCount: 1,
    validFrom: from.toISOString(), validTo: to.toISOString(),
  })

  await permits.submit(issuer, p.id)

  for (const c of await db.permitControl.findMany({ where: { permitId: p.id, required: true } })) {
    await permits.confirmControl(issuer, p.id, c.id, true)
  }
  // Clean atmosphere, so the gas gate is satisfied and only the separation rule is left.
  await permits.addGasTest(issuer, p.id, { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 0 })
  /*
   * Confined space and the electrical types also demand a recorded isolation, and that gate
   * runs before the separation check - so without this the test would prove the isolation
   * rule works rather than the one it is about.
   */
  if (ISOLATION_REQUIRED.includes(type)) {
    await permits.addIsolation(issuer, p.id, { description: 'Line blinded upstream', tagId: 'ISO-TEST-1' })
  }
  return p.id
}

d('a permit is issued by somebody other than the applicant', () => {
  beforeAll(async () => {
    await purge()
    const staff = await db.user.create({
      data: {
        email: mail(), name: 'SafeOps Staff',
        passwordHash: await hashPassword('Permitsep-Itest-2026'),
        status: 'active', platformAdmin: true,
      },
      select: { id: true },
    })
    const adminEmail = mail()
    const r = await provisioning.provisionCompany(
      { userId: staff.id, name: 'SafeOps Staff', roles: [] }, ctx,
      {
        companyName: `PermitSep ITest ${uniq()}`, industry: 'Testing', plan: 'standard',
        adminName: 'Aziz Rahman', adminEmail,
        siteName: 'Test Site', siteCity: 'Kuching', siteTimezone: 'Asia/Kuching',
      },
    )
    companyId = r.companyId
    siteId = (await db.site.findFirstOrThrow({ where: { companyId }, select: { id: true } })).id

    const a = await db.user.findUniqueOrThrow({ where: { email: adminEmail }, include: { memberships: true } })
    issuer = {
      userId: a.id, name: a.name,
      roles: a.memberships.map((m) => ({ companyId: m.companyId, role: 'admin' as const, siteIds: m.siteIds })),
    }
    // A second authorised issuer in the same workspace.
    const b = await db.user.create({
      data: {
        email: mail(), name: 'Siti Nurhaliza',
        passwordHash: await hashPassword('Permitsep-Itest-2026'), status: 'active',
        memberships: { create: { companyId, role: 'hse_manager', siteIds: [] } },
      },
      include: { memberships: true },
    })
    other = {
      userId: b.id, name: b.name,
      roles: b.memberships.map((m) => ({ companyId: m.companyId, role: 'admin' as const, siteIds: m.siteIds })),
    }
  })

  afterAll(async () => { await purge(); await db.$disconnect() })

  it('refuses hot work issued by the person who applied for it', async () => {
    const id = await readyToIssue('hot_work', issuer.name)
    await expect(permits.approve(issuer, id, 'Controls verified.'))
      .rejects.toThrow(/other than the person who applied/i)
  })

  it('refuses confined space the same way', async () => {
    const id = await readyToIssue('confined_space', issuer.name)
    await expect(permits.approve(issuer, id, 'Controls verified.'))
      .rejects.toThrow(/other than the person who applied/i)
  })

  it('leaves the permit submitted rather than half-issued', async () => {
    // A refusal that still stamped the permit would authorise the work anyway.
    const id = await readyToIssue('hot_work', issuer.name)
    await expect(permits.approve(issuer, id, 'Controls verified.')).rejects.toBeInstanceOf(PermitError)

    const after = await db.permit.findUniqueOrThrow({ where: { id } })
    expect(after.status).toBe('submitted')
    expect(after.approver).toBeNull()
    expect(after.approvedAt).toBeNull()
  })

  it('allows a second issuer to approve the same permit', async () => {
    // The rule must not make hot work unissuable - only unissuable by one person alone.
    const id = await readyToIssue('hot_work', issuer.name)
    const issued = await permits.approve(other, id, 'Walked the job, controls in place.')
    expect(issued.status).toBe('approved')
    expect(issued.approver).toBe(other.name)
  })

  it('still allows self-issue on a type where that is normal practice', async () => {
    /*
     * Working at height is deliberately outside the rule. A supervisor raising and issuing
     * their own is ordinary on a small site, and blocking it would push people towards
     * sharing a login.
     */
    const id = await readyToIssue('working_at_height', issuer.name)
    const issued = await permits.approve(issuer, id, 'Controls verified.')
    expect(issued.status).toBe('approved')
  })

  it('compares names case- and whitespace-insensitively', async () => {
    // The applicant is free text, so "  aziz rahman " is the same person.
    const id = await readyToIssue('hot_work', `  ${issuer.name.toLowerCase()} `)
    await expect(permits.approve(issuer, id, 'Controls verified.'))
      .rejects.toThrow(/other than the person who applied/i)
  })
})
