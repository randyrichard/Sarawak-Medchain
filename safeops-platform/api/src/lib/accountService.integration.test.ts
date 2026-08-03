import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { AccountError, AccountService } from './accountService.js'
import { hashPassword, verifyPassword } from './password.js'
import { hashRefreshToken, hashResetToken } from './tokens.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The properties worth protecting:
 *
 *  1. Changing a password requires knowing the current one. Without that check, anyone
 *     holding a stolen access token locks the real owner out permanently.
 *  2. Other sessions die and the caller's survives. A password change that leaves an
 *     attacker's session alive is worse than none — it tells the victim they are safe.
 *  3. A preference cannot name a site the person cannot see.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new AccountService(db)

const COMPANY = 'acct-itest-co'
const OTHER = 'acct-itest-other'
const SITE_A = 'acct-itest-site-a'
const SITE_B = 'acct-itest-site-b'
const SITE_OTHER = 'acct-itest-site-other'

const CURRENT = 'CurrentPassw0rd!'
const NEXT = 'BrandNewPassw0rd!'

let userId = ''

/** Creates a live refresh token in its own family and returns the raw value. */
async function makeSession(uid: string, familyId: string) {
  const raw = `raw-${familyId}-${Math.random().toString(36).slice(2)}`
  await db.refreshToken.create({
    data: {
      userId: uid,
      tokenHash: hashRefreshToken(raw),
      familyId,
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  })
  return raw
}

d('AccountService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'Account ITest Co'], [OTHER, 'Account ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE_A, COMPANY], [SITE_B, COMPANY], [SITE_OTHER, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId, name: `Site ${id}`, short: id, city: 'Kuching' },
      })
    }
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { contains: 'acct-itest' } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.user.deleteMany({ where: { email: { contains: 'acct-itest' } } })
    const user = await db.user.create({
      data: {
        email: 'acct-itest-user@example.test',
        name: 'ITest Account',
        passwordHash: await hashPassword(CURRENT),
        memberships: { create: { companyId: COMPANY, role: 'safety_officer', siteIds: [] } },
      },
    })
    userId = user.id
  })

  // ── Password ───────────────────────────────────────────────────────────────

  it('refuses a change when the current password is wrong', async () => {
    await expect(svc.changePassword(userId, 'NotThePassword1!', NEXT))
      .rejects.toThrow(AccountError)

    // And the stored password is untouched — a failed attempt must not half-apply.
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(await verifyPassword(after.passwordHash, CURRENT)).toBe(true)
  })

  it('changes the password when the current one is correct', async () => {
    await svc.changePassword(userId, CURRENT, NEXT)
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(await verifyPassword(after.passwordHash, NEXT)).toBe(true)
    expect(await verifyPassword(after.passwordHash, CURRENT)).toBe(false)
  })

  it('enforces the password policy on the new password', async () => {
    await expect(svc.changePassword(userId, CURRENT, 'short')).rejects.toThrow(/at least 12/i)
    await expect(svc.changePassword(userId, CURRENT, 'alllowercase123')).rejects.toThrow(/uppercase/i)
    await expect(svc.changePassword(userId, CURRENT, 'NoDigitsInHere!')).rejects.toThrow(/number/i)
  })

  it('refuses to "change" a password to the same value', async () => {
    await expect(svc.changePassword(userId, CURRENT, CURRENT)).rejects.toThrow(/different/i)
  })

  it('clears a forced reset and the lockout counters', async () => {
    await db.user.update({
      where: { id: userId },
      data: { mustChangePassword: true, failedLoginCount: 4, lockedUntil: new Date(Date.now() + 60_000) },
    })
    await svc.changePassword(userId, CURRENT, NEXT)
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
    expect(after.mustChangePassword).toBe(false)
    expect(after.failedLoginCount).toBe(0)
    expect(after.lockedUntil).toBeNull()
  })

  it('revokes every other session and keeps the caller signed in', async () => {
    const mine = await makeSession(userId, 'family-mine')
    await makeSession(userId, 'family-phone')
    await makeSession(userId, 'family-laptop')

    const { revokedSessions } = await svc.changePassword(userId, CURRENT, NEXT, mine)
    expect(revokedSessions).toBe(2)

    const live = await db.refreshToken.findMany({ where: { userId, revokedAt: null } })
    expect(live).toHaveLength(1)
    expect(live[0].familyId).toBe('family-mine')

    const revoked = await db.refreshToken.findMany({ where: { userId, revokedAt: { not: null } } })
    expect(revoked.every((r) => r.revokedReason === 'password_changed')).toBe(true)
  })

  it('revokes everything when no session is named', async () => {
    await makeSession(userId, 'family-a')
    await makeSession(userId, 'family-b')

    const { revokedSessions } = await svc.changePassword(userId, CURRENT, NEXT)
    expect(revokedSessions).toBe(2)
    expect(await db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0)
  })

  it('does not let another account\'s cookie spare that account\'s sessions', async () => {
    const intruder = await db.user.create({
      data: {
        email: 'acct-itest-intruder@example.test',
        name: 'ITest Intruder',
        passwordHash: await hashPassword(CURRENT),
      },
    })
    const theirs = await makeSession(intruder.id, 'family-intruder')
    await makeSession(userId, 'family-victim')

    // Presenting someone else's refresh cookie must not exempt anything.
    const { revokedSessions } = await svc.changePassword(userId, CURRENT, NEXT, theirs)
    expect(revokedSessions).toBe(1)
    expect(await db.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0)
    // ...and the intruder's own session is untouched, because it is not this user's.
    expect(await db.refreshToken.count({ where: { userId: intruder.id, revokedAt: null } })).toBe(1)
  })

  it('refuses for a deactivated account', async () => {
    await db.user.update({ where: { id: userId }, data: { status: 'deactivated' } })
    await expect(svc.changePassword(userId, CURRENT, NEXT)).rejects.toThrow(/deactivated/i)
  })

  // ── Preferences ────────────────────────────────────────────────────────────

  it('returns defaults for an account that has never set any', async () => {
    expect(await svc.getPreferences(userId)).toEqual({ landingPage: '/', defaultSiteId: null })
  })

  it('stores and returns a preference', async () => {
    const saved = await svc.updatePreferences(userId, { landingPage: '/permits' })
    expect(saved.landingPage).toBe('/permits')
    expect((await svc.getPreferences(userId)).landingPage).toBe('/permits')
  })

  it('merges a partial update rather than replacing the whole object', async () => {
    await svc.updatePreferences(userId, { landingPage: '/audits' })
    await svc.updatePreferences(userId, { defaultSiteId: SITE_A })
    expect(await svc.getPreferences(userId)).toEqual({ landingPage: '/audits', defaultSiteId: SITE_A })
  })

  it('refuses a landing page that is not a real route', async () => {
    await expect(svc.updatePreferences(userId, { landingPage: '/admin' as never }))
      .rejects.toThrow(/land on/i)
  })

  it('refuses a site in another workspace', async () => {
    await expect(svc.updatePreferences(userId, { defaultSiteId: SITE_OTHER }))
      .rejects.toThrow(/do not have access/i)
  })

  it('refuses a site the caller is restricted away from', async () => {
    await db.membership.updateMany({
      where: { userId, companyId: COMPANY },
      data: { siteIds: [SITE_A] },
    })
    await expect(svc.updatePreferences(userId, { defaultSiteId: SITE_B }))
      .rejects.toThrow(/do not have access/i)
    // The site they are allowed still works.
    expect((await svc.updatePreferences(userId, { defaultSiteId: SITE_A })).defaultSiteId).toBe(SITE_A)
  })

  it('clears the site preference with null', async () => {
    await svc.updatePreferences(userId, { defaultSiteId: SITE_A })
    expect((await svc.updatePreferences(userId, { defaultSiteId: null })).defaultSiteId).toBeNull()
  })

  it('falls back to defaults when the stored value is corrupt', async () => {
    // A shape written by an older build, or by hand.
    await db.user.update({
      where: { id: userId },
      data: { preferences: { landingPage: '/nowhere', defaultSiteId: 42 } },
    })
    expect(await svc.getPreferences(userId)).toEqual({ landingPage: '/', defaultSiteId: null })
  })

  // ── Password reset ─────────────────────────────────────────────────────────

  /**
   * A reset link is the one credential that hands over an account without the password,
   * so these tests are mostly about what must NOT work.
   */
  describe('password reset', () => {
    const RESET = 'ResetPassw0rdOk!'

    /** Issues a link directly, as adminService does. Returns the raw token. */
    async function issue(opts: { expiresAt?: Date; userId?: string } = {}) {
      const raw = `reset-${Math.random().toString(36).slice(2)}-${Date.now()}`
      await db.passwordResetToken.create({
        data: {
          userId: opts.userId ?? userId,
          tokenHash: hashResetToken(raw),
          expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 60_000),
          issuedBy: 'itest-admin',
        },
      })
      return raw
    }

    it('sets a new password and reports the link valid beforehand', async () => {
      const raw = await issue()
      expect(await svc.isResetTokenValid(raw)).toBe(true)

      await svc.redeemPasswordReset(raw, RESET)

      const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
      expect(await verifyPassword(after.passwordHash, RESET)).toBe(true)
      expect(await verifyPassword(after.passwordHash, CURRENT)).toBe(false)
    })

    it('cannot be redeemed twice', async () => {
      const raw = await issue()
      await svc.redeemPasswordReset(raw, RESET)

      await expect(svc.redeemPasswordReset(raw, 'AnotherPassw0rd!')).rejects.toThrow(AccountError)
      expect(await svc.isResetTokenValid(raw)).toBe(false)

      // The first redemption stands; the second changed nothing.
      const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
      expect(await verifyPassword(after.passwordHash, RESET)).toBe(true)
    })

    it('rejects an expired link', async () => {
      const raw = await issue({ expiresAt: new Date(Date.now() - 60_000) })
      expect(await svc.isResetTokenValid(raw)).toBe(false)
      await expect(svc.redeemPasswordReset(raw, RESET)).rejects.toThrow(AccountError)

      const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
      expect(await verifyPassword(after.passwordHash, CURRENT)).toBe(true)
    })

    it('rejects an unknown token', async () => {
      expect(await svc.isResetTokenValid('never-issued-at-all')).toBe(false)
      await expect(svc.redeemPasswordReset('never-issued-at-all', RESET))
        .rejects.toThrow(AccountError)
    })

    it('enforces the password policy', async () => {
      const raw = await issue()
      await expect(svc.redeemPasswordReset(raw, 'short')).rejects.toThrow(/at least 12/i)
      // A rejected password must not burn the link.
      expect(await svc.isResetTokenValid(raw)).toBe(true)
    })

    it('signs out every existing session', async () => {
      await makeSession(userId, 'fam-1')
      await makeSession(userId, 'fam-2')
      const raw = await issue()

      await svc.redeemPasswordReset(raw, RESET)

      const live = await db.refreshToken.count({ where: { userId, revokedAt: null } })
      expect(live).toBe(0)
    })

    it('clears a forced reset and the lockout counters', async () => {
      await db.user.update({
        where: { id: userId },
        data: { mustChangePassword: true, failedLoginCount: 5, lockedUntil: new Date(Date.now() + 3600_000) },
      })
      const raw = await issue()

      await svc.redeemPasswordReset(raw, RESET)

      const after = await db.user.findUniqueOrThrow({ where: { id: userId } })
      expect(after.mustChangePassword).toBe(false)
      expect(after.failedLoginCount).toBe(0)
      expect(after.lockedUntil).toBeNull()
    })

    it('invalidates other outstanding links for the same account', async () => {
      const older = await issue()
      const newer = await issue()

      await svc.redeemPasswordReset(newer, RESET)

      expect(await svc.isResetTokenValid(older)).toBe(false)
      await expect(svc.redeemPasswordReset(older, 'YetAnotherPass1!')).rejects.toThrow(AccountError)
    })

    it('refuses a link belonging to a deactivated account', async () => {
      const raw = await issue()
      await db.user.update({ where: { id: userId }, data: { status: 'deactivated' } })

      expect(await svc.isResetTokenValid(raw)).toBe(false)
      await expect(svc.redeemPasswordReset(raw, RESET)).rejects.toThrow(AccountError)
    })

    it('stores only a digest, never the raw token', async () => {
      const raw = await issue()
      const rows = await db.passwordResetToken.findMany({ where: { userId } })
      expect(rows).toHaveLength(1)
      expect(rows[0].tokenHash).not.toBe(raw)
      expect(rows[0].tokenHash).toBe(hashResetToken(raw))
    })
  })
})
