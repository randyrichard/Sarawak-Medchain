import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Where somebody lands after signing in.
 *
 * Written for a defect found by using the product rather than reading it: signing in as a
 * customer administrator dropped them on "This area is for SafeChain staff." They had been
 * bounced off /platform to the login screen, and the redirect faithfully returned them to
 * the one page their account can never open. Sign-in had worked; it just looked like it
 * had not.
 */

const loadPreferences = vi.fn()
const getPlatformInfo = vi.fn()

vi.mock('@/features/account/preferences', () => ({
  loadPreferences: () => loadPreferences(),
  clearPreferences: () => {},
}))
vi.mock('@/features/platform/usePlatformAdmin', () => ({
  getPlatformInfo: () => getPlatformInfo(),
}))

const { destination } = await import('./pages/LoginPage')

beforeEach(() => {
  vi.clearAllMocks()
  loadPreferences.mockResolvedValue({ landingPage: '/dashboard' })
  getPlatformInfo.mockResolvedValue({ platformAdmin: false, plans: [], loading: false })
})

describe('where a sign-in lands', () => {
  it('sends a customer to their dashboard rather than the staff console', async () => {
    // The defect, exactly: bounced off /platform, not staff.
    expect(await destination('/platform')).toBe('/dashboard')
  })

  it('still takes SafeChain staff to the console they were bounced off', async () => {
    // The deep link is honoured for anybody who can actually use it - this is the half
    // that must not regress while fixing the other.
    getPlatformInfo.mockResolvedValue({ platformAdmin: true, plans: [], loading: false })
    expect(await destination('/platform')).toBe('/platform')
  })

  it('covers nested platform paths too', async () => {
    expect(await destination('/platform/companies')).toBe('/dashboard')
  })

  it('honours any other deep link without asking who they are', async () => {
    // An ordinary page needs no privilege check, and asking would cost a request on every
    // sign-in.
    expect(await destination('/incidents/INC-2607')).toBe('/incidents/INC-2607')
    expect(getPlatformInfo).not.toHaveBeenCalled()
  })

  it('falls back to the landing preference when they came to the login page directly', async () => {
    loadPreferences.mockResolvedValue({ landingPage: '/permits' })
    expect(await destination('/')).toBe('/permits')
  })

  it('refuses a landing preference that points off-site', async () => {
    // The open-redirect guard still applies to whatever the preference holds.
    loadPreferences.mockResolvedValue({ landingPage: 'https://evil.invalid/steal' })
    expect(await destination('/')).not.toContain('evil.invalid')
  })
})
