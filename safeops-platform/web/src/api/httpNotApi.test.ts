import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './types'

/**
 * A successful reply that is not JSON is an error, not empty data.
 *
 * Without an API server (the offline demo), or with VITE_API_BASE_URL pointed at the web
 * app, every API path is answered by the web server's index.html with status 200. The
 * client used to turn that into `{}` and return it as the result, and six screens crashed
 * reading fields off it. Each now gets an ApiError and shows its own error state.
 */
let backend = false
vi.mock('./authApi', () => ({
  API_BASE_URL: '',
  SESSION_CHANGED: 'session_changed',
  getAccessToken: () => null,
  isBackendConfigured: () => backend,
  authApi: { refreshIfNeeded: async () => {} },
}))

const fetchMock = vi.fn()
beforeEach(() => {
  backend = false
  vi.unstubAllEnvs()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

const reply = (status: number, json: () => Promise<unknown>) => ({ ok: status < 400, status, json } as unknown as Response)
const html = () => reply(200, async () => { throw new SyntaxError("Unexpected token '<'") })

const { request, NOT_API } = await import('./http')

/** The error a call rejects with; fails the test if it resolves instead. */
const failure = (p: Promise<unknown>) => p.then(
  () => { throw new Error('expected the request to fail') },
  (e: ApiError) => e,
)

describe('request', () => {
  it('rejects a 200 that is not JSON, explaining the offline demo', async () => {
    fetchMock.mockResolvedValue(html())
    const err = await failure(request('/dashboard/overview'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe(NOT_API)
    expect(err.message).toMatch(/offline demo/)
  })

  it('points at a misconfigured API address when one is set', async () => {
    backend = true
    fetchMock.mockResolvedValue(html())
    const err = await failure(request('/dashboard/overview'))
    expect(err.code).toBe(NOT_API)
    expect(err.message).toMatch(/VITE_API_BASE_URL points at the SafeOps API/)
  })

  it('still returns JSON data, and still reads the server error message', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, async () => ({ rows: [1] })))
    expect(await request('/x')).toEqual({ rows: [1] })

    fetchMock.mockResolvedValueOnce(reply(403, async () => ({ error: 'forbidden', message: 'Not your site.' })))
    const err = await failure(request('/x'))
    expect([err.code, err.message]).toEqual(['forbidden', 'Not your site.'])
  })

  it('keeps a failure that is not JSON as a plain failure', async () => {
    fetchMock.mockResolvedValue(reply(502, async () => { throw new SyntaxError('bad gateway page') }))
    const err = await failure(request('/x'))
    expect([err.code, err.message]).toEqual(['request_failed', 'Something went wrong.'])
  })

  it('treats 204 as no content', async () => {
    fetchMock.mockResolvedValue(reply(204, async () => { throw new Error('no body') }))
    expect(await request('/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('sends nothing at all from the public demo build, which has no server to ask', async () => {
    // The Cloudflare demo answered every such request with index.html or a 405.
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true')
    const e = await failure(request('/platform/me'))
    expect(e.code).toBe(NOT_API)
    expect(e.message).toMatch(/online demo does not include/)
    expect(e.message).not.toMatch(/VITE_API_BASE_URL/)
    const w = await failure(request('/auth/refresh', { method: 'POST' }))
    expect(w.code).toBe(NOT_API)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
