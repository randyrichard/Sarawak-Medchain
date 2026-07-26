import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Minimal localStorage for the node test environment (the module reads it directly).
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

const { claimIsAuthentic, sessionRoles, setAuthenticatedRoles } = await import('./identity')

const KEY = 'safeops.session'

/** Mints the same unsigned demo token shape the mock API issues. */
function tokenFor(sub: string, ttlMs = 60_000) {
  return btoa(JSON.stringify({ sub, exp: Date.now() + ttlMs }))
}
function signIn(sub: string, ttlMs?: number) {
  localStorage.setItem(KEY, JSON.stringify({ token: tokenFor(sub, ttlMs), userId: sub, expiresAt: Date.now() + (ttlMs ?? 60_000) }))
}

describe('identity — session-derived role verification', () => {
  beforeEach(() => { localStorage.clear(); setAuthenticatedRoles(null) })
  afterEach(() => { localStorage.clear(); setAuthenticatedRoles(null) })

  it('resolves the roles an authenticated user genuinely holds', () => {
    signIn('u-admin')
    expect(sessionRoles()?.has('admin')).toBe(true)
    signIn('u-emp')
    expect(sessionRoles()?.has('employee')).toBe(true)
  })

  it('blocks an employee session from claiming admin (privilege escalation)', () => {
    signIn('u-emp')
    expect(claimIsAuthentic('admin')).toBe(false)
    expect(claimIsAuthentic('hse_manager')).toBe(false)
    expect(claimIsAuthentic('employee')).toBe(true)
  })

  it('lets a genuine admin claim admin, but not a role they do not hold', () => {
    signIn('u-admin')
    expect(claimIsAuthentic('admin')).toBe(true)
    expect(claimIsAuthentic('ceo')).toBe(false)
  })

  it('rejects an expired session', () => {
    signIn('u-admin', -1000)
    expect(sessionRoles()).toBeNull()
  })

  it('rejects a malformed or unknown-subject session', () => {
    localStorage.setItem(KEY, 'not-json')
    expect(sessionRoles()).toBeNull()
    localStorage.setItem(KEY, JSON.stringify({ token: btoa(JSON.stringify({ sub: 'ghost', exp: Date.now() + 60_000 })) }))
    expect(sessionRoles()).toBeNull()
  })
})

/**
 * Backend mode has no session in localStorage — the refresh token is an httpOnly cookie
 * and the access token lives in memory. These cover the regression where the guard fell
 * through to its "no session" branch and allowed forged roles.
 */
describe('identity — backend mode (in-memory authenticated roles)', () => {
  beforeEach(() => { localStorage.clear(); setAuthenticatedRoles(null) })
  afterEach(() => { localStorage.clear(); setAuthenticatedRoles(null) })

  it('blocks an employee session from claiming admin with no localStorage session present', () => {
    setAuthenticatedRoles(['employee'])
    expect(localStorage.getItem('safeops.session')).toBeNull()
    expect(claimIsAuthentic('admin')).toBe(false)
    expect(claimIsAuthentic('hse_manager')).toBe(false)
    expect(claimIsAuthentic('employee')).toBe(true)
  })

  it('honours every role a multi-membership user genuinely holds', () => {
    setAuthenticatedRoles(['admin', 'ceo'])
    expect(claimIsAuthentic('admin')).toBe(true)
    expect(claimIsAuthentic('ceo')).toBe(true)
    expect(claimIsAuthentic('supervisor')).toBe(false)
  })

  it('takes precedence over any stale localStorage session', () => {
    // A leftover mock session must not be able to grant authority in backend mode.
    localStorage.setItem('safeops.session', JSON.stringify({
      token: btoa(JSON.stringify({ sub: 'u-admin', exp: Date.now() + 60_000 })),
    }))
    setAuthenticatedRoles(['employee'])
    expect(claimIsAuthentic('admin')).toBe(false)
  })

  it('clears authority on logout', () => {
    setAuthenticatedRoles(['admin'])
    expect(claimIsAuthentic('admin')).toBe(true)
    setAuthenticatedRoles(null)
    expect(sessionRoles()).toBeNull()
  })
})
