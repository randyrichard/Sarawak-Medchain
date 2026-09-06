import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { Options } from 'express-rate-limit'
import { PrismaRateLimitStore } from './rateLimitStore.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * These have to be real. The two things this store exists to guarantee are that counters
 * survive a process restart and that concurrent increments do not lose each other, and
 * neither is observable against a mock — a mock would happily prove that a read-then-write
 * implementation works, which is exactly the bug worth catching.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()

const WINDOW = 60_000
const opts = (windowMs = WINDOW) => ({ windowMs }) as Options

/** A fresh store, as if the process had just started. */
const store = (prefix = 'test') => {
  const s = new PrismaRateLimitStore(db, prefix)
  s.init(opts())
  return s
}

d('PrismaRateLimitStore — integration (real Postgres)', () => {
  const KEY = '203.0.113.7'

  beforeAll(async () => {
    await db.rateLimit.deleteMany({ where: { key: { contains: '203.0.113' } } })
  })

  afterAll(async () => {
    await db.rateLimit.deleteMany({ where: { key: { contains: '203.0.113' } } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.rateLimit.deleteMany({ where: { key: { contains: '203.0.113' } } })
  })

  it('counts up across calls', async () => {
    const s = store()
    expect((await s.increment(KEY)).totalHits).toBe(1)
    expect((await s.increment(KEY)).totalHits).toBe(2)
    expect((await s.increment(KEY)).totalHits).toBe(3)
    s.shutdown()
  })

  it('SURVIVES a restart — the whole point', async () => {
    // Counters lived in process memory before this. Restarting the API reset every bucket
    // to zero, which is how a login throttle was cleared during testing: by restarting the
    // container. A second store instance stands in for the process coming back.
    const before = store()
    for (let i = 0; i < 5; i++) await before.increment(KEY)
    before.shutdown()

    const after = store()
    expect((await after.increment(KEY)).totalHits).toBe(6)
    after.shutdown()
  })

  it('is shared across instances, so two API processes cannot each grant a full budget', async () => {
    const a = store()
    const b = store()
    await a.increment(KEY)
    await b.increment(KEY)
    expect((await a.increment(KEY)).totalHits).toBe(3)
    a.shutdown(); b.shutdown()
  })

  it('loses no hits when many arrive at once', async () => {
    // The case a read-then-write implementation gets wrong, and the moment a rate limiter
    // is actually under load. Every lost increment here is a free attempt for an attacker.
    const s = store()
    const results = await Promise.all(Array.from({ length: 50 }, () => s.increment(KEY)))

    const totals = results.map((r) => r.totalHits).sort((x, y) => x - y)
    expect(totals).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))

    const row = await db.rateLimit.findUnique({ where: { key: `test:${KEY}` } })
    expect(row?.hits).toBe(50)
    s.shutdown()
  })

  it('starts a new window once the old one has expired', async () => {
    const s = new PrismaRateLimitStore(db, 'test')
    s.init(opts(50)) // 50ms window
    await s.increment(KEY)
    await s.increment(KEY)

    await new Promise((r) => setTimeout(r, 120))

    // The count restarts rather than continuing from the expired window.
    expect((await s.increment(KEY)).totalHits).toBe(1)
    s.shutdown()
  })

  it('does not extend a live window on every hit', async () => {
    // A sliding expiry would let a steady trickle of requests keep a bucket alive forever
    // and never reset, which is not what a fixed-window limiter promises.
    const s = store()
    const first = await s.increment(KEY)
    await new Promise((r) => setTimeout(r, 30))
    const second = await s.increment(KEY)
    expect(second.resetTime?.getTime()).toBe(first.resetTime?.getTime())
    s.shutdown()
  })

  it('keeps limiters apart, so one IP has a separate budget per limiter', async () => {
    // Without the prefix, a person signing in would spend the same bucket as their
    // dashboard requests and the global ceiling would swallow the login throttle.
    const login = store('login')
    const global = store('global')

    await login.increment(KEY)
    await login.increment(KEY)

    expect((await global.increment(KEY)).totalHits).toBe(1)
    expect((await login.increment(KEY)).totalHits).toBe(3)
    login.shutdown(); global.shutdown()
  })

  it('reports a live bucket through get(), and nothing for an expired one', async () => {
    const s = new PrismaRateLimitStore(db, 'test')
    s.init(opts(50))
    await s.increment(KEY)
    expect((await s.get(KEY))?.totalHits).toBe(1)

    await new Promise((r) => setTimeout(r, 120))
    expect(await s.get(KEY)).toBeUndefined()
    s.shutdown()
  })

  it('decrements without going below zero', async () => {
    const s = store()
    await s.increment(KEY)
    await s.decrement(KEY)
    await s.decrement(KEY)
    const row = await db.rateLimit.findUnique({ where: { key: `test:${KEY}` } })
    expect(row?.hits).toBe(0)
    s.shutdown()
  })

  it('clears one key and, separately, everything under its prefix', async () => {
    const s = store()
    await s.increment(KEY)
    await s.increment('203.0.113.8')

    await s.resetKey(KEY)
    expect(await s.get(KEY)).toBeUndefined()
    expect((await s.get('203.0.113.8'))?.totalHits).toBe(1)

    await s.resetAll()
    expect(await s.get('203.0.113.8')).toBeUndefined()
    s.shutdown()
  })

  it('declares its keys shared, which is what makes it worth having', async () => {
    expect(store().localKeys).toBe(false)
  })

  it('fails OPEN when the database is unreachable', async () => {
    // Deliberate. Every endpoint behind this limiter needs the same database to check a
    // session, so failing closed would convert a database blip into a total outage for no
    // security gain — and the one thing this must never do is be the reason nobody can
    // report an injury. Per-account lockout is a durable column on User, not a counter
    // here, so password guessing stays bounded either way.
    const broken = new PrismaClient({ datasources: { db: { url: 'postgresql://nobody:nobody@127.0.0.1:1/none' } } })
    const s = new PrismaRateLimitStore(broken, 'test')
    s.init(opts())

    const result = await s.increment(KEY)
    expect(result.totalHits).toBe(1)
    expect(result.resetTime).toBeInstanceOf(Date)

    // The other methods must swallow it too rather than throwing into the middleware.
    await expect(s.decrement(KEY)).resolves.toBeUndefined()
    await expect(s.resetKey(KEY)).resolves.toBeUndefined()
    await expect(s.get(KEY)).resolves.toBeUndefined()

    s.shutdown()
    await broken.$disconnect().catch(() => {})
  })
})
