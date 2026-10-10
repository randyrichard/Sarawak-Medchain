import type { PrismaClient, Prisma, IncidentSeverity } from '@prisma/client'
import { membershipOf, type Caller } from '../domain/caller.js'
import { INVESTIGATING_STAGES, AWAITING_REVIEW_STAGES } from './incidentService.js'
import { overdueActionWhere, actionScopeWhere, incidentScopeWhere } from '../domain/access.js'
import { SEVERITY_LABEL, SEVERITY_RANK } from './incidentCatalog.js'
import { assessFitness, CALIBRATED_CATEGORIES, DUE_WARN_DAYS } from './equipmentService.js'
import { ON_SITE_STATUSES, overdueBy } from './visitorService.js'
import { REVIEW_CHAIN } from './permitReview.js'
import { DomainError } from '../domain/errors.js'
import { endOfLocalDateString, startOfLocalDateString, startOfLocalDay, todayDate } from '../domain/businessDay.js'

/**
 * The morning dashboard.
 *
 * One question: what needs attention today. Everything here is counted from the same
 * predicates the owning modules use - `overdueActionWhere`, `assessFitness`, `overdueBy`,
 * `REVIEW_CHAIN`, the incident stage groupings - because a headline number that disagrees
 * with the page one click behind it destroys trust in both, and the operator then checks
 * neither.
 *
 * Nothing is estimated and nothing is illustrative. A figure that cannot be derived from
 * the database is not shown at all.
 */

export class DashboardError extends DomainError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status)
    this.name = 'DashboardError'
  }
}

/** Today's local date (APP_TIMEZONE), as a date-only value - see businessDay.ts. */
function startOfToday(): Date {
  return todayDate()
}

const DAY = 86_400_000
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY)

export interface DashboardFilters {
  companyId: string
  /**
   * Narrows to the sites in one project.
   *
   * Resolved to site ids on the server, never taken from the client as a list. A caller
   * that could name the sites itself could name somebody else's.
   */
  projectId?: string | null
  siteId?: string | null
  department?: string | null
  /** Inclusive date window on when things happened. Defaults to the last 30 days. */
  from?: string | null
  to?: string | null
}

/** How urgent an item is, independent of which module it came from. */
export type AttentionPriority = 'critical' | 'overdue' | 'today' | 'soon' | 'review'

export interface AttentionItem {
  id: string
  kind: 'incident' | 'action' | 'permit' | 'equipment' | 'visitor' | 'report'
  priority: AttentionPriority
  /** Human reference: INC-0042, PTW-0117, CA-0031. */
  reference: string
  title: string
  /** Who owns it, where one is recorded. Never guessed. */
  owner: string | null
  status: string
  /** Days late, or null when it is not late. */
  overdueDays: number | null
  detail: string
  href: string
}

/*
 * Sort order for the attention queue.
 *
 * A potential fatality outranks an expiring certificate however much older the certificate
 * is, so the band comes first and age only breaks ties inside a band. Sorting these by date
 * alone is how a critical item ends up below a week-old routine one.
 */
const PRIORITY_ORDER: Record<AttentionPriority, number> = {
  critical: 0, overdue: 1, today: 2, soon: 3, review: 4,
}

/** Above this rank an incident is a serious-injury-or-fatality class event. */
const CRITICAL_RANK = SEVERITY_RANK.Serious

export class DashboardService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, DashboardError)
  }


  /**
   * Resolve the requested window.
   *
   * The default is the last 30 days rather than the calendar month: on the 1st a
   * calendar-month dashboard is empty, which is exactly the morning it should not be.
   */
  private window(f: DashboardFilters) {
    // The picked dates are local days: "1-31 March" read as UTC ran 08:00 on the 1st to
    // 07:59 on 1 April in Malaysia, moving incidents across the edges.
    const to = f.to ? endOfLocalDateString(f.to) : new Date()
    const from = f.from ? startOfLocalDateString(f.from) : new Date(to.getTime() - 30 * DAY)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new DashboardError('validation', 'That date range is not valid.')
    }
    if (from > to) {
      throw new DashboardError('validation', 'The start of the range is after its end.')
    }
    return { from, to }
  }

  /**
   * The tenant clause every query below starts from.
   *
   * Built once and spread, so a query cannot accidentally omit it. The company id comes
   * from the verified session's membership, never from the query string alone.
   */
  /**
   * The tenant and location clause every section starts from.
   *
   * A named site wins outright - it is the narrower of the two and already inside the
   * project when both are given. Otherwise a project becomes the list of its sites.
   *
   * An empty list is passed through as an empty `in`, which matches nothing. That is the
   * truthful answer for a project with no sites yet, and the alternative - omitting the
   * clause - would silently widen a project view to the whole company, showing an HSE
   * manager other jobs' incidents under this job's heading.
   */
  private scope(f: DashboardFilters, projectSiteIds: string[] | null) {
    return {
      companyId: f.companyId,
      ...(f.siteId
        ? { siteId: f.siteId }
        : projectSiteIds
          ? { siteId: { in: projectSiteIds } }
          : {}),
    }
  }

  /**
   * The department clause, for the models that store it as text.
   *
   * Incidents, permits and assets each keep a plain `department` string. Visitors do not -
   * they point at the Department register - so they get `visitorDept` below. Same
   * department, two column shapes, and pretending otherwise makes the filter silently
   * match nothing on one of the sections.
   */
  private dept(f: DashboardFilters) {
    return f.department ? { department: f.department } : {}
  }

  /** The same filter expressed against the Department relation the visitor register uses. */
  private visitorDept(f: DashboardFilters): Prisma.VisitorWhereInput {
    return f.department ? { department: { name: f.department } } : {}
  }

  async overview(caller: Caller, f: DashboardFilters) {
    this.membership(caller, f.companyId)

    const today = startOfToday()
    const { from, to } = this.window(f)
    const dept = this.dept(f)
    const vdept = this.visitorDept(f)
    const weekEnd = new Date(today.getTime() + 7 * DAY)
    const tomorrow = new Date(today.getTime() + DAY)
    // `today`/`tomorrow` are calendar dates for date-only fields; arrivals are moments,
    // so "arriving today" is local midnight to local midnight.
    const dayStart = startOfLocalDay()
    const dayEnd = startOfLocalDateString(new Date(today.getTime() + DAY).toISOString().slice(0, 10))

    const company = await this.db.company.findUnique({
      where: { id: f.companyId },
      select: { name: true },
    })
    if (!company) throw new DashboardError('not_found', 'Workspace not found.', 404)
    const site = f.siteId
      ? await this.db.site.findFirst({
        where: { id: f.siteId, companyId: f.companyId },
        select: { name: true },
      })
      : null
    if (f.siteId && !site) {
      // A site id from another tenant must not silently widen the view to everything.
      throw new DashboardError('not_found', 'Site not found in this workspace.', 404)
    }

    /*
     * The project, resolved here rather than trusted from the caller.
     *
     * Scoped by companyId in the same query, so a project id from another tenant is
     * indistinguishable from one that does not exist - the same rule the site check above
     * follows, and the reason neither can be used to enumerate other customers.
     */
    const project = f.projectId
      ? await this.db.project.findFirst({
        where: { id: f.projectId, companyId: f.companyId },
        select: { name: true, sites: { select: { id: true } } },
      })
      : null
    if (f.projectId && !project) {
      throw new DashboardError('not_found', 'Project not found in this workspace.', 404)
    }
    const projectSiteIds = project ? project.sites.map((x) => x.id) : null
    const scope = this.scope(f, projectSiteIds)

    /*
     * Actions carry no department of their own.
     *
     * They inherit it from the incident that raised them; a standalone action from an audit
     * or an inspection has none. Rather than quietly ignore the filter on this one section,
     * a department filter restricts actions to those whose incident carries it - and the
     * response says so, so the UI can tell the operator what it did.
     */
    const actionDept: Prisma.CorrectiveActionWhereInput = f.department
      ? { incident: { department: f.department } }
      : {}

    /*
     * The same rows the incident register would show this caller.
     *
     * Two things the register does that a summary must not skip: archived incidents are
     * excluded, and an employee sees only what they reported. Counting without either
     * produces a dashboard that both overstates the backlog and shows people rows the
     * module one click away would refuse them.
     */
    const incidentWhere: Prisma.IncidentWhereInput = {
      ...scope, ...dept,
      archived: false,
      ...incidentScopeWhere(caller, f.companyId),
    }
    const openIncidents: Prisma.IncidentWhereInput = {
      ...incidentWhere,
      stage: { notIn: ['closed', 'draft'] },
    }

    /* Actions are scoped by owner for the roles that only own their own work. */
    const actionScope: Prisma.CorrectiveActionWhereInput = {
      ...scope, ...actionDept, ...actionScopeWhere(caller, f.companyId),
    }

    /*
     * "Active" means active now, exactly as the permit board means it.
     *
     * A permit whose window has closed but which nobody has signed off is not live work -
     * it is a permit somebody forgot to close, which is a different problem and appears in
     * the attention queue as one. Counting those as active would tell an HSE manager that
     * eight jobs are running when none are.
     */
    const liveNow = new Date()

    /* The equipment register limits a supervisor or officer to their own sites. */
    const membership = this.membership(caller, f.companyId)
    const assetScope: Prisma.AssetWhereInput =
      !f.siteId && membership.siteIds.length > 0
        && ['safety_officer', 'supervisor', 'employee'].includes(membership.role)
        ? { siteId: { in: membership.siteIds } }
        : {}

    const [
      incidentStages, incidentSeverity, incidentsInRange, recentIncidents,
      criticalOpen, investigating, awaitingReview,
      actionsOverdue, actionsDueToday, actionsDueWeek, actionsCompleted,
      overdueActionRows, overdueByOwner,
      permitStatuses, permitsExpiredOpen, permitsActiveNow, permitsExpiring, permitsAwaiting,
      assetsInService, assetsOutOfService, inspectionOverdue, calibrationCandidates,
      visitorsOnSite, visitorsExpectedToday, visitorRows,
      recentRuns, incidentDepts, permitDepts, nextSchedule,
      permitsExpiredOpenCount, permitsExpiringCount,
    ] = await Promise.all([
      // ── Incidents ──────────────────────────────────────────────────────────
      this.db.incident.groupBy({ by: ['stage'], where: incidentWhere, _count: true }),
      this.db.incident.groupBy({
        by: ['severity'], where: openIncidents, _count: true,
      }),
      this.db.incident.count({
        where: { ...incidentWhere, occurredAt: { gte: from, lte: to } },
      }),
      this.db.incident.findMany({
        where: incidentWhere,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: {
          id: true, number: true, title: true, severity: true, severityRank: true,
          stage: true, occurredAt: true, highRisk: true, site: { select: { name: true } },
        },
      }),
      // Rank, not the enum's declaration order: appended values sort by storage order,
      // which would put a near miss above a fatality.
      this.db.incident.findMany({
        where: { ...openIncidents, severityRank: { gte: CRITICAL_RANK } },
        orderBy: [{ severityRank: 'desc' }, { occurredAt: 'asc' }],
        take: 10,
        select: {
          id: true, number: true, title: true, severity: true, stage: true,
          occurredAt: true, investigator: true,
        },
      }),
      this.db.incident.count({
        where: { ...incidentWhere, stage: { in: INVESTIGATING_STAGES as never } },
      }),
      this.db.incident.count({
        where: { ...incidentWhere, stage: { in: AWAITING_REVIEW_STAGES as never } },
      }),

      // ── Actions (CAPA) ─────────────────────────────────────────────────────
      this.db.correctiveAction.count({
        where: { ...actionScope, ...overdueActionWhere() },
      }),
      this.db.correctiveAction.count({
        where: {
          ...actionScope, status: { in: ['open', 'in_progress'] },
          dueDate: { gte: today, lt: tomorrow },
        },
      }),
      this.db.correctiveAction.count({
        where: {
          ...actionScope, status: { in: ['open', 'in_progress'] },
          dueDate: { gte: tomorrow, lte: weekEnd },
        },
      }),
      this.db.correctiveAction.count({
        where: {
          ...actionScope, status: { in: ['completed', 'verified'] },
          updatedAt: { gte: from, lte: to },
        },
      }),
      this.db.correctiveAction.findMany({
        where: { ...actionScope, ...overdueActionWhere() },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        take: 15,
        select: {
          id: true, code: true, title: true, owner: true, dueDate: true,
          priority: true, status: true, incidentId: true,
        },
      }),
      this.db.correctiveAction.groupBy({
        by: ['owner'],
        where: { ...actionScope, ...overdueActionWhere() },
        _count: true,
        orderBy: { _count: { owner: 'desc' } },
        take: 6,
      }),

      // ── Permits ────────────────────────────────────────────────────────────
      this.db.permit.groupBy({
        by: ['status'],
        where: { ...scope, ...dept, status: { not: 'archived' } },
        _count: true,
      }),
      /* Past their window and still open: nobody signed them off. */
      this.db.permit.findMany({
        where: {
          ...scope, ...dept,
          status: { in: ['active', 'approved'] }, validTo: { lt: liveNow },
        },
        orderBy: { validTo: 'asc' },
        take: 10,
        select: { id: true, code: true, title: true, applicant: true, validTo: true },
      }),
      this.db.permit.count({
        where: { ...scope, ...dept, status: 'active', validTo: { gte: liveNow } },
      }),
      this.db.permit.findMany({
        where: { ...scope, ...dept, status: 'active', validTo: { gte: liveNow, lte: weekEnd } },
        orderBy: { validTo: 'asc' },
        take: 10,
        select: {
          id: true, code: true, title: true, applicant: true, validTo: true, status: true,
        },
      }),
      this.db.permit.findMany({
        where: { ...scope, ...dept, status: { in: [...REVIEW_CHAIN, 'submitted'] } },
        orderBy: { createdAt: 'asc' },
        take: 12,
        select: {
          id: true, code: true, title: true, applicant: true, status: true,
          createdAt: true, validFrom: true,
        },
      }),

      // ── Equipment ──────────────────────────────────────────────────────────
      this.db.asset.count({ where: { ...scope, ...dept, ...assetScope, status: 'in_service' } }),
      this.db.asset.count({
        where: {
          ...scope, ...dept, ...assetScope,
          status: { in: ['out_of_service', 'under_maintenance'] },
        },
      }),
      this.db.asset.count({
        where: {
          ...scope, ...dept, ...assetScope,
          status: { in: ['in_service', 'under_maintenance'] },
          nextDueDate: { lt: today },
        },
      }),
      /*
       * Only the items whose calibration can lapse.
       *
       * Loading the whole register to ask each row about its certificate is the query that
       * makes this page slow as a customer grows. Prisma resolves the nested take:1 as one
       * extra statement rather than one per asset, so this stays two queries whatever the
       * count. The verdict itself comes from assessFitness - the same function the permit
       * gate uses, so the register, the gate and this card cannot disagree.
       */
      this.db.asset.findMany({
        where: {
          ...scope, ...dept, ...assetScope,
          status: { in: ['in_service', 'under_maintenance'] },
          OR: [{ requiresCalibration: true }, { category: { in: CALIBRATED_CATEGORIES } }],
        },
        select: {
          id: true, code: true, name: true, status: true, nextDueDate: true,
          requiresCalibration: true, category: true,
          calibrations: {
            orderBy: { expiresAt: 'desc' }, take: 1,
            select: { expiresAt: true, certificateNumber: true, result: true },
          },
        },
        take: 500,
      }),

      // ── Visitors ───────────────────────────────────────────────────────────
      this.db.visitor.count({
        where: { ...scope, ...vdept, status: { in: ON_SITE_STATUSES } },
      }),
      this.db.visitor.count({
        where: {
          ...scope, ...vdept,
          status: { in: ['pre_registered', 'waiting'] },
          expectedArrival: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.db.visitor.findMany({
        where: { ...scope, ...vdept, status: { in: ON_SITE_STATUSES } },
        orderBy: { expectedDeparture: 'asc' },
        take: 25,
        select: {
          id: true, name: true, visitorCompany: true, hostNameAtBooking: true, status: true,
          expectedDeparture: true, checkedInAt: true, badgeNumber: true,
          hostEmployee: { select: { name: true } },
        },
      }),

      // ── Report delivery ────────────────────────────────────────────────────
      // Reports are a company-wide artefact: ReportRun carries no site, so the site filter
      // deliberately does not apply here and the UI labels the section accordingly.
      this.db.reportRun.findMany({
        where: { companyId: f.companyId },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: {
          id: true, reportType: true, startedAt: true, status: true,
          deliveryStatus: true, failureReason: true, recipientCount: true,
        },
      }),
      /*
       * The department list the filter can actually match.
       *
       * Taken from the values present on the records rather than from the Department
       * register: incidents and permits store free text, so a register entry nobody has
       * used would offer the operator a filter that returns nothing.
       */
      this.db.incident.findMany({
        where: { companyId: f.companyId, department: { not: '' } },
        select: { department: true }, distinct: ['department'], take: 100,
      }),
      this.db.permit.findMany({
        where: { companyId: f.companyId, department: { not: '' } },
        select: { department: true }, distinct: ['department'], take: 100,
      }),
      this.db.reportSchedule.findFirst({
        where: { companyId: f.companyId, enabled: true, nextRunAt: { not: null } },
        orderBy: { nextRunAt: 'asc' },
        select: { id: true, name: true, nextRunAt: true },
      }),
      /*
       * The lapsed and expiring permits, counted. The two lists above are capped at ten
       * for the attention queue, and their lengths were the figures on Home - so a site
       * with fifteen lapsed permits read "10".
       */
      this.db.permit.count({
        where: { ...scope, ...dept, status: { in: ['active', 'approved'] }, validTo: { lt: liveNow } },
      }),
      this.db.permit.count({
        where: { ...scope, ...dept, status: 'active', validTo: { gte: liveNow, lte: weekEnd } },
      }),
    ])

    // ── Derive equipment fitness from the shared verdict ─────────────────────
    const unfit = calibrationCandidates
      .map((a) => ({ asset: a, fitness: assessFitness(a) }))
      .filter((x) => !x.fitness.fit || (x.fitness.daysToCalibration ?? 99) <= DUE_WARN_DAYS)

    const calibrationOverdue = unfit.filter((x) => x.fitness.code === 'calibration_expired').length
    const calibrationMissing = unfit.filter((x) => x.fitness.code === 'calibration_missing').length
    const calibrationDueSoon = unfit.filter(
      (x) => x.fitness.fit && (x.fitness.daysToCalibration ?? 99) <= DUE_WARN_DAYS,
    ).length

    // ── Counts by name, from the grouped rows ────────────────────────────────
    const permitCount = (s: string) => permitStatuses.find((r) => r.status === s)?._count ?? 0
    const openIncidentTotal = incidentStages
      .filter((r) => r.stage !== 'closed' && r.stage !== 'draft')
      .reduce((n, r) => n + r._count, 0)
    const awaitingPermitReview = [...REVIEW_CHAIN, 'submitted']
      .reduce((n, s) => n + permitCount(s), 0)

    const overdueVisitors = visitorRows
      .map((v) => ({ v, late: overdueBy(v) }))
      .filter((x) => x.late !== null && x.late > 0)

    const failedRuns = recentRuns.filter((r) => r.deliveryStatus === 'failed')

    // ── The attention queue ──────────────────────────────────────────────────
    const attention: AttentionItem[] = []

    for (const i of criticalOpen) {
      attention.push({
        id: `incident-${i.id}`,
        kind: 'incident',
        priority: 'critical',
        reference: i.number,
        title: i.title,
        owner: i.investigator ?? null,
        status: i.stage.replace(/_/g, ' '),
        overdueDays: daysBetween(i.occurredAt, new Date()),
        detail: `${SEVERITY_LABEL[i.severity]} · open ${daysBetween(i.occurredAt, new Date())} days`,
        href: `/incidents/${i.id}`,
      })
    }

    for (const a of overdueActionRows) {
      attention.push({
        id: `action-${a.id}`,
        kind: 'action',
        priority: 'overdue',
        reference: a.code,
        title: a.title,
        owner: a.owner,
        status: a.status.replace(/_/g, ' '),
        overdueDays: daysBetween(a.dueDate, today),
        detail: `${a.priority} priority · due ${a.dueDate.toISOString().slice(0, 10)}`,
        href: a.incidentId ? `/incidents/${a.incidentId}` : '/actions',
      })
    }

    for (const x of overdueVisitors) {
      attention.push({
        id: `visitor-${x.v.id}`,
        kind: 'visitor',
        priority: 'overdue',
        reference: x.v.badgeNumber ?? x.v.name,
        title: `${x.v.name} has not signed out`,
        owner: x.v.hostEmployee?.name || x.v.hostNameAtBooking || null,
        status: 'on site',
        overdueDays: Math.floor(x.late! / 1440),
        detail: `Expected out ${x.v.expectedDeparture.toISOString().slice(11, 16)} · ${x.late} min overdue`,
        href: '/visitors',
      })
    }

    for (const x of unfit.filter((u) => !u.fitness.fit)) {
      attention.push({
        id: `asset-${x.asset.id}`,
        kind: 'equipment',
        priority: x.fitness.code === 'calibration_expired' ? 'overdue' : 'soon',
        reference: x.asset.code,
        title: x.asset.name,
        owner: null,
        status: x.fitness.code.replace(/_/g, ' '),
        overdueDays: x.fitness.calibrationExpiry
          ? Math.max(0, daysBetween(x.fitness.calibrationExpiry, today))
          : null,
        detail: x.fitness.reason ?? 'Not fit for use.',
        href: `/assets?open=${x.asset.id}`,
      })
    }

    for (const p of permitsExpiredOpen) {
      /*
       * A permit whose window has closed but which is still open. The work either stopped
       * without anyone signing off or is continuing without cover; both need a person.
       */
      attention.push({
        id: `permit-lapsed-${p.id}`,
        kind: 'permit',
        priority: 'overdue',
        reference: p.code,
        title: p.title,
        owner: p.applicant,
        status: 'past its window, not closed',
        overdueDays: Math.max(0, daysBetween(p.validTo, new Date())),
        detail: `Valid until ${p.validTo.toISOString().slice(0, 16).replace('T', ' ')} and never closed out`,
        href: `/permits?open=${p.id}`,
      })
    }

    for (const p of permitsExpiring) {
      const hours = Math.round((p.validTo.getTime() - Date.now()) / 3_600_000)
      attention.push({
        id: `permit-exp-${p.id}`,
        kind: 'permit',
        priority: hours <= 24 ? 'today' : 'soon',
        reference: p.code,
        title: p.title,
        owner: p.applicant,
        status: 'active',
        overdueDays: null,
        detail: `Expires in ${hours < 1 ? 'under an hour' : `${hours} hours`}`,
        href: `/permits?open=${p.id}`,
      })
    }

    for (const p of permitsAwaiting) {
      const waiting = daysBetween(p.createdAt, new Date())
      attention.push({
        id: `permit-rev-${p.id}`,
        kind: 'permit',
        priority: 'review',
        reference: p.code,
        title: p.title,
        owner: p.applicant,
        status: p.status.replace(/_/g, ' '),
        overdueDays: null,
        detail: `Awaiting ${p.status.replace(/_/g, ' ')} · raised ${waiting} day(s) ago`,
        href: `/permits?open=${p.id}`,
      })
    }

    for (const r of failedRuns) {
      attention.push({
        id: `report-${r.id}`,
        kind: 'report',
        priority: 'review',
        reference: 'Report',
        title: `${r.reportType.replace(/_/g, ' ')} was not delivered`,
        owner: null,
        status: 'delivery failed',
        overdueDays: null,
        detail: r.failureReason ?? 'The mail provider did not accept the message.',
        href: '/reports',
      })
    }

    attention.sort((a, b) => {
      const band = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (band !== 0) return band
      // Inside a band, the most overdue first; undated items last.
      return (b.overdueDays ?? -1) - (a.overdueDays ?? -1)
    })

    return {
      generatedAt: new Date().toISOString(),
      scope: {
        companyName: company.name,
        siteName: site?.name ?? null,
        // Named so the header can say which job is being shown rather than making the
        // reader remember what they picked two screens ago.
        projectName: project?.name ?? null,
        from: from.toISOString(),
        to: to.toISOString(),
        department: f.department ?? null,
        /* Said out loud so the UI never implies a filter reached further than it did. */
        notes: {
          actionsFilteredByIncidentDepartment: Boolean(f.department),
          reportsAreCompanyWide: true,
        },
      },

      kpis: {
        activePermits: permitsActiveNow,
        permitsAwaitingReview: awaitingPermitReview,
        overdueActions: actionsOverdue,
        openInvestigations: investigating,
        expiringEquipment: calibrationOverdue + calibrationMissing + calibrationDueSoon,
        equipmentOutOfService: assetsOutOfService,
        visitorsOnSite: visitorsOnSite,
        incidentsInRange,
      },

      attention: attention.slice(0, 40),
      attentionTotal: attention.length,

      incidents: {
        open: openIncidentTotal,
        investigating,
        awaitingReview,
        inRange: incidentsInRange,
        bySeverity: incidentSeverity
          .map((r) => ({
            severity: r.severity,
            label: SEVERITY_LABEL[r.severity as IncidentSeverity] ?? r.severity,
            rank: SEVERITY_RANK[r.severity as IncidentSeverity] ?? 0,
            count: r._count,
          }))
          // Most serious first, by rank rather than by how the enum happens to be stored.
          .sort((a, b) => b.rank - a.rank),
        recent: recentIncidents.map((i) => ({
          id: i.id,
          number: i.number,
          title: i.title,
          severity: i.severity,
          severityLabel: SEVERITY_LABEL[i.severity] ?? i.severity,
          rank: i.severityRank,
          stage: i.stage,
          highRisk: i.highRisk,
          site: i.site.name,
          occurredAt: i.occurredAt.toISOString(),
        })),
      },

      permits: {
        byStage: [
          'draft', 'submitted', 'supervisor_review', 'hse_review', 'area_authority',
          'approved', 'active', 'suspended', 'closed', 'rejected',
        ].map((s) => ({
          stage: s,
          label: s.replace(/_/g, ' '),
          /*
           * "Active" is the live count, not the status census.
           *
           * Three permits can carry status=active while all three sat past their window -
           * showing "Active 3" beside a header reading "0 active" makes the operator
           * distrust both. The lapsed ones are surfaced separately as their own problem.
           */
          count: s === 'active' ? permitsActiveNow : permitCount(s),
        })),
        active: permitsActiveNow,
        expiredOpen: permitsExpiredOpenCount,
        awaitingReview: awaitingPermitReview,
        expiringSoon: permitsExpiringCount,
        rejected: permitCount('rejected'),
      },

      equipment: {
        inService: assetsInService,
        outOfService: assetsOutOfService,
        inspectionOverdue,
        calibrationOverdue,
        calibrationMissing,
        calibrationDueSoon,
      },

      actions: {
        overdue: actionsOverdue,
        dueToday: actionsDueToday,
        dueThisWeek: actionsDueWeek,
        completedInRange: actionsCompleted,
        byOwner: overdueByOwner.map((r) => ({ owner: r.owner, overdue: r._count })),
      },

      visitors: {
        onSite: visitorsOnSite,
        expectedToday: visitorsExpectedToday,
        overdueCheckout: overdueVisitors.length,
        current: visitorRows.slice(0, 8).map((v) => ({
          id: v.id,
          name: v.name,
          company: v.visitorCompany,
          host: v.hostEmployee?.name || v.hostNameAtBooking || null,
          expectedDeparture: v.expectedDeparture.toISOString(),
          overdueMinutes: overdueBy(v),
        })),
      },

      /* What the department filter can be set to, for this workspace. */
      departments: [...new Set([
        ...incidentDepts.map((r) => r.department),
        ...permitDepts.map((r) => r.department),
      ])].filter(Boolean).sort(),

      reports: {
        recent: recentRuns.map((r) => ({
          id: r.id,
          type: r.reportType,
          startedAt: r.startedAt.toISOString(),
          status: r.status,
          deliveryStatus: r.deliveryStatus,
          recipientCount: r.recipientCount,
          failureReason: r.failureReason,
        })),
        failed: failedRuns.length,
        nextScheduled: nextSchedule
          ? { name: nextSchedule.name, at: nextSchedule.nextRunAt!.toISOString() }
          : null,
      },
    }
  }
}
