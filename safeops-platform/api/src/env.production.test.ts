import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * What a production deployment is not allowed to be misconfigured as.
 *
 * These are boot-time refusals, asserted by actually starting the process, because a unit
 * test of a copy of the condition would keep passing after somebody moved the real one.
 * Each of them fails loudly at start rather than surfacing later as a support call - the
 * whole point being that a misconfiguration you discover from a customer is one you
 * discovered too late.
 *
 * No database is reached: every check here runs before the first query.
 */
const server = resolve(process.cwd(), 'src/server.ts')

/**
 * A minimally valid production environment, with one value swapped per test.
 *
 * An override of `undefined` removes the variable instead of setting it to an empty string.
 * The two are genuinely different — an empty value is a malformed setting the schema
 * rejects, an absent one is the deployment simply not having configured it — and only the
 * second is what "somebody forgot this" looks like.
 */
function bootWith(overrides: Record<string, string | undefined>) {
  const env: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'production',
      // A real port: the schema rejects 0, and that rejection fires before the checks
      // under test, so an invalid one here silently tests the wrong thing. Nothing ever
      // binds it - every case below exits during validation.
      PORT: '4399',
      SCHEDULER_ENABLED: 'false',
      // Not example.com: that is a reserved documentation domain and the production
      // guards now refuse it, so a fixture using one would trip a different check than
      // the one under test.
      CORS_ORIGINS: 'https://app.safeops-pilot.my',
      APP_PUBLIC_URL: 'https://app.safeops-pilot.my',
      // Production refuses to trust forwarded headers with no way to authenticate the
      // proxy, and that check runs before most of the ones below. Without a valid value
      // here every test in this file would assert against that message instead of the
      // guard it is actually about — which is exactly what happened when the check was
      // added. The guard itself is exercised in its own test at the end.
      PROXY_TOKEN: 'fixture-proxy-token-long-enough-to-pass',
      /*
       * The suite sets this to 'true' for itself - webhook delivery to 127.0.0.1 is the
       * only way to test a signature end to end - and `...process.env` above carries it
       * into the spawned process. Production refuses to start with it set, and that check
       * runs before most of the ones below, so without this every test in this file would
       * assert against the SSRF message instead of the guard it is about. Same shape as
       * the PROXY_TOKEN note above; the guard itself has its own test at the end.
       */
      WEBHOOK_ALLOW_PRIVATE_TARGETS: 'false',
      ...overrides,
  }
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k]

  const r = spawnSync('npx', ['tsx', server], {
    env: env as NodeJS.ProcessEnv,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 25_000,
  })
  return { status: r.status, said: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/*
 * A longer per-test timeout than vitest's 5s default, because every test in this file
 * spawns `npx tsx` and waits for a real process.
 *
 * Idle, each takes about 3 seconds. Under load - a Docker build alongside, or the other
 * 36 suites running in parallel - a cold TypeScript start comfortably doubles that and
 * crosses 5s, so the harness killed tests that would have passed. Observed as roughly one
 * failure in three full-suite runs, which is exactly the kind of intermittently red
 * pipeline that teaches people to ignore CI.
 *
 * This changes no assertion. It only stops the runner giving up before the process does.
 */
const SPAWN_TIMEOUT = 30_000

describe('production environment guards', { timeout: SPAWN_TIMEOUT }, () => {
  it('refuses to trust forwarded headers with no way to authenticate the proxy', () => {
    /*
     * req.ip is the rate limiter's bucket key and the address written into the audit trail.
     * Trusting X-Forwarded-For without being able to tell the proxy from a client means
     * both follow whatever the caller wrote.
     *
     * An address list is not enough on its own behind Docker: published ports are
     * source-NATed to the bridge gateway, a private address the list accepts, so a direct
     * caller is indistinguishable from Caddy. Measured before this guard existed — forged
     * headers produced separate rate-limit buckets on a direct connection.
     */
    const r = bootWith({ PROXY_TOKEN: undefined })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/PROXY_TOKEN/)
    expect(r.said).toMatch(/rate-limit bucket|audit trail/i)
  })

  it('starts when header trust is switched off instead', () => {
    // The other valid answer: no proxy in front, so no forwarded header is believed. Every
    // visitor is then attributed to the address they actually connected from.
    const r = bootWith({ PROXY_TOKEN: undefined, TRUST_PROXY: 'false' })
    expect(r.said).not.toMatch(/PROXY_TOKEN is not set/)
  })

  it('refuses a token too short to be worth having', () => {
    // An empty or token-shaped-but-trivial value would otherwise look configured while
    // being guessable, which is worse than not setting it — that at least fails loudly.
    const r = bootWith({ PROXY_TOKEN: 'short' })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/PROXY_TOKEN/)
  })

  it('refuses an APP_PUBLIC_URL that is not https', () => {
    /*
     * Every link built from this carries a single-use credential in the URL - the
     * invitation that creates an account, and the reset link that takes one over. Over
     * plaintext the token is readable in transit and it is all an attacker needs.
     *
     * TLS terminates upstream, so the process cannot detect the scheme itself: this value
     * is the only place the deployment declares it.
     */
    const r = bootWith({ APP_PUBLIC_URL: 'http://app.example.com' })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/not https/i)
    expect(r.said).toMatch(/credential/i)
  })

  it('refuses a localhost APP_PUBLIC_URL', () => {
    // A link nobody outside the machine can open looks like it worked to whoever sent it.
    const r = bootWith({ APP_PUBLIC_URL: 'https://localhost:8080' })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/nobody outside this machine/i)
  })

  it('refuses to start with an empty APP_PUBLIC_URL', () => {
    /*
     * Caught by the schema's url() rather than by the production branch below it, so the
     * wording differs from the missing-value case - what matters is that it refuses and
     * names the setting. Asserting the exact custom message here would have been asserting
     * a path this input never reaches.
     */
    const r = bootWith({ APP_PUBLIC_URL: '' })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/APP_PUBLIC_URL/)
  })

  it('refuses a reserved documentation domain', () => {
    /*
     * example.com and friends are reserved by RFC 2606 so they can never belong to anyone.
     * A production deployment on one is `.env.prod.example` that nobody filled in, and the
     * failure it produces is invitations pointing somewhere the customer cannot reach -
     * discovered when they say nothing arrived.
     */
    const r = bootWith({ APP_PUBLIC_URL: 'https://safeops.example.com' })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/reserved documentation domain/i)
  })

  it('checks CORS origins for the same thing', () => {
    const r = bootWith({ CORS_ORIGINS: 'https://app.example.org' })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/reserved documentation domain/i)
  })

  it('still allows a localhost CORS origin so the stack can be verified locally', () => {
    /*
     * Deliberate. Running the production stack on this machine is how the deployment gets
     * exercised before a customer sees it; refusing localhost here would remove that
     * check rather than add one. APP_PUBLIC_URL rejects localhost separately, which is
     * where it actually matters.
     */
    const r = bootWith({ CORS_ORIGINS: 'http://localhost:8080' })
    expect(r.said).not.toMatch(/reserved documentation domain/i)
  })

  it('names the offending value so the fix is obvious', () => {
    // An error that does not say which value was wrong sends somebody reading every line
    // of their compose file.
    const r = bootWith({ APP_PUBLIC_URL: 'http://app.safeops-pilot.my' })
    expect(r.said).toContain('http://app.safeops-pilot.my')
  })

  // ── Database transport ────────────────────────────────────────────────────
  /*
   * The bundled deployment runs PostgreSQL as a container on a private compose network with
   * no published port, so plaintext there never leaves the host. A managed database is the
   * opposite — the connection crosses a real network, and so does every row of this product.
   *
   * The rule keys on the host rather than on a flag, because the dangerous case is exactly
   * the one an operator reaches by repointing DATABASE_URL at a provider and not thinking
   * about the query string.
   */
  const MANAGED = 'db-postgresql-sgp1-12345.b.db.ondigitalocean.com:25060/safeops'

  it('refuses a remote database reached without TLS', () => {
    const r = bootWith({ DATABASE_URL: `postgresql://doadmin:pw@${MANAGED}` })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/does not\s*\n?\s*require TLS/i)
    // It has to say which host, or the operator is guessing at their own config.
    expect(r.said).toContain('db-postgresql-sgp1-12345.b.db.ondigitalocean.com')
  })

  it('refuses sslmode=disable, which is worse than omitting it', () => {
    // Explicitly turning encryption off reads as deliberate and is almost never meant.
    const r = bootWith({ DATABASE_URL: `postgresql://doadmin:pw@${MANAGED}?sslmode=disable` })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/require TLS/i)
  })

  it('refuses sslmode=allow, which does not guarantee encryption', () => {
    // "allow" means the client will try plaintext first and only upgrade if the server
    // insists — so a misconfigured server silently gets an unencrypted session.
    const r = bootWith({ DATABASE_URL: `postgresql://doadmin:pw@${MANAGED}?sslmode=allow` })
    expect(r.status).toBe(1)
    expect(r.said).toMatch(/require TLS/i)
  })

  it('accepts a remote database with sslmode=require', () => {
    const r = bootWith({ DATABASE_URL: `postgresql://doadmin:pw@${MANAGED}?sslmode=require` })
    expect(r.said).not.toMatch(/require TLS/i)
  })

  it('accepts verify-full, which is stronger still', () => {
    const r = bootWith({ DATABASE_URL: `postgresql://doadmin:pw@${MANAGED}?sslmode=verify-full` })
    expect(r.said).not.toMatch(/require TLS/i)
  })

  it('leaves the bundled compose database alone', () => {
    /*
     * The check must not fire on the deployment almost everyone runs. `db` is the service
     * name inside the compose network; the connection never leaves the host, and demanding
     * TLS there would be ceremony that costs an operator an evening.
     */
    for (const host of ['db', 'localhost', '127.0.0.1']) {
      const r = bootWith({ DATABASE_URL: `postgresql://safeops:pw@${host}:5432/safeops?schema=public` })
      expect(r.said).not.toMatch(/require TLS/i)
    }
  })

  it('leaves a Unix socket connection alone', () => {
    /*
     * `?host=/var/run/postgresql` is how Prisma spells a Unix socket, and the hostname slot
     * then holds a placeholder that parses as an ordinary remote host. The first version of
     * this guard refused it — a socket never crosses a network, so demanding TLS on one is
     * both meaningless and a new way to break a working deployment.
     */
    const r = bootWith({ DATABASE_URL: 'postgres://socket/safeops?host=/var/run/postgresql' })
    expect(r.said).not.toMatch(/require TLS/i)
  })

  it('refuses to start with webhook delivery to private addresses enabled', () => {
    /*
     * The waiver exists so integration tests can deliver to a server on 127.0.0.1. A
     * production process running with it on would let any administrator of any tenant
     * point a webhook at the database container beside it, an internal tool, or the cloud
     * metadata endpoint that hands out this deployment's credentials - which is the
     * server-side request forgery primitive webhookTarget.ts exists to prevent.
     *
     * Refused at boot rather than defended in depth, because the failure it would
     * otherwise cause is completely silent: everything works, and one tenant can read the
     * inside of the network.
     */
    const r = bootWith({ WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true' })
    expect(r.status).not.toBe(0)
    expect(r.said).toMatch(/WEBHOOK_ALLOW_PRIVATE_TARGETS must not be set in production/i)
    expect(r.said).toMatch(/server-side request forgery/i)
  })

  it('starts normally when the waiver is simply absent', () => {
    // The default. Nothing about webhooks requires configuration to be safe.
    const r = bootWith({ WEBHOOK_ALLOW_PRIVATE_TARGETS: undefined })
    expect(r.said).not.toMatch(/WEBHOOK_ALLOW_PRIVATE_TARGETS/i)
  })

  it('does not reject a connection string it cannot parse', () => {
    // Prisma accepts forms the URL constructor does not. A genuinely malformed string fails
    // at the first query with a better message than anything guessed here, and refusing to
    // boot on a parse failure would be a second way to break a working deployment.
    const r = bootWith({ DATABASE_URL: 'not even close to a url' })
    expect(r.said).not.toMatch(/require TLS/i)
  })
})
