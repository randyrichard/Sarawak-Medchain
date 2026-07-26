import { describe, it, expect } from 'vitest'
import type { Role } from '@/api/types'
import { can, capabilitiesOf, type Capability } from './permissions'

const ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']

describe('permissions — can()', () => {
  it('denies when no role is present (deny-by-default)', () => {
    expect(can(null, 'dashboard:view')).toBe(false)
    expect(can(undefined, 'settings:manage')).toBe(false)
  })

  it('fails closed (no throw, denies) for an unrecognised role', () => {
    const ghost = 'intruder' as unknown as Role
    expect(() => can(ghost, 'dashboard:view')).not.toThrow()
    expect(can(ghost, 'dashboard:view')).toBe(false)
  })

  it('grants every capability the matrix lists for each role', () => {
    for (const role of ROLES) {
      for (const cap of capabilitiesOf(role)) {
        expect(can(role, cap)).toBe(true)
      }
    }
  })

  it('gives dashboard:view and reports:submit to every role', () => {
    for (const role of ROLES) {
      expect(can(role, 'dashboard:view')).toBe(true)
      expect(can(role, 'reports:submit')).toBe(true)
    }
  })

  it('restricts tenant settings and org structure to admin only', () => {
    for (const role of ROLES) {
      const isAdmin = role === 'admin'
      expect(can(role, 'settings:manage')).toBe(isAdmin)
      expect(can(role, 'org:manage')).toBe(isAdmin)
    }
  })

  it('enforces the key privilege boundaries between roles', () => {
    // Incident management starts at safety officer.
    expect(can('employee', 'incidents:manage')).toBe(false)
    expect(can('supervisor', 'incidents:manage')).toBe(false)
    expect(can('safety_officer', 'incidents:manage')).toBe(true)
    // Security/audit history is manager-and-above.
    expect(can('safety_officer', 'audit-log:view')).toBe(false)
    expect(can('hse_manager', 'audit-log:view')).toBe(true)
    expect(can('hse_manager', 'settings:manage')).toBe(false)
    // CEO is a read-only executive: insight, not operational control.
    expect(can('ceo', 'incidents:manage')).toBe(false)
    expect(can('ceo', 'analytics:view')).toBe(true)
  })
})

describe('permissions — capabilitiesOf()', () => {
  it('returns a defensive copy that cannot mutate the source matrix', () => {
    const caps = capabilitiesOf('employee')
    const original = caps.length
    caps.push('settings:manage' as Capability)
    expect(can('employee', 'settings:manage')).toBe(false)
    expect(capabilitiesOf('employee')).toHaveLength(original)
  })

  it('returns an empty capability set for an unrecognised role', () => {
    expect(capabilitiesOf('ghost' as unknown as Role)).toEqual([])
  })
})
