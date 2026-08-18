import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createApp } from '../app.js'
import { signAccessToken } from '../lib/tokens.js'

/**
 * A malformed request is a 400, not a 500.
 *
 * Around twenty handlers validate with the throwing `parse` rather than `safeParse`, and
 * nothing in the error chain caught what it threw. `GET /dashboard/overview` with no
 * companyId - a request the browser can produce simply by having no company selected -
 * answered "Something went wrong" with a 500 in the access log and an "unhandled error"
 * line beside it. That tells a monitor the service is broken when the request was the
 * problem.
 *
 * No database needed: validation answers before any query.
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

const token = signAccessToken({
  sub: 'user-1',
  email: 'someone@customer.example',
  name: 'Someone',
  roles: [{ companyId: 'big', role: 'admin', siteIds: [] }],
  mustChangePassword: false,
}).token

const auth = { Authorization: `Bearer ${token}` }

describe('schema rejections', () => {
  it('answers 400 when a required query parameter is missing', async () => {
    const res = await fetch(`${base}/dashboard/overview`, { headers: auth })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('validation')
  })

  it('names the offending field without echoing what was sent', async () => {
    // Enough for the caller to fix it; never the value, which one day will be a password.
    const res = await fetch(`${base}/dashboard/overview?companyId=`, { headers: auth })
    const body = await res.json() as { message: string }
    expect(body.message).toMatch(/companyId/)
    expect(body.message).not.toMatch(/password|token/i)
  })

  it('does not turn a valid-looking request into a validation error', async () => {
    // The gate must only catch malformed input; a well-formed request continues to
    // whatever answers it (401/403/200 - anything but a 400 from this branch).
    const res = await fetch(`${base}/dashboard/overview?companyId=big`, { headers: auth })
    expect(res.status).not.toBe(400)
  })
})
