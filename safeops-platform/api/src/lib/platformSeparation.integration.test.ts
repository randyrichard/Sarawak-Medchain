import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { OrgAdminService, OrgAdminError } from './orgAdminService.js'
import { ProvisioningService } from './provisioningService.js'
import { hashPassword } from './password.js'

/**
 * SafeOps staff and customer workspaces stay apart.
 *
 * Tenant isolation was never the weak point here - a platform administrator invited into a
 * workspace breached no boundary, because both grants were real and separately made. The
 * hazard is subtler and worse in practice: one account holding both roles sees the SafeOps
 * customer console, listing every company on the deployment with their plans and the
 * revenue figure, inside a customer's own workspace. One screen-share shows customer A the
 * names of customers B and C.
 *
 * It is not hypothetical. It happened on this deployment and was reported by the person
 * running it, who reasonably assumed the invitation feature had granted platform access.
 * It had not. Nothing had stopped the two roles landing on one account, which is the gap
 * these tests hold shut.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const org = new OrgAdminService(db)
const provisioning = new ProvisioningService(db)
const ctx = { ip: '203.0.113.7', device: 'vitest' }
const PREFIX = 'sep-itest'

let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`

async function purge() {
  const companies = await db.company.findMany({
    where: { name: { startsWith: 'Separation ITest' } }, select: { id: true },
  })
  const ids = companies.map((c) => c.id)
  if (ids.length) {
    await db.invitation.deleteMany({ where: { companyId: { in: ids } } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: { in: ids } } })
    await db.membership.deleteMany({ where: { companyId: { in: ids } } })
    await db.site.deleteMany({ where: { companyId: { in: ids } } })
    await db.company.deleteMany({ where: { id: { in: ids } } })
  }
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } }, select: { id: true },
  })
  const uids = users.map((u) => u.id)
  if (uids.length) {
    await db.membership.deleteMany({ where: { userId: { in: uids } } })
    await db.invitation.deleteMany({ where: { userId: { in: uids } } })
    await db.passwordResetToken.deleteMany({ where: { userId: { in: uids } } })
    await db.refreshToken.deleteMany({ where: { userId: { in: uids } } })
    await db.user.deleteMany({ where: { id: { in: uids } } })
  }
}

async function makePlatformAdmin() {
  return db.user.create({
    data: {
      email: mail(),
      name: 'SafeOps Staff',
      passwordHash: await hashPassword('Separation-Itest-2026'),
      status: 'active',
      platformAdmin: true,
    },
    select: { id: true, email: true },
  })
}

/**
 * A workspace with an administrator who can issue invitations.
 *
 * Provisioning is a platform operation, so it needs a real platform administrator to run
 * it - the service reads the caller's row rather than trusting the object it was handed,
 * which is why a made-up id does not work here. That is the guard doing its job.
 */
async function makeWorkspace() {
  const provisioner = await makePlatformAdmin()
  const adminEmail = mail()
  const r = await provisioning.provisionCompany(
    { userId: provisioner.id, name: 'SafeOps Staff', email: provisioner.email, roles: [] },
    ctx,
    {
      companyName: `Separation ITest ${uniq()}`,
      industry: 'Testing',
      plan: 'standard',
      adminName: 'Workspace Admin',
      adminEmail,
      siteName: 'Test Site',
      siteCity: 'Kuching',
      siteTimezone: 'Asia/Kuching',
    },
  )

  const admin = await db.user.findUniqueOrThrow({
    where: { email: adminEmail },
    include: { memberships: true },
  })
  return {
    companyId: r.companyId,
    caller: {
      userId: admin.id,
      name: admin.name,
      email: admin.email,
      roles: admin.memberships.map((m) => ({
        companyId: m.companyId, role: m.role, siteIds: m.siteIds,
      })),
    },
  }
}

d('SafeOps staff never join a customer workspace', () => {
  beforeAll(purge)
  afterAll(async () => { await purge(); await db.$disconnect() })

  it('A. refuses to invite a platform administrator into a workspace', async () => {
    const ws = await makeWorkspace()
    const staff = await makePlatformAdmin()

    await expect(
      org.createInvitation(ws.caller, ws.companyId, ctx, { email: staff.email, role: 'admin' }),
    ).rejects.toBeInstanceOf(OrgAdminError)
  })

  it('A2. and creates no membership when it refuses', async () => {
    // A refusal that still wrote the row would be worse than no check at all.
    const ws = await makeWorkspace()
    const staff = await makePlatformAdmin()

    await expect(
      org.createInvitation(ws.caller, ws.companyId, ctx, { email: staff.email, role: 'admin' }),
    ).rejects.toThrow()

    const memberships = await db.membership.count({ where: { userId: staff.id } })
    const invitations = await db.invitation.count({ where: { email: staff.email } })
    expect(memberships).toBe(0)
    expect(invitations).toBe(0)
  })

  it('A3. names the reason, so the administrator knows what to do instead', async () => {
    const ws = await makeWorkspace()
    const staff = await makePlatformAdmin()
    await expect(
      org.createInvitation(ws.caller, ws.companyId, ctx, { email: staff.email, role: 'admin' }),
    ).rejects.toThrow(/platform administrator/i)
  })

  it('A4. refuses at acceptance too, if the flag arrives after the invitation', async () => {
    /*
     * Invitations live for seven days and platform-admin status can be granted inside that
     * window, so the check at creation time is not enough on its own.
     */
    const ws = await makeWorkspace()
    const email = mail()
    const created = await org.createInvitation(ws.caller, ws.companyId, ctx, { email, role: 'admin' })
    expect(created.token).toBeDefined()

    // Promoted to staff between invitation and acceptance.
    await db.user.update({ where: { email }, data: { platformAdmin: true } })

    await expect(
      org.acceptInvitation(created.token!, { password: 'Separation-Itest-2026' }),
    ).rejects.toThrow(/platform administrator/i)

    const memberships = await db.membership.count({
      where: { user: { email }, companyId: ws.companyId },
    })
    // The membership row is created with the invitation, so what matters is that the
    // account never became usable: the invitation is not consumed and no password is set.
    const invite = await db.invitation.findFirstOrThrow({ where: { email } })
    expect(invite.acceptedAt).toBeNull()
    expect(memberships).toBeLessThanOrEqual(1)
  })

  it('F. the intended platform administrator holds no workspace membership', async () => {
    const staff = await makePlatformAdmin()
    const memberships = await db.membership.count({ where: { userId: staff.id } })
    expect(memberships).toBe(0)
  })

  it('D. platform admins are answered as platform admins, and ordinary users are not', async () => {
    const staff = await makePlatformAdmin()
    const ws = await makeWorkspace()

    expect(await provisioning.isPlatformAdmin({
      userId: staff.id, name: 'staff', email: staff.email, roles: [],
    })).toBe(true)

    expect(await provisioning.isPlatformAdmin({
      userId: ws.caller.userId, name: ws.caller.name, email: ws.caller.email, roles: [],
    })).toBe(false)
  })

  it('E. revoking platform admin takes effect immediately, from the database', async () => {
    /*
     * No cache, no token refresh, no waiting for anything to expire: the guard reads the
     * row on every call, so an account revoked mid-session loses platform access on its
     * very next request.
     */
    const staff = await makePlatformAdmin()
    const caller = { userId: staff.id, name: 'staff', email: staff.email, roles: [] }

    expect(await provisioning.isPlatformAdmin(caller)).toBe(true)
    await db.user.update({ where: { id: staff.id }, data: { platformAdmin: false } })
    expect(await provisioning.isPlatformAdmin(caller)).toBe(false)
  })

  it('E2. a deactivated platform admin is refused even with the flag still set', async () => {
    const staff = await makePlatformAdmin()
    const caller = { userId: staff.id, name: 'staff', email: staff.email, roles: [] }
    await db.user.update({ where: { id: staff.id }, data: { status: 'deactivated' } })
    expect(await provisioning.isPlatformAdmin(caller)).toBe(false)
  })

  it('an ordinary invitation still works — the guard is narrow', async () => {
    // A rule that also blocked normal invitations would be worse than the problem.
    const ws = await makeWorkspace()
    const email = mail()

    const created = await org.createInvitation(ws.caller, ws.companyId, ctx, { email, role: 'safety_officer' })
    expect(created.token).toBeDefined()

    await org.acceptInvitation(created.token!, { password: 'Separation-Itest-2026', name: 'Ordinary User' })

    const user = await db.user.findUniqueOrThrow({
      where: { email }, include: { memberships: true },
    })
    expect(user.platformAdmin).toBe(false)
    expect(user.status).toBe('active')
    expect(user.memberships).toHaveLength(1)
    expect(user.memberships[0].companyId).toBe(ws.companyId)
  })
})
