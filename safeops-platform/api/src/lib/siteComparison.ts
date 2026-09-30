/**
 * Every site, side by side.
 *
 * The dashboard's "All sites" adds the sites together, which answers "how is the company
 * doing" and hides the question an HSE manager running several sites actually asks first:
 * which one is falling behind. One row per site, the same figures in the same columns, the
 * ones that need attention at the top.
 *
 * Every count uses the same definition and the same row scope as the screen it comes from:
 * incidents as the register shows them to this caller, actions as the tracker does, permits
 * "active" exactly as the permit board means it, toolbox meetings in each site's own
 * calendar day. A figure here that disagreed with the page one click away would be worse
 * than no figure.
 *
 * "Days without a lost-time injury" is the number the site safety officer named when asked
 * which figures they report (docs/CUSTOMER_RESEARCH.md: "LTI-free days"). It counts from
 * the last lost-time case at that site; a site with none on record says so rather than
 * claiming a number of days the product cannot vouch for.
 */
import type { Prisma, PrismaClient, Role } from '@prisma/client'
import {
  actionScopeWhere, incidentScopeWhere, overdueActionWhere, type Caller,
} from './incidentService.js'
import { LOST_TIME_SEVERITIES, isInjury, isNearMiss } from './incidentCatalog.js'
import { ON_SITE_STATUSES } from './visitorService.js'
import { ToolboxService } from './toolboxService.js'
import { DomainError } from './errors.js'

export class SiteComparisonError extends DomainError {}

/** The people who manage more than one site's safety - and the executive above them. */
const COMPARE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'ceo']

const DAY = 86_400_000
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

export interface SiteRow {
  siteId: string
  siteName: string
  city: string
  openIncidents: number
  highRiskOpen: number
  incidentsInRange: number
  nearMissesInRange: number
  injuriesInRange: number
  /** Null when the site has no lost-time case on record. */
  daysSinceLostTime: number | null
  lastLostTimeAt: string | null
  overdueActions: number
  openActions: number
  activePermits: number
  toolboxToday: boolean
  toolboxHeadcount: number
  visitorsOnSite: number
  /** Why this site is near the top, in words; empty when nothing needs attention. */
  attention: string[]
}

export class SiteComparisonService {
  private toolbox: ToolboxService

  constructor(private db: PrismaClient) {
    this.toolbox = new ToolboxService(db)
  }

  async compare(caller: Caller, f: { companyId: string; projectId?: string | null; from?: string | null; to?: string | null }) {
    const m = caller.roles.find((r) => r.companyId === f.companyId)
    if (!m) throw new SiteComparisonError('forbidden', 'You do not have access to this workspace.', 403)
    if (!COMPARE_ROLES.includes(m.role)) {
      throw new SiteComparisonError('forbidden', 'Your role does not permit comparing sites.', 403)
    }

    const to = f.to ? new Date(`${f.to}T23:59:59.999Z`) : new Date()
    const from = f.from ? new Date(`${f.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * DAY)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new SiteComparisonError('validation', 'That date range is not valid.')
    }

    let projectSiteIds: string[] | null = null
    if (f.projectId) {
      const project = await this.db.project.findFirst({
        where: { id: f.projectId, companyId: f.companyId },
        select: { sites: { select: { id: true } } },
      })
      if (!project) throw new SiteComparisonError('not_found', 'Project not found in this workspace.', 404)
      projectSiteIds = project.sites.map((s) => s.id)
    }

    const siteFilter: Prisma.SiteWhereInput = {
      companyId: f.companyId,
      active: true,
      AND: [
        m.siteIds.length > 0 ? { id: { in: m.siteIds } } : {},
        projectSiteIds ? { id: { in: projectSiteIds } } : {},
      ],
    }
    const sites = await this.db.site.findMany({
      where: siteFilter, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' },
    })
    if (sites.length === 0) return { from: from.toISOString(), to: to.toISOString(), rows: [] as SiteRow[] }
    const siteIds = sites.map((s) => s.id)
    const at = { companyId: f.companyId, siteId: { in: siteIds } }

    // The register's rows for this caller: archived excluded, row scope applied.
    const incidents: Prisma.IncidentWhereInput = { ...at, archived: false, ...incidentScopeWhere(caller, f.companyId) }
    const actions: Prisma.CorrectiveActionWhereInput = { ...at, ...actionScopeWhere(caller, f.companyId) }
    const now = new Date()

    const [openInc, highRisk, inRange, lastLti, overdue, openAct, permits, visitors, today] = await Promise.all([
      this.db.incident.groupBy({ by: ['siteId'], where: { ...incidents, stage: { notIn: ['closed', 'draft'] } }, _count: true }),
      this.db.incident.groupBy({ by: ['siteId'], where: { ...incidents, stage: { notIn: ['closed', 'draft'] }, highRisk: true }, _count: true }),
      // One row per (site, type, severity) rather than one per incident: the classifiers
      // below only need those three, and a busy workspace no longer loads (or, past a
      // cap, silently truncates) every incident in the window to count them.
      this.db.incident.groupBy({
        by: ['siteId', 'type', 'severity'],
        where: { ...incidents, occurredAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.db.incident.groupBy({
        by: ['siteId'],
        where: { ...incidents, OR: [{ severity: { in: LOST_TIME_SEVERITIES } }, { type: { in: ['lti', 'fatality'] } }] },
        _max: { occurredAt: true },
      }),
      this.db.correctiveAction.groupBy({ by: ['siteId'], where: { ...actions, ...overdueActionWhere() }, _count: true }),
      this.db.correctiveAction.groupBy({ by: ['siteId'], where: { ...actions, status: { in: ['open', 'in_progress'] } }, _count: true }),
      // "Active" as the permit board means it: live and inside its window.
      this.db.permit.groupBy({ by: ['siteId'], where: { ...at, status: 'active', validTo: { gte: now } }, _count: true }),
      this.db.visitor.groupBy({ by: ['siteId'], where: { ...at, status: { in: ON_SITE_STATUSES } }, _count: true }),
      this.toolbox.today(caller, f.companyId),
    ])

    const count = (rows: { siteId: string; _count: number }[]) => new Map(rows.map((r) => [r.siteId, r._count]))
    const openBy = count(openInc)
    const riskBy = count(highRisk)
    const overdueBy = count(overdue)
    const openActBy = count(openAct)
    const permitBy = count(permits)
    const visitorBy = count(visitors)
    const ltiBy = new Map(lastLti.map((r) => [r.siteId, r._max.occurredAt]))
    const toolboxBy = new Map(today.sites.map((s) => [s.siteId, s]))
    const todayUtc = utcDay(now)

    // Per-site incident counts for the window, bucketed once instead of re-scanning the
    // whole result for every site.
    const rangeBy = new Map<string, { total: number; nearMisses: number; injuries: number }>()
    for (const g of inRange) {
      const c = rangeBy.get(g.siteId) ?? { total: 0, nearMisses: 0, injuries: 0 }
      const n = g._count._all
      c.total += n
      if (isNearMiss(g)) c.nearMisses += n
      if (isInjury(g)) c.injuries += n
      rangeBy.set(g.siteId, c)
    }

    const rows: SiteRow[] = sites.map((s) => {
      const mine = rangeBy.get(s.id) ?? { total: 0, nearMisses: 0, injuries: 0 }
      const lti = ltiBy.get(s.id) ?? null
      const tb = toolboxBy.get(s.id)
      const row: SiteRow = {
        siteId: s.id,
        siteName: s.name,
        city: s.city,
        openIncidents: openBy.get(s.id) ?? 0,
        highRiskOpen: riskBy.get(s.id) ?? 0,
        incidentsInRange: mine.total,
        nearMissesInRange: mine.nearMisses,
        injuriesInRange: mine.injuries,
        daysSinceLostTime: lti ? Math.max(0, Math.round((todayUtc - utcDay(lti)) / DAY)) : null,
        lastLostTimeAt: lti ? lti.toISOString() : null,
        overdueActions: overdueBy.get(s.id) ?? 0,
        openActions: openActBy.get(s.id) ?? 0,
        activePermits: permitBy.get(s.id) ?? 0,
        toolboxToday: tb?.held ?? false,
        toolboxHeadcount: tb?.headcount ?? 0,
        visitorsOnSite: visitorBy.get(s.id) ?? 0,
        attention: [],
      }
      if (row.highRiskOpen > 0) row.attention.push(`${row.highRiskOpen} high-risk incident${row.highRiskOpen === 1 ? '' : 's'} open`)
      if (row.overdueActions > 0) row.attention.push(`${row.overdueActions} overdue action${row.overdueActions === 1 ? '' : 's'}`)
      if (row.daysSinceLostTime !== null && row.daysSinceLostTime <= 30) row.attention.push(`lost-time injury ${row.daysSinceLostTime} day${row.daysSinceLostTime === 1 ? '' : 's'} ago`)
      if (!row.toolboxToday && row.activePermits > 0) row.attention.push('work active, no toolbox meeting today')
      return row
    })

    // Most to deal with first; ties by name so the order is stable between refreshes.
    const weight = (r: SiteRow) => r.highRiskOpen * 100 + r.overdueActions * 10 + r.attention.length
    rows.sort((a, b) => weight(b) - weight(a) || a.siteName.localeCompare(b.siteName))

    return { from: from.toISOString(), to: to.toISOString(), rows }
  }
}
