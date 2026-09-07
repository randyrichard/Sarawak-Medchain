import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Server } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { utcDay } from '../lib/apiUsage.js'

/**
 * The integration API, over real HTTP against a real database.
 *
 * The console has advertised `curl .../v1/incidents -H "Authorization: Bearer sk_live_..."`
 * since it shipped, and until now every key ever issued authenticated nothing: `requireAuth`
 * accepts a signed session JWT and there was no other door. So what is tested here is
 * mostly the properties that make a bearer token safe to hand to somebody else's system.
 *
 * The one that matters most is tenant isolation. A key names no workspace - it *is* a
 * workspace - and there must be no parameter, body field or path that lets one reach
 * another's records.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()

const CO = 'v1-itest-co'
const OTHER = 'v1-itest-other'
const SITE = 'v1-itest-site'
const OTHER_SITE = 'v1-itest-other-site'

let server: Server
let base = ''

/** Issues a key the way `createApiKey` does, and hands back the secret to present. */
async function issueKey(companyId: string, scopes: string[], name = 'Test key') {
  const secret = `sk_live_${randomBytes(24).toString('base64url')}`
  const key = await db.apiKey.create({
    data: {
      companyId,
      name,
      prefix: secret.slice(0, 12),
      tokenHash: createHash('sha256').update(secret).digest('hex'),
      scopes,
      createdBy: 'vitest',
    },
  })
  return { id: key.id, secret }
}

const call = (path: string, secret?: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      ...(init.headers ?? {}),
    },
  })

/** `res.json()` is `unknown` under this config; every use here is an assertion anyway. */
const body = async (res: Response): Promise<any> => res.json()

const NEW_INCIDENT = {
  siteId: SITE,
  title: 'Guard removed from press brake',
  type: 'unsafe_condition',
  severity: 'Serious',
  location: 'Bay 4',
  occurredAt: '2026-09-01T02:00:00.000Z',
}

d('The /v1 integration API (real Postgres, real HTTP)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'V1 ITest Co'], [OTHER, 'V1 ITest Other']]) {
      await db.company.upsert({ where: { id }, update: { status: 'active' }, create: { id, name } })
    }
    for (const [id, companyId, name] of [
      [SITE, CO, 'V1 Site'], [OTHER_SITE, OTHER, 'V1 Other Site'],
    ]) {
      await db.site.upsert({ where: { id }, update: {}, create: { id, companyId, name } })
    }

    const app = createApp()
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await db.incident.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
    await db.apiUsageDay.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
    await db.apiKey.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
    await db.site.deleteMany({ where: { id: { in: [SITE, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.incident.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
    await db.apiUsageDay.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
    await db.apiKey.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
    await db.company.updateMany({ where: { id: CO }, data: { status: 'active' } })
  })

  // ── Authentication ─────────────────────────────────────────────────────────

  it('refuses a request with no key', async () => {
    const res = await call('/v1/incidents')
    expect(res.status).toBe(401)
    expect((await body(res)).error).toBe('unauthenticated')
  })

  it('refuses a key that was never issued, and one that is merely well-shaped', async () => {
    for (const bogus of ['nonsense', 'sk_live_totally-made-up-value-here', 'Bearer', 'sk_test_x']) {
      const res = await call('/v1/incidents', bogus)
      expect(res.status, bogus).toBe(401)
    }
  })

  it('refuses a revoked key', async () => {
    const key = await issueKey(CO, ['view'])
    expect((await call('/v1/incidents', key.secret)).status).toBe(200)

    await db.apiKey.update({ where: { id: key.id }, data: { revoked: true, revokedAt: new Date() } })
    expect((await call('/v1/incidents', key.secret)).status).toBe(401)
  })

  it('tells a valid key that its workspace is suspended, rather than that it is invalid', async () => {
    /*
     * The one failure worth distinguishing. Suspending a customer must close the
     * programmatic door as well as the browser one - otherwise the platform console's
     * suspend button is decorative - but leaving the integrator to debug a key that is in
     * fact correct is a support call containing no information.
     */
    const key = await issueKey(CO, ['view'])
    await db.company.update({ where: { id: CO }, data: { status: 'suspended' } })

    const res = await call('/v1/incidents', key.secret)
    expect(res.status).toBe(403)
    expect((await body(res)).error).toBe('workspace_suspended')
  })

  it('does not accept a session token, and /v1 is the only thing a key opens', async () => {
    // The two credentials are deliberately disjoint. A key presented to the application's
    // own routes must be as useless as a session token presented here.
    const key = await issueKey(CO, ['view'])
    const res = await call(`/incidents?companyId=${CO}`, key.secret)
    expect(res.status).toBe(401)
  })

  // ── Scopes ─────────────────────────────────────────────────────────────────

  it('refuses a write to a read-only key', async () => {
    const key = await issueKey(CO, ['view'])
    const res = await call('/v1/incidents', key.secret, {
      method: 'POST', body: JSON.stringify(NEW_INCIDENT),
    })
    expect(res.status).toBe(403)
    const refusal = await body(res)
    expect(refusal.error).toBe('insufficient_scope')
    expect(refusal.message).toContain('create')
    expect(await db.incident.count({ where: { companyId: CO } })).toBe(0)
  })

  it('refuses a read to a key holding only create', async () => {
    const key = await issueKey(CO, ['create'])
    expect((await call('/v1/incidents', key.secret)).status).toBe(403)
  })

  it('allows what the key was actually issued for', async () => {
    const key = await issueKey(CO, ['view', 'create'])
    expect((await call('/v1/incidents', key.secret)).status).toBe(200)

    const res = await call('/v1/incidents', key.secret, {
      method: 'POST', body: JSON.stringify(NEW_INCIDENT),
    })
    expect(res.status).toBe(201)
    const created = await body(res)
    expect(created.number).toMatch(/^INC-/)
    expect(created.companyId).toBe(CO)
    expect(created.reporter).toContain('API key')
  })

  // ── Tenancy ────────────────────────────────────────────────────────────────

  it('will not be pointed at another workspace by a query parameter', async () => {
    const key = await issueKey(CO, ['view'])
    const res = await call(`/v1/incidents?companyId=${OTHER}`, key.secret)
    expect(res.status).toBe(400)
    expect((await body(res)).message).toContain('companyId')
  })

  it('will not be pointed at another workspace by a body field', async () => {
    const key = await issueKey(CO, ['create'])
    const res = await call('/v1/incidents', key.secret, {
      method: 'POST',
      body: JSON.stringify({ ...NEW_INCIDENT, companyId: OTHER, siteId: OTHER_SITE }),
    })
    expect(res.status).toBe(400)
    expect(await db.incident.count({ where: { companyId: OTHER } })).toBe(0)
  })

  it('cannot read another workspace’s incident by id', async () => {
    // The path a parameter check cannot help with: a real id, guessed or leaked, on an
    // endpoint that takes no company at all. The service's own membership scoping answers.
    const mine = await issueKey(CO, ['view', 'create'])
    const theirs = await issueKey(OTHER, ['view', 'create'])

    const created = await body(await call('/v1/incidents', theirs.secret, {
      method: 'POST', body: JSON.stringify({ ...NEW_INCIDENT, siteId: OTHER_SITE }),
    }))
    expect(created.id).toBeTruthy()

    const res = await call(`/v1/incidents/${created.id}`, mine.secret)
    expect(res.status).toBe(404)
  })

  it('lists only its own workspace', async () => {
    const mine = await issueKey(CO, ['view', 'create'])
    const theirs = await issueKey(OTHER, ['create'])

    await call('/v1/incidents', mine.secret, {
      method: 'POST', body: JSON.stringify({ ...NEW_INCIDENT, title: 'Mine' }),
    })
    await call('/v1/incidents', theirs.secret, {
      method: 'POST', body: JSON.stringify({ ...NEW_INCIDENT, siteId: OTHER_SITE, title: 'Theirs' }),
    })

    const listed = await body(await call('/v1/incidents', mine.secret))
    expect(listed.rows.map((r: { title: string }) => r.title)).toEqual(['Mine'])
  })

  // ── What a key may see ─────────────────────────────────────────────────────

  it('withholds the reporter on an anonymous report', async () => {
    /*
     * Why a key acts as `ceo` and not `admin`. Anonymity is a promise made to the person
     * reporting that their name stays inside the HSE function. A bearer token in another
     * system's configuration is not the HSE function, and it must not be the thing that
     * quietly breaks that promise.
     */
    const key = await issueKey(CO, ['view', 'create'])
    await call('/v1/incidents', key.secret, {
      method: 'POST', body: JSON.stringify({ ...NEW_INCIDENT, anonymous: true }),
    })

    const listed = await body(await call('/v1/incidents', key.secret))
    expect(listed.rows).toHaveLength(1)
    expect(listed.rows[0].reporter).toBe('Reported anonymously')
    expect(listed.rows[0].reporterId).toBeNull()
  })

  it('serves the other read endpoints it documents', async () => {
    const key = await issueKey(CO, ['view'])
    for (const path of ['/v1/actions', '/v1/assets', '/v1/audits', '/v1/training/matrix']) {
      expect((await call(path, key.secret)).status, path).toBe(200)
    }
  })

  it('verifies a certificate that does not exist without pretending it does', async () => {
    const key = await issueKey(CO, ['view'])
    const res = await call('/v1/certificates/CERT-9999-9999/verify', key.secret)
    expect(res.status).toBe(200)
    expect((await body(res)).valid).toBe(false)
  })

  // ── Metering ───────────────────────────────────────────────────────────────

  it('counts what it served, and what it refused', async () => {
    const key = await issueKey(CO, ['view'])
    await call('/v1/incidents', key.secret)
    await call('/v1/incidents', key.secret)

    const row = await db.apiUsageDay.findUniqueOrThrow({
      where: { apiKeyId_day: { apiKeyId: key.id, day: utcDay() } },
    })
    expect(row.calls).toBe(2)
    expect(row.companyId).toBe(CO)

    /*
     * A scope refusal counts as both: an error, because it is one, and a call, because the
     * API served the request by refusing it. Counting only the error gives a workspace
     * whose whole traffic is refusals two errors out of zero calls, and an error rate that
     * is either a division by zero or a reassuring 0%.
     */
    await call('/v1/incidents', key.secret, { method: 'POST', body: JSON.stringify(NEW_INCIDENT) })
    const after = await db.apiUsageDay.findUniqueOrThrow({
      where: { apiKeyId_day: { apiKeyId: key.id, day: utcDay() } },
    })
    expect(after.calls).toBe(3)
    expect(after.errors).toBe(1)
  })

  it('marks the key as used', async () => {
    const key = await issueKey(CO, ['view'])
    expect((await db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).lastUsedAt).toBeNull()

    await call('/v1/incidents', key.secret)
    expect((await db.apiKey.findUniqueOrThrow({ where: { id: key.id } })).lastUsedAt)
      .toBeInstanceOf(Date)
  })

  it('does not count a request it never authenticated', async () => {
    // An unknown key has no row to charge, and inventing one would let anyone create
    // usage rows by guessing.
    await call('/v1/incidents', 'sk_live_never-issued')
    expect(await db.apiUsageDay.count({ where: { companyId: CO } })).toBe(0)
  })
})
