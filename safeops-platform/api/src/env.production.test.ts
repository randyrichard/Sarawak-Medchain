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

/** A minimally valid production environment, with one value swapped per test. */
function bootWith(overrides: Record<string, string>) {
  const r = spawnSync('npx', ['tsx', server], {
    env: {
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
      ...overrides,
    },
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
})
