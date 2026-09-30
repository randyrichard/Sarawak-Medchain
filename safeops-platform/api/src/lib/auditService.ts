import type {
  AuditStatus, AuditType, DocKind, FindingSeverity, Prisma, PrismaClient, Role,
} from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller } from './incidentService.js'
import { enqueueEvent } from './webhookService.js'
import {
  AUDIT_TEMPLATES, AUDIT_TYPE_LABEL, BUILT_IN_TEMPLATE_IDS, SEVERITY_DUE_DAYS,
  SEVERITY_PRIORITY, type AuditTemplateShape, templateItemCount,
} from './auditCatalog.js'
import { DomainError } from './errors.js'
import { resolveOwnerId } from './actionOwner.js'

/** Roles permitted to plan, close and sign off audits, and to approve documents. */
const REVIEW_ROLES: Role[] = ['admin', 'hse_manager']
/** Roles permitted to manage controlled documents. */
const MANAGE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

export class AuditError extends DomainError {}

const DAY = 86400_000

/**
 * Date-only values are pinned to UTC midnight — same rule as the inspection register.
 * Local midnight in UTC+8 lands on the previous UTC day, and every client renders a
 * date by slicing the ISO string, so the whole register would read a day early.
 */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function daysUntil(d: Date): number {
  return Math.round((utcMidnight(d).getTime() - utcMidnight(new Date()).getTime()) / DAY)
}

function addDays(days: number): Date {
  return utcMidnight(new Date(Date.now() + days * DAY))
}

/** A corrective action is settled once it is verified or cancelled. */
const SETTLED_STATUSES = ['verified', 'cancelled']
const isSettled = (status: string | undefined | null) => SETTLED_STATUSES.includes(status ?? '')

export interface AuditAnswer {
  itemId: string
  section: string
  text: string
  result: 'pass' | 'fail' | 'na'
  comment?: string
  photoCount?: number
}

export interface FailInput {
  severity: FindingSeverity
  description: string
  owner: string
  photoCount?: number
  linkedAssetId?: string
}

const auditInclude = {
  findings: {
    orderBy: { code: 'asc' },
    include: { action: { select: { id: true, code: true, owner: true, dueDate: true, status: true } } },
  },
  timeline: { orderBy: { at: 'desc' } },
} satisfies Prisma.AuditInclude

type AuditRow = Prisma.AuditGetPayload<{ include: typeof auditInclude }>

export type FindingDerivedStatus = 'Open' | 'Action In Progress' | 'Awaiting Verification' | 'Closed'

export interface AuditFilters {
  companyId: string
  page: number
  pageSize: number
  q?: string
  siteId?: string
  status?: AuditStatus
  type?: AuditType
}

export class AuditService {
  constructor(private db: PrismaClient) {}

  // ── Authorisation ──────────────────────────────────────────────────────────

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new AuditError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  private requireReviewer(caller: Caller, companyId: string, what: string) {
    const m = this.membership(caller, companyId)
    if (!REVIEW_ROLES.includes(m.role)) {
      throw new AuditError('forbidden', `Only an HSE Manager or Admin can ${what}.`, 403)
    }
    return m
  }

  private async loadAudit(caller: Caller, id: string) {
    const audit = await this.db.audit.findUnique({ where: { id }, include: auditInclude })
    if (!audit) throw new AuditError('not_found', 'Audit not found.', 404)
    const m = this.membership(caller, audit.companyId)
    return { audit, membership: m }
  }

  /**
   * Whether the caller may run this audit.
   *
   * Deliberately wider than planning it: the people who walk the job are the lead auditor
   * and the team named on it, and an audit only a manager can execute is one that waits
   * for a manager to be free.
   */
  private canRun(caller: Caller, audit: AuditRow): boolean {
    const m = this.membership(caller, audit.companyId)
    return (
      REVIEW_ROLES.includes(m.role) ||
      audit.leadAuditor === caller.name ||
      audit.team.includes(caller.name)
    )
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  /** Built-in templates plus whatever this workspace has authored. */
  async listTemplates(caller: Caller, companyId: string): Promise<AuditTemplateShape[]> {
    this.membership(caller, companyId)
    const custom = await this.db.auditTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    })
    return [
      ...AUDIT_TEMPLATES,
      ...custom.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        sections: t.sections as unknown as AuditTemplateShape['sections'],
        custom: true,
      })),
    ]
  }

  private async resolveTemplate(companyId: string, templateId: string): Promise<AuditTemplateShape> {
    const builtIn = AUDIT_TEMPLATES.find((t) => t.id === templateId)
    if (builtIn) return builtIn

    // Scoped to the tenant: a template id from another workspace must not resolve here,
    // or one tenant's audit is scored against another's checklist.
    const row = await this.db.auditTemplate.findFirst({ where: { id: templateId, companyId } })
    if (!row) throw new AuditError('validation', 'Unknown checklist template.')
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      sections: row.sections as unknown as AuditTemplateShape['sections'],
      custom: true,
    }
  }

  async createTemplate(caller: Caller, companyId: string, name: string, items: string[]) {
    this.requireReviewer(caller, companyId, 'create checklist templates')

    const clean = (items ?? []).map((t) => t.trim()).filter(Boolean)
    if (!name?.trim() || clean.length < 3) {
      throw new AuditError('validation', 'A template needs a name and at least 3 checklist items.')
    }

    const row = await this.db.auditTemplate.create({
      data: {
        companyId,
        name: name.trim(),
        type: 'custom',
        sections: [
          { title: 'Checklist', items: clean.map((text, i) => ({ id: `x${i}`, text })) },
        ] as never,
        createdBy: caller.name,
      },
    })
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      sections: row.sections as unknown as AuditTemplateShape['sections'],
      custom: true,
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  private findingStatus(status: string | undefined): FindingDerivedStatus {
    if (status === 'verified' || status === 'cancelled') return 'Closed'
    if (status === 'completed') return 'Awaiting Verification'
    if (status === 'in_progress') return 'Action In Progress'
    return 'Open'
  }

  private toFindingView(f: AuditRow['findings'][number], audit: AuditRow) {
    const a = f.action
    return {
      ...f,
      auditId: audit.id,
      auditCode: audit.code,
      auditTitle: audit.title,
      siteId: audit.siteId,
      department: audit.department,
      status: this.findingStatus(a?.status),
      actionCode: a?.code ?? '—',
      actionOwner: a?.owner ?? '—',
      actionDue: a?.dueDate ?? null,
      actionOverdue: !!a && !isSettled(a.status) && daysUntil(a.dueDate) < 0,
    }
  }

  private toAuditView(audit: AuditRow, templateName: string) {
    const open = audit.findings.filter(
      (f) => !isSettled(f.action?.status),
    )
    const daysToStart = daysUntil(audit.scheduledFor)
    return {
      ...audit,
      findings: audit.findings.map((f) => this.toFindingView(f, audit)),
      templateName,
      openFindings: open.length,
      criticalFindings: open.filter((f) => f.severity === 'Critical').length,
      // A planned audit whose date has passed is overdue — that is the whole signal.
      overdue: audit.status === 'planned' && daysToStart < 0,
      daysToStart,
      typeLabel: AUDIT_TYPE_LABEL[audit.type],
    }
  }

  private async templateNames(audits: AuditRow[]): Promise<Map<string, string>> {
    const names = new Map<string, string>(AUDIT_TEMPLATES.map((t) => [t.id, t.name]))
    const custom = audits.map((a) => a.templateId).filter((id) => !BUILT_IN_TEMPLATE_IDS.has(id))
    if (custom.length > 0) {
      const rows = await this.db.auditTemplate.findMany({
        where: { id: { in: custom } },
        select: { id: true, name: true },
      })
      for (const r of rows) names.set(r.id, r.name)
    }
    return names
  }

  // ── Audits ─────────────────────────────────────────────────────────────────

  async listAudits(caller: Caller, f: AuditFilters) {
    this.membership(caller, f.companyId)
    const q = f.q?.trim()

    const where: Prisma.AuditWhereInput = {
      companyId: f.companyId,
      ...(f.siteId ? { siteId: f.siteId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { leadAuditor: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
              { team: { has: q } },
            ],
          }
        : {}),
    }

    const [total, rows] = await this.db.$transaction([
      this.db.audit.count({ where }),
      this.db.audit.findMany({
        where,
        include: auditInclude,
        orderBy: [{ scheduledFor: 'asc' }, { code: 'asc' }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ])

    const names = await this.templateNames(rows)
    // Work in progress first, then what is planned, then history — SQL cannot order by
    // the derived rank, so it is applied to the page the query already narrowed.
    const views = rows
      .map((r) => this.toAuditView(r, names.get(r.templateId) ?? 'Unknown template'))
      .sort((a, b) => {
        const rank = (x: typeof a) =>
          x.status === 'in_progress' ? 0 : x.status === 'planned' ? 1 : x.status === 'completed' ? 2 : 3
        return rank(a) - rank(b) || a.scheduledFor.getTime() - b.scheduledFor.getTime()
      })

    return {
      rows: views,
      page: f.page,
      pageSize: f.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    }
  }

  async getAuditDetail(caller: Caller, id: string) {
    const { audit } = await this.loadAudit(caller, id)
    const template = await this.resolveTemplate(audit.companyId, audit.templateId)
    return {
      audit: this.toAuditView(audit, template.name),
      findings: audit.findings.map((f) => this.toFindingView(f, audit)),
      template,
    }
  }

  async createAudit(caller: Caller, input: {
    companyId: string
    siteId: string
    title: string
    type: AuditType
    customType?: string
    department?: string
    leadAuditor: string
    team?: string[]
    templateId: string
    scheduledFor: string
    durationDays?: number
    priority?: 'High' | 'Medium' | 'Low'
  }) {
    const m = this.requireReviewer(caller, input.companyId, 'plan audits')

    if (!input.title?.trim() || !input.leadAuditor?.trim() || !input.scheduledFor || !input.siteId) {
      throw new AuditError('validation', 'Title, lead auditor, site and date are required.')
    }
    const scheduled = new Date(input.scheduledFor)
    if (Number.isNaN(scheduled.getTime())) {
      throw new AuditError('validation', 'A valid scheduled date is required.')
    }

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new AuditError('validation', 'Unknown site for this workspace.')

    // Resolved before the audit exists, so a bad template id fails the request rather
    // than producing an audit nobody can run.
    await this.resolveTemplate(input.companyId, input.templateId)

    const id = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'audit' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'audit', next: 3010 },
        select: { next: true },
      })
      const created = await tx.audit.create({
        data: {
          code: `AUD-${counter.next}`,
          companyId: input.companyId,
          siteId: input.siteId,
          title: input.title.trim(),
          type: input.type,
          customType: input.customType?.trim() || null,
          department: input.department?.trim() ?? '',
          leadAuditor: input.leadAuditor.trim(),
          team: input.team ?? [],
          templateId: input.templateId,
          scheduledFor: utcMidnight(scheduled),
          durationDays: input.durationDays ?? 1,
          priority: input.priority ?? 'Medium',
          createdBy: caller.name,
          timeline: {
            create: {
              action: 'Audit created',
              detail: input.title.trim(),
              actor: caller.name,
              actorRole: m.role,
            },
          },
        },
        select: { id: true },
      })
      return created.id
    })

    return (await this.getAuditDetail(caller, id)).audit
  }

  async startAudit(caller: Caller, id: string) {
    const { audit, membership } = await this.loadAudit(caller, id)
    if (audit.status !== 'planned') {
      throw new AuditError('validation', 'Only planned audits can be started.')
    }
    if (!this.canRun(caller, audit)) {
      throw new AuditError(
        'forbidden',
        'Only the audit team (or an HSE Manager/Admin) can start this audit.',
        403,
      )
    }

    await this.db.$transaction([
      this.db.audit.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date(), version: { increment: 1 } },
      }),
      this.db.auditEvent.create({
        data: { auditId: id, action: 'Audit started', actor: caller.name, actorRole: membership.role },
      }),
    ])

    return (await this.getAuditDetail(caller, id)).audit
  }

  /**
   * Completes the walk.
   *
   * Every applicable item is scored, every failure becomes a finding, and every finding
   * raises a corrective action with an owner and a severity-derived due date — all in one
   * transaction. A finding that depends on someone remembering to raise the action
   * separately is a finding that never gets fixed.
   */
  async completeAudit(caller: Caller, id: string, input: {
    answers: AuditAnswer[]
    fails: Record<string, FailInput>
    signature: string
    gps?: string
  }) {
    const { audit, membership } = await this.loadAudit(caller, id)
    if (audit.status !== 'in_progress') {
      throw new AuditError('validation', 'Start the audit before completing it.')
    }
    if (!this.canRun(caller, audit)) {
      throw new AuditError('forbidden', 'Only the audit team can complete this audit.', 403)
    }

    const template = await this.resolveTemplate(audit.companyId, audit.templateId)
    const answers = input.answers ?? []
    const expected = new Set(template.sections.flatMap((s) => s.items.map((i) => i.id)))
    const answered = new Set(answers.map((a) => a.itemId))

    // Validated against the server's own template rather than merely counted: a client
    // that invents or repeats items would otherwise score an audit nobody performed.
    if (
      answers.length !== templateItemCount(template) ||
      answered.size !== expected.size ||
      [...expected].some((itemId) => !answered.has(itemId)) ||
      answers.some((a) => !['pass', 'fail', 'na'].includes(a.result))
    ) {
      throw new AuditError('validation', 'Every checklist item needs a Pass, Fail or N/A answer.')
    }

    const fails = answers.filter((a) => a.result === 'fail')
    for (const f of fails) {
      const fi = input.fails?.[f.itemId]
      if (!fi || !fi.description?.trim() || !fi.owner?.trim()) {
        throw new AuditError(
          'validation',
          'Each failed item needs a finding description and an action owner.',
        )
      }
      if (!SEVERITY_DUE_DAYS[fi.severity]) {
        throw new AuditError('validation', 'Each finding needs a severity.')
      }
    }
    if (!input.signature?.trim()) {
      throw new AuditError('validation', 'A digital signature is required.')
    }

    // N/A answers are excluded from the denominator: a checklist half of which does not
    // apply to this site is not an audit that half-failed.
    const applicable = answers.filter((a) => a.result !== 'na')
    const score = applicable.length
      ? Math.round((applicable.filter((a) => a.result === 'pass').length / applicable.length) * 100)
      : 100

    const now = new Date()

    await this.db.$transaction(async (tx) => {
      await tx.audit.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: now,
          score,
          // Section and text come from the server template, so a relabelled client answer
          // cannot rewrite what the checklist said was checked.
          answers: answers.map((a) => {
            const section = template.sections.find((s) => s.items.some((i) => i.id === a.itemId))
            const item = section?.items.find((i) => i.id === a.itemId)
            return {
              itemId: a.itemId,
              section: section?.title ?? a.section,
              text: item?.text ?? a.text,
              result: a.result,
              comment: a.comment?.trim() || undefined,
              photoCount: a.photoCount ?? 0,
            }
          }) as never,
          signature: input.signature.trim(),
          gps: input.gps ?? null,
          version: { increment: 1 },
        },
      })

      for (const f of fails) {
        const fi = input.fails[f.itemId]!
        const section = template.sections.find((s) => s.items.some((i) => i.id === f.itemId))
        const item = section?.items.find((i) => i.id === f.itemId)
        const category = section?.title ?? f.section
        const text = item?.text ?? f.text
        const description = fi.description.trim()
        const dueDate = addDays(SEVERITY_DUE_DAYS[fi.severity])

        const capa = await tx.counter.upsert({
          where: { companyId_kind: { companyId: audit.companyId, kind: 'capa' } },
          update: { next: { increment: 1 } },
          create: { companyId: audit.companyId, kind: 'capa', next: 401 },
          select: { next: true },
        })
        const action = await tx.correctiveAction.create({
          data: {
            code: `CA-${capa.next}`,
            source: 'audit',
            companyId: audit.companyId,
            siteId: audit.siteId,
            assetId: fi.linkedAssetId ?? null,
            title: `${fi.severity} finding: ${description.slice(0, 90)}`,
            detail: `${category} — "${text}". ${description}`,
            owner: fi.owner.trim(),
            ownerId: await resolveOwnerId(tx, audit.companyId, fi.owner),
            dueDate,
            priority: SEVERITY_PRIORITY[fi.severity],
            createdBy: caller.name,
          },
        })

        const findingCounter = await tx.counter.upsert({
          where: { companyId_kind: { companyId: audit.companyId, kind: 'finding' } },
          update: { next: { increment: 1 } },
          create: { companyId: audit.companyId, kind: 'finding', next: 3110 },
          select: { next: true },
        })
        const finding = await tx.auditFinding.create({
          data: {
            code: `F-${findingCounter.next}`,
            auditId: id,
            category,
            description,
            severity: fi.severity,
            photoCount: fi.photoCount ?? 0,
            linkedAssetId: fi.linkedAssetId ?? null,
            actionId: action.id,
            raisedBy: caller.name,
            raisedAt: now,
          },
        })

        await tx.auditEvent.createMany({
          data: [
            {
              auditId: id,
              action: 'Finding raised',
              detail: `${finding.code} · ${fi.severity} — ${description.slice(0, 60)}`,
              actor: caller.name,
              actorRole: membership.role,
            },
            {
              auditId: id,
              action: 'Corrective action created',
              detail: `${action.code} -> ${fi.owner.trim()}, due ${dueDate.toISOString().slice(0, 10)}`,
              actor: 'System',
            },
          ],
        })
      }

      await tx.auditEvent.create({
        data: {
          auditId: id,
          action: 'Audit completed',
          detail: `Score ${score}% · ${fails.length} finding(s)`,
          actor: caller.name,
          actorRole: membership.role,
        },
      })
    })

    const detail = await this.getAuditDetail(caller, id)

    /*
     * One event per finding raised by this submission, and only the ones raised now.
     *
     * `detail.findings` is every finding on the audit, including any from an earlier
     * submission, so it is filtered to those stamped by this run. Announcing the whole set
     * each time would have a receiving system re-open findings it had already dealt with.
     */
    for (const f of detail.findings.filter((x) => x.raisedAt >= now)) {
      await enqueueEvent(this.db, audit.companyId, 'audit.finding.raised', {
        id: f.id,
        code: f.code,
        auditId: id,
        auditCode: audit.code,
        siteId: audit.siteId,
        category: f.category,
        severity: f.severity,
        description: f.description,
        raisedBy: f.raisedBy,
        raisedAt: f.raisedAt.toISOString(),
        actionCode: f.action?.code ?? null,
      })
    }

    return { audit: detail.audit, findings: detail.findings }
  }

  /**
   * Closes the audit.
   *
   * Refused while any finding's corrective action is still open. This is the rule that
   * makes the register evidence rather than paperwork: an audit closed over unverified
   * findings records that the walk happened, not that anything was fixed.
   */
  async closeAudit(caller: Caller, id: string) {
    const { audit } = await this.loadAudit(caller, id)
    const m = this.requireReviewer(caller, audit.companyId, 'close audits')

    if (audit.status !== 'completed') {
      throw new AuditError('validation', 'Only completed audits can be closed.')
    }
    const unresolved = audit.findings.filter(
      (f) => !isSettled(f.action?.status),
    )
    if (unresolved.length > 0) {
      throw new AuditError(
        'validation',
        `${unresolved.length} finding(s) still have unverified corrective actions.`,
      )
    }

    await this.db.$transaction([
      this.db.audit.update({
        where: { id },
        data: { status: 'closed', closedAt: new Date(), version: { increment: 1 } },
      }),
      this.db.auditEvent.create({
        data: {
          auditId: id,
          action: 'Audit closed',
          detail: 'All findings verified',
          actor: caller.name,
          actorRole: m.role,
        },
      }),
    ])

    return (await this.getAuditDetail(caller, id)).audit
  }

  // ── Findings ───────────────────────────────────────────────────────────────

  async listFindings(caller: Caller, companyId: string, severity?: FindingSeverity) {
    this.membership(caller, companyId)

    const rows = await this.db.auditFinding.findMany({
      where: {
        audit: { companyId },
        ...(severity ? { severity } : {}),
      },
      include: {
        action: { select: { id: true, code: true, owner: true, dueDate: true, status: true } },
        audit: { select: { id: true, code: true, title: true, siteId: true, department: true } },
      },
      orderBy: { raisedAt: 'desc' },
      take: 500,
    })

    const views = rows.map((f) => ({
      ...f,
      auditId: f.audit.id,
      auditCode: f.audit.code,
      auditTitle: f.audit.title,
      siteId: f.audit.siteId,
      department: f.audit.department,
      status: this.findingStatus(f.action?.status),
      actionCode: f.action?.code ?? '—',
      actionOwner: f.action?.owner ?? '—',
      actionDue: f.action?.dueDate ?? null,
      actionOverdue:
        !!f.action &&
        !isSettled(f.action.status) &&
        daysUntil(f.action.dueDate) < 0,
    }))

    // Open before closed, then by severity, then newest — the order someone works down.
    const SEV = { Critical: 0, Major: 1, Minor: 2, Observation: 3 }
    return views.sort(
      (a, b) =>
        (a.status === 'Closed' ? 1 : 0) - (b.status === 'Closed' ? 1 : 0) ||
        SEV[a.severity] - SEV[b.severity] ||
        b.raisedAt.getTime() - a.raisedAt.getTime(),
    )
  }

  // ── Compliance obligations ─────────────────────────────────────────────────

  private obligationStatus(daysToDue: number) {
    return daysToDue < 0 ? 'Overdue' : daysToDue <= 30 ? 'Expiring Soon' : 'Compliant'
  }

  async listObligations(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const rows = await this.db.complianceObligation.findMany({
      where: { companyId },
      orderBy: { nextDue: 'asc' },
    })
    return rows.map((o) => {
      const daysToDue = daysUntil(o.nextDue)
      return { ...o, daysToDue, status: this.obligationStatus(daysToDue) }
    })
  }

  async renewObligation(caller: Caller, id: string, nextDue: string, note?: string) {
    const existing = await this.db.complianceObligation.findUnique({ where: { id } })
    if (!existing) throw new AuditError('not_found', 'Obligation not found.', 404)
    this.requireReviewer(caller, existing.companyId, 'renew compliance obligations')

    if (!nextDue?.trim()) throw new AuditError('validation', 'A new due date is required.')
    const when = new Date(nextDue)
    if (Number.isNaN(when.getTime())) {
      throw new AuditError('validation', 'A valid renewal date is required.')
    }
    const due = utcMidnight(when)

    const updated = await this.db.complianceObligation.update({
      where: { id },
      data: {
        nextDue: due,
        // An obligation with an expiry tracks it to the same date; one without stays null
        // rather than acquiring an expiry it never had.
        ...(existing.expiryDate ? { expiryDate: due } : {}),
        lastRenewedAt: new Date(),
        ...(note?.trim() ? { notes: note.trim() } : {}),
      },
    })

    const daysToDue = daysUntil(updated.nextDue)
    return { ...updated, daysToDue, status: this.obligationStatus(daysToDue) }
  }

  // ── Controlled documents ───────────────────────────────────────────────────

  private docInclude = { versions: { orderBy: { at: 'desc' } } } satisfies Prisma.ComplianceDocumentInclude

  async listDocuments(caller: Caller, companyId: string, q?: string, kind?: DocKind) {
    this.membership(caller, companyId)
    const query = q?.trim()

    const rows = await this.db.complianceDocument.findMany({
      where: {
        companyId,
        ...(kind ? { kind } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { owner: { contains: query, mode: 'insensitive' } },
                { version: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.docInclude,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    })

    // Anything waiting on a signature comes first — that is the queue, the rest is a list.
    return rows.sort(
      (a, b) =>
        (a.status === 'PendingApproval' ? 0 : 1) - (b.status === 'PendingApproval' ? 0 : 1) ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    )
  }

  /**
   * Uploads a document or supersedes one.
   *
   * A new revision always re-enters approval and drops the previous sign-off: a
   * controlled document that keeps its approval through an edit is not controlled.
   */
  async addDocumentVersion(caller: Caller, docId: string | null, input: {
    companyId: string
    siteId?: string | null
    name?: string
    kind?: DocKind
    sizeKb?: number
    note?: string
  }) {
    this.membership(caller, input.companyId)
    const m = this.membership(caller, input.companyId)
    if (!MANAGE_ROLES.includes(m.role)) {
      throw new AuditError('forbidden', 'Only Safety Officers and above can manage documents.', 403)
    }

    const note = input.note?.trim()

    if (docId) {
      const doc = await this.db.complianceDocument.findUnique({ where: { id: docId } })
      if (!doc) throw new AuditError('not_found', 'Document not found.', 404)
      this.membership(caller, doc.companyId)

      const parsed = Number.parseFloat(doc.version)
      const version = Number.isFinite(parsed)
        ? (Math.round((parsed + 0.1) * 10) / 10).toFixed(1)
        : new Date().toISOString().slice(0, 10)

      return this.db.complianceDocument.update({
        where: { id: docId },
        data: {
          version,
          status: 'PendingApproval',
          sizeKb: input.sizeKb ?? doc.sizeKb,
          approvedBy: null,
          approvedAt: null,
          versions: {
            create: { version, by: caller.name, note: note || 'New version uploaded' },
          },
        },
        include: this.docInclude,
      })
    }

    if (!input.name?.trim()) throw new AuditError('validation', 'Document name is required.')
    if (!input.kind) throw new AuditError('validation', 'A document kind is required.')

    if (input.siteId) {
      const site = await this.db.site.findFirst({
        where: { id: input.siteId, companyId: input.companyId },
        select: { id: true },
      })
      if (!site) throw new AuditError('validation', 'Unknown site for this workspace.')
    }

    return this.db.complianceDocument.create({
      data: {
        companyId: input.companyId,
        siteId: input.siteId ?? null,
        name: input.name.trim(),
        kind: input.kind,
        version: '1.0',
        status: 'PendingApproval',
        owner: caller.name,
        sizeKb: input.sizeKb ?? 0,
        versions: { create: { version: '1.0', by: caller.name, note: note || 'Initial upload' } },
      },
      include: this.docInclude,
    })
  }

  async approveDocument(caller: Caller, id: string) {
    const doc = await this.db.complianceDocument.findUnique({ where: { id } })
    if (!doc) throw new AuditError('not_found', 'Document not found.', 404)
    this.requireReviewer(caller, doc.companyId, 'approve documents')

    if (doc.status !== 'PendingApproval') {
      throw new AuditError('validation', 'Only documents pending approval can be approved.')
    }

    return this.db.complianceDocument.update({
      where: { id },
      data: { status: 'Approved', approvedBy: caller.name, approvedAt: new Date() },
      include: this.docInclude,
    })
  }

  // ── Counters ───────────────────────────────────────────────────────────────

  /** Programme statistics for the compliance dashboard. */
  async auditStats(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const now = new Date()
    const in30 = addDays(30)

    const [upcoming30d, completedAudits, scored, findings, obligations] = await this.db.$transaction([
      this.db.audit.count({
        where: { companyId, status: 'planned', scheduledFor: { lte: in30 } },
      }),
      this.db.audit.count({ where: { companyId, status: { in: ['completed', 'closed'] } } }),
      this.db.audit.findMany({
        where: { companyId, score: { not: null } },
        select: { score: true },
        take: 1000,
      }),
      this.db.auditFinding.findMany({
        where: { audit: { companyId } },
        select: {
          severity: true,
          category: true,
          raisedAt: true,
          action: { select: { status: true, dueDate: true } },
          audit: { select: { siteId: true, department: true } },
        },
        take: 1000,
      }),
      this.db.complianceObligation.findMany({ where: { companyId }, select: { nextDue: true } }),
    ])

    const open = findings.filter(
      (f) => !isSettled(f.action?.status),
    )

    const compliant = obligations.filter((o) => daysUntil(o.nextDue) > 30).length
    const compliancePct = obligations.length
      ? Math.round((compliant / obligations.length) * 100)
      : 100
    const avgScore = scored.length
      ? Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length)
      : null
    const closurePct = findings.length
      ? Math.round(((findings.length - open.length) / findings.length) * 100)
      : 100

    // Readiness is a blend, weighted toward the register being current rather than the
    // last score being flattering: obligations 40%, audit score 30%, closure 30%.
    const readiness = Math.round(
      0.4 * compliancePct + 0.3 * (avgScore ?? compliancePct) + 0.3 * closurePct,
    )

    const tally = (rows: { key: string }[]) => {
      const m = new Map<string, number>()
      for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + 1)
      return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    }

    /*
     * Six months in one round trip, not six.
     *
     * The same serialised loop that made /assets/stats the slowest endpoint under load —
     * the two services were written alike and carried the same fault. Each iteration held a
     * pool connection while it waited on the previous one, so the cost grew with
     * concurrency rather than with the work. Measured at 1181ms p95 with 150 concurrent
     * users before this change.
     */
    const months = Array.from({ length: 6 }, (_, i) => {
      const start = new Date()
      start.setMonth(start.getMonth() - (5 - i), 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      return { start, end }
    })

    const trendCounts = await this.db.$transaction(
      months.flatMap(({ start, end }) => [
        this.db.audit.count({ where: { companyId, completedAt: { gte: start, lt: end } } }),
        this.db.auditFinding.count({
          where: { audit: { companyId }, raisedAt: { gte: start, lt: end } },
        }),
      ]),
    )

    const monthlyTrend = months.map(({ start }, i) => ({
      month: start.toLocaleDateString('en-MY', { month: 'short' }),
      Audits: trendCounts[i * 2],
      Findings: trendCounts[i * 2 + 1],
    }))

    return {
      upcoming30d,
      openFindings: open.length,
      criticalFindings: open.filter((f) => f.severity === 'Critical').length,
      overdueFindingActions: open.filter(
        (f) => f.action && daysUntil(f.action.dueDate) < 0,
      ).length,
      compliancePct,
      avgScore,
      readiness,
      completedAudits,
      findingsByCategory: tally(findings.map((f) => ({ key: f.category }))).slice(0, 6),
      bySiteOpenFindings: tally(open.map((f) => ({ key: f.audit.siteId }))),
      byDeptOpenFindings: tally(open.map((f) => ({ key: f.audit.department }))),
      monthlyTrend,
      generatedAt: now.toISOString(),
    }
  }
}
