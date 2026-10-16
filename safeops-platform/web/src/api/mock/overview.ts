import { ApiError } from '../types'
import {
  SEVERITY_LABEL, STAGE_LABEL, type Actor, type Incident, type IncidentSeverity, type IncidentStatusFilter,
} from '../incidents'
import type { CapaFilters, CapaItem } from '../capa'
import type { PermitFilters, PermitView } from '../permits'
import type { AssetFilters } from '../assets'
import type {
  AttentionCounts, AttentionCountsQuery, AttentionItem, AttentionPriority, DashboardOverview,
  DashboardQuery, DashboardSection, SiteComparison, SiteComparisonQuery, SiteComparisonRow,
} from '../dashboardApi'
import { COMPANIES, SITES } from './fixtures'
import type { DemoStores } from './demo'

/**
 * Home's figures for the offline demo, counted from the demo's own records.
 *
 * On a server, Home asks GET /dashboard/overview and /dashboard/sites, which count in
 * Postgres (api/src/lib/dashboardService.ts and siteComparison.ts). The public demo has no
 * server, so it asked anyway and showed "needs the SafeChain server" in red twice, over an
 * empty Needs Attention, on the first page a prospect sees. Here the same figures are
 * counted from the incidents, actions, permits and equipment the demo keeps, by the
 * server's definitions. Where a figure links to a list, it is counted through the same
 * store filter that list uses, so the number on Home and the page behind it agree.
 *
 * The demo keeps no visitors, toolbox meetings, scheduled reports or calibration
 * certificates. Those are named in `notCounted` and left off the page, not shown as a zero
 * that would read "nobody on site" or "all certificates current".
 */

type Stores = Pick<DemoStores, 'incidents' | 'permits'>

const OVERVIEW_NOT_COUNTED: DashboardSection[] = ['visitors', 'reports', 'calibration']
const SITES_NOT_COUNTED: DashboardSection[] = ['toolbox', 'visitors']

/** The server's severity scale (SEVERITY_RANK in incidentCatalog.ts): higher is worse. */
export const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  near_miss: 0,
  Minor: 1,
  medical_treatment: 2,
  Moderate: 2,
  restricted_work: 3,
  Serious: 4,
  lost_time_injury: 5,
  environmental_major: 6,
  Critical: 6,
  fatality: 7,
  catastrophic: 8,
}

/** From here up an open incident is critical on Home (CRITICAL_RANK on the server). */
const CRITICAL_RANK = SEVERITY_RANK.Serious

/* How the server classifies an incident for the site comparison (incidentCatalog.ts). */
export const LOST_TIME_SEVERITIES: IncidentSeverity[] = ['lost_time_injury', 'fatality', 'catastrophic']
export const INJURY_SEVERITIES: IncidentSeverity[] = ['medical_treatment', 'restricted_work', 'lost_time_injury', 'fatality', 'catastrophic']
const INJURY_TYPES: string[] = ['injury', 'first_aid', 'mtc', 'rwc', 'lti', 'fatality']
const isInjury = (i: Incident) => INJURY_TYPES.includes(i.type) || INJURY_SEVERITIES.includes(i.severity)
const isNearMiss = (i: Incident) => i.severity === 'near_miss' || i.type === 'near_miss'
const isLostTime = (i: Incident) => LOST_TIME_SEVERITIES.includes(i.severity) || i.type === 'lti' || i.type === 'fatality'
const isOpen = (i: Incident) => i.stage !== 'closed' && i.stage !== 'draft'

/** The roles that may compare sites, as on the server (COMPARE_ROLES in siteComparison.ts). */
export const COMPARE_ROLES = ['admin', 'hse_manager', 'safety_officer', 'ceo']

/** The permit stages Home lists, in workflow order, as the server sends them. */
const PERMIT_STAGES = [
  'draft', 'submitted', 'supervisor_review', 'hse_review', 'area_authority',
  'approved', 'active', 'suspended', 'closed', 'rejected',
]

const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  critical: 0, overdue: 1, today: 2, soon: 3, review: 4,
}

const DAY = 86_400_000
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY)
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const within = (iso: string | undefined, from: Date, to: Date) => {
  if (!iso) return false
  const t = Date.parse(iso)
  return t >= from.getTime() && t <= to.getTime()
}
const tally = <T>(rows: T[], key: (row: T) => string) => {
  const out = new Map<string, number>()
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + 1)
  return out
}
const pad = (n: number) => String(n).padStart(2, '0')
/* The attention queue's words, as the server writes them (dashboardService.ts). */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const raised = (days: number) => (days <= 0 ? 'today' : `${plural(days, 'day')} ago`)
const AWAITING: Record<string, string> = {
  submitted: 'approval',
  supervisor_review: 'supervisor review',
  hse_review: 'HSE review',
  area_authority: 'area authority review',
}
/** "2026-10-13 15:05", in the viewer's own time. */
const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A picked date is a local day, from its first moment to its last, as on the server. */
function localDay(value: string, end: boolean): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return new Date(Number.NaN)
  return end
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3])
}

/** The date window, defaulting to the last 30 days, with the server's refusals. */
function window(q: Pick<DashboardQuery, 'from' | 'to'>) {
  const to = q.to ? localDay(q.to, true) : new Date()
  const from = q.from ? localDay(q.from, false) : new Date(to.getTime() - 30 * DAY)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ApiError('validation', 'That date range is not valid.')
  }
  if (from > to) throw new ApiError('validation', 'The start of the range is after its end.')
  return { from, to }
}

/** The demo has no projects (listProjects answers none), so one named here is not this workspace's. */
function refuseProject(projectId: string | null | undefined) {
  if (projectId) throw new ApiError('not_found', 'Project not found in this workspace.')
}

/**
 * The records in scope, each read through the store filter its page uses.
 *
 * A department reaches actions only through the incident that raised them, as on the
 * server: a standalone action has no department, so a department filter leaves it out.
 */
function inScope(stores: Stores, q: DashboardQuery, actor: Actor) {
  const siteId = q.siteId ?? undefined
  const dept = q.department || null
  return {
    incidents: (status: IncidentStatusFilter = 'all'): Incident[] => stores.incidents
      .list(q.companyId, { siteId, status })
      .filter((i) => !dept || i.department === dept),
    actions: (bucket: CapaFilters['bucket'] = 'all'): CapaItem[] => stores.incidents
      .listCapa(q.companyId, { siteId, bucket }, actor)
      .filter((a) => !dept || (a.incidentId !== null && a.department === dept)),
    permits: (status: PermitFilters['status'] = 'all'): PermitView[] => stores.permits
      .list(q.companyId, { siteId, status })
      .filter((p) => !dept || p.department === dept),
    assets: (filters: Omit<AssetFilters, 'siteId'> = {}) => stores.incidents
      .listAssets(q.companyId, { ...filters, siteId })
      .filter((a) => !dept || a.department === dept),
  }
}

/** The workspace and site a request names, refused as the server refuses them. */
function place(q: AttentionCountsQuery) {
  const company = COMPANIES.find((c) => c.id === q.companyId)
  if (!company) throw new ApiError('not_found', 'Workspace not found.')
  const site = q.siteId ? SITES.find((s) => s.id === q.siteId && s.companyId === q.companyId) : null
  if (q.siteId && !site) throw new ApiError('not_found', 'Site not found in this workspace.')
  refuseProject(q.projectId)
  return { company, site }
}

/** Open incidents of Serious and worse: Needs Attention's critical band. */
const criticalOf = (incidents: Incident[]) => incidents
  .filter(isOpen)
  .filter((i) => SEVERITY_RANK[i.severity] >= CRITICAL_RANK)

export function buildOverview(stores: Stores, q: DashboardQuery, actor: Actor): DashboardOverview {
  const { company, site } = place(q)

  const { from, to } = window(q)
  const now = new Date()
  const r = inScope(stores, q, actor)
  const siteName = (id: string) => SITES.find((s) => s.id === id)?.name ?? id

  // ── Incidents ────────────────────────────────────────────────────────────
  const incidents = r.incidents()
  const open = incidents.filter(isOpen)
  const investigating = r.incidents('investigating').length
  const awaitingReview = r.incidents('awaiting_review').length
  const inRange = incidents.filter((i) => within(i.occurredAt, from, to)).length
  const critical = criticalOf(open)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .slice(0, 10)

  // ── Actions ──────────────────────────────────────────────────────────────
  const overdue = r.actions('overdue')
  const overdueRows = [...overdue]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .slice(0, 15)
  const completedInRange = r.actions()
    .filter((a) => (a.status === 'Completed' || a.status === 'Verified') && within(a.verifiedAt ?? a.completedAt, from, to))
    .length

  // ── Permits ──────────────────────────────────────────────────────────────
  // The store already reads a permit past its window as expired, not active, as the board does.
  const permitsByStatus = tally(r.permits(), (p) => p.status)
  const active = r.permits('active').length
  const byValidTo = (a: PermitView, b: PermitView) => Date.parse(a.validTo) - Date.parse(b.validTo)
  const lapsed = r.permits('expired').sort(byValidTo)
  const expiring = r.permits('expiring').sort(byValidTo)
  const awaiting = r.permits('awaiting').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))

  // ── Equipment ────────────────────────────────────────────────────────────
  const assets = r.assets()

  // ── The attention queue, by the server's rules ───────────────────────────
  const attention: AttentionItem[] = []
  for (const i of critical) {
    const days = daysBetween(new Date(i.occurredAt), now)
    attention.push({
      id: `incident-${i.id}`,
      kind: 'incident',
      priority: 'critical',
      reference: i.number,
      title: i.title,
      owner: i.investigator ?? null,
      status: STAGE_LABEL[i.stage],
      // Open, not late; and the band keeps its order of severity rather than of age.
      overdueDays: null,
      detail: `${SEVERITY_LABEL[i.severity]} · ${days <= 0 ? 'opened today' : `open ${plural(days, 'day')}`}`,
      href: `/incidents/${i.id}`,
    })
  }
  for (const a of overdueRows) {
    attention.push({
      id: `action-${a.id}`,
      kind: 'action',
      priority: 'overdue',
      reference: a.code,
      title: a.title,
      owner: a.owner,
      status: a.status.toLowerCase(),
      overdueDays: -a.daysToDue,
      detail: `${a.priority} priority · due ${a.dueDate.slice(0, 10)}`,
      href: a.incidentId ? `/incidents/${a.incidentId}` : '/actions',
    })
  }
  for (const p of lapsed.slice(0, 10)) {
    attention.push({
      id: `permit-lapsed-${p.id}`,
      kind: 'permit',
      priority: 'overdue',
      reference: p.code,
      title: p.title,
      owner: p.applicant,
      status: 'past its window, not closed',
      overdueDays: Math.max(0, daysBetween(new Date(p.validTo), now)),
      detail: `Valid until ${stamp(p.validTo)} and never closed out`,
      href: `/permits?open=${p.id}`,
    })
  }
  for (const p of expiring.slice(0, 10)) {
    const hours = Math.round(p.hoursRemaining)
    attention.push({
      id: `permit-exp-${p.id}`,
      kind: 'permit',
      priority: hours <= 24 ? 'today' : 'soon',
      reference: p.code,
      title: p.title,
      owner: p.applicant,
      status: 'active',
      overdueDays: null,
      detail: `Expires in ${hours < 1 ? 'under an hour' : plural(hours, 'hour')}`,
      href: `/permits?open=${p.id}`,
    })
  }
  for (const p of awaiting.slice(0, 12)) {
    const waiting = daysBetween(new Date(p.createdAt), now)
    attention.push({
      id: `permit-rev-${p.id}`,
      kind: 'permit',
      priority: 'review',
      reference: p.code,
      title: p.title,
      owner: p.applicant,
      status: p.status,
      overdueDays: null,
      detail: `Awaiting ${AWAITING[p.status] ?? p.status} · raised ${raised(waiting)}`,
      href: `/permits?open=${p.id}`,
    })
  }
  attention.sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (b.overdueDays ?? -1) - (a.overdueDays ?? -1))

  return {
    generatedAt: now.toISOString(),
    scope: {
      companyName: company.name,
      siteName: site?.name ?? null,
      projectName: null,
      from: from.toISOString(),
      to: to.toISOString(),
      department: q.department ?? null,
      notes: {
        actionsFilteredByIncidentDepartment: Boolean(q.department),
        reportsAreCompanyWide: true,
      },
    },
    kpis: {
      activePermits: active,
      permitsAwaitingReview: awaiting.length,
      overdueActions: overdue.length,
      openInvestigations: investigating,
      expiringEquipment: 0,
      equipmentOutOfService: assets.filter((a) => a.status === 'Out of Service' || a.status === 'Under Maintenance').length,
      visitorsOnSite: 0,
      incidentsInRange: inRange,
    },
    attention: attention.slice(0, 40),
    attentionTotal: attention.length,
    incidents: {
      open: open.length,
      investigating,
      awaitingReview,
      inRange,
      bySeverity: [...tally(open, (i) => i.severity)]
        .map(([severity, count]) => ({
          severity,
          label: SEVERITY_LABEL[severity as IncidentSeverity] ?? severity,
          rank: SEVERITY_RANK[severity as IncidentSeverity] ?? 0,
          count,
        }))
        .sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label)),
      recent: [...incidents]
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id.localeCompare(a.id))
        .slice(0, 6)
        .map((i) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          severity: i.severity,
          severityLabel: SEVERITY_LABEL[i.severity] ?? i.severity,
          rank: SEVERITY_RANK[i.severity] ?? 0,
          stage: i.stage,
          highRisk: i.highRisk,
          site: siteName(i.siteId),
          occurredAt: i.occurredAt,
        })),
    },
    permits: {
      byStage: PERMIT_STAGES.map((stage) => ({
        stage,
        label: stage.replace(/_/g, ' '),
        count: permitsByStatus.get(stage) ?? 0,
      })),
      active,
      expiredOpen: lapsed.length,
      awaitingReview: awaiting.length,
      expiringSoon: expiring.length,
      rejected: permitsByStatus.get('rejected') ?? 0,
    },
    equipment: {
      inService: assets.filter((a) => a.status === 'In Service').length,
      outOfService: assets.filter((a) => a.status === 'Out of Service' || a.status === 'Under Maintenance').length,
      inspectionOverdue: r.assets({ bucket: 'overdue' }).length,
      calibrationOverdue: 0,
      calibrationMissing: 0,
      calibrationDueSoon: 0,
    },
    actions: {
      overdue: overdue.length,
      dueToday: r.actions('due_today').length,
      dueThisWeek: r.actions('due_week').length,
      completedInRange,
      byOwner: [...tally(overdue, (a) => a.owner)]
        .map(([owner, n]) => ({ owner, overdue: n }))
        .sort((a, b) => b.overdue - a.overdue || a.owner.localeCompare(b.owner))
        .slice(0, 6),
    },
    visitors: { onSite: 0, expectedToday: 0, overdueCheckout: 0, current: [] },
    departments: [...new Set([
      ...stores.incidents.list(q.companyId, {}).map((i) => i.department),
      ...stores.permits.list(q.companyId).map((p) => p.department),
    ])].filter(Boolean).sort(),
    reports: { recent: [], failed: 0, nextScheduled: null },
    notCounted: OVERVIEW_NOT_COUNTED,
  }
}

/**
 * The menu's counts in the demo: how many items Needs Attention holds for each module, by
 * the rules buildOverview lists them with, uncapped as on the server. The demo keeps no
 * calibration certificates, visitors or report runs, so those count nothing.
 */
export function countAttention(stores: Stores, q: AttentionCountsQuery, actor: Actor): AttentionCounts {
  place(q)
  const r = inScope(stores, q, actor)
  return {
    incident: criticalOf(r.incidents()).length,
    action: r.actions('overdue').length,
    permit: r.permits('expired').length + r.permits('expiring').length + r.permits('awaiting').length,
    equipment: 0,
    visitor: 0,
    report: 0,
  }
}

/** Every site side by side, as GET /dashboard/sites answers it. */
export function compareSites(stores: Stores, q: SiteComparisonQuery, actor: Actor): SiteComparison {
  if (!COMPARE_ROLES.includes(actor.role)) {
    throw new ApiError('forbidden', 'Your role does not permit comparing sites.')
  }
  const { from, to } = window(q)
  refuseProject(q.projectId)

  const sites = SITES
    .filter((s) => s.companyId === q.companyId && (!actor.siteIds?.length || actor.siteIds.includes(s.id)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const incidents = stores.incidents.list(q.companyId, {})
  const actions = stores.incidents.listCapa(q.companyId, {}, actor)
  const permits = stores.permits.list(q.companyId, { status: 'active' })
  const today = midnight(new Date())

  const rows: SiteComparisonRow[] = sites.map((s) => {
    const here = incidents.filter((i) => i.siteId === s.id)
    const open = here.filter(isOpen)
    const inRange = here.filter((i) => within(i.occurredAt, from, to))
    const lastLostTime = here
      .filter(isLostTime)
      .map((i) => i.occurredAt)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
    const theirs = actions.filter((a) => a.siteId === s.id)
    const row: SiteComparisonRow = {
      siteId: s.id,
      siteName: s.name,
      city: s.city,
      openIncidents: open.length,
      highRiskOpen: open.filter((i) => i.highRisk).length,
      incidentsInRange: inRange.length,
      nearMissesInRange: inRange.filter(isNearMiss).length,
      injuriesInRange: inRange.filter(isInjury).length,
      daysSinceLostTime: lastLostTime ? Math.max(0, daysBetween(midnight(new Date(lastLostTime)), today)) : null,
      lastLostTimeAt: lastLostTime ? new Date(lastLostTime).toISOString() : null,
      overdueActions: theirs.filter((a) => a.overdue).length,
      openActions: theirs.filter((a) => a.status === 'Open' || a.status === 'In Progress').length,
      activePermits: permits.filter((p) => p.siteId === s.id).length,
      toolboxToday: false,
      toolboxHeadcount: 0,
      visitorsOnSite: 0,
      attention: [],
    }
    if (row.highRiskOpen > 0) row.attention.push(`${row.highRiskOpen} high-risk incident${row.highRiskOpen === 1 ? '' : 's'} open`)
    if (row.overdueActions > 0) row.attention.push(`${row.overdueActions} overdue action${row.overdueActions === 1 ? '' : 's'}`)
    if (row.daysSinceLostTime !== null && row.daysSinceLostTime <= 30) row.attention.push(`lost-time injury ${row.daysSinceLostTime} day${row.daysSinceLostTime === 1 ? '' : 's'} ago`)
    // The server also flags work under permit with no toolbox meeting today. The demo keeps
    // no toolbox meetings, so it would flag every site with live work; it says nothing instead.
    return row
  })

  const weight = (r: SiteComparisonRow) => r.highRiskOpen * 100 + r.overdueActions * 10 + r.attention.length
  rows.sort((a, b) => weight(b) - weight(a) || a.siteName.localeCompare(b.siteName))

  return { from: from.toISOString(), to: to.toISOString(), rows, notCounted: SITES_NOT_COUNTED }
}
