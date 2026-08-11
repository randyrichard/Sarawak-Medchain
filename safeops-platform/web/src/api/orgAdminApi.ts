import { request, qs } from './http'

/**
 * Organisation administration.
 *
 * Sites, departments, invitations and who may do what. Every call carries the workspace id
 * and every one is re-checked server-side against the caller's membership - the companyId
 * here scopes the request, it does not grant anything.
 */

export interface AdminSite {
  id: string
  name: string
  code: string
  short: string
  city: string
  address: string
  timezone: string
  contactName: string
  contactPhone: string
  headcount: number
  active: boolean
  /** What the site is carrying, so nobody expects a delete button. */
  inUse: {
    incidents: number
    permits: number
    assets: number
    employees: number
    departments: number
  }
}

export interface AdminDepartment {
  id: string
  name: string
  code: string
  active: boolean
  siteId: string
  siteName: string
  manager: { id: string; name: string; email: string } | null
  inUse: { incidents: number; visitors: number; teams: number }
}

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired'
/** Delivery, in the same words the Reports page uses. */
export type InvitationDelivery = 'created' | 'email_pending' | 'sent' | 'failed'

export interface AdminInvitation {
  id: string
  email: string
  role: string
  siteIds: string[]
  siteNames: string[]
  departmentId: string | null
  departmentName: string | null
  invitedBy: string
  createdAt: string
  expiresAt: string
  state: InvitationState
  acceptedAt: string | null
  userId: string
  userName: string
  userStatus: string
  /* Delivery is separate from the invitation's own lifecycle: a failed email leaves a
   * perfectly valid invitation that simply has not reached anybody. */
  deliveryStatus: InvitationDelivery
  sentAt: string | null
  lastAttemptAt: string | null
  failureReason: string | null
  provider: string | null
  attempts: number
  maxSends: number
}

export interface RoleCatalogEntry {
  role: string
  label: string
  summary: string
}

export const orgAdminApi = {
  // ── Sites ─────────────────────────────────────────────────────────────────
  listSites(companyId: string): Promise<AdminSite[]> {
    return request<{ rows: AdminSite[] }>(`/admin/sites?${qs({ companyId })}`).then((r) => r.rows)
  },

  createSite(companyId: string, input: {
    name: string; code?: string; city?: string; address?: string
    timezone?: string; contactName?: string; contactPhone?: string
  }): Promise<AdminSite> {
    return request('/admin/sites', { method: 'POST', body: JSON.stringify({ companyId, ...input }) })
  },

  updateSite(companyId: string, id: string, patch: Partial<{
    name: string; code: string; city: string; address: string
    timezone: string; contactName: string; contactPhone: string
  }>): Promise<AdminSite> {
    return request(`/admin/sites/${id}`, {
      method: 'PATCH', body: JSON.stringify({ companyId, ...patch }),
    })
  },

  setSiteActive(companyId: string, id: string, active: boolean): Promise<AdminSite> {
    return request(`/admin/sites/${id}/status`, {
      method: 'POST', body: JSON.stringify({ companyId, active }),
    })
  },

  // ── Departments ───────────────────────────────────────────────────────────
  listDepartments(companyId: string, siteId?: string): Promise<AdminDepartment[]> {
    return request<{ rows: AdminDepartment[] }>(`/admin/departments?${qs({ companyId, siteId })}`)
      .then((r) => r.rows)
  },

  createDepartment(companyId: string, input: {
    name: string; siteId: string; code?: string; managerUserId?: string | null
  }): Promise<AdminDepartment> {
    return request('/admin/departments', {
      method: 'POST', body: JSON.stringify({ companyId, ...input }),
    })
  },

  updateDepartment(companyId: string, id: string, patch: {
    name?: string; code?: string; managerUserId?: string | null
  }): Promise<AdminDepartment> {
    return request(`/admin/departments/${id}`, {
      method: 'PATCH', body: JSON.stringify({ companyId, ...patch }),
    })
  },

  setDepartmentActive(companyId: string, id: string, active: boolean): Promise<AdminDepartment> {
    return request(`/admin/departments/${id}/status`, {
      method: 'POST', body: JSON.stringify({ companyId, active }),
    })
  },

  // ── Invitations ───────────────────────────────────────────────────────────
  listInvitations(companyId: string): Promise<AdminInvitation[]> {
    return request<{ rows: AdminInvitation[] }>(`/admin/invitations?${qs({ companyId })}`)
      .then((r) => r.rows)
  },

  /**
   * Issues an invitation and sends it through the configured email provider.
   *
   * The token comes back only when the email did not go - no provider configured, or the
   * provider refused it. Once a provider has the message the administrator has no need for
   * the secret, and there is no reason to put a working credential through another system.
   */
  createInvitation(companyId: string, input: {
    email: string; name?: string; role: string
    siteIds?: string[]; departmentId?: string | null
  }): Promise<{
    id: string; email: string; role: string; expiresAt: string
    deliveryStatus: InvitationDelivery; token?: string
  }> {
    return request('/admin/invitations', {
      method: 'POST', body: JSON.stringify({ companyId, ...input }),
    })
  },

  /** Sends the invitation again with a fresh link; the previous one stops working. */
  resendInvitation(companyId: string, id: string): Promise<{
    id: string; email: string; deliveryStatus: InvitationDelivery; token?: string
  }> {
    return request(`/admin/invitations/${id}/resend`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  revokeInvitation(companyId: string, id: string): Promise<void> {
    return request(`/admin/invitations/${id}/revoke`, {
      method: 'POST', body: JSON.stringify({ companyId }),
    })
  },

  // ── Access ────────────────────────────────────────────────────────────────
  roleCatalog(companyId: string): Promise<RoleCatalogEntry[]> {
    return request<{ rows: RoleCatalogEntry[] }>(`/admin/role-catalog?${qs({ companyId })}`)
      .then((r) => r.rows)
  },

  setUserAccess(companyId: string, userId: string, patch: {
    role?: string; siteIds?: string[]; departmentId?: string | null
  }): Promise<unknown> {
    return request(`/admin/users/${userId}/access`, {
      method: 'PATCH', body: JSON.stringify({ companyId, ...patch }),
    })
  },
}
