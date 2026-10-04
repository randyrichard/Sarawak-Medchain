import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './types'

/**
 * Reads ride out a flaky connection; writes are never repeated blindly.
 *
 * On localhost a request never fails half-way. On a site's wifi, or a phone at the edge of
 * coverage, one dropped packet used to turn a whole screen into an error.
 */
vi.mock('./authApi', () => ({
  API_BASE_URL: '',
  SESSION_CHANGED: 'session_changed',
  getAccessToken: () => null,
  isBackendConfigured: () => true,
  authApi: { refreshIfNeeded: async () => {} },
}))

const fetchMock = vi.fn()
const { request, READ_RETRY_DELAYS_MS } = await import('./http')
READ_RETRY_DELAYS_MS.splice(0, READ_RETRY_DELAYS_MS.length, 0, 0) // same number of retries, no waiting

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as unknown as Response)
const status = (s: number) => ({ ok: false, status: s, json: async () => { throw new SyntaxError('html') } } as unknown as Response)
const dropped = () => Promise.reject(new TypeError('Failed to fetch'))
const failure = (p: Promise<unknown>) => p.then(() => { throw new Error('expected failure') }, (e: ApiError) => e)

describe('request on a flaky connection', () => {
  it('retries a read that got no answer, and returns the data', async () => {
    fetchMock.mockImplementationOnce(dropped).mockImplementationOnce(dropped).mockResolvedValueOnce(ok({ rows: [1] }))
    expect(await request('/incidents')).toEqual({ rows: [1] })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries a read through a gateway error while the API restarts', async () => {
    fetchMock.mockResolvedValueOnce(status(502)).mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok({ up: true }))
    expect(await request('/dashboard/overview')).toEqual({ up: true })
  })

  it('gives up after two retries and says it is a network failure', async () => {
    fetchMock.mockImplementation(dropped)
    const err = await failure(request('/incidents'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports a gateway error that does not clear', async () => {
    fetchMock.mockResolvedValue(status(504))
    const err = await failure(request('/incidents'))
    expect(err.code).toBe('request_failed')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('never repeats a write: it may have been done', async () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      fetchMock.mockReset()
      fetchMock.mockImplementation(dropped)
      expect((await failure(request('/permits', { method, body: '{}' }))).code).toBe('network')
      expect(fetchMock).toHaveBeenCalledTimes(1)

      fetchMock.mockReset()
      fetchMock.mockResolvedValue(status(502))
      await failure(request('/permits', { method, body: '{}' }))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('does not retry an answer, even a refusal', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom', message: 'Broke.' }) } as unknown as Response)
    expect((await failure(request('/incidents'))).message).toBe('Broke.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a read the caller cancelled', async () => {
    const ctl = new AbortController()
    ctl.abort()
    fetchMock.mockImplementation(() => Promise.reject(new DOMException('aborted', 'AbortError')))
    await failure(request('/incidents', { signal: ctl.signal }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
