import { describe, it, expect } from 'vitest'
import { signPayload, verifySignature } from './webhookDelivery.js'
import { seal, open, secretBoxAvailable, SecretBoxError } from './secretBox.js'
import { scopeForMethod, hasScope, hashApiKey, API_KEY_PREFIX } from './apiKeyAuth.js'

/**
 * The three pieces of cryptography this change introduced, tested away from any database.
 *
 * A signing scheme nothing verifies is a signing scheme nobody knows is broken, and a
 * receiver has no way to check ours without an implementation to compare against - so
 * `verifySignature` exists for them and is exercised here as they would use it.
 */

const SECRET = 'whsec_test_only_not_a_real_secret'

describe('webhook signatures', () => {
  it('round-trips', () => {
    const body = JSON.stringify({ event: 'incident.created', data: { id: 'i1' } })
    expect(verifySignature(SECRET, body, signPayload(SECRET, body))).toBe(true)
  })

  it('fails when the body was altered in transit', () => {
    // The whole point. A receiver that skips this is accepting incident reports from
    // anyone who knows the URL.
    const sig = signPayload(SECRET, '{"severity":"Minor"}')
    expect(verifySignature(SECRET, '{"severity":"Critical"}', sig)).toBe(false)
  })

  it('fails under the wrong secret', () => {
    const body = '{"a":1}'
    expect(verifySignature('whsec_someone_elses', body, signPayload(SECRET, body))).toBe(false)
  })

  it('refuses a replay from outside the tolerance window', () => {
    const body = '{"a":1}'
    const then = new Date('2026-09-07T10:00:00Z')
    const sig = signPayload(SECRET, body, then)
    // Inside the window, still good.
    expect(verifySignature(SECRET, body, sig, 300, new Date('2026-09-07T10:04:00Z'))).toBe(true)
    // Ten minutes later it is a captured request being replayed.
    expect(verifySignature(SECRET, body, sig, 300, new Date('2026-09-07T10:10:00Z'))).toBe(false)
  })

  it('cannot be replayed by rewriting the timestamp', () => {
    /*
     * Why the timestamp is inside the signed string rather than merely sent beside it. If
     * it were only a header, an attacker with a captured body could paste a fresh `t` and
     * the old MAC would still verify.
     */
    const body = '{"a":1}'
    const old = signPayload(SECRET, body, new Date('2026-09-07T10:00:00Z'))
    const mac = old.split('v1=')[1]
    const fresh = `t=${Math.floor(Date.now() / 1000)},v1=${mac}`
    expect(verifySignature(SECRET, body, fresh)).toBe(false)
  })

  it('refuses a malformed or empty header rather than throwing', () => {
    const body = '{"a":1}'
    for (const h of ['', 'nonsense', 't=abc,v1=00', 'v1=00', 't=1', 't=1,v1=zzzz']) {
      expect(() => verifySignature(SECRET, body, h)).not.toThrow()
      expect(verifySignature(SECRET, body, h), h).toBe(false)
    }
  })

  it('refuses a truncated MAC', () => {
    // A length check has to come before the comparison; timingSafeEqual throws on a
    // length mismatch, and a throw here would be a way to tell one failure from another.
    const body = '{"a":1}'
    const sig = signPayload(SECRET, body)
    const truncated = `${sig.split(',')[0]},v1=${sig.split('v1=')[1].slice(0, 16)}`
    expect(verifySignature(SECRET, body, truncated)).toBe(false)
  })
})

describe('secretBox', () => {
  it('is available in the test environment', () => {
    // vitest.config.ts sets a throwaway key. Without one the product refuses to create a
    // webhook at all, which is correct and would make every test below vacuous.
    expect(secretBoxAvailable()).toBe(true)
  })

  it('round-trips a secret', () => {
    expect(open(seal(SECRET))).toBe(SECRET)
  })

  it('produces a different ciphertext every time', () => {
    // A fresh IV per seal. Identical ciphertexts for identical inputs would tell anyone
    // reading the table which webhooks share a secret.
    expect(seal(SECRET)).not.toBe(seal(SECRET))
  })

  it('does not contain the plaintext', () => {
    expect(seal(SECRET)).not.toContain(SECRET)
    expect(seal(SECRET)).not.toContain('not_a_real_secret')
  })

  it('refuses to open something that was tampered with', () => {
    // GCM's authentication tag. Without it a modified ciphertext would decrypt to
    // something an attacker had influence over, and we would sign payloads with it.
    const sealed = seal(SECRET)
    const [v, iv, tag, data] = sealed.split('.')
    const flipped = `${data.slice(0, -2)}${data.slice(-2) === 'AA' ? 'AB' : 'AA'}`
    expect(() => open([v, iv, tag, flipped].join('.'))).toThrow(SecretBoxError)
  })

  it('refuses a value that was not sealed by this version', () => {
    expect(() => open('nonsense')).toThrow(SecretBoxError)
    expect(() => open('v2.a.b.c')).toThrow(SecretBoxError)
    expect(() => open('')).toThrow(SecretBoxError)
  })
})

describe('API key scopes', () => {
  it('maps a method to the scope it needs', () => {
    expect(scopeForMethod('GET')).toBe('view')
    expect(scopeForMethod('get')).toBe('view')
    expect(scopeForMethod('HEAD')).toBe('view')
    expect(scopeForMethod('POST')).toBe('create')
    expect(scopeForMethod('PATCH')).toBe('edit')
    expect(scopeForMethod('PUT')).toBe('edit')
    expect(scopeForMethod('DELETE')).toBe('delete')
  })

  it('asks for a scope no key can hold when the method is unknown', () => {
    // A permissive default here would mean any method nobody thought about is unguarded.
    const needed = scopeForMethod('TRACE')
    expect(needed).toBe('__unmapped__')
    expect(hasScope({ scopes: ['view', 'create', 'edit', 'delete', 'export'] } as never, needed))
      .toBe(false)
  })

  it('holds only the scopes it was issued', () => {
    const key = { scopes: ['view'] } as never
    expect(hasScope(key, 'view')).toBe(true)
    expect(hasScope(key, 'create')).toBe(false)
  })

  it('hashes a key the way createApiKey stored it', () => {
    // If these two ever disagree, every key stops authenticating at once and the cause is
    // invisible: the row is there, the secret is right, the lookup just misses.
    const secret = `${API_KEY_PREFIX}abc123`
    expect(hashApiKey(secret)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashApiKey(secret)).toBe(hashApiKey(secret))
    expect(hashApiKey(secret)).not.toBe(hashApiKey(`${secret}x`))
  })
})
