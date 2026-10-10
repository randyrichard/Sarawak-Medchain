import { describe, it, expect } from 'vitest'
import { base32Decode, base32Encode, codeAt, otpauthUri, stepAt, verifyTotp } from './totp.js'

/**
 * The authenticator-code arithmetic, checked against RFC 6238's own test vectors.
 *
 * If this drifts by one bit, every code a phone shows is wrong and nobody with MFA can sign
 * in - so it is pinned to the published values rather than to itself.
 */
// RFC 6238 Appendix B: the ASCII seed "12345678901234567890" for HMAC-SHA1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('codeAt', () => {
  it('matches RFC 6238 (last six digits of each published eight-digit value)', () => {
    for (const [seconds, eight] of [
      [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
      [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130'],
    ] as const) {
      expect(codeAt(RFC_SECRET, stepAt(seconds * 1000)), String(seconds)).toBe(eight.slice(2))
    }
  })
})

describe('base32', () => {
  it('round-trips, and decodes the spaced, lower-case form people type', () => {
    const buf = Buffer.from('any bytes at all \x00\xff', 'latin1')
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true)
    expect(base32Decode('gezd gnbv-gy3t qojq').toString()).toBe('1234567890')
  })

  it('refuses characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow()
  })
})

describe('verifyTotp', () => {
  const now = 1111111111 * 1000
  const step = stepAt(now)

  it('accepts the current code and one step either side, and says which', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step), now)).toBe(step)
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step - 1), now)).toBe(step - 1)
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now)).toBe(step + 1)
  })

  it('refuses a code two steps away', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step - 2), now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step + 2), now)).toBeNull()
  })

  it('refuses a code for a step already used, which is what makes each code single-use', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step), now, step)).toBeNull()
    expect(verifyTotp(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now, step)).toBe(step + 1)
  })

  it('accepts a code typed with a space, and refuses anything that is not six digits', () => {
    const c = codeAt(RFC_SECRET, step)
    expect(verifyTotp(RFC_SECRET, `${c.slice(0, 3)} ${c.slice(3)}`, now)).toBe(step)
    for (const bad of ['', '12345', '1234567', 'abcdef', `${c}0`]) {
      expect(verifyTotp(RFC_SECRET, bad, now), bad).toBeNull()
    }
  })
})

describe('otpauthUri', () => {
  it('names the issuer twice, as both kinds of authenticator app read it', () => {
    const uri = otpauthUri('SafeChain', 'aziz@kidurong.com', 'JBSWY3DPEHPK3PXP')
    expect(uri.startsWith('otpauth://totp/SafeChain:aziz%40kidurong.com?')).toBe(true)
    const q = new URL(uri).searchParams
    expect(q.get('secret')).toBe('JBSWY3DPEHPK3PXP')
    expect(q.get('issuer')).toBe('SafeChain')
    expect(q.get('digits')).toBe('6')
    expect(q.get('period')).toBe('30')
  })
})
