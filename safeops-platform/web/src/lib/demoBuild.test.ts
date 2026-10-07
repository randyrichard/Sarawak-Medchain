import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The public demo build (scripts/build-demo.mjs) and its Cloudflare config, held in place.
 *
 * The demo is the one build allowed to sign in without a server, so what it is built with
 * is worth pinning: no API address, its own password, and the same security headers as a
 * real deployment.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
const script = resolve(process.cwd(), 'scripts/build-demo.mjs')
const { DEMO_ENV, demoHeaders } = await import(/* @vite-ignore */ script) as {
  DEMO_ENV: Record<string, string>
  demoHeaders: (nginx: string) => string
}

describe('public demo build', () => {
  it('has no server, and says it is the demo', () => {
    expect(DEMO_ENV.VITE_API_BASE_URL).toBe('')
    expect(DEMO_ENV.VITE_OFFLINE_DEMO).toBe('true')
    expect(DEMO_ENV.VITE_DEMO_LOGINS).toBe('true')
  })

  it('never publishes the password the API seed gives the demo accounts', () => {
    expect(DEMO_ENV.VITE_DEMO_PASSWORD).toBeTruthy()
    // demoAccounts.ts holds the seed's password; the test fails if it ever moves.
    const seed = read('../api/src/lib/demoAccounts.ts')
    const seedPassword = seed.match(/DEMO_PASSWORD\s*=\s*'([^']+)'/)?.[1]
    expect(seedPassword).toBeTruthy()
    expect(DEMO_ENV.VITE_DEMO_PASSWORD).not.toBe(seedPassword)
  })

  it('sends the same security headers as nginx, connecting only to itself', () => {
    const headers = demoHeaders(read('nginx.conf.template'))
    expect(headers.startsWith('/*\n')).toBe(true)
    for (const h of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Referrer-Policy:', 'Permissions-Policy:']) {
      expect(headers).toContain(h)
    }
    const csp = headers.split('\n').find((l) => l.includes('Content-Security-Policy:'))!
    expect(csp).toContain("connect-src 'self';")
    expect(csp).toContain("frame-ancestors 'none'")
    // The inline theme script's hash comes from nginx, so the two cannot drift apart.
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/)
    expect(csp).not.toContain('${')
  })

  it('refuses to build if nginx stops sending a header it copies', () => {
    expect(() => demoHeaders('add_header X-Frame-Options "DENY" always;')).toThrow(/no X-Content-Type-Options/)
  })

  it('serves the built files as a single-page app on Cloudflare', () => {
    const cfg = JSON.parse(read('wrangler.jsonc').replace(/\/\*[\s\S]*?\*\//g, ''))
    expect(cfg.name).toBe('safeops-demo')
    expect(cfg.assets).toMatchObject({ directory: './dist', not_found_handling: 'single-page-application' })
    expect(cfg.main).toBeUndefined()
  })
})
