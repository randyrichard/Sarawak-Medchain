import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPreferences = vi.fn()
let backendConfigured = true

vi.mock('@/api/accountApi', () => ({ accountApi: { getPreferences: () => getPreferences() } }))
vi.mock('@/api/authApi', () => ({ isBackendConfigured: () => backendConfigured }))

const {
  clearPreferences, loadPreferences, markFreshLogin, setCachedPreferences, takeFreshLogin,
} = await import('./preferences')

const PREFS = { landingPage: '/permits' as const, defaultSiteId: 'btu' }

describe('preferences cache', () => {
  beforeEach(() => {
    clearPreferences()
    getPreferences.mockReset()
    backendConfigured = true
  })

  it('fetches once and serves later callers from the cache', async () => {
    getPreferences.mockResolvedValue(PREFS)
    const [a, b] = await Promise.all([loadPreferences(), loadPreferences()])
    expect(a).toEqual(PREFS)
    expect(b).toEqual(PREFS)
    expect(getPreferences).toHaveBeenCalledTimes(1)
  })

  it('falls back to defaults when the call fails, and retries next time', async () => {
    getPreferences.mockRejectedValueOnce(new Error('offline'))
    expect(await loadPreferences()).toEqual({ landingPage: '/', defaultSiteId: null })

    // A failure must not pin the fallback for the rest of the session.
    getPreferences.mockResolvedValue(PREFS)
    expect(await loadPreferences()).toEqual(PREFS)
    expect(getPreferences).toHaveBeenCalledTimes(2)
  })

  it('never calls the API without a backend', async () => {
    backendConfigured = false
    expect(await loadPreferences()).toEqual({ landingPage: '/', defaultSiteId: null })
    expect(getPreferences).not.toHaveBeenCalled()
  })

  it('serves an edit without refetching', async () => {
    setCachedPreferences(PREFS)
    expect(await loadPreferences()).toEqual(PREFS)
    expect(getPreferences).not.toHaveBeenCalled()
  })

  it('forgets the previous user on sign-out', async () => {
    setCachedPreferences(PREFS)
    clearPreferences()
    getPreferences.mockResolvedValue({ landingPage: '/audits', defaultSiteId: null })
    expect(await loadPreferences()).toEqual({ landingPage: '/audits', defaultSiteId: null })
  })
})

describe('fresh-login marker', () => {
  beforeEach(() => clearPreferences())

  it('is not set for a plain page load', () => {
    expect(takeFreshLogin()).toBe(false)
  })

  // The default-site preference applies once per sign-in. If the flag survived, every
  // later remount would drag the user back off the site they switched to.
  it('is consumed exactly once', () => {
    markFreshLogin()
    expect(takeFreshLogin()).toBe(true)
    expect(takeFreshLogin()).toBe(false)
  })

  it('is cleared by sign-out', () => {
    markFreshLogin()
    clearPreferences()
    expect(takeFreshLogin()).toBe(false)
  })
})
