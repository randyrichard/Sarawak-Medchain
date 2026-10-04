import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { hashPassword } from '../lib/password.js'

/**
 * The sign-in throttle, over HTTP.
 *
 * A customer's site reaches us from one NAT address, so at shift start everybody on site
 * signs in from the same IP within minutes. The per-IP throttle counted every sign-in,
 * successful ones included, so its budget of 20 per quarter hour was spent by the first 20
 * people through the gate and the 21st was told "Too many attempts" - with the right
 * password. What the throttle exists to bound is guessing, and a guess is a failed attempt:
 * it now counts failures only. Successful sign-ins never use up the budget.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const PREFIX = 'login-limit-itest'
const COMPANY = `${PREFIX}-co`
const PASSWORD = 'Shift-start-2026!'
const WORKERS = 45
const email = (i: number) => `${PREFIX}-${i}@example.test`
let server: Server
let base = ''

const signIn = (who: string, password: string) => fetch(`${base}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: who, password }),
})

async function purge() {
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })
  const uids = users.map((u) => u.id)
  await db.refreshToken.deleteMany({ where: { userId: { in: uids } } })
  await db.loginAttempt.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await db.membership.deleteMany({ where: { userId: { in: uids } } })
  await db.user.deleteMany({ where: { id: { in: uids } } })
  await db.company.deleteMany({ where: { id: COMPANY } })
}

d('sign-in throttle — integration (real Postgres, real HTTP)', () => {
  beforeAll(async () => {
    await purge()
    await db.company.create({ data: { id: COMPANY, name: 'Login Limit ITest' } })
    const passwordHash = await hashPassword(PASSWORD)
    for (let i = 0; i < WORKERS; i++) {
      await db.user.create({
        data: {
          email: email(i), name: `Worker ${i}`, passwordHash, status: 'active',
          memberships: { create: { companyId: COMPANY, role: 'employee', siteIds: [] } },
        },
      })
    }
    await new Promise<void>((r) => { server = createApp().listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  }, 120_000)

  // Isolation between tests, not switching the limiter off: every request still counts.
  afterEach(async () => { await db.rateLimit.deleteMany({ where: { key: { startsWith: 'login' } } }) })

  afterAll(async () => {
    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'login' } } })
    await purge()
    await new Promise<void>((r) => server.close(() => r()))
    await db.$disconnect()
  })

  it('lets a whole shift sign in from one site address', async () => {
    // 45 people, one address, a few minutes: more than double the old shared budget of 20.
    const statuses: number[] = []
    for (let i = 0; i < WORKERS; i++) statuses.push((await signIn(email(i), PASSWORD)).status)
    expect(statuses.filter((s) => s === 429)).toHaveLength(0)
    expect(statuses.every((s) => s === 200)).toBe(true)
  }, 120_000)

  it('still cuts off guessing from one address', async () => {
    // Each guess at a different made-up account, so per-account lockout never applies:
    // this is the spray the per-IP throttle exists to stop.
    const statuses: number[] = []
    for (let i = 0; i < 60; i++) statuses.push((await signIn(`${PREFIX}-nobody-${i}@example.test`, 'guess')).status)
    const firstBlocked = statuses.indexOf(429)
    expect(firstBlocked).toBe(40)
    expect(statuses.slice(0, 40).every((s) => s === 401)).toBe(true)
    expect(statuses.slice(40).every((s) => s === 429)).toBe(true)
  }, 120_000)

  it('lets a shift that arrives all at once sign in', async () => {
    // The load test's finding: 300 people pressing "Sign in" in the same second from one
    // address got 260 refusals. Each request counted on arrival and was only refunded when
    // it finished, so the first 40 still being checked filled the budget for everybody.
    const burst = await Promise.all(Array.from({ length: 300 }, (_, i) => signIn(email(i % WORKERS), PASSWORD)))
    expect(burst.map((r) => r.status).filter((s) => s !== 200)).toEqual([])
  }, 120_000)

  it('gives a parallel spray no more guesses than a sequential one', async () => {
    const burst = await Promise.all(Array.from({ length: 100 }, (_, i) => signIn(`${PREFIX}-nobody-p${i}@example.test`, 'guess')))
    const statuses = burst.map((r) => r.status)
    expect(statuses.filter((s) => s === 401)).toHaveLength(40)
    expect(statuses.filter((s) => s === 429)).toHaveLength(60)
  }, 120_000)

  it('does not count its own refusals, so a lock does not feed itself', async () => {
    for (let i = 0; i < 60; i++) await signIn(`${PREFIX}-nobody-r${i}@example.test`, 'guess')
    const row = await db.rateLimit.findFirst({ where: { key: { startsWith: 'login:' } } })
    expect(row?.hits).toBe(40) // 40 failures; the 20 refused requests left no mark
  }, 120_000)

  it('does not let successful sign-ins wash out the failures in between', async () => {
    // Interleaving a correct sign-in after every guess must not buy more guesses.
    const statuses: number[] = []
    for (let i = 0; i < 45; i++) {
      statuses.push((await signIn(`${PREFIX}-nobody-x${i}@example.test`, 'guess')).status)
      await signIn(email(i % WORKERS), PASSWORD)
    }
    expect(statuses.indexOf(429)).toBe(40)
  }, 120_000)
})
