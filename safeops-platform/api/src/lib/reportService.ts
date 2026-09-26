import { Prisma, type PrismaClient, type ReportType, type Role } from '@prisma/client'
import type { Caller } from './incidentService.js'
import { overdueActionWhere } from './incidentService.js'
import { SEVERITY_LABEL, TYPE_LABEL, stageLabel } from './incidentCatalog.js'
import { renderReportPdf, readStoredReport } from './reportPdf.js'
import {
  deliverReport, mailProviderConfigured, sendDeliveryPayload,
  type DeliveryPayload, type DeliveryResult,
} from './reportDelivery.js'
import { emailConfiguration, getEmailProvider } from './email/index.js'
import {
  canResumePending, decideRetry, idempotencyKeyFor, MAX_ATTEMPTS, STALE_PENDING_MINUTES,
} from './reportRetry.js'
import {
  describeSchedule, instantForLocal, isValidTimezone, localParts, nextRunAt, parseTimeOfDay,
  type Frequency,
} from './reportSchedule.js'

/**
 * Scheduled reports.
 *
 * The point: an HSE manager learns on Monday morning what is overdue without logging in.
 * Everything here reads current data through the same predicates the screens use - a report
 * that disagrees with the board about what "overdue" means is worse than no report.
 */
export class ReportError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
    this.name = 'ReportError'
  }
}

/**
 * Who may schedule, run and read reports. A tenant-wide safety picture is not for workers.
 *
 * `ceo` was missing, and its absence contradicted the sentence above. A tenant-wide safety
 * picture is precisely what an executive is for - "where are our biggest risks, and are we
 * managing them" is the question the role exists to ask - and they were refused 403 on the
 * one screen built to answer it while still being able to read the underlying incidents.
 * Supervisors and employees remain excluded, which is what "not for workers" meant.
 */
const REPORT_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'ceo']

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  overdue_actions: 'Overdue corrective actions',
  open_investigations: 'Open investigations',
  monthly_summary: 'Monthly safety summary',
}

/**
 * Incident types that cost somebody treatment or time.
 *
 * Deliberately not called "recordable", and deliberately not turned into a rate. Both are
 * regulator-specific: OSHA recordability and DOSH's JKKP categories do not agree, and a
 * frequency rate needs hours worked, which this product does not hold. Publishing an
 * LTIFR off a headcount guess would be inventing a compliance number, so what is reported
 * is a count of what happened, under a name that claims nothing.
 */
const INJURY_TYPES = ['first_aid', 'mtc', 'rwc', 'lti', 'fatality']

/** Stages where an investigation is still owed work. Closed and archived are excluded. */
const OPEN_INVESTIGATION_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification',
] as const

/** A plain YYYY-MM-DD, which is what every table cell in a report wants. */
const fmtIsoDate = (d: Date) => d.toISOString().slice(0, 10)

const dayMs = 86_400_000
const startOfToday = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export interface ReportColumn { key: string; label: string; width: number }

/** What a built report contains, before it becomes a PDF. */
export interface ReportData {
  type: ReportType
  title: string
  companyName: string
  siteName: string | null
  /** The project this report covers, or null for the whole company. */
  projectName?: string | null
  generatedAt: Date
  periodStart: Date | null
  periodEnd: Date
  /**
   * The period, already worded, for reports that cover one.
   *
   * Built here rather than in the renderer because only this side knows the timezone the
   * period was cut on. A local September starts at 16:00 UTC on 31 August, so a renderer
   * formatting the raw instants in UTC - which is all it can do - would date September's
   * report "31 August to 29 September". Undefined on the two types that answer "what is
   * outstanding now", which cover no period at all.
   */
  periodLabel?: string
  /** The headline numbers, above the table. */
  summary: { label: string; value: string }[]
  columns: ReportColumn[]
  rows: Record<string, string>[]
  /** Said on the page when there is nothing to report, rather than an empty table. */
  emptyMessage: string
  /**
   * Further sections, for a report that is a document rather than a list.
   *
   * Optional, and absent on the two types that answer "what is outstanding now" - those
   * are one table and adding an empty array to them would change nothing but their shape.
   * A management report is several short sections instead, which is the difference between
   * something an HSE manager forwards and something they have to summarise first.
   */
  sections?: ReportSection[]
}

/**
 * One block of a multi-section report.
 *
 * Every part is optional because sections legitimately differ: some are figures, some are
 * a table, some are a sentence, and some are a statement that the data does not exist.
 * `unavailable` is the important one - a section that cannot be computed says so in its
 * own words rather than rendering a zero, because "0 safety observations" and "this
 * product does not record safety observations" are different claims and only one is true.
 */
export interface ReportSection {
  title: string
  /** A sentence or two of prose, for sections that summarise rather than tabulate. */
  note?: string
  /** Figures, laid out across the page. */
  stats?: { label: string; value: string }[]
  columns?: ReportColumn[]
  rows?: Record<string, string>[]
  /** Shown instead of figures when this deployment does not hold the data. */
  unavailable?: string
  /** Ruled empty space for somebody to write in after printing. */
  writeIn?: number
}

/**
 * Everything the monthly builder needs, resolved and tenant-checked once.
 *
 * `siteIds` is the only location filter the queries use. Null means the whole company; a
 * list means exactly those sites, including the empty list.
 */
interface BuildScope {
  companyId: string
  companyName: string
  siteId: string | null
  siteName: string | null
  projectName: string | null
  siteIds: string[] | null
  month: number | null
  year: number | null
}

/** What a build is scoped to. Every field is optional; the defaults are the common case. */
export interface ReportOptions {
  siteId?: string | null
  /** Narrows to a project's sites. Resolved here, never taken as a list from a caller. */
  projectId?: string | null
  /**
   * The month to report on, 1-12 with its year. Both or neither.
   *
   * Absent means the last complete month, which is what a schedule wants. Naming one is
   * for the person who missed a month, or who is assembling a year of them.
   */
  month?: number | null
  year?: number | null
}

export class ReportService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new ReportError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  private require(caller: Caller, companyId: string, doing: string) {
    const m = this.membership(caller, companyId)
    if (!REPORT_ROLES.includes(m.role)) {
      throw new ReportError('forbidden', `Your role does not permit ${doing}.`, 403)
    }
    return m
  }

  private async log(
    caller: Caller, companyId: string, action: string, target: string,
    ctx: { ip?: string; device?: string } = {},
  ) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId, actor: caller.name, actorRole: m?.role ?? '',
        action, module: 'reports', target,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
  }

  // ── Building the reports ───────────────────────────────────────────────────

  /**
   * Build a report from current data.
   *
   * Tenant scope is a parameter and is always checked against the caller's memberships
   * first; the scheduled path passes the schedule's own company, which was itself written
   * under a membership check.
   */
  async build(
    companyId: string, type: ReportType, opts: ReportOptions = {},
  ): Promise<ReportData> {
    const siteId = opts.siteId ?? null
    const company = await this.db.company.findUnique({
      where: { id: companyId }, select: { name: true },
    })
    if (!company) throw new ReportError('not_found', 'Workspace not found.', 404)

    const site = siteId
      ? await this.db.site.findFirst({
          where: { id: siteId, companyId }, select: { name: true },
        })
      : null
    // A site id that is not this company's is refused rather than quietly widened to the
    // whole company, which would put other sites' data in somebody's inbox.
    if (siteId && !site) throw new ReportError('validation', 'Unknown site for this workspace.')

    /*
     * The project, resolved here and scoped by companyId in the same query.
     *
     * Same rule as the site above and for the same reason: an id from another tenant must
     * be refused rather than ignored, or a report could be widened to somebody else's job
     * by guessing an id. Its sites are read here so no caller ever supplies the list.
     */
    const project = opts.projectId
      ? await this.db.project.findFirst({
          where: { id: opts.projectId, companyId },
          select: { name: true, code: true, sites: { select: { id: true } } },
        })
      : null
    if (opts.projectId && !project) {
      throw new ReportError('validation', 'Unknown project for this workspace.')
    }

    const scope: BuildScope = {
      companyId,
      companyName: company.name,
      siteId,
      siteName: site?.name ?? null,
      projectName: project?.name ?? null,
      /*
       * A named site wins: it is the narrower of the two and, when both are given, already
       * inside the project. Otherwise the project becomes its list of sites - and an empty
       * list stays empty rather than being dropped, because a project with no sites
       * reporting the whole company's incidents would be worse than reporting none.
       */
      siteIds: siteId ? [siteId] : project ? project.sites.map((x) => x.id) : null,
      month: opts.month ?? null,
      year: opts.year ?? null,
    }

    switch (type) {
      case 'overdue_actions':
        return this.buildOverdueActions(companyId, company.name, siteId, site?.name ?? null)
      case 'monthly_summary':
        return this.buildMonthlySummary(scope)
      default:
        return this.buildOpenInvestigations(companyId, company.name, siteId, site?.name ?? null)
    }
  }

  /**
   * The timezone a period should be cut on.
   *
   * A calendar month is a local idea, and cutting it in UTC would push the first eight
   * hours of every Malaysian month into the previous report - an incident at 03:00 on
   * 1 October filed under September. That is exactly the quiet misattribution a month-end
   * review exists to catch, rather than to create.
   *
   * The site's own zone when the report is scoped to one, otherwise the company's earliest
   * site, which is the closest thing to a head office the schema records. The last resort
   * is the column's own default rather than UTC: every site row has a timezone, so
   * reaching it at all means the workspace has no sites, and UTC would be a worse guess
   * than the value every row in that table already carries.
   */
  private async periodTimezone(companyId: string, siteId: string | null): Promise<string> {
    const site = await this.db.site.findFirst({
      where: siteId ? { id: siteId, companyId } : { companyId },
      orderBy: siteId ? undefined : { id: 'asc' },
      select: { timezone: true },
    })
    return site?.timezone && isValidTimezone(site.timezone) ? site.timezone : 'Asia/Kuching'
  }

  /**
   * The month a company has just had, as a document rather than a list.
   *
   * The other two report types answer "what is owed right now" and are one table. This one
   * is what an HSE manager forwards to management: a period, a set of figures, and the
   * sections underneath that explain them. The whole point of the feedback that prompted
   * it was that assembling this by hand from six screens took a morning.
   *
   * Two rules run through every section. Nothing is invented - a figure this deployment
   * does not collect says so in words rather than rendering a zero, because "0 safety
   * observations" and "this product does not record safety observations" are different
   * claims. And nothing is a rate: a frequency rate needs hours worked, which is not held
   * here, and one derived from a headcount guess is a number somebody puts in front of a
   * regulator.
   */
  private async buildMonthlySummary(scope: BuildScope): Promise<ReportData> {
    const { companyId, companyName, siteId, siteName, projectName, siteIds } = scope
    const timezone = await this.periodTimezone(companyId, siteId)
    const now = new Date()

    /*
     * The month, named or defaulted.
     *
     * A named month is validated rather than clamped: silently reporting December when
     * somebody asked for month 13 produces a document with the wrong period on its face.
     */
    let y: number
    let m: number
    if (scope.month != null && scope.year != null) {
      if (!Number.isInteger(scope.month) || scope.month < 1 || scope.month > 12) {
        throw new ReportError('validation', 'Month must be between 1 and 12.')
      }
      if (!Number.isInteger(scope.year) || scope.year < 2000 || scope.year > 2200) {
        throw new ReportError('validation', 'That year is out of range.')
      }
      y = scope.year
      m = scope.month
    } else {
      const here = localParts(now, timezone)
      ;[y, m] = here.month === 1 ? [here.year - 1, 12] : [here.year, here.month - 1]
    }

    /*
     * Midnight local on the first, to midnight local on the first of the next month. A
     * half-open range, so an incident at 23:59:59.999 on the last day is inside it and one
     * at 00:00 on the first of the next month is not - no gap between consecutive months
     * and no incident counted in two of them.
     */
    const periodStart = instantForLocal(y, m, 1, 0, 0, timezone)
    const periodEnd = instantForLocal(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1, 0, 0, timezone)
    const inPeriod = { gte: periodStart, lt: periodEnd }

    // The month before this one, for the comparison section.
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1]
    const priorStart = instantForLocal(py, pm, 1, 0, 0, timezone)
    const inPrior = { gte: priorStart, lt: periodStart }

    // Null means the whole company; a list means exactly those sites, empty included.
    const at = siteIds ? { siteId: { in: siteIds } } : {}
    const where = { companyId, ...at }

    const [
      incidents, priorIncidents, sites,
      actionsRaised, actionsClosed, actionsOpen, actionsOverdue, priorActionsClosed,
      highPriority,
      permits, inspections, audits, findings,
      toolboxMeetings,
    ] = await Promise.all([
      this.db.incident.findMany({
        where: { ...where, archived: false, occurredAt: inPeriod },
        orderBy: [{ occurredAt: 'asc' }],
        take: 2000,
      }),
      this.db.incident.findMany({
        where: { ...where, archived: false, occurredAt: inPrior },
        select: { type: true },
        take: 2000,
      }),
      this.db.site.findMany({
        where: siteIds ? { companyId, id: { in: siteIds } } : { companyId },
        select: { id: true, name: true },
      }),

      this.db.correctiveAction.count({ where: { ...where, createdAt: inPeriod } }),
      this.db.correctiveAction.count({ where: { ...where, completedAt: inPeriod } }),
      // Open *now*, not at month end - this is the backlog the reader has to act on today.
      this.db.correctiveAction.count({
        where: { ...where, status: { in: ['open', 'in_progress'] } },
      }),
      this.db.correctiveAction.count({
        where: { ...where, ...overdueActionWhere() },
      }),
      this.db.correctiveAction.count({ where: { ...where, completedAt: inPrior } }),

      this.db.correctiveAction.findMany({
        where: {
          ...where,
          status: { in: ['open', 'in_progress'] },
          priority: { in: ['Critical', 'High'] },
        },
        orderBy: [{ dueDate: 'asc' }],
        include: { incident: { select: { number: true } } },
        take: 40,
      }),

      this.db.permit.findMany({
        where: { ...where, createdAt: inPeriod },
        select: { type: true, status: true, siteId: true },
        take: 2000,
      }),
      this.db.inspection.findMany({
        where: { ...where, scheduledFor: inPeriod },
        select: { status: true, outcome: true },
        take: 2000,
      }),
      this.db.audit.findMany({
        where: { ...where, scheduledFor: inPeriod },
        select: { id: true, status: true },
        take: 500,
      }),
      this.db.auditFinding.findMany({
        where: { audit: { ...where, scheduledFor: inPeriod } },
        select: { category: true, severity: true },
        take: 2000,
      }),
      // Every site's daily briefing. A month is at most ~31 per site, so the cap is loose.
      this.db.toolboxMeeting.findMany({
        where: { ...where, heldAt: inPeriod },
        select: { headcount: true, siteId: true },
        take: 5000,
      }),
    ])

    const countOf = (...types: string[]) => incidents.filter((i) => types.includes(i.type)).length
    const priorCountOf = (...types: string[]) =>
      priorIncidents.filter((i) => types.includes(i.type)).length

    const anchor = new Date(Date.UTC(y, m - 1, 15, 12))
    const monthName = new Intl.DateTimeFormat('en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(anchor)
    const dayCount = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate()

    const lostTime = countOf('lti', 'fatality')
    const injuries = countOf(...INJURY_TYPES)
    const nearMisses = countOf('near_miss')
    const inspectionsDone = inspections.filter((i) => i.status === 'completed').length
    const auditsDone = audits.filter((a) => a.status === 'completed').length
    const permitsIssued = permits.length
    const toolboxAttendance = toolboxMeetings.reduce((n, t) => n + t.headcount, 0)

    /** A percentage, or N/A when the denominator is zero rather than a misleading 0%. */
    const rate = (part: number, whole: number) =>
      whole === 0 ? 'N/A' : `${Math.round((part / whole) * 100)}%`

    /** "12 (up 3)" - a comparison only where a previous month exists to compare with. */
    const trend = (current: number, before: number) => {
      if (priorIncidents.length === 0 && before === 0) return String(current)
      const diff = current - before
      if (diff === 0) return `${current} (unchanged)`
      return `${current} (${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)})`
    }

    const tally = (values: string[]) => {
      const counts = new Map<string, number>()
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
      return [...counts.entries()].sort((a, b) => b[1] - a[1])
    }

    const pretty = (v: string) => v.replace(/_/g, ' ')

    /*
     * The executive summary, written from the figures rather than templated around them.
     *
     * Deliberately flat in tone. A month with a lost-time injury in it should not be
     * described as good because the action completion rate was high, and a quiet month
     * should not be congratulated - this report cannot tell a genuinely quiet month from
     * one nobody filed anything in.
     */
    const scopeLine = [companyName, projectName, siteName].filter(Boolean).join(' - ')
    const executive = incidents.length === 0
      ? `No incidents were recorded for ${scopeLine} during ${monthName}. `
        + `${actionsRaised} corrective action(s) were raised and ${actionsClosed} closed. `
        + 'A period with nothing recorded may be a quiet one or one where nothing was '
        + 'reported; this summary cannot tell the two apart.'
      : `${incidents.length} incident(s) were recorded for ${scopeLine} during ${monthName}, `
        + `of which ${injuries} involved injury and ${lostTime} involved lost time. `
        + `${nearMisses} near miss(es) were reported. `
        + `${actionsRaised} corrective action(s) were raised and ${actionsClosed} closed; `
        + `${actionsOpen} remain open, ${actionsOverdue} of them past their due date.`

    const sections: ReportSection[] = [
      {
        title: '1. Executive summary',
        note: executive,
      },
      {
        title: '2. Safety performance overview',
        stats: [
          { label: 'Sites in scope', value: String(sites.length) },
          { label: 'Incidents', value: String(incidents.length) },
          { label: 'Injuries', value: String(injuries) },
          { label: 'Permits issued', value: String(permitsIssued) },
          { label: 'Inspections done', value: String(inspectionsDone) },
        ],
      },
      {
        title: '3. Incident summary',
        note: incidents.length === 0
          ? 'No incidents recorded for this period.'
          : `By type, then by severity. Statuses are as at ${fmtIsoDate(now)}, not month end.`,
        columns: [
          { key: 'k', label: 'Category', width: 120 },
          { key: 'v', label: 'Count', width: 40 },
        ],
        rows: [
          ...tally(incidents.map((i) => TYPE_LABEL[i.type] ?? pretty(i.type)))
            .map(([k, v]) => ({ k, v: String(v) })),
          ...tally(incidents.map((i) => `Severity: ${SEVERITY_LABEL[i.severity] ?? pretty(i.severity)}`))
            .map(([k, v]) => ({ k, v: String(v) })),
          ...tally(incidents.map((i) => `Stage: ${stageLabel(i.stage)}`))
            .map(([k, v]) => ({ k, v: String(v) })),
        ],
      },
      {
        title: '4. Near miss summary',
        stats: [
          { label: 'Near misses', value: String(nearMisses) },
          { label: 'Share of incidents', value: rate(nearMisses, incidents.length) },
          { label: 'Previous month', value: String(priorCountOf('near_miss')) },
        ],
        /*
         * Said explicitly, because the obvious reading of a low number is the wrong one.
         * Near misses are the one count where more is better.
         */
        note: 'A near miss is a reported warning rather than a loss. A month with few of '
          + 'them is not necessarily a safer month than one with many.',
      },
      {
        title: '5. Safety inspection summary',
        stats: [
          { label: 'Inspections done', value: String(inspectionsDone) },
          { label: 'Scheduled', value: String(inspections.length) },
          { label: 'Audits completed', value: String(auditsDone) },
          { label: 'Findings raised', value: String(findings.length) },
        ],
        ...(findings.length > 0 ? {
          columns: [
            { key: 'k', label: 'Finding category', width: 120 },
            { key: 'v', label: 'Count', width: 40 },
          ],
          rows: tally(findings.map((f) => f.category || 'Uncategorised'))
            .map(([k, v]) => ({ k, v: String(v) })),
        } : {}),
      },
      {
        title: '6. Corrective action summary',
        stats: [
          { label: 'Raised', value: String(actionsRaised) },
          { label: 'Closed', value: String(actionsClosed) },
          { label: 'Open now', value: String(actionsOpen) },
          { label: 'Overdue', value: String(actionsOverdue) },
          { label: 'Closed vs raised', value: rate(actionsClosed, actionsRaised) },
        ],
        /*
         * Named as what it is. "Completion rate" implies the closures belong to the same
         * actions as the raises, which is not true of any real month - some closures are
         * of work raised long before it.
         */
        note: 'Closed vs raised compares two counts within the month; the actions closed '
          + 'are not necessarily the ones raised.',
      },
      {
        title: '7. Permit to work summary',
        stats: [
          { label: 'Permits issued', value: String(permitsIssued) },
          { label: 'Closed', value: String(permits.filter((p) => p.status === 'closed').length) },
          { label: 'Still active', value: String(permits.filter((p) => p.status === 'active').length) },
        ],
        ...(permits.length > 0 ? {
          columns: [
            { key: 'k', label: 'Permit type', width: 120 },
            { key: 'v', label: 'Count', width: 40 },
          ],
          rows: tally(permits.map((p) => pretty(p.type))).map(([k, v]) => ({ k, v: String(v) })),
        } : {}),
      },
      {
        title: '8. Toolbox meetings',
        note: toolboxMeetings.length === 0
          ? 'No daily toolbox meetings were recorded for this period.'
          : `The daily site briefings recorded in SafeOps. Held on ${new Set(toolboxMeetings.map((t) => t.siteId)).size} `
            + `of ${sites.length} site(s) in scope.`,
        stats: [
          { label: 'Meetings held', value: String(toolboxMeetings.length) },
          { label: 'Total attendance', value: toolboxAttendance.toLocaleString('en-MY') },
          {
            label: 'Average attendance',
            value: toolboxMeetings.length === 0 ? 'N/A' : String(Math.round(toolboxAttendance / toolboxMeetings.length)),
          },
        ],
      },
      {
        title: '9. Safety observations',
        /*
         * The honest answer, and the reason this section exists at all rather than being
         * dropped: a management report with a numbered section missing invites the question
         * "where is 9", and a fabricated zero is worse than either.
         *
         * SafeOps has no proactive observation module - no behavioural observation cards,
         * no safe/unsafe act logging. What it does have is audit findings graded
         * Observation, which is a different thing recorded by a different person for a
         * different reason, so it is reported under its own name.
         */
        unavailable: 'SafeOps does not currently record proactive safety observations '
          + '(behavioural observation cards or safe/unsafe act logs), so no figure can be '
          + 'given. The nearest recorded equivalent is audit findings graded Observation, '
          + `of which there were ${findings.filter((f) => f.severity === 'Observation').length} `
          + 'this period.',
      },
      {
        title: '10. Trends against the previous month',
        ...(priorIncidents.length === 0 && actionsRaised === 0 && priorActionsClosed === 0
          ? {
            unavailable: 'No data was recorded in the previous month, so there is nothing '
              + 'to compare against. Trends appear once two consecutive months exist.',
          }
          : {
            columns: [
              { key: 'k', label: 'Measure', width: 120 },
              { key: 'v', label: 'This month', width: 60 },
              { key: 'p', label: 'Previous', width: 40 },
            ],
            rows: [
              { k: 'Incidents', v: trend(incidents.length, priorIncidents.length), p: String(priorIncidents.length) },
              { k: 'Injuries', v: trend(injuries, priorIncidents.filter((i) => INJURY_TYPES.includes(i.type)).length), p: String(priorIncidents.filter((i) => INJURY_TYPES.includes(i.type)).length) },
              { k: 'Lost time', v: trend(lostTime, priorCountOf('lti', 'fatality')), p: String(priorCountOf('lti', 'fatality')) },
              { k: 'Near misses', v: trend(nearMisses, priorCountOf('near_miss')), p: String(priorCountOf('near_miss')) },
              { k: 'Actions closed', v: trend(actionsClosed, priorActionsClosed), p: String(priorActionsClosed) },
            ],
          }),
      },
      {
        title: '11. Outstanding high priority actions',
        note: highPriority.length === 0
          ? 'No high or critical corrective actions are open.'
          : 'Open actions graded High or Critical, oldest due date first.',
        ...(highPriority.length > 0 ? {
          columns: [
            { key: 'code', label: 'Action', width: 50 },
            { key: 'title', label: 'What is outstanding', width: 150 },
            { key: 'owner', label: 'Owner', width: 70 },
            { key: 'due', label: 'Due', width: 46 },
            { key: 'priority', label: 'Priority', width: 40 },
            { key: 'incident', label: 'Incident', width: 50 },
          ],
          rows: highPriority.map((a) => ({
            code: a.code,
            title: a.title,
            owner: a.owner,
            due: fmtIsoDate(a.dueDate),
            priority: a.priority,
            incident: a.incident?.number ?? '-',
          })),
        } : {}),
      },
      {
        title: '12. Site performance',
        ...(sites.length === 0
          ? { unavailable: 'No sites are in scope for this report.' }
          : {
            columns: [
              { key: 'site', label: 'Site', width: 110 },
              { key: 'incidents', label: 'Incidents', width: 46 },
              { key: 'injuries', label: 'Injuries', width: 42 },
              { key: 'near', label: 'Near miss', width: 46 },
              { key: 'permits', label: 'Permits', width: 42 },
            ],
            rows: sites.map((site) => {
              const mine = incidents.filter((i) => i.siteId === site.id)
              return {
                site: site.name,
                incidents: String(mine.length),
                injuries: String(mine.filter((i) => INJURY_TYPES.includes(i.type)).length),
                near: String(mine.filter((i) => i.type === 'near_miss').length),
                permits: String(permits.filter((p) => p.siteId === site.id).length),
              }
            }),
          }),
      },
      {
        title: '13. Management comments / HSE remarks',
        note: 'To be completed by the HSE manager before circulation.',
        // Ruled lines rather than a blank gap, because a printed report gets written on.
        writeIn: 5,
      },
    ]

    return {
      type: 'monthly_summary',
      title: `Monthly safety report - ${monthName}`,
      companyName,
      siteName,
      generatedAt: now,
      periodStart,
      periodEnd,
      periodLabel: `1 to ${dayCount} ${monthName} (${timezone})`,
      projectName,
      /*
       * Five, because the renderer divides the page width evenly between them and a sixth
       * leaves too little room for the label above the number.
       *
       * Near misses sit beside the injuries deliberately. A month with none of them is not
       * a good month, it is a month nobody reported one - and a reader seeing the two
       * counts together is far likelier to read it that way.
       */
      summary: [
        { label: 'Incidents', value: String(incidents.length) },
        { label: 'Lost time', value: String(lostTime) },
        { label: 'Injuries', value: String(injuries) },
        { label: 'Near misses', value: String(nearMisses) },
        { label: 'Actions closed', value: `${actionsClosed} of ${actionsRaised}` },
      ],
      columns: [
        { key: 'number', label: 'Incident', width: 56 },
        { key: 'occurred', label: 'Occurred', width: 54 },
        { key: 'type', label: 'Type', width: 60 },
        { key: 'severity', label: 'Severity', width: 56 },
        { key: 'title', label: 'What happened', width: 168 },
        { key: 'department', label: 'Department', width: 68 },
        { key: 'stage', label: 'Stage', width: 62 },
      ],
      rows: incidents.map((i) => ({
        number: i.number,
        occurred: fmtIsoDate(i.occurredAt),
        type: TYPE_LABEL[i.type] ?? pretty(i.type),
        severity: SEVERITY_LABEL[i.severity] ?? pretty(i.severity),
        title: i.title,
        department: i.department || '-',
        stage: stageLabel(i.stage),
      })),
      sections,
      /*
       * Neither congratulation nor alarm. A month with nothing in it is either genuinely
       * quiet or one nobody filed anything in, and this report cannot tell which - so it
       * states what it knows and leaves the reading to somebody who was there.
       */
      emptyMessage: 'No incidents were recorded for this period.',
    }
  }

  private async buildOverdueActions(
    companyId: string, companyName: string, siteId: string | null, siteName: string | null,
  ): Promise<ReportData> {
    const today = startOfToday()

    const rows = await this.db.correctiveAction.findMany({
      where: {
        companyId,
        ...(siteId ? { siteId } : {}),
        // The register's own definition, imported rather than restated.
        ...overdueActionWhere(),
      },
      orderBy: [{ dueDate: 'asc' }],
      include: {
        incident: { select: { number: true, department: true, severity: true } },
        evidence: { select: { id: true } },
      },
      take: 2000,
    })

    const daysOverdue = (due: Date) =>
      Math.max(0, Math.round((today.getTime() - Date.UTC(
        due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(),
      )) / dayMs))

    const worst = rows.reduce((a, r) => Math.max(a, daysOverdue(r.dueDate)), 0)
    const critical = rows.filter((r) => r.priority === 'Critical' || r.priority === 'High').length
    const awaitingEvidence = rows.filter((r) => r.evidenceRequired && r.evidence.length === 0).length

    return {
      type: 'overdue_actions',
      title: 'Overdue corrective actions',
      companyName,
      siteName,
      generatedAt: new Date(),
      periodStart: null,
      periodEnd: new Date(),
      summary: [
        { label: 'Overdue actions', value: String(rows.length) },
        { label: 'High or critical', value: String(critical) },
        { label: 'Longest overdue', value: worst ? `${worst} days` : '—' },
        { label: 'Awaiting evidence', value: String(awaitingEvidence) },
      ],
      columns: [
        { key: 'code', label: 'Action', width: 52 },
        { key: 'title', label: 'What is outstanding', width: 150 },
        { key: 'incident', label: 'Incident', width: 58 },
        { key: 'owner', label: 'Owner', width: 78 },
        { key: 'department', label: 'Department', width: 66 },
        { key: 'due', label: 'Due', width: 52 },
        { key: 'overdue', label: 'Days', width: 32 },
        { key: 'priority', label: 'Priority', width: 44 },
        { key: 'status', label: 'Status', width: 52 },
      ],
      rows: rows.map((r) => ({
        code: r.code,
        title: r.title,
        incident: r.incident?.number ?? '—',
        owner: r.owner,
        department: r.incident?.department || '—',
        due: r.dueDate.toISOString().slice(0, 10),
        overdue: String(daysOverdue(r.dueDate)),
        priority: r.priority,
        status: r.evidenceRequired && r.evidence.length === 0
          ? `${r.status.replace(/_/g, ' ')} · evidence due`
          : r.status.replace(/_/g, ' '),
      })),
      emptyMessage: 'No corrective actions are overdue. Nothing to chase.',
    }
  }

  private async buildOpenInvestigations(
    companyId: string, companyName: string, siteId: string | null, siteName: string | null,
  ): Promise<ReportData> {
    const now = new Date()

    const rows = await this.db.incident.findMany({
      where: {
        companyId,
        ...(siteId ? { siteId } : {}),
        // Closed and archived investigations are done. Reporting them as open is how a
        // weekly report trains people to ignore it.
        archived: false,
        stage: { in: [...OPEN_INVESTIGATION_STAGES] },
      },
      orderBy: [{ severityRank: 'desc' }, { occurredAt: 'asc' }],
      take: 2000,
    })

    const daysOpen = (d: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / dayMs))
    const outstanding = (i: (typeof rows)[number]) => {
      const missing: string[] = []
      if (!i.investigator && !i.leadInvestigator) missing.push('investigator')
      if (!i.investigationStartedAt) missing.push('start date')
      if (!i.rootCause) missing.push('root cause')
      if (!i.rcaFiveWhys) missing.push('5-why')
      return missing.length ? missing.join(', ') : '—'
    }

    const unassigned = rows.filter((i) => !i.investigator && !i.leadInvestigator).length
    const overThirty = rows.filter((i) => daysOpen(i.occurredAt) > 30).length

    return {
      type: 'open_investigations',
      title: 'Open investigations',
      companyName,
      siteName,
      generatedAt: now,
      periodStart: null,
      periodEnd: now,
      summary: [
        { label: 'Open investigations', value: String(rows.length) },
        { label: 'No investigator', value: String(unassigned) },
        { label: 'Open over 30 days', value: String(overThirty) },
        { label: 'High severity', value: String(rows.filter((i) => i.severityRank >= 5).length) },
      ],
      columns: [
        { key: 'number', label: 'Incident', width: 56 },
        { key: 'title', label: 'What happened', width: 132 },
        { key: 'type', label: 'Type', width: 66 },
        { key: 'severity', label: 'Severity', width: 66 },
        { key: 'occurred', label: 'Occurred', width: 52 },
        { key: 'days', label: 'Days', width: 30 },
        { key: 'department', label: 'Department', width: 60 },
        { key: 'investigator', label: 'Investigator', width: 68 },
        { key: 'stage', label: 'Stage', width: 56 },
      ],
      rows: rows.map((i) => ({
        number: i.number,
        title: i.title,
        type: TYPE_LABEL[i.type] ?? i.type,
        severity: SEVERITY_LABEL[i.severity] ?? i.severity,
        occurred: i.occurredAt.toISOString().slice(0, 10),
        days: String(daysOpen(i.occurredAt)),
        department: i.department || '—',
        // Anonymity is about the reporter, never the investigator, so nothing is withheld
        // here - but the flag is carried so a reader knows not to go looking for a name.
        investigator: i.leadInvestigator || i.investigator || (i.anonymous ? '— (anonymous report)' : '—'),
        stage: stageLabel(i.stage),
        outstanding: outstanding(i),
      })),
      emptyMessage: 'No investigations are open. Everything reported has been closed out.',
    }
  }

  /** Build and render, without touching any schedule. Used by preview and Run now. */
  async preview(
    caller: Caller, companyId: string, type: ReportType, opts: ReportOptions = {},
  ) {
    this.require(caller, companyId, 'running reports')
    return this.build(companyId, type, opts)
  }

  async renderPdf(
    caller: Caller, companyId: string, type: ReportType, opts: ReportOptions = {},
  ) {
    const data = await this.preview(caller, companyId, type, opts)
    return { data, pdf: await renderReportPdf(data) }
  }

  // ── Recipients ─────────────────────────────────────────────────────────────

  /**
   * The people a report may be sent to.
   *
   * Members of this company, and only this company. Checked when a schedule is written and
   * again when it runs, because somebody who left last month must not keep receiving the
   * whole safety picture by inertia.
   */
  async recipientOptions(caller: Caller, companyId: string) {
    this.require(caller, companyId, 'managing report schedules')
    const members = await this.db.membership.findMany({
      where: { companyId },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    })
    return members
      .filter((m) => m.user.status === 'active')
      .map((m) => ({
        userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Resolves ids to addresses, dropping anyone no longer in this tenant. */
  private async resolveRecipients(companyId: string, userIds: string[]) {
    if (userIds.length === 0) return []
    const members = await this.db.membership.findMany({
      where: { companyId, userId: { in: userIds } },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    })
    return members
      .filter((m) => m.user.status === 'active')
      .map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email }))
  }

  // ── Schedules ──────────────────────────────────────────────────────────────

  private validateShape(input: {
    frequency: Frequency; dayOfWeek: number; timeOfDay: string; timezone: string
  }) {
    if (!parseTimeOfDay(input.timeOfDay)) {
      throw new ReportError('validation', 'Delivery time must be a time of day like 08:00.')
    }
    if (!isValidTimezone(input.timezone)) {
      // An unrecognised zone must not silently fall back to UTC - that is an eight-hour
      // error in Sarawak, and the report would arrive on Sunday afternoon.
      throw new ReportError('validation', `${input.timezone} is not a timezone this server recognises.`)
    }
    if (input.frequency === 'weekly' && (input.dayOfWeek < 1 || input.dayOfWeek > 7)) {
      throw new ReportError('validation', 'Choose a day of the week.')
    }
  }

  async listSchedules(caller: Caller, companyId: string) {
    this.require(caller, companyId, 'viewing report schedules')
    const rows = await this.db.reportSchedule.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }],
    })
    const recipients = await this.resolveRecipients(
      companyId, [...new Set(rows.flatMap((r) => r.recipientUserIds))],
    )
    const byId = new Map(recipients.map((r) => [r.userId, r]))

    return rows.map((r) => ({
      ...r,
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
      nextRunAt: r.nextRunAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      typeLabel: REPORT_TYPE_LABEL[r.reportType],
      scheduleLabel: describeSchedule(r),
      // Resolved names, and a count of anyone who has since left - a schedule quietly
      // addressed to nobody is worth seeing.
      recipients: r.recipientUserIds.map((id) => byId.get(id)).filter(Boolean),
      unreachableRecipients: r.recipientUserIds.filter((id) => !byId.has(id)).length,
    }))
  }

  async createSchedule(caller: Caller, companyId: string, input: {
    name: string
    reportType: ReportType
    frequency: Frequency
    dayOfWeek: number
    timeOfDay: string
    timezone: string
    recipientUserIds: string[]
    siteId?: string | null
    /** A schedule may cover a whole project, which is the common shape for a monthly one. */
    projectId?: string | null
    enabled?: boolean
  }, ctx: { ip?: string; device?: string } = {}) {
    this.require(caller, companyId, 'creating report schedules')
    if (!input.name?.trim()) throw new ReportError('validation', 'Give the schedule a name.')
    this.validateShape(input)

    if (input.siteId) {
      const site = await this.db.site.findFirst({
        where: { id: input.siteId, companyId }, select: { id: true },
      })
      if (!site) throw new ReportError('validation', 'Unknown site for this workspace.')
    }

    /*
     * The project is tenant-checked exactly like the site above.
     *
     * A schedule outlives the session that wrote it and mails a whole safety picture on a
     * timer, so an id from another tenant stored here would keep sending somebody else's
     * data every month until a human noticed.
     */
    if (input.projectId) {
      const project = await this.db.project.findFirst({
        where: { id: input.projectId, companyId }, select: { id: true },
      })
      if (!project) throw new ReportError('validation', 'Unknown project for this workspace.')
    }

    /*
     * Recipients are checked against this company's memberships.
     *
     * The critical isolation rule: without it, a tenant could address a schedule to a user
     * id from another tenant and post the whole safety picture into their inbox.
     */
    const resolved = await this.resolveRecipients(companyId, input.recipientUserIds)
    if (resolved.length !== input.recipientUserIds.length) {
      throw new ReportError('validation',
        'One or more recipients are not active members of this workspace.')
    }
    if (resolved.length === 0) {
      throw new ReportError('validation', 'Choose at least one recipient.')
    }

    const enabled = input.enabled ?? true
    const row = await this.db.reportSchedule.create({
      data: {
        companyId,
        name: input.name.trim(),
        reportType: input.reportType,
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek,
        timeOfDay: input.timeOfDay,
        timezone: input.timezone,
        recipientUserIds: resolved.map((r) => r.userId),
        siteId: input.siteId ?? null,
        projectId: input.projectId ?? null,
        enabled,
        nextRunAt: enabled ? nextRunAt(input, new Date()) : null,
        createdBy: caller.name,
      },
    })

    await this.log(caller, companyId, 'Report schedule created',
      `${row.name} (${REPORT_TYPE_LABEL[row.reportType]})`, ctx)
    return row
  }

  async updateSchedule(caller: Caller, id: string, input: Partial<{
    name: string
    frequency: Frequency
    dayOfWeek: number
    timeOfDay: string
    timezone: string
    recipientUserIds: string[]
    siteId: string | null
    enabled: boolean
  }>, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.reportSchedule.findUnique({ where: { id } })
    if (!existing) throw new ReportError('not_found', 'Schedule not found.', 404)
    this.require(caller, existing.companyId, 'changing report schedules')

    const shape = {
      frequency: (input.frequency ?? existing.frequency) as Frequency,
      dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
      timeOfDay: input.timeOfDay ?? existing.timeOfDay,
      timezone: input.timezone ?? existing.timezone,
    }
    this.validateShape(shape)

    let recipientUserIds = existing.recipientUserIds
    if (input.recipientUserIds) {
      const resolved = await this.resolveRecipients(existing.companyId, input.recipientUserIds)
      if (resolved.length !== input.recipientUserIds.length) {
        throw new ReportError('validation',
          'One or more recipients are not active members of this workspace.')
      }
      if (resolved.length === 0) throw new ReportError('validation', 'Choose at least one recipient.')
      recipientUserIds = resolved.map((r) => r.userId)
    }

    if (input.siteId) {
      const site = await this.db.site.findFirst({
        where: { id: input.siteId, companyId: existing.companyId }, select: { id: true },
      })
      if (!site) throw new ReportError('validation', 'Unknown site for this workspace.')
    }

    const enabled = input.enabled ?? existing.enabled
    const row = await this.db.reportSchedule.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? undefined,
        ...shape,
        recipientUserIds,
        siteId: input.siteId === undefined ? undefined : input.siteId,
        enabled,
        // Re-armed from now whenever the timing changes, so an edit cannot leave a stale
        // due time in the past that fires immediately.
        nextRunAt: enabled ? nextRunAt(shape, new Date()) : null,
      },
    })

    await this.log(caller, existing.companyId,
      input.enabled === false ? 'Report schedule disabled'
        : input.enabled === true ? 'Report schedule enabled'
          : 'Report schedule updated',
      row.name, ctx)
    return row
  }

  async deleteSchedule(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.reportSchedule.findUnique({ where: { id } })
    if (!existing) throw new ReportError('not_found', 'Schedule not found.', 404)
    this.require(caller, existing.companyId, 'deleting report schedules')

    // The runs survive: SetNull on the foreign key keeps the execution history, because
    // deleting a schedule should not erase the evidence that reports went out.
    await this.db.reportSchedule.delete({ where: { id } })
    await this.log(caller, existing.companyId, 'Report schedule deleted', existing.name, ctx)
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Produce a report, store the PDF and attempt delivery.
   *
   * `dueSlot` is the idempotency key: the unique index on (scheduleId, dueSlot) means the
   * same Monday 08:00 can only ever produce one run however many times the sweep fires.
   * Null for a manual run, which is deliberate and may be repeated.
   */
  async execute(opts: {
    companyId: string
    reportType: ReportType
    siteId?: string | null
    /** A schedule may be scoped to a project as well as, or instead of, a site. */
    projectId?: string | null
    scheduleId?: string | null
    dueSlot?: string | null
    trigger: 'scheduled' | 'manual'
    triggeredBy: string
    recipientUserIds: string[]
  }) {
    let runId: string
    try {
      const run = await this.db.reportRun.create({
        data: {
          scheduleId: opts.scheduleId ?? null,
          companyId: opts.companyId,
          reportType: opts.reportType,
          trigger: opts.trigger,
          dueSlot: opts.dueSlot ?? null,
          triggeredBy: opts.triggeredBy,
          status: 'running',
        },
        select: { id: true },
      })
      runId = run.id
    } catch (e) {
      // The unique index rejected it: this slot has already been executed. Not an error.
      if ((e as { code?: string }).code === 'P2002') return { skipped: true as const }
      throw e
    }

    try {
      const data = await this.build(opts.companyId, opts.reportType, {
        siteId: opts.siteId, projectId: opts.projectId,
      })
      const pdf = await renderReportPdf(data)
      const recipients = await this.resolveRecipients(opts.companyId, opts.recipientUserIds)

      /*
       * The PDF is recorded before delivery is attempted.
       *
       * If the process dies mid-send the run still points at a stored file the operator can
       * download, and the status left behind is email_pending rather than a run that looks
       * like it never happened.
       */
      /*
       * Everything needed to deliver is recorded before the provider is contacted.
       *
       * If the process dies mid-send, what survives is a run pointing at a stored PDF, the
       * exact message that was being sent, and attempts = 1 - which is precisely enough for
       * the recovery sweep to work out what happened and whether it is safe to try again.
       */
      const willAttempt = recipients.length > 0 && emailConfiguration().configured
      await this.db.reportRun.update({
        where: { id: runId },
        data: {
          rowCount: data.rows.length,
          recipientCount: recipients.length,
          storedName: pdf.storedName,
          originalName: pdf.fileName,
          sizeBytes: pdf.bytes.length,
          periodEnd: data.periodEnd,
          deliveryStatus: willAttempt ? 'email_pending' : 'generated',
          ...(willAttempt ? { attempts: 1, lastAttemptAt: new Date() } : {}),
        },
      })

      const delivery = await deliverReport({
        data, pdf, recipients, idempotencyKey: idempotencyKeyFor(runId),
      })

      // The message is kept whatever the outcome: a retry must re-send this, not rebuild it.
      const outcome = this.settleDelivery(delivery, willAttempt ? 1 : 0)
      await this.db.reportRun.update({
        where: { id: runId },
        data: {
          status: 'success',
          completedAt: new Date(),
          deliveryPayload: delivery.payload as unknown as Prisma.InputJsonValue,
          ...outcome,
        },
      })

      if (opts.scheduleId) {
        await this.db.reportSchedule.update({
          where: { id: opts.scheduleId },
          data: { lastRunAt: new Date(), lastRunStatus: 'success', lastRunError: null },
        })
      }
      return {
        skipped: false as const, runId, rowCount: data.rows.length,
        delivery: { ...delivery, ...outcome },
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Report generation failed.'
      await this.db.reportRun.update({
        where: { id: runId },
        data: { status: 'failed', completedAt: new Date(), error: message.slice(0, 500) },
      })
      /*
       * A failure must not wedge the schedule.
       *
       * lastRunStatus records what happened, and the caller still advances nextRunAt - a
       * schedule that stops trying because one week's report failed is worse than one that
       * reports the failure and carries on.
       */
      if (opts.scheduleId) {
        await this.db.reportSchedule.update({
          where: { id: opts.scheduleId },
          data: { lastRunAt: new Date(), lastRunStatus: 'failed', lastRunError: message.slice(0, 500) },
        })
      }
      throw e
    }
  }

  /**
   * Turn a delivery outcome into the columns that record it.
   *
   * One place decides what a failure means, so the first attempt and every retry after it
   * agree. A transient failure that is safe to repeat stays email_pending with a time on
   * it - the run is still in flight, and showing it as failed would send an operator
   * chasing something that is about to fix itself. Anything else is final.
   */
  private settleDelivery(delivery: DeliveryResult, attempts: number) {
    const decision = delivery.status === 'failed' && delivery.errorCode
      ? decideRetry({
        code: delivery.errorCode,
        attempts,
        providerIdempotent: delivery.providerIdempotent,
      })
      : null

    const retrying = decision?.retry === true
    const note = decision ? `${delivery.note} ${decision.explanation}` : delivery.note

    return {
      // Only ever true because a provider gave us an id to prove it.
      delivered: delivery.delivered,
      deliveryStatus: retrying ? ('email_pending' as const) : delivery.status,
      deliveryNote: note.slice(0, 900),
      messageId: delivery.messageId,
      sentAt: delivery.sentAt,
      failureReason: delivery.failureReason
        ? `${delivery.failureReason} ${decision?.explanation ?? ''}`.trim().slice(0, 500)
        : null,
      provider: delivery.provider,
      attempts,
      lastAttemptAt: attempts > 0 ? new Date() : null,
      nextAttemptAt: decision?.nextAttemptAt ?? null,
    }
  }

  /**
   * Send a run's stored message again.
   *
   * Re-sends what was recorded at generation time - the same subject, the same body, the
   * same PDF read back off disk - so a retry can never deliver something that disagrees
   * with the run it belongs to. The idempotency key is derived from the run id, which is
   * what lets a provider that supports it recognise the repeat instead of sending twice.
   */
  private async retryStoredDelivery(run: {
    id: string
    attempts: number
    storedName: string | null
    originalName: string | null
    deliveryPayload: Prisma.JsonValue
  }) {
    const payload = run.deliveryPayload as unknown as DeliveryPayload | null
    const bytes = run.storedName ? readStoredReport(run.storedName) : null

    if (!payload || !bytes || !run.originalName) {
      /*
       * Nothing to re-send. Older runs pre-date the stored payload, and a file can be
       * removed by retention. Either way this is final and says why, rather than looping.
       */
      await this.db.reportRun.update({
        where: { id: run.id },
        data: {
          deliveryStatus: 'failed',
          nextAttemptAt: null,
          failureReason: 'The stored report is no longer available to re-send. '
            + 'Run the report again to deliver a current copy.',
          deliveryNote: 'Delivery could not be retried because the generated PDF or the '
            + 'recorded message is no longer available.',
        },
      })
      return { retried: false as const, runId: run.id }
    }

    const attempts = run.attempts + 1
    // Written before the provider is contacted, so a crash mid-send is still visible as an
    // attempt that was in flight rather than one that never happened.
    await this.db.reportRun.update({
      where: { id: run.id },
      data: { attempts, lastAttemptAt: new Date(), nextAttemptAt: null },
    })

    const delivery = await sendDeliveryPayload({
      payload,
      pdf: { fileName: run.originalName, bytes },
      idempotencyKey: idempotencyKeyFor(run.id),
    })

    const outcome = this.settleDelivery(delivery, attempts)
    await this.db.reportRun.update({ where: { id: run.id }, data: outcome })
    return { retried: true as const, runId: run.id, status: outcome.deliveryStatus }
  }

  /**
   * Pick up deliveries that were left in flight, and retries that have come due.
   *
   * Called from the scheduler's existing sweep rather than from a timer of its own - one
   * thing in this system decides when work happens.
   *
   * Two populations, deliberately handled differently. A run with a time on it failed for a
   * reason known to be transient and is simply due again. A run with no time on it was
   * interrupted: the process stopped somewhere between handing the message over and
   * recording what came back, and whether it can be repeated depends entirely on whether
   * the provider can recognise a duplicate. That question is answered in reportRetry.ts,
   * not here.
   */
  async recoverStalledDeliveries(now = new Date()) {
    const staleBefore = new Date(now.getTime() - STALE_PENDING_MINUTES * 60_000)

    const pending = await this.db.reportRun.findMany({
      where: {
        deliveryStatus: 'email_pending',
        OR: [
          // A retry that has come due.
          { nextAttemptAt: { lte: now } },
          // Interrupted: no retry was scheduled and nothing has touched it since.
          { nextAttemptAt: null, lastAttemptAt: { lt: staleBefore } },
          { nextAttemptAt: null, lastAttemptAt: null, startedAt: { lt: staleBefore } },
        ],
      },
      select: {
        id: true, attempts: true, storedName: true, originalName: true,
        deliveryPayload: true, nextAttemptAt: true,
      },
      orderBy: { startedAt: 'asc' },
      // Bounded: a bad night must not turn one sweep into a thousand provider calls.
      take: 25,
    })

    const { configured, provider: providerName } = emailConfiguration()
    if (!configured || pending.length === 0) {
      return { examined: pending.length, retried: 0, abandoned: 0 }
    }

    const idempotent = getEmailProvider()?.idempotent ?? false
    let retried = 0
    let abandoned = 0

    for (const run of pending) {
      // A scheduled retry was already judged safe at the moment it was scheduled.
      const due = run.nextAttemptAt !== null
      const verdict = due
        ? { resume: true, reason: '' }
        : canResumePending({ attempts: run.attempts, providerIdempotent: idempotent })

      if (!verdict.resume) {
        abandoned += 1
        await this.db.reportRun.update({
          where: { id: run.id },
          data: {
            deliveryStatus: 'failed',
            nextAttemptAt: null,
            provider: providerName,
            // Short reason, fuller note - the two are shown on separate lines, so making
            // them identical printed the same paragraph twice.
            failureReason: 'Delivery was interrupted and could not be confirmed.',
            deliveryNote: verdict.reason.slice(0, 900),
          },
        })
        continue
      }

      if (run.attempts >= MAX_ATTEMPTS) {
        abandoned += 1
        await this.db.reportRun.update({
          where: { id: run.id },
          data: {
            deliveryStatus: 'failed',
            nextAttemptAt: null,
            failureReason: `Delivery gave up after ${MAX_ATTEMPTS} attempts.`,
            deliveryNote: 'The mail provider could not be reached on any attempt. '
              + 'The report is available to download from the history.',
          },
        })
        continue
      }

      const result = await this.retryStoredDelivery(run)
      if (result.retried) retried += 1
      else abandoned += 1
    }

    return { examined: pending.length, retried, abandoned }
  }

  /**
   * The scheduler's entry point.
   *
   * Everything a scheduled report involves - building it, rendering the PDF, sending the
   * email, recording the outcome - happens behind this one call, so scheduler.ts decides
   * only what is due and never learns how any of it works.
   */
  async runScheduledReport(schedule: {
    id: string
    companyId: string
    reportType: ReportType
    siteId: string | null
    recipientUserIds: string[]
    projectId?: string | null
  }, dueSlot: string) {
    return this.execute({
      companyId: schedule.companyId,
      reportType: schedule.reportType,
      siteId: schedule.siteId,
      projectId: schedule.projectId ?? null,
      scheduleId: schedule.id,
      dueSlot,
      trigger: 'scheduled',
      triggeredBy: 'system',
      recipientUserIds: schedule.recipientUserIds,
    })
  }

  /** Run now. Does not touch the schedule's timing. */
  async runNow(caller: Caller, scheduleId: string, ctx: { ip?: string; device?: string } = {}) {
    const s = await this.db.reportSchedule.findUnique({ where: { id: scheduleId } })
    if (!s) throw new ReportError('not_found', 'Schedule not found.', 404)
    this.require(caller, s.companyId, 'running reports')

    const result = await this.execute({
      companyId: s.companyId,
      reportType: s.reportType,
      siteId: s.siteId,
      projectId: s.projectId,
      scheduleId: s.id,
      dueSlot: null,
      trigger: 'manual',
      triggeredBy: caller.name,
      recipientUserIds: s.recipientUserIds,
    })
    await this.log(caller, s.companyId, 'Report run manually', s.name, ctx)
    return result
  }

  async history(caller: Caller, companyId: string, scheduleId?: string) {
    this.require(caller, companyId, 'viewing report history')
    const rows = await this.db.reportRun.findMany({
      where: { companyId, ...(scheduleId ? { scheduleId } : {}) },
      // Newest first, with a tiebreak: runs written in the same second must not shuffle.
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    })
    /*
     * Listed field by field rather than spread.
     *
     * The row carries things the browser has no business holding: deliveryPayload is the
     * rendered email including every recipient's address, and storedName is the filename on
     * disk. Spreading the record would ship both to anyone who can open the History tab,
     * and would keep doing it silently every time a column is added.
     */
    return rows.map((r) => ({
      id: r.id,
      scheduleId: r.scheduleId,
      reportType: r.reportType,
      typeLabel: REPORT_TYPE_LABEL[r.reportType],
      trigger: r.trigger,
      triggeredBy: r.triggeredBy,
      status: r.status,
      rowCount: r.rowCount,
      recipientCount: r.recipientCount,
      delivered: r.delivered,
      deliveryStatus: r.deliveryStatus,
      deliveryNote: r.deliveryNote,
      failureReason: r.failureReason,
      // The provider's name only - never anything about how it authenticates.
      provider: r.provider,
      // The provider's own id, so an operator can look the message up at their end.
      messageId: r.messageId,
      attempts: r.attempts,
      maxAttempts: MAX_ATTEMPTS,
      originalName: r.originalName,
      sizeBytes: r.sizeBytes,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      periodEnd: r.periodEnd?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
    }))
  }

  /** A stored PDF, re-checked against the caller's tenant. */
  async runFile(caller: Caller, runId: string) {
    const run = await this.db.reportRun.findUnique({ where: { id: runId } })
    if (!run) throw new ReportError('not_found', 'Report run not found.', 404)
    this.membership(caller, run.companyId)
    this.require(caller, run.companyId, 'downloading reports')
    if (!run.storedName) throw new ReportError('not_found', 'That run produced no file.', 404)
    return run
  }

  /** Whether email is actually wired up, so the UI can say so rather than imply delivery. */
  get mailConfigured() {
    return mailProviderConfigured()
  }
}
