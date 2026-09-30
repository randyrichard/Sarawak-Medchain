import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ProvisioningService, companyIdFrom } from './provisioningService.js'
import { OrgAdminService } from './orgAdminService.js'
import { IncidentService } from './incidentService.js'
import { type Caller } from '../domain/caller.js'
import { setEmailProviderForTests } from './email/index.js'
import { EmailProviderError, type EmailMessage, type EmailProvider } from './email/provider.js'
import { PLANS } from './planCatalog.js'

/**
 * Tenant provisioning, against a REAL PostgreSQL database.
 *
 * This is the one operation that reaches across every customer, so the tests concentrate
 * on the ways that goes wrong: somebody who is not platform staff creating a tenant, a
 * customer administrator promoting themselves, a double submission billing a company
 * twice, and a failure leaving half a customer behind that nobody can sign into or delete.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new ProvisioningService(db)
const org = new OrgAdminService(db)
const incidents = new IncidentService(db)

const ctx = { ip: '198.51.100.4', device: 'vitest' }
const PREFIX = 'prov-itest'

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`
const coName = () => `Prov ITest ${uniq()}`

/** A real user row, so the platform flag is read from the database as the service does. */
async function account(opts: { platformAdmin?: boolean; status?: string } = {}) {
  const user = await db.user.create({
    data: {
      email: mail(), name: `Prov ${uniq()}`, passwordHash: 'x',
      status: opts.status ?? 'active', platformAdmin: opts.platformAdmin ?? false,
    },
  })
  return user
}

const callerFor = (user: { id: string; name: string }, roles: Caller['roles'] = []): Caller =>
  ({ userId: user.id, name: user.name, roles })

/** Records what it was asked to send; never sends. */
class FakeProvider implements EmailProvider {
  readonly name = 'fake'
  readonly idempotent = true
  sent: EmailMessage[] = []
  behaviour: 'ok' | 'throw' = 'ok'

  async send(message: EmailMessage) {
    this.sent.push(message)
    if (this.behaviour === 'throw') {
      throw new EmailProviderError('API key is invalid', 'auth_failed', 401)
    }
    return { messageId: `msg_${this.sent.length}`, accepted: message.to.map((t) => t.email), rejected: [] }
  }

  async verify() { return { ok: true } }
}

const tokenFromEmail = (m: EmailMessage) =>
  (m.text.match(/accept-invitation\/([A-Za-z0-9_-]+)/) ?? [])[1]

async function purge() {
  const companies = await db.company.findMany({
    where: { name: { startsWith: 'Prov ITest' } }, select: { id: true },
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

d('Tenant provisioning — integration (real Postgres)', () => {
  beforeAll(purge)
  afterAll(async () => { await purge(); await db.$disconnect() })
  beforeEach(purge)
  afterEach(() => setEmailProviderForTests(undefined))

  // ── Authorization ─────────────────────────────────────────────────────────

  it('refuses anybody who is not platform staff', async () => {
    const ordinary = await account()
    const input = {
      companyName: coName(), plan: 'standard', adminName: 'A', adminEmail: mail(), siteName: 'Site',
    }
    await expect(svc.provisionCompany(callerFor(ordinary), ctx, input))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.listCompanies(callerFor(ordinary))).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a customer administrator, however senior inside their own workspace', async () => {
    /*
     * The distinction the whole model rests on. Being an administrator of a company is
     * authority inside that company; creating companies is authority over all of them, and
     * one must never imply the other.
     */
    const staff = await account({ platformAdmin: true })
    const created = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'Customer Admin', adminEmail: mail(), siteName: 'Plant',
    })

    const customerAdmin = await db.user.findFirstOrThrow({
      where: { email: created.adminEmail }, select: { id: true, name: true },
    })
    const asCustomerAdmin = callerFor(customerAdmin, [
      { companyId: created.companyId, role: 'admin' as never, siteIds: [] },
    ])

    await expect(svc.provisionCompany(asCustomerAdmin, ctx, {
      companyName: coName(), plan: 'standard', adminName: 'X', adminEmail: mail(), siteName: 'S',
    })).rejects.toMatchObject({ status: 403 })
    await expect(svc.listCompanies(asCustomerAdmin)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a deactivated platform administrator', async () => {
    // The flag is read with the account's status, so removing somebody's access does not
    // depend on their token expiring.
    const staff = await account({ platformAdmin: true, status: 'deactivated' })
    await expect(svc.listCompanies(callerFor(staff))).rejects.toMatchObject({ status: 403 })
  })

  it('cannot be granted through the customer-facing console', async () => {
    /*
     * The organisation console writes Membership.role and User.department and nothing else.
     * If it could reach platformAdmin, every customer administrator could promote
     * themselves to see every other customer.
     */
    const staff = await account({ platformAdmin: true })
    const created = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'Customer Admin', adminEmail: mail(), siteName: 'Plant',
    })
    const target = await db.user.findFirstOrThrow({ where: { email: created.adminEmail } })

    await org.setUserAccess(
      callerFor(target, [{ companyId: created.companyId, role: 'admin' as never, siteIds: [] }]),
      created.companyId, ctx, target.id, { role: 'admin' },
    )

    const after = await db.user.findUniqueOrThrow({
      where: { id: target.id }, select: { platformAdmin: true },
    })
    expect(after.platformAdmin).toBe(false)
  })

  // ── What provisioning creates ─────────────────────────────────────────────

  it('creates a company, one site, one administrator and one invitation', async () => {
    const staff = await account({ platformAdmin: true })
    const fake = new FakeProvider()
    setEmailProviderForTests(fake)
    const name = coName()

    const result = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: name, plan: 'premium', industry: 'Manufacturing',
      adminName: 'Their Administrator', adminEmail: mail(),
      siteName: 'Main Plant', siteCity: 'Kuching',
    })

    const company = await db.company.findUniqueOrThrow({ where: { id: result.companyId } })
    expect(company.name).toBe(name)
    expect(company.plan).toBe('premium')
    expect(company.status).toBe('active')
    expect(company.subscriptionStatus).toBe('trial')
    expect(company.provisionedBy).toBe(staff.name)

    expect(await db.site.count({ where: { companyId: company.id } })).toBe(1)
    expect(await db.membership.count({ where: { companyId: company.id } })).toBe(1)
    expect(await db.invitation.count({ where: { companyId: company.id } })).toBe(1)

    const membership = await db.membership.findFirstOrThrow({ where: { companyId: company.id } })
    expect(membership.role).toBe('admin')
  })

  it('creates no safety records at all', async () => {
    /*
     * A register that arrives pre-filled with invented incidents is worse than an empty
     * one: somebody eventually has to work out which rows were real, and in a compliance
     * system that question reaches an auditor.
     */
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    const where = { companyId: r.companyId }
    expect(await db.incident.count({ where })).toBe(0)
    expect(await db.correctiveAction.count({ where })).toBe(0)
    expect(await db.permit.count({ where })).toBe(0)
    expect(await db.asset.count({ where })).toBe(0)
    expect(await db.visitor.count({ where })).toBe(0)
  })

  it('never hands anybody a working password for the new administrator', async () => {
    // The invitation is the only way in, so not even the person who provisioned the
    // company holds a credential for their customer's workspace.
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    const user = await db.user.findFirstOrThrow({ where: { email: r.adminEmail } })
    expect(user.status).toBe('invited')
    expect(user.mustChangePassword).toBe(true)
    expect(JSON.stringify(r)).not.toContain(user.passwordHash)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('refuses missing or malformed input', async () => {
    const staff = await account({ platformAdmin: true })
    const base = {
      companyName: coName(), plan: 'standard', adminName: 'A', adminEmail: mail(), siteName: 'S',
    }
    const bad: [string, Record<string, string>][] = [
      ['no company name', { companyName: '  ' }],
      ['no site name', { siteName: '' }],
      ['no admin name', { adminName: '' }],
      ['malformed email', { adminEmail: 'not-an-address' }],
      ['unknown plan', { plan: 'platinum' }],
      ['legacy plan is not sellable', { plan: 'enterprise' }],
    ]
    for (const [label, over] of bad) {
      await expect(
        svc.provisionCompany(callerFor(staff), ctx, { ...base, ...over }),
        label,
      ).rejects.toMatchObject({ status: 400 })
    }
    expect(await db.company.count({ where: { name: { startsWith: 'Prov ITest' } } })).toBe(0)
  })

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('refuses a second company with the same name rather than billing twice', async () => {
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const name = coName()
    const input = {
      companyName: name, plan: 'standard', adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    }

    await svc.provisionCompany(callerFor(staff), ctx, input)
    await expect(svc.provisionCompany(callerFor(staff), ctx, {
      ...input, adminEmail: mail(),
    })).rejects.toMatchObject({ status: 409 })

    expect(await db.company.count({ where: { name } })).toBe(1)
  })

  it('survives two submissions racing each other', async () => {
    /*
     * The double-click. The pre-flight check can pass in both requests, so what actually
     * guarantees one company is the primary key - and the loser has to roll back rather
     * than leave a site or a user behind.
     */
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const name = coName()
    const input = {
      companyName: name, plan: 'standard', adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    }

    const results = await Promise.allSettled([
      svc.provisionCompany(callerFor(staff), ctx, input),
      svc.provisionCompany(callerFor(staff), ctx, input),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

    const id = companyIdFrom(name)
    expect(await db.company.count({ where: { id } })).toBe(1)
    expect(await db.site.count({ where: { companyId: id } })).toBe(1)
    expect(await db.membership.count({ where: { companyId: id } })).toBe(1)
    expect(await db.user.count({ where: { email: input.adminEmail } })).toBe(1)
  })

  it('refuses an administrator email that already belongs to somebody', async () => {
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const taken = await account()

    await expect(svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: taken.email, siteName: 'Plant',
    })).rejects.toMatchObject({ status: 409 })
  })

  it('leaves nothing behind when provisioning fails', async () => {
    // A half-created customer is the worst outcome: a tenant nobody can sign into and
    // nothing in the console admits is broken.
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const taken = await account()
    const name = coName()

    await expect(svc.provisionCompany(callerFor(staff), ctx, {
      companyName: name, plan: 'standard',
      adminName: 'A', adminEmail: taken.email, siteName: 'Plant',
    })).rejects.toBeTruthy()

    const id = companyIdFrom(name)
    expect(await db.company.count({ where: { id } })).toBe(0)
    expect(await db.site.count({ where: { companyId: id } })).toBe(0)
    expect(await db.membership.count({ where: { companyId: id } })).toBe(0)
  })

  // ── The invitation the customer receives ──────────────────────────────────

  it('sends the administrator the same invitation any other invitee gets', async () => {
    const staff = await account({ platformAdmin: true })
    const fake = new FakeProvider()
    setEmailProviderForTests(fake)
    const name = coName()

    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: name, plan: 'standard',
      adminName: 'Their Administrator', adminEmail: mail(), siteName: 'Main Plant',
    })

    expect(r.deliveryStatus).toBe('sent')
    // Nothing left for the operator to copy once a provider has it.
    expect(r.invitationUrl).toBeUndefined()
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].to[0].email).toBe(r.adminEmail)
    expect(fake.sent[0].subject).toContain(name)
  })

  it('keeps the invitation usable when the email cannot be sent', async () => {
    const staff = await account({ platformAdmin: true })
    const fake = new FakeProvider()
    fake.behaviour = 'throw'
    setEmailProviderForTests(fake)

    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    // The customer exists and is correct; only the message failed, so the operator is
    // given the link rather than losing the tenant.
    expect(r.deliveryStatus).toBe('failed')
    expect(r.invitationUrl).toContain('/accept-invitation/')
    expect(await db.company.count({ where: { id: r.companyId } })).toBe(1)
  })

  it('lets the invited administrator accept and then work only in their own company', async () => {
    const staff = await account({ platformAdmin: true })
    const fake = new FakeProvider()
    setEmailProviderForTests(fake)

    const mine = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'Mine Admin', adminEmail: mail(), siteName: 'My Plant',
    })
    const theirs = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'premium',
      adminName: 'Their Admin', adminEmail: mail(), siteName: 'Their Plant',
    })

    const token = tokenFromEmail(fake.sent[0])!
    await svc['org'].acceptInvitation(token, { password: 'Provision-Passw0rd!23' })

    const admin = await db.user.findFirstOrThrow({
      where: { email: mine.adminEmail },
      include: { memberships: true },
    })
    expect(admin.status).toBe('active')
    expect(admin.memberships).toHaveLength(1)
    expect(admin.memberships[0].companyId).toBe(mine.companyId)

    // And cannot reach the other customer provisioned moments earlier.
    const asAdmin = callerFor(admin, [
      { companyId: mine.companyId, role: 'admin' as never, siteIds: [] },
    ])
    await expect(incidents.list(asAdmin, { companyId: theirs.companyId, page: 1, pageSize: 5 }))
      .rejects.toMatchObject({ status: 403 })
    await expect(org.listSites(asAdmin, theirs.companyId)).rejects.toMatchObject({ status: 403 })
  })

  // ── Audit ─────────────────────────────────────────────────────────────────

  it('records the provisioning in the new customer\'s own trail, without the token', async () => {
    const staff = await account({ platformAdmin: true })
    const fake = new FakeProvider()
    setEmailProviderForTests(fake)

    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    const entries = await db.adminAuditEntry.findMany({ where: { companyId: r.companyId } })
    const actions = entries.map((e) => e.action)
    expect(actions).toContain('Company provisioned')
    expect(actions).toContain('Initial administrator created')
    expect(actions).toContain('Invitation email sent')
    for (const e of entries) {
      expect(e.actor).toBe(staff.name)
      expect(e.companyId).toBe(r.companyId)
      expect(e.ip).toBe('198.51.100.4')
    }
    // The trail is exported with the customer; a working secret in it is a second copy of
    // the credential store.
    expect(JSON.stringify(entries)).not.toContain(tokenFromEmail(fake.sent[0])!)
  })

  it('reports a failure by its real cause rather than a foreign-key error', async () => {
    /*
     * A failed provisioning is deliberately not written to the audit trail.
     *
     * AdminAuditEntry is tenant-scoped by a foreign key to Company, and a provisioning that
     * failed has no company - the transaction rolled back. An audit write there violates
     * the constraint and throws a foreign-key error *instead of* the real cause, so the
     * operator is shown a database complaint about audit rows while the actual problem, a
     * duplicate email say, disappears. The failure goes to the server log instead.
     */
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const taken = await account()
    const name = coName()

    await expect(svc.provisionCompany(callerFor(staff), ctx, {
      companyName: name, plan: 'standard',
      adminName: 'A', adminEmail: taken.email, siteName: 'Plant',
    })).rejects.toMatchObject({ status: 409, code: 'conflict' })

    // And nothing was written anywhere, including the trail of a company that never existed.
    expect(await db.adminAuditEntry.count({ where: { companyId: companyIdFrom(name) } })).toBe(0)
    expect(await db.company.count({ where: { id: companyIdFrom(name) } })).toBe(0)
  })

  it('surfaces the real cause when the transaction itself fails', async () => {
    // The same guarantee on the path that reaches the database: a mid-transaction clash
    // must come back as a conflict, not as whatever the audit write would have raised.
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const name = coName()
    const email = mail()

    const first = svc.provisionCompany(callerFor(staff), ctx, {
      companyName: name, plan: 'standard', adminName: 'A', adminEmail: email, siteName: 'Plant',
    })
    const second = svc.provisionCompany(callerFor(staff), ctx, {
      companyName: name, plan: 'standard', adminName: 'A', adminEmail: email, siteName: 'Plant',
    })
    const results = await Promise.allSettled([first, second])
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult

    expect(rejected).toBeTruthy()
    expect(String(rejected.reason?.message)).not.toMatch(/[Ff]oreign key/)
  })

  // ── Commercial state ──────────────────────────────────────────────────────

  it('prices from the catalogue rather than from anything stored on the row', async () => {
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'premium',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    expect(r.monthlyPrice).toBe('RM 15,000')
    expect(PLANS.standard.monthlyPriceMyr).toBe(10_000)
    expect(PLANS.premium.monthlyPriceMyr).toBe(15_000)

    // Nothing about price is written to the company row, so repricing is one edit.
    const company = await db.company.findUniqueOrThrow({ where: { id: r.companyId } })
    expect(JSON.stringify(company)).not.toContain('15000')
  })

  it('changes plan and subscription state, and audits the change', async () => {
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    await svc.setCompanyStatus(callerFor(staff), ctx, r.companyId, {
      plan: 'premium', subscriptionStatus: 'active', billingReference: 'CUST-0001',
    })

    const after = await db.company.findUniqueOrThrow({ where: { id: r.companyId } })
    expect(after.plan).toBe('premium')
    expect(after.subscriptionStatus).toBe('active')
    expect(after.billingReference).toBe('CUST-0001')

    const entries = await db.adminAuditEntry.findMany({ where: { companyId: r.companyId } })
    expect(entries.map((e) => e.action)).toContain('Changed plan')
  })

  it('refuses unknown commercial states', async () => {
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'standard',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    for (const patch of [{ status: 'deleted' }, { subscriptionStatus: 'freeloading' }, { plan: 'gold' }]) {
      await expect(svc.setCompanyStatus(callerFor(staff), ctx, r.companyId, patch))
        .rejects.toMatchObject({ status: 400 })
    }
  })

  it('lists customers with their plan and counts', async () => {
    const staff = await account({ platformAdmin: true })
    setEmailProviderForTests(new FakeProvider())
    const r = await svc.provisionCompany(callerFor(staff), ctx, {
      companyName: coName(), plan: 'premium',
      adminName: 'A', adminEmail: mail(), siteName: 'Plant',
    })

    const rows = await svc.listCompanies(callerFor(staff))
    const mine = rows.find((c) => c.id === r.companyId)!
    expect(mine.planLabel).toBe('Premium')
    expect(mine.monthlyPrice).toBe('RM 15,000')
    expect(mine.users).toBe(1)
    expect(mine.sites).toBe(1)
  })

  // ── Company id derivation ─────────────────────────────────────────────────

  it('derives a readable id and never an empty one', () => {
    expect(companyIdFrom('Borneo Industrial Group')).toBe('borneo-industrial-group')
    expect(companyIdFrom('  Acme  Sdn. Bhd.  ')).toBe('acme-sdn-bhd')
    // A name of pure punctuation still has to produce something usable as a primary key.
    expect(companyIdFrom('***')).toMatch(/^company-[0-9a-f]{8}$/)
    expect(companyIdFrom('x'.repeat(200)).length).toBeLessThanOrEqual(40)
  })

  it('folds accents instead of turning them into separators', () => {
    // NFKD splits an accented letter into the letter plus a combining mark. Left in, the
    // mark is non-alphanumeric and becomes a hyphen, so this used to yield 'cafe-nai-ve'.
    // The id is permanent and appears in URLs, so a name is only slugged once.
    // Composed form: one code point per accented letter.
    expect(companyIdFrom('Café Naîve')).toBe('cafe-naive')
    // Decomposed form - the same name as a keyboard or a paste from a PDF may deliver
    // it. It has to reach the same id, or two visually identical company names become
    // two separate tenants and the collision check that makes provisioning idempotent
    // quietly stops catching them.
    expect(companyIdFrom('Café Naîve')).toBe('cafe-naive')
  })

  it('never ends an id on a separator when the name is cut for length', () => {
    // The 40-character cut can land immediately after a hyphen, which trimming before the
    // cut cannot catch.
    const id = companyIdFrom('A Berhad Holdings Sarawak Group Company X')
    expect(id.endsWith('-')).toBe(false)
    expect(id).toBe('a-berhad-holdings-sarawak-group-company')
  })
})
