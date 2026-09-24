// ─── Administration catalogue ────────────────────────────────────────────────
// The integration directory and the default permission matrix. These ship with the
// product and are identical for every tenant, so they are constants; what a workspace
// has actually connected or changed lives in rows.

export const RBAC_MODULES = [
  'mission_control', 'incidents', 'actions', 'assets', 'audits', 'training', 'admin',
] as const
export type RbacModule = (typeof RBAC_MODULES)[number]

export const RBAC_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const
export type RbacAction = (typeof RBAC_ACTIONS)[number]

export const MODULE_LABEL: Record<RbacModule, string> = {
  mission_control: 'Mission Control',
  incidents: 'Incidents',
  actions: 'Corrective Actions',
  assets: 'Assets & Inspections',
  audits: 'Audit & Compliance',
  training: 'Training',
  admin: 'Administration',
}

export type PermissionMatrix = Record<RbacModule, RbacAction[]>

const ALL: RbacAction[] = [...RBAC_ACTIONS]

function matrix(spec: Partial<PermissionMatrix>): PermissionMatrix {
  return {
    mission_control: spec.mission_control ?? [],
    incidents: spec.incidents ?? [],
    actions: spec.actions ?? [],
    assets: spec.assets ?? [],
    audits: spec.audits ?? [],
    training: spec.training ?? [],
    admin: spec.admin ?? [],
  }
}

export interface SystemRoleSpec {
  roleId: string
  name: string
  description: string
  permissions: PermissionMatrix
}

/**
 * The roles that ship with the product.
 *
 * `roleId` matches the Membership.role enum for the six roles the services actually
 * authorise against; the rest exist so the console can describe intended access for
 * roles a tenant assigns by other means.
 */
export const SYSTEM_ROLES: SystemRoleSpec[] = [
  {
    roleId: 'admin',
    name: 'Administrator',
    description: 'Full platform access including user management and security.',
    permissions: matrix({
      mission_control: ALL, incidents: ALL, actions: ALL, assets: ALL,
      audits: ALL, training: ALL, admin: ALL,
    }),
  },
  {
    roleId: 'ceo',
    name: 'Executive',
    description: 'Organisation-wide visibility and reporting, no day-to-day editing.',
    permissions: matrix({
      mission_control: ['view', 'export'], incidents: ['view', 'export'],
      actions: ['view', 'export'], assets: ['view', 'export'],
      audits: ['view', 'export'], training: ['view', 'export'],
    }),
  },
  {
    roleId: 'hse_manager',
    name: 'HSE Manager',
    description: 'Runs the safety programme: investigations, audits, verification and closure.',
    permissions: matrix({
      mission_control: ['view', 'export'],
      incidents: ['view', 'create', 'edit', 'approve', 'export'],
      actions: ['view', 'create', 'edit', 'approve', 'export'],
      assets: ['view', 'create', 'edit', 'export'],
      audits: ['view', 'create', 'edit', 'approve', 'export'],
      training: ['view', 'create', 'edit', 'approve', 'export'],
    }),
  },
  {
    roleId: 'safety_officer',
    name: 'Safety Officer',
    description: 'Site-level delivery: reporting, permits, inspections and training sessions.',
    permissions: matrix({
      mission_control: ['view'],
      incidents: ['view', 'create', 'edit'],
      actions: ['view', 'create', 'edit'],
      assets: ['view', 'create', 'edit'],
      audits: ['view', 'create', 'edit'],
      training: ['view', 'create', 'edit'],
    }),
  },
  {
    roleId: 'supervisor',
    name: 'Supervisor',
    description: 'Reports incidents and progresses the actions assigned to their team.',
    permissions: matrix({
      mission_control: ['view'],
      incidents: ['view', 'create'],
      actions: ['view', 'edit'],
      assets: ['view'],
      audits: ['view'],
      training: ['view'],
    }),
  },
  {
    roleId: 'employee',
    name: 'Employee',
    description: 'Reports what they see and tracks their own competency.',
    permissions: matrix({
      mission_control: ['view'],
      incidents: ['view', 'create'],
      actions: ['view'],
      training: ['view'],
    }),
  },
]

export interface ConnectorSpec {
  id: string
  name: string
  category: 'identity' | 'communication' | 'erp' | 'hr' | 'developer' | 'data'
  description: string
  /**
   * `planned` means the directory lists it and the product cannot yet deliver through it.
   *
   * Every connector here is currently planned. A stored config is written and never read
   * by anything - no alert is posted to Slack or Teams, no directory is queried for
   * sign-on - so presenting them as available asked a customer's IT for a production
   * credential in exchange for nothing, and reported "Connected" afterwards. The first
   * person to notice would have been an administrator asking why single sign-on did not
   * work, in week one of a paid pilot.
   *
   * Listing them as planned keeps the roadmap visible, which is worth something in a sales
   * conversation, without collecting a secret that goes nowhere.
   */
  status: 'available' | 'planned'
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[]
}

/** The integration directory. What a tenant has connected is a ConnectorConfig row. */
export const CONNECTORS: ConnectorSpec[] = [
  {
    id: 'azure-ad', name: 'Microsoft Entra ID', category: 'identity', status: 'planned',
    description: 'Single sign-on and automatic user provisioning from your directory.',
    // Fields return when the connector does. A planned integration that still renders a
    // form invites somebody to hand over a production credential for something that has
    // nowhere to send it.
    fields: [],
  },
  {
    id: 'slack', name: 'Slack', category: 'communication', status: 'planned',
    description: 'Post incident and escalation alerts into a channel.',
    // Fields return when the connector does. A planned integration that still renders a
    // form invites somebody to hand over a production credential for something that has
    // nowhere to send it.
    fields: [],
  },
  {
    id: 'teams', name: 'Microsoft Teams', category: 'communication', status: 'planned',
    description: 'Send the same alerts to a Teams channel.',
    // Fields return when the connector does. A planned integration that still renders a
    // form invites somebody to hand over a production credential for something that has
    // nowhere to send it.
    fields: [],
  },
  {
    id: 'powerbi', name: 'Power BI', category: 'data', status: 'planned',
    description: 'Expose the safety dataset to your own reporting.',
    // Fields return when the connector does. A planned integration that still renders a
    // form invites somebody to hand over a production credential for something that has
    // nowhere to send it.
    fields: [],
  },
]

export const WEBHOOK_EVENTS = [
  'incident.created', 'incident.closed', 'action.assigned', 'action.verified',
  'inspection.failed', 'audit.finding.raised', 'certificate.issued', 'certificate.expiring',
]

/** Background jobs the platform runs. Described here; their state is observed, not stored. */
/**
 * What the platform runs on a schedule.
 *
 * These descriptions are read by a customer deciding whether to trust the system, so they
 * state what actually happens. j1 and j2 are the sweeps in `scheduler.ts` and report a
 * real last-run time. j3 has no implementation and says so rather than showing a green
 * tick. j4 writes a restore point into the database — useful for undoing a bad import,
 * and not a substitute for `pg_dump` to storage off this host.
 */
export const BACKGROUND_JOBS = [
  { id: 'j1', name: 'Reminder & escalation sweep', schedule: 'Every 15 min', detail: 'Action reminders, escalations and overdue inspections' },
  { id: 'j2', name: 'Certificate expiry scan', schedule: 'Every 15 min', detail: 'Competency expiry bands at 90/60/30/7 days' },
  { id: 'j3', name: 'Score snapshot', schedule: 'Not scheduled', detail: 'Monthly score freeze — not yet implemented' },
  { id: 'j4', name: 'Workspace restore point', schedule: 'On demand', detail: 'In-database snapshot; disaster recovery uses pg_dump' },
  { id: 'j6', name: 'Webhook delivery', schedule: 'Every 30 sec', detail: 'Sends queued events, and retries what failed' },
]
