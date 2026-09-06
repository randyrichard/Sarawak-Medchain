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
 * This was configured as a hop count, and these tests used to pin that. The count was not
 * capable of expressing the rule that matters: it says how many X-Forwarded-For entries to
 * believe and never who was entitled to add them, so any non-zero value made Express treat
 * whoever opened the socket as a proxy. The old tests all supplied a well-formed proxy
 * chain, so none of them ever asked whether a client could simply invent one — which it
 * could. Reproduced against the running API: three requests differing only in an
 * X-Forwarded-For header produced three separate rate-limit buckets.
 *
 * The setting is now a list of peers allowed to speak for a client. The first block below
 * keeps the old behaviour on record, as the reason the second block exists.
 */
function appTrusting(trust: unknown) {
  const app = express()
  app.set('trust proxy', trust)
  app.get('/whoami', (req, res) => res.json({ ip: req.ip }))
  return app
}

const servers: Server[] = []
const bases = new Map<string, string>()

/** Real servers on real ports: `trust proxy` is easy to state incorrectly from memory. */
async function serve(label: string, trust: unknown) {
  const server = await new Promise<Server>((resolve) => {
    const s = appTrusting(trust).listen(0, '127.0.0.1', () => resolve(s))
  })
  servers.push(server)
  const addr = server.address()
  bases.set(label, `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`)
}

beforeAll(async () => {
  // The behaviour that shipped, kept only to demonstrate the hole.
  await serve('hops1', 1)
  // What ships now. Requests here arrive over loopback, so 'loopback' present means "the
  // peer is a trusted proxy" and absent means "the peer is just a client".
  await serve('trusted', ['loopback', 'linklocal', 'uniquelocal'])
  await serve('untrusted', ['10.99.99.99'])
  await serve('none', false)
})

afterAll(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()))
})

const ipSeenBy = async (label: string, forwarded?: string) => {
  const res = await fetch(`${bases.get(label)}/whoami`, {
    headers: forwarded ? { 'X-Forwarded-For': forwarded } : {},
  })
  return (await res.json() as { ip: string }).ip
}

describe('the hop count that was replaced', () => {
  it('let a direct client name its own address', async () => {
    // The vulnerability, asserted rather than described. Rotating this header is an
    // unlimited supply of fresh rate-limit budgets, and it chooses what the audit trail
    // records as the actor.
    expect(await ipSeenBy('hops1', '203.0.113.99')).toBe('203.0.113.99')
  })

  it('let that client keep changing it, so no bucket ever filled', async () => {
    const a = await ipSeenBy('hops1', '198.51.100.1')
    const b = await ipSeenBy('hops1', '198.51.100.2')
    expect(a).not.toBe(b)
  })
})

describe('trust proxy — an address list', () => {
  it('ignores a forged header from a peer that is not a listed proxy', async () => {
    const ip = await ipSeenBy('untrusted', '203.0.113.99')
    expect(ip).not.toBe('203.0.113.99')
    expect(ip).toContain('127.0.0.1')
  })

  it('gives a forging client the same bucket however it rewrites the header', async () => {
    // The property the rate limiter needs: an attacker cannot escape its own bucket.
    const a = await ipSeenBy('untrusted', '198.51.100.1')
    const b = await ipSeenBy('untrusted', '198.51.100.2')
    const c = await ipSeenBy('untrusted')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('ignores the header entirely when nothing is trusted', async () => {
    // The correct setting for a process reachable directly, with no proxy in front.
    expect(await ipSeenBy('none', '203.0.113.7, 172.16.0.9')).toContain('127.0.0.1')
  })

  it('still believes a genuine proxy that is on the list', async () => {
    // The other half of the job. Refusing every header would make every visitor arrive as
    // the proxy — one rate-limit bucket for a whole company, and an audit trail naming the
    // proxy for everything anybody did.
    expect(await ipSeenBy('trusted', '203.0.113.7')).toBe('203.0.113.7')
  })

  it('reaches the original client through a chain of trusted proxies', async () => {
    // browser -> Cloudflare -> Caddy -> api, where the inner hops are private addresses and
    // therefore on the list.
    expect(await ipSeenBy('trusted', '203.0.113.7, 172.16.0.9')).toBe('203.0.113.7')
  })

  it('distinguishes two visitors behind the same CDN', async () => {
    // What stops one person's traffic counting against everybody else's budget.
    const a = await ipSeenBy('trusted', '198.51.100.1, 172.16.0.9')
    const b = await ipSeenBy('trusted', '198.51.100.2, 172.16.0.9')
    expect(a).not.toBe(b)
  })

  it('ignores an address a client prepends to the chain', async () => {
    /*
     * A real visitor behind the real proxy, sending "1.2.3.4" ahead of everything to
     * pretend to be someone else.
     *
     * Express walks the chain from the right and stops at the first entry that is not
     * itself a trusted proxy: 172.16.0.9 is private and skipped, 203.0.113.7 is public and
     * is therefore the client. The invented 1.2.3.4 sits further left and is never reached.
     *
     * Worth stating as a test because the intuitive reading - "the leftmost entry is the
     * client" - is the insecure one, and it is what the assertion here originally said.
     */
    expect(await ipSeenBy('trusted', '1.2.3.4, 203.0.113.7, 172.16.0.9')).toBe('203.0.113.7')
  })

  it('falls back to the socket address when no header is sent', async () => {
    expect(await ipSeenBy('trusted')).toContain('127.0.0.1')
  })
})

/*
 * The gap the address list could not close, and the token that does.
 *
 * Behind Docker every connection through a published port is source-NATed to the bridge
 * gateway - a private address - so `uniquelocal` trusts it and a direct caller is
 * indistinguishable from the real proxy. Confirmed against the running API: after the list
 * was in place, three requests differing only in a forged X-Forwarded-For still produced
 * three separate rate-limit buckets.
 *
 * These run against an app shaped like the real one: the peer IS trusted by address, which
 * is exactly the situation the token has to survive.
 */
const TOKEN = 'test-proxy-token-long-enough'

function appWithToken() {
  const app = express()
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])
  app.use((req, _res, next) => {
    if (req.get('x-safeops-proxy') !== TOKEN) delete req.headers['x-forwarded-for']
    delete req.headers['x-safeops-proxy']
    next()
  })
  app.get('/whoami', (req, res) => res.json({ ip: req.ip, leaked: req.get('x-safeops-proxy') ?? null }))
  return app
}

describe('proxy token — for peers a trusted address cannot vouch for', () => {
  let base: string

  beforeAll(async () => {
    const server = await new Promise<Server>((resolve) => {
      const srv = appWithToken().listen(0, '127.0.0.1', () => resolve(srv))
    })
    servers.push(server)
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  const ask = async (headers: Record<string, string>) =>
    await (await fetch(`${base}/whoami`, { headers })).json() as { ip: string; leaked: string | null }

  it('discards a forged header from a caller without the token', async () => {
    // The exploit. Trusted by address, and still not believed.
    const res = await ask({ 'X-Forwarded-For': '203.0.113.99' })
    expect(res.ip).not.toBe('203.0.113.99')
    expect(res.ip).toContain('127.0.0.1')
  })

  it('gives that caller one bucket however it rewrites the header', async () => {
    const a = await ask({ 'X-Forwarded-For': '198.51.100.1' })
    const b = await ask({ 'X-Forwarded-For': '198.51.100.2' })
    expect(a.ip).toBe(b.ip)
  })

  it('believes the header when the token is presented', async () => {
    const res = await ask({ 'X-Forwarded-For': '203.0.113.7', 'X-SafeOps-Proxy': TOKEN })
    expect(res.ip).toBe('203.0.113.7')
  })

  it('rejects a wrong token rather than any token', async () => {
    const res = await ask({ 'X-Forwarded-For': '203.0.113.7', 'X-SafeOps-Proxy': 'not-the-token' })
    expect(res.ip).not.toBe('203.0.113.7')
  })

  it('never passes the token itself further into the app', async () => {
    // It is a credential; nothing downstream should be able to read it, log it, or forward
    // it onward.
    const res = await ask({ 'X-SafeOps-Proxy': TOKEN })
    expect(res.leaked).toBeNull()
  })
})
