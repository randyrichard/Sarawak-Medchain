import { describe, expect, it } from 'vitest'
import { failedSignInSeverity } from './adminService.js'

describe('failed sign-in severity', () => {
  it('treats a few failures as a warning, not a critical alert', () => {
    // One mistyped password used to raise a critical finding advising to block the source.
    expect(failedSignInSeverity(1, 0)).toBe('warning')
    expect(failedSignInSeverity(9, 0)).toBe('warning')
  })
  it('escalates with volume, and to critical once an account is locked out', () => {
    expect(failedSignInSeverity(10, 0)).toBe('serious')
    expect(failedSignInSeverity(50, 0)).toBe('critical')
    expect(failedSignInSeverity(2, 1)).toBe('critical')
  })
})
