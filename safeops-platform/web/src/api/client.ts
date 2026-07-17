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
import {
  ACTIVITY, COMPANIES, DEPARTMENTS, EMPLOYEES, NOTIFICATIONS, SITES, TEAMS, USERS,
} from './mock/fixtures'
import { buildDashboard } from './mock/dashboard'
import { IncidentStore } from './mock/incidents'
import { delay } from '@/lib/time'

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
  private incidents = new IncidentStore((kind, title, detail) => {
    this.notifications.unshift({
      id: `n-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
      kind,
      title,
      detail,
      createdAt: new Date().toISOString(),
      readAt: null,
    })
    this.persistNotifications()
  })

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
      throw new ApiError('invalid_credentials', 'Email or password is incorrect.')
    }
    const exp = Date.now() + SESSION_TTL_MS
    const session: Session = { token: encodeToken({ sub: user.id, exp }), userId: user.id, expiresAt: exp }
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
