import { request, qs } from './http'

/**
 * The operational dashboard.
 *
 * One request for the whole page. Every number here is counted server-side from the same
 * predicates the owning modules use, so a headline and the page one click behind it cannot
 * disagree. Nothing is estimated: a figure that cannot be derived is absent, not guessed.
 */

export type AttentionPriority = 'critical' | 'overdue' | 'today' | 'soon' | 'review'
export type AttentionKind = 'incident' | 'action' | 'permit' | 'equipment' | 'visitor' | 'report'

export interface AttentionItem {
  id: string
  kind: AttentionKind
  priority: AttentionPriority
  reference: string
  title: string
  owner: string | null
  status: string
  overdueDays: number | null
  detail: string
  href: string
}

export interface DashboardKpis {
  activePermits: number
  permitsAwaitingReview: number
  overdueActions: number
  openInvestigations: number
  expiringEquipment: number
  equipmentOutOfService: number
  visitorsOnSite: number
  incidentsInRange: number
}

export interface DashboardOverview {
  generatedAt: string
  scope: {
    companyName: string
    siteName: string | null
    /** The project this view is narrowed to, or null for the whole company. */
    projectName: string | null
    from: string
    to: string
    department: string | null
    notes: {
      /** Actions have no department column; they were matched through their incident. */
      actionsFilteredByIncidentDepartment: boolean
      /** Report runs carry no site, so the site filter does not reach them. */
      reportsAreCompanyWide: boolean
    }
  }
  kpis: DashboardKpis
  attention: AttentionItem[]
  attentionTotal: number
  incidents: {
    open: number
    investigating: number
    awaitingReview: number
    inRange: number
    bySeverity: { severity: string; label: string; rank: number; count: number }[]
    recent: {
      id: string
      number: string
      title: string
      severity: string
      severityLabel: string
      rank: number
      stage: string
      highRisk: boolean
      site: string
      occurredAt: string
    }[]
  }
  permits: {
    byStage: { stage: string; label: string; count: number }[]
    active: number
    /** Past their validity window and never closed out. */
    expiredOpen: number
    awaitingReview: number
    expiringSoon: number
    rejected: number
  }
  equipment: {
    inService: number
    outOfService: number
    inspectionOverdue: number
    calibrationOverdue: number
    calibrationMissing: number
    calibrationDueSoon: number
  }
  actions: {
    overdue: number
    dueToday: number
    dueThisWeek: number
    completedInRange: number
    byOwner: { owner: string; overdue: number }[]
  }
  visitors: {
    onSite: number
    expectedToday: number
    overdueCheckout: number
    current: {
      id: string
      name: string
      company: string
      host: string | null
      expectedDeparture: string
      overdueMinutes: number | null
    }[]
  }
  /** Department values present in this workspace - what the filter can be set to. */
  departments: string[]
  reports: {
    recent: {
      id: string
      type: string
      startedAt: string
      status: string
      deliveryStatus: string
      recipientCount: number
      failureReason: string | null
    }[]
    failed: number
    nextScheduled: { name: string; at: string } | null
  }
  /**
   * Parts of the page this answer could not count, which Home then leaves out.
   *
   * Only the offline demo sets it: it keeps no visitor register, scheduled reports or
   * calibration certificates. Their figures are zero here, and shown, a zero would say
   * "nobody on site" or "all certificates current" about records that do not exist.
   */
  notCounted?: DashboardSection[]
}

/** A part of Home that rests on records a build may not keep. See `notCounted`. */
export type DashboardSection = 'visitors' | 'reports' | 'calibration' | 'toolbox'

export interface DashboardQuery {
  companyId: string
  /** Narrows to one project's sites. The server resolves it; the client never sends a list. */
  projectId?: string | null
  siteId?: string | null
  department?: string | null
  from?: string | null
  to?: string | null
}

/** One site's row in the side-by-side comparison. */
export interface SiteComparisonRow {
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
  attention: string[]
}

export type SiteComparisonQuery = Pick<DashboardQuery, 'companyId' | 'projectId' | 'from' | 'to'>

/** How many items Needs Attention holds for each module: the counts beside the menu. */
export type AttentionCounts = Record<AttentionKind, number>

/** The menu counts the same scope as Home - company, project, site - without Home's own filters. */
export type AttentionCountsQuery = Pick<DashboardQuery, 'companyId' | 'projectId' | 'siteId'>

export interface SiteComparison {
  from: string
  to: string
  rows: SiteComparisonRow[]
  /** Columns this answer could not count; the table leaves them out. As on the overview. */
  notCounted?: DashboardSection[]
}

export const dashboardApi = {
  attentionCounts(q: AttentionCountsQuery): Promise<AttentionCounts> {
    return request(`/dashboard/attention-counts?${qs({
      companyId: q.companyId,
      projectId: q.projectId ?? undefined,
      siteId: q.siteId ?? undefined,
    })}`)
  },

  sites(q: SiteComparisonQuery): Promise<SiteComparison> {
    return request(`/dashboard/sites?${qs({
      companyId: q.companyId,
      projectId: q.projectId ?? undefined,
      from: q.from ?? undefined,
      to: q.to ?? undefined,
    })}`)
  },

  overview(q: DashboardQuery): Promise<DashboardOverview> {
    return request(`/dashboard/overview?${qs({
      companyId: q.companyId,
      projectId: q.projectId ?? undefined,
      siteId: q.siteId ?? undefined,
      department: q.department ?? undefined,
      from: q.from ?? undefined,
      to: q.to ?? undefined,
    })}`)
  },
}
