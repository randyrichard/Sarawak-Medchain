import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'

/**
 * The refresh throttle, over HTTP.
 *
 * Every page load refreshes once, and a customer's site reaches us from one NAT address.
 * The throttle was keyed on that address, so its budget of 120 per fifteen minutes was
 * shared by everybody on the site and the 121st page load signed somebody out. It is keyed
 * on the refresh token now: many sessions behind one address each get their own budget,
 * and one token replayed in a storm is still cut off.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
let server: Server
let base = ''

const refresh = (cookie: string) => fetch(`${base}/auth/refresh`, {
  method: 'POST', headers: { Cookie: `safeops_rt=${cookie}` },
})

d('refresh throttle — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.rateLimit.deleteMany({ where: { key: { contains: 'refresh' } } })
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, () => {
        const addr = server.address()
        base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    await db.rateLimit.deleteMany({ where: { key: { contains: 'refresh' } } })
    await db.$disconnect()
  })

  it('does not make a whole site share one budget', async () => {
    // 130 distinct sessions from one address: more than the old shared budget of 120.
    // None is valid, so each is refused as unauthenticated - but none may be throttled.
    const statuses: number[] = []
    for (let i = 0; i < 130; i++) statuses.push((await refresh(randomBytes(32).toString('base64url'))).status)
    expect(statuses.filter((s) => s === 429)).toHaveLength(0)
    expect(new Set(statuses)).toEqual(new Set([401]))
  }, 60_000)

  it('still cuts off one token replayed in a storm', async () => {
    const token = randomBytes(32).toString('base64url')
    const statuses: number[] = []
    for (let i = 0; i < 125; i++) statuses.push((await refresh(token)).status)
    expect(statuses.slice(0, 120).every((s) => s !== 429)).toBe(true)
    expect(statuses.slice(120).every((s) => s === 429)).toBe(true)
  }, 60_000)
})
