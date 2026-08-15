import { request } from './http'

/**
 * The SafeOps platform console.
 *
 * Above every customer rather than inside one, so it is deliberately a separate client
 * from the tenant-scoped admin API. Nothing here takes a companyId to scope a read - these
 * calls are authorized by the caller being platform staff, checked server-side against the
 * database on every request.
 */

export interface PlatformPlan {
  key: string
  label: string
  summary: string
  monthlyPriceMyr: number
  /** Pre-formatted server-side, so the console and any future invoice agree. */
  monthlyPrice: string
}

export interface PlatformCompany {
  id: string
  name: string
  industry: string
  plan: string
  planLabel: string
  monthlyPriceMyr: number
  monthlyPrice: string
  status: string
  subscriptionStatus: string
  provisionedAt: string | null
  provisionedBy: string | null
  users: number
  sites: number
}

export interface ProvisionResult {
  companyId: string
  companyName: string
  siteId: string
  siteName: string
  adminEmail: string
  plan: string
  planLabel: string
  monthlyPrice: string
  deliveryStatus: 'created' | 'email_pending' | 'sent' | 'failed'
  /** Present only when no email went out. Absent once a provider has the message. */
  invitationUrl?: string
}

export const platformApi = {
  /**
   * Whether this session may see the console, and what it may sell.
   *
   * Answers for everybody rather than 403ing, because the app calls it on load to decide
   * whether to show the navigation entry at all.
   */
  me(): Promise<{ platformAdmin: boolean; plans: PlatformPlan[] }> {
    return request('/platform/me')
  },

  listCompanies(): Promise<PlatformCompany[]> {
    return request<{ rows: PlatformCompany[] }>('/platform/companies').then((r) => r.rows)
  },

  provisionCompany(input: {
    companyName: string
    plan: string
    industry?: string
    adminName: string
    adminEmail: string
    siteName: string
    siteCity?: string
    siteTimezone?: string
  }): Promise<ProvisionResult> {
    return request('/platform/companies', { method: 'POST', body: JSON.stringify(input) })
  },

  updateCompany(id: string, patch: {
    plan?: string
    status?: string
    subscriptionStatus?: string
    billingReference?: string | null
  }): Promise<unknown> {
    return request(`/platform/companies/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
  },
}
