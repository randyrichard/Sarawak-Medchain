import { describe, it, expect } from 'vitest'
import { CONNECTORS } from './adminCatalog.js'

/**
 * A connector may not say it is available unless something delivers through it.
 *
 * All four shipped as `available` with a Connect button. Nothing anywhere read the stored
 * configuration back - no alert was posted to Slack or Teams, no directory was queried for
 * sign-on - so an administrator entered their Entra ID client secret, saw "Connected", and
 * would have found out in week one of a paid pilot that single sign-on was never wired up.
 * The catalog's own comment said a directory advertising integrations that do not exist is
 * a promise the product cannot keep; the code did it anyway.
 *
 * This test is the guard on the promise rather than on the feature. It cannot check that a
 * connector works - only an integration test against the vendor could - so it checks the
 * one thing that is checkable and was actually wrong: that nobody flips a connector to
 * `available` without coming through here and saying what now delivers it.
 */
describe('the integration directory', () => {
  it('lists nothing as available, because nothing delivers yet', () => {
    /*
     * Deliberately a whitelist of none. When Slack delivery is genuinely built, this test
     * fails and whoever built it adds 'slack' here - which is the moment to check that the
     * config is actually read on the send path, not merely stored.
     */
    const DELIVERS: string[] = []

    const claimingAvailable = CONNECTORS
      .filter((c) => c.status === 'available')
      .map((c) => c.id)

    expect(claimingAvailable).toEqual(DELIVERS)
  })

  it('still lists them, so the roadmap stays visible', () => {
    // Removing them entirely was the other option and is worse: an HSE manager asking
    // "does it talk to Teams" deserves "planned", not silence.
    expect(CONNECTORS.length).toBeGreaterThan(0)
    expect(CONNECTORS.every((c) => c.status === 'planned' || c.status === 'available')).toBe(true)
  })

  it('never asks for a credential it has nowhere to send', () => {
    /*
     * The part that actually cost something. A planned connector with a secret field is an
     * invitation to hand over a production credential in exchange for nothing - which is
     * what "Client secret" on a Planned Entra ID card would still be.
     *
     * Secrets are reduced to the string "set" before storage, so none was ever retained;
     * the objection is to asking at all.
     */
    for (const c of CONNECTORS.filter((x) => x.status === 'planned')) {
      const secrets = c.fields.filter((f) => f.secret).map((f) => f.label)
      expect(secrets, `${c.name} is planned but asks for: ${secrets.join(', ')}`).toEqual([])
    }
  })
})
