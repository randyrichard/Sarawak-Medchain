import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../app.js'

/**
 * What the router mount order must guarantee.
 *
 * The equipment router is mounted at '/' so its paths outrank /assets/:id, /permits/:id
 * and /incidents/:id. That is deliberate, and it is also dangerous: a root-mounted router
 * with `router.use(requireAuth)` runs that middleware against *every* request in the
 * application. It did, once — and put a login wall in front of /auth/login itself, so
 * nobody could sign in at all. These tests pin the two halves of the fix.
 *
 * No database needed: everything here is answered before a query is reached.
 */
let server: Server
let base = ''

beforeAll(async () => {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('router mount order', () => {
  it('leaves the unauthenticated endpoints reachable', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
  })

  it('does not put an auth wall in front of signing in', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-here' }),
    })
    const body = await res.json() as { error?: string; message?: string }

    // Rejecting the credentials is correct. Refusing to look at them is the regression:
    // 'unauthenticated' here means the request never reached the login handler.
    expect(body.error).not.toBe('unauthenticated')
    expect(body.message ?? '').not.toMatch(/sign in required/i)
  })

  it('still requires a token on the equipment routes themselves', async () => {
    for (const path of [
      '/assets/some-id/calibrations',
      '/assets/some-id/timeline',
      '/assets/some-id/work-orders',
      '/permits/some-id/equipment',
      '/incidents/some-id/equipment',
    ]) {
      const res = await fetch(`${base}${path}`)
      expect(res.status, `${path} must be behind auth`).toBe(401)
    }
  })

  it('requires a token on the equipment write routes too', async () => {
    for (const [method, path] of [
      ['POST', '/assets/some-id/calibrations'],
      ['POST', '/assets/some-id/work-orders'],
      ['PATCH', '/work-orders/some-id'],
      ['POST', '/permits/some-id/equipment'],
      ['POST', '/incidents/some-id/equipment'],
      ['DELETE', '/permits/equipment/some-id'],
      ['DELETE', '/incidents/equipment/some-id'],
    ] as const) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'DELETE' ? undefined : '{}',
      })
      expect(res.status, `${method} ${path} must be behind auth`).toBe(401)
    }
  })
})
