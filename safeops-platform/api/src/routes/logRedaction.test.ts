import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Server } from 'node:http'
import { createApp, redactPath } from '../app.js'

/**
 * Single-use credentials must not appear in the request log.
 *
 * Invitation and password-reset links carry their token as a path segment, and the logger
 * previously wrote the path verbatim. The log is the one artefact that routinely leaves
 * the database's blast radius: retained on disk, shipped to an aggregator, pasted into a
 * support ticket. Anybody who could read it could redeem an unused invitation before its
 * recipient - taking over the account, including the first administrator of a new customer
 * - or redeem a reset link for any account that had requested one.
 *
 * Asserted at both levels: the pure function, and the real app over HTTP, because the leak
 * was in the wiring rather than in any single function.
 */

describe('redactPath', () => {
  it('removes an invitation token but keeps the route recognisable', () => {
    expect(redactPath('/invitations/0aFtZVDTvaynTYFflLu2rQ4sPdhA8dTczSJBauRrcs4'))
      .toBe('/invitations/:token')
  })

  it('removes the token from the accept sub-path too', () => {
    // The POST that actually spends the credential - the one that matters most.
    expect(redactPath('/invitations/0aFtZVDTvayn-TOKEN_x/accept'))
      .toBe('/invitations/:token/accept')
  })

  it('removes a password-reset token', () => {
    expect(redactPath('/auth/reset-password/abc123-XYZ_secret'))
      .toBe('/auth/reset-password/:token')
  })

  it('leaves ordinary paths untouched', () => {
    // Over-redacting would blind the operations log, which is the reason it exists.
    for (const p of ['/incidents', '/health', '/platform/companies/acme', '/admin/users']) {
      expect(redactPath(p)).toBe(p)
    }
  })

  it('does not redact a lookalike further down a path', () => {
    // Only anchored matches: these are not credential-bearing routes.
    expect(redactPath('/admin/invitations/abc')).toBe('/admin/invitations/abc')
  })
})

describe('the request log itself', () => {
  let server: Server
  let base = ''
  const lines: string[] = []

  beforeAll(async () => {
    // Captured before the app is built, so the logger closure writes into this spy.
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    const app = createApp()
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('never writes a token handed to it in a URL', async () => {
    const invite = 'CANARY-INVITE-9f3a2b'
    const reset = 'CANARY-RESET-7c1d4e'

    await fetch(`${base}/invitations/${invite}`).catch(() => {})
    await fetch(`${base}/invitations/${invite}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'irrelevant' }),
    }).catch(() => {})
    await fetch(`${base}/auth/reset-password/${reset}`).catch(() => {})

    await new Promise((r) => { setTimeout(r, 150) })

    const all = lines.join('\n')
    expect(all, 'an invitation token reached the log').not.toContain(invite)
    expect(all, 'a reset token reached the log').not.toContain(reset)
    // The requests were logged - this is proving redaction, not silence.
    expect(all).toContain('/invitations/:token')
    expect(all).toContain('/auth/reset-password/:token')
  })
})
