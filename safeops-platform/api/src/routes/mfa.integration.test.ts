import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { env } from '../env.js'
import { hashPassword } from '../lib/password.js'
import { codeAt, stepAt } from '../lib/totp.js'
import { openWith } from '../lib/secretBox.js'

/**
 * Multi-factor sign-in, over real HTTP against a REAL PostgreSQL database.
 *
 * Before this, "Enable MFA" set a column nothing read and sign-in asked for a password
 * only. These tests are the claims the product now makes, exercised the way a person and
 * an attacker would meet them: enrol with a code, sign in with a code, a used code is dead,
 * a recovery code works once, guessing locks the account, the policy holds in the API.
 *
 * Time is moved forward in 30-second steps where a fresh code is needed, since each code
 * is single-use. Only `Date` is faked; timers and I/O run normally.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const PREFIX = 'mfa-itest'
const PASSWORD = 'Mfa-Itest-Password-2026'
const tag = Date.now().toString(36)
const COMPANY = `${PREFIX}-${tag}`
const email = (who: string) => `${PREFIX}-${who}-${tag}@itest.local`

let server: Server
let base = ''
let clock = Date.now()

/** Moves the clock to the start of a fresh 30-second step, so the next code is unused. */
function nextStep() {
  clock = (stepAt(clock) + 1) * 30_000 + 1_000
  vi.setSystemTime(clock)
}

async function call(path: string, init: { method?: string; token?: string; body?: unknown; cookie?: string } = {}) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.cookie ? { Cookie: init.cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const body = await res.json().catch(() => ({})) as Record<string, any>
  return { res, body }
}

const login = (who: string, password = PASSWORD) =>
  call('/auth/login', { body: { email: email(who), password } })

async function signInWithoutMfa(who: string): Promise<string> {
  const { body } = await login(who)
  expect(body.accessToken, JSON.stringify(body)).toBeTruthy()
  return body.accessToken
}

/** Sets MFA up for `who` through the API, returning the secret and recovery codes. */
async function enrol(token: string) {
  const setup = await call('/account/mfa/setup', { token, body: {} })
  expect(setup.res.status).toBe(200)
  const secret = setup.body.secret as string
  const enabled = await call('/account/mfa/enable', { token, body: { code: codeAt(secret, stepAt(Date.now())) } })
  expect(enabled.res.status, JSON.stringify(enabled.body)).toBe(200)
  return { secret, recoveryCodes: enabled.body.recoveryCodes as string[], otpauthUri: setup.body.otpauthUri as string }
}

async function purge() {
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })
  const uids = users.map((u) => u.id)
  await db.refreshToken.deleteMany({ where: { userId: { in: uids } } })
  await db.loginAttempt.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await db.membership.deleteMany({ where: { userId: { in: uids } } })
  await db.user.deleteMany({ where: { id: { in: uids } } })
  await db.securityPolicy.deleteMany({ where: { companyId: { startsWith: PREFIX } } })
  await db.company.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

d('multi-factor sign-in — integration (real Postgres, real HTTP)', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    await purge()
    await db.company.create({ data: { id: COMPANY, name: 'MFA ITest' } })
    const passwordHash = await hashPassword(PASSWORD)
    for (const who of ['alice', 'bob', 'carol', 'dave', 'erin']) {
      await db.user.create({
        data: {
          email: email(who), name: who, passwordHash, status: 'active',
          memberships: { create: { companyId: COMPANY, role: who === 'alice' ? 'admin' : 'employee', siteIds: [] } },
        },
      })
    }
  }, 120_000)

  afterEach(async () => {
    nextStep()
    /*
     * Each test signs in several times from 127.0.0.1, and the per-IP budget is 40 failed
     * attempts per quarter hour. Cleared between tests for the same reason resetRateLimits.ts clears
     * it between files: isolation, not switching the limiter off - every request still
     * passes through it and counts.
     */
    await db.rateLimit.deleteMany({})
  })

  afterAll(async () => {
    vi.useRealTimers()
    await purge()
    await new Promise<void>((r) => server.close(() => r()))
    await db.$disconnect()
  })

  it('sets up only once a code proves the authenticator has the secret', async () => {
    const token = await signInWithoutMfa('alice')
    const setup = await call('/account/mfa/setup', { token, body: {} })
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/SafeOps:/)

    const wrong = await call('/account/mfa/enable', { token, body: { code: '000000' } })
    expect(wrong.res.status).toBe(400)
    expect((await call('/account/mfa', { token })).body.enabled).toBe(false)

    const right = await call('/account/mfa/enable', { token, body: { code: codeAt(setup.body.secret, stepAt(Date.now())) } })
    expect(right.res.status).toBe(200)
    expect(right.body.recoveryCodes).toHaveLength(10)
    expect((await call('/account/mfa', { token })).body).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 })

    // The secret is stored sealed, and the recovery codes only as digests.
    const row = await db.user.findUniqueOrThrow({ where: { email: email('alice') } })
    expect(row.mfaSecret).toMatch(/^v1\./)
    expect(row.mfaSecret).not.toContain(setup.body.secret)
    expect(row.mfaRecoveryCodes).not.toContain(right.body.recoveryCodes[0])
  })

  it('asks for a code after the password, and issues nothing until it is right', async () => {
    const token = await signInWithoutMfa('bob')
    const { secret } = await enrol(token)
    nextStep()

    const first = await login('bob')
    expect(first.body).toMatchObject({ mfaRequired: true })
    expect(first.body.accessToken).toBeUndefined()
    expect(first.res.headers.get('set-cookie')).toBeNull()

    const wrong = await call('/auth/mfa', { body: { challenge: first.body.challenge, code: '123456' } })
    expect(wrong.res.status).toBe(401)
    expect(wrong.body.error).toBe('invalid_mfa_code')

    const code = codeAt(secret, stepAt(Date.now()))
    const ok = await call('/auth/mfa', { body: { challenge: first.body.challenge, code } })
    expect(ok.res.status).toBe(200)
    expect(ok.body.accessToken).toBeTruthy()
    expect(ok.res.headers.get('set-cookie')).toMatch(/safeops_rt=/)

    // The same code, from a fresh password step, is refused: each code works once.
    const again = await login('bob')
    const replay = await call('/auth/mfa', { body: { challenge: again.body.challenge, code } })
    expect(replay.res.status).toBe(401)
  })

  it('accepts each recovery code exactly once', async () => {
    const token = await signInWithoutMfa('carol')
    const { recoveryCodes } = await enrol(token)
    const code = recoveryCodes[3].toLowerCase().replace('-', ' ') // as somebody might type it

    const use = async () => call('/auth/mfa', { body: { challenge: (await login('carol')).body.challenge, code } })
    expect((await use()).res.status).toBe(200)
    expect((await use()).res.status).toBe(401)
    expect((await call('/account/mfa', { token })).body.recoveryCodesRemaining).toBe(9)
  })

  it('keeps the challenge and the session token from standing in for one another', async () => {
    const { body } = await login('bob')
    expect((await call('/auth/me', { token: body.challenge })).res.status).toBe(401)

    const access = await call('/auth/mfa', { body: { challenge: body.challenge, code: '000000' } })
    expect(access.res.status).toBe(401)
    const fake = await call('/auth/mfa', { body: { challenge: 'not-a-token', code: '000000' } })
    expect(fake.body.error).toBe('mfa_challenge_expired')
  })

  it('locks the account when codes are guessed, the same as passwords', async () => {
    await db.user.update({ where: { email: email('bob') }, data: { failedLoginCount: 0, lockedUntil: null, status: 'active' } })
    for (let i = 0; i < env.MAX_FAILED_LOGINS; i += 1) {
      const { body } = await login('bob')
      await call('/auth/mfa', { body: { challenge: body.challenge, code: '000000' } })
    }
    const row = await db.user.findUniqueOrThrow({ where: { email: email('bob') } })
    expect(row.status).toBe('locked')
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
    const outcomes = await db.loginAttempt.findMany({ where: { email: email('bob'), outcome: 'bad_mfa_code' } })
    expect(outcomes.length).toBeGreaterThanOrEqual(env.MAX_FAILED_LOGINS)
  })

  it('needs the password and a code to turn it off', async () => {
    const token = await signInWithoutMfa('dave')
    const { secret } = await enrol(token)
    nextStep()
    const noPassword = await call('/account/mfa/disable', { token, body: { password: 'wrong', code: codeAt(secret, stepAt(Date.now())) } })
    expect(noPassword.res.status).toBe(401)
    nextStep()
    const off = await call('/account/mfa/disable', { token, body: { password: PASSWORD, code: codeAt(secret, stepAt(Date.now())) } })
    expect(off.res.status).toBe(204)
    expect((await login('dave')).body.accessToken).toBeTruthy()
  })

  it('holds the workspace policy in the API: nothing but setup until it is done', async () => {
    await db.securityPolicy.upsert({
      where: { companyId: COMPANY }, create: { companyId: COMPANY, mfaRequired: true }, update: { mfaRequired: true },
    })
    try {
      const { body, res } = await login('erin')
      expect(body.user.mfaSetupRequired).toBe(true)
      const token = body.accessToken as string
      const cookie = res.headers.get('set-cookie')!.split(';')[0]

      const blocked = await call(`/dashboard/overview?companyId=${COMPANY}`, { token })
      expect(blocked.res.status).toBe(403)
      expect(blocked.body.error).toBe('mfa_setup_required')
      expect((await call('/auth/me', { token })).body.user.mfaSetupRequired).toBe(true)

      const { secret } = await enrol(token)

      // A refreshed session no longer carries the requirement.
      const refreshed = await call('/auth/refresh', { body: {}, cookie })
      expect(refreshed.body.user.mfaSetupRequired).toBe(false)
      const open = await call(`/dashboard/overview?companyId=${COMPANY}`, { token: refreshed.body.accessToken })
      expect(open.res.status).not.toBe(403)

      // And it cannot be switched off while the workspace requires it.
      nextStep()
      const off = await call('/account/mfa/disable', {
        token: refreshed.body.accessToken, body: { password: PASSWORD, code: codeAt(secret, stepAt(Date.now())) },
      })
      expect(off.res.status).toBe(403)
    } finally {
      await db.securityPolicy.update({ where: { companyId: COMPANY }, data: { mfaRequired: false } })
    }
  })

  it('lets an administrator reset it for somebody who lost their phone, but never switch it on', async () => {
    // Alice, the administrator, enrolled in the first test. Her secret is read back from the
    // row here only because the test has no phone to read the code from.
    const challenge = (await login('alice')).body.challenge as string
    const aliceRow = await db.user.findUniqueOrThrow({ where: { email: email('alice') } })
    const aliceSecret = openWith(env.mfaSecretKey!, aliceRow.mfaSecret!, 'MFA_SECRET_KEY_B64')
    const signedIn = await call('/auth/mfa', { body: { challenge, code: codeAt(aliceSecret, stepAt(Date.now())) } })
    const token = signedIn.body.accessToken as string
    expect(token).toBeTruthy()

    const dave = await db.user.findUniqueOrThrow({ where: { email: email('dave') } })
    const switchOn = await call(`/admin/users/${dave.id}/reset-mfa`, { token, body: { companyId: COMPANY } })
    expect(switchOn.res.status).toBe(400)

    const carol = await db.user.findUniqueOrThrow({ where: { email: email('carol') } })
    const reset = await call(`/admin/users/${carol.id}/reset-mfa`, { token, body: { companyId: COMPANY } })
    expect(reset.res.status).toBe(200)
    expect((await login('carol')).body.accessToken).toBeTruthy()
  })
})
