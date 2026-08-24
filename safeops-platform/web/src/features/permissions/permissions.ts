// ─── Permission system ───────────────────────────────────────────────────────
// Capability-based, deny-by-default. UI asks "can(role, capability)" — never
// "is this the CEO?". Adding a role means editing ONE matrix, not every page.
//
// This decides what is *drawn*. It is not the security boundary: every route re-checks
// the caller's membership and role server-side, and that check is what actually protects
// data. Removing a nav item hides a door; the lock is in the API.
//
// The `:view` capabilities below were added after auditing what each role could really do.
// Before that, thirteen of the sixteen nav items were gated on `dashboard:view`, which
// every role holds — so a shop-floor employee was shown the contractor register, the
// workforce list, audits, training and reports. The server refused every write, so nothing
// leaked, but the product looked like it was not meant for them, and that is how adoption
// is lost in the first week of a pilot.

import type { Role } from '@/api/types'

export type Capability =
  | 'dashboard:view'          // role-adaptive home
  | 'reports:submit'          // field reporting (everyone)
  // ── Seeing a module ────────────────────────────────────────────────────────
  // Deliberately separate from the :manage capabilities. Most people need to read
  // what is happening on their site without being able to change it — a worker
  // should see which permits are live, and must not be able to issue one.
  | 'incidents:view'
  | 'permits:view'
  | 'equipment:view'
  | 'visitors:view'
  | 'training:view'
  | 'workforce:view'          // employee and contractor registers
  | 'reports:view'            // generated and scheduled reports
  // ── Acting on a module ─────────────────────────────────────────────────────
  | 'incidents:manage'        // triage, investigate, advance stages
  | 'actions:manage'          // corrective action tracker
  | 'analytics:view'          // trends & comparisons
  | 'compliance:manage'       // audit readiness
  | 'org:view'                // organization structure pages
  | 'org:manage'              // edit companies/sites/departments/users
  | 'audit-log:view'          // security & change history
  | 'settings:manage'         // tenant configuration

/**
 * What each role is shown, kept deliberately close to what the API will actually let it
 * do. A menu item that always ends in "your role does not permit this" is worse than no
 * menu item.
 */
const MATRIX: Record<Role, Capability[]> = {
  /*
   * The executive: visibility, not operation.
   *
   * Previously held four capabilities and could not open Incidents from the nav at all,
   * while the API happily returned incidents to them - the UI hid what they were entitled
   * to read. They now see the safety picture across the tenant and can change none of it.
   */
  ceo: [
    'dashboard:view', 'reports:submit',
    'incidents:view', 'permits:view', 'reports:view', 'analytics:view', 'org:view',
  ],

  admin: [
    'dashboard:view', 'reports:submit',
    'incidents:view', 'permits:view', 'equipment:view', 'visitors:view',
    'training:view', 'workforce:view', 'reports:view',
    'incidents:manage', 'actions:manage', 'analytics:view', 'compliance:manage',
    'org:view', 'org:manage', 'audit-log:view', 'settings:manage',
  ],

  hse_manager: [
    'dashboard:view', 'reports:submit',
    'incidents:view', 'permits:view', 'equipment:view', 'visitors:view',
    'training:view', 'workforce:view', 'reports:view',
    'incidents:manage', 'actions:manage', 'analytics:view', 'compliance:manage',
    'org:view', 'audit-log:view',
  ],

  /*
   * Runs the safety function day to day. Matches the server, which puts this role in the
   * issuing authority for permits, the manage roles for incidents and inspections, and the
   * roles allowed to see medical detail - but not in the roles that edit the registers.
   */
  safety_officer: [
    'dashboard:view', 'reports:submit',
    'incidents:view', 'permits:view', 'equipment:view', 'visitors:view',
    'training:view', 'workforce:view', 'reports:view',
    'incidents:manage', 'actions:manage', 'analytics:view',
  ],

  /*
   * On the floor. Signs visitors and contractors through the gate, chases corrective
   * actions, and needs to know what work is live - which is why permits and visitors are
   * here. The server agrees: supervisor is in the visitor and contractor gate roles.
   */
  supervisor: [
    'dashboard:view', 'reports:submit',
    'incidents:view', 'permits:view', 'visitors:view', 'equipment:view',
    'actions:manage',
  ],

  /*
   * Reports what they see, and sees what affects them.
   *
   * Permits are included on purpose: knowing that hot work is live in the next bay is a
   * safety matter, not an administrative one. The registers, audits, training records and
   * tenant-wide reports are not - those were visible before and had no business being so.
   */
  employee: [
    'dashboard:view', 'reports:submit',
    'incidents:view', 'permits:view',
  ],
}

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false
  // Fail closed on an unrecognised role (e.g. stale persisted state) rather than throwing.
  return MATRIX[role]?.includes(capability) ?? false
}

export function capabilitiesOf(role: Role): Capability[] {
  return [...(MATRIX[role] ?? [])]
}
