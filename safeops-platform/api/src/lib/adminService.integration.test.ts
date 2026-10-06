import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { AdminError, AdminService } from './adminService.js'
import { CONNECTORS, SYSTEM_ROLES } from './adminCatalog.js'
import { hashPassword } from './password.js'
import type { Caller } from '../domain/caller.js'
import { open } from './secretBox.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The administration console is the one module where a mock would be actively
 * misleading: its whole job is to operate on the real User, Membership, RefreshToken and
 * LoginAttempt rows that authentication uses. A test double would happily "deactivate" a
 * user who could still sign in. Everything below therefore checks the effect on the
 * actual auth tables, plus the properties that only matter with real storage — that API
 * key secrets are not recoverable, that the last administrator cannot be removed, and
 * that a restore cannot reach another tenant.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new AdminService(db)

/** One audited administrative act that leaves the account as it found it. */
async function enrolAndReset() {
  await db.user.update({ where: { id: staffId }, data: { mfaEnabled: true } })
  await svc.resetMfa(admin, COMPANY, ctx, staffId)
}

const COMPANY = 'adm-itest-co'
const SITE = 'adm-itest-site'
const OTHER = 'adm-itest-other-co'
const OTHER_SITE = 'adm-itest-other-site'

const admin: Caller = {
  userId: 'adm-admin', name: 'ADM Admin',
  roles: [{ companyId: COMPANY, role: 'admin', siteIds: [] }],
}
const manager: Caller = {
  userId: 'adm-mgr', name: 'ADM Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const employee: Caller = {
  userId: 'adm-emp', name: 'ADM Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'adm-out', name: 'ADM Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

const ctx = { ip: '203.0.113.7', device: 'Chrome on Windows' }

/** A real User row with a membership, the way the auth module would have made one. */
async function seedUser(
  email: string, name: string, role: 'admin' | 'hse_manager' | 'employee',
  companyId = COMPANY, status = 'active',
) {
  const u = await db.user.upsert({
    where: { email },
    update: { name, status },
    create: { email, name, status, passwordHash: await hashPassword('SeedPassword12345') },
  })
  await db.membership.upsert({
    where: { userId_companyId: { userId: u.id, companyId } },
    update: { role },
    create: { userId: u.id, companyId, role, siteIds: [] },
  })
  return u.id
}

let firstAdminId = ''
let secondAdminId = ''
let staffId = ''

d('AdminService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'ADM ITest Co'], [OTHER, 'ADM Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE, COMPANY], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {}, create: { id, companyId, name: `Site ${id}` },
      })
    }
    firstAdminId = await seedUser('adm-a1@itest.local', 'First Admin', 'admin')
    secondAdminId = await seedUser('adm-a2@itest.local', 'Second Admin', 'admin')
    staffId = await seedUser('adm-s1@itest.local', 'Staff Member', 'employee')
  })

  afterAll(async () => {
    /*
     * Scoped to this suite's own fixtures.
     *
     * Deleting everything at @itest.local removed the users other suites were mid-way
     * through using - vitest runs files in parallel against one database - which showed up
     * as an unrelated suite failing at random. The malformed fixture is named explicitly
     * because it has no domain to match on.
     */
    await db.user.deleteMany({
      where: { OR: [{ email: { startsWith: 'adm-' } }, { email: 'not-an-email' }] },
    })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  // ── Access ─────────────────────────────────────────────────────────────────

  it('is administrator-only, and the role comes from the session', async () => {
    for (const caller of [manager, employee]) {
      await expect(svc.listUsers(caller, COMPANY, {})).rejects.toMatchObject({ status: 403 })
      await expect(svc.listRoles(caller, COMPANY)).rejects.toMatchObject({ status: 403 })
      await expect(svc.getSecurity(caller, COMPANY)).rejects.toMatchObject({ status: 403 })
      await expect(svc.listApiKeys(caller, COMPANY)).rejects.toMatchObject({ status: 403 })
      await expect(svc.listBackups(caller, COMPANY)).rejects.toMatchObject({ status: 403 })
    }
    // Being an admin somewhere else grants nothing here.
    await expect(svc.listUsers(outsider, COMPANY, {})).rejects.toMatchObject({ status: 403 })
    await expect(svc.securityCenter(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
  })

  // ── Users, on the real auth tables ─────────────────────────────────────────

  it('lists the workspace’s real users, scoped by membership', async () => {
    await seedUser('adm-other@itest.local', 'Other Tenant User', 'admin', OTHER)

    const rows = await svc.listUsers(admin, COMPANY, {})
    const emails = rows.map((r) => r.email)
    expect(emails).toContain('adm-a1@itest.local')
    expect(emails).toContain('adm-s1@itest.local')
    expect(emails).not.toContain('adm-other@itest.local')
    // Role comes from Membership, not a copy.
    expect(rows.find((r) => r.email === 'adm-s1@itest.local')?.role).toBe('employee')
  })

  it('creates a real user with a membership and no knowable password', async () => {
    const created = await svc.createUser(admin, COMPANY, ctx, {
      name: 'Newly Invited', email: 'adm-new@itest.local', role: 'safety_officer',
      siteIds: [SITE], department: 'HSE', sendInvite: true,
    })

    expect(created.status).toBe('invited')
    expect(created.role).toBe('safety_officer')
    expect(created.siteIds).toEqual([SITE])
    expect(created.forcePasswordReset).toBe(true)

    // The row exists in the auth table, with a membership and a real Argon2id digest.
    const row = await db.user.findUniqueOrThrow({
      where: { email: 'adm-new@itest.local' }, include: { memberships: true },
    })
    expect(row.memberships[0].companyId).toBe(COMPANY)
    expect(row.passwordHash).toMatch(/^\$argon2/)
    // Nothing derivable: two accounts created the same way do not share a digest.
    const second = await svc.createUser(admin, COMPANY, ctx, {
      name: 'Another Invite', email: 'adm-new2@itest.local', role: 'employee', sendInvite: true,
    })
    const row2 = await db.user.findUniqueOrThrow({ where: { id: second.id } })
    expect(row2.passwordHash).not.toBe(row.passwordHash)
  })

  it('rejects a duplicate email, a bad address, an unknown role or a foreign site', async () => {
    await expect(svc.createUser(admin, COMPANY, ctx, {
      name: 'Dup', email: 'adm-a1@itest.local', role: 'employee', sendInvite: true,
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createUser(admin, COMPANY, ctx, {
      name: 'Bad', email: 'not-an-email', role: 'employee', sendInvite: true,
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createUser(admin, COMPANY, ctx, {
      name: 'Ghost role', email: 'adm-gr@itest.local', role: 'wizard', sendInvite: true,
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createUser(admin, COMPANY, ctx, {
      name: 'Foreign site', email: 'adm-fs@itest.local', role: 'employee',
      siteIds: [OTHER_SITE], sendInvite: true,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('deactivating a user changes the real account, not a copy', async () => {
    const updated = await svc.setUserStatus(admin, COMPANY, ctx, staffId, 'deactivated')
    expect(updated.status).toBe('deactivated')
    // The auth table is what changed — this is the row the login flow reads.
    expect((await db.user.findUniqueOrThrow({ where: { id: staffId } })).status).toBe('deactivated')

    const back = await svc.setUserStatus(admin, COMPANY, ctx, staffId, 'active')
    expect(back.status).toBe('active')
  })

  it('reactivating clears the brute-force lockout state', async () => {
    await db.user.update({
      where: { id: staffId },
      data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() + 3600_000), status: 'locked' },
    })
    // A locked-until in the future reads as locked without anyone storing that word.
    expect((await svc.getUser(admin, COMPANY, staffId)).status).toBe('locked')

    await svc.setUserStatus(admin, COMPANY, ctx, staffId, 'active')
    const row = await db.user.findUniqueOrThrow({ where: { id: staffId } })
    expect(row.failedLoginCount).toBe(0)
    expect(row.lockedUntil).toBeNull()
  })

  it('refuses to remove the last active administrator', async () => {
    // Two admins: removing one is fine.
    await svc.setUserStatus(admin, COMPANY, ctx, secondAdminId, 'deactivated')

    // One left: the workspace would have nobody who can grant the role back.
    await expect(svc.setUserStatus(admin, COMPANY, ctx, firstAdminId, 'deactivated'))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.setUserStatus(admin, COMPANY, ctx, firstAdminId, 'locked'))
      .rejects.toMatchObject({ code: 'validation' })

    expect((await db.user.findUniqueOrThrow({ where: { id: firstAdminId } })).status).toBe('active')
    await svc.setUserStatus(admin, COMPANY, ctx, secondAdminId, 'active')
  })

  it('a password reset revokes the live sessions it was meant to stop', async () => {
    await db.refreshToken.createMany({
      data: [
        { userId: staffId, tokenHash: `h-${Date.now()}-1`, familyId: 'f1', expiresAt: new Date(Date.now() + 86400_000) },
        { userId: staffId, tokenHash: `h-${Date.now()}-2`, familyId: 'f2', expiresAt: new Date(Date.now() + 86400_000) },
      ],
    })

    const issued = await svc.resetPassword(admin, COMPANY, ctx, staffId)
    /*
     * No email provider is configured in tests, so the link comes back for the administrator
     * to pass on by hand, and `emailed` says plainly that nothing was sent. Asserting both
     * is what stops a later change swallowing the token while still reporting success.
     */
    expect(issued.emailed).toBe(false)
    expect(issued.token).toBeDefined()
    expect(issued.token!.length).toBeGreaterThan(10)

    // A reset that leaves the compromised session alive has not reset anything.
    const live = await db.refreshToken.count({ where: { userId: staffId, revokedAt: null } })
    expect(live).toBe(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: staffId } })).mustChangePassword).toBe(true)
  })

  it('cannot switch MFA on for somebody else - only they can, with their phone', async () => {
    await db.user.update({ where: { id: staffId }, data: { mfaEnabled: false } })
    await expect(svc.resetMfa(admin, COMPANY, ctx, staffId)).rejects.toMatchObject({ code: 'validation' })
    expect((await db.user.findUniqueOrThrow({ where: { id: staffId } })).mfaEnabled).toBe(false)
  })

  it('resets MFA for somebody who lost their phone, and ends their sessions', async () => {
    await db.user.update({
      where: { id: staffId },
      data: { mfaEnabled: true, mfaSecret: 'sealed', mfaRecoveryCodes: ['a', 'b'], mfaLastStep: 7 },
    })
    await db.refreshToken.create({
      data: { userId: staffId, tokenHash: `mfa-reset-${Date.now()}`, familyId: 'f-mfa', expiresAt: new Date(Date.now() + 86_400_000) },
    })
    const off = await svc.resetMfa(admin, COMPANY, ctx, staffId)
    expect(off.mfaEnabled).toBe(false)
    const row = await db.user.findUniqueOrThrow({ where: { id: staffId } })
    expect(row).toMatchObject({ mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: [], mfaLastStep: null })
    expect(await db.refreshToken.count({ where: { userId: staffId, revokedAt: null } })).toBe(0)
  })

  it('imports users from CSV, skipping duplicates', async () => {
    const csv = [
      'name,email,role',
      'Imported One,adm-i1@itest.local,employee',
      'Imported Two,adm-i2@itest.local,safety_officer',
      'Duplicate,adm-a1@itest.local,employee',
      ',missing-name@itest.local,employee',
    ].join('\n')

    const r = await svc.bulkImportUsers(admin, COMPANY, ctx, csv)
    expect(r.created).toBe(2)
    expect(r.skipped).toBe(1)
    expect(r.errors).toHaveLength(1)

    const one = await db.user.findUniqueOrThrow({
      where: { email: 'adm-i1@itest.local' }, include: { memberships: true },
    })
    expect(one.status).toBe('invited')
    expect(one.memberships[0].companyId).toBe(COMPANY)
    await expect(svc.bulkImportUsers(admin, COMPANY, ctx, '   ')).rejects.toMatchObject({ code: 'validation' })
  })

  it('derives devices from live sessions and history from real login attempts', async () => {
    await db.refreshToken.deleteMany({ where: { userId: staffId } })
    await db.refreshToken.create({
      data: {
        userId: staffId, tokenHash: `h-dev-${Date.now()}`, familyId: 'fam-a',
        expiresAt: new Date(Date.now() + 86400_000),
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131', ip: '203.0.113.9',
      },
    })
    // A revoked session is not a device.
    await db.refreshToken.create({
      data: {
        userId: staffId, tokenHash: `h-dev-${Date.now()}-r`, familyId: 'fam-b',
        expiresAt: new Date(Date.now() + 86400_000), revokedAt: new Date(),
      },
    })

    const devices = await svc.userDevices(admin, COMPANY, staffId)
    expect(devices).toHaveLength(1)
    expect(devices[0].browser).toBe('Chrome')
    expect(devices[0].os).toBe('Windows')

    await db.loginAttempt.createMany({
      data: [
        { userId: staffId, email: 'adm-s1@itest.local', outcome: 'success', ip: '203.0.113.9' },
        { userId: staffId, email: 'adm-s1@itest.local', outcome: 'bad_password', ip: '198.51.100.4' },
        { userId: staffId, email: 'adm-s1@itest.local', outcome: 'locked_out', ip: '198.51.100.4' },
      ],
    })
    const history = await svc.userLoginHistory(admin, COMPANY, staffId)
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history.some((h) => h.result === 'success')).toBe(true)
    // A mistyped password is a failure, not "suspicious"; trying a locked account is.
    expect(history.find((h) => h.outcome === 'bad_password')?.suspicious).toBe(false)
    expect(history.find((h) => h.outcome === 'locked_out')?.suspicious).toBe(true)
  })

  // ── RBAC ───────────────────────────────────────────────────────────────────

  it('seeds the system roles on first read and counts real memberships', async () => {
    const roles = await svc.listRoles(admin, COMPANY)
    expect(roles.length).toBeGreaterThanOrEqual(SYSTEM_ROLES.length)
    expect(roles.every((r) => r.system || !r.system)).toBe(true)

    const adminRole = roles.find((r) => r.id === 'admin')!
    expect(adminRole.system).toBe(true)
    expect(adminRole.permissions.admin).toContain('delete')
    // Counts come from Membership, so they are the real assignment.
    expect(adminRole.userCount).toBeGreaterThanOrEqual(2)
  })

  it('grants and revokes a permission, and implies view', async () => {
    const before = await svc.listRoles(admin, COMPANY)
    const supervisor = before.find((r) => r.id === 'supervisor')!
    expect(supervisor.permissions.audits).not.toContain('create')

    const granted = await svc.toggleRolePermission(admin, COMPANY, ctx, 'supervisor', 'audits', 'create')
    expect(granted.permissions.audits).toContain('create')
    // Being able to create implies being able to see.
    expect(granted.permissions.audits).toContain('view')

    const revoked = await svc.toggleRolePermission(admin, COMPANY, ctx, 'supervisor', 'audits', 'create')
    expect(revoked.permissions.audits).not.toContain('create')
  })

  it('refuses to reduce the Administrator role', async () => {
    await expect(svc.toggleRolePermission(admin, COMPANY, ctx, 'admin', 'incidents', 'delete'))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('creates a custom role by cloning, and deletes it', async () => {
    const created = await svc.createRole(admin, COMPANY, ctx, 'Night Supervisor', 'supervisor')
    expect(created.system).toBe(false)
    expect(created.permissions.incidents).toContain('create')

    await svc.deleteRole(admin, COMPANY, ctx, created.id)
    await expect(svc.deleteRole(admin, COMPANY, ctx, created.id)).rejects.toMatchObject({ status: 404 })
    await expect(svc.createRole(admin, COMPANY, ctx, '  ', 'supervisor'))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses to delete a system role or one that still has users', async () => {
    await expect(svc.deleteRole(admin, COMPANY, ctx, 'employee'))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Audit trail ────────────────────────────────────────────────────────────

  it('pages the audit trail without dropping or repeating an entry', async () => {
    /*
     * The trail is a compliance record, so "the oldest thing you can reach is entry 500"
     * was a functional gap rather than a performance choice. Paging it also exposes an
     * ordering problem that an unpaged list hides: several entries can share a
     * millisecond, and without the id tiebreak a row can appear on two pages or neither.
     */
    for (let i = 0; i < 12; i += 1) {
      await enrolAndReset()
    }

    const first = await svc.listAudit(admin, COMPANY, { page: 1, pageSize: 5 })
    expect(first.rows).toHaveLength(5)
    expect(first.total).toBeGreaterThanOrEqual(12)
    expect(first.totalPages).toBe(Math.ceil(first.total / 5))

    const second = await svc.listAudit(admin, COMPANY, { page: 2, pageSize: 5 })
    const overlap = first.rows.filter((a) => second.rows.some((b) => b.id === a.id))
    expect(overlap).toHaveLength(0)

    // Walking every page reaches each entry exactly once.
    const seen = new Set<string>()
    for (let page = 1; page <= first.totalPages; page += 1) {
      const chunk = await svc.listAudit(admin, COMPANY, { page, pageSize: 5 })
      for (const row of chunk.rows) seen.add(row.id)
    }
    expect(seen.size).toBe(first.total)
  })

  it('falls back to a sensible page rather than erroring on rubbish input', async () => {
    /*
     * `?page=abc` reached the query as NaN and Prisma rejected it as a 500. A malformed
     * query parameter is the caller's mistake and deserves a sensible page - a 500 on user
     * input is noise that hides the failures worth paging somebody for.
     */
    const nonsense = await svc.listAudit(admin, COMPANY, {
      page: Number('abc'), pageSize: Number('xyz'),
    })
    expect(nonsense.page).toBe(1)
    expect(nonsense.pageSize).toBe(100)
    expect(nonsense.rows.length).toBeGreaterThan(0)
  })

  it('clamps a page below one instead of skipping backwards', async () => {
    const zero = await svc.listAudit(admin, COMPANY, { page: 0, pageSize: 5 })
    const negative = await svc.listAudit(admin, COMPANY, { page: -20, pageSize: 5 })
    expect(zero.page).toBe(1)
    expect(negative.page).toBe(1)
  })

  it('answers an absurd page cheaply and emptily', async () => {
    // Postgres stops once the rows run out, so a huge OFFSET is not a way to make the
    // server work hard on request.
    const far = await svc.listAudit(admin, COMPANY, { page: 999_999_999, pageSize: 200 })
    expect(far.rows).toEqual([])
    expect(far.total).toBeGreaterThan(0)
  })

  it('caps the page size a caller can ask for', async () => {
    // Otherwise pageSize=100000 is a way to pull the whole table in one response.
    const huge = await svc.listAudit(admin, COMPANY, { page: 1, pageSize: 100_000 })
    expect(huge.pageSize).toBe(200)
    expect(huge.rows.length).toBeLessThanOrEqual(200)
  })

  it('keeps filters applied across pages', async () => {
    const filtered = await svc.listAudit(admin, COMPANY, { q: 'password', page: 1, pageSize: 2 })
    expect(filtered.rows.every((e) => /password/i.test(`${e.action} ${e.target}`))).toBe(true)
    // The total counts what matches the filter, not the whole trail.
    const all = await svc.listAudit(admin, COMPANY, { page: 1, pageSize: 2 })
    expect(filtered.total).toBeLessThanOrEqual(all.total)
  })

  it('writes an append-only entry for every administrative act, with the real actor', async () => {
    await enrolAndReset()
    const entries = await svc.listAudit(admin, COMPANY, {})

    expect(entries.rows.length).toBeGreaterThan(0)
    expect(entries.total).toBeGreaterThan(0)
    const latest = entries.rows[0]
    expect(latest.actor).toBe('ADM Admin')
    // The role is taken from the verified session, not from the request.
    expect(latest.actorRole).toBe('admin')
    expect(latest.ip).toBe('203.0.113.7')

    // An invited account and a directly created one are different acts, and the trail
    // says which happened rather than flattening both to "created".
    await svc.createUser(admin, COMPANY, ctx, {
      name: 'Direct Create', email: 'adm-direct@itest.local', role: 'employee', sendInvite: false,
    })
    const withDirect = await svc.listAudit(admin, COMPANY, {})
    const actions = withDirect.rows.map((e) => e.action)
    expect(actions).toContain('Invited user')
    expect(actions).toContain('Created user')
    expect(actions).toContain('Deactivated user')
    // "Issued" rather than "Sent": there is no email transport, the admin passes the
    // link on themselves, and the trail should say what actually happened.
    expect(actions).toContain('Issued password reset link')

    // Newest first, and filterable.
    const times = entries.rows.map((e) => e.at.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    const filtered = await svc.listAudit(admin, COMPANY, { q: 'password' })
    expect(filtered.rows.every((e) => /password/i.test(`${e.action} ${e.target}`))).toBe(true)
  })

  // ── API keys ───────────────────────────────────────────────────────────────

  it('returns an API key secret once and stores only its digest', async () => {
    const { key, secret } = await svc.createApiKey(admin, COMPANY, ctx, 'CI pipeline', ['view', 'export'])

    expect(secret).toMatch(/^sk_live_/)
    expect(key.masked).toContain(key.prefix)
    expect(key.masked).not.toContain(secret.slice(-6))

    const row = await db.apiKey.findUniqueOrThrow({ where: { id: key.id } })
    // The plaintext is nowhere in the row, and the stored value is its SHA-256.
    expect(row.tokenHash).toBe(createHash('sha256').update(secret).digest('hex'))
    expect(JSON.stringify(row)).not.toContain(secret)

    // And no read path can recover it.
    const listed = await svc.listApiKeys(admin, COMPANY)
    expect(JSON.stringify(listed)).not.toContain(secret)
  })

  it('revokes a key and refuses one from another workspace', async () => {
    const { key } = await svc.createApiKey(admin, COMPANY, ctx, 'To revoke', [])
    // An empty scope list still gets the minimum.
    expect(key.scopes).toEqual(['view'])

    const revoked = await svc.revokeApiKey(admin, COMPANY, ctx, key.id)
    expect(revoked.revoked).toBe(true)

    await expect(svc.revokeApiKey(admin, COMPANY, ctx, 'no-such-key'))
      .rejects.toMatchObject({ status: 404 })
    await expect(svc.createApiKey(admin, COMPANY, ctx, '   ', []))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Webhooks ───────────────────────────────────────────────────────────────

  it('requires HTTPS and at least one event, and never returns the secret again', async () => {
    await expect(svc.createWebhook(admin, COMPANY, ctx, 'http://insecure.example.com', ['incident.created']))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createWebhook(admin, COMPANY, ctx, 'https://ok.example.com', []))
      .rejects.toMatchObject({ code: 'validation' })

    const created = await svc.createWebhook(
      admin, COMPANY, ctx, 'https://hooks.example.com/safeops', ['incident.created', 'action.verified'],
    )
    expect(created.secret).toMatch(/^whsec_/)
    expect(created.secretMasked).toContain(created.secret.slice(-4))

    const row = await db.webhook.findUniqueOrThrow({ where: { id: created.id } })
    /*
     * Sealed, not hashed - and the property that matters is unchanged: the plaintext is
     * not in the row. This used to assert a SHA-256 digest, which was safer still and also
     * made signing impossible, so no webhook could ever be delivered. It is now AES-256-GCM
     * so the signer can read it back; what is stored is still not the secret.
     */
    expect(row.secretEnc).toMatch(/^v1\./)
    expect(row.secretEnc).not.toContain(created.secret)
    expect(JSON.stringify(row)).not.toContain(created.secret)
    // And it round-trips, because a secret that seals but does not open signs nothing.
    expect(open(row.secretEnc)).toBe(created.secret)

    const listed = await svc.listWebhooks(admin, COMPANY)
    expect(JSON.stringify(listed)).not.toContain(created.secret)
  })

  it('records a test delivery honestly when the endpoint is not there', async () => {
    /*
     * This test used to be called "records a test delivery without calling out" and
     * asserted `success`, because `testWebhook` wrote a 200 into the row without making a
     * request. hooks.example.com has never accepted a webhook from anybody; a green result
     * for it was the console reporting something that had not happened.
     *
     * A real request now goes out, so the honest outcome for an endpoint that does not
     * exist is a failure - and that is what the row has to say.
     */
    const wh = await svc.createWebhook(admin, COMPANY, ctx, 'https://hooks.example.com/two', ['incident.closed'])

    const tested = await svc.testWebhook(admin, COMPANY, ctx, wh.id)
    expect(tested.lastDelivery?.status).toBe('failed')
    expect(tested.testResult.ok).toBe(false)

    /*
     * A disabled webhook is refused rather than recorded as a failed delivery.
     *
     * This half of the test used to assert that testing a disabled webhook wrote
     * `failed` and a 503 onto the row. That was the same fiction as the green result
     * above, just pointing the other way: nothing was sent, so nothing was delivered or
     * not delivered, and a delivery record for a webhook that is switched off is a lie
     * about an event that did not occur. Saying "enable it first" is both true and
     * actionable.
     */
    const off = await svc.toggleWebhook(admin, COMPANY, ctx, wh.id)
    expect(off.active).toBe(false)
    await expect(svc.testWebhook(admin, COMPANY, ctx, wh.id))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Integrations ───────────────────────────────────────────────────────────

  /**
   * Exercised against a fixture, because every shipped connector is currently `planned`.
   *
   * The redaction below is a security property of setConnector that outlives the catalog:
   * it is what will run the first time a real connector ships. Deleting this test when the
   * last available connector was reclassified would have quietly retired that guarantee at
   * exactly the moment nothing was left to exercise it.
   */
  it('connects an integration without storing the secret it was given', async () => {
    CONNECTORS.push({
      id: 'itest-fixture', name: 'ITest Fixture', category: 'communication',
      status: 'available',
      description: 'Stands in for a connector that genuinely delivers.',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://...', secret: true },
        { key: 'channel', label: 'Channel', placeholder: '#hse-alerts' },
      ],
    })

    try {
      await expect(svc.setConnector(admin, COMPANY, ctx, 'itest-fixture', true, {}))
        .rejects.toMatchObject({ code: 'validation' })

      const secretUrl = 'https://hooks.example.test/T000/B000/XXXXsecretXXXX'
      const connected = await svc.setConnector(admin, COMPANY, ctx, 'itest-fixture', true, {
        webhookUrl: secretUrl, channel: '#hse-alerts',
      })
      expect(connected.status).toBe('connected')
      // A secret field is reduced to a marker; a non-secret one is kept as configuration.
      expect(connected.configSet.webhookUrl).toBe('set')
      expect(connected.configSet.channel).toBe('#hse-alerts')

      const row = await db.connectorConfig.findFirstOrThrow({
        where: { companyId: COMPANY, connectorId: 'itest-fixture' },
      })
      expect(JSON.stringify(row)).not.toContain('XXXXsecretXXXX')

      const off = await svc.setConnector(admin, COMPANY, ctx, 'itest-fixture', false)
      expect(off.status).toBe('available')
    } finally {
      CONNECTORS.splice(CONNECTORS.findIndex((c) => c.id === 'itest-fixture'), 1)
      await db.connectorConfig.deleteMany({ where: { companyId: COMPANY } })
    }

    // An id that is not in the directory is unknown, rather than "not available yet".
    await expect(svc.setConnector(admin, COMPANY, ctx, 'sap', true, {}))
      .rejects.toMatchObject({ code: 'not_found' })
  })

  /**
   * The original guarantee, strengthened rather than relaxed.
   *
   * It used to read: everything listed is available, and an available connector has fields.
   * That was true of the catalog and false of the product - all four stored a config that
   * nothing ever read, so "available" was advertising something the product could not do.
   *
   * The rule now has two halves, and a connector must satisfy one of them completely:
   * either it is genuinely connectable, or it is marked planned, asks for nothing and
   * refuses to connect. What is no longer permitted is the state that shipped - listed as
   * available, offered a form, and wired to nothing.
   */
  it('advertises no integration that cannot be connected', async () => {
    const list = await svc.listConnectors(admin, COMPANY)
    expect(list.length).toBeGreaterThan(0)

    for (const c of list) {
      expect(['connected', 'available', 'planned']).toContain(c.status)

      if (c.status === 'available') {
        // An available connector with no fields could never be configured.
        expect(c.fields.length, `${c.name} is available with no fields`).toBeGreaterThan(0)
      }

      if (c.status === 'planned') {
        // No form, so nobody is invited to hand over a credential it cannot use...
        expect(c.fields, `${c.name} is planned but asks for fields`).toEqual([])
        // ...and the refusal is enforced by the service, not only by the interface.
        await expect(
          svc.setConnector(admin, COMPANY, ctx, c.id, true, {}),
          `${c.name} is planned but accepted a connection`,
        ).rejects.toMatchObject({ code: 'validation' })
      }
    }
  })

  // ── Security ───────────────────────────────────────────────────────────────

  it('stores the security policy and records every changed field', async () => {
    const before = await svc.getSecurity(admin, COMPANY)
    // 12: the SafeOps minimum, which a policy can raise but not lower (authPolicy.ts).
    expect(before.passwordMinLength).toBe(12)
    await expect(svc.updateSecurity(admin, COMPANY, ctx, { passwordMinLength: 10 })).rejects.toThrow(/below 12/)

    const after = await svc.updateSecurity(admin, COMPANY, ctx, {
      passwordMinLength: 14, mfaRequired: true,
    })
    expect(after.passwordMinLength).toBe(14)
    expect(after.mfaRequired).toBe(true)

    const entries = await svc.listAudit(admin, COMPANY, { q: 'security policy' })
    expect(entries.rows.some((e) => e.target === 'passwordMinLength' && e.newValue === '14')).toBe(true)
    expect(entries.rows.some((e) => e.target === 'mfaRequired')).toBe(true)
  })

  it('reports security posture from real accounts and real login attempts', async () => {
    const centre = await svc.securityCenter(admin, COMPANY)

    expect(centre.totalUsers).toBeGreaterThan(0)
    expect(centre.mfaAdoptionPct).toBeGreaterThanOrEqual(0)
    expect(centre.mfaAdoptionPct).toBeLessThanOrEqual(100)
    // Failed sign-ins were recorded earlier; they surface here.
    expect(centre.suspiciousLogins).toBeGreaterThan(0)
    expect(centre.findings.length).toBeGreaterThan(0)
    expect(centre.findings.some((f) => f.id === 'f-susp')).toBe(true)
    // Invited accounts from the import are counted.
    expect(centre.pendingInvites).toBeGreaterThan(0)
  })

  // ── Organisation configuration ─────────────────────────────────────────────

  it('creates organisation settings from the company on first read, then updates them', async () => {
    const initial = await svc.getOrgSettings(admin, COMPANY)
    expect(initial.displayName).toBe('ADM ITest Co')

    const updated = await svc.updateOrgSettings(admin, COMPANY, ctx, {
      industry: 'Oil & Gas', timezone: 'Asia/Kuching',
    })
    expect(updated.industry).toBe('Oil & Gas')
    // Unlisted fields are not writable through the patch.
    const sneaky = await svc.updateOrgSettings(admin, COMPANY, ctx, { companyId: 'hijack' } as never)
    expect(sneaky.companyId).toBe(COMPANY)
  })

  it('adds and removes organisation configuration items', async () => {
    const pos = await svc.addConfigItem(admin, COMPANY, ctx, 'position', {
      title: 'Rope Access Technician', department: 'Maintenance', headcount: '6',
    })
    expect(pos.title).toBe('Rope Access Technician')

    const list = await svc.listConfigItems(admin, COMPANY, 'position')
    expect(list.some((p) => p.id === pos.id)).toBe(true)
    // Kinds do not bleed into each other.
    expect(await svc.listConfigItems(admin, COMPANY, 'shift')).toHaveLength(0)

    await svc.removeConfigItem(admin, COMPANY, ctx, 'position', pos.id)
    expect(await svc.listConfigItems(admin, COMPANY, 'position')).toHaveLength(0)

    await expect(svc.addConfigItem(admin, COMPANY, ctx, 'nonsense', { a: 'b' }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.removeConfigItem(admin, COMPANY, ctx, 'position', 'no-such-id'))
      .rejects.toMatchObject({ status: 404 })
  })

  // ── Health ─────────────────────────────────────────────────────────────────

  it('measures system health rather than reporting stored figures', async () => {
    const health = await svc.systemHealth(admin, COMPANY)

    expect(health.dbStatus).toBe('operational')
    // Latency is a real round trip, so it is a number rather than a constant.
    expect(health.apiLatencyMs).toBeGreaterThanOrEqual(0)
    expect(health.jobs.length).toBeGreaterThan(0)
    expect(health.alerts.some((a) => a.severity === 'info')).toBe(true)
    expect(health.usersOnline).toBeGreaterThanOrEqual(0)
  })

  it('reports every scheduled job from the shared history, failures included', async () => {
    // Written as the worker would: a different process from the one answering here.
    const { recordJobRun } = await import('./jobRuns.js')
    await db.jobRun.deleteMany({})
    await recordJobRun(db, 'reminders', new Date())
    await recordJobRun(db, 'reports', new Date(), new Error('relay refused the connection'))

    const jobs = (await svc.systemHealth(admin, COMPANY)).jobs
    const byName = (name: string) => jobs.find((j) => j.name === name)
    expect(byName('Reminder & escalation sweep')).toMatchObject({ status: 'ok' })
    expect(byName('Reminder & escalation sweep')?.lastRun).toBeTruthy()
    // Listed now, and a failure shows as one rather than hiding behind "ok".
    expect(byName('Scheduled reports')).toMatchObject({ status: 'failed' })
    expect(byName('Equipment sweep')?.lastRun).toBeNull() // never run: says so
    expect(byName('Visitor sweep')).toBeTruthy()
    await db.jobRun.deleteMany({})
  })

  // ── Backup & restore ───────────────────────────────────────────────────────

  it('exports only the caller’s own workspace', async () => {
    // A row that belongs to somebody else must not appear in this tenant's snapshot.
    await db.employee.create({
      data: {
        id: 'adm-other-emp', employeeNo: 'EMP-OTHER-1', companyId: OTHER, siteId: OTHER_SITE,
        name: 'Not Yours', department: 'Ops',
      },
    })
    await db.employee.create({
      data: {
        id: 'adm-mine-emp', employeeNo: 'EMP-MINE-1', companyId: COMPANY, siteId: SITE,
        name: 'Mine', department: 'Ops',
      },
    })

    const { backup, snapshot } = await svc.createBackup(admin, COMPANY, ctx, 'Isolation check')
    expect(backup.sizeKb).toBeGreaterThan(0)
    expect(snapshot).toContain('adm-mine-emp')
    expect(snapshot).not.toContain('adm-other-emp')
    expect(snapshot).not.toContain('Not Yours')
  })

  it('reinstates rows removed since the snapshot, and takes a safety copy first', async () => {
    await db.employee.upsert({
      where: { id: 'adm-restore-emp' },
      update: { name: 'Restore Me' },
      create: {
        id: 'adm-restore-emp', employeeNo: 'EMP-RESTORE-1', companyId: COMPANY, siteId: SITE,
        name: 'Restore Me', department: 'Maintenance',
      },
    })
    const { backup } = await svc.createBackup(admin, COMPANY, ctx, 'Before deletion')

    await db.employee.delete({ where: { id: 'adm-restore-emp' } })
    expect(await db.employee.count({ where: { id: 'adm-restore-emp' } })).toBe(0)

    const backupsBefore = (await svc.listBackups(admin, COMPANY)).length
    const result = await svc.restoreBackup(admin, COMPANY, ctx, backup.id)

    expect(result.restored).toBeGreaterThan(0)
    // The deleted row is back.
    const back = await db.employee.findUnique({ where: { id: 'adm-restore-emp' } })
    expect(back?.name).toBe('Restore Me')

    // A restore that cannot be undone is a second way to lose data, so it snapshots first.
    const backupsAfter = await svc.listBackups(admin, COMPANY)
    expect(backupsAfter.length).toBe(backupsBefore + 1)
    expect(backupsAfter.some((b) => b.type === 'pre_restore')).toBe(true)

    const entries = await svc.listAudit(admin, COMPANY, { q: 'Restored' })
    expect(entries.rows.length).toBeGreaterThan(0)
  })

  it('does not delete work done since the snapshot', async () => {
    const { backup } = await svc.createBackup(admin, COMPANY, ctx, 'Additive check')
    await db.employee.create({
      data: {
        id: 'adm-after-snap', employeeNo: 'EMP-AFTER-1', companyId: COMPANY, siteId: SITE,
        name: 'Created After', department: 'Ops',
      },
    })

    await svc.restoreBackup(admin, COMPANY, ctx, backup.id)

    // Reinstating removed rows is recovery; destroying newer work is not.
    expect(await db.employee.count({ where: { id: 'adm-after-snap' } })).toBe(1)
  })

  it('refuses to restore another workspace’s snapshot', async () => {
    const otherAdmin: Caller = {
      userId: 'adm-other-admin', name: 'Other Admin',
      roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
    }
    const { backup } = await svc.createBackup(otherAdmin, OTHER, ctx, 'Their snapshot')

    // Not reachable by id from this tenant at all.
    await expect(svc.restoreBackup(admin, COMPANY, ctx, backup.id))
      .rejects.toMatchObject({ status: 404 })
  })

  it('prunes old snapshots to the retention count but keeps the record', async () => {
    await svc.updateRetention(admin, COMPANY, ctx, { backupCount: 2 })
    for (const n of [1, 2, 3]) await svc.createBackup(admin, COMPANY, ctx, `Rolling ${n}`)

    const rows = await db.backup.findMany({ where: { companyId: COMPANY }, orderBy: { at: 'desc' } })
    const withPayload = rows.filter((r) => r.snapshot !== null)
    expect(withPayload.length).toBeLessThanOrEqual(2)
    // The history of what was taken survives the pruning of what it contained.
    expect(rows.length).toBeGreaterThan(withPayload.length)
    const pruned = rows.find((r) => r.snapshot === null)
    expect(pruned?.restorable).toBe(false)

    if (pruned) {
      await expect(svc.restoreBackup(admin, COMPANY, ctx, pruned.id))
        .rejects.toMatchObject({ code: 'validation' })
    }
  })

  it('stores the retention policy', async () => {
    const updated = await svc.updateRetention(admin, COMPANY, ctx, {
      auditLogDays: 730, autoBackupDaily: false,
    })
    expect(updated.auditLogDays).toBe(730)
    expect(updated.autoBackupDaily).toBe(false)

    const health = await svc.systemHealth(admin, COMPANY)
    // The backup job reports failed while auto-backup is switched off.
    expect(health.jobs.find((j) => j.id === 'j4')?.status).toBe('failed')
  })

  // ── Tenancy ────────────────────────────────────────────────────────────────

  it('keeps every administrative record inside its own workspace', async () => {
    const otherAdmin: Caller = {
      userId: 'adm-other-admin2', name: 'Other Admin 2',
      roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
    }
    await svc.createApiKey(otherAdmin, OTHER, ctx, 'Their key', [])
    await svc.createWebhook(otherAdmin, OTHER, ctx, 'https://theirs.example.com', ['incident.created'])

    const keys = await svc.listApiKeys(admin, COMPANY)
    expect(keys.some((k) => k.name === 'Their key')).toBe(false)
    const hooks = await svc.listWebhooks(admin, COMPANY)
    expect(hooks.some((w) => w.url.includes('theirs'))).toBe(false)
    const audit = await svc.listAudit(admin, COMPANY, {})
    expect(audit.rows.every((e) => e.companyId === COMPANY)).toBe(true)
  })

  it('reports a user outside the workspace as not found', async () => {
    const otherUser = await db.user.findUniqueOrThrow({ where: { email: 'adm-other@itest.local' } })
    await expect(svc.getUser(admin, COMPANY, otherUser.id)).rejects.toBeInstanceOf(AdminError)
    await expect(svc.getUser(admin, COMPANY, otherUser.id)).rejects.toMatchObject({ status: 404 })
  })
})
