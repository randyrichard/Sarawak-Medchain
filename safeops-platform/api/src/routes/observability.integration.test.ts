import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'

/**
 * Request ids and the Prometheus endpoint, over real HTTP against a REAL PostgreSQL database.
 *
 * What an operator relies on: every response carries an id that is also in the log line;
 * /metrics exists only with its token; and routes are counted by template, so a scrape
 * after a thousand incidents has one series for /incidents/:id, not a thousand.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const TOKEN = 'metrics-itest-token-not-a-real-one'
const db = new PrismaClient()
let server: Server
let base = ''

d('observability — integration (real Postgres, real HTTP)', () => {
  beforeAll(async () => {
    // env.ts reads METRICS_TOKEN once, at import, so the app is loaded fresh with it set.
    vi.resetModules()
    process.env.METRICS_TOKEN = TOKEN
    const { createApp } = await import('../app.js')
    const { resetMetrics } = await import('../lib/metrics.js')
    resetMetrics()
    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    await db.jobRun.upsert({
      where: { job: 'reminders' },
      create: { job: 'reminders', lastStartedAt: new Date(Date.now() - 65_000), lastFinishedAt: new Date(Date.now() - 60_000), lastOk: true, runCount: 1 },
      update: { lastStartedAt: new Date(Date.now() - 65_000), lastFinishedAt: new Date(Date.now() - 60_000), lastOk: true },
    })
  })

  afterAll(async () => {
    delete process.env.METRICS_TOKEN
    await new Promise<void>((r) => server.close(() => r()))
    await db.$disconnect()
  })

  it('gives every response a request id, keeping a well-formed one the proxy sent', async () => {
    const generated = await fetch(`${base}/health`)
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)

    const kept = await fetch(`${base}/health`, { headers: { 'X-Request-Id': 'caddy-req-12345678' } })
    expect(kept.headers.get('x-request-id')).toBe('caddy-req-12345678')

    // Anything that could break a log line or a header is replaced, not echoed.
    const replaced = await fetch(`${base}/health`, { headers: { 'X-Request-Id': 'bad id with spaces' } })
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('serves metrics only to a scraper holding the token', async () => {
    expect((await fetch(`${base}/metrics`)).status).toBe(401)
    expect((await fetch(`${base}/metrics`, { headers: { Authorization: 'Bearer wrong-token-of-some-length' } })).status).toBe(401)
    const ok = await fetch(`${base}/metrics`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toMatch(/^text\/plain/)
  })

  it('labels routes by template, never by the id in the path', async () => {
    for (const id of ['cmaaaaaaaaaaaaaaaaaaaaaaa', 'cmbbbbbbbbbbbbbbbbbbbbbbb']) {
      await fetch(`${base}/incidents/${id}`) // 401 without a session, still a counted request
    }
    await fetch(`${base}/no/such/route`)
    const text = await (await fetch(`${base}/metrics`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text()

    expect(text).toContain('safeops_http_requests_total{method="GET",route="unmatched",status="404"} 1')
    // Refused before reaching a route: counted under the router's prefix, ids still out.
    expect(text).toContain('safeops_http_requests_total{method="GET",route="/incidents/*",status="401"} 2')
    expect(text).not.toContain('cmaaaaaaaaaaaaaaaaaaaaaaa')
    expect(text).toMatch(/safeops_http_request_duration_seconds_count\{method="GET",route="\/health"\} 3/)
  })

  it('reports the database and the age of each background job', async () => {
    const text = await (await fetch(`${base}/metrics`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text()
    expect(text).toContain('safeops_up 1')
    expect(text).toContain('safeops_db_up 1')
    const age = Number(text.match(/safeops_job_last_success_age_seconds\{job="reminders"\} (\d+)/)?.[1])
    expect(age).toBeGreaterThanOrEqual(59)
    expect(age).toBeLessThan(600)
    expect(text).toContain('safeops_job_last_run_failed{job="reminders"} 0')
    expect(text).toMatch(/process_resident_memory_bytes \d+/)
  })
})

describe('metrics endpoint without a token configured', () => {
  it('does not exist', async () => {
    vi.resetModules()
    delete process.env.METRICS_TOKEN
    const { createApp } = await import('../app.js')
    const app = createApp()
    const s: Server = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)) })
    try {
      const port = (s.address() as { port: number }).port
      expect((await fetch(`http://127.0.0.1:${port}/metrics`)).status).toBe(404)
    } finally {
      await new Promise<void>((r) => s.close(() => r()))
    }
  })
})
