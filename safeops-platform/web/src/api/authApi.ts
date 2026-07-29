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

interface AuthPayload {
  accessToken: string
  accessExpiresAt: string
  user: {
    id: string
    email: string
    name: string
    title: string | null
    mustChangePassword?: boolean
  }
}

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
  async login(email: string, password: string): Promise<User> {
    const data = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setAccessToken(data.accessToken, data.accessExpiresAt)
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
      const me = await request<MePayload>('/auth/me')
      return toUser(me.user, me.roles)
    } catch {
      setAccessToken(null)
      return null
    }
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/auth/logout', { method: 'POST', body: JSON.stringify({}) })
    } finally {
      // Drop the in-memory token even if the network call fails.
      setAccessToken(null)
    }
  },

  /** True when the access token is absent or within 60s of expiry. */
  needsRefresh(): boolean {
    return !accessToken || Date.now() > accessExpiresAt - 60_000
  },

  async refreshIfNeeded(): Promise<void> {
    if (!this.needsRefresh()) return
    const data = await refreshOnce()
    setAccessToken(data.accessToken, data.accessExpiresAt)
  },
}
