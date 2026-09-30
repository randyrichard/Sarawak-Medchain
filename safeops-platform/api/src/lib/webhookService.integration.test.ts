import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { enqueueEvent, sweepDeliveries, MAX_ATTEMPTS } from './webhookService.js'
import { verifySignature, SIGNATURE_HEADER, EVENT_HEADER } from './webhookDelivery.js'
import { seal } from './secretBox.js'
import { IncidentService } from './incidentService.js'
import type { Caller } from '../domain/caller.js'

/**
 * Webhook delivery, end to end, against a real database and a real HTTP receiver.
 *
 * Every part of this used to be theatre. `testWebhook` wrote `success` and a 200 into the
 * row without making a request; nothing dispatched an event; and the signing secret was
 * stored as a SHA-256 digest, so even if something had tried to send, it could not have
 * signed anything. The console showed green deliveries for endpoints that had never been
 * contacted.
 *
 * So these tests refuse to take the row's word for it. A server is stood up, and what is
 * asserted is what actually arrived at it - headers, body, and a signature verified the
 * way a customer's receiver would verify it.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const incidents = new IncidentService(db)

const CO = 'wh-itest-co'
const SITE = 'wh-itest-site'
const SECRET = 'whsec_itest_secret_value'

interface Received {
  headers: IncomingMessage['headers']
  body: string
}

let server: Server
let endpoint = ''
let received: Received[] = []
/** What the receiver answers next. Lets one test play a flaky endpoint. */
let respondWith = 200

const caller = (role = 'hse_manager'): Caller => ({
  userId: 'wh-user', name: 'WH Tester',
  roles: [{ companyId: CO, role: role as never, siteIds: [] }],
})

async function makeWebhook(events: string[], over: Record<string, unknown> = {}) {
  return db.webhook.create({
    data: {
      companyId: CO,
      url: endpoint,
      events,
      secretEnc: seal(SECRET),
      secretTail: SECRET.slice(-4),
      createdBy: 'vitest',
      ...over,
    },
  })
}

/**
 * Sweeps as the scheduler would a moment later.
 *
 * A row is queued as due "now", and the sweep asks for what is due at *its* now - which,
 * milliseconds later, is sometimes fractionally behind the stamp the row was given. In
 * production the sweep runs every thirty seconds and a millisecond either way is nothing;
 * in a test that enqueues and sweeps in the same tick it is the difference between a pass
 * and a confusing `attempted: 0`. Diagnosed from three runs of this file scoring 29, 29
 * and 22.
 *
 * `sweepDeliveries` takes the time for exactly this reason, so driving it is the honest
 * fix rather than widening the production comparison to paper over a race it does not have.
 */
const sweep = (at = new Date(Date.now() + 1000)) => sweepDeliveries(db, at)

d('Webhook delivery - integration (real Postgres, real HTTP receiver)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: CO }, update: {}, create: { id: CO, name: 'WH ITest Co' } })
    await db.site.upsert({
      where: { id: SITE }, update: {}, create: { id: SITE, companyId: CO, name: 'WH Site' },
    })

    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') })
        res.writeHead(respondWith)
        res.end('ok')
      })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const addr = server.address()
    endpoint = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/hook`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.webhookDelivery.deleteMany({ where: { companyId: CO } })
    await db.webhook.deleteMany({ where: { companyId: CO } })
    await db.incident.deleteMany({ where: { companyId: CO } })
    await db.site.deleteMany({ where: { id: SITE } })
    await db.company.deleteMany({ where: { id: CO } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    received = []
    respondWith = 200
    /*
     * Every delivery row, not only this workspace's.
     *
     * `sweepDeliveries` is a queue worker: it asks "what is pending and due" across the
     * whole table, because in production that is exactly right - one sweep serves every
     * tenant. It means a row left behind by an earlier run, or by a test that failed
     * before its cleanup, lands in the next test's counters and makes assertions like
     * `delivered: 1` fail for reasons that have nothing to do with the test. Which is what
     * happened: three runs of this file gave 29, 29 and 22 passes.
     *
     * This file is the only thing in the suite that creates delivery rows, so clearing the
     * table is safe here and the alternative - a tenant filter on the sweep, existing only
     * for the tests - would put a fiction in the production query.
     */
    await db.webhookDelivery.deleteMany({})
    await db.webhook.deleteMany({ where: { companyId: CO } })
    await db.incident.deleteMany({ where: { companyId: CO } })
  })

  // ── Queueing ───────────────────────────────────────────────────────────────

  it('queues an event for every webhook subscribed to it, and no others', async () => {
    const subscribed = await makeWebhook(['incident.created', 'incident.closed'])
    const other = await makeWebhook(['certificate.issued'])
    const inactive = await makeWebhook(['incident.created'], { active: false })

    const { queued } = await enqueueEvent(db, CO, 'incident.created', { id: 'x' })
    expect(queued).toBe(1)

    const rows = await db.webhookDelivery.findMany({ where: { companyId: CO } })
    expect(rows.map((r) => r.webhookId)).toEqual([subscribed.id])
    expect(rows.map((r) => r.webhookId)).not.toContain(other.id)
    expect(rows.map((r) => r.webhookId)).not.toContain(inactive.id)
  })

  it('queues nothing, and raises nothing, when no webhook wants the event', async () => {
    // Called from inside the path that files an incident. It must be silent and cheap when
    // the customer has no integrations at all, which is almost every customer.
    await expect(enqueueEvent(db, CO, 'incident.created', { id: 'x' })).resolves.toEqual({ queued: 0 })
  })

  it('is queued by reporting an incident, with the reporter withheld when anonymous', async () => {
    await makeWebhook(['incident.created'])
    await incidents.create(caller(), {
      companyId: CO, siteId: SITE, title: 'Trapped hand', type: 'injury', severity: 'Serious',
      location: 'Line 2', occurredAt: '2026-09-01T02:00:00.000Z', anonymous: true,
    })

    const row = await db.webhookDelivery.findFirstOrThrow({ where: { companyId: CO } })
    expect(row.event).toBe('incident.created')
    const payload = row.payload as { data: { title: string; reporter: string | null } }
    expect(payload.data.title).toBe('Trapped hand')
    // Same promise the screen keeps. A webhook is read by a system further from the HSE
    // function than anyone `maskAnonymous` already hides the reporter from.
    expect(payload.data.reporter).toBeNull()
  })

  // ── Delivering ─────────────────────────────────────────────────────────────

  it('actually sends the payload, signed, and a receiver can verify it', async () => {
    await makeWebhook(['incident.created'])
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1', number: 'INC-2601' })

    const result = await sweep()
    expect(result).toMatchObject({ attempted: 1, delivered: 1, failed: 0, retrying: 0 })

    // The assertion that the old implementation could never have passed: something arrived.
    expect(received).toHaveLength(1)
    const [got] = received
    expect(got.headers[EVENT_HEADER]).toBe('incident.created')
    expect(JSON.parse(got.body)).toMatchObject({
      event: 'incident.created',
      companyId: CO,
      data: { id: 'i-1', number: 'INC-2601' },
    })

    // Verified exactly as a customer's endpoint would, against the secret they were shown.
    const sig = String(got.headers[SIGNATURE_HEADER])
    expect(verifySignature(SECRET, got.body, sig)).toBe(true)
    // And it is a real signature, not a constant: the wrong secret must not verify.
    expect(verifySignature('whsec_wrong', got.body, sig)).toBe(false)
  })

  it('marks the delivery and the webhook as delivered', async () => {
    const wh = await makeWebhook(['incident.created'])
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1' })
    await sweep()

    const row = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: wh.id } })
    expect(row.status).toBe('delivered')
    expect(row.attempts).toBe(1)
    expect(row.lastStatusCode).toBe(200)
    expect(row.deliveredAt).toBeInstanceOf(Date)

    const after = await db.webhook.findUniqueOrThrow({ where: { id: wh.id } })
    expect(after.lastDeliveryStatus).toBe('success')
    expect(after.lastDeliveryCode).toBe(200)
  })

  it('sends nothing twice', async () => {
    await makeWebhook(['incident.created'])
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1' })
    await sweep()
    await sweep()
    // A duplicate incident alert is indistinguishable from a second incident to whoever
    // receives it.
    expect(received).toHaveLength(1)
  })

  // ── Failing ────────────────────────────────────────────────────────────────

  it('retries with backoff when the endpoint answers 500, and gives up eventually', async () => {
    respondWith = 500
    const wh = await makeWebhook(['incident.created'])
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1' })

    const first = await sweep()
    expect(first).toMatchObject({ attempted: 1, delivered: 0, retrying: 1 })

    let row = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: wh.id } })
    expect(row.status).toBe('pending')
    expect(row.lastStatusCode).toBe(500)
    expect(row.lastError).toContain('500')
    // Pushed into the future, so a dead endpoint does not consume every sweep.
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())

    // Wind the clock forward for each remaining attempt rather than waiting seven hours.
    for (let i = 2; i <= MAX_ATTEMPTS; i += 1) {
      await db.webhookDelivery.update({
        where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) },
      })
      await sweep()
      row = await db.webhookDelivery.findFirstOrThrow({ where: { id: row.id } })
    }

    expect(row.attempts).toBe(MAX_ATTEMPTS)
    expect(row.status).toBe('failed')
    expect(received).toHaveLength(MAX_ATTEMPTS)

    // And a terminal row is not picked up again.
    await db.webhookDelivery.update({
      where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) },
    })
    expect(await sweep()).toMatchObject({ attempted: 0 })
  })

  it('does not send to a webhook that was switched off after the event was queued', async () => {
    const wh = await makeWebhook(['incident.created'])
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1' })
    await db.webhook.update({ where: { id: wh.id }, data: { active: false } })

    await sweep()
    expect(received).toHaveLength(0)
    const row = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: wh.id } })
    // Retired rather than left pending forever, and it says why.
    expect(row.status).toBe('failed')
    expect(row.lastError).toContain('disabled')
  })

  it('says so plainly when the signing secret cannot be read', async () => {
    /*
     * The realistic cause is WEBHOOK_SECRET_KEY_B64 having changed - a key rotation that
     * took the webhooks with it. A delivery that silently stopped happening would be the
     * worst possible way for anyone to discover that, so it is terminal and stated.
     */
    const wh = await makeWebhook(['incident.created'], { secretEnc: 'v1.aaaa.bbbb.cccc' })
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1' })
    const result = await sweep()
    expect(result).toMatchObject({ attempted: 0, delivered: 0, failed: 1 })

    expect(received).toHaveLength(0)
    const row = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: wh.id } })
    expect(row.status).toBe('failed')
    expect(row.lastError).toMatch(/could not be read/i)
    expect(row.lastError).toMatch(/recreate/i)
  })

  it('refuses to deliver to an address the guard blocks', async () => {
    /*
     * The waiver that lets these tests reach 127.0.0.1 does not extend to a URL that was
     * never a URL. Delivery to genuinely private addresses is covered by the unit tests on
     * webhookTarget, which is where that decision lives; here the point is that a bad
     * target fails the delivery rather than crashing the sweep.
     */
    const wh = await makeWebhook(['incident.created'], { url: 'not-a-url' })
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1' })
    const result = await sweep()

    expect(result.retrying + result.failed).toBe(1)
    const row = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: wh.id } })
    expect(row.lastError).toBeTruthy()
    expect(row.status).not.toBe('delivered')
  })

  it('sends the frozen payload on a retry, not what the record says now', async () => {
    respondWith = 500
    const wh = await makeWebhook(['incident.created'])
    await enqueueEvent(db, CO, 'incident.created', { id: 'i-1', title: 'As reported' })
    await sweep()

    respondWith = 200
    const row = await db.webhookDelivery.findFirstOrThrow({ where: { webhookId: wh.id } })
    await db.webhookDelivery.update({
      where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) },
    })
    await sweep()

    expect(received).toHaveLength(2)
    // Both attempts carry the event as it was, which is what makes this an event stream
    // rather than a polling loop that occasionally lies.
    for (const got of received) {
      expect(JSON.parse(got.body).data.title).toBe('As reported')
    }
  })
})
