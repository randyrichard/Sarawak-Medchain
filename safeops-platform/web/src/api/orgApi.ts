import { request, qs } from './http'
import type { Company, Department, PlanEntitlements, Site, Team } from './types'

/**
 * HTTP client for the organisation tree.
 *
 * Replaces the COMPANIES / SITES / DEPARTMENTS / TEAMS fixtures. These are the same rows
 * every other module is scoped by, so the shell now reads the structure it is filtering
 * against rather than a parallel copy that could drift from it.
 */

interface ServerCompany {
  id: string
  name: string
  plan: string
  industry: string
  logoInitials: string
  entitlements?: PlanEntitlements
}

interface ServerSite {
  id: string
  companyId: string
  name: string
  short: string
  city: string
  timezone: string
  headcount: number
}

function toCompany(c: ServerCompany): Company {
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    plan: c.plan ?? '',
    /*
     * An API that has not been redeployed yet does not send this. Falling back to no
     * limits keeps that customer working exactly as they did rather than showing them a
     * limit nobody set - and the API is the enforcement either way, so an over-permissive
     * guess in the browser buys nothing but a clearer error.
     */
    entitlements: c.entitlements ?? { maxSites: null, integrations: true },
    logoInitials: c.logoInitials,
  }
}

export const orgApi = {
  /** No parameter: the server answers with the workspaces the session can open. */
  async listCompanies(): Promise<Company[]> {
    const rows = await request<ServerCompany[]>('/org/companies')
    return rows.map(toCompany)
  },

  async listSites(companyId: string): Promise<Site[]> {
    return request<ServerSite[]>(`/org/sites?${qs({ companyId })}`)
  },

  async listDepartments(siteIds: string[]): Promise<Department[]> {
    if (siteIds.length === 0) return []
    return request<Department[]>(`/org/departments?${qs({ siteIds: siteIds.join(',') })}`)
  },

  async listTeams(departmentIds: string[]): Promise<Team[]> {
    if (departmentIds.length === 0) return []
    return request<Team[]>(`/org/teams?${qs({ departmentIds: departmentIds.join(',') })}`)
  },
}
