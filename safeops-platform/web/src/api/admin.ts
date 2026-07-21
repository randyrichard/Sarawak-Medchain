// ─── Enterprise administration domain ────────────────────────────────────────
// Governance, security and integration layer. Everything here is real, stored
// state — user lifecycle, an editable RBAC matrix, an append-only audit log,
// an integration framework, API keys/webhooks, and genuine backup/restore.

export type RbacRoleId =
  | 'ceo' | 'admin' | 'hse_manager' | 'safety_officer' | 'supervisor'
  | 'hr' | 'maintenance' | 'employee' | 'guest' | string // custom roles use their own id

export const RBAC_MODULES = [
  'mission_control', 'incidents', 'actions', 'assets', 'audits', 'training', 'admin',
] as const
export type RbacModule = (typeof RBAC_MODULES)[number]

export const MODULE_LABEL: Record<RbacModule, string> = {
  mission_control: 'Mission Control',
  incidents: 'Incidents',
  actions: 'Corrective Actions',
  assets: 'Assets & Inspections',
  audits: 'Audit & Compliance',
  training: 'Training',
  admin: 'Administration',
}

export const RBAC_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const
export type RbacAction = (typeof RBAC_ACTIONS)[number]

export interface RoleDef {
  id: RbacRoleId
  name: string
  description: string
  system: boolean // predefined roles cannot be deleted
  permissions: Record<RbacModule, RbacAction[]>
  userCount?: number
}

export type UserStatus = 'active' | 'invited' | 'deactivated' | 'locked'

export interface AdminUser {
  id: string
  name: string
  email: string
  role: RbacRoleId
  status: UserStatus
  mfaEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  siteIds: string[]
  department?: string
  forcePasswordReset?: boolean
  failedLogins?: number
  weakPassword?: boolean
}

export interface LoginEvent {
  id: string
  at: string
  userId: string
  userName: string
  email: string
  ip: string
  device: string
  location: string
  result: 'success' | 'failed' | 'mfa_challenge'
  suspicious?: boolean
}

export interface UserDevice {
  id: string
  userId: string
  name: string
  browser: string
  os: string
  lastSeen: string
  ip: string
  trusted: boolean
  current?: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  actorRole: string
  action: string
  module: RbacModule | 'auth' | 'system'
  target: string
  ip: string
  device: string
  oldValue?: string
  newValue?: string
}

export interface AuditFilters {
  q?: string
  module?: RbacModule | 'auth' | 'system' | ''
  actor?: string
}

// ─── Integrations ────────────────────────────────────────────────────────────

export type ConnectorStatus = 'connected' | 'available' | 'coming_soon'
export type ConnectorCategory = 'identity' | 'communication' | 'erp' | 'hr' | 'developer' | 'data'

export interface ConnectorField {
  key: string
  label: string
  placeholder: string
  secret?: boolean
}

export interface Connector {
  id: string
  name: string
  category: ConnectorCategory
  status: ConnectorStatus
  description: string
  capability: string
  fields: ConnectorField[]
  config?: Record<string, string>
  connectedAt?: string
  connectedBy?: string
}

// ─── API management ──────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  name: string
  prefix: string
  masked: string
  scopes: RbacAction[]
  createdAt: string
  createdBy: string
  lastUsedAt: string | null
  callsToday: number
  revoked: boolean
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  secretMasked: string
  createdAt: string
  lastDelivery?: { at: string; status: 'success' | 'failed'; code: number }
}

export const WEBHOOK_EVENTS = [
  'incident.created', 'incident.closed', 'action.assigned', 'action.verified',
  'inspection.failed', 'audit.finding.raised', 'certificate.issued', 'certificate.expiring',
]

export interface ApiUsagePoint {
  label: string
  calls: number
  errors: number
}

// ─── Security ────────────────────────────────────────────────────────────────

export interface SecuritySettings {
  passwordMinLength: number
  requireUppercase: boolean
  requireNumber: boolean
  requireSymbol: boolean
  passwordExpiryDays: number
  lockoutThreshold: number
  sessionTimeoutHours: number
  mfaRequired: boolean
}

export interface SecurityFinding {
  id: string
  severity: 'critical' | 'serious' | 'warning' | 'good'
  title: string
  detail: string
  metric: string
}

export interface SecurityCenter {
  mfaAdoptionPct: number
  mfaEnabledCount: number
  totalUsers: number
  inactiveUsers: number
  weakPasswords: number
  suspiciousLogins: number
  pendingInvites: number
  lockedAccounts: number
  findings: SecurityFinding[]
}

// ─── Organisation config ─────────────────────────────────────────────────────

export interface OrgSettings {
  companyId: string
  displayName: string
  legalName: string
  industry: string
  timezone: string
  language: string
  brandAccent: string
  logoInitials: string
}

export interface JobPosition { id: string; title: string; department: string; headcount: number }
export interface ShiftPattern { id: string; name: string; start: string; end: string; days: string }
export interface Holiday { id: string; date: string; name: string; scope: string }
export interface BusinessUnit { id: string; name: string; lead: string; sites: number }

// ─── System health & backup ──────────────────────────────────────────────────

export interface BackgroundJob {
  id: string
  name: string
  schedule: string
  lastRun: string
  status: 'ok' | 'running' | 'failed'
  detail: string
}

export interface SystemHealth {
  usersOnline: number
  apiStatus: 'operational' | 'degraded' | 'down'
  apiLatencyMs: number
  dbStatus: 'operational' | 'degraded' | 'down'
  storageUsedKb: number
  storageQuotaKb: number
  failedNotifications: number
  jobs: BackgroundJob[]
  alerts: { id: string; severity: 'critical' | 'warning' | 'info'; text: string; at: string }[]
  uptimePct: number
}

export interface Backup {
  id: string
  at: string
  sizeKb: number
  by: string
  type: 'manual' | 'auto'
  note: string
  restorable: boolean
}

export interface RetentionSettings {
  auditLogDays: number
  backupCount: number
  closedIncidentYears: number
  autoBackupDaily: boolean
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface NewUserInput {
  name: string
  email: string
  role: RbacRoleId
  siteIds: string[]
  department?: string
  sendInvite: boolean
}

export interface AdminActor {
  name: string
  role: string
  ip: string
  device: string
}
