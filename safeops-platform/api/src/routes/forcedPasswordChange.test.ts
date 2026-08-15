import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../app.js'
import { signAccessToken } from '../lib/tokens.js'

/**
 * An account still carrying a password somebody else chose reaches nothing but the screen
 * that replaces it.
 *
 * This was enforced in the browser and nowhere else. The React app showed a forced-change
 * screen, and the API behind it answered every request as normal - so an administrator who
 * created a user with a temporary password, or whoever deployed SafeOps for a customer,
 * kept a working credential for that customer's incident and audit records for as long as
 * the person never got around to changing it. `curl` was the entire bypass.
 *
 * These tests run against the real app over HTTP because that is where the gap was: the
 * service layer was never the thing being trusted.
 *
 * No database needed - the gate answers before any query is reached.
 */
let server: Server
let base = ''

beforeAll(async () => {
  const app = createApp()
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  const addr = server.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function tokenFor(mustChangePassword: boolean): string {
  return signAccessToken({
    sub: 'user-1',
    email: 'someone@customer.example',
    name: 'Someone',
    roles: [{ companyId: 'big', role: 'admin', siteIds: [] }],
    mustChangePassword,
  }).token
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

/** res.json() is `unknown`; every body asserted here is an error envelope. */
const errorBody = (res: Response) => res.json() as Promise<{ error: string; message: string }>

describe('forced password change', () => {
  it('refuses the API to an account that has not chosen its own password', async () => {
    const token = tokenFor(true)

    // A spread of real routes rather than one: the gate lives in requireAuth precisely so
    // that no address escapes it, and a single sample would not show that.
    for (const path of [
      '/incidents?companyId=big&page=1&pageSize=5',
      '/org/sites?companyId=big',
      '/dashboard/overview?companyId=big',
      '/admin/users?companyId=big',
      '/audits?companyId=big&page=1&pageSize=5',
      '/reports?companyId=big',
      '/permits?companyId=big',
      '/platform/companies',
    ]) {
      const res = await fetch(`${base}${path}`, { headers: auth(token) })
      expect(res.status, `${path} should be refused`).toBe(403)
      expect((await errorBody(res)).error, path).toBe('password_change_required')
    }
  })

  it('names the reason rather than answering a bare forbidden', async () => {
    // "You may not do this" and "you must do something first" are different answers, and
    // sending somebody to a permissions error when the fix is a password change is how a
    // support call starts.
    const res = await fetch(`${base}/incidents?companyId=big`, { headers: auth(tokenFor(true)) })
    const body = await errorBody(res)
    expect(body.error).toBe('password_change_required')
    expect(body.message).toMatch(/password/i)
  })

  it('still lets the account ask who it is, or it can never reach the fix', async () => {
    /*
     * This was the bug in the first cut of the gate. Sign-in succeeded, the app called
     * /auth/me to establish the session, that call was refused, and the client reported a
     * failed login - so the account was locked out by the very rule meant to protect it,
     * with no route to the screen that would have cleared the flag.
     *
     * It returns the caller's own identity and their roles. Nothing belonging to a
     * customer passes through it.
     */
    const res = await fetch(`${base}/auth/me`, { headers: auth(tokenFor(true)) })
    expect(res.status).not.toBe(403)
  })

  it('still allows the one thing that clears it', async () => {
    // Not a 403: the change endpoint has to stay reachable or the account is bricked. It
    // fails later for its own reasons (no such user in this database-less test), which is
    // proof enough that the gate let it through.
    const res = await fetch(`${base}/account/password`, {
      method: 'POST',
      headers: { ...auth(tokenFor(true)), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'y' }),
    })
    expect(res.status).not.toBe(403)
  })

  it('does not let a lookalike path open the gate', async () => {
    /*
     * The allowlist matches the full path, not the router-relative one. Matching
     * '/password' alone would mean any router that happened to mount such a route became
     * an escape hatch - and the check runs inside routers where req.path is exactly that.
     */
    for (const path of ['/admin/password', '/auth/password', '/account/password/../users']) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { ...auth(tokenFor(true)), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect([403, 404], `${path} must not be treated as the change endpoint`).toContain(res.status)
    }
  })

  it('matches the allowlist on method, not path alone', async () => {
    // A POST to /auth/me, or a GET of the change endpoint, are not the calls that were
    // allowed. Widening by path would open more surface than intended.
    const wrongMethod = await fetch(`${base}/auth/me`, {
      method: 'POST',
      headers: { ...auth(tokenFor(true)), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect([403, 404]).toContain(wrongMethod.status)
  })

  it('leaves an ordinary account alone', async () => {
    // The gate must be invisible to everybody else: a 403 here would mean the flag's
    // default had inverted and locked every customer out of their own product.
    const res = await fetch(`${base}/incidents?companyId=big&page=1&pageSize=5`, {
      headers: auth(tokenFor(false)),
    })
    expect(res.status).not.toBe(403)
  })

  it('does not gate signing in, refreshing or signing out', async () => {
    // None of these carry a bearer token, so the gate must not reach them - an account in
    // this state still has to be able to authenticate and leave.
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' }),
    })
    expect(login.status).not.toBe(403)

    const logout = await fetch(`${base}/auth/logout`, { method: 'POST' })
    expect(logout.status).not.toBe(403)
  })
})
