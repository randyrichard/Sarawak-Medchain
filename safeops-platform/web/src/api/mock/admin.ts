// ─── Enterprise administration store ─────────────────────────────────────────
// Real, persisted governance state. Mutations write to an append-only audit log
// and (where relevant) emit notifications. Backup/restore genuinely snapshots
// and reloads the whole platform's localStorage.

import { ApiError } from '../types'
import type {
  AdminActor, AdminUser, ApiKey, AuditEntry, AuditFilters, Backup, BusinessUnit, Connector,
  Holiday, JobPosition, LoginEvent, NewUserInput, OrgSettings, RbacAction, RbacModule, RoleDef,
  RetentionSettings, SecurityCenter, SecurityFinding, SecuritySettings, ShiftPattern, SystemHealth,
  UserDevice, Webhook,
} from '../admin'
import { RBAC_MODULES } from '../admin'
import { DEPARTMENTS, EMPLOYEES, SITES, USERS } from './fixtures'

type Notify = (kind: 'incident' | 'action' | 'audit' | 'system', title: string, detail: string) => void

const OPS_KEY = 'safeops.incidents.v1'
const ADMIN_KEY = 'safeops.admin.v1'

const now = () => new Date().toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString()

const IPS = ['203.82.14.6', '175.140.22.91', '60.51.108.44', '118.100.9.212', '202.75.44.7']
const DEVICES = ['Chrome · Windows 11', 'Edge · Windows 11', 'Safari · macOS', 'Chrome · Android', 'Safari · iOS']
const LOCS = ['Kuching, MY', 'Bintulu, MY', 'Miri, MY', 'Kuala Lumpur, MY', 'Singapore, SG']

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length]

// ─── RBAC default permission templates ───────────────────────────────────────

const ALL: RbacAction[] = ['view', 'create', 'edit', 'delete', 'approve', 'export']
const roleSpec = (spec: Partial<Record<RbacModule, RbacAction[]>>): Record<RbacModule, RbacAction[]> => {
  const out = {} as Record<RbacModule, RbacAction[]>
  for (const m of RBAC_MODULES) out[m] = spec[m] ?? []
  return out
}

function buildRoles(): RoleDef[] {
  return [
    { id: 'ceo', name: 'CEO / Executive', description: 'Read-only visibility across the whole platform.', system: true,
      permissions: roleSpec({ mission_control: ['view', 'export'], incidents: ['view', 'export'], actions: ['view', 'export'], assets: ['view', 'export'], audits: ['view', 'export'], training: ['view', 'export'], admin: ['view'] }) },
    { id: 'admin', name: 'Administrator', description: 'Full platform control including administration.', system: true,
      permissions: roleSpec({ mission_control: ALL, incidents: ALL, actions: ALL, assets: ALL, audits: ALL, training: ALL, admin: ALL }) },
    { id: 'hse_manager', name: 'HSE Manager', description: 'Manages the full safety programme across sites.', system: true,
      permissions: roleSpec({ mission_control: ['view', 'export'], incidents: ['view', 'create', 'edit', 'approve', 'export'], actions: ['view', 'create', 'edit', 'approve', 'export'], assets: ['view', 'create', 'edit', 'export'], audits: ['view', 'create', 'edit', 'approve', 'export'], training: ['view', 'create', 'edit', 'export'], admin: ['view'] }) },
    { id: 'safety_officer', name: 'Safety Officer', description: 'Runs incidents, inspections and training at their site.', system: true,
      permissions: roleSpec({ mission_control: ['view'], incidents: ['view', 'create', 'edit', 'export'], actions: ['view', 'create', 'edit'], assets: ['view', 'create', 'edit'], audits: ['view'], training: ['view', 'create', 'edit'] }) },
    { id: 'supervisor', name: 'Supervisor', description: 'Department-level visibility and action ownership.', system: true,
      permissions: roleSpec({ mission_control: ['view'], incidents: ['view', 'create'], actions: ['view', 'edit'], assets: ['view'], training: ['view'] }) },
    { id: 'hr', name: 'HR Manager', description: 'Owns the training and competency programme.', system: true,
      permissions: roleSpec({ mission_control: ['view'], training: ['view', 'create', 'edit', 'export'], admin: ['view'] }) },
    { id: 'maintenance', name: 'Maintenance', description: 'Asset inspections and maintenance actions.', system: true,
      permissions: roleSpec({ mission_control: ['view'], incidents: ['view'], actions: ['view', 'edit'], assets: ['view', 'create', 'edit'] }) },
    { id: 'employee', name: 'Employee', description: 'Reports hazards and views their own record.', system: true,
      permissions: roleSpec({ mission_control: ['view'], incidents: ['create'], training: ['view'] }) },
    { id: 'guest', name: 'Guest', description: 'Restricted read-only access for auditors and visitors.', system: true,
      permissions: roleSpec({ mission_control: ['view'] }) },
  ]
}

const ROLE_NAME: Record<string, string> = {
  ceo: 'CEO / Executive', admin: 'Administrator', hse_manager: 'HSE Manager', safety_officer: 'Safety Officer',
  supervisor: 'Supervisor', hr: 'HR Manager', maintenance: 'Maintenance', employee: 'Employee', guest: 'Guest',
}

// ─── Seeds ───────────────────────────────────────────────────────────────────

function roleForPosition(position: string): string {
  const p = position.toLowerCase()
  if (p.includes('safety officer') || p.includes('hse')) return 'safety_officer'
  if (p.includes('supervisor') || p.includes('lead') || p.includes('master') || p.includes('agent')) return 'supervisor'
  if (p.includes('maintenance') || p.includes('technician') || p.includes('engineer')) return 'maintenance'
  return 'employee'
}

function buildUsers(): AdminUser[] {
  const users: AdminUser[] = []
  // 1) the real login accounts (per company membership)
  USERS.forEach((u, i) => {
    const m = u.memberships[0]
    users.push({
      id: u.id, name: u.name, email: u.email, role: m.role,
      status: 'active', mfaEnabled: m.role === 'admin' || m.role === 'ceo' || m.role === 'hse_manager',
      lastLoginAt: hoursAgo(i + 1), createdAt: daysAgo(300 - i * 10),
      siteIds: m.siteIds, failedLogins: 0,
    })
  })
  // 2) directory accounts derived from the workforce
  EMPLOYEES.forEach((e, i) => {
    const dept = DEPARTMENTS.find((d) => d.id === e.departmentId)?.name
    const emailName = e.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').slice(0, 2).join('.')
    const role = roleForPosition(e.position)
    const status: AdminUser['status'] = i === 4 ? 'invited' : i === 9 ? 'deactivated' : i === 14 ? 'locked' : 'active'
    users.push({
      id: `au-${e.id}`, name: e.name, email: `${emailName}@${e.companyId === 'kcs' ? 'kenyalang' : 'borneo-ind'}.com.my`,
      role, status,
      mfaEnabled: i % 3 === 0, lastLoginAt: status === 'invited' ? null : daysAgo((i * 7) % 95),
      createdAt: daysAgo(250 - i * 6), siteIds: [e.siteId], department: dept,
      failedLogins: status === 'locked' ? 5 : 0,
      weakPassword: i === 2 || i === 11 || i === 16,
      forcePasswordReset: i === 7,
    })
  })
  return users
}

function buildLoginHistory(users: AdminUser[]): LoginEvent[] {
  const events: LoginEvent[] = []
  let n = 0
  users.filter((u) => u.lastLoginAt).slice(0, 16).forEach((u, i) => {
    events.push({
      id: `le-${++n}`, at: u.lastLoginAt!, userId: u.id, userName: u.name, email: u.email,
      ip: pick(IPS, i), device: pick(DEVICES, i), location: pick(LOCS, i),
      result: u.mfaEnabled ? 'success' : 'success',
    })
  })
  // a couple of failed + suspicious attempts
  events.push({ id: `le-${++n}`, at: hoursAgo(5), userId: 'u-hse', userName: 'Marcus Tan', email: 'hse@demo.safeops.app', ip: '45.146.26.18', device: 'Unknown · Linux', location: 'Amsterdam, NL', result: 'failed', suspicious: true })
  events.push({ id: `le-${++n}`, at: hoursAgo(5.1), userId: 'u-hse', userName: 'Marcus Tan', email: 'hse@demo.safeops.app', ip: '45.146.26.18', device: 'Unknown · Linux', location: 'Amsterdam, NL', result: 'failed', suspicious: true })
  events.push({ id: `le-${++n}`, at: daysAgo(1), userId: 'au-e15', userName: 'Siti Aminah', email: 'siti.aminah@borneo-ind.com.my', ip: pick(IPS, 2), device: 'Chrome · Android', location: 'Bintulu, MY', result: 'failed' })
  return events.sort((a, b) => b.at.localeCompare(a.at))
}

function buildAuditSeed(): AuditEntry[] {
  const e = (over: Partial<AuditEntry>, i: number): AuditEntry => ({
    id: `ax-${i}`, at: hoursAgo(i * 3), actor: 'Marcus Tan', actorRole: 'HSE Manager',
    action: '', module: 'system', target: '', ip: pick(IPS, i), device: pick(DEVICES, i), ...over,
  })
  const raw: Partial<AuditEntry>[] = [
    { action: 'Closed audit', module: 'audits', target: 'AUD-3002 · DOSH readiness walk' },
    { action: 'Verified corrective action', module: 'actions', target: 'CA-903', oldValue: 'Completed', newValue: 'Verified' },
    { action: 'Issued certificate', module: 'training', target: 'CERT-2026-2000 · Siti Aminah', actor: 'Grace Lim', actorRole: 'Safety Officer' },
    { action: 'Completed inspection', module: 'assets', target: 'INS-2064 · Reach truck RT-07', newValue: 'Failed · 1 defect' },
    { action: 'Advanced incident', module: 'incidents', target: 'INC-2607', oldValue: 'Investigation', newValue: 'RCA Review' },
    { action: 'Deactivated user', module: 'admin', target: 'kenny.lau@borneo-ind.com.my', actor: 'Randy Richard', actorRole: 'Administrator', oldValue: 'active', newValue: 'deactivated' },
    { action: 'Generated API key', module: 'admin', target: 'Power BI export key', actor: 'Randy Richard', actorRole: 'Administrator' },
    { action: 'Updated role permissions', module: 'admin', target: 'Supervisor · Actions', actor: 'Randy Richard', actorRole: 'Administrator', oldValue: 'view', newValue: 'view, edit' },
    { action: 'Raised corrective action', module: 'training', target: 'CA-916 · Ganesh Pillai LOTO lapse', actor: 'Marcus Tan', actorRole: 'HSE Manager' },
    { action: 'Approved root cause', module: 'incidents', target: 'INC-2604', oldValue: 'RCA Review', newValue: 'Verification' },
    { action: 'Changed session timeout', module: 'admin', target: 'Security policy', actor: 'Randy Richard', actorRole: 'Administrator', oldValue: '8h', newValue: '8h' },
    { action: 'Created backup', module: 'system', target: 'Manual snapshot', actor: 'Randy Richard', actorRole: 'Administrator' },
  ]
  return raw.map((r, i) => e(r, i + 1))
}

function buildConnectors(): Connector[] {
  return [
    { id: 'entra', name: 'Microsoft Entra ID', category: 'identity', status: 'available', description: 'SSO and automated user provisioning via SAML / SCIM.', capability: 'SSO · SCIM provisioning',
      fields: [{ key: 'tenant', label: 'Directory (tenant) ID', placeholder: '00000000-0000-0000-0000-000000000000' }, { key: 'client', label: 'Application (client) ID', placeholder: 'app id' }, { key: 'secret', label: 'Client secret', placeholder: '••••••••', secret: true }] },
    { id: 'google', name: 'Google Workspace', category: 'identity', status: 'available', description: 'SSO and directory sync for Google-based organisations.', capability: 'SSO · Directory sync',
      fields: [{ key: 'domain', label: 'Primary domain', placeholder: 'company.com' }, { key: 'key', label: 'Service account key (JSON)', placeholder: 'paste key', secret: true }] },
    { id: 'slack', name: 'Slack', category: 'communication', status: 'connected', description: 'Route critical incident and escalation alerts to channels.', capability: 'Alert routing',
      fields: [{ key: 'webhook', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/…', secret: true }, { key: 'channel', label: 'Default channel', placeholder: '#safeops-alerts' }],
      config: { channel: '#hse-alerts' }, connectedAt: daysAgo(45), connectedBy: 'Randy Richard' },
    { id: 'teams', name: 'Microsoft Teams', category: 'communication', status: 'available', description: 'Post alerts and digests to Teams channels via connectors.', capability: 'Alert routing',
      fields: [{ key: 'webhook', label: 'Channel webhook URL', placeholder: 'https://outlook.office.com/webhook/…', secret: true }] },
    { id: 'sap', name: 'SAP', category: 'erp', status: 'coming_soon', description: 'Sync assets, work orders and cost centres with SAP PM.', capability: 'Asset & work-order sync', fields: [] },
    { id: 'oracle', name: 'Oracle', category: 'erp', status: 'coming_soon', description: 'Bi-directional master data with Oracle EBS / Fusion.', capability: 'Master data sync', fields: [] },
    { id: 'hr', name: 'HR System (Workday / SuccessFactors)', category: 'hr', status: 'available', description: 'Import the workforce roster and keep org structure in sync.', capability: 'Employee sync',
      fields: [{ key: 'endpoint', label: 'API endpoint', placeholder: 'https://…' }, { key: 'token', label: 'API token', placeholder: '••••••••', secret: true }] },
    { id: 'rest', name: 'REST API', category: 'developer', status: 'connected', description: 'Programmatic access to every module via signed API keys.', capability: 'Full platform API',
      fields: [], config: {}, connectedAt: daysAgo(120), connectedBy: 'Randy Richard' },
    { id: 'webhooks', name: 'Webhooks', category: 'developer', status: 'connected', description: 'Push real-time events to any HTTPS endpoint you control.', capability: 'Event streaming',
      fields: [], config: {}, connectedAt: daysAgo(120), connectedBy: 'Randy Richard' },
    { id: 'csv', name: 'CSV Import / Export', category: 'data', status: 'connected', description: 'Bulk import users and export any register to CSV.', capability: 'Bulk data', fields: [], connectedAt: daysAgo(200), connectedBy: 'Randy Richard' },
  ]
}

function buildApiKeys(): ApiKey[] {
  return [
    { id: 'key-1', name: 'Power BI export key', prefix: 'sk_live_9f2a', masked: 'sk_live_9f2a••••••••••••••••4c7d', scopes: ['view', 'export'], createdAt: daysAgo(60), createdBy: 'Randy Richard', lastUsedAt: hoursAgo(2), callsToday: 184, revoked: false },
    { id: 'key-2', name: 'Incident ingestion (field app)', prefix: 'sk_live_3b81', masked: 'sk_live_3b81••••••••••••••••a90f', scopes: ['view', 'create'], createdAt: daysAgo(30), createdBy: 'Randy Richard', lastUsedAt: minsAgo(12), callsToday: 512, revoked: false },
    { id: 'key-3', name: 'Legacy SharePoint sync', prefix: 'sk_live_7c40', masked: 'sk_live_7c40••••••••••••••••11e2', scopes: ['view'], createdAt: daysAgo(210), createdBy: 'Randy Richard', lastUsedAt: daysAgo(40), callsToday: 0, revoked: true },
  ]
}

function buildWebhooks(): Webhook[] {
  return [
    { id: 'wh-1', url: 'https://hooks.borneo-ind.com.my/safeops/incidents', events: ['incident.created', 'incident.closed'], active: true, secretMasked: 'whsec_••••4f2a', createdAt: daysAgo(50), lastDelivery: { at: hoursAgo(1), status: 'success', code: 200 } },
    { id: 'wh-2', url: 'https://intranet.borneo-ind.com.my/api/capa', events: ['action.assigned', 'action.verified'], active: true, secretMasked: 'whsec_••••9b13', createdAt: daysAgo(20), lastDelivery: { at: hoursAgo(3), status: 'failed', code: 504 } },
  ]
}

const DEFAULT_SECURITY: SecuritySettings = {
  passwordMinLength: 10, requireUppercase: true, requireNumber: true, requireSymbol: true,
  passwordExpiryDays: 90, lockoutThreshold: 5, sessionTimeoutHours: 8, mfaRequired: false,
}

const DEFAULT_RETENTION: RetentionSettings = {
  auditLogDays: 730, backupCount: 30, closedIncidentYears: 7, autoBackupDaily: true,
}

function buildBackups(): Backup[] {
  return [
    { id: 'bk-a3', at: hoursAgo(6), sizeKb: 412, by: 'System', type: 'auto', note: 'Scheduled daily backup', restorable: false },
    { id: 'bk-a2', at: daysAgo(1).slice(0, 10) + 'T02:00:00Z', sizeKb: 408, by: 'System', type: 'auto', note: 'Scheduled daily backup', restorable: false },
    { id: 'bk-m1', at: daysAgo(3), sizeKb: 401, by: 'Randy Richard', type: 'manual', note: 'Pre-CIMAH-audit snapshot', restorable: false },
  ]
}

function buildPositions(): JobPosition[] {
  return [
    { id: 'jp1', title: 'Production Supervisor', department: 'Production', headcount: 6 },
    { id: 'jp2', title: 'Maintenance Technician', department: 'Maintenance', headcount: 14 },
    { id: 'jp3', title: 'Forklift Operator', department: 'Warehouse', headcount: 22 },
    { id: 'jp4', title: 'Process Technician', department: 'Field Operations', headcount: 31 },
    { id: 'jp5', title: 'Safety Officer', department: 'HSE', headcount: 9 },
    { id: 'jp6', title: 'Mill Operator', department: 'Mill', headcount: 18 },
  ]
}
function buildShifts(): ShiftPattern[] {
  return [
    { id: 'sh1', name: 'Day shift', start: '07:00', end: '19:00', days: 'Mon–Sat' },
    { id: 'sh2', name: 'Night shift', start: '19:00', end: '07:00', days: 'Mon–Sat' },
    { id: 'sh3', name: 'General office', start: '08:30', end: '17:30', days: 'Mon–Fri' },
    { id: 'sh4', name: 'Continental (4-on-4-off)', start: '06:00', end: '18:00', days: 'Rotating' },
  ]
}
function buildHolidays(): Holiday[] {
  return [
    { id: 'h1', date: '2026-08-31', name: 'Merdeka Day', scope: 'National' },
    { id: 'h2', date: '2026-09-16', name: 'Malaysia Day', scope: 'National' },
    { id: 'h3', date: '2026-06-01', name: 'Gawai Dayak', scope: 'Sarawak' },
    { id: 'h4', date: '2026-06-02', name: 'Gawai Dayak (2nd day)', scope: 'Sarawak' },
    { id: 'h5', date: '2026-10-31', name: 'Deepavali', scope: 'National' },
  ]
}
function buildUnits(): BusinessUnit[] {
  return [
    { id: 'bu1', name: 'Manufacturing', lead: 'Sarah Wong', sites: 1 },
    { id: 'bu2', name: 'Energy (Oil & Gas)', lead: 'Amirul Hassan', sites: 1 },
    { id: 'bu3', name: 'Logistics & Warehousing', lead: 'Grace Lim', sites: 2 },
    { id: 'bu4', name: 'Plantation', lead: 'Dayang Nurul', sites: 1 },
    { id: 'bu5', name: 'Construction & Fabrication', lead: 'Vincent Chai', sites: 1 },
  ]
}

// ─── The store ───────────────────────────────────────────────────────────────

interface AdminState {
  users: AdminUser[]
  roles: RoleDef[]
  loginHistory: LoginEvent[]
  audit: AuditEntry[]
  connectors: Connector[]
  apiKeys: ApiKey[]
  webhooks: Webhook[]
  security: SecuritySettings
  retention: RetentionSettings
  backups: Backup[]
  orgSettings: Record<string, OrgSettings>
  positions: JobPosition[]
  shifts: ShiftPattern[]
  holidays: Holiday[]
  units: BusinessUnit[]
  nextAudit: number
  nextId: number
}

export class AdminStore {
  private s: AdminState
  private notify: Notify

  constructor(notify: Notify) {
    this.notify = notify
    const hydrated = this.hydrate()
    this.s = hydrated ?? this.seed()
    if (!hydrated) this.persist()
  }

  private seed(): AdminState {
    const users = buildUsers()
    return {
      users,
      roles: buildRoles(),
      loginHistory: buildLoginHistory(users),
      audit: buildAuditSeed(),
      connectors: buildConnectors(),
      apiKeys: buildApiKeys(),
      webhooks: buildWebhooks(),
      security: { ...DEFAULT_SECURITY },
      retention: { ...DEFAULT_RETENTION },
      backups: buildBackups(),
      orgSettings: {
        big: { companyId: 'big', displayName: 'Borneo Industrial Group', legalName: 'Borneo Industrial Group Sdn Bhd', industry: 'Diversified Industrial', timezone: 'Asia/Kuching', language: 'English', brandAccent: '#2a78d6', logoInitials: 'BI' },
        kcs: { companyId: 'kcs', displayName: 'Kenyalang Construction', legalName: 'Kenyalang Construction Sdn Bhd', industry: 'Construction', timezone: 'Asia/Kuching', language: 'English', brandAccent: '#eb6834', logoInitials: 'KC' },
      },
      positions: buildPositions(),
      shifts: buildShifts(),
      holidays: buildHolidays(),
      units: buildUnits(),
      nextAudit: 100,
      nextId: 1,
    }
  }

  private hydrate(): AdminState | null {
    try {
      const raw = localStorage.getItem(ADMIN_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed?.users) && Array.isArray(parsed?.roles) ? parsed : null
    } catch {
      return null
    }
  }

  private persist() {
    try {
      localStorage.setItem(ADMIN_KEY, JSON.stringify(this.s))
    } catch {
      /* over quota — session still works in memory */
    }
  }

  private log(actor: AdminActor, action: string, module: AuditEntry['module'], target: string, oldValue?: string, newValue?: string) {
    this.s.audit.unshift({
      id: `ax-live-${this.s.nextAudit++}`, at: now(), actor: actor.name, actorRole: ROLE_NAME[actor.role] ?? actor.role,
      action, module, target, ip: actor.ip, device: actor.device, oldValue, newValue,
    })
  }

  private requireAdmin(actor: AdminActor) {
    if (actor.role !== 'admin') throw new ApiError('forbidden', 'This action requires an Administrator.')
  }

  // ── users ──────────────────────────────────────────────────────────────────

  listUsers(companyId: string, filters: { q?: string; status?: string; role?: string }): AdminUser[] {
    const q = filters.q?.trim().toLowerCase()
    // company scoping: a user belongs to the company if any of their sites are in it (or they're org-wide)
    const companySites = new Set(SITES.filter((s) => s.companyId === companyId).map((s) => s.id))
    return this.s.users
      .filter((u) => u.siteIds.length === 0 || u.siteIds.some((s) => companySites.has(s)) || USERS.some((x) => x.id === u.id && x.memberships.some((m) => m.companyId === companyId)))
      .filter((u) => !filters.status || u.status === filters.status)
      .filter((u) => !filters.role || u.role === filters.role)
      .filter((u) => !q || [u.name, u.email, u.department ?? ''].join(' ').toLowerCase().includes(q))
      .sort((a, b) => (a.status === 'active' ? 1 : 0) - (b.status === 'active' ? 1 : 0) || a.name.localeCompare(b.name))
  }

  getUser(id: string): AdminUser {
    const u = this.s.users.find((x) => x.id === id)
    if (!u) throw new ApiError('not_found', 'User not found.')
    return u
  }

  createUser(companyId: string, input: NewUserInput, actor: AdminActor): AdminUser {
    this.requireAdmin(actor)
    if (!input.name.trim() || !input.email.trim()) throw new ApiError('validation', 'Name and email are required.')
    if (this.s.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      throw new ApiError('validation', 'A user with that email already exists.')
    }
    const user: AdminUser = {
      id: `au-new-${this.s.nextId++}`, name: input.name.trim(), email: input.email.trim().toLowerCase(),
      role: input.role, status: input.sendInvite ? 'invited' : 'active', mfaEnabled: false,
      lastLoginAt: null, createdAt: now(), siteIds: input.siteIds, department: input.department,
      forcePasswordReset: !input.sendInvite,
    }
    this.s.users.unshift(user)
    this.log(actor, input.sendInvite ? 'Invited user' : 'Created user', 'admin', user.email, undefined, user.role)
    this.notify('system', input.sendInvite ? `Invitation sent to ${user.email}` : `User created: ${user.name}`, `Role: ${ROLE_NAME[user.role] ?? user.role}.`)
    this.persist()
    return user
  }

  setUserStatus(id: string, status: AdminUser['status'], actor: AdminActor): AdminUser {
    this.requireAdmin(actor)
    const u = this.getUser(id)
    if (u.role === 'admin' && status !== 'active' && this.s.users.filter((x) => x.role === 'admin' && x.status === 'active').length <= 1) {
      throw new ApiError('validation', 'You cannot deactivate the last active administrator.')
    }
    const old = u.status
    u.status = status
    if (status === 'active') u.failedLogins = 0
    this.log(actor, status === 'deactivated' ? 'Deactivated user' : status === 'locked' ? 'Locked user' : 'Reactivated user', 'admin', u.email, old, status)
    this.persist()
    return u
  }

  resetPassword(id: string, actor: AdminActor): { token: string } {
    this.requireAdmin(actor)
    const u = this.getUser(id)
    u.forcePasswordReset = true
    u.weakPassword = false
    this.log(actor, 'Sent password reset', 'admin', u.email)
    this.notify('system', `Password reset sent to ${u.email}`, 'A single-use reset link is valid for 15 minutes.')
    this.persist()
    return { token: Math.random().toString(36).slice(2, 10) }
  }

  forcePasswordReset(id: string, actor: AdminActor): AdminUser {
    this.requireAdmin(actor)
    const u = this.getUser(id)
    u.forcePasswordReset = true
    this.log(actor, 'Forced password reset at next login', 'admin', u.email)
    this.persist()
    return u
  }

  toggleMfa(id: string, actor: AdminActor): AdminUser {
    this.requireAdmin(actor)
    const u = this.getUser(id)
    u.mfaEnabled = !u.mfaEnabled
    this.log(actor, u.mfaEnabled ? 'Enabled MFA' : 'Disabled MFA', 'admin', u.email)
    this.persist()
    return u
  }

  bulkImportUsers(companyId: string, csv: string, actor: AdminActor): { created: number; skipped: number; errors: string[] } {
    this.requireAdmin(actor)
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) throw new ApiError('validation', 'The file is empty.')
    // optional header
    const header = lines[0].toLowerCase()
    const body = header.includes('name') && header.includes('email') ? lines.slice(1) : lines
    let created = 0
    let skipped = 0
    const errors: string[] = []
    body.forEach((line, i) => {
      const [name, email, role] = line.split(',').map((c) => c.trim())
      if (!name || !email) { errors.push(`Row ${i + 1}: missing name or email`); return }
      if (this.s.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) { skipped++; return }
      const roleId = ROLE_NAME[role] ? role : this.s.roles.find((r) => r.name.toLowerCase() === (role ?? '').toLowerCase())?.id ?? 'employee'
      this.s.users.unshift({
        id: `au-imp-${this.s.nextId++}`, name, email: email.toLowerCase(), role: roleId,
        status: 'invited', mfaEnabled: false, lastLoginAt: null, createdAt: now(), siteIds: [], forcePasswordReset: true,
      })
      created++
    })
    this.log(actor, 'Bulk imported users', 'admin', `${created} created, ${skipped} skipped`, undefined, undefined)
    this.notify('system', `Bulk import complete: ${created} users invited`, `${skipped} duplicate(s) skipped.`)
    this.persist()
    return { created, skipped, errors }
  }

  getUserDevices(userId: string): UserDevice[] {
    const u = this.getUser(userId)
    const base: UserDevice[] = [
      { id: `dv-${userId}-1`, userId, name: 'Work laptop', browser: 'Chrome 131', os: 'Windows 11', lastSeen: u.lastLoginAt ?? daysAgo(30), ip: IPS[0], trusted: true, current: true },
    ]
    if (u.mfaEnabled) base.push({ id: `dv-${userId}-2`, userId, name: 'Mobile', browser: 'Safari', os: 'iOS 18', lastSeen: daysAgo(2), ip: IPS[2], trusted: true })
    return base
  }

  getUserLoginHistory(userId: string): LoginEvent[] {
    return this.s.loginHistory.filter((e) => e.userId === userId)
  }

  /** Called by the auth flow so login history is genuinely captured. */
  recordLogin(userId: string, userName: string, email: string, result: LoginEvent['result'], device: string) {
    const suspicious = result === 'failed'
    this.s.loginHistory.unshift({
      id: `le-live-${this.s.nextId++}`, at: now(), userId, userName, email,
      ip: IPS[0], device, location: 'Kuching, MY', result, suspicious,
    })
    const u = this.s.users.find((x) => x.id === userId || x.email.toLowerCase() === email.toLowerCase())
    if (u && result === 'success') { u.lastLoginAt = now(); u.failedLogins = 0 }
    this.s.loginHistory = this.s.loginHistory.slice(0, 200)
    this.persist()
  }

  // ── RBAC ─────────────────────────────────────────────────────────────────

  listRoles(): RoleDef[] {
    return this.s.roles.map((r) => ({ ...r, userCount: this.s.users.filter((u) => u.role === r.id).length }))
  }

  toggleRolePermission(roleId: string, module: RbacModule, action: RbacAction, actor: AdminActor): RoleDef {
    this.requireAdmin(actor)
    const role = this.s.roles.find((r) => r.id === roleId)
    if (!role) throw new ApiError('not_found', 'Role not found.')
    if (roleId === 'admin') throw new ApiError('validation', 'The Administrator role has full access and cannot be reduced.')
    const set = new Set(role.permissions[module])
    const had = set.has(action)
    if (had) set.delete(action)
    else set.add(action)
    // view is implied by any other action
    if (!had && action !== 'view') set.add('view')
    role.permissions[module] = [...set]
    this.log(actor, 'Updated role permissions', 'admin', `${role.name} · ${MODULE_LABEL_LOCAL(module)}`, had ? 'granted' : 'revoked', action)
    this.persist()
    return role
  }

  createRole(name: string, cloneFrom: string, actor: AdminActor): RoleDef {
    this.requireAdmin(actor)
    if (!name.trim()) throw new ApiError('validation', 'Role name is required.')
    const base = this.s.roles.find((r) => r.id === cloneFrom)
    const role: RoleDef = {
      id: `role-${this.s.nextId++}`, name: name.trim(), description: 'Custom role', system: false,
      permissions: base ? JSON.parse(JSON.stringify(base.permissions)) : roleSpec({ mission_control: ['view'] }),
    }
    this.s.roles.push(role)
    this.log(actor, 'Created custom role', 'admin', role.name)
    this.persist()
    return role
  }

  deleteRole(roleId: string, actor: AdminActor) {
    this.requireAdmin(actor)
    const role = this.s.roles.find((r) => r.id === roleId)
    if (!role) throw new ApiError('not_found', 'Role not found.')
    if (role.system) throw new ApiError('validation', 'System roles cannot be deleted.')
    if (this.s.users.some((u) => u.role === roleId)) throw new ApiError('validation', 'Reassign users before deleting this role.')
    this.s.roles = this.s.roles.filter((r) => r.id !== roleId)
    this.log(actor, 'Deleted custom role', 'admin', role.name)
    this.persist()
  }

  // ── audit log ────────────────────────────────────────────────────────────

  listAudit(filters: AuditFilters): AuditEntry[] {
    const q = filters.q?.trim().toLowerCase()
    return this.s.audit
      .filter((e) => !filters.module || e.module === filters.module)
      .filter((e) => !filters.actor || e.actor === filters.actor)
      .filter((e) => !q || [e.actor, e.action, e.target, e.ip].join(' ').toLowerCase().includes(q))
  }

  // ── integrations ───────────────────────────────────────────────────────────

  listConnectors(): Connector[] {
    return this.s.connectors
  }

  setConnector(id: string, connected: boolean, config: Record<string, string> | undefined, actor: AdminActor): Connector {
    this.requireAdmin(actor)
    const c = this.s.connectors.find((x) => x.id === id)
    if (!c) throw new ApiError('not_found', 'Connector not found.')
    if (c.status === 'coming_soon') throw new ApiError('validation', 'This connector is not yet available.')
    c.status = connected ? 'connected' : 'available'
    if (connected) { c.config = config ?? c.config ?? {}; c.connectedAt = now(); c.connectedBy = actor.name }
    else { c.connectedAt = undefined }
    this.log(actor, connected ? 'Connected integration' : 'Disconnected integration', 'admin', c.name)
    this.notify('system', `${c.name} ${connected ? 'connected' : 'disconnected'}`, c.capability)
    this.persist()
    return c
  }

  // ── API keys & webhooks ─────────────────────────────────────────────────────

  listApiKeys(): ApiKey[] {
    return this.s.apiKeys
  }

  createApiKey(name: string, scopes: RbacAction[], actor: AdminActor): { key: ApiKey; secret: string } {
    this.requireAdmin(actor)
    if (!name.trim()) throw new ApiError('validation', 'Give the key a descriptive name.')
    const rand = () => Math.random().toString(36).slice(2)
    const full = `sk_live_${rand()}${rand()}`.slice(0, 40)
    const key: ApiKey = {
      id: `key-${this.s.nextId++}`, name: name.trim(), prefix: full.slice(0, 12),
      masked: `${full.slice(0, 12)}${'•'.repeat(16)}${full.slice(-4)}`,
      scopes: scopes.length ? scopes : ['view'], createdAt: now(), createdBy: actor.name,
      lastUsedAt: null, callsToday: 0, revoked: false,
    }
    this.s.apiKeys.unshift(key)
    this.log(actor, 'Generated API key', 'admin', key.name)
    this.persist()
    return { key, secret: full }
  }

  revokeApiKey(id: string, actor: AdminActor): ApiKey {
    this.requireAdmin(actor)
    const k = this.s.apiKeys.find((x) => x.id === id)
    if (!k) throw new ApiError('not_found', 'Key not found.')
    k.revoked = true
    this.log(actor, 'Revoked API key', 'admin', k.name)
    this.persist()
    return k
  }

  listWebhooks(): Webhook[] {
    return this.s.webhooks
  }

  createWebhook(url: string, events: string[], actor: AdminActor): Webhook {
    this.requireAdmin(actor)
    if (!/^https:\/\//.test(url.trim())) throw new ApiError('validation', 'Webhook URL must be HTTPS.')
    if (events.length === 0) throw new ApiError('validation', 'Select at least one event.')
    const wh: Webhook = {
      id: `wh-${this.s.nextId++}`, url: url.trim(), events, active: true,
      secretMasked: `whsec_••••${Math.random().toString(36).slice(2, 6)}`, createdAt: now(),
    }
    this.s.webhooks.unshift(wh)
    this.log(actor, 'Created webhook', 'admin', wh.url)
    this.persist()
    return wh
  }

  toggleWebhook(id: string, actor: AdminActor): Webhook {
    this.requireAdmin(actor)
    const wh = this.s.webhooks.find((x) => x.id === id)
    if (!wh) throw new ApiError('not_found', 'Webhook not found.')
    wh.active = !wh.active
    this.log(actor, wh.active ? 'Enabled webhook' : 'Disabled webhook', 'admin', wh.url)
    this.persist()
    return wh
  }

  testWebhook(id: string, actor: AdminActor): Webhook {
    this.requireAdmin(actor)
    const wh = this.s.webhooks.find((x) => x.id === id)
    if (!wh) throw new ApiError('not_found', 'Webhook not found.')
    // deterministic simulated delivery
    const ok = wh.active
    wh.lastDelivery = { at: now(), status: ok ? 'success' : 'failed', code: ok ? 200 : 503 }
    this.persist()
    return wh
  }

  apiUsage(): { series: { label: string; calls: number; errors: number }[]; totalToday: number; errorRate: number } {
    const series = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
      label, calls: 600 + ((i * 137) % 500) + i * 40, errors: (i * 7) % 12,
    }))
    const totalToday = this.s.apiKeys.reduce((s, k) => s + k.callsToday, 0)
    const totalCalls = series.reduce((s, p) => s + p.calls, 0)
    const totalErrors = series.reduce((s, p) => s + p.errors, 0)
    return { series, totalToday, errorRate: Math.round((totalErrors / totalCalls) * 1000) / 10 }
  }

  // ── security ─────────────────────────────────────────────────────────────

  getSecurity(): SecuritySettings {
    return this.s.security
  }

  updateSecurity(patch: Partial<SecuritySettings>, actor: AdminActor): SecuritySettings {
    this.requireAdmin(actor)
    const before = { ...this.s.security }
    this.s.security = { ...this.s.security, ...patch }
    const changed = (Object.keys(patch) as (keyof SecuritySettings)[]).filter((k) => before[k] !== this.s.security[k])
    changed.forEach((k) => this.log(actor, 'Changed security policy', 'admin', k, String(before[k]), String(this.s.security[k])))
    this.persist()
    return this.s.security
  }

  listLoginHistory(): LoginEvent[] {
    return this.s.loginHistory
  }

  securityCenter(companyId: string): SecurityCenter {
    const users = this.listUsers(companyId, {})
    const active = users.filter((u) => u.status !== 'deactivated')
    const mfaCount = active.filter((u) => u.mfaEnabled).length
    const mfaPct = active.length ? Math.round((mfaCount / active.length) * 100) : 0
    const inactive = users.filter((u) => u.status === 'active' && u.lastLoginAt && (Date.now() - new Date(u.lastLoginAt).getTime()) > 60 * 86400_000).length
    const weak = users.filter((u) => u.weakPassword).length
    const suspicious = this.s.loginHistory.filter((e) => e.suspicious).length
    const invites = users.filter((u) => u.status === 'invited').length
    const locked = users.filter((u) => u.status === 'locked').length

    const findings: SecurityFinding[] = []
    if (mfaPct < 100) findings.push({ id: 'f-mfa', severity: mfaPct < 60 ? 'serious' : 'warning', title: 'Enforce multi-factor authentication', detail: `${active.length - mfaCount} active user(s) have not enrolled in MFA. Require it organisation-wide.`, metric: `${mfaPct}% adoption` })
    if (weak > 0) findings.push({ id: 'f-weak', severity: 'serious', title: 'Weak passwords detected', detail: `${weak} account(s) use a password below the current policy. Force a reset.`, metric: `${weak} account(s)` })
    if (suspicious > 0) findings.push({ id: 'f-susp', severity: 'critical', title: 'Suspicious login attempts', detail: 'Failed logins from an unrecognised location and device. Review and consider blocking the IP.', metric: `${suspicious} attempt(s)` })
    if (inactive > 0) findings.push({ id: 'f-inactive', severity: 'warning', title: 'Inactive accounts', detail: `${inactive} active account(s) have not signed in for 60+ days. Deactivate stale access.`, metric: `${inactive} account(s)` })
    if (locked > 0) findings.push({ id: 'f-locked', severity: 'warning', title: 'Locked accounts pending review', detail: `${locked} account(s) locked after failed attempts. Verify and unlock.`, metric: `${locked} account(s)` })
    if (!this.s.security.mfaRequired) findings.push({ id: 'f-mfareq', severity: 'warning', title: 'MFA not enforced by policy', detail: 'MFA is optional. Turn on "Require MFA" so new users must enrol.', metric: 'Policy' })
    if (findings.length === 0) findings.push({ id: 'f-ok', severity: 'good', title: 'No outstanding security actions', detail: 'MFA adoption, password hygiene and access reviews are all healthy.', metric: 'All clear' })

    return { mfaAdoptionPct: mfaPct, mfaEnabledCount: mfaCount, totalUsers: active.length, inactiveUsers: inactive, weakPasswords: weak, suspiciousLogins: suspicious, pendingInvites: invites, lockedAccounts: locked, findings }
  }

  // ── org config ─────────────────────────────────────────────────────────────

  getOrgSettings(companyId: string): OrgSettings {
    return this.s.orgSettings[companyId] ?? this.s.orgSettings.big
  }
  updateOrgSettings(companyId: string, patch: Partial<OrgSettings>, actor: AdminActor): OrgSettings {
    this.requireAdmin(actor)
    this.s.orgSettings[companyId] = { ...this.getOrgSettings(companyId), ...patch }
    this.log(actor, 'Updated organisation settings', 'admin', companyId.toUpperCase())
    this.persist()
    return this.s.orgSettings[companyId]
  }

  listPositions() { return this.s.positions }
  listShifts() { return this.s.shifts }
  listHolidays() { return this.s.holidays }
  listUnits() { return this.s.units }

  addConfigItem(kind: 'position' | 'shift' | 'holiday' | 'unit', data: Record<string, string>, actor: AdminActor) {
    this.requireAdmin(actor)
    const id = `cfg-${this.s.nextId++}`
    if (kind === 'position') this.s.positions.unshift({ id, title: data.title, department: data.department, headcount: Number(data.headcount) || 0 })
    if (kind === 'shift') this.s.shifts.unshift({ id, name: data.name, start: data.start, end: data.end, days: data.days })
    if (kind === 'holiday') this.s.holidays.unshift({ id, date: data.date, name: data.name, scope: data.scope || 'National' })
    if (kind === 'unit') this.s.units.unshift({ id, name: data.name, lead: data.lead, sites: Number(data.sites) || 1 })
    this.log(actor, `Added ${kind}`, 'admin', data.title || data.name || data.date)
    this.persist()
  }

  removeConfigItem(kind: 'position' | 'shift' | 'holiday' | 'unit', id: string, actor: AdminActor) {
    this.requireAdmin(actor)
    if (kind === 'position') this.s.positions = this.s.positions.filter((x) => x.id !== id)
    if (kind === 'shift') this.s.shifts = this.s.shifts.filter((x) => x.id !== id)
    if (kind === 'holiday') this.s.holidays = this.s.holidays.filter((x) => x.id !== id)
    if (kind === 'unit') this.s.units = this.s.units.filter((x) => x.id !== id)
    this.log(actor, `Removed ${kind}`, 'admin', id)
    this.persist()
  }

  // ── system health ────────────────────────────────────────────────────────

  systemHealth(): SystemHealth {
    const bytesOf = (key: string) => { try { return new Blob([localStorage.getItem(key) ?? '']).size } catch { return 0 } }
    const usedKb = Math.round((bytesOf(OPS_KEY) + bytesOf(ADMIN_KEY) + bytesOf('safeops.notifications.v1')) / 1024)
    const failed = this.s.webhooks.filter((w) => w.lastDelivery?.status === 'failed').length
    const online = 1 + this.s.loginHistory.filter((e) => e.result === 'success' && Date.now() - new Date(e.at).getTime() < 15 * 60000).length
    return {
      usersOnline: Math.max(1, online),
      apiStatus: 'operational', apiLatencyMs: 42 + (usedKb % 30),
      dbStatus: 'operational',
      storageUsedKb: usedKb, storageQuotaKb: 5120,
      failedNotifications: failed,
      jobs: [
        { id: 'j1', name: 'Reminder & escalation sweep', schedule: 'Every 15 min', lastRun: minsAgo(3), status: 'ok', detail: 'CAPA + training + inspection reminders' },
        { id: 'j2', name: 'Certificate expiry scan', schedule: 'Daily 01:00', lastRun: hoursAgo(6), status: 'ok', detail: 'Training certificate expiry bands' },
        { id: 'j3', name: 'Score snapshot', schedule: 'Monthly', lastRun: daysAgo(4), status: 'ok', detail: 'Safety & compliance score freeze' },
        { id: 'j4', name: 'Scheduled backup', schedule: 'Daily 02:00', lastRun: hoursAgo(6), status: this.s.retention.autoBackupDaily ? 'ok' : 'failed', detail: this.s.retention.autoBackupDaily ? 'Snapshot to encrypted storage' : 'Auto-backup disabled' },
      ],
      alerts: [
        ...(failed > 0 ? [{ id: 'al-wh', severity: 'warning' as const, text: `${failed} webhook delivery failure(s) — check endpoint availability`, at: hoursAgo(3) }] : []),
        ...(usedKb > 3500 ? [{ id: 'al-st', severity: 'warning' as const, text: 'Storage approaching quota — review retention settings', at: hoursAgo(1) }] : []),
        { id: 'al-ok', severity: 'info' as const, text: 'All core services operational', at: minsAgo(3) },
      ],
      uptimePct: 99.98,
    }
  }

  // ── backup & recovery ────────────────────────────────────────────────────

  getRetention() { return this.s.retention }
  updateRetention(patch: Partial<RetentionSettings>, actor: AdminActor): RetentionSettings {
    this.requireAdmin(actor)
    this.s.retention = { ...this.s.retention, ...patch }
    this.log(actor, 'Updated retention policy', 'admin', 'Backup & retention')
    this.persist()
    return this.s.retention
  }

  listBackups(): Backup[] {
    return this.s.backups
  }

  /** A real snapshot of the whole platform's localStorage. */
  createBackup(actor: AdminActor, note: string): { backup: Backup; snapshot: string } {
    this.requireAdmin(actor)
    const snapshot = JSON.stringify({
      version: 1, at: now(),
      ops: localStorage.getItem(OPS_KEY),
      admin: localStorage.getItem(ADMIN_KEY),
      notifications: localStorage.getItem('safeops.notifications.v1'),
    })
    const sizeKb = Math.round(new Blob([snapshot]).size / 1024)
    const backup: Backup = { id: `bk-${this.s.nextId++}`, at: now(), sizeKb, by: actor.name, type: 'manual', note: note.trim() || 'Manual snapshot', restorable: true }
    this.s.backups.unshift(backup)
    this.s.backups = this.s.backups.slice(0, this.s.retention.backupCount)
    // store the snapshot alongside so restore is genuine
    try { localStorage.setItem(`safeops.backup.${backup.id}`, snapshot) } catch { backup.restorable = false }
    this.log(actor, 'Created backup', 'system', backup.note)
    this.notify('system', 'Backup created', `${sizeKb} KB snapshot — restorable and downloadable.`)
    this.persist()
    return { backup, snapshot }
  }

  /** Genuinely reload a snapshot back into localStorage. Caller reloads the app. */
  restoreBackup(id: string, actor: AdminActor): void {
    this.requireAdmin(actor)
    const raw = localStorage.getItem(`safeops.backup.${id}`)
    if (!raw) throw new ApiError('not_found', 'This restore point is no longer available.')
    try {
      const snap = JSON.parse(raw)
      if (snap.ops) localStorage.setItem(OPS_KEY, snap.ops)
      if (snap.admin) localStorage.setItem(ADMIN_KEY, snap.admin)
      if (snap.notifications) localStorage.setItem('safeops.notifications.v1', snap.notifications)
    } catch {
      throw new ApiError('validation', 'The restore point is corrupt.')
    }
  }
}

function MODULE_LABEL_LOCAL(m: RbacModule): string {
  const map: Record<RbacModule, string> = {
    mission_control: 'Mission Control', incidents: 'Incidents', actions: 'Corrective Actions',
    assets: 'Assets & Inspections', audits: 'Audit & Compliance', training: 'Training', admin: 'Administration',
  }
  return map[m]
}
