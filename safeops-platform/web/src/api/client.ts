// ─── API client boundary ─────────────────────────────────────────────────────
// The ONLY seam between UI and data. Sprint 1 ships MockApiClient; the real
// HTTP client (Sprint 2+) implements the same interface and swaps in here.

import { drainRows } from './paging'
import { ApiError } from './types'
import type {
  ActivityEvent, AppNotification, Company, Department, Employee,
  Session, Site, Team, User,
} from './types'
import type { DashboardData } from './dashboard'
import type {
  Actor, AdvancePayload, FiveWhys, Incident, IncidentAction, IncidentAttachment,
  IncidentFilters, NewIncidentInput, RcaCause,
} from './incidents'
import type {
  CapaAnalytics, CapaFilters, CapaItem, CapaPatch, CapaStats, NewStandaloneAction,
} from './capa'
import type {
  AssetFilters, AssetStats, AssetView, CompleteInspectionInput, InspectionFilters,
  InspectionView, NewAssetInput,
} from './assets'
import type {
  AuditFilters, AuditFindingView, AuditStats, AuditTemplate, AuditView,
  CompleteAuditInput, ComplianceDocument, DocKind, NewAuditInput, ObligationView,
} from './audits'
import type {
  CertificateView, CertVerification, CompleteSessionInput, CourseView, EmployeeTrainingProfile,
  NewCourseInput, NewSessionInput, SessionFilters, SessionView, TrainingFilters, TrainingMatrix,
  TrainingStats,
} from './training'
import type {
  AdminActor, AdminUser, ApiKey, AuditEntry, AuditFilters as AdminAuditFilters, Backup,
  BusinessUnit, Connector, Holiday, JobPosition, LoginEvent, NewUserInput, OrgSettings, RbacAction,
  RbacModule, RetentionSettings, RoleDef, SecurityCenter, SecuritySettings, ShiftPattern,
  SystemHealth, UserDevice, Webhook,
} from './admin'
import {
  ACTIVITY, COMPANIES, DEPARTMENTS, EMPLOYEES, NOTIFICATIONS, SITES, TEAMS, USERS,
} from './mock/fixtures'
import { buildDashboard } from './mock/dashboard'
import { buildInsights, buildPriorities } from './priorities'
import { incidentsApi } from './incidentsApi'
import { assertRealAuth, isBackendConfigured } from './authApi'
import { PermitStore } from './mock/permits'
import { permitsApi } from './permitsApi'
import { inspectionsApi } from './inspectionsApi'
import { auditsApi } from './auditsApi'
import { trainingApi } from './trainingApi'
import { adminApi } from './adminApi'
import { orgApi } from './orgApi'
import { notificationsApi } from './notificationsApi'
import { activityApi } from './activityApi'
import type {
  GasTest, IsolationPoint, NewPermitInput, PermitFilters, PermitStats, PermitView,
} from './permits'
import { IncidentStore } from './mock/incidents'
import { AdminStore } from './mock/admin'
import { delay } from '@/lib/time'

/** Best-effort device label from the current browser (used for login history). */
function deviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
  return `${browser} · ${os}`
}

export interface ApiClient {
  // auth
  login(email: string, password: string): Promise<{ session: Session; user: User }>
  logout(token: string): Promise<void>
  me(token: string): Promise<User>
  requestPasswordReset(email: string): Promise<{ resetToken: string }>
  resetPassword(resetToken: string, newPassword: string): Promise<void>

  // org
  listCompanies(userId: string): Promise<Company[]>
  /** Companies for an explicit membership set — works for server-issued user ids. */
  listCompaniesByIds(companyIds: string[]): Promise<Company[]>
  listSites(companyId: string): Promise<Site[]>
  listDepartments(siteIds: string[]): Promise<Department[]>
  listTeams(departmentIds: string[]): Promise<Team[]>
  listEmployees(companyId: string): Promise<Employee[]>

  // dashboard
  getDashboard(companyId: string, siteId: string | null, scopeLabel: string): Promise<DashboardData>

  // incidents
  listIncidents(companyId: string, filters: IncidentFilters): Promise<Incident[]>
  getIncident(id: string): Promise<Incident>
  createIncident(input: NewIncidentInput, actor: Actor): Promise<Incident>
  advanceIncident(id: string, payload: AdvancePayload, actor: Actor): Promise<Incident>
  saveIncidentRca(id: string, causes: RcaCause[], fiveWhys: FiveWhys, actor: Actor): Promise<Incident>
  addIncidentAction(id: string, input: Pick<IncidentAction, 'title' | 'causeId' | 'owner' | 'dueDate' | 'priority' | 'evidenceRequired'>, actor: Actor): Promise<Incident>
  updateIncidentAction(id: string, actionId: string, patch: { status?: IncidentAction['status']; evidenceNote?: string }, actor: Actor): Promise<Incident>
  addIncidentComment(id: string, text: string, mentions: string[], actor: Actor): Promise<Incident>
  /**
   * Evidence upload. The File is passed through so the server stores the real bytes;
   * the metadata argument is what the demo path uses when there is no backend.
   */
  addIncidentAttachment(id: string, att: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>, actor: Actor, file?: File): Promise<Incident>
  archiveIncident(id: string, actor: Actor): Promise<void>

  // corrective actions (CAPA)
  listCapa(companyId: string, filters: CapaFilters, actor: Actor): Promise<CapaItem[]>
  capaStats(companyId: string, actor: Actor): Promise<CapaStats>
  getCapa(actionId: string): Promise<CapaItem>
  addStandaloneAction(input: NewStandaloneAction, actor: Actor): Promise<CapaItem>
  updateCapa(actionId: string, patch: CapaPatch, actor: Actor): Promise<CapaItem>
  cancelCapa(actionId: string, reason: string, actor: Actor): Promise<CapaItem>
  addCapaNote(actionId: string, text: string, mentions: string[], actor: Actor): Promise<CapaItem>
  capaAnalytics(companyId: string): Promise<CapaAnalytics>

  // assets & inspections
  listAssets(companyId: string, filters: AssetFilters): Promise<AssetView[]>
  getAssetProfile(idOrQr: string): Promise<{ asset: AssetView; inspections: InspectionView[]; openActions: CapaItem[] }>
  createAsset(input: NewAssetInput, actor: Actor): Promise<AssetView>
  scheduleInspection(assetId: string, date: string, inspector: string, actor: Actor): Promise<InspectionView>
  completeInspection(inspectionId: string, input: CompleteInspectionInput, actor: Actor): Promise<InspectionView>
  listInspections(companyId: string, filters: InspectionFilters): Promise<InspectionView[]>
  assetStats(companyId: string): Promise<AssetStats>

  // audits & compliance
  /** Built-in templates plus the workspace's own, so both need the tenant. */
  listAuditTemplates(companyId: string): Promise<AuditTemplate[]>
  createAuditTemplate(companyId: string, name: string, items: string[], actor: Actor): Promise<AuditTemplate>
  listAudits(companyId: string, filters: AuditFilters): Promise<AuditView[]>
  getAuditDetail(id: string): Promise<{ audit: AuditView; findings: AuditFindingView[]; template: AuditTemplate }>
  createAudit(input: NewAuditInput, actor: Actor): Promise<AuditView>
  startAudit(id: string, actor: Actor): Promise<AuditView>
  completeAudit(id: string, input: CompleteAuditInput, actor: Actor): Promise<{ audit: AuditView; findings: AuditFindingView[] }>
  closeAudit(id: string, actor: Actor): Promise<AuditView>
  listFindings(companyId: string, severity?: string): Promise<AuditFindingView[]>
  listObligations(companyId: string): Promise<ObligationView[]>
  renewObligation(id: string, nextDue: string, note: string, actor: Actor): Promise<ObligationView>
  listDocuments(companyId: string, q?: string, kind?: DocKind | ''): Promise<ComplianceDocument[]>
  addDocumentVersion(docId: string | null, input: { name: string; kind: DocKind; sizeKb: number; note: string; companyId: string; siteId: string | null }, actor: Actor): Promise<ComplianceDocument>
  approveDocument(id: string, actor: Actor): Promise<ComplianceDocument>
  auditStats(companyId: string): Promise<AuditStats>

  // training & competency
  listCourses(companyId: string): Promise<CourseView[]>
  /** Courses belong to a workspace, so the tenant is explicit rather than implied. */
  createCourse(companyId: string, input: NewCourseInput, actor: Actor): Promise<CourseView>
  trainingMatrix(companyId: string, actor: Actor): Promise<TrainingMatrix>
  getEmployeeTraining(employeeId: string): Promise<EmployeeTrainingProfile>
  listSessions(companyId: string, filters: SessionFilters): Promise<SessionView[]>
  createSession(input: NewSessionInput, actor: Actor): Promise<SessionView>
  enrollSession(sessionId: string, employeeIds: string[], actor: Actor): Promise<SessionView>
  completeSession(sessionId: string, input: CompleteSessionInput, actor: Actor): Promise<{ session: SessionView; certificates: CertificateView[] }>
  listCertificates(companyId: string, filters: TrainingFilters, actor: Actor): Promise<CertificateView[]>
  verifyCertificate(codeOrKey: string): Promise<CertVerification>
  raiseTrainingAction(employeeId: string, courseId: string, actor: Actor): Promise<CapaItem>
  trainingStats(companyId: string): Promise<TrainingStats>

  // administration — users
  // Every method carries the workspace: the console administers one tenant, and the
  // server will not act on a company the caller cannot name.
  adminListUsers(companyId: string, filters: { q?: string; status?: string; role?: string }): Promise<AdminUser[]>
  adminGetUser(companyId: string, id: string): Promise<AdminUser>
  adminCreateUser(companyId: string, input: NewUserInput, actor: AdminActor): Promise<AdminUser>
  adminSetUserStatus(companyId: string, id: string, status: AdminUser['status'], actor: AdminActor): Promise<AdminUser>
  adminResetPassword(companyId: string, id: string, actor: AdminActor): Promise<{ token: string }>
  adminForcePasswordReset(companyId: string, id: string, actor: AdminActor): Promise<AdminUser>
  adminToggleMfa(companyId: string, id: string, actor: AdminActor): Promise<AdminUser>
  adminBulkImport(companyId: string, csv: string, actor: AdminActor): Promise<{ created: number; skipped: number; errors: string[] }>
  adminUserDevices(companyId: string, id: string): Promise<UserDevice[]>
  adminUserLoginHistory(companyId: string, id: string): Promise<LoginEvent[]>
  // administration — RBAC
  adminListRoles(companyId: string): Promise<RoleDef[]>
  adminToggleRolePermission(companyId: string, roleId: string, module: RbacModule, action: RbacAction, actor: AdminActor): Promise<RoleDef>
  adminCreateRole(companyId: string, name: string, cloneFrom: string, actor: AdminActor): Promise<RoleDef>
  adminDeleteRole(companyId: string, roleId: string, actor: AdminActor): Promise<void>
  // administration — audit / security
  adminListAudit(companyId: string, filters: AdminAuditFilters): Promise<AuditEntry[]>
  adminGetSecurity(companyId: string): Promise<SecuritySettings>
  adminUpdateSecurity(companyId: string, patch: Partial<SecuritySettings>, actor: AdminActor): Promise<SecuritySettings>
  adminLoginHistory(companyId: string): Promise<LoginEvent[]>
  adminSecurityCenter(companyId: string): Promise<SecurityCenter>
  // administration — integrations & API
  adminListConnectors(companyId: string): Promise<Connector[]>
  adminSetConnector(companyId: string, id: string, connected: boolean, config: Record<string, string> | undefined, actor: AdminActor): Promise<Connector>
  adminListApiKeys(companyId: string): Promise<ApiKey[]>
  adminCreateApiKey(companyId: string, name: string, scopes: RbacAction[], actor: AdminActor): Promise<{ key: ApiKey; secret: string }>
  adminRevokeApiKey(companyId: string, id: string, actor: AdminActor): Promise<ApiKey>
  adminListWebhooks(companyId: string): Promise<Webhook[]>
  adminCreateWebhook(companyId: string, url: string, events: string[], actor: AdminActor): Promise<Webhook>
  adminToggleWebhook(companyId: string, id: string, actor: AdminActor): Promise<Webhook>
  adminTestWebhook(companyId: string, id: string, actor: AdminActor): Promise<Webhook>
  adminApiUsage(companyId: string): Promise<{ series: { label: string; calls: number; errors: number }[]; totalToday: number; errorRate: number }>
  // administration — org config
  adminGetOrgSettings(companyId: string): Promise<OrgSettings>
  adminUpdateOrgSettings(companyId: string, patch: Partial<OrgSettings>, actor: AdminActor): Promise<OrgSettings>
  adminListPositions(companyId: string): Promise<JobPosition[]>
  adminListShifts(companyId: string): Promise<ShiftPattern[]>
  adminListHolidays(companyId: string): Promise<Holiday[]>
  adminListUnits(companyId: string): Promise<BusinessUnit[]>
  adminAddConfigItem(companyId: string, kind: 'position' | 'shift' | 'holiday' | 'unit', data: Record<string, string>, actor: AdminActor): Promise<void>
  adminRemoveConfigItem(companyId: string, kind: 'position' | 'shift' | 'holiday' | 'unit', id: string, actor: AdminActor): Promise<void>
  // administration — health & backup
  adminSystemHealth(companyId: string): Promise<SystemHealth>
  adminGetRetention(companyId: string): Promise<RetentionSettings>
  adminUpdateRetention(companyId: string, patch: Partial<RetentionSettings>, actor: AdminActor): Promise<RetentionSettings>
  adminListBackups(companyId: string): Promise<Backup[]>
  adminCreateBackup(companyId: string, actor: AdminActor, note: string): Promise<{ backup: Backup; snapshot: string }>
  adminRestoreBackup(companyId: string, id: string, actor: AdminActor): Promise<void>

  // ── permits to work ────────────────────────────────────────────────────────
  listPermits(companyId: string, filters: PermitFilters): Promise<PermitView[]>
  getPermit(id: string): Promise<PermitView>
  permitStats(companyId: string, siteId: string | null): Promise<PermitStats>
  createPermit(input: NewPermitInput, actor: Actor): Promise<PermitView>
  submitPermit(id: string, actor: Actor): Promise<PermitView>
  approvePermit(id: string, statement: string, actor: Actor): Promise<PermitView>
  rejectPermit(id: string, reason: string, actor: Actor): Promise<PermitView>
  activatePermit(id: string, actor: Actor): Promise<PermitView>
  suspendPermit(id: string, reason: string, actor: Actor): Promise<PermitView>
  resumePermit(id: string, actor: Actor): Promise<PermitView>
  closePermit(id: string, input: { handbackConfirmed: boolean; statement: string }, actor: Actor): Promise<PermitView>
  confirmPermitControl(permitId: string, controlId: string, confirmed: boolean, actor: Actor): Promise<PermitView>
  addPermitGasTest(permitId: string, reading: Omit<GasTest, 'id' | 'testedAt' | 'testedBy' | 'pass'>, actor: Actor): Promise<PermitView>
  addPermitIsolation(permitId: string, input: Pick<IsolationPoint, 'description' | 'tagId'>, actor: Actor): Promise<PermitView>
  releasePermitIsolation(permitId: string, isolationId: string, actor: Actor): Promise<PermitView>
  /** Raises the expiry warnings. Scoped to a workspace — the server answers per tenant. */
  sweepPermitExpiry(companyId: string): Promise<void>

  // shell data
  /** Notifications belong to a workspace, so the bell names the one it is showing. */
  listNotifications(companyId: string): Promise<AppNotification[]>
  markNotificationRead(companyId: string, id: string): Promise<void>
  markAllNotificationsRead(companyId: string): Promise<void>
  /** Activity belongs to a workspace, so the feed names the one it is showing. */
  listActivity(companyId: string, siteId?: string | null): Promise<ActivityEvent[]>
}

const LATENCY = () => 250 + Math.random() * 400

/** Unsigned demo token: base64(JSON). The real API issues signed JWTs. */
function encodeToken(payload: { sub: string; exp: number }) {
  return btoa(JSON.stringify(payload))
}
export function decodeToken(token: string): { sub: string; exp: number } | null {
  try {
    const p = JSON.parse(atob(token))
    return typeof p.sub === 'string' && typeof p.exp === 'number' ? p : null
  } catch {
    return null
  }
}

const NOTIF_KEY = 'safeops.notifications.v1'

/** "14:35" — the time a permit lapses, as a supervisor reads it off the board. */
const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })

function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* fall through to seeds */
  }
  return NOTIFICATIONS.map((n) => ({ ...n }))
}


/**
 * True when the incident vertical is served by the API rather than the mock store.
 * The mock path is retained only so the credential-free static demo still runs.
 */
const SERVER_INCIDENTS = isBackendConfigured()

/**
 * True when permits are served by the API rather than the in-memory mock.
 *
 * Permits are no longer persisted in the browser at all: a permit board restored from
 * localStorage can disagree with the plant, and a permit that says "active" when the
 * database says "suspended" is worse than no board. The mock below is seed data for the
 * credential-free demo only, and it dies with the tab.
 */
const SERVER_PERMITS = isBackendConfigured()

/**
 * True when assets and inspections are served by the API.
 *
 * Health scores, checklist validation and the defect actions raised from a failure are
 * all computed on the server. The mock below is seed data for the credential-free demo.
 */
const SERVER_INSPECTIONS = isBackendConfigured()

/**
 * True when audits and the compliance register are served by the API.
 *
 * Scoring, the corrective action every finding raises, and the rule that an audit cannot
 * close over an unverified action all live on the server. The mock below is seed data for
 * the credential-free demo.
 */
const SERVER_AUDITS = isBackendConfigured()

/**
 * True when training and competency are served by the API.
 *
 * Competency is derived on the server from real certificates, so the matrix, the expiry
 * bands and every compliance figure come from one place. The mock below is seed data for
 * the credential-free demo.
 */
const SERVER_TRAINING = isBackendConfigured()

/**
 * True when the administration console is served by the API.
 *
 * User lifecycle, roles, devices and login history operate on the real authentication
 * tables rather than a parallel copy, so an account deactivated here genuinely cannot
 * sign in. The mock below is seed data for the credential-free demo.
 */
const SERVER_ADMIN = isBackendConfigured()

/**
 * True when the organisation tree is served by the API.
 *
 * Companies, sites, departments and teams are the rows every other module is scoped
 * by, so the shell reads the structure it filters against rather than a fixture that
 * could drift from it. The mock below is seed data for the credential-free demo.
 */
const SERVER_ORG = isBackendConfigured()

/**
 * True when the notification bell is served by the API.
 *
 * Notifications are addressed to the workspace and read state is per person, which
 * the single-browser store could not express. They are still raised by the client
 * after an authoritative response; emitting them inside each module's service is the
 * better end state and a deliberate separate change.
 */
const SERVER_NOTIFICATIONS = isBackendConfigured()

/**
 * True when the activity feed is served by the API.
 *
 * The feed stores nothing — the server merges the append-only trails each module
 * already keeps — so it describes records that genuinely exist.
 */
const SERVER_ACTIVITY = isBackendConfigured()



/**
 * Server corrective action → CapaItem.
 *
 * The register renders derived state (overdue, days-to-due, progress) that the server
 * does not store because it is a pure function of status and due date. Deriving it here,
 * in one place, keeps a single source of truth for the underlying facts while the view
 * model stays what the existing screens already expect.
 */
function toCapaItem(a: IncidentAction & { companyId?: string; siteId?: string; incidentId?: string | null }): CapaItem {
  const daysToDue = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400_000)
  const isOpen = a.status === 'Open' || a.status === 'In Progress'
  // 'Overdue' is not a derived status — it is the separate `overdue` boolean below.
  const derived: CapaItem['derived'] =
    a.status === 'Verified' ? 'Verified'
      : a.status === 'Cancelled' ? 'Cancelled'
      : a.status === 'Completed' ? 'Waiting Verification'
      : a.status === 'In Progress' ? 'In Progress'
      : a.owner ? 'Assigned'
      : 'Open'
  return {
    id: a.id,
    code: a.code ?? '',
    title: a.title,
    companyId: a.companyId ?? '',
    siteId: a.siteId ?? '',
    department: '',
    incidentId: a.incidentId ?? null,
    owner: a.owner,
    priority: a.priority,
    dueDate: a.dueDate,
    createdAt: a.createdAt ?? a.dueDate,
    status: a.status,
    derived,
    overdue: isOpen && daysToDue < 0,
    daysToDue,
    progress: a.status === 'Open' ? 0 : a.status === 'In Progress' ? 50 : 100,
    evidenceRequired: true,
    evidenceNote: a.evidenceNote,
    verifiedBy: a.verifiedBy,
    verifiedAt: a.verifiedAt,
    completedAt: a.completedAt,
    notes: a.notes ?? [],
  } as CapaItem
}

/** Applies the register's client-side filters to server rows. */
function filterCapa(rows: CapaItem[], f: CapaFilters): CapaItem[] {
  const q = f.q?.trim().toLowerCase()
  return rows
    .filter((r) => !f.siteId || r.siteId === f.siteId)
    .filter((r) => !f.owner || r.owner === f.owner)
    .filter((r) => !f.priority || r.priority === f.priority)
    .filter((r) => {
      switch (f.bucket) {
        case 'open': return r.status === 'Open' || r.status === 'In Progress'
        case 'overdue': return r.overdue
        case 'due_today': return r.daysToDue === 0 && !r.overdue
        case 'verification': return r.derived === 'Waiting Verification'
        case 'high_priority': return r.priority === 'High'
        case 'completed': return r.derived === 'Closed'
        case 'cancelled': return r.derived === 'Cancelled'
        default: return true
      }
    })
    .filter((r) => !q || [r.code, r.title, r.owner].join(' ').toLowerCase().includes(q))
}

class MockApiClient implements ApiClient {
  // mutable copies so reset-password and read-state behave realistically
  private users = USERS.map((u) => ({ ...u }))
  private notifications = loadNotifications()
  private resetTokens = new Map<string, { email: string; exp: number }>()
  /**
   * Raises a workspace notification.
   *
   * The workspace is named explicitly, taken from the authoritative response that
   * prompted the alert — a person can belong to more than one, so there is no current
   * tenant to infer. Server-side it is fire-and-forget: a bell that fails to ring must
   * not fail the action that rang it.
   */
  private pushNotification = (
    companyId: string, kind: AppNotification['kind'], title: string, detail: string,
  ) => {
    if (SERVER_NOTIFICATIONS) {
      if (companyId) void notificationsApi.create(companyId, { kind, title, detail }).catch(() => {})
      return
    }
    this.notifications.unshift({
      id: `n-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
      kind, title, detail, createdAt: new Date().toISOString(), readAt: null,
    })
    this.persistNotifications()
  }
  /**
   * The demo stores predate workspace-addressed notifications and take a three-argument
   * notifier. They only run with no backend configured, where the workspace is unused,
   * so the adapter supplies an empty one rather than inventing a tenant.
   */
  private demoNotify = (kind: AppNotification['kind'], title: string, detail: string) =>
    this.pushNotification('', kind, title, detail)

  private incidents = new IncidentStore(this.demoNotify)
  private admin = new AdminStore(this.demoNotify)
  private permits = new PermitStore(this.demoNotify)
  /** Permits already warned about, so the 30-second board refresh does not re-alert. */
  private permitReminders = new Set<string>()

  private persistNotifications() {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(this.notifications.slice(0, 100)))
    } catch {
      /* storage unavailable — in-memory still works */
    }
  }

  async login(email: string, password: string) {
    // Fails closed rather than silently accepting a bundled demo password.
    assertRealAuth()
    await delay(LATENCY())
    const user = this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!user || user.password !== password) {
      // capture the failed attempt in the security login history
      this.admin.recordLogin(user?.id ?? '', user?.name ?? email.trim(), email.trim(), 'failed', deviceLabel())
      throw new ApiError('invalid_credentials', 'Email or password is incorrect.')
    }
    // session lifetime is governed by the admin security policy (real setting)
    const ttlHours = this.admin.getSecurity().sessionTimeoutHours
    const exp = Date.now() + ttlHours * 60 * 60 * 1000
    const session: Session = { token: encodeToken({ sub: user.id, exp }), userId: user.id, expiresAt: exp }
    this.admin.recordLogin(user.id, user.name, user.email, 'success', deviceLabel())
    const { password: _pw, ...safe } = user
    return { session, user: safe }
  }

  async logout(_token: string) {
    await delay(120)
  }

  async me(token: string) {
    await delay(LATENCY() / 2)
    const payload = decodeToken(token)
    if (!payload) throw new ApiError('invalid_token', 'Session is invalid. Please sign in again.')
    if (payload.exp < Date.now()) throw new ApiError('expired_token', 'Session expired. Please sign in again.')
    const user = this.users.find((u) => u.id === payload.sub)
    if (!user) throw new ApiError('invalid_token', 'Account no longer exists.')
    const { password: _pw, ...safe } = user
    return safe
  }

  async requestPasswordReset(email: string) {
    await delay(LATENCY())
    // Same response whether or not the account exists (no user enumeration).
    const token = Math.random().toString(36).slice(2, 10)
    const user = this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (user) this.resetTokens.set(token, { email: user.email, exp: Date.now() + 15 * 60 * 1000 })
    return { resetToken: token } // demo only: real API emails the link instead of returning it
  }

  async resetPassword(resetToken: string, newPassword: string) {
    await delay(LATENCY())
    const entry = this.resetTokens.get(resetToken)
    if (!entry) throw new ApiError('invalid_token', 'This reset link is invalid or already used.')
    if (entry.exp < Date.now()) throw new ApiError('expired_token', 'This reset link has expired. Request a new one.')
    if (newPassword.length < 10) throw new ApiError('validation', 'Password must be at least 10 characters.')
    const user = this.users.find((u) => u.email === entry.email)!
    user.password = newPassword
    this.resetTokens.delete(resetToken)
  }

  async listCompanies(userId: string) {
    // The server derives the list from the verified session, so the id is not sent.
    if (SERVER_ORG) return orgApi.listCompanies()
    await delay(LATENCY() / 2)
    const user = this.users.find((u) => u.id === userId)
    if (!user) return []
    const ids = new Set(user.memberships.map((m) => m.companyId))
    return COMPANIES.filter((c) => ids.has(c.id))
  }

  async listCompaniesByIds(companyIds: string[]) {
    if (SERVER_ORG) {
      // Still filtered by what the session holds; the requested ids only narrow it.
      const mine = await orgApi.listCompanies()
      const ids = new Set(companyIds)
      return ids.size > 0 ? mine.filter((c) => ids.has(c.id)) : mine
    }
    await delay(LATENCY() / 2)
    const ids = new Set(companyIds)
    return COMPANIES.filter((c) => ids.has(c.id))
  }

  async listSites(companyId: string) {
    if (SERVER_ORG) return orgApi.listSites(companyId)
    await delay(LATENCY() / 2)
    return SITES.filter((s) => s.companyId === companyId)
  }

  async listDepartments(siteIds: string[]) {
    if (SERVER_ORG) return orgApi.listDepartments(siteIds)
    await delay(LATENCY() / 2)
    return DEPARTMENTS.filter((d) => siteIds.includes(d.siteId))
  }

  async listTeams(departmentIds: string[]) {
    if (SERVER_ORG) return orgApi.listTeams(departmentIds)
    await delay(LATENCY() / 2)
    return TEAMS.filter((t) => departmentIds.includes(t.departmentId))
  }

  async listEmployees(companyId: string) {
    await delay(LATENCY())
    return EMPLOYEES.filter((e) => e.companyId === companyId)
  }

  async getDashboard(companyId: string, siteId: string | null, scopeLabel: string) {
    const live = this.incidents.liveStats(companyId, siteId)
    if (SERVER_INCIDENTS) {
      // Mission Control must agree with the module a click away. Every figure the
      // dashboard overlay accepts is taken from the module that owns it, so a headline
      // number and the page behind it cannot contradict each other. A failed module read
      // falls back to the illustrative figure rather than blanking the tile.
      const [s, activity, audit, training, assets] = await Promise.all([
        incidentsApi.stats(companyId, siteId),
        activityApi.timeline(companyId, siteId).catch(() => []),
        auditsApi.auditStats(companyId).catch(() => null),
        trainingApi.stats(companyId).catch(() => null),
        inspectionsApi.assetStats(companyId, siteId).catch(() => null),
      ])

      // The rows behind the priority queue. Fetched separately from the counters above
      // because a queue needs records a user can open, not totals.
      const [actions, openIncidents, expiringPermits, overdueAssets] = await Promise.all([
        this.serverCapa(companyId).catch((): CapaItem[] => []),
        incidentsApi.list(companyId, { pageSize: 50 }).then((p) => p.rows).catch(() => []),
        permitsApi.expiring(companyId).then((e) => e.warning).catch(() => []),
        inspectionsApi.listAssets(companyId, { bucket: 'overdue' }).catch(() => []),
      ])

      // Per-site tallies, counted from the rows themselves. Without these the site map and
      // the KPI tooltips keep their seeded numbers while the headline shows the real one —
      // so a card can read "1 overdue" for the company and "5 overdue" for one of its sites.
      const openBySite = new Map<string, number>()
      const highRiskBySite = new Map<string, number>()
      for (const i of openIncidents) {
        if (i.stage === 'closed') continue
        openBySite.set(i.siteId, (openBySite.get(i.siteId) ?? 0) + 1)
        if (i.highRisk) highRiskBySite.set(i.siteId, (highRiskBySite.get(i.siteId) ?? 0) + 1)
      }
      const overdueBySite = new Map<string, number>()
      for (const a of actions) {
        if (a.overdue) overdueBySite.set(a.siteId, (overdueBySite.get(a.siteId) ?? 0) + 1)
      }

      const dash = buildDashboard(companyId, siteId, scopeLabel, {
        ...live,
        openIncidents: s.open,
        highRisk: s.highRisk,
        nearMissThisMonth: s.nearMissThisMonth,
        overdueActions: s.overdueActions,
        bySite: openBySite,
        overdueActionsBySite: overdueBySite,
        highRiskBySite,
        verificationPending: s.awaitingVerification,
        ...(audit
          ? {
              auditReadiness: audit.readiness,
              compliancePct: audit.compliancePct,
              criticalFindings: audit.criticalFindings,
              upcomingAudits30d: audit.upcoming30d,
              openFindings: audit.openFindings,
            }
          : {}),
        ...(training
          ? {
              trainingCompliance: training.compliancePct,
              certsExpiring90: training.expiring90,
              employeesTrainingOverdue: training.employeesOverdue,
              trainingDeptRankings: training.byDepartment,
            }
          : {}),
        ...(assets
          ? { overdueInspections: assets.overdueInspections, avgAssetHealth: assets.avgHealth }
          : {}),
      })

      const siteName = (id: string) => SITES.find((x) => x.id === id)?.short ?? id
      const atSite = <T extends { siteId: string }>(rows: T[]) =>
        siteId ? rows.filter((r) => r.siteId === siteId) : rows

      const priorities = buildPriorities({
        siteName,
        overdueActions: atSite(actions.filter((a) => a.overdue)).slice(0, 6),
        highRiskIncidents: atSite(openIncidents.filter((i) => i.highRisk && i.stage !== 'closed')).slice(0, 4),
        expiringPermits,
        overdueAssets: atSite(overdueAssets),
        training: training ? { expiring90: training.expiring90, employeesOverdue: training.employeesOverdue } : null,
        audit: audit
          ? { openFindings: audit.openFindings, criticalFindings: audit.criticalFindings, upcoming30d: audit.upcoming30d }
          : null,
      })

      const insights = buildInsights({
        incidents: atSite(openIncidents),
        actions: atSite(actions),
        overdueAssets: atSite(overdueAssets),
        siteName,
        training: training ? { expiring90: training.expiring90, employeesOverdue: training.employeesOverdue } : null,
      })

      // An empty insights list means the workspace is quiet, not that the panel is broken.
      // The seeded copy is only kept when there is genuinely nothing to compute from.
      return { ...dash, activity, priorities, ...(insights.length > 0 ? { insights } : {}) }
    }
    await delay(650 + Math.random() * 350)
    return buildDashboard(companyId, siteId, scopeLabel, live)
  }

  // ── incidents ──────────────────────────────────────────────────────────────

  async listIncidents(companyId: string, filters: IncidentFilters) {
    if (SERVER_INCIDENTS) {
      return drainRows((page, pageSize) => incidentsApi.list(companyId, { ...filters, page, pageSize }))
    }
    await delay(LATENCY())
    return this.incidents.list(companyId, filters)
  }

  async getIncident(id: string) {
    if (SERVER_INCIDENTS) return incidentsApi.get(id)
    await delay(LATENCY() / 2)
    return this.incidents.get(id)
  }

  async createIncident(input: NewIncidentInput, actor: Actor) {
    if (SERVER_INCIDENTS) {
      return incidentsApi.create({
        companyId: input.companyId, siteId: input.siteId, title: input.title,
        description: input.description, type: input.type, severity: input.severity,
        department: input.department, location: input.location, gps: input.gps,
        immediateActions: input.immediateActions, occurredAt: input.occurredAt,
      })
    }
    await delay(LATENCY())
    return this.incidents.create(input, actor)
  }

  async advanceIncident(id: string, payload: AdvancePayload, actor: Actor) {
    if (SERVER_INCIDENTS) {
      const p = payload as unknown as Record<string, string | undefined>
      return incidentsApi.advance(id, {
        to: String(p.to),
        note: p.note ?? p.reviewNote ?? p.closeNote,
        investigator: p.investigator,
        findings: p.findings,
        riskRating: p.riskRating,
        potentialSeverity: p.potentialSeverity,
      })
    }
    await delay(LATENCY() / 2)
    return this.incidents.advance(id, payload, actor)
  }

  async saveIncidentRca(id: string, causes: RcaCause[], fiveWhys: FiveWhys, actor: Actor) {
    if (SERVER_INCIDENTS) return incidentsApi.saveRca(id, causes, fiveWhys)
    await delay(LATENCY() / 2)
    return this.incidents.saveRca(id, causes, fiveWhys, actor)
  }

  async addIncidentAction(id: string, input: Pick<IncidentAction, 'title' | 'causeId' | 'owner' | 'dueDate' | 'priority' | 'evidenceRequired'>, actor: Actor) {
    if (SERVER_INCIDENTS) {
      await incidentsApi.addAction(id, {
        title: input.title, owner: input.owner, dueDate: input.dueDate, priority: input.priority,
      })
      return incidentsApi.get(id) // re-read so the caller sees the authoritative row
    }
    await delay(LATENCY() / 2)
    return this.incidents.addAction(id, input, actor)
  }

  async updateIncidentAction(id: string, actionId: string, patch: { status?: IncidentAction['status']; evidenceNote?: string }, actor: Actor) {
    if (SERVER_INCIDENTS) {
      await incidentsApi.updateAction(actionId, patch)
      return incidentsApi.get(id)
    }
    await delay(LATENCY() / 2)
    return this.incidents.updateAction(id, actionId, patch, actor)
  }

  async addIncidentComment(id: string, text: string, mentions: string[], actor: Actor) {
    if (SERVER_INCIDENTS) {
      await incidentsApi.addComment(id, text, mentions)
      return incidentsApi.get(id) // re-read so the caller sees the authoritative row
    }
    await delay(LATENCY() / 2)
    return this.incidents.addComment(id, text, mentions, actor)
  }

  async addIncidentAttachment(id: string, att: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>, actor: Actor, file?: File) {
    if (SERVER_INCIDENTS && file) {
      await incidentsApi.uploadAttachments(id, [file])
      return incidentsApi.get(id)
    }
    await delay(LATENCY() / 2)
    return this.incidents.addAttachment(id, att, actor)
  }

  async archiveIncident(id: string, actor: Actor) {
    if (SERVER_INCIDENTS) return incidentsApi.archive(id)
    await delay(LATENCY() / 2)
    this.incidents.archive(id, actor)
  }

  // ── CAPA ───────────────────────────────────────────────────────────────────

  private async serverCapa(companyId: string): Promise<CapaItem[]> {
    const rows = await drainRows((page, pageSize) =>
      incidentsApi.listActions(companyId, { page, pageSize }))
    return rows.map((r) => toCapaItem(r))
  }

  async listCapa(companyId: string, filters: CapaFilters, actor: Actor) {
    if (SERVER_INCIDENTS) return filterCapa(await this.serverCapa(companyId), filters)
    await delay(LATENCY())
    return this.incidents.listCapa(companyId, filters, actor)
  }

  async capaStats(companyId: string, actor: Actor) {
    if (SERVER_INCIDENTS) {
      const s = await incidentsApi.stats(companyId)
      const rows = await this.serverCapa(companyId)
      return {
        open: s.openActions,
        overdue: s.overdueActions,
        verificationPending: s.awaitingVerification,
        completed30d: rows.filter((r) =>
          r.completedAt && Date.now() - new Date(r.completedAt).getTime() < 30 * 86400_000).length,
        highPriority: rows.filter((r) =>
          r.priority === 'High' &&
          (r.status === 'Open' || r.status === 'In Progress')).length,
        dueToday: rows.filter((r) => r.daysToDue === 0 && !r.overdue).length,
      }
    }
    await delay(LATENCY() / 2)
    return this.incidents.capaStats(companyId, actor)
  }

  async getCapa(actionId: string) {
    if (SERVER_INCIDENTS) {
      const a = await incidentsApi.getAction(actionId)
      return toCapaItem({
        ...a,
        status: ({ open: 'Open', in_progress: 'In Progress', completed: 'Completed', verified: 'Verified', cancelled: 'Cancelled' } as Record<string, CapaItem['status']>)[a.status] ?? 'Open',
        evidenceNote: a.evidenceNote ?? undefined,
        verifiedBy: a.verifiedBy ?? undefined,
        verifiedAt: a.verifiedAt ?? undefined,
        completedAt: a.completedAt ?? undefined,
        notes: (a.notes ?? []).map((n) => ({ id: n.id, author: n.author, at: n.createdAt, text: n.body, mentions: n.mentions })),
      } as never)
    }
    await delay(LATENCY() / 3)
    return this.incidents.getCapa(actionId)
  }

  async addStandaloneAction(input: NewStandaloneAction, actor: Actor) {
    if (SERVER_INCIDENTS) {
      const a = await incidentsApi.addStandaloneAction({
        companyId: input.companyId, siteId: input.siteId, title: input.title,
        owner: input.owner, dueDate: input.dueDate, priority: input.priority, source: 'manual',
      })
      return toCapaItem({ ...a, companyId: input.companyId, siteId: input.siteId })
    }
    await delay(LATENCY() / 2)
    return this.incidents.addStandaloneAction(input, actor)
  }

  async updateCapa(actionId: string, patch: CapaPatch, actor: Actor) {
    if (SERVER_INCIDENTS) {
      const a = await incidentsApi.updateAction(actionId, {
        status: patch.status, evidenceNote: patch.evidenceNote, dueDate: patch.dueDate,
      })
      return toCapaItem(a)
    }
    await delay(LATENCY() / 3)
    return this.incidents.updateCapa(actionId, patch, actor)
  }

  async cancelCapa(actionId: string, reason: string, actor: Actor) {
    if (SERVER_INCIDENTS) {
      return toCapaItem(await incidentsApi.updateAction(actionId, { status: 'Cancelled', evidenceNote: reason }))
    }
    await delay(LATENCY() / 3)
    return this.incidents.cancelCapa(actionId, reason, actor)
  }

  async addCapaNote(actionId: string, text: string, mentions: string[], actor: Actor) {
    if (SERVER_INCIDENTS) {
      await incidentsApi.addActionNote(actionId, text, mentions)
      return this.getCapa(actionId) // re-read so the caller sees the authoritative row
    }
    await delay(LATENCY() / 3)
    return this.incidents.addCapaNote(actionId, text, mentions, actor)
  }

  async capaAnalytics(companyId: string) {
    if (SERVER_INCIDENTS) {
      const a = await incidentsApi.actionAnalytics(companyId)
      const mock = this.incidents.capaAnalytics(companyId)
      // Real counts where the server has them; the trend/ranking panels keep their
      // illustrative shape until the analytics endpoint reports them.
      return {
        ...mock,
        completionRate: a.totalClosed + a.overdue > 0
          ? Math.round((a.totalClosed / (a.totalClosed + a.overdue)) * 100)
          : mock.completionRate,
        avgCloseDays: a.avgDaysToComplete ?? mock.avgCloseDays,
      }
    }
    await delay(LATENCY())
    return this.incidents.capaAnalytics(companyId)
  }

  // ── assets & inspections ───────────────────────────────────────────────────

  async listAssets(companyId: string, filters: AssetFilters) {
    if (SERVER_INSPECTIONS) return inspectionsApi.listAssets(companyId, filters)
    await delay(LATENCY())
    return this.incidents.listAssets(companyId, filters)
  }

  async getAssetProfile(idOrQr: string) {
    if (SERVER_INSPECTIONS) return inspectionsApi.getAssetProfile(idOrQr)
    await delay(LATENCY() / 2)
    return this.incidents.getAssetProfile(idOrQr)
  }

  async createAsset(input: NewAssetInput, actor: Actor) {
    if (SERVER_INSPECTIONS) {
      const a = await inspectionsApi.createAsset(input)
      this.pushNotification(a.companyId, 'system', `Asset registered: ${a.code}`,
        `${a.name} — first inspection scheduled ${a.nextDueDate}.`)
      return a
    }
    await delay(LATENCY() / 2)
    return this.incidents.createAsset(input, actor)
  }

  async scheduleInspection(assetId: string, date: string, inspector: string, actor: Actor) {
    if (SERVER_INSPECTIONS) {
      const i = await inspectionsApi.scheduleInspection(assetId, date, inspector)
      this.pushNotification(i.companyId, 'system', `Inspection scheduled: ${i.assetCode}`,
        `${i.assetName} on ${i.scheduledFor} — inspector ${inspector}.`)
      return i
    }
    await delay(LATENCY() / 2)
    return this.incidents.scheduleInspection(assetId, date, inspector, actor)
  }

  async completeInspection(inspectionId: string, input: CompleteInspectionInput, actor: Actor) {
    if (SERVER_INSPECTIONS) {
      const i = await inspectionsApi.completeInspection(inspectionId, input)
      const defects = i.actionCodes.length
      // Announced from the authoritative response: the server decides pass or fail and
      // how many defect actions it raised, not the answers that were sent.
      this.pushNotification(
        i.companyId,
        i.outcome === 'failed' ? 'action' : 'system',
        `${i.code} completed — ${i.outcome === 'failed' ? `${defects} defect(s) found` : 'passed'}`,
        `${i.assetName} inspected by ${actor.name}.`,
      )
      return i
    }
    await delay(LATENCY() / 2)
    return this.incidents.completeInspection(inspectionId, input, actor)
  }

  async listInspections(companyId: string, filters: InspectionFilters) {
    if (SERVER_INSPECTIONS) return inspectionsApi.listInspections(companyId, filters)
    await delay(LATENCY())
    return this.incidents.listInspections(companyId, filters)
  }

  async assetStats(companyId: string) {
    if (SERVER_INSPECTIONS) return inspectionsApi.assetStats(companyId)
    await delay(LATENCY() / 2)
    return this.incidents.assetStats(companyId)
  }

  // ── audits & compliance ────────────────────────────────────────────────────

  async listAuditTemplates(companyId: string) {
    if (SERVER_AUDITS) return auditsApi.listTemplates(companyId)
    await delay(LATENCY() / 3)
    return this.incidents.listTemplates()
  }

  async createAuditTemplate(companyId: string, name: string, items: string[], actor: Actor) {
    if (SERVER_AUDITS) return auditsApi.createTemplate(companyId, name, items)
    await delay(LATENCY() / 2)
    return this.incidents.createTemplate(name, items, actor)
  }

  async listAudits(companyId: string, filters: AuditFilters) {
    if (SERVER_AUDITS) return auditsApi.listAudits(companyId, filters)
    await delay(LATENCY())
    return this.incidents.listAudits(companyId, filters)
  }

  async getAuditDetail(id: string) {
    if (SERVER_AUDITS) return auditsApi.getAuditDetail(id)
    await delay(LATENCY() / 2)
    return this.incidents.getAuditDetail(id)
  }

  async createAudit(input: NewAuditInput, actor: Actor) {
    if (SERVER_AUDITS) {
      const a = await auditsApi.createAudit(input)
      this.pushNotification(a.companyId, 'audit', `Audit planned: ${a.code}`,
        `${a.title} — lead auditor ${a.leadAuditor}, ${a.scheduledFor}.`)
      return a
    }
    await delay(LATENCY() / 2)
    return this.incidents.createAudit(input, actor)
  }

  async startAudit(id: string, actor: Actor) {
    if (SERVER_AUDITS) return auditsApi.startAudit(id)
    await delay(LATENCY() / 3)
    return this.incidents.startAudit(id, actor)
  }

  async completeAudit(id: string, input: CompleteAuditInput, actor: Actor) {
    if (SERVER_AUDITS) {
      const r = await auditsApi.completeAudit(id, input)
      // Announced from the authoritative response: the server decides the score and how
      // many findings it raised, not the answers that were sent.
      for (const f of r.findings.filter((x) => x.status !== 'Closed')) {
        this.pushNotification(r.audit.companyId, 'audit', `Audit finding ${f.code} (${f.severity})`,
          `${f.description.slice(0, 80)} — action ${f.actionCode} assigned to ${f.actionOwner}.`)
      }
      this.pushNotification(r.audit.companyId, 'audit', `${r.audit.code} completed — score ${r.audit.score}%`,
        `${r.audit.title}: ${r.findings.length} finding(s) raised.`)
      return r
    }
    await delay(LATENCY() / 2)
    return this.incidents.completeAudit(id, input, actor)
  }

  async closeAudit(id: string, actor: Actor) {
    if (SERVER_AUDITS) {
      const a = await auditsApi.closeAudit(id)
      this.pushNotification(a.companyId, 'audit', `${a.code} closed`,
        `${a.title} — every finding verified and closed.`)
      return a
    }
    await delay(LATENCY() / 3)
    return this.incidents.closeAudit(id, actor)
  }

  async listFindings(companyId: string, severity?: string) {
    if (SERVER_AUDITS) return auditsApi.listFindings(companyId, severity)
    await delay(LATENCY() / 2)
    return this.incidents.listFindings(companyId, severity)
  }

  async listObligations(companyId: string) {
    if (SERVER_AUDITS) return auditsApi.listObligations(companyId)
    await delay(LATENCY() / 2)
    return this.incidents.listObligations(companyId)
  }

  async renewObligation(id: string, nextDue: string, note: string, actor: Actor) {
    if (SERVER_AUDITS) {
      const o = await auditsApi.renewObligation(id, nextDue, note)
      this.pushNotification(o.companyId, 'audit', `Compliance renewed: ${o.requirement}`,
        `${o.regulation} — next due ${o.nextDue}.`)
      return o
    }
    await delay(LATENCY() / 3)
    return this.incidents.renewObligation(id, nextDue, note, actor)
  }

  async listDocuments(companyId: string, q?: string, kind?: DocKind | '') {
    if (SERVER_AUDITS) return auditsApi.listDocuments(companyId, q, kind)
    await delay(LATENCY() / 2)
    return this.incidents.listDocuments(companyId, q, kind)
  }

  async addDocumentVersion(docId: string | null, input: { name: string; kind: DocKind; sizeKb: number; note: string; companyId: string; siteId: string | null }, actor: Actor) {
    if (SERVER_AUDITS) {
      const d = await auditsApi.addDocumentVersion(docId, input)
      this.pushNotification(d.companyId, 'system', `Document pending approval: ${d.name}`,
        `v${d.version} uploaded by ${actor.name}.`)
      return d
    }
    await delay(LATENCY() / 2)
    return this.incidents.addDocumentVersion(docId, input, actor)
  }

  async approveDocument(id: string, actor: Actor) {
    if (SERVER_AUDITS) {
      const d = await auditsApi.approveDocument(id)
      this.pushNotification(d.companyId, 'system', `Document approved: ${d.name}`,
        `v${d.version} approved by ${actor.name}.`)
      return d
    }
    await delay(LATENCY() / 3)
    return this.incidents.approveDocument(id, actor)
  }

  async auditStats(companyId: string) {
    if (SERVER_AUDITS) return auditsApi.auditStats(companyId)
    await delay(LATENCY() / 2)
    return this.incidents.auditStats(companyId)
  }

  // ── training & competency ──────────────────────────────────────────────────

  async listCourses(companyId: string) {
    if (SERVER_TRAINING) return trainingApi.listCourses(companyId)
    await delay(LATENCY() / 2)
    return this.incidents.listCourses(companyId)
  }

  async createCourse(companyId: string, input: NewCourseInput, actor: Actor) {
    if (SERVER_TRAINING) {
      const c = await trainingApi.createCourse(companyId, input)
      this.pushNotification(companyId, 'system', `Training course added: ${c.code}`,
        `${c.name} — ${c.mandatory ? 'mandatory' : 'optional'}, ` +
        `${c.validityMonths ? `${c.validityMonths}-month validity` : 'no expiry'}.`)
      return c
    }
    await delay(LATENCY() / 2)
    return this.incidents.createCourse(input, actor)
  }

  async trainingMatrix(companyId: string, actor: Actor) {
    if (SERVER_TRAINING) return trainingApi.matrix(companyId)
    await delay(LATENCY())
    return this.incidents.trainingMatrix(companyId, actor)
  }

  async getEmployeeTraining(employeeId: string) {
    if (SERVER_TRAINING) return trainingApi.employeeProfile(employeeId)
    await delay(LATENCY() / 2)
    return this.incidents.getEmployeeTraining(employeeId)
  }

  async listSessions(companyId: string, filters: SessionFilters) {
    if (SERVER_TRAINING) return trainingApi.listSessions(companyId, filters)
    await delay(LATENCY())
    return this.incidents.listSessions(companyId, filters)
  }

  async createSession(input: NewSessionInput, actor: Actor) {
    if (SERVER_TRAINING) {
      const s = await trainingApi.createSession(input)
      this.pushNotification(s.companyId, 'system', `Training session scheduled: ${s.code}`,
        `${s.courseName} on ${s.scheduledFor} — trainer ${s.trainer}, ${s.enrolledCount} enrolled.`)
      return s
    }
    await delay(LATENCY() / 2)
    return this.incidents.createSession(input, actor)
  }

  async enrollSession(sessionId: string, employeeIds: string[], actor: Actor) {
    if (SERVER_TRAINING) return trainingApi.enrollSession(sessionId, employeeIds)
    await delay(LATENCY() / 3)
    return this.incidents.enrollSession(sessionId, employeeIds, actor)
  }

  async completeSession(sessionId: string, input: CompleteSessionInput, actor: Actor) {
    if (SERVER_TRAINING) {
      const r = await trainingApi.completeSession(sessionId, input)
      // Announced from the authoritative response: the server decides who passed and
      // therefore how many certificates exist.
      const attended = r.session.attendance?.filter((a) => a.present).length ?? 0
      this.pushNotification(r.session.companyId, 'system',
        `${r.session.code} completed — ${r.certificates.length} certificate(s) issued`,
        `${r.session.courseName}: ${attended} attended, ${r.certificates.length} passed.`)
      return r
    }
    await delay(LATENCY() / 2)
    return this.incidents.completeSession(sessionId, input, actor)
  }

  async listCertificates(companyId: string, filters: TrainingFilters, actor: Actor) {
    if (SERVER_TRAINING) return trainingApi.listCertificates(companyId, filters)
    await delay(LATENCY() / 2)
    return this.incidents.listCertificates(companyId, filters, actor)
  }

  async verifyCertificate(codeOrKey: string) {
    if (SERVER_TRAINING) return trainingApi.verifyCertificate(codeOrKey)
    await delay(LATENCY() / 3)
    return this.incidents.verifyCertificate(codeOrKey)
  }

  async raiseTrainingAction(employeeId: string, courseId: string, actor: Actor) {
    if (SERVER_TRAINING) {
      const a = await trainingApi.raiseTrainingAction(employeeId, courseId)
      this.pushNotification(a.companyId, 'action', `Corrective action ${a.code} raised`, a.title)
      return a
    }
    await delay(LATENCY() / 2)
    return this.incidents.raiseTrainingAction(employeeId, courseId, actor)
  }

  async trainingStats(companyId: string) {
    if (SERVER_TRAINING) return trainingApi.stats(companyId)
    await delay(LATENCY() / 2)
    return this.incidents.trainingStats(companyId)
  }

  // ── administration ─────────────────────────────────────────────────────────
  // Users, roles, devices and login history act on the real authentication tables, so
  // deactivating an account here is the same act that stops the person signing in.

  async adminListUsers(companyId: string, filters: { q?: string; status?: string; role?: string }) {
    if (SERVER_ADMIN) return adminApi.listUsers(companyId, filters)
    await delay(LATENCY()); return this.admin.listUsers(companyId, filters)
  }
  async adminGetUser(companyId: string, id: string) {
    if (SERVER_ADMIN) return adminApi.getUser(companyId, id)
    await delay(LATENCY() / 3); return this.admin.getUser(id)
  }
  async adminCreateUser(companyId: string, input: NewUserInput, actor: AdminActor) {
    if (SERVER_ADMIN) {
      const u = await adminApi.createUser(companyId, input)
      this.pushNotification(companyId, 'system',
        input.sendInvite ? `Invitation sent to ${u.email}` : `User created: ${u.name}`,
        `Role: ${u.role}.`)
      return u
    }
    await delay(LATENCY() / 2); return this.admin.createUser(companyId, input, actor)
  }
  async adminSetUserStatus(companyId: string, id: string, status: AdminUser['status'], actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.setUserStatus(companyId, id, status)
    await delay(LATENCY() / 3); return this.admin.setUserStatus(id, status, actor)
  }
  async adminResetPassword(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) {
      const r = await adminApi.resetPassword(companyId, id)
      this.pushNotification(companyId, 'system', 'Password reset issued',
        'Live sessions were revoked and a single-use link was generated.')
      return r
    }
    await delay(LATENCY() / 3); return this.admin.resetPassword(id, actor)
  }
  async adminForcePasswordReset(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.forcePasswordReset(companyId, id)
    await delay(LATENCY() / 3); return this.admin.forcePasswordReset(id, actor)
  }
  async adminToggleMfa(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.toggleMfa(companyId, id)
    await delay(LATENCY() / 3); return this.admin.toggleMfa(id, actor)
  }
  async adminBulkImport(companyId: string, csv: string, actor: AdminActor) {
    if (SERVER_ADMIN) {
      const r = await adminApi.bulkImport(companyId, csv)
      this.pushNotification(companyId, 'system', `Bulk import complete: ${r.created} users invited`,
        `${r.skipped} duplicate(s) skipped.`)
      return r
    }
    await delay(LATENCY()); return this.admin.bulkImportUsers(companyId, csv, actor)
  }
  async adminUserDevices(companyId: string, id: string) {
    if (SERVER_ADMIN) return adminApi.userDevices(companyId, id)
    await delay(LATENCY() / 3); return this.admin.getUserDevices(id)
  }
  async adminUserLoginHistory(companyId: string, id: string) {
    if (SERVER_ADMIN) return adminApi.userLoginHistory(companyId, id)
    await delay(LATENCY() / 3); return this.admin.getUserLoginHistory(id)
  }

  async adminListRoles(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listRoles(companyId)
    await delay(LATENCY() / 2); return this.admin.listRoles()
  }
  async adminToggleRolePermission(companyId: string, roleId: string, module: RbacModule, action: RbacAction, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.toggleRolePermission(companyId, roleId, module, action)
    await delay(LATENCY() / 3); return this.admin.toggleRolePermission(roleId, module, action, actor)
  }
  async adminCreateRole(companyId: string, name: string, cloneFrom: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.createRole(companyId, name, cloneFrom)
    await delay(LATENCY() / 2); return this.admin.createRole(name, cloneFrom, actor)
  }
  async adminDeleteRole(companyId: string, roleId: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.deleteRole(companyId, roleId)
    await delay(LATENCY() / 3); this.admin.deleteRole(roleId, actor)
  }

  async adminListAudit(companyId: string, filters: AdminAuditFilters) {
    if (SERVER_ADMIN) return adminApi.listAudit(companyId, filters)
    await delay(LATENCY() / 2); return this.admin.listAudit(filters)
  }
  async adminGetSecurity(companyId: string) {
    if (SERVER_ADMIN) return adminApi.getSecurity(companyId)
    await delay(LATENCY() / 3); return this.admin.getSecurity()
  }
  async adminUpdateSecurity(companyId: string, patch: Partial<SecuritySettings>, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.updateSecurity(companyId, patch)
    await delay(LATENCY() / 3); return this.admin.updateSecurity(patch, actor)
  }
  async adminLoginHistory(companyId: string) {
    if (SERVER_ADMIN) return adminApi.loginHistory(companyId)
    await delay(LATENCY() / 2); return this.admin.listLoginHistory()
  }
  async adminSecurityCenter(companyId: string) {
    if (SERVER_ADMIN) return adminApi.securityCenter(companyId)
    await delay(LATENCY() / 2); return this.admin.securityCenter(companyId)
  }

  async adminListConnectors(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listConnectors(companyId)
    await delay(LATENCY() / 2); return this.admin.listConnectors()
  }
  async adminSetConnector(companyId: string, id: string, connected: boolean, config: Record<string, string> | undefined, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.setConnector(companyId, id, connected, config)
    await delay(LATENCY() / 2); return this.admin.setConnector(id, connected, config, actor)
  }
  async adminListApiKeys(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listApiKeys(companyId)
    await delay(LATENCY() / 2); return this.admin.listApiKeys()
  }
  async adminCreateApiKey(companyId: string, name: string, scopes: RbacAction[], actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.createApiKey(companyId, name, scopes)
    await delay(LATENCY() / 2); return this.admin.createApiKey(name, scopes, actor)
  }
  async adminRevokeApiKey(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.revokeApiKey(companyId, id)
    await delay(LATENCY() / 3); return this.admin.revokeApiKey(id, actor)
  }
  async adminListWebhooks(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listWebhooks(companyId)
    await delay(LATENCY() / 2); return this.admin.listWebhooks()
  }
  async adminCreateWebhook(companyId: string, url: string, events: string[], actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.createWebhook(companyId, url, events)
    await delay(LATENCY() / 2); return this.admin.createWebhook(url, events, actor)
  }
  async adminToggleWebhook(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.toggleWebhook(companyId, id)
    await delay(LATENCY() / 3); return this.admin.toggleWebhook(id, actor)
  }
  async adminTestWebhook(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.testWebhook(companyId, id)
    await delay(LATENCY()); return this.admin.testWebhook(id, actor)
  }
  async adminApiUsage(companyId: string) {
    if (SERVER_ADMIN) return adminApi.apiUsage(companyId)
    await delay(LATENCY() / 2); return this.admin.apiUsage()
  }

  async adminGetOrgSettings(companyId: string) {
    if (SERVER_ADMIN) return adminApi.getOrgSettings(companyId)
    await delay(LATENCY() / 3); return this.admin.getOrgSettings(companyId)
  }
  async adminUpdateOrgSettings(companyId: string, patch: Partial<OrgSettings>, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.updateOrgSettings(companyId, patch)
    await delay(LATENCY() / 3); return this.admin.updateOrgSettings(companyId, patch, actor)
  }
  async adminListPositions(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listConfig<JobPosition>(companyId, 'position')
    await delay(LATENCY() / 3); return this.admin.listPositions()
  }
  async adminListShifts(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listConfig<ShiftPattern>(companyId, 'shift')
    await delay(LATENCY() / 3); return this.admin.listShifts()
  }
  async adminListHolidays(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listConfig<Holiday>(companyId, 'holiday')
    await delay(LATENCY() / 3); return this.admin.listHolidays()
  }
  async adminListUnits(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listConfig<BusinessUnit>(companyId, 'unit')
    await delay(LATENCY() / 3); return this.admin.listUnits()
  }
  async adminAddConfigItem(companyId: string, kind: 'position' | 'shift' | 'holiday' | 'unit', data: Record<string, string>, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.addConfigItem(companyId, kind, data)
    await delay(LATENCY() / 3); this.admin.addConfigItem(kind, data, actor)
  }
  async adminRemoveConfigItem(companyId: string, kind: 'position' | 'shift' | 'holiday' | 'unit', id: string, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.removeConfigItem(companyId, kind, id)
    await delay(LATENCY() / 3); this.admin.removeConfigItem(kind, id, actor)
  }

  async adminSystemHealth(companyId: string) {
    if (SERVER_ADMIN) return adminApi.systemHealth(companyId)
    await delay(LATENCY() / 2); return this.admin.systemHealth()
  }
  async adminGetRetention(companyId: string) {
    if (SERVER_ADMIN) return adminApi.getRetention(companyId)
    await delay(LATENCY() / 3); return this.admin.getRetention()
  }
  async adminUpdateRetention(companyId: string, patch: Partial<RetentionSettings>, actor: AdminActor) {
    if (SERVER_ADMIN) return adminApi.updateRetention(companyId, patch)
    await delay(LATENCY() / 3); return this.admin.updateRetention(patch, actor)
  }
  async adminListBackups(companyId: string) {
    if (SERVER_ADMIN) return adminApi.listBackups(companyId)
    await delay(LATENCY() / 2); return this.admin.listBackups()
  }
  async adminCreateBackup(companyId: string, actor: AdminActor, note: string) {
    if (SERVER_ADMIN) {
      const r = await adminApi.createBackup(companyId, note)
      this.pushNotification(companyId, 'system', 'Backup created',
        `${r.backup.sizeKb} KB snapshot — restorable and downloadable.`)
      return r
    }
    await delay(LATENCY()); return this.admin.createBackup(actor, note)
  }
  async adminRestoreBackup(companyId: string, id: string, actor: AdminActor) {
    if (SERVER_ADMIN) {
      const r = await adminApi.restoreBackup(companyId, id)
      this.pushNotification(companyId, 'system', 'Restore complete',
        `${r.restored} row(s) reinstated. A snapshot of the previous state was taken first.`)
      return
    }
    await delay(LATENCY()); this.admin.restoreBackup(id, actor)
  }

  // ── permits to work ────────────────────────────────────────────────────────

  async listPermits(companyId: string, filters: PermitFilters) {
    if (SERVER_PERMITS) return permitsApi.list(companyId, filters)
    await delay(LATENCY()); return this.permits.list(companyId, filters)
  }

  async getPermit(id: string) {
    if (SERVER_PERMITS) return permitsApi.get(id)
    await delay(LATENCY() / 2); return this.permits.get(id)
  }

  async permitStats(companyId: string, siteId: string | null) {
    if (SERVER_PERMITS) return permitsApi.stats(companyId, siteId)
    await delay(LATENCY() / 2); return this.permits.stats(companyId, siteId)
  }

  async createPermit(input: NewPermitInput, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.create(input)
    await delay(LATENCY()); return this.permits.create(input, actor)
  }

  async submitPermit(id: string, actor: Actor) {
    if (SERVER_PERMITS) {
      const p = await permitsApi.submit(id)
      this.pushNotification(p.companyId, 'system', `Permit ${p.code} awaiting approval`, `${p.typeLabel} — ${p.location}`)
      return p
    }
    await delay(LATENCY() / 2); return this.permits.submit(id, actor)
  }

  async approvePermit(id: string, statement: string, actor: Actor) {
    if (SERVER_PERMITS) {
      const p = await permitsApi.approve(id, statement)
      this.pushNotification(p.companyId, 'system', `Permit ${p.code} issued`,
        `${p.typeLabel} at ${p.location}. Valid until ${fmtClock(p.validTo)}.`)
      return p
    }
    await delay(LATENCY() / 2); return this.permits.approve(id, statement, actor)
  }

  async rejectPermit(id: string, reason: string, actor: Actor) {
    if (SERVER_PERMITS) {
      const p = await permitsApi.reject(id, reason)
      this.pushNotification(p.companyId, 'system', `Permit ${p.code} rejected`, reason)
      return p
    }
    await delay(LATENCY() / 2); return this.permits.reject(id, reason, actor)
  }

  async activatePermit(id: string, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.activate(id)
    await delay(LATENCY() / 3); return this.permits.activate(id, actor)
  }

  async suspendPermit(id: string, reason: string, actor: Actor) {
    if (SERVER_PERMITS) {
      const p = await permitsApi.suspend(id, reason)
      this.pushNotification(p.companyId, 'incident', `Permit ${p.code} suspended`, `${reason} — work must stop immediately.`)
      return p
    }
    await delay(LATENCY() / 3); return this.permits.suspend(id, reason, actor)
  }

  async resumePermit(id: string, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.resume(id)
    await delay(LATENCY() / 3); return this.permits.resume(id, actor)
  }

  async closePermit(id: string, input: { handbackConfirmed: boolean; statement: string }, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.close(id, input)
    await delay(LATENCY() / 2); return this.permits.close(id, input, actor)
  }

  async confirmPermitControl(permitId: string, controlId: string, confirmed: boolean, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.confirmControl(permitId, controlId, confirmed)
    await delay(120); return this.permits.confirmControl(permitId, controlId, confirmed, actor)
  }

  async addPermitGasTest(permitId: string, reading: Omit<GasTest, 'id' | 'testedAt' | 'testedBy' | 'pass'>, actor: Actor) {
    if (SERVER_PERMITS) {
      const p = await permitsApi.addGasTest(permitId, reading)
      // The server suspends live work on a failed reading. Announce it from the
      // authoritative response rather than predicting it from the numbers sent.
      const latest = p.gasTests[p.gasTests.length - 1]
      if (latest && !latest.pass && p.status === 'suspended') {
        this.pushNotification(p.companyId, 'incident', `Permit ${p.code} suspended — gas test failed`,
          'Atmosphere outside safe limits. Evacuate and re-test.')
      }
      return p
    }
    await delay(LATENCY() / 2); return this.permits.addGasTest(permitId, reading, actor)
  }

  async addPermitIsolation(permitId: string, input: Pick<IsolationPoint, 'description' | 'tagId'>, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.addIsolation(permitId, input)
    await delay(LATENCY() / 2); return this.permits.addIsolation(permitId, input, actor)
  }

  async releasePermitIsolation(permitId: string, isolationId: string, actor: Actor) {
    if (SERVER_PERMITS) return permitsApi.releaseIsolation(permitId, isolationId)
    await delay(LATENCY() / 2); return this.permits.releaseIsolation(permitId, isolationId, actor)
  }

  /**
   * Expiry sweep. The server decides what is lapsing; this only raises the alert, once
   * per permit per state, so a board left open on a wall does not re-notify every 30s.
   */
  async sweepPermitExpiry(companyId: string) {
    if (!SERVER_PERMITS) {
      this.permits.sweepExpiring()
      return
    }
    if (!companyId) return

    const { warning, expired } = await permitsApi.expiring(companyId)

    const once = (key: string, fn: () => void) => {
      if (this.permitReminders.has(key)) return
      this.permitReminders.add(key)
      fn()
    }

    for (const p of warning) {
      once(`${p.id}:warn`, () => this.pushNotification(
        companyId, 'action', `Permit ${p.code} expires within the hour`,
        `${p.typeLabel} at ${p.location}. Extend or close before ${fmtClock(p.validTo)}.`,
      ))
    }
    for (const p of expired) {
      once(`${p.id}:expired`, () => this.pushNotification(
        companyId, 'incident', `Permit ${p.code} has EXPIRED with work open`,
        `${p.applicant} at ${p.location}. Work must stop until the permit is renewed.`,
      ))
    }
  }

  async listNotifications(companyId: string) {
    if (SERVER_NOTIFICATIONS) return companyId ? notificationsApi.list(companyId) : []
    await delay(LATENCY())
    return [...this.notifications]
  }

  async markNotificationRead(companyId: string, id: string) {
    if (SERVER_NOTIFICATIONS) return notificationsApi.markRead(companyId, id)
    await delay(100)
    const n = this.notifications.find((x) => x.id === id)
    if (n && !n.readAt) n.readAt = new Date().toISOString()
    this.persistNotifications()
  }

  async markAllNotificationsRead(companyId: string) {
    if (SERVER_NOTIFICATIONS) return notificationsApi.markAllRead(companyId)
    await delay(150)
    const at = new Date().toISOString()
    this.notifications.forEach((n) => (n.readAt = n.readAt ?? at))
    this.persistNotifications()
  }

  async listActivity(companyId: string, siteId?: string | null) {
    if (SERVER_ACTIVITY) return companyId ? activityApi.events(companyId, siteId) : []
    await delay(LATENCY())
    return [...ACTIVITY]
  }
}

export const api: ApiClient = new MockApiClient()
