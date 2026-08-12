import { request, qs } from './http'
import { drain } from './paging'
import type {
  AdminUser, ApiKey, AuditEntry, AuditFilters, Backup, BusinessUnit, Connector, Holiday,
  JobPosition, LoginEvent, NewUserInput, OrgSettings, RbacAction, RbacModule,
  RetentionSettings, RoleDef, SecurityCenter, SecuritySettings, ShiftPattern, SystemHealth,
  UserDevice, Webhook,
} from './admin'

/**
 * HTTP client for the administration console.
 *
 * Replaces the browser-storage store. User lifecycle, roles, devices and login history
 * now act on the real authentication tables — deactivating an account here is the same
 * act that stops the person signing in.
 */

const iso = (v: string | null | undefined) => v ?? null

interface ServerUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  mfaEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  siteIds: string[]
  department: string | null
  forcePasswordReset: boolean
  failedLogins: number
}

interface ServerAudit {
  id: string
  at: string
  actor: string
  actorRole: string
  action: string
  module: string
  target: string
  ip: string
  device: string
  oldValue: string | null
  newValue: string | null
}

interface ServerLogin {
  id: string
  at: string
  userId: string
  userName: string
  email: string
  ip: string
  device: string
  result: string
  suspicious: boolean
}

function toUser(u: ServerUser): AdminUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status as AdminUser['status'],
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: iso(u.lastLoginAt),
    createdAt: u.createdAt,
    siteIds: u.siteIds,
    department: u.department ?? undefined,
    forcePasswordReset: u.forcePasswordReset,
    failedLogins: u.failedLogins,
  }
}

function toLogin(l: ServerLogin): LoginEvent {
  return {
    id: l.id,
    at: l.at,
    userId: l.userId,
    userName: l.userName,
    email: l.email,
    ip: l.ip,
    device: l.device,
    // The server records the real outcome; the console shows success or failure.
    result: l.result === 'success' ? 'success' : 'failed',
    location: '',
    suspicious: l.suspicious,
  }
}

function toAudit(a: ServerAudit): AuditEntry {
  return {
    id: a.id,
    at: a.at,
    actor: a.actor,
    actorRole: a.actorRole,
    action: a.action,
    module: a.module as AuditEntry['module'],
    target: a.target,
    ip: a.ip,
    device: a.device,
    oldValue: a.oldValue ?? undefined,
    newValue: a.newValue ?? undefined,
  }
}

export const adminApi = {
  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(companyId: string, filters: { q?: string; status?: string; role?: string }) {
    const rows = await request<ServerUser[]>(`/admin/users?${qs({ companyId, ...filters })}`)
    return rows.map(toUser)
  },

  async getUser(companyId: string, id: string) {
    return toUser(await request<ServerUser>(`/admin/users/${id}?${qs({ companyId })}`))
  },

  async createUser(companyId: string, input: NewUserInput) {
    return toUser(await request<ServerUser>('/admin/users', {
      method: 'POST', body: JSON.stringify({ companyId, ...input }),
    }))
  },

  async setUserStatus(companyId: string, id: string, status: AdminUser['status']) {
    return toUser(await request<ServerUser>(`/admin/users/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ companyId, status }),
    }))
  },

  /** The raw token is returned once and never again — the server stores only its digest. */
  async resetPassword(companyId: string, id: string) {
    return request<{ token: string; expiresInMinutes: number }>(`/admin/users/${id}/reset-password`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  async forcePasswordReset(companyId: string, id: string) {
    return toUser(await request<ServerUser>(`/admin/users/${id}/force-reset`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    }))
  },

  async toggleMfa(companyId: string, id: string) {
    return toUser(await request<ServerUser>(`/admin/users/${id}/toggle-mfa`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    }))
  },

  async bulkImport(companyId: string, csv: string) {
    return request<{ created: number; skipped: number; errors: string[] }>('/admin/users/import', {
      method: 'POST', body: JSON.stringify({ companyId, csv }),
    })
  },

  async userDevices(companyId: string, id: string) {
    return request<UserDevice[]>(`/admin/users/${id}/devices?${qs({ companyId })}`)
  },

  async userLoginHistory(companyId: string, id: string) {
    const rows = await request<ServerLogin[]>(`/admin/users/${id}/logins?${qs({ companyId })}`)
    return rows.map(toLogin)
  },

  // ── RBAC ───────────────────────────────────────────────────────────────────

  async listRoles(companyId: string) {
    return request<RoleDef[]>(`/admin/roles?${qs({ companyId })}`)
  },

  async toggleRolePermission(companyId: string, roleId: string, module: RbacModule, action: RbacAction) {
    return request<RoleDef>(`/admin/roles/${roleId}/permissions`, {
      method: 'PATCH', body: JSON.stringify({ companyId, module, action }),
    })
  },

  async createRole(companyId: string, name: string, cloneFrom: string) {
    return request<RoleDef>('/admin/roles', {
      method: 'POST', body: JSON.stringify({ companyId, name, cloneFrom }),
    })
  },

  async deleteRole(companyId: string, roleId: string) {
    await request<void>(`/admin/roles/${roleId}?${qs({ companyId })}`, { method: 'DELETE' })
  },

  // ── Audit & security ───────────────────────────────────────────────────────

  /**
   * The audit trail.
   *
   * Server-side paged and drained here, the same way the other list screens work. The trail
   * is a compliance record, so stopping at the first page would mean an administrator
   * simply cannot reach last quarter's entries; `drain` walks the pages the server already
   * returns and reports honestly when it hits its own ceiling.
   */
  async listAudit(companyId: string, filters: AuditFilters) {
    const drained = await drain<ServerAudit>(async (page, pageSize) => {
      const res = await request<{ rows: ServerAudit[]; total: number }>(
        `/admin/audit?${qs({ companyId, ...filters, page, pageSize })}`,
      )
      return { rows: res.rows, total: res.total }
    })
    return { rows: drained.rows.map(toAudit), total: drained.total, complete: drained.complete }
  },

  async getSecurity(companyId: string) {
    return request<SecuritySettings>(`/admin/security?${qs({ companyId })}`)
  },

  async updateSecurity(companyId: string, patch: Partial<SecuritySettings>) {
    return request<SecuritySettings>('/admin/security', {
      method: 'PATCH', body: JSON.stringify({ companyId, ...patch }),
    })
  },

  async loginHistory(companyId: string) {
    const rows = await request<ServerLogin[]>(`/admin/security/logins?${qs({ companyId })}`)
    return rows.map(toLogin)
  },

  async securityCenter(companyId: string) {
    return request<SecurityCenter>(`/admin/security/center?${qs({ companyId })}`)
  },

  // ── Integrations ───────────────────────────────────────────────────────────

  async listConnectors(companyId: string) {
    return request<Connector[]>(`/admin/connectors?${qs({ companyId })}`)
  },

  async setConnector(companyId: string, id: string, connected: boolean, config?: Record<string, string>) {
    return request<Connector>(`/admin/connectors/${id}`, {
      method: 'PATCH', body: JSON.stringify({ companyId, connected, config }),
    })
  },

  async listApiKeys(companyId: string) {
    return request<ApiKey[]>(`/admin/api-keys?${qs({ companyId })}`)
  },

  /** The secret comes back exactly once; there is no endpoint that can show it again. */
  async createApiKey(companyId: string, name: string, scopes: RbacAction[]) {
    return request<{ key: ApiKey; secret: string }>('/admin/api-keys', {
      method: 'POST', body: JSON.stringify({ companyId, name, scopes }),
    })
  },

  async revokeApiKey(companyId: string, id: string) {
    return request<ApiKey>(`/admin/api-keys/${id}/revoke`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  async apiUsage(companyId: string) {
    return request<{
      series: { label: string; calls: number; errors: number }[]
      totalToday: number
      errorRate: number
    }>(`/admin/api-usage?${qs({ companyId })}`)
  },

  async listWebhooks(companyId: string) {
    return request<Webhook[]>(`/admin/webhooks?${qs({ companyId })}`)
  },

  async createWebhook(companyId: string, url: string, events: string[]) {
    return request<Webhook & { secret: string }>('/admin/webhooks', {
      method: 'POST', body: JSON.stringify({ companyId, url, events }),
    })
  },

  async toggleWebhook(companyId: string, id: string) {
    return request<Webhook>(`/admin/webhooks/${id}/toggle`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  async testWebhook(companyId: string, id: string) {
    return request<Webhook>(`/admin/webhooks/${id}/test`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  // ── Organisation configuration ─────────────────────────────────────────────

  async getOrgSettings(companyId: string) {
    return request<OrgSettings>(`/admin/org-settings?${qs({ companyId })}`)
  },

  async updateOrgSettings(companyId: string, patch: Partial<OrgSettings>) {
    return request<OrgSettings>('/admin/org-settings', {
      method: 'PATCH', body: JSON.stringify({ companyId, ...patch }),
    })
  },

  async listConfig<T>(companyId: string, kind: string) {
    return request<T[]>(`/admin/config/${kind}?${qs({ companyId })}`)
  },

  async addConfigItem(companyId: string, kind: string, data: Record<string, string>) {
    await request<unknown>(`/admin/config/${kind}`, {
      method: 'POST', body: JSON.stringify({ companyId, data }),
    })
  },

  async removeConfigItem(companyId: string, kind: string, id: string) {
    await request<void>(`/admin/config/${kind}/${id}?${qs({ companyId })}`, { method: 'DELETE' })
  },

  // ── Health & recovery ──────────────────────────────────────────────────────

  async systemHealth(companyId: string) {
    return request<SystemHealth>(`/admin/health?${qs({ companyId })}`)
  },

  async getRetention(companyId: string) {
    return request<RetentionSettings>(`/admin/retention?${qs({ companyId })}`)
  },

  async updateRetention(companyId: string, patch: Partial<RetentionSettings>) {
    return request<RetentionSettings>('/admin/retention', {
      method: 'PATCH', body: JSON.stringify({ companyId, ...patch }),
    })
  },

  async listBackups(companyId: string) {
    return request<Backup[]>(`/admin/backups?${qs({ companyId })}`)
  },

  async createBackup(companyId: string, note: string) {
    return request<{ backup: Backup; snapshot: string }>('/admin/backups', {
      method: 'POST', body: JSON.stringify({ companyId, note }),
    })
  },

  async restoreBackup(companyId: string, id: string) {
    return request<{ restored: number; skipped: number }>(`/admin/backups/${id}/restore`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },
}

export type { JobPosition, ShiftPattern, Holiday, BusinessUnit }
