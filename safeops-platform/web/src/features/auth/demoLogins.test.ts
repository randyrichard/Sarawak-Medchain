import { describe, it, expect } from 'vitest'
import { shouldShowDemoLogins } from './demoLogins'

/**
 * The demo accounts must not appear on a customer's login page.
 *
 * The panel was rendered unconditionally, so a production deployment greeted its first
 * paying customer with six one-click role buttons and the line "Shared demo password: …".
 * That publishes the account-naming and password convention the seed uses, on the first
 * screen anybody reaches — and one of those six accounts is an administrator, so if the
 * seed had ever been run against that database the login page was also the credential.
 */
describe('shouldShowDemoLogins', () => {
  it('shows them in development', () => {
    expect(shouldShowDemoLogins({ DEV: true })).toBe(true)
  })

  it('hides them in a production build', () => {
    // The case that matters. A production bundle is what a customer loads.
    expect(shouldShowDemoLogins({ DEV: false })).toBe(false)
    expect(shouldShowDemoLogins({})).toBe(false)
  })

  it('allows a deliberate demo deployment to opt in', () => {
    // Sales demos are a real use, so the capability stays - as a decision rather than an
    // accident of which bundle got shipped.
    expect(shouldShowDemoLogins({ DEV: false, VITE_DEMO_LOGINS: 'true' })).toBe(true)
  })

  it('only accepts an exact opt-in', () => {
    // Vite injects every VITE_* var as a string. Anything truthy-looking but not the
    // literal opt-in must not open this: "false" is the value most likely to be set by
    // somebody trying to turn it off.
    for (const v of ['false', '1', 'yes', 'TRUE', '', 'no']) {
      expect(shouldShowDemoLogins({ DEV: false, VITE_DEMO_LOGINS: v }), v).toBe(false)
    }
  })
})
