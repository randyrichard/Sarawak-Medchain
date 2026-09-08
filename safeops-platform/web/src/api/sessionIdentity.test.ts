import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Whose session a tab thinks it is showing.
 *
 * The access token is a module variable and therefore per-tab, but the refresh token is an
 * httpOnly cookie and therefore shared by every tab on the origin. So signing in as
 * somebody else anywhere in the browser re-points all the others at their next refresh -
 * and `refreshIfNeeded` took the new token without ever asking whose it was.
 *
 * What that produced was reported from the deployment: the full administrator navigation
 * and avatar drawn over a session belonging to a worker, every click refused with no
 * explanation. The server was never fooled - it authorised the token it was handed and
 * refused correctly. The lie was the client's, about who it was showing.
 *
 * The tests below are mostly about the refusal rather than the detection, because that is
 * the decision worth pinning down: this product writes safety records attributed to
 * whoever the token names, so a request must not quietly complete under a name the person
 * who started it never chose.
 */
interface Identity { id: string; email: string; name: string; title: string | null }

const A: Identity = { id: 'u-a', email: 'a@x.test', name: 'Aminah Yusof', title: 'HSE Manager' }
const B: Identity = { id: 'u-b', email: 'b@x.test', name: 'Chong Wei Ming', title: 'Storeman' }

/** Who /auth/refresh and /auth/login currently answer as. */
let subject: Identity = A
let fetchMock: ReturnType<typeof vi.fn>

/**
 * Always in the past, so `needsRefresh()` is true on every call and each test drives the
 * refresh path directly rather than waiting out a clock.
 */
const EXPIRED = new Date(Date.now() - 60_000).toISOString()

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

beforeEach(() => {
  subject = A
  fetchMock = vi.fn(async (url: unknown) => {
    const path = String(url)
    if (path.endsWith('/auth/refresh') || path.endsWith('/auth/login')) {
      return reply({ accessToken: `token-for-${subject.id}`, accessExpiresAt: EXPIRED, user: subject })
    }
    if (path.endsWith('/auth/me')) {
      return reply({ user: subject, roles: [{ companyId: 'acme', role: 'hse_manager', siteIds: [] }] })
    }
    if (path.endsWith('/auth/logout')) return reply({})
    throw new Error(`unstubbed request: ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  // A fresh module per test: the thing under test is module-level session state, so a
  // shared instance would let one test decide the answer to the next.
  vi.resetModules()
})

afterEach(() => { vi.unstubAllGlobals() })

const load = () => import('./authApi')

describe('a session that changes underneath the tab', () => {
  it('does not object to the first refresh, having nobody to compare against', async () => {
    // A tab that has not signed in or restored yet holds no opinion about who it is, and
    // treating that as a change would break every cold start.
    const auth = await load()
    await expect(auth.authApi.refreshIfNeeded()).resolves.toBeUndefined()
    expect(auth.getAccessToken()).toBe('token-for-u-a')
  })

  it('tops up a token for the same person without comment', async () => {
    const auth = await load()
    await auth.authApi.restore()
    const listener = vi.fn()
    auth.onSessionIdentityChange(listener)

    await expect(auth.authApi.refreshIfNeeded()).resolves.toBeUndefined()
    expect(listener).not.toHaveBeenCalled()
  })

  it('refuses to carry on as somebody else', async () => {
    /*
     * The fix. Every request these callers make writes or reads a record attributed to
     * whoever the token names - an incident, a corrective action, an audit answer, a permit
     * signature. Completing one started by a supervisor as the storeman who signed in on
     * the shared terminal a minute ago puts the wrong name in an audit trail that exists to
     * be relied on afterwards.
     */
    const auth = await load()
    await auth.authApi.restore()

    subject = B
    await expect(auth.authApi.refreshIfNeeded()).rejects.toMatchObject({
      code: auth.SESSION_CHANGED,
    })
  })

  it('names who the browser is now, because that is the part nobody can guess', async () => {
    const auth = await load()
    await auth.authApi.restore()

    subject = B
    const error = await auth.authApi.refreshIfNeeded().then(
      () => { throw new Error('refreshIfNeeded resolved, when it should have refused') },
      (e: Error) => e,
    )
    expect(error.message).toContain('Chong Wei Ming')
    // Not "your session has expired": it has not, and that wording sends somebody to sign
    // in again when they are already signed in - as somebody else.
    expect(error.message).not.toMatch(/expired/i)
  })

  it('keeps the new token, which is the valid one for this browser now', async () => {
    /*
     * Discarding it would leave the module holding a token for a person it has just decided
     * it is not, and cost a second cookie rotation to fetch an answer already in hand.
     */
    const auth = await load()
    await auth.authApi.restore()

    subject = B
    await auth.authApi.refreshIfNeeded().catch(() => {})
    expect(auth.getAccessToken()).toBe('token-for-u-b')
  })

  it('tells the listener before throwing, not instead of it', async () => {
    /*
     * The screen is showing the wrong person the moment this is known, and that is true
     * whether or not any caller catches the error. Notifying after the throw would mean
     * never notifying at all.
     */
    const auth = await load()
    await auth.authApi.restore()

    const order: string[] = []
    auth.onSessionIdentityChange(() => order.push('listener'))

    subject = B
    await auth.authApi.refreshIfNeeded().catch(() => order.push('threw'))
    expect(order).toEqual(['listener', 'threw'])
  })

  it('objects once, not on every request afterwards', async () => {
    // Otherwise the tab is unusable until a reload: the identity is settled by then, and
    // repeating the refusal would block the new session's own work.
    const auth = await load()
    await auth.authApi.restore()

    subject = B
    await auth.authApi.refreshIfNeeded().catch(() => {})
    await expect(auth.authApi.refreshIfNeeded()).resolves.toBeUndefined()
  })

  it('stops telling a listener that has been taken away', async () => {
    /*
     * The provider registers on mount and clears on unmount, and StrictMode does both twice
     * before settling. A registry that ignored the clear would leave a listener holding
     * setState handles for an unmounted tree.
     */
    const auth = await load()
    await auth.authApi.restore()
    const listener = vi.fn()
    auth.onSessionIdentityChange(listener)
    auth.onSessionIdentityChange(null)

    subject = B
    await auth.authApi.refreshIfNeeded().catch(() => {})
    expect(listener).not.toHaveBeenCalled()
  })

  it('applies to a session started by signing in, not only by restoring', async () => {
    const auth = await load()
    await auth.authApi.login('a@x.test', 'pw')

    subject = B
    await expect(auth.authApi.refreshIfNeeded()).rejects.toMatchObject({
      code: auth.SESSION_CHANGED,
    })
  })

  it('forgets who the tab was when it signs out', async () => {
    // After a sign-out there is nobody to have changed from, so the next person to sign in
    // on this browser must not be treated as an intruder on the previous one's tab.
    const auth = await load()
    await auth.authApi.restore()
    await auth.authApi.logout()

    subject = B
    await expect(auth.authApi.refreshIfNeeded()).resolves.toBeUndefined()
  })

  it('forgets who the tab was when there is no session left to restore', async () => {
    const auth = await load()
    await auth.authApi.restore()

    fetchMock.mockImplementation(async () => ({
      ok: false, status: 401, json: async () => ({ error: 'expired_refresh' }),
    } as unknown as Response))
    await auth.authApi.restore()

    subject = B
    fetchMock.mockImplementation(async (url: unknown) => {
      const path = String(url)
      return reply(path.endsWith('/auth/me')
        ? { user: B, roles: [] }
        : { accessToken: 'token-for-u-b', accessExpiresAt: EXPIRED, user: B })
    })
    await expect(auth.authApi.refreshIfNeeded()).resolves.toBeUndefined()
  })
})
