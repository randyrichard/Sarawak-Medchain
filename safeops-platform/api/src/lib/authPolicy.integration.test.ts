import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { AuthService } from './authService.js'
import { AccountService } from './accountService.js'
import { OrgAdminService } from './orgAdminService.js'
import { hashPassword } from './password.js'
import { generateResetToken, hashRefreshToken, hashResetToken } from './tokens.js'

/**
 * The Authentication Policy page, enforced end to end on a real database.
 *
 * Every setting on that page used to be saved, shown back and ignored: the server used its
 * own fixed lockout, session length and password rules (SECURITY_AUDIT.md D-7). An
 * administrator who set "lock after 3 attempts" believed it was in force. Each test here
 * sets one value through the stored policy and checks the behaviour it promises.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const auth = new AuthService(db)
const account = new AccountService(db)
const org = new OrgAdminService(db)

const STRICT = 'authpol-itest-strict'
const LAX = 'authpol-itest-lax'
const EMAIL = 'authpol-itest-user@example.test'
const PASSWORD = 'Policy-Passw0rd-2026'
const ctx = { ip: '203.0.113.9', userAgent: 'vitest' }
let userId = ''

async function policy(companyId: string, data: Record<string, unknown>) {
  await db.securityPolicy.upsert({ where: { companyId }, update: data, create: { companyId, ...data } })
}

async function signIn(password = PASSWORD) {
  const r = await auth.authenticate(EMAIL, password, ctx)
  if (r.mfaRequired) throw new Error('unexpected MFA')
  return r
}

d('Authentication Policy enforcement (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[STRICT, 'AuthPol Strict'], [LAX, 'AuthPol Lax']]) {
      await db.company.upsert({ where: { id }, update: { status: 'active' }, create: { id, name } })
    }
  })

  beforeEach(async () => {
    await db.user.deleteMany({ where: { email: { contains: 'authpol-itest' } } })
    await db.securityPolicy.deleteMany({ where: { companyId: { in: [STRICT, LAX] } } })
    // Both companies on settings lax enough to stay out of the way of the test at hand.
    for (const c of [STRICT, LAX]) await policy(c, { passwordExpiryDays: 0, sessionTimeoutHours: 720, lockoutThreshold: 100, passwordMinLength: 12, requireSymbol: false })
    const u = await db.user.create({
      data: {
        email: EMAIL, name: 'AuthPol User', passwordHash: await hashPassword(PASSWORD),
        memberships: { create: [{ companyId: STRICT, role: 'safety_officer', siteIds: [] }, { companyId: LAX, role: 'employee', siteIds: [] }] },
      },
    })
    userId = u.id
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { contains: 'authpol-itest' } } })
    await db.securityPolicy.deleteMany({ where: { companyId: { in: [STRICT, LAX] } } })
    await db.company.deleteMany({ where: { id: { in: [STRICT, LAX] } } })
    await db.$disconnect()
  })

  it('locks the account after the policy\'s number of failed attempts, the strictest company\'s', async () => {
    await policy(STRICT, { lockoutThreshold: 3 })
    for (let i = 0; i < 3; i++) await expect(auth.authenticate(EMAIL, 'Wrong-Passw0rd-1', ctx)).rejects.toThrow()
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(u.status).toBe('locked')
    // Locked means locked: the right password is refused too.
    await expect(signIn()).rejects.toThrow()
  })

  it('ends a session after the policy\'s timeout, however often it is refreshed', async () => {
    await policy(STRICT, { sessionTimeoutHours: 8 })
    const before = Date.now()
    const s = await signIn()
    const row = await db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(s.refreshToken) } })
    const eightHours = 8 * 3_600_000
    expect(row.sessionEndsAt!.getTime()).toBeGreaterThanOrEqual(before + eightHours - 1000)
    expect(row.sessionEndsAt!.getTime()).toBeLessThanOrEqual(Date.now() + eightHours)
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(row.sessionEndsAt!.getTime())

    // A refresh carries the end forward unchanged: rotating cannot buy more time.
    const r = await auth.refresh(s.refreshToken, ctx)
    const next = await db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(r.refreshToken) } })
    expect(next.sessionEndsAt!.getTime()).toBe(row.sessionEndsAt!.getTime())
    expect(next.expiresAt.getTime()).toBeLessThanOrEqual(row.sessionEndsAt!.getTime())

    // Once it has passed, the session is over.
    await db.refreshToken.update({ where: { id: next.id }, data: { expiresAt: new Date(Date.now() - 1000), sessionEndsAt: new Date(Date.now() - 1000) } })
    await expect(auth.refresh(r.refreshToken, ctx)).rejects.toThrow(/expired/i)
  })

  it('asks for a new password once the current one is older than the policy allows', async () => {
    await policy(STRICT, { passwordExpiryDays: 30 })
    expect((await signIn()).user.mustChangePassword).toBe(false)

    await db.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date(Date.now() - 31 * 86_400_000) } })
    const s = await signIn()
    expect(s.user.mustChangePassword).toBe(true)
    expect(s.user.passwordExpired).toBe(true)

    // Changing it clears the demand and restarts the clock.
    await account.changePassword(userId, PASSWORD, 'Fresh-Policy-Passw0rd-1')
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(Date.now() - u.passwordChangedAt.getTime()).toBeLessThan(60_000)
    expect((await signIn('Fresh-Policy-Passw0rd-1')).user.mustChangePassword).toBe(false)
  })

  it('never expires passwords when every company says 0', async () => {
    await db.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date(Date.now() - 3650 * 86_400_000) } })
    expect((await signIn()).user.mustChangePassword).toBe(false)
  })

  it('refuses a new password that misses the length or symbol rule, on every way a password is set', async () => {
    await policy(STRICT, { passwordMinLength: 20, requireSymbol: true })
    const shortOne = 'Short-Enough-For-12' // 19 characters, has a symbol
    const noSymbol = 'LongEnoughButNoSymbol2026'

    await expect(account.changePassword(userId, PASSWORD, shortOne)).rejects.toThrow(/at least 20 characters/)
    await expect(account.changePassword(userId, PASSWORD, noSymbol)).rejects.toThrow(/symbol/)

    const raw = generateResetToken()
    await db.passwordResetToken.create({ data: { userId, tokenHash: hashResetToken(raw), expiresAt: new Date(Date.now() + 600_000), issuedBy: 'self' } })
    await expect(account.redeemPasswordReset(raw, shortOne)).rejects.toThrow(/at least 20 characters/)

    await account.changePassword(userId, PASSWORD, 'Long-Enough-With-Symbol-2026')
  })

  it('applies the policy of the company an invitation is for', async () => {
    await policy(STRICT, { passwordMinLength: 20 })
    const admin = await db.user.create({
      data: {
        email: 'authpol-itest-admin@example.test', name: 'AuthPol Admin', passwordHash: await hashPassword(PASSWORD),
        memberships: { create: { companyId: STRICT, role: 'admin', siteIds: [] } },
      },
    })
    const caller = { userId: admin.id, name: 'AuthPol Admin', roles: [{ companyId: STRICT, role: 'admin' as const, siteIds: [] }] }
    const created = await org.createInvitation(caller as never, STRICT, { ip: '203.0.113.9', device: 'vitest' }, { email: 'authpol-itest-new@example.test', role: 'employee' })
    await expect(org.acceptInvitation(created.token!, { password: 'Twelve-Chars-1' })).rejects.toThrow(/at least 20 characters/)
    await org.acceptInvitation(created.token!, { password: 'Twenty-Characters-Long-1' })
  })

  it('ignores a suspended company\'s policy, as it gives no access either', async () => {
    await policy(STRICT, { lockoutThreshold: 2 })
    await db.company.update({ where: { id: STRICT }, data: { status: 'suspended' } })
    try {
      for (let i = 0; i < 2; i++) await expect(auth.authenticate(EMAIL, 'Wrong-Passw0rd-1', ctx)).rejects.toThrow()
      expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).not.toBe('locked')
    } finally {
      await db.company.update({ where: { id: STRICT }, data: { status: 'active' } })
    }
  })
})
