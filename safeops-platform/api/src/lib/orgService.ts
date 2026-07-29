import type { PrismaClient } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller } from './incidentService.js'

export class OrgError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

/**
 * The organisation tree: companies, sites, departments and teams.
 *
 * Read-only. These rows are seeded and edited through the administration console's
 * organisation section; this service exists so the shell stops reading them from a
 * client-side fixture and starts reading the same rows every other module is scoped by.
 */
export class OrgService {
  constructor(private db: PrismaClient) {}

  private companyIds(caller: Caller): string[] {
    return caller.roles.map((r) => r.companyId)
  }

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new OrgError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  /**
   * The workspaces this caller belongs to.
   *
   * Derived from the verified session's memberships rather than from a requested list:
   * the company switcher must offer exactly what the person can actually open.
   */
  async listCompanies(caller: Caller) {
    const ids = this.companyIds(caller)
    if (ids.length === 0) return []
    return this.db.company.findMany({
      where: { id: { in: ids } },
      orderBy: { name: 'asc' },
    })
  }

  async listSites(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    return this.db.site.findMany({
      where: {
        companyId,
        // A site-scoped role sees its own sites. An empty list means organisation-wide,
        // which is how the seeded managers are set up.
        ...(m.siteIds.length > 0 && ['safety_officer', 'supervisor'].includes(m.role)
          ? { id: { in: m.siteIds } }
          : {}),
      },
      orderBy: { name: 'asc' },
    })
  }

  async listDepartments(caller: Caller, siteIds: string[]) {
    if (siteIds.length === 0) return []
    // Scoped through the site's company: a department id alone must not reach across
    // tenants just because the caller can guess it.
    return this.db.department.findMany({
      where: {
        id: { not: undefined },
        siteId: { in: siteIds },
        site: { companyId: { in: this.companyIds(caller) } },
      },
      orderBy: { name: 'asc' },
    })
  }

  async listTeams(caller: Caller, departmentIds: string[]) {
    if (departmentIds.length === 0) return []
    return this.db.team.findMany({
      where: {
        departmentId: { in: departmentIds },
        department: { site: { companyId: { in: this.companyIds(caller) } } },
      },
      orderBy: { name: 'asc' },
    })
  }

  /** The whole tree for one workspace, in the shape the organisation page renders. */
  async tree(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const company = await this.db.company.findUnique({ where: { id: companyId } })
    if (!company) throw new OrgError('not_found', 'Workspace not found.', 404)

    const sites = await this.db.site.findMany({
      where: { companyId },
      include: { departments: { include: { teams: true }, orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    })

    return { company, sites }
  }
}
