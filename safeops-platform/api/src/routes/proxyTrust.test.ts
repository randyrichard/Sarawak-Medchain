import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import express from 'express'

/**
 * Which address the API believes a request came from.
 *
 * `req.ip` is not cosmetic. It is the key the rate limiter buckets on, and it is written
 * into the audit trail and the login history — the security record a customer is actually
 * buying. When it is wrong, nothing fails: every visitor simply arrives as the same address,
 * one session's abuse throttles a whole company, and the log says the proxy did everything.
 *
 * The count was hardcoded to 1, correct for browser → Caddy → api and wrong the moment a CDN
 * or WAF adds a hop. These tests pin the behaviour to the setting rather than to a constant,
 * against a real Express app, because `trust proxy` semantics are easy to state incorrectly
 * from memory and this is the kind of thing nobody notices until an audit log is useless.
 */
function appWithHops(hops: number) {
  const app = express()
  app.set('trust proxy', hops)
  app.get('/whoami', (req, res) => res.json({ ip: req.ip }))
  return app
}

const servers: Server[] = []
const bases = new Map<number, string>()

beforeAll(async () => {
  for (const hops of [0, 1, 2]) {
    const app = appWithHops(hops)
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })
    servers.push(server)
    const addr = server.address()
    bases.set(hops, `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`)
  }
})

afterAll(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()))
})

/** The header a chain of proxies builds: leftmost is the original client. */
const CHAIN = '203.0.113.7, 172.16.0.9'

const ipSeenBy = async (hops: number, forwarded?: string) => {
  const res = await fetch(`${bases.get(hops)}/whoami`, {
    headers: forwarded ? { 'X-Forwarded-For': forwarded } : {},
  })
  return (await res.json() as { ip: string }).ip
}

describe('trust proxy — which IP the API records', () => {
  it('ignores the header entirely when nothing is trusted', async () => {
    /*
     * The safe default for a directly exposed process. A client can always send
     * X-Forwarded-For; believing it without a proxy in front means believing the client.
     */
    const ip = await ipSeenBy(0, CHAIN)
    expect(ip).toContain('127.0.0.1')
  })

  it('with one proxy, reads the hop the proxy recorded', async () => {
    // browser → Caddy → api. Caddy appends nothing of its own here, so the last entry in
    // the chain is what a single trusted hop yields.
    expect(await ipSeenBy(1, CHAIN)).toBe('172.16.0.9')
  })

  it('with two proxies, reaches the original client', async () => {
    /*
     * browser → Cloudflare → Caddy → api. This is the case the hardcoded 1 got wrong: the
     * visitor is two entries back, so a deployment that adds a CDN and does not raise this
     * records the CDN's address for every request in the audit trail.
     */
    expect(await ipSeenBy(2, CHAIN)).toBe('203.0.113.7')
  })

  it('distinguishes two visitors behind the same CDN', async () => {
    // The property the rate limiter depends on. If both resolve to the same address, one
    // person's traffic counts against everyone else's budget.
    const a = await ipSeenBy(2, '198.51.100.1, 172.16.0.9')
    const b = await ipSeenBy(2, '198.51.100.2, 172.16.0.9')
    expect(a).not.toBe(b)
  })

  it('collapses those same two visitors when the count is too low', async () => {
    /*
     * The failure this setting exists to prevent, asserted directly rather than described:
     * with one hop trusted behind two proxies, both visitors are recorded as the inner
     * proxy and become indistinguishable.
     */
    const a = await ipSeenBy(1, '198.51.100.1, 172.16.0.9')
    const b = await ipSeenBy(1, '198.51.100.2, 172.16.0.9')
    expect(a).toBe(b)
    expect(a).toBe('172.16.0.9')
  })

  it('falls back to the socket address when no header is sent', async () => {
    expect(await ipSeenBy(2)).toContain('127.0.0.1')
  })
})
