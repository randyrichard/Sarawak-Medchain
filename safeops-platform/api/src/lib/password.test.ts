import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, burnEquivalentWork, validatePasswordStrength } from './password.js'

describe('password hashing', () => {
  it('produces an Argon2id digest, never the plaintext', async () => {
    const digest = await hashPassword('CorrectHorse#2026')
    expect(digest.startsWith('$argon2id$')).toBe(true)
    expect(digest).not.toContain('CorrectHorse#2026')
  })

  it('salts: the same password hashes differently every time', async () => {
    const a = await hashPassword('CorrectHorse#2026')
    const b = await hashPassword('CorrectHorse#2026')
    expect(a).not.toBe(b)
    // …yet both still verify, which is what a per-hash salt buys us.
    expect(await verifyPassword(a, 'CorrectHorse#2026')).toBe(true)
    expect(await verifyPassword(b, 'CorrectHorse#2026')).toBe(true)
  })

  it('verifies correct passwords and rejects wrong ones', async () => {
    const digest = await hashPassword('CorrectHorse#2026')
    expect(await verifyPassword(digest, 'CorrectHorse#2026')).toBe(true)
    expect(await verifyPassword(digest, 'correcthorse#2026')).toBe(false)
    expect(await verifyPassword(digest, '')).toBe(false)
  })

  it('fails closed on a malformed digest instead of throwing', async () => {
    await expect(verifyPassword('not-a-digest', 'anything')).resolves.toBe(false)
    await expect(verifyPassword('', 'anything')).resolves.toBe(false)
  })

  it('uses memory-hard parameters (>= 19 MiB, per OWASP)', async () => {
    const digest = await hashPassword('CorrectHorse#2026')
    const m = Number(/m=(\d+)/.exec(digest)?.[1])
    expect(m).toBeGreaterThanOrEqual(19456)
  })

  it('burns comparable work for unknown accounts (user-enumeration timing defence)', async () => {
    const digest = await hashPassword('CorrectHorse#2026')

    const t0 = performance.now()
    await verifyPassword(digest, 'wrong-password')
    const realMs = performance.now() - t0

    const t1 = performance.now()
    await burnEquivalentWork('wrong-password')
    const dummyMs = performance.now() - t1

    // Same order of magnitude. A no-op placeholder would return ~1000x faster and
    // leak account existence through response latency alone.
    expect(dummyMs).toBeGreaterThan(realMs * 0.25)
  })
})

describe('password policy', () => {
  it('requires length and mixed character classes', () => {
    expect(validatePasswordStrength('short1A')).toMatch(/at least 12/)
    expect(validatePasswordStrength('alllowercase123')).toMatch(/uppercase/)
    expect(validatePasswordStrength('ALLUPPERCASE123')).toMatch(/lowercase/)
    expect(validatePasswordStrength('NoDigitsInHere!')).toMatch(/number/)
    expect(validatePasswordStrength('x'.repeat(201))).toMatch(/at most/)
  })

  it('accepts a compliant password', () => {
    expect(validatePasswordStrength('SafeOpsPlatform2026')).toBeNull()
  })
})
