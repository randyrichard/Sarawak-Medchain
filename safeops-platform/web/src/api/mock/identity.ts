import type { Role } from '@/api/types'
import { USERS } from './fixtures'

const SESSION_KEY = 'safeops.session'

/**
 * Identity verification for the mock API.
 *
 * Callers pass an `actor` describing who they claim to be. That claim is NOT
 * trusted: it is checked against the roles the *authenticated session* actually
 * holds. This closes the client-side privilege-escalation path where a caller
 * invokes an API method directly with a forged `role: 'admin'`.
 *
 * Limitation (needs a server to close fully): the demo session token is an
 * unsigned base64 payload, so an attacker with console access can still mint a
 * token for another user. Only a server-side signed token (and server-side
 * enforcement) removes that. See the security report.
 */

/**
 * Roles of the currently authenticated user, published by AuthContext after a successful
 * login or session restore.
 *
 * In backend mode there is no session in localStorage — the refresh token is an httpOnly
 * cookie and the access token is held in memory — so the legacy storage lookup below finds
 * nothing. This in-memory identity is the authoritative source in that mode; without it the
 * guard would fall through to its "no session" branch and permit forged roles.
 */
let authenticatedRoles: Set<Role> | null = null

export function setAuthenticatedRoles(roles: Role[] | null) {
  authenticatedRoles = roles ? new Set(roles) : null
}

/** Decoded locally to avoid a circular import with the API client. */
function decodeSessionToken(token: string): { sub: string; exp: number } | null {
  try {
    const p = JSON.parse(atob(token))
    return typeof p.sub === 'string' && typeof p.exp === 'number' ? p : null
  } catch {
    return null
  }
}

/** Every role the currently authenticated user genuinely holds, or null if signed out. */
export function sessionRoles(): Set<Role> | null {
  // Backend mode: identity comes from the authenticated session held in memory.
  if (authenticatedRoles) return authenticatedRoles

  let raw: string | null = null
  try {
    raw = localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let token: string
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.token !== 'string') return null
    token = parsed.token
  } catch {
    return null
  }

  const payload = decodeSessionToken(token)
  if (!payload || payload.exp < Date.now()) return null

  const user = USERS.find((u) => u.id === payload.sub)
  if (!user) return null
  return new Set(user.memberships.map((m) => m.role))
}

/**
 * True when the claimed role is one the authenticated session actually holds.
 * Returns true when there is no session at all so that seeding/system callers
 * (which run outside a user session) are not broken — those paths never accept
 * user input.
 */
export function claimIsAuthentic(claimed: Role | string): boolean {
  const held = sessionRoles()
  if (held === null) return true
  return held.has(claimed as Role)
}
