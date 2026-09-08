import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError } from './types'

/**
 * What the HTTP client does when the refresh it makes comes back for somebody else.
 *
 * Both clients open a request by topping up a stale access token, and both swallowed any
 * failure from that on purpose: a refresh that simply did not work is better explained by
 * the 401 that follows than by a guess made before the request is even sent.
 *
 * That is right for a failure and wrong for a changed identity, which is not a failure at
 * all - it succeeds, and hands back a valid token belonging to whoever signed in on this
 * browser since. Swallowed, the request goes out under their name, and in a product whose
 * whole output is attributed safety records that is the expensive outcome: an incident,
 * an audit answer or a permit signature filed against somebody who never made it.
 *
 * So the assertion that matters is not the error. It is that `fetch` was never called.
 */
const refreshIfNeeded = vi.fn()
const fetchMock = vi.fn()

vi.mock('./authApi', () => ({
  API_BASE_URL: '',
  SESSION_CHANGED: 'session_changed',
  getAccessToken: () => 'token',
  authApi: { refreshIfNeeded: () => refreshIfNeeded() },
}))

beforeEach(() => {
  refreshIfNeeded.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => { vi.unstubAllGlobals() })

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response)

describe.each([
  ['http', () => import('./http').then((m) => m.request)],
  // The incident vertical carries its own copy of this logic. It is the older of the two
  // and the one most likely to be forgotten, which is why it is tested rather than assumed.
  ['incidentsApi', () => import('./incidentsApi').then((m) => m.incidentsApi.list)],
])('%s', (_name, loadCaller) => {
  it('does not send a request once the session belongs to somebody else', async () => {
    const call = await loadCaller()
    refreshIfNeeded.mockRejectedValue(
      new ApiError('session_changed', 'This browser is now signed in as Chong Wei Ming.'),
    )

    await expect(call('acme' as never)).rejects.toMatchObject({ code: 'session_changed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still lets an ordinary refresh failure through to the real answer', async () => {
    /*
     * The behaviour being preserved. A refresh can fail for reasons that have nothing to do
     * with identity - a blip, a cold server - and failing the click there would replace a
     * request that would have succeeded with an error nobody needed to see.
     */
    const call = await loadCaller()
    refreshIfNeeded.mockRejectedValue(new ApiError('network', 'offline'))
    fetchMock.mockResolvedValue(ok({ rows: [], total: 0 }))

    await expect(call('acme' as never)).resolves.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
