import { accountApi, type UserPreferences } from '@/api/accountApi'
import { isBackendConfigured } from '@/api/authApi'

/**
 * Session-cached account preferences.
 *
 * Two unrelated places need these within a few milliseconds of each other — the login
 * redirect and the org scope — so they share one request rather than racing two. The
 * cache is cleared on sign-out so the next person to use the browser never inherits it.
 */

/** Used before the first load, in mock mode, and whenever the call fails: never block sign-in on a preference. */
const FALLBACK: UserPreferences = { landingPage: '/', defaultSiteId: null }

let cache: Promise<UserPreferences> | null = null
let freshLogin = false

export function loadPreferences(): Promise<UserPreferences> {
  if (!isBackendConfigured()) return Promise.resolve(FALLBACK)
  // A failed load is not cached: it would pin the fallback for the whole session and the
  // account page would then show defaults as if they were the user's saved settings.
  cache ??= accountApi.getPreferences().catch(() => {
    cache = null
    return FALLBACK
  })
  return cache
}

/** Keeps the cache truthful after the user edits their preferences. */
export function setCachedPreferences(prefs: UserPreferences): void {
  cache = Promise.resolve(prefs)
}

/**
 * Distinguishes a sign-in that happened in this tab from a reload of a live session.
 * The default-site preference applies to the former only — a reload must never yank the
 * scope away from whatever site the user switched to five minutes ago.
 */
export function markFreshLogin(): void {
  freshLogin = true
}

export function takeFreshLogin(): boolean {
  const was = freshLogin
  freshLogin = false
  return was
}

export function clearPreferences(): void {
  cache = null
  freshLogin = false
}
