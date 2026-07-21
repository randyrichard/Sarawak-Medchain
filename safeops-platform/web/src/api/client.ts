// ─── API client boundary ─────────────────────────────────────────────────────
// The ONLY seam between UI and data. Sprint 1 ships MockApiClient; the real
// HTTP client (Sprint 2+) implements the same interface and swaps in here.

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
  addIncidentAttachment(id: string, att: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>, actor: Actor): Promise<Incident>
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
  listAuditTemplates(): Promise<AuditTemplate[]>
  createAuditTemplate(name: string, items: string[], actor: Actor): Promise<AuditTemplate>
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
  createCourse(input: NewCourseInput, actor: Actor): Promise<CourseView>
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
  adminListUsers(companyId: string, filters: { q?: string; status?: string; role?: string }): Promise<AdminUser[]>
  adminGetUser(id: string): Promise<AdminUser>
  adminCreateUser(companyId: string, input: NewUserInput, actor: AdminActor): Promise<AdminUser>
  adminSetUserStatus(id: string, status: AdminUser['status'], actor: AdminActor): Promise<AdminUser>
  adminResetPassword(id: string, actor: AdminActor): Promise<{ token: string }>
  adminForcePasswordReset(id: string, actor: AdminActor): Promise<AdminUser>
  adminToggleMfa(id: string, actor: AdminActor): Promise<AdminUser>
  adminBulkImport(companyId: string, csv: string, actor: AdminActor): Promise<{ created: number; skipped: number; errors: string[] }>
  adminUserDevices(id: string): Promise<UserDevice[]>
  adminUserLoginHistory(id: string): Promise<LoginEvent[]>
  // administration — RBAC
  adminListRoles(): Promise<RoleDef[]>
  adminToggleRolePermission(roleId: string, module: RbacModule, action: RbacAction, actor: AdminActor): Promise<RoleDef>
  adminCreateRole(name: string, cloneFrom: string, actor: AdminActor): Promise<RoleDef>
  adminDeleteRole(roleId: string, actor: AdminActor): Promise<void>
  // administration — audit / security
  adminListAudit(filters: AdminAuditFilters): Promise<AuditEntry[]>
  adminGetSecurity(): Promise<SecuritySettings>
  adminUpdateSecurity(patch: Partial<SecuritySettings>, actor: AdminActor): Promise<SecuritySettings>
  adminLoginHistory(): Promise<LoginEvent[]>
  adminSecurityCenter(companyId: string): Promise<SecurityCenter>
  // administration — integrations & API
  adminListConnectors(): Promise<Connector[]>
  adminSetConnector(id: string, connected: boolean, config: Record<string, string> | undefined, actor: AdminActor): Promise<Connector>
  adminListApiKeys(): Promise<ApiKey[]>
  adminCreateApiKey(name: string, scopes: RbacAction[], actor: AdminActor): Promise<{ key: ApiKey; secret: string }>
  adminRevokeApiKey(id: string, actor: AdminActor): Promise<ApiKey>
  adminListWebhooks(): Promise<Webhook[]>
  adminCreateWebhook(url: string, events: string[], actor: AdminActor): Promise<Webhook>
  adminToggleWebhook(id: string, actor: AdminActor): Promise<Webhook>
  adminTestWebhook(id: string, actor: AdminActor): Promise<Webhook>
  adminApiUsage(): Promise<{ series: { label: string; calls: number; errors: number }[]; totalToday: number; errorRate: number }>
  // administration — org config
  adminGetOrgSettings(companyId: string): Promise<OrgSettings>
  adminUpdateOrgSettings(companyId: string, patch: Partial<OrgSettings>, actor: AdminActor): Promise<OrgSettings>
  adminListPositions(): Promise<JobPosition[]>
  adminListShifts(): Promise<ShiftPattern[]>
  adminListHolidays(): Promise<Holiday[]>
  adminListUnits(): Promise<BusinessUnit[]>
  adminAddConfigItem(kind: 'position' | 'shift' | 'holiday' | 'unit', data: Record<string, string>, actor: AdminActor): Promise<void>
  adminRemoveConfigItem(kind: 'position' | 'shift' | 'holiday' | 'unit', id: string, actor: AdminActor): Promise<void>
  // administration — health & backup
  adminSystemHealth(): Promise<SystemHealth>
  adminGetRetention(): Promise<RetentionSettings>
  adminUpdateRetention(patch: Partial<RetentionSettings>, actor: AdminActor): Promise<RetentionSettings>
  adminListBackups(): Promise<Backup[]>
  adminCreateBackup(actor: AdminActor, note: string): Promise<{ backup: Backup; snapshot: string }>
  adminRestoreBackup(id: string, actor: AdminActor): Promise<void>

  // shell data
  listNotifications(): Promise<AppNotification[]>
  markNotificationRead(id: string): Promise<void>
  markAllNotificationsRead(): Promise<void>
  listActivity(): Promise<ActivityEvent[]>
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8h
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

class MockApiClient implements ApiClient {
  // mutable copies so reset-password and read-state behave realistically
  private users = USERS.map((u) => ({ ...u }))
  private notifications = loadNotifications()
  private resetTokens = new Map<string, { email: string; exp: number }>()
  private pushNotification = (kind: AppNotification['kind'], title: string, detail: string) => {
    this.notifications.unshift({
      id: `n-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
      kind, title, detail, createdAt: new Date().toISOString(), readAt: null,
    })
    this.persistNotifications()
  }
  private incidents = new IncidentStore(this.pushNotification)
  private admin = new AdminStore(this.pushNotification)

  private persistNotifications() {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(this.notifications.slice(0, 100)))
    } catch {
      /* storage unavailable — in-memory still works */
    }
  }

  async login(email: string, password: string) {
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
    await delay(LATENCY() / 2)
    const user = this.users.find((u) => u.id === userId)
    if (!user) return []
    const ids = new Set(user.memberships.map((m) => m.companyId))
    return COMPANIES.filter((c) => ids.has(c.id))
  }

  async listSites(companyId: string) {
    await delay(LATENCY() / 2)
    return SITES.filter((s) => s.companyId === companyId)
  }

  async listDepartments(siteIds: string[]) {
    await delay(LATENCY() / 2)
    return DEPARTMENTS.filter((d) => siteIds.includes(d.siteId))
  }

  async listTeams(departmentIds: string[]) {
    await delay(LATENCY() / 2)
    return TEAMS.filter((t) => departmentIds.includes(t.departmentId))
  }

  async listEmployees(companyId: string) {
    await delay(LATENCY())
    return EMPLOYEES.filter((e) => e.companyId === companyId)
  }

  async getDashboard(companyId: string, siteId: string | null, scopeLabel: string) {
    await delay(650 + Math.random() * 350)
    // Mission Control reflects the live incident store, not just static seeds
    return buildDashboard(companyId, siteId, scopeLabel, this.incidents.liveStats(companyId, siteId))
  }

  // ── incidents ──────────────────────────────────────────────────────────────

  async listIncidents(companyId: string, filters: IncidentFilters) {
    await delay(LATENCY())
    return this.incidents.list(companyId, filters)
  }

  async getIncident(id: string) {
    await delay(LATENCY() / 2)
    return this.incidents.get(id)
  }

  async createIncident(input: NewIncidentInput, actor: Actor) {
    await delay(LATENCY())
    return this.incidents.create(input, actor)
  }

  async advanceIncident(id: string, payload: AdvancePayload, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.advance(id, payload, actor)
  }

  async saveIncidentRca(id: string, causes: RcaCause[], fiveWhys: FiveWhys, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.saveRca(id, causes, fiveWhys, actor)
  }

  async addIncidentAction(id: string, input: Pick<IncidentAction, 'title' | 'causeId' | 'owner' | 'dueDate' | 'priority' | 'evidenceRequired'>, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.addAction(id, input, actor)
  }

  async updateIncidentAction(id: string, actionId: string, patch: { status?: IncidentAction['status']; evidenceNote?: string }, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.updateAction(id, actionId, patch, actor)
  }

  async addIncidentComment(id: string, text: string, mentions: string[], actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.addComment(id, text, mentions, actor)
  }

  async addIncidentAttachment(id: string, att: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.addAttachment(id, att, actor)
  }

  async archiveIncident(id: string, actor: Actor) {
    await delay(LATENCY() / 2)
    this.incidents.archive(id, actor)
  }

  // ── CAPA ───────────────────────────────────────────────────────────────────

  async listCapa(companyId: string, filters: CapaFilters, actor: Actor) {
    await delay(LATENCY())
    return this.incidents.listCapa(companyId, filters, actor)
  }

  async capaStats(companyId: string, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.capaStats(companyId, actor)
  }

  async getCapa(actionId: string) {
    await delay(LATENCY() / 3)
    return this.incidents.getCapa(actionId)
  }

  async addStandaloneAction(input: NewStandaloneAction, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.addStandaloneAction(input, actor)
  }

  async updateCapa(actionId: string, patch: CapaPatch, actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.updateCapa(actionId, patch, actor)
  }

  async cancelCapa(actionId: string, reason: string, actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.cancelCapa(actionId, reason, actor)
  }

  async addCapaNote(actionId: string, text: string, mentions: string[], actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.addCapaNote(actionId, text, mentions, actor)
  }

  async capaAnalytics(companyId: string) {
    await delay(LATENCY())
    return this.incidents.capaAnalytics(companyId)
  }

  // ── assets & inspections ───────────────────────────────────────────────────

  async listAssets(companyId: string, filters: AssetFilters) {
    await delay(LATENCY())
    return this.incidents.listAssets(companyId, filters)
  }

  async getAssetProfile(idOrQr: string) {
    await delay(LATENCY() / 2)
    return this.incidents.getAssetProfile(idOrQr)
  }

  async createAsset(input: NewAssetInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.createAsset(input, actor)
  }

  async scheduleInspection(assetId: string, date: string, inspector: string, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.scheduleInspection(assetId, date, inspector, actor)
  }

  async completeInspection(inspectionId: string, input: CompleteInspectionInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.completeInspection(inspectionId, input, actor)
  }

  async listInspections(companyId: string, filters: InspectionFilters) {
    await delay(LATENCY())
    return this.incidents.listInspections(companyId, filters)
  }

  async assetStats(companyId: string) {
    await delay(LATENCY() / 2)
    return this.incidents.assetStats(companyId)
  }

  // ── audits & compliance ────────────────────────────────────────────────────

  async listAuditTemplates() {
    await delay(LATENCY() / 3)
    return this.incidents.listTemplates()
  }

  async createAuditTemplate(name: string, items: string[], actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.createTemplate(name, items, actor)
  }

  async listAudits(companyId: string, filters: AuditFilters) {
    await delay(LATENCY())
    return this.incidents.listAudits(companyId, filters)
  }

  async getAuditDetail(id: string) {
    await delay(LATENCY() / 2)
    return this.incidents.getAuditDetail(id)
  }

  async createAudit(input: NewAuditInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.createAudit(input, actor)
  }

  async startAudit(id: string, actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.startAudit(id, actor)
  }

  async completeAudit(id: string, input: CompleteAuditInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.completeAudit(id, input, actor)
  }

  async closeAudit(id: string, actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.closeAudit(id, actor)
  }

  async listFindings(companyId: string, severity?: string) {
    await delay(LATENCY() / 2)
    return this.incidents.listFindings(companyId, severity)
  }

  async listObligations(companyId: string) {
    await delay(LATENCY() / 2)
    return this.incidents.listObligations(companyId)
  }

  async renewObligation(id: string, nextDue: string, note: string, actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.renewObligation(id, nextDue, note, actor)
  }

  async listDocuments(companyId: string, q?: string, kind?: DocKind | '') {
    await delay(LATENCY() / 2)
    return this.incidents.listDocuments(companyId, q, kind)
  }

  async addDocumentVersion(docId: string | null, input: { name: string; kind: DocKind; sizeKb: number; note: string; companyId: string; siteId: string | null }, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.addDocumentVersion(docId, input, actor)
  }

  async approveDocument(id: string, actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.approveDocument(id, actor)
  }

  async auditStats(companyId: string) {
    await delay(LATENCY() / 2)
    return this.incidents.auditStats(companyId)
  }

  // ── training & competency ──────────────────────────────────────────────────

  async listCourses(companyId: string) {
    await delay(LATENCY() / 2)
    return this.incidents.listCourses(companyId)
  }

  async createCourse(input: NewCourseInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.createCourse(input, actor)
  }

  async trainingMatrix(companyId: string, actor: Actor) {
    await delay(LATENCY())
    return this.incidents.trainingMatrix(companyId, actor)
  }

  async getEmployeeTraining(employeeId: string) {
    await delay(LATENCY() / 2)
    return this.incidents.getEmployeeTraining(employeeId)
  }

  async listSessions(companyId: string, filters: SessionFilters) {
    await delay(LATENCY())
    return this.incidents.listSessions(companyId, filters)
  }

  async createSession(input: NewSessionInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.createSession(input, actor)
  }

  async enrollSession(sessionId: string, employeeIds: string[], actor: Actor) {
    await delay(LATENCY() / 3)
    return this.incidents.enrollSession(sessionId, employeeIds, actor)
  }

  async completeSession(sessionId: string, input: CompleteSessionInput, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.completeSession(sessionId, input, actor)
  }

  async listCertificates(companyId: string, filters: TrainingFilters, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.listCertificates(companyId, filters, actor)
  }

  async verifyCertificate(codeOrKey: string) {
    await delay(LATENCY() / 3)
    return this.incidents.verifyCertificate(codeOrKey)
  }

  async raiseTrainingAction(employeeId: string, courseId: string, actor: Actor) {
    await delay(LATENCY() / 2)
    return this.incidents.raiseTrainingAction(employeeId, courseId, actor)
  }

  async trainingStats(companyId: string) {
    await delay(LATENCY() / 2)
    return this.incidents.trainingStats(companyId)
  }

  // ── administration ─────────────────────────────────────────────────────────

  async adminListUsers(companyId: string, filters: { q?: string; status?: string; role?: string }) {
    await delay(LATENCY()); return this.admin.listUsers(companyId, filters)
  }
  async adminGetUser(id: string) { await delay(LATENCY() / 3); return this.admin.getUser(id) }
  async adminCreateUser(companyId: string, input: NewUserInput, actor: AdminActor) { await delay(LATENCY() / 2); return this.admin.createUser(companyId, input, actor) }
  async adminSetUserStatus(id: string, status: AdminUser['status'], actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.setUserStatus(id, status, actor) }
  async adminResetPassword(id: string, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.resetPassword(id, actor) }
  async adminForcePasswordReset(id: string, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.forcePasswordReset(id, actor) }
  async adminToggleMfa(id: string, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.toggleMfa(id, actor) }
  async adminBulkImport(companyId: string, csv: string, actor: AdminActor) { await delay(LATENCY()); return this.admin.bulkImportUsers(companyId, csv, actor) }
  async adminUserDevices(id: string) { await delay(LATENCY() / 3); return this.admin.getUserDevices(id) }
  async adminUserLoginHistory(id: string) { await delay(LATENCY() / 3); return this.admin.getUserLoginHistory(id) }

  async adminListRoles() { await delay(LATENCY() / 2); return this.admin.listRoles() }
  async adminToggleRolePermission(roleId: string, module: RbacModule, action: RbacAction, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.toggleRolePermission(roleId, module, action, actor) }
  async adminCreateRole(name: string, cloneFrom: string, actor: AdminActor) { await delay(LATENCY() / 2); return this.admin.createRole(name, cloneFrom, actor) }
  async adminDeleteRole(roleId: string, actor: AdminActor) { await delay(LATENCY() / 3); this.admin.deleteRole(roleId, actor) }

  async adminListAudit(filters: AdminAuditFilters) { await delay(LATENCY() / 2); return this.admin.listAudit(filters) }
  async adminGetSecurity() { await delay(LATENCY() / 3); return this.admin.getSecurity() }
  async adminUpdateSecurity(patch: Partial<SecuritySettings>, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.updateSecurity(patch, actor) }
  async adminLoginHistory() { await delay(LATENCY() / 2); return this.admin.listLoginHistory() }
  async adminSecurityCenter(companyId: string) { await delay(LATENCY() / 2); return this.admin.securityCenter(companyId) }

  async adminListConnectors() { await delay(LATENCY() / 2); return this.admin.listConnectors() }
  async adminSetConnector(id: string, connected: boolean, config: Record<string, string> | undefined, actor: AdminActor) { await delay(LATENCY() / 2); return this.admin.setConnector(id, connected, config, actor) }
  async adminListApiKeys() { await delay(LATENCY() / 2); return this.admin.listApiKeys() }
  async adminCreateApiKey(name: string, scopes: RbacAction[], actor: AdminActor) { await delay(LATENCY() / 2); return this.admin.createApiKey(name, scopes, actor) }
  async adminRevokeApiKey(id: string, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.revokeApiKey(id, actor) }
  async adminListWebhooks() { await delay(LATENCY() / 2); return this.admin.listWebhooks() }
  async adminCreateWebhook(url: string, events: string[], actor: AdminActor) { await delay(LATENCY() / 2); return this.admin.createWebhook(url, events, actor) }
  async adminToggleWebhook(id: string, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.toggleWebhook(id, actor) }
  async adminTestWebhook(id: string, actor: AdminActor) { await delay(LATENCY()); return this.admin.testWebhook(id, actor) }
  async adminApiUsage() { await delay(LATENCY() / 2); return this.admin.apiUsage() }

  async adminGetOrgSettings(companyId: string) { await delay(LATENCY() / 3); return this.admin.getOrgSettings(companyId) }
  async adminUpdateOrgSettings(companyId: string, patch: Partial<OrgSettings>, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.updateOrgSettings(companyId, patch, actor) }
  async adminListPositions() { await delay(LATENCY() / 3); return this.admin.listPositions() }
  async adminListShifts() { await delay(LATENCY() / 3); return this.admin.listShifts() }
  async adminListHolidays() { await delay(LATENCY() / 3); return this.admin.listHolidays() }
  async adminListUnits() { await delay(LATENCY() / 3); return this.admin.listUnits() }
  async adminAddConfigItem(kind: 'position' | 'shift' | 'holiday' | 'unit', data: Record<string, string>, actor: AdminActor) { await delay(LATENCY() / 3); this.admin.addConfigItem(kind, data, actor) }
  async adminRemoveConfigItem(kind: 'position' | 'shift' | 'holiday' | 'unit', id: string, actor: AdminActor) { await delay(LATENCY() / 3); this.admin.removeConfigItem(kind, id, actor) }

  async adminSystemHealth() { await delay(LATENCY() / 2); return this.admin.systemHealth() }
  async adminGetRetention() { await delay(LATENCY() / 3); return this.admin.getRetention() }
  async adminUpdateRetention(patch: Partial<RetentionSettings>, actor: AdminActor) { await delay(LATENCY() / 3); return this.admin.updateRetention(patch, actor) }
  async adminListBackups() { await delay(LATENCY() / 2); return this.admin.listBackups() }
  async adminCreateBackup(actor: AdminActor, note: string) { await delay(LATENCY()); return this.admin.createBackup(actor, note) }
  async adminRestoreBackup(id: string, actor: AdminActor) { await delay(LATENCY()); this.admin.restoreBackup(id, actor) }

  async listNotifications() {
    await delay(LATENCY())
    return [...this.notifications]
  }

  async markNotificationRead(id: string) {
    await delay(100)
    const n = this.notifications.find((x) => x.id === id)
    if (n && !n.readAt) n.readAt = new Date().toISOString()
    this.persistNotifications()
  }

  async markAllNotificationsRead() {
    await delay(150)
    const at = new Date().toISOString()
    this.notifications.forEach((n) => (n.readAt = n.readAt ?? at))
    this.persistNotifications()
  }

  async listActivity() {
    await delay(LATENCY())
    return [...ACTIVITY]
  }
}

export const api: ApiClient = new MockApiClient()
