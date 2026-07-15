// ─── Permission system ───────────────────────────────────────────────────────
// Capability-based, deny-by-default. UI asks "can(role, capability)" — never
// "is this the CEO?". Adding a role means editing ONE matrix, not every page.

import type { Role } from '@/api/types'

export type Capability =
  | 'dashboard:view'          // role-adaptive home
  | 'reports:submit'          // field reporting (everyone)
  | 'incidents:manage'        // triage, investigate (future module, gates nav)
  | 'actions:manage'          // corrective action tracker (future module)
  | 'analytics:view'          // trends & comparisons (future module)
  | 'compliance:manage'       // audit readiness (future module)
  | 'org:view'                // organization structure pages
  | 'org:manage'              // edit companies/sites/departments/users
  | 'audit-log:view'          // security & change history
  | 'settings:manage'         // tenant configuration

const MATRIX: Record<Role, Capability[]> = {
  ceo: ['dashboard:view', 'reports:submit', 'analytics:view', 'org:view'],
  admin: [
    'dashboard:view', 'reports:submit', 'incidents:manage', 'actions:manage',
    'analytics:view', 'compliance:manage', 'org:view', 'org:manage',
    'audit-log:view', 'settings:manage',
  ],
  hse_manager: [
    'dashboard:view', 'reports:submit', 'incidents:manage', 'actions:manage',
    'analytics:view', 'compliance:manage', 'org:view', 'audit-log:view',
  ],
  safety_officer: ['dashboard:view', 'reports:submit', 'incidents:manage', 'actions:manage', 'analytics:view'],
  supervisor: ['dashboard:view', 'reports:submit', 'actions:manage'],
  employee: ['dashboard:view', 'reports:submit'],
}

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false
  return MATRIX[role].includes(capability)
}

export function capabilitiesOf(role: Role): Capability[] {
  return [...MATRIX[role]]
}
