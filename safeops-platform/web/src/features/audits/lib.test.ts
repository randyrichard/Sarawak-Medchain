import { describe, it, expect } from 'vitest'
import { isComplianceManager, scoreColor } from './lib'

describe('audits — authority', () => {
  it('recognises only admin and HSE manager as compliance managers', () => {
    expect(isComplianceManager('admin')).toBe(true)
    expect(isComplianceManager('hse_manager')).toBe(true)
    expect(isComplianceManager('safety_officer')).toBe(false)
    expect(isComplianceManager('supervisor')).toBe(false)
    expect(isComplianceManager('employee')).toBe(false)
    expect(isComplianceManager(null)).toBe(false)
  })
})

describe('audits — scoreColor() thresholds', () => {
  it('is good at or above 85', () => {
    expect(scoreColor(85)).toBe('var(--good)')
    expect(scoreColor(100)).toBe('var(--good)')
  })

  it('is a warning in the [70, 85) band', () => {
    expect(scoreColor(84)).toBe('var(--warning)')
    expect(scoreColor(70)).toBe('var(--warning)')
  })

  it('is critical below 70', () => {
    expect(scoreColor(69)).toBe('var(--critical)')
    expect(scoreColor(0)).toBe('var(--critical)')
  })
})
