import { request, qs } from './http'
import type { Company, Department, Site, Team } from './types'

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
    plan: (c.plan as Company['plan']) ?? 'enterprise',
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
