import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { setEmailProviderForTests } from '../lib/email/index.js'
import type { EmailMessage, EmailProvider } from '../lib/email/provider.js'
import { hashPassword } from '../lib/password.js'
import { hashResetToken } from '../lib/tokens.js'

/**
 * Self-service password reset, over HTTP.
 *
 * The point of interest is not that it sends an email - that is the easy half. It is that
 * the endpoint must behave identically for an address that exists and one that does not,
 * because an unauthenticated endpoint that answers "no such account" is a free membership
 * oracle: it tells an attacker which companies use this product and who works there, which
 * is the reconnaissance step before a phishing run.
 *
 * A fake provider throughout. Nothing here reaches a real vendor.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const PREFIX = 'forgot-itest'

let server: Server
let base = ''
let seq = 0
const uniq = () => { seq += 1; return `${Date.now().toString(36)}${seq}` }
const mail = () => `${PREFIX}-${uniq()}@itest.local`

class CapturingProvider implements EmailProvider {
  readonly name = 'capturing'
  readonly idempotent = true
  sent: EmailMessage[] = []
  constructor(private mode: 'ok' | 'throw' = 'ok') {}
  async send(message: EmailMessage) {
    this.sent.push(message)
    if (this.mode === 'throw') throw new Error('provider exploded')
    return { messageId: `m${this.sent.length}`, accepted: message.to.map((t) => t.email), rejected: [] }
  }
  async verify() { return { ok: true } }
}

const json = { 'Content-Type': 'application/json' }
const forgot = (email: string) => fetch(`${base}/auth/forgot-password`, {
  method: 'POST', headers: json, body: JSON.stringify({ email }),
})

const tokenFromEmail = (m: EmailMessage) =>
  (m.text.match(/reset-password\?token=([A-Za-z0-9_%-]+)/) ?? [])[1]

async function makeUser(email: string, status: 'active' | 'deactivated' = 'active') {
  return db.user.create({
    data: {
      email,
      name: 'Forgot Itest',
      passwordHash: await hashPassword('Original-Password-2026'),
      status,
    },
    select: { id: true, email: true },
  })
}

async function purge() {
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } }, select: { id: true },
  })
  const ids = users.map((u) => u.id)
  if (ids.length) {
    await db.passwordResetToken.deleteMany({ where: { userId: { in: ids } } })
    await db.refreshToken.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  }
}

d('POST /auth/forgot-password', () => {
  beforeAll(async () => {
    await purge()
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, () => {
        const a = server.address()
        base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    await purge()
    await new Promise<void>((r) => server.close(() => r()))
    await db.$disconnect()
  })

  beforeEach(() => setEmailProviderForTests(new CapturingProvider()))
  afterEach(() => setEmailProviderForTests(undefined))

  it('emails a working link to an address that exists', async () => {
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)
    const email = mail()
    await makeUser(email)

    const res = await forgot(email)

    expect(res.status).toBe(202)
    expect(provider.sent).toHaveLength(1)
    expect(provider.sent[0].to[0].email).toBe(email)

    // The link in the email is the one that actually redeems.
    const token = decodeURIComponent(tokenFromEmail(provider.sent[0]) ?? '')
    expect(token.length).toBeGreaterThan(20)
    const stored = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
    })
    expect(stored).not.toBeNull()

    /*
     * Only the digest is stored - asserted here rather than in a test of its own, because
     * every request in this file spends from one shared rate-limit budget and this one
     * already has the token in hand.
     */
    expect(stored!.tokenHash).not.toBe(token)
    expect(stored!.tokenHash).toBe(hashResetToken(token))
  })

  it('answers identically for an address that does not exist', async () => {
    /*
     * The whole point. Same status, same body - nothing an attacker can use to tell a
     * member from a stranger.
     */
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)
    const email = mail()
    await makeUser(email)

    const hit = await forgot(email)
    const miss = await forgot(mail())

    expect(miss.status).toBe(hit.status)
    expect(await miss.text()).toBe(await hit.text())
    // ...and nothing was sent for the address that does not exist.
    expect(provider.sent).toHaveLength(1)
  })

  it('answers the same way for a malformed address', async () => {
    const res = await forgot('not-an-email')
    expect(res.status).toBe(202)
  })

  it('says nothing about whether the account exists', async () => {
    const body = await (await forgot(mail())).json()
    expect(JSON.stringify(body)).not.toMatch(/no such|not found|unknown|does not exist/i)
  })

  it('sends nothing for a deactivated account, and still answers the same', async () => {
    // A link that redeem would refuse is an email promising a way in that does not exist.
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)
    const email = mail()
    await makeUser(email, 'deactivated')

    const res = await forgot(email)

    expect(res.status).toBe(202)
    expect(provider.sent).toHaveLength(0)
  })

  it('supersedes an earlier link, so two requests do not leave two working secrets', async () => {
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)
    const email = mail()
    const user = await makeUser(email)

    await forgot(email)
    await forgot(email)

    const live = await db.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    })
    expect(live).toBe(1)
  })

  it('still answers 202 when the provider fails, so failure is not an oracle either', async () => {
    /*
     * A 500 for real addresses and a 202 for invented ones is the same enumeration oracle
     * wearing a different hat.
     */
    setEmailProviderForTests(new CapturingProvider('throw'))
    const email = mail()
    await makeUser(email)

    const res = await forgot(email)

    expect(res.status).toBe(202)
  })

  it('sends nothing when no provider is configured, and does not fail the request', async () => {
    setEmailProviderForTests(null)
    const email = mail()
    await makeUser(email)

    const res = await forgot(email)

    expect(res.status).toBe(202)
  })

  it('issues a link that is single-use', async () => {
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)
    const email = mail()
    await makeUser(email)
    await forgot(email)
    const token = decodeURIComponent(tokenFromEmail(provider.sent[0]) ?? '')

    const redeem = () => fetch(`${base}/auth/reset-password`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ token, newPassword: 'Brand-New-Password-2026' }),
    })

    expect((await redeem()).status).toBe(204)
    // Second attempt with the same link must fail.
    expect((await redeem()).status).toBe(400)
  })

  it('issues a link that expires', async () => {
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)
    const email = mail()
    const user = await makeUser(email)
    await forgot(email)
    const token = decodeURIComponent(tokenFromEmail(provider.sent[0]) ?? '')

    // Age it past its window rather than waiting for the clock.
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const res = await fetch(`${base}/auth/reset-password`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ token, newPassword: 'Brand-New-Password-2026' }),
    })
    expect(res.status).toBe(400)
  })

  /*
   * Deliberately last, and deliberately not given its own budget.
   *
   * This endpoint shares `resetLimiter` with the rest of the reset flow - 15 attempts per
   * quarter hour per IP - and every test above spends from the same bucket because they all
   * arrive from 127.0.0.1. Writing this suite is what proved the limit is real: an earlier
   * draft had one test too many and the last one failed with an empty outbox, which is
   * exactly what an attacker walking an address list would experience.
   *
   * So rather than raise the limit or split the suite to hide it, the exhaustion is the
   * assertion. Anything that quietly removed the limiter would turn this red.
   */
  it('stops answering once the per-IP budget is spent', async () => {
    const provider = new CapturingProvider()
    setEmailProviderForTests(provider)

    let sawLimit = false
    for (let i = 0; i < 20 && !sawLimit; i += 1) {
      const res = await forgot(mail())
      if (res.status === 429) sawLimit = true
    }

    expect(sawLimit).toBe(true)
  })
})
