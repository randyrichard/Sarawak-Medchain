import { describe, it, expect, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { AuthService, AuthError } from './authService.js'
import { hashPassword } from './password.js'
import { verifyAccessToken, hashRefreshToken } from './tokens.js'

/**
 * In-memory stand-in for the Prisma methods AuthService uses. Docker/Postgres are not
 * available in this environment, so these tests exercise the real security state machine
 * against a fake store rather than mocking the service itself.
 */
function makeDb() {
  const users: any[] = []
  const memberships: any[] = []
  const refreshTokens: any[] = []
  const loginAttempts: any[] = []
  let seq = 0

  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]) => (v === null ? row[k] === null : row[k] === v))

  const db = {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => matches(u, where)) ?? null,
      update: async ({ where, data }: any) => {
        const u = users.find((x) => matches(x, where))
        Object.assign(u, data)
        return u
      },
    },
    membership: {
      findMany: async ({ where }: any) => memberships.filter((m) => matches(m, where)),
    },
    refreshToken: {
      create: async ({ data }: any) => {
        const row = { id: `rt-${++seq}`, revokedAt: null, revokedReason: null, replacedById: null, ...data }
        refreshTokens.push(row)
        return row
      },
      findUnique: async ({ where }: any) => refreshTokens.find((r) => matches(r, where)) ?? null,
      update: async ({ where, data }: any) => {
        const r = refreshTokens.find((x) => matches(x, where))
        Object.assign(r, data)
        return r
      },
      updateMany: async ({ where, data }: any) => {
        const hits = refreshTokens.filter((r) => matches(r, where))
        hits.forEach((r) => Object.assign(r, data))
        return { count: hits.length }
      },
    },
    loginAttempt: {
      create: async ({ data }: any) => {
        const row = { id: `la-${++seq}`, createdAt: new Date(), ...data }
        loginAttempts.push(row)
        return row
      },
    },
    /**
     * Runs the callback against the same in-memory store. This models the happy path only —
     * it does not roll back, so it cannot prove atomicity. Real rollback behaviour is a
     * property of Postgres and needs an integration test against a live database.
     */
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  }

  return { db: db as unknown as PrismaClient, users, memberships, refreshTokens, loginAttempts }
}

const PASSWORD = 'SafeOpsPlatform2026'
const ctx = { ip: '203.0.113.7', userAgent: 'vitest' }

let store: ReturnType<typeof makeDb>
let auth: AuthService

beforeEach(async () => {
  store = makeDb()
  auth = new AuthService(store.db)
  store.users.push({
    id: 'u-hse',
    email: 'hse@demo.safeops.app',
    name: 'Marcus Tan',
    title: 'Group HSE Manager',
    passwordHash: await hashPassword(PASSWORD),
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    mfaEnabled: false,
    mustChangePassword: false,
  })
  store.memberships.push({ id: 'm-1', userId: 'u-hse', companyId: 'big', role: 'hse_manager', siteIds: [] })
})

describe('login', () => {
  it('issues an access token carrying server-derived roles', async () => {
    const res = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    const claims = verifyAccessToken(res.accessToken)
    expect(claims?.sub).toBe('u-hse')
    expect(claims?.roles).toEqual([{ companyId: 'big', role: 'hse_manager', siteIds: [] }])
  })

  it('never returns the password hash to the client', async () => {
    const res = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    expect(JSON.stringify(res.user)).not.toContain('argon2')
    expect((res.user as Record<string, unknown>).passwordHash).toBeUndefined()
  })

  it('is case-insensitive on email and trims whitespace', async () => {
    await expect(auth.login('  HSE@Demo.SafeOps.App  ', PASSWORD, ctx)).resolves.toBeTruthy()
  })

  it('rejects a wrong password', async () => {
    await expect(auth.login('hse@demo.safeops.app', 'wrong', ctx)).rejects.toBeInstanceOf(AuthError)
  })

  it('gives an identical message for unknown users and wrong passwords (no enumeration)', async () => {
    const a = await auth.login('nobody@demo.safeops.app', 'x', ctx).catch((e) => e.message)
    const b = await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch((e) => e.message)
    expect(a).toBe(b)
  })

  it('records every attempt with its true reason for defenders', async () => {
    await auth.login('nobody@demo.safeops.app', 'x', ctx).catch(() => {})
    await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch(() => {})
    await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    expect(store.loginAttempts.map((l) => l.outcome)).toEqual(['unknown_user', 'bad_password', 'success'])
    expect(store.loginAttempts[0].ip).toBe('203.0.113.7')
  })

  it('rejects a deactivated account even with the right password', async () => {
    store.users[0].status = 'deactivated'
    await expect(auth.login('hse@demo.safeops.app', PASSWORD, ctx)).rejects.toBeInstanceOf(AuthError)
  })
})

describe('account lockout', () => {
  it('locks the account after the configured number of failures', async () => {
    for (let i = 0; i < 5; i++) {
      await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch(() => {})
    }
    expect(store.users[0].status).toBe('locked')
    expect(store.users[0].lockedUntil).toBeInstanceOf(Date)
    expect(store.users[0].lockedUntil.getTime()).toBeGreaterThan(Date.now())
  })

  it('refuses the CORRECT password while locked', async () => {
    for (let i = 0; i < 5; i++) {
      await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch(() => {})
    }
    await expect(auth.login('hse@demo.safeops.app', PASSWORD, ctx)).rejects.toBeInstanceOf(AuthError)
    expect(store.loginAttempts.at(-1)?.outcome).toBe('locked_out')
  })

  it('lets the user back in once the lockout expires, and resets the counter', async () => {
    for (let i = 0; i < 5; i++) {
      await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch(() => {})
    }
    store.users[0].lockedUntil = new Date(Date.now() - 1000) // window elapsed
    await expect(auth.login('hse@demo.safeops.app', PASSWORD, ctx)).resolves.toBeTruthy()
    expect(store.users[0].failedLoginCount).toBe(0)
    expect(store.users[0].lockedUntil).toBeNull()
    expect(store.users[0].status).toBe('active')
  })

  it('a successful login clears accumulated failures', async () => {
    await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch(() => {})
    await auth.login('hse@demo.safeops.app', 'wrong', ctx).catch(() => {})
    expect(store.users[0].failedLoginCount).toBe(2)
    await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    expect(store.users[0].failedLoginCount).toBe(0)
  })
})

describe('refresh rotation', () => {
  it('stores only a hash of the refresh token', async () => {
    const { refreshToken } = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    const rows = store.refreshTokens
    expect(rows[0].tokenHash).toBe(hashRefreshToken(refreshToken))
    expect(JSON.stringify(rows)).not.toContain(refreshToken)
  })

  it('rotates: the old token is revoked and a new one issued', async () => {
    const first = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    const second = await auth.refresh(first.refreshToken, ctx)

    expect(second.refreshToken).not.toBe(first.refreshToken)
    const oldRow = store.refreshTokens.find((r) => r.tokenHash === hashRefreshToken(first.refreshToken))
    expect(oldRow.revokedAt).toBeInstanceOf(Date)
    expect(oldRow.revokedReason).toBe('rotated')
    expect(oldRow.replacedById).toBeTruthy()
  })

  it('keeps the rotated token in the same session family', async () => {
    const first = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    await auth.refresh(first.refreshToken, ctx)
    const families = new Set(store.refreshTokens.map((r) => r.familyId))
    expect(families.size).toBe(1)
  })

  it('detects reuse of a consumed token and kills the whole family', async () => {
    const first = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    const second = await auth.refresh(first.refreshToken, ctx)

    // An attacker replays the stolen, already-rotated token.
    await expect(auth.refresh(first.refreshToken, ctx)).rejects.toMatchObject({ code: 'refresh_reuse' })

    // The legitimate successor is revoked too — a stolen session must not survive.
    const successor = store.refreshTokens.find((r) => r.tokenHash === hashRefreshToken(second.refreshToken))
    expect(successor.revokedAt).toBeInstanceOf(Date)
    expect(successor.revokedReason).toBe('reuse_detected')
    await expect(auth.refresh(second.refreshToken, ctx)).rejects.toBeInstanceOf(AuthError)
  })

  it('rejects an unknown or expired refresh token', async () => {
    await expect(auth.refresh('not-a-real-token', ctx)).rejects.toMatchObject({ code: 'invalid_refresh' })

    const { refreshToken } = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    store.refreshTokens[0].expiresAt = new Date(Date.now() - 1000)
    await expect(auth.refresh(refreshToken, ctx)).rejects.toMatchObject({ code: 'expired_refresh' })
  })

  it('refuses to refresh a deactivated account', async () => {
    const { refreshToken } = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    store.users[0].status = 'deactivated'
    await expect(auth.refresh(refreshToken, ctx)).rejects.toBeInstanceOf(AuthError)
  })
})

describe('logout', () => {
  it('revokes server-side so the token cannot be reused', async () => {
    const { refreshToken } = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    await auth.logout(refreshToken)
    await expect(auth.refresh(refreshToken, ctx)).rejects.toBeInstanceOf(AuthError)
  })

  it('logout on one device leaves other sessions alive', async () => {
    const deviceA = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    const deviceB = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)

    await auth.logout(deviceA.refreshToken)
    await expect(auth.refresh(deviceA.refreshToken, ctx)).rejects.toBeInstanceOf(AuthError)
    await expect(auth.refresh(deviceB.refreshToken, ctx)).resolves.toBeTruthy()
  })

  it('allDevices revokes every session for the user', async () => {
    const deviceA = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)
    const deviceB = await auth.login('hse@demo.safeops.app', PASSWORD, ctx)

    await auth.logout(deviceA.refreshToken, true)
    await expect(auth.refresh(deviceB.refreshToken, ctx)).rejects.toBeInstanceOf(AuthError)
  })

  it('is a no-op for a missing or unknown token', async () => {
    await expect(auth.logout(undefined)).resolves.toBeUndefined()
    await expect(auth.logout('bogus')).resolves.toBeUndefined()
  })
})
