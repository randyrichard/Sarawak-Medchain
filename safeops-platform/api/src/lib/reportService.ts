import { Prisma, type PrismaClient, type ReportType, type Role } from '@prisma/client'
import type { Caller } from './incidentService.js'
import { overdueActionWhere } from './incidentService.js'
import { SEVERITY_LABEL, TYPE_LABEL } from './incidentCatalog.js'
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
  describeSchedule, isValidTimezone, nextRunAt, parseTimeOfDay,
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

/** Who may schedule, run and read reports. A tenant-wide safety picture is not for workers. */
const REPORT_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  overdue_actions: 'Overdue corrective actions',
  open_investigations: 'Open investigations',
}

/** Stages where an investigation is still owed work. Closed and archived are excluded. */
const OPEN_INVESTIGATION_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification',
] as const

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
  generatedAt: Date
  periodStart: Date | null
  periodEnd: Date
  /** The headline numbers, above the table. */
  summary: { label: string; value: string }[]
  columns: ReportColumn[]
  rows: Record<string, string>[]
  /** Said on the page when there is nothing to report, rather than an empty table. */
  emptyMessage: string
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
    companyId: string, type: ReportType, siteId?: string | null,
  ): Promise<ReportData> {
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

    return type === 'overdue_actions'
      ? this.buildOverdueActions(companyId, company.name, siteId ?? null, site?.name ?? null)
      : this.buildOpenInvestigations(companyId, company.name, siteId ?? null, site?.name ?? null)
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
        stage: i.stage.replace(/_/g, ' '),
        outstanding: outstanding(i),
      })),
      emptyMessage: 'No investigations are open. Everything reported has been closed out.',
    }
  }

  /** Build and render, without touching any schedule. Used by preview and Run now. */
  async preview(caller: Caller, companyId: string, type: ReportType, siteId?: string | null) {
    this.require(caller, companyId, 'running reports')
    return this.build(companyId, type, siteId)
  }

  async renderPdf(caller: Caller, companyId: string, type: ReportType, siteId?: string | null) {
    const data = await this.preview(caller, companyId, type, siteId)
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
      const data = await this.build(opts.companyId, opts.reportType, opts.siteId)
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
  }, dueSlot: string) {
    return this.execute({
      companyId: schedule.companyId,
      reportType: schedule.reportType,
      siteId: schedule.siteId,
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
