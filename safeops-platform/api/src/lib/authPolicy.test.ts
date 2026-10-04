import { describe, expect, it } from 'vitest'
import { BASELINE, DEFAULT_POLICY, passwordExpired, passwordProblem, sessionEnd, strictest } from './authPolicy.js'

describe('strictest policy', () => {
  it('is the server baseline when no company sets anything', () => {
    expect(strictest([])).toEqual(BASELINE)
  })

  it('takes the strictest value of each setting across companies', () => {
    const lax = { ...DEFAULT_POLICY, passwordMinLength: 12, passwordExpiryDays: 0, lockoutThreshold: 10, sessionTimeoutHours: 720, requireSymbol: false }
    const strict = { ...DEFAULT_POLICY, passwordMinLength: 16, passwordExpiryDays: 60, lockoutThreshold: 3, sessionTimeoutHours: 8, requireSymbol: true }
    const p = strictest([lax, strict])
    expect(p).toMatchObject({ minLength: 16, expiryDays: 60, lockoutThreshold: 3, sessionTimeoutHours: 8, requireSymbol: true })
  })

  it('never goes below the server rules: a stored minimum of 10 still means 12', () => {
    expect(strictest([{ ...DEFAULT_POLICY, passwordMinLength: 10, requireUppercase: false, requireNumber: false }]))
      .toMatchObject({ minLength: 12, requireUppercase: true, requireNumber: true })
  })

  it('treats an expiry of 0 as never, not as already expired', () => {
    expect(strictest([{ ...DEFAULT_POLICY, passwordExpiryDays: 0 }]).expiryDays).toBeNull()
    expect(strictest([{ ...DEFAULT_POLICY, passwordExpiryDays: 0 }, { ...DEFAULT_POLICY, passwordExpiryDays: 45 }]).expiryDays).toBe(45)
  })
})

describe('policy checks', () => {
  const p = { ...BASELINE, minLength: 16, requireSymbol: true, expiryDays: 30, sessionTimeoutHours: 8 }

  it('names the rule a password misses', () => {
    expect(passwordProblem('short', p)).toMatch(/12 characters/) // the server's own rule first
    expect(passwordProblem('Fifteen-chars-1', p)).toMatch(/at least 16 characters/)
    expect(passwordProblem('SixteenCharsNoSym1', p)).toMatch(/symbol/)
    expect(passwordProblem('Sixteen-Chars-Ok-1', p)).toBeNull()
  })

  it('expires a password on the day the policy says, and never without an expiry', () => {
    const now = new Date('2026-10-05T00:00:00Z')
    expect(passwordExpired(new Date('2026-09-06T00:00:01Z'), p, now)).toBe(false)
    expect(passwordExpired(new Date('2026-09-05T00:00:00Z'), p, now)).toBe(true)
    expect(passwordExpired(new Date('2000-01-01'), { ...p, expiryDays: null }, now)).toBe(false)
  })

  it('ends a session the timeout after it started', () => {
    expect(sessionEnd(new Date('2026-10-05T00:00:00Z'), p).toISOString()).toBe('2026-10-05T08:00:00.000Z')
  })
})
