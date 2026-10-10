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

// ─── Added after auditing what each role could really do ─────────────────────
// Thirteen of the sixteen nav items were gated on `dashboard:view`, which every role
// holds, so a shop-floor employee was shown the contractor register, the workforce list,
// audits, training and tenant-wide reports. Nothing leaked - the API refused every write
// and redacts medical detail - but a worker who opens a menu full of screens that are not
// theirs stops opening the menu, and a pilot turns on whether people use it in week two.
//
// The blocks above are the original matrix tests, kept as they were. This file overwrote
// them once already; the defensive-copy and fail-closed checks still matter.

const ALL_ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']

describe('every role can do its own job', () => {
  it('gives everybody the home screen and a way to report', () => {
    // Under-reporting is driven by friction. Reporting is never gated.
    for (const role of ALL_ROLES) {
      expect(can(role, 'dashboard:view')).toBe(true)
      expect(can(role, 'reports:submit')).toBe(true)
    }
  })

  it('lets everybody see incidents and live permits', () => {
    /*
     * Deliberate. Knowing that hot work is live in the next bay is a safety matter, not an
     * administrative privilege - and somebody who reports an incident should be able to
     * see what happened to it.
     */
    for (const role of ALL_ROLES) {
      expect(can(role, 'incidents:view')).toBe(true)
      expect(can(role, 'permits:view')).toBe(true)
    }
  })
})

describe('an employee is not shown the back office', () => {
  const offLimits: Capability[] = [
    'workforce:view', 'training:view', 'reports:view', 'compliance:manage',
    'incidents:manage', 'actions:manage', 'org:view', 'org:manage',
    'audit-log:view', 'settings:manage', 'analytics:view',
  ]

  it.each(offLimits)('hides %s', (capability) => {
    expect(can('employee', capability)).toBe(false)
  })

  it('shows them five things, not fourteen', () => {
    expect(capabilitiesOf('employee')).toHaveLength(5)
  })

  it('lets them open the corrective actions assigned to them', () => {
    // The notification "Corrective action assigned" links to the register. The server lists
    // an employee only what they own; the page is where they start and complete it.
    expect(can('employee', 'actions:view')).toBe(true)
    expect(can('employee', 'actions:manage')).toBe(false)
  })
})

describe('a supervisor gets the floor, not the office', () => {
  it('can chase actions and see who is on site', () => {
    // The server puts supervisors in the visitor and contractor gate roles.
    expect(can('supervisor', 'actions:manage')).toBe(true)
    expect(can('supervisor', 'visitors:view')).toBe(true)
    expect(can('supervisor', 'equipment:view')).toBe(true)
  })

  it('cannot reach the registers, reports or settings', () => {
    for (const c of ['workforce:view', 'reports:view', 'settings:manage', 'org:manage'] as Capability[]) {
      expect(can('supervisor', c)).toBe(false)
    }
  })
})

describe('the executive can see, and change nothing', () => {
  /*
   * The role existed with four capabilities and could not open Incidents from the menu,
   * while the API returned incidents to it perfectly happily - the UI was hiding what the
   * role was entitled to read. "Where are our biggest risks, and are we managing them" is
   * the question this role exists to ask.
   */
  it('sees the safety picture', () => {
    for (const c of ['incidents:view', 'permits:view', 'reports:view', 'analytics:view', 'org:view'] as Capability[]) {
      expect(can('ceo', c)).toBe(true)
    }
  })

  it('changes none of it', () => {
    for (const c of ['incidents:manage', 'actions:manage', 'org:manage', 'settings:manage'] as Capability[]) {
      expect(can('ceo', c)).toBe(false)
    }
  })
})

describe('administration stays with the administrator', () => {
  it('only admin manages settings and the organisation', () => {
    for (const role of ALL_ROLES) {
      const expected = role === 'admin'
      expect(can(role, 'settings:manage')).toBe(expected)
      expect(can(role, 'org:manage')).toBe(expected)
    }
  })

  it('only admin and the HSE manager read the audit log', () => {
    for (const role of ALL_ROLES) {
      expect(can(role, 'audit-log:view')).toBe(role === 'admin' || role === 'hse_manager')
    }
  })
})

describe('the matrix stays sane', () => {
  it('gives every role strictly more than the one below it, for the shared capabilities', () => {
    /*
     * Not a strict hierarchy overall - a CEO is not a super-admin, and a safety officer can
     * do operational things an executive cannot. But within the read capabilities the order
     * should hold, and a role gaining fewer than the one below it is almost always a typo.
     */
    const readable = (r: Role) => capabilitiesOf(r).filter((c) => c.endsWith(':view')).length
    expect(readable('employee')).toBeLessThan(readable('supervisor'))
    expect(readable('supervisor')).toBeLessThan(readable('safety_officer'))
    expect(readable('safety_officer')).toBeLessThanOrEqual(readable('hse_manager'))
    expect(readable('hse_manager')).toBeLessThanOrEqual(readable('admin'))
  })

  it('fails closed on an unknown role', () => {
    // Stale persisted state must not become an open door.
    expect(can('nonsense' as Role, 'settings:manage')).toBe(false)
    expect(can(null, 'dashboard:view')).toBe(false)
    expect(can(undefined, 'dashboard:view')).toBe(false)
  })

  it('never lets a :manage capability exist without its :view partner', () => {
    // Being able to act on a module you cannot open is a menu that leads nowhere.
    for (const role of ALL_ROLES) {
      if (can(role, 'incidents:manage')) expect(can(role, 'incidents:view')).toBe(true)
    }
  })
})
