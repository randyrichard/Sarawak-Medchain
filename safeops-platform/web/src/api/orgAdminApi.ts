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

export interface AdminInvitation {
  id: string
  email: string
  role: string
  siteIds: string[]
  departmentId: string | null
  invitedBy: string
  createdAt: string
  expiresAt: string
  state: InvitationState
  acceptedAt: string | null
  userId: string
  userName: string
  userStatus: string
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
   * Issues an invitation. The token comes back exactly once, here.
   *
   * With no mail provider configured, this link is how the invitee gets in - the console
   * shows it to the administrator to pass on, rather than pretending an email was sent.
   */
  createInvitation(companyId: string, input: {
    email: string; name?: string; role: string
    siteIds?: string[]; departmentId?: string | null
  }): Promise<{ id: string; email: string; role: string; expiresAt: string; token: string }> {
    return request('/admin/invitations', {
      method: 'POST', body: JSON.stringify({ companyId, ...input }),
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
