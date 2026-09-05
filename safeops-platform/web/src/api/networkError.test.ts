import { describe, it, expect } from 'vitest'
import { explainNetworkFailure } from './networkError'

/**
 * The message shown when a request could not be made at all.
 *
 * A browser reports a blocked cross-origin request and an unreachable server identically —
 * both are `TypeError: Failed to fetch`, with no status and no headers, deliberately, so a
 * page cannot use failure messages to map a network it should not be able to see. Since the
 * failure itself cannot tell them apart, the configuration has to.
 *
 * Not hypothetical: the app was opened on 127.0.0.1:8080 while the API was configured at
 * localhost:4001, and the reset page said "check your connection" while the server was
 * answering every request perfectly well. Those are the same machine and different origins.
 */
describe('explainNetworkFailure — origins differ', () => {
  const msg = () => explainNetworkFailure('http://localhost:4001', 'http://127.0.0.1:8080')

  it('names both origins so the mismatch is visible', () => {
    expect(msg()).toContain('http://127.0.0.1:8080')
    expect(msg()).toContain('http://localhost:4001')
    expect(msg()).toContain('different origins')
  })

  it('gives the address that would actually work', () => {
    // The whole value of the message is telling somebody what to type instead.
    expect(msg()).toContain('http://localhost:8080')
  })

  it('names CORS_ORIGINS, the server-side half of the fix', () => {
    expect(msg()).toContain('CORS_ORIGINS')
  })

  it('still allows that the server may simply be down', () => {
    // A mismatch makes CORS likely, not certain. Asserting it outright would send somebody
    // to change configuration that is already correct.
    expect(msg()).toMatch(/may be down/i)
  })
})

describe('explainNetworkFailure — nothing to diagnose', () => {
  it('says nothing about origins when they match', () => {
    const m = explainNetworkFailure('http://localhost:4001', 'http://localhost:4001')
    expect(m).not.toContain('different origins')
    expect(m).toMatch(/may be down/i)
  })

  it('treats a same-origin production deployment as an ordinary outage', () => {
    // Production serves the API under the same host, so a mismatch is impossible there and
    // the message must not invent one.
    const m = explainNetworkFailure('https://app.example.my/api', 'https://app.example.my')
    expect(m).not.toContain('different origins')
  })

  it('handles a relative API base, which is same-origin by definition', () => {
    expect(explainNetworkFailure('/api', 'http://localhost:8080')).not.toContain('different origins')
  })

  it('falls back when no API base is configured', () => {
    expect(explainNetworkFailure('', 'http://localhost:8080')).not.toContain('different origins')
  })

  it('falls back when there is no page origin, as in a non-browser context', () => {
    expect(explainNetworkFailure('http://localhost:4001', undefined)).toMatch(/may be down/i)
  })

  it('does not throw on an unparseable origin', () => {
    expect(() => explainNetworkFailure('http://localhost:4001', 'not a url')).not.toThrow()
  })
})

describe('explainNetworkFailure — wording', () => {
  it('never blames the reader’s connection on its own', () => {
    /*
     * The old wording was "Check your connection and try again" — wrong in the common case,
     * and it sends somebody to debug their wifi while the server is answering fine.
     */
    for (const m of [
      explainNetworkFailure('http://localhost:4001', 'http://127.0.0.1:8080'),
      explainNetworkFailure('http://localhost:4001', 'http://localhost:4001'),
    ]) {
      expect(m).not.toMatch(/check your connection/i)
    }
  })
})
