import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { ProvisioningService } from '../lib/provisioningService.js'
import { setEmailProviderForTests } from '../lib/email/index.js'
import type { EmailMessage, EmailProvider } from '../lib/email/provider.js'

/**
 * The journey a real paying customer actually takes, end to end, over HTTP.
 *
 * Every step here is covered somewhere by a service-level test. This exists because the
 * steps are only worth anything joined up: provisioning that works but issues an
 * invitation nobody can accept, or an acceptance that works but leaves the account able to
 * read a neighbouring tenant, would pass every existing test and still lose the customer.
 *
 * Two tenants throughout, deliberately. Isolation asserted against an empty database
 * proves nothing - there has to be another customer's data present and reachable in
 * principle for a denial to mean anything.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const provisioning = new ProvisioningService(db)
const ctx = { ip: '203.0.113.9', device: 'vitest' }
const PREFIX = 'acceptance-itest'

let server: Server
let base = ''
let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`
const coName = () => `Acceptance ITest ${uniq()}`

/** Captures the invitation so the test can walk the link a real customer would click. */
class CapturingProvider implements EmailProvider {
  readonly name = 'capturing'
  readonly idempotent = true
  sent: EmailMessage[] = []
  async send(message: EmailMessage) {
    this.sent.push(message)
    return { messageId: `msg_${this.sent.length}`, accepted: message.to.map((t) => t.email), rejected: [] }
  }
  async verify() { return { ok: true } }
}

const tokenFromEmail = (m: EmailMessage) =>
  (m.text.match(/accept-invitation\/([A-Za-z0-9_-]+)/) ?? [])[1]

async function purge() {
  const companies = await db.company.findMany({
    where: { name: { startsWith: 'Acceptance ITest' } }, select: { id: true },
  })
  const ids = companies.map((c) => c.id)
  if (ids.length) {
    await db.invitation.deleteMany({ where: { companyId: { in: ids } } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: { in: ids } } })
    await db.incident.deleteMany({ where: { companyId: { in: ids } } })
    await db.membership.deleteMany({ where: { companyId: { in: ids } } })
    await db.site.deleteMany({ where: { companyId: { in: ids } } })
    await db.company.deleteMany({ where: { id: { in: ids } } })
  }
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

const api = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init)
const asUser = (token: string) => ({ Authorization: `Bearer ${token}` })
const json = { 'Content-Type': 'application/json' }

/** Signs in over HTTP exactly as the browser does. */
async function login(email: string, password: string) {
  const res = await api('/auth/login', {
    method: 'POST', headers: json, body: JSON.stringify({ email, password }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) as Record<string, never> }
}

d('First customer acceptance — over HTTP, two tenants', () => {
  beforeAll(async () => {
    const app = createApp()
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    await purge()
  })

  afterAll(async () => {
    await purge()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.$disconnect()
  })

  beforeEach(purge)
  afterEach(() => setEmailProviderForTests(undefined))

  it('carries a customer from provisioning to their own dashboard, and no further', async () => {
    const post = new CapturingProvider()
    setEmailProviderForTests(post)

    // ── The platform administrator creates two customers ─────────────────────
    const staff = await db.user.create({
      data: {
        email: mail(), name: 'SafeOps Staff', passwordHash: 'x',
        status: 'active', platformAdmin: true,
      },
    })
    const caller = { userId: staff.id, name: staff.name, roles: [] }

    const acme = await provisioning.provisionCompany(caller, ctx, {
      companyName: coName(), plan: 'standard', industry: 'Oil and gas',
      adminName: 'Acme Administrator', adminEmail: mail(),
      siteName: 'Bintulu Terminal', siteCity: 'Bintulu',
    })
    const rival = await provisioning.provisionCompany(caller, ctx, {
      companyName: coName(), plan: 'premium', industry: 'Construction',
      adminName: 'Rival Administrator', adminEmail: mail(),
      siteName: 'Kuching Yard', siteCity: 'Kuching',
    })

    expect(acme.plan).toBe('standard')
    expect(acme.monthlyPrice).toBe('RM 10,000')
    expect(rival.monthlyPrice).toBe('RM 15,000')

    // ── Before acceptance, the account is not a way in ───────────────────────
    /*
     * The whole reason provisioning issues an invitation rather than a password: nobody at
     * SafeOps ever holds a working credential for a customer's workspace. If any password
     * worked here, the operator who created the customer would keep a live login to their
     * incident and audit records.
     */
    for (const guess of ['', 'password', 'SafeOpsPlatform2026', 'changeme']) {
      const attempt = await login(acme.adminEmail, guess)
      expect(attempt.status, `"${guess}" must not sign in`).not.toBe(200)
    }

    // ── The customer accepts the invitation they were emailed ────────────────
    const invite = post.sent.find((m) => m.to[0].email === acme.adminEmail)
    expect(invite, 'an invitation should have been sent').toBeTruthy()
    // Addressed to the person, not bcc'd behind our own address.
    expect(invite!.to).toHaveLength(1)

    const token = tokenFromEmail(invite!)
    expect(token, 'the email should carry an acceptance link').toBeTruthy()

    const preview = await api(`/invitations/${token}`)
    expect(preview.status).toBe(200)

    const CUSTOMER_PASSWORD = 'Chosen-By-Them-9!x'
    const accepted = await api(`/invitations/${token}/accept`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ password: CUSTOMER_PASSWORD }),
    })
    expect(accepted.status).toBe(200)

    // Single use: the same link must not mint a second account or reset the password.
    const replay = await api(`/invitations/${token}/accept`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ password: 'Someone-Elses-Password-1!' }),
    })
    expect(replay.status).not.toBe(200)

    // ── They sign in, and are not held at a forced password change ───────────
    /*
     * Provisioning sets mustChangePassword so that a password chosen by somebody else can
     * never be used. Accepting an invitation IS choosing their own, so the flag has to
     * clear - otherwise the customer is bounced into a change screen seconds after setting
     * the password, with nothing to change it from.
     */
    const session = await login(acme.adminEmail, CUSTOMER_PASSWORD)
    expect(session.status).toBe(200)
    const accessToken = session.body.accessToken as unknown as string
    expect(accessToken).toBeTruthy()
    expect((session.body.user as unknown as { mustChangePassword: boolean }).mustChangePassword)
      .toBe(false)

    // ── They can work inside their own tenant ────────────────────────────────
    for (const path of [
      `/dashboard/overview?companyId=${acme.companyId}`,
      `/org/sites?companyId=${acme.companyId}`,
      `/incidents?companyId=${acme.companyId}&page=1&pageSize=5`,
    ]) {
      const res = await api(path, { headers: asUser(accessToken) })
      expect(res.status, `their own ${path}`).toBe(200)
    }

    // ── And nowhere near the other customer ──────────────────────────────────
    for (const path of [
      `/dashboard/overview?companyId=${rival.companyId}`,
      `/org/sites?companyId=${rival.companyId}`,
      `/incidents?companyId=${rival.companyId}&page=1&pageSize=5`,
      `/admin/users?companyId=${rival.companyId}`,
    ]) {
      const res = await api(path, { headers: asUser(accessToken) })
      expect(res.status, `the neighbouring tenant's ${path}`).toBe(403)
    }

    // ── Nor anywhere near the platform itself ────────────────────────────────
    const platformMe = await api('/platform/me', { headers: asUser(accessToken) })
    expect(platformMe.status).toBe(200)
    expect((await platformMe.json() as { platformAdmin: boolean }).platformAdmin).toBe(false)

    for (const [method, path] of [['GET', '/platform/companies'], ['POST', '/platform/companies']] as const) {
      const res = await api(path, {
        method, headers: { ...asUser(accessToken), ...json },
        body: method === 'POST'
          ? JSON.stringify({
            companyName: coName(), plan: 'standard',
            adminName: 'X', adminEmail: mail(), siteName: 'S',
          })
          : undefined,
      })
      expect(res.status, `${method} ${path}`).toBe(403)
    }

    // A customer administrator must not be able to suspend or reprice a neighbour.
    const patch = await api(`/platform/companies/${rival.companyId}`, {
      method: 'PATCH', headers: { ...asUser(accessToken), ...json },
      body: JSON.stringify({ status: 'suspended', plan: 'standard' }),
    })
    expect(patch.status).toBe(403)
    const untouched = await db.company.findUniqueOrThrow({ where: { id: rival.companyId } })
    expect(untouched.status).toBe('active')
    expect(untouched.plan).toBe('premium')

    // ── The platform administrator can see where the customer stands ─────────
    const listed = await provisioning.listCompanies(caller)
    const mine = listed.find((c) => c.id === acme.companyId)
    expect(mine?.subscriptionStatus).toBe('trial')
    expect(mine?.provisionedBy).toBe(staff.name)
    expect(mine?.users).toBe(1)
    expect(mine?.sites).toBe(1)

    // ── And the customer started with an empty, honest register ──────────────
    expect(await db.incident.count({ where: { companyId: acme.companyId } })).toBe(0)
    expect(await db.permit.count({ where: { companyId: acme.companyId } })).toBe(0)
  })

  it('keeps a trial customer out of revenue until they are actually paying', async () => {
    /*
     * The number Randy will quote to himself. A trial counted as revenue is how a forecast
     * becomes fiction, and a suspended customer left in the total is how it stays fiction
     * after they have stopped paying.
     */
    setEmailProviderForTests(new CapturingProvider())
    const staff = await db.user.create({
      data: { email: mail(), name: 'Staff', passwordHash: 'x', status: 'active', platformAdmin: true },
    })
    const caller = { userId: staff.id, name: staff.name, roles: [] }

    const trial = await provisioning.provisionCompany(caller, ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'S',
    })
    const paying = await provisioning.provisionCompany(caller, ctx, {
      companyName: coName(), plan: 'premium',
      adminName: 'B', adminEmail: mail(), siteName: 'S',
    })
    const suspended = await provisioning.provisionCompany(caller, ctx, {
      companyName: coName(), plan: 'premium',
      adminName: 'C', adminEmail: mail(), siteName: 'S',
    })

    // Everything starts as a trial, which is the safe default: nobody is billed by accident.
    const fresh = await provisioning.listCompanies(caller)
    expect(fresh.find((c) => c.id === trial.companyId)?.subscriptionStatus).toBe('trial')

    await provisioning.setCompanyStatus(caller, ctx, paying.companyId, { subscriptionStatus: 'active' })
    await provisioning.setCompanyStatus(caller, ctx, suspended.companyId, { subscriptionStatus: 'active' })
    await provisioning.setCompanyStatus(caller, ctx, suspended.companyId, { status: 'suspended' })

    const rows = await provisioning.listCompanies(caller)
    const pick = (id: string) => rows.find((c) => c.id === id)!

    // What the console adds up. Mirrors monthlyRecurring() in the web lib exactly.
    const counted = rows.filter(
      (c) => c.subscriptionStatus === 'active' && c.status === 'active',
    )
    const ids = counted.map((c) => c.id)
    expect(ids).toContain(paying.companyId)
    expect(ids, 'a trial is not revenue').not.toContain(trial.companyId)
    expect(ids, 'a suspended customer is not revenue').not.toContain(suspended.companyId)

    expect(pick(paying.companyId).monthlyPriceMyr).toBe(15_000)
    expect(pick(trial.companyId).monthlyPriceMyr).toBe(10_000) // priced, but not counted
  })
})
