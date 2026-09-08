import type { Membership, Role, User } from './types'
import { ApiError } from './types'

/**
 * Real authentication client.
 *
 * Two deliberate properties:
 *
 *  1. The access token lives in a module variable — memory only. It is never written to
 *     localStorage or sessionStorage, so an XSS payload cannot read a durable credential
 *     out of storage, and closing the tab discards it.
 *  2. The refresh token is never touched by this code at all. It is an httpOnly cookie the
 *     browser attaches to /auth requests; JavaScript cannot read it by design.
 */

/** Empty base URL means "no backend configured" — the app falls back to mock mode. */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export const isBackendConfigured = () => API_BASE_URL.length > 0

/**
 * Mock authentication is a demo affordance, not a security boundary: it verifies passwords
 * in the browser and keeps a forgeable session in localStorage. Shipping a production build
 * without VITE_API_BASE_URL would silently fall back to it, so say so loudly.
 */
export const MOCK_AUTH_IN_PROD = import.meta.env.PROD && !isBackendConfigured()

if (MOCK_AUTH_IN_PROD) {
  // eslint-disable-next-line no-console
  console.error(
    '[SafeOps] SECURITY: no VITE_API_BASE_URL in a production build — authentication has ' +
      'fallen back to the in-browser mock. This build must not be used by a tenant.',
  )
}

/**
 * Refuses mock authentication in a production build.
 *
 * A warning in the console is not a control: a build shipped without VITE_API_BASE_URL
 * would still let anyone sign in with a demo password compiled into the bundle. Failing
 * closed turns a silent security hole into an obvious misconfiguration.
 */
export function assertRealAuth(): void {
  if (MOCK_AUTH_IN_PROD) {
    throw new ApiError(
      'misconfigured',
      'This build has no API configured, so it cannot sign anyone in. Set VITE_API_BASE_URL and rebuild.',
    )
  }
}

let accessToken: string | null = null
let accessExpiresAt = 0

/**
 * Single in-flight refresh, shared by all concurrent callers.
 *
 * Rotation makes a refresh token single-use, so two simultaneous refreshes would send the
 * same token twice: the first rotates it, the second looks exactly like a replay and the
 * server (correctly) revokes the whole session family. React StrictMode's double-invoked
 * effects trigger this on every mount, and so does any pair of concurrent 401 retries.
 * Collapsing them into one request removes the race without weakening reuse detection.
 */
let inFlightRefresh: Promise<AuthPayload> | null = null

function refreshOnce(): Promise<AuthPayload> {
  if (!inFlightRefresh) {
    inFlightRefresh = request<AuthPayload>('/auth/refresh', { method: 'POST' })
      .finally(() => { inFlightRefresh = null })
  }
  return inFlightRefresh
}

export const getAccessToken = () => accessToken
export function setAccessToken(token: string | null, expiresAt?: string) {
  accessToken = token
  accessExpiresAt = expiresAt ? Date.parse(expiresAt) : 0
}

/** Who a token belongs to, as the server states it in an auth response. */
export interface SessionIdentity {
  id: string
  email: string
  name: string
  title: string | null
  mustChangePassword?: boolean
}

interface AuthPayload {
  accessToken: string
  accessExpiresAt: string
  user: SessionIdentity
}

/**
 * Whose session the tokens in this module belong to.
 *
 * The access token is memory-only and therefore per-tab, but the refresh token is an
 * httpOnly cookie and therefore shared by every tab on the origin. So signing in as
 * somebody else anywhere in the browser silently re-points every other tab: the next
 * refresh returns a token for the new subject, and until this was recorded, nothing
 * compared it to whoever the tab believed it was showing.
 *
 * What that looked like was a screen drawn for one person and answered for another - the
 * full administrator navigation and avatar over an account with none of it, every click
 * refused with no explanation. Not an escalation; the server authorised the token it was
 * given and refused correctly. A lie told by the client about who it was.
 */
let sessionUserId: string | null = null

/** Told when a refresh comes back for somebody else. Registered by AuthProvider. */
let identityListener: (() => void) | null = null

/**
 * Subscribes to the session changing underneath this tab. One listener, because there is
 * one place that owns session state; a second subscriber would mean two.
 */
export function onSessionIdentityChange(listener: (() => void) | null) {
  identityListener = listener
}

/**
 * The code raised when a refresh returns a different subject.
 *
 * Distinct from `unauthenticated` because the session is not gone and telling somebody it
 * expired would send them to sign in again when they are already signed in - as somebody
 * else, which is the part they need to be told.
 */
export const SESSION_CHANGED = 'session_changed'

interface MePayload {
  user: AuthPayload['user']
  roles: { companyId: string; role: Role; siteIds: string[] }[]
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    // Required for the refresh cookie to be sent/stored cross-origin.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.error ?? 'request_failed', body.message ?? 'Something went wrong.')
  }
  return body as T
}

/** Shapes the server response into the User the app already understands. */
function toUser(payload: AuthPayload['user'], roles: Membership[]): User {
  return {
    id: payload.id,
    email: payload.email,
    name: payload.name,
    title: payload.title ?? '',
    memberships: roles,
    mustChangePassword: payload.mustChangePassword,
  }
}

export const authApi = {
  async login(email: string, password: string, rememberMe = true): Promise<User> {
    const data = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    })
    setAccessToken(data.accessToken, data.accessExpiresAt)
    sessionUserId = data.user.id
    // Roles are never taken from the login response body — they are read back from the
    // signed session so the client cannot influence its own authority.
    const me = await request<MePayload>('/auth/me')
    return toUser(me.user, me.roles)
  },

  /**
   * Restores a session on boot using only the httpOnly cookie. There is no client-side
   * session state to trust — if the cookie is missing, revoked, or expired, the server
   * says so and the user is anonymous.
   */
  async restore(): Promise<User | null> {
    try {
      const data = await refreshOnce()
      setAccessToken(data.accessToken, data.accessExpiresAt)
      sessionUserId = data.user.id
      const me = await request<MePayload>('/auth/me')
      return toUser(me.user, me.roles)
    } catch {
      setAccessToken(null)
      sessionUserId = null
      return null
    }
  },

  /**
   * Who the current tokens belong to, with their roles.
   *
   * Separate from `restore` because the caller already holds a valid access token and only
   * needs to know whose it is. Going through `restore` would rotate the refresh cookie a
   * second time for an answer the tab can already ask for.
   */
  async me(): Promise<User> {
    const me = await request<MePayload>('/auth/me')
    return toUser(me.user, me.roles)
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({}) })
    } finally {
      // Drop the in-memory token even if the network call fails.
      setAccessToken(null)
      sessionUserId = null
    }
  },

  /**
   * Redeems an administrator-issued reset link. Unauthenticated by design — the caller
   * is someone who cannot sign in, and the token is the only credential.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await request<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    })
  },

  /**
   * "I forgot my password — email me a link."
   *
   * Resolves the same way whether or not the address has an account: the server answers
   * identically on purpose, so that an unauthenticated endpoint cannot be walked through an
   * address list to learn who works where. Nothing in the response is worth branching on,
   * which is why this returns void.
   */
  async requestPasswordReset(email: string): Promise<void> {
    await request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  /** Whether a link is still redeemable. Returns nothing about the account behind it. */
  async checkResetToken(token: string): Promise<boolean> {
    const r = await request<{ valid: boolean }>(`/auth/reset-password/${encodeURIComponent(token)}`)
    return r.valid
  },

  /** True when the access token is absent or within 60s of expiry. */
  needsRefresh(): boolean {
    return !accessToken || Date.now() > accessExpiresAt - 60_000
  },

  /**
   * Tops up the access token, and refuses to do it silently for a different person.
   *
   * The refresh cookie is shared across tabs, so this can legitimately succeed and hand
   * back a token for somebody else entirely. The token is kept - it is the valid one for
   * this browser now - but the caller is stopped rather than allowed to continue.
   *
   * Stopped, rather than allowed through, because of what this product records. Every
   * request the callers make writes or reads a safety record attributed to whoever the
   * token names: an incident, a corrective action, an audit answer, a permit signature.
   * Letting a request that a supervisor started be completed as the storeman who signed in
   * on the shared terminal a minute ago would put the wrong name in an audit trail that
   * exists to be relied on afterwards. An error the person can retry is much cheaper than
   * a record nobody can trust.
   */
  async refreshIfNeeded(): Promise<void> {
    if (!this.needsRefresh()) return
    const data = await refreshOnce()

    // Null on the very first refresh of a tab, which is not a change - there was nobody
    // to change from.
    const changed = sessionUserId !== null && data.user.id !== sessionUserId

    sessionUserId = data.user.id
    setAccessToken(data.accessToken, data.accessExpiresAt)

    if (changed) {
      // Before the throw: the screen is showing the wrong person right now, and that is
      // true whether or not anything catches this.
      identityListener?.()
      throw new ApiError(
        SESSION_CHANGED,
        `This browser is now signed in as ${data.user.name}, so that request was not sent. `
        + 'The screen has been switched to that account.',
      )
    }
  },
}
