import { describe, it, expect } from 'vitest'
import { canManageTraining, canRunSessions, certStatusKind } from './lib'

describe('training — authority', () => {
  it('lets only admin and HSE manager manage the catalog & matrix', () => {
    expect(canManageTraining('admin')).toBe(true)
    expect(canManageTraining('hse_manager')).toBe(true)
    expect(canManageTraining('safety_officer')).toBe(false)
    expect(canManageTraining('supervisor')).toBe(false)
    expect(canManageTraining('employee')).toBe(false)
    expect(canManageTraining(null)).toBe(false)
  })

  it('lets safety officer and above run/assess sessions', () => {
    expect(canRunSessions('admin')).toBe(true)
    expect(canRunSessions('hse_manager')).toBe(true)
    expect(canRunSessions('safety_officer')).toBe(true)
    expect(canRunSessions('supervisor')).toBe(false)
    expect(canRunSessions('employee')).toBe(false)
    expect(canRunSessions(null)).toBe(false)
  })
})

describe('training — certStatusKind()', () => {
  it('maps certificate status to the correct UI tone', () => {
    expect(certStatusKind('competent')).toBe('good')
    expect(certStatusKind('expiring')).toBe('warning')
    expect(certStatusKind('expired')).toBe('critical')
  })
})
