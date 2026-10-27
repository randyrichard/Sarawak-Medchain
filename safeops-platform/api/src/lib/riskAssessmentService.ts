import type { CapaPriority, Prisma, PrismaClient, Role } from '@prisma/client'
import { type Caller, type Membership, membershipOf } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'
import { todayDate } from '../domain/businessDay.js'
import {
  addMonths, DEFAULT_REVIEW_MONTHS, hirarcAttention, hirarcProblem, LIMITS, LIKELIHOOD, RISK_LEVEL_LABEL, riskLevel,
  riskScore, SEVERITY, type ActionState, type HirarcFields, type RiskLevel,
} from '../domain/hirarc.js'
import { IncidentService } from './incidentService.js'
import { csvCell } from './csvParse.js'

/**
 * The HIRARC register: each work activity's hazards, what they can cause, and the risk
 * before and after the controls recommended for them. The rules are domain/hirarc.ts.
 *
 * Further controls are put in place through corrective actions raised from a row, so they
 * are owned, dated, notified and verified like every other action, and the row shows where
 * they stand. A row is archived rather than deleted: it remains the record of what was
 * assessed, and the actions raised from it still point at it.
 */
export class RiskAssessmentError extends DomainError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status)
    this.name = 'RiskAssessmentError'
  }
}

/** Who reads the register: the people who run a site or oversee them. */
const VIEW_ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor']
/** Who writes it: the safety function, who conduct the assessment. */
const EDIT_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

/** Rows sent to the screen at once. The matrix and the counts always cover every row. */
const LIST_CAP = 500

const LEVEL_SCORES: Record<RiskLevel, { gte: number; lte: number }> = {
  high: { gte: 15, lte: 25 }, medium: { gte: 5, lte: 12 }, low: { gte: 1, lte: 4 },
}

/**
 * Rows whose recommended controls are past their date for completion and not yet in place,
 * as SQL: the same rule as hirarcAttention's controlsOverdue, so the count, the filter and
 * the flag on each row agree. "In place" is every live action raised for them completed or
 * verified, and at least one raised; anything else - none raised, or one still open - is
 * not in place.
 */
const controlsOverdueWhere = (today: Date): Prisma.RiskAssessmentWhereInput => ({
  controlsDue: { lt: today },
  NOT: { additionalControls: '' },
  OR: [
    { actions: { none: { status: { not: 'cancelled' } } } },
    { actions: { some: { status: { in: ['open', 'in_progress'] } } } },
  ],
})

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const asDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)
/** Malaysian order for the export, which people open in Excel. The import reads it back. */
const dmy = (d: Date | null) => (d ? `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}/${d.toISOString().slice(0, 4)}` : '')

export interface RiskInput {
  siteId: string
  activity: string
  hazard: string
  effect: string
  existingControls?: string
  likelihood: number
  severity: number
  additionalControls?: string
  owner?: string
  controlsDue?: string | null
  residualLikelihood?: number | null
  residualSeverity?: number | null
  assessedBy?: string
  assessedOn?: string
  reviewDue?: string
}

export interface RiskFilters {
  siteId?: string
  level?: RiskLevel
  q?: string
  archived?: boolean
  attention?: 'review_overdue' | 'needs_controls' | 'controls_overdue'
  /** One cell of the matrix: the risk now, or with `residual`, once the controls are in place. */
  likelihood?: number
  severity?: number
  residual?: boolean
}

const ROW_INCLUDE = {
  site: { select: { name: true } },
  actions: { select: { id: true, code: true, title: true, owner: true, dueDate: true, status: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.RiskAssessmentInclude

type Row = Prisma.RiskAssessmentGetPayload<{ include: typeof ROW_INCLUDE }>

type Ctx = { ip?: string; device?: string }

export class RiskAssessmentService {
  private incidents: IncidentService

  constructor(private db: PrismaClient) {
    this.incidents = new IncidentService(db)
  }

  private membership(caller: Caller, companyId: string, roles: Role[], doing: string): Membership {
    const m = membershipOf(caller, companyId, RiskAssessmentError)
    if (!roles.includes(m.role)) throw new RiskAssessmentError('forbidden', `Your role does not permit ${doing}.`, 403)
    return m
  }

  private siteScope(m: Membership): Prisma.RiskAssessmentWhereInput {
    return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
  }

  /** The row, if the caller may see it. Another workspace's, or a site outside theirs, is not found. */
  private async row(caller: Caller, id: string, roles: Role[], doing: string): Promise<{ row: Row; m: Membership }> {
    const row = await this.db.riskAssessment.findUnique({ where: { id }, include: ROW_INCLUDE })
    const visible = row && caller.roles.some((r) => r.companyId === row.companyId)
    if (!row || !visible) throw new RiskAssessmentError('not_found', 'That risk assessment does not exist.', 404)
    const m = this.membership(caller, row.companyId, roles, doing)
    if (m.siteIds.length > 0 && !m.siteIds.includes(row.siteId)) {
      throw new RiskAssessmentError('not_found', 'That risk assessment does not exist.', 404)
    }
    return { row, m }
  }

  private view(row: Row, today: string, canEdit: boolean) {
    const actions: ActionState[] = row.actions.map((a) => ({ status: a.status }))
    const attention = hirarcAttention({
      riskScore: row.riskScore, residualScore: row.residualScore, additionalControls: row.additionalControls,
      controlsDue: day(row.controlsDue), reviewDue: day(row.reviewDue)!, archived: row.archivedAt !== null,
    }, actions, today)
    return {
      id: row.id, code: row.code, companyId: row.companyId, siteId: row.siteId, siteName: row.site.name,
      activity: row.activity, hazard: row.hazard, effect: row.effect, existingControls: row.existingControls,
      likelihood: row.likelihood, severity: row.severity, riskScore: row.riskScore,
      additionalControls: row.additionalControls, owner: row.owner, controlsDue: day(row.controlsDue),
      residualLikelihood: row.residualLikelihood, residualSeverity: row.residualSeverity, residualScore: row.residualScore,
      assessedBy: row.assessedBy, assessedOn: day(row.assessedOn)!, reviewDue: day(row.reviewDue)!,
      archivedAt: row.archivedAt?.toISOString() ?? null, archivedBy: row.archivedBy, archivedReason: row.archivedReason,
      ...attention,
      actions: row.actions.map((a) => ({ id: a.id, code: a.code, title: a.title, owner: a.owner, dueDate: day(a.dueDate)!, status: a.status })),
      version: row.version, updatedAt: row.updatedAt.toISOString(), canEdit,
    }
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  async list(caller: Caller, companyId: string, f: RiskFilters = {}) {
    const m = this.membership(caller, companyId, VIEW_ROLES, 'reading the HIRARC register')
    if (f.siteId && m.siteIds.length > 0 && !m.siteIds.includes(f.siteId)) {
      throw new RiskAssessmentError('forbidden', 'That site is outside the sites you are assigned to.', 403)
    }
    const today = day(todayDate())!
    const base: Prisma.RiskAssessmentWhereInput = {
      companyId, ...this.siteScope(m), ...(f.siteId ? { siteId: f.siteId } : {}), archivedAt: null,
    }
    const q = f.q?.trim()
    // Each filter its own clause: two of them on the same column (a band, and "needs
    // controls") must both hold, not the second replace the first.
    const filters: Prisma.RiskAssessmentWhereInput[] = [
      f.level ? (f.residual ? { residualScore: LEVEL_SCORES[f.level] } : { riskScore: LEVEL_SCORES[f.level] }) : {},
      f.likelihood && f.severity
        ? (f.residual ? { residualLikelihood: f.likelihood, residualSeverity: f.severity } : { likelihood: f.likelihood, severity: f.severity })
        : {},
      f.attention === 'review_overdue' ? { reviewDue: { lt: asDate(today) } } : {},
      f.attention === 'needs_controls' ? { riskScore: { gte: 5 }, additionalControls: '' } : {},
      f.attention === 'controls_overdue' ? controlsOverdueWhere(asDate(today)) : {},
      q ? { OR: (['code', 'activity', 'hazard', 'effect', 'owner'] as const).map((k) => ({ [k]: { contains: q, mode: 'insensitive' as const } })) } : {},
    ]
    const where: Prisma.RiskAssessmentWhereInput = {
      ...base,
      archivedAt: f.archived ? { not: null } : null,
      AND: filters,
    }

    const [total, rows, now, after, levels, reviewOverdue, needsControls, controlsOverdue] = await Promise.all([
      this.db.riskAssessment.count({ where }),
      this.db.riskAssessment.findMany({
        where, include: ROW_INCLUDE, orderBy: [{ riskScore: 'desc' }, { code: 'asc' }], take: LIST_CAP,
      }),
      this.db.riskAssessment.groupBy({ by: ['likelihood', 'severity'], where: base, _count: { _all: true } }),
      this.db.riskAssessment.groupBy({
        by: ['residualLikelihood', 'residualSeverity'], where: { ...base, residualScore: { not: null } }, _count: { _all: true },
      }),
      this.db.riskAssessment.groupBy({ by: ['riskScore'], where: base, _count: { _all: true } }),
      this.db.riskAssessment.count({ where: { ...base, reviewDue: { lt: asDate(today) } } }),
      this.db.riskAssessment.count({ where: { ...base, riskScore: { gte: 5 }, additionalControls: '' } }),
      this.db.riskAssessment.count({ where: { AND: [base, controlsOverdueWhere(asDate(today))] } }),
    ])

    const canEdit = EDIT_ROLES.includes(m.role)
    const views = rows.map((r) => this.view(r, today, canEdit))

    /** matrix[likelihood - 1][severity - 1] = how many rows sit in that cell. */
    const grid = (cells: { l: number | null; s: number | null; n: number }[]) => {
      const out = Array.from({ length: 5 }, () => Array<number>(5).fill(0))
      for (const c of cells) if (c.l && c.s) out[c.l - 1][c.s - 1] += c.n
      return out
    }
    const byLevel = { high: 0, medium: 0, low: 0 }
    for (const g of levels) byLevel[riskLevel(g.riskScore)] += g._count._all

    return {
      rows: views,
      total,
      capped: total > rows.length,
      matrix: {
        now: grid(now.map((c) => ({ l: c.likelihood, s: c.severity, n: c._count._all }))),
        residual: grid(after.map((c) => ({ l: c.residualLikelihood, s: c.residualSeverity, n: c._count._all }))),
      },
      counts: { ...byLevel, reviewOverdue, needsControls, controlsOverdue },
      canEdit,
    }
  }

  async get(caller: Caller, id: string) {
    const { row, m } = await this.row(caller, id, VIEW_ROLES, 'reading the HIRARC register')
    return this.view(row, day(todayDate())!, EDIT_ROLES.includes(m.role))
  }

  // ── Writing ────────────────────────────────────────────────────────────────

  /** The input as the rules read it, with today's defaults filled in. */
  private fields(caller: Caller, input: RiskInput, today: string): HirarcFields {
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const rating = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
    const assessedOn = text(input.assessedOn) || today
    return {
      activity: text(input.activity), hazard: text(input.hazard), effect: text(input.effect),
      existingControls: text(input.existingControls), likelihood: Number(input.likelihood), severity: Number(input.severity),
      additionalControls: text(input.additionalControls), owner: text(input.owner), controlsDue: text(input.controlsDue) || null,
      residualLikelihood: rating(input.residualLikelihood), residualSeverity: rating(input.residualSeverity),
      assessedBy: text(input.assessedBy) || caller.name, assessedOn,
      reviewDue: text(input.reviewDue) || addMonths(assessedOn, DEFAULT_REVIEW_MONTHS),
    }
  }

  private data(f: HirarcFields) {
    const residual = f.residualLikelihood !== null && f.residualSeverity !== null
    return {
      activity: f.activity, hazard: f.hazard, effect: f.effect, existingControls: f.existingControls,
      likelihood: f.likelihood, severity: f.severity, riskScore: riskScore(f.likelihood, f.severity),
      additionalControls: f.additionalControls, owner: f.owner, controlsDue: f.controlsDue ? asDate(f.controlsDue) : null,
      residualLikelihood: residual ? f.residualLikelihood : null,
      residualSeverity: residual ? f.residualSeverity : null,
      residualScore: residual ? riskScore(f.residualLikelihood!, f.residualSeverity!) : null,
      assessedBy: f.assessedBy, assessedOn: asDate(f.assessedOn), reviewDue: asDate(f.reviewDue),
    }
  }

  private async siteFor(m: Membership, companyId: string, siteId: string) {
    const site = siteId ? await this.db.site.findFirst({ where: { id: siteId, companyId }, select: { id: true } }) : null
    if (!site) throw new RiskAssessmentError('validation', 'Choose a site in this workspace.')
    if (m.siteIds.length > 0 && !m.siteIds.includes(site.id)) {
      throw new RiskAssessmentError('forbidden', 'That site is outside the sites you are assigned to.', 403)
    }
    return site
  }

  private async log(caller: Caller, m: Membership, companyId: string, action: string, target: string, ctx: Ctx) {
    await this.db.adminAuditEntry.create({
      data: {
        companyId, actor: caller.name, actorRole: m.role, action, module: 'audits', target,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
  }

  async create(caller: Caller, companyId: string, input: RiskInput, ctx: Ctx = {}) {
    const m = this.membership(caller, companyId, EDIT_ROLES, 'writing the HIRARC register')
    await this.siteFor(m, companyId, input.siteId)
    const today = day(todayDate())!
    const f = this.fields(caller, input, today)
    const problem = hirarcProblem(f, today)
    if (problem) throw new RiskAssessmentError('validation', problem)

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId, kind: 'risk_assessment' } },
        update: { next: { increment: 1 } },
        create: { companyId, kind: 'risk_assessment', next: 1001 },
        select: { next: true },
      })
      return tx.riskAssessment.create({
        data: { companyId, siteId: input.siteId, code: `HZ-${counter.next}`, createdBy: caller.name, ...this.data(f) },
        include: ROW_INCLUDE,
      })
    })
    await this.log(caller, m, companyId, 'Risk assessed', `${created.code} · ${created.hazard} · ${RISK_LEVEL_LABEL[riskLevel(created.riskScore)]} (${created.riskScore})`, ctx)
    return this.view(created, today, true)
  }

  /** A full replace of the row's assessment, refused if someone else changed it since it was read. */
  async update(caller: Caller, id: string, input: RiskInput & { version: number }, ctx: Ctx = {}) {
    const { row, m } = await this.row(caller, id, EDIT_ROLES, 'writing the HIRARC register')
    if (row.archivedAt) throw new RiskAssessmentError('validation', 'This risk assessment is archived. Restore it to change it.')
    if (input.siteId !== row.siteId) await this.siteFor(m, row.companyId, input.siteId)
    const today = day(todayDate())!
    const f = this.fields(caller, input, today)
    const problem = hirarcProblem(f, today)
    if (problem) throw new RiskAssessmentError('validation', problem)

    const changed = await this.db.riskAssessment.updateMany({
      where: { id, version: input.version },
      data: { siteId: input.siteId, ...this.data(f), version: { increment: 1 } },
    })
    if (changed.count === 0) {
      throw new RiskAssessmentError('conflict', 'Someone else changed this risk assessment after you opened it. Reload to see their change.', 409)
    }
    const after = await this.db.riskAssessment.findUniqueOrThrow({ where: { id }, include: ROW_INCLUDE })
    const before = `${RISK_LEVEL_LABEL[riskLevel(row.riskScore)]} (${row.riskScore})`
    const now = `${RISK_LEVEL_LABEL[riskLevel(after.riskScore)]} (${after.riskScore})`
    await this.log(caller, m, row.companyId, 'Risk assessment updated', `${after.code} · ${after.hazard}${before === now ? '' : ` · ${before} → ${now}`}`, ctx)
    return this.view(after, today, true)
  }

  /** When the activity stops, or the hazard is gone. Kept, with why. */
  async archive(caller: Caller, id: string, reason: string, ctx: Ctx = {}) {
    const { row, m } = await this.row(caller, id, EDIT_ROLES, 'writing the HIRARC register')
    if (row.archivedAt) return this.view(row, day(todayDate())!, true)
    const why = reason?.trim() ?? ''
    if (why.length < 5) throw new RiskAssessmentError('validation', 'Say why this assessment no longer applies.')
    if (why.length > LIMITS.reason) throw new RiskAssessmentError('validation', `The reason is at most ${LIMITS.reason} characters.`)
    const after = await this.db.riskAssessment.update({
      where: { id },
      data: { archivedAt: new Date(), archivedBy: caller.name, archivedReason: why, version: { increment: 1 } },
      include: ROW_INCLUDE,
    })
    await this.log(caller, m, row.companyId, 'Risk assessment archived', `${row.code} · ${why}`, ctx)
    return this.view(after, day(todayDate())!, true)
  }

  async restore(caller: Caller, id: string, ctx: Ctx = {}) {
    const { row, m } = await this.row(caller, id, EDIT_ROLES, 'writing the HIRARC register')
    if (!row.archivedAt) return this.view(row, day(todayDate())!, true)
    const after = await this.db.riskAssessment.update({
      where: { id },
      data: { archivedAt: null, archivedBy: null, archivedReason: null, version: { increment: 1 } },
      include: ROW_INCLUDE,
    })
    await this.log(caller, m, row.companyId, 'Risk assessment restored', row.code, ctx)
    return this.view(after, day(todayDate())!, true)
  }

  /**
   * A corrective action to put the recommended controls in place: the register's own action,
   * owned, dated and verified like the rest, and linked back to this row so it shows here.
   */
  async raiseAction(caller: Caller, id: string, input: { title?: string; owner?: string; dueDate?: string; priority?: string }) {
    const { row } = await this.row(caller, id, EDIT_ROLES, 'raising actions from the HIRARC register')
    if (row.archivedAt) throw new RiskAssessmentError('validation', 'This risk assessment is archived. Restore it to raise an action from it.')
    if (!row.additionalControls.trim()) {
      throw new RiskAssessmentError('validation', 'Write down the recommended controls first: the action is to put them in place.')
    }
    // The action is to bring the risk down, so it is as urgent as the risk is now.
    const level = riskLevel(row.riskScore)
    const priority: CapaPriority = (['Low', 'Medium', 'High', 'Critical'] as const).includes(input.priority as CapaPriority)
      ? input.priority as CapaPriority
      : ({ high: 'High', medium: 'Medium', low: 'Low' } as const)[level]
    const dueDate = input.dueDate?.trim() || day(row.controlsDue)
    if (!dueDate) throw new RiskAssessmentError('validation', 'Give the action a due date, or set the date for completion on the assessment.')
    return this.incidents.createStandaloneAction(caller, {
      companyId: row.companyId,
      siteId: row.siteId,
      title: input.title?.trim() || `Control: ${row.hazard}`.slice(0, 120),
      detail: `From ${row.code}, ${row.activity}: ${row.hazard}. Recommended controls: ${row.additionalControls}`,
      owner: input.owner?.trim() || row.owner,
      dueDate,
      priority,
      source: 'risk_assessment',
      riskAssessmentId: row.id,
    })
  }

  // ── The form, for a file ───────────────────────────────────────────────────

  /**
   * The register in the DOSH HIRARC form's column order, for printing, sending to a
   * consultant or an auditor, or opening in Excel. Its headers are the ones the CSV import
   * reads, so an exported register can be edited and imported elsewhere.
   */
  async exportCsv(caller: Caller, companyId: string, siteId?: string): Promise<string> {
    const m = this.membership(caller, companyId, VIEW_ROLES, 'reading the HIRARC register')
    if (siteId && m.siteIds.length > 0 && !m.siteIds.includes(siteId)) {
      throw new RiskAssessmentError('forbidden', 'That site is outside the sites you are assigned to.', 403)
    }
    const rows = await this.db.riskAssessment.findMany({
      where: { companyId, archivedAt: null, ...this.siteScope(m), ...(siteId ? { siteId } : {}) },
      include: { site: { select: { name: true } } },
      orderBy: [{ site: { name: 'asc' } }, { activity: 'asc' }, { code: 'asc' }],
    })
    const header = [
      'No', 'Site', 'Work Activity', 'Hazard', 'Which Can Cause', 'Existing Controls', 'Likelihood', 'Severity', 'Risk',
      'Risk Level', 'Recommended Controls', 'PIC', 'Due Date', 'Residual Likelihood', 'Residual Severity', 'Residual Risk',
      'Assessed By', 'Assessed On', 'Next Review',
    ]
    const label = (steps: typeof LIKELIHOOD, v: number | null) => (v === null ? '' : `${v} ${steps.find((s) => s.value === v)?.label ?? ''}`.trim())
    const lines = rows.map((r) => [
      r.code, r.site.name, r.activity, r.hazard, r.effect, r.existingControls,
      label(LIKELIHOOD, r.likelihood), label(SEVERITY, r.severity), r.riskScore, RISK_LEVEL_LABEL[riskLevel(r.riskScore)],
      r.additionalControls, r.owner, dmy(r.controlsDue),
      label(LIKELIHOOD, r.residualLikelihood), label(SEVERITY, r.residualSeverity), r.residualScore ?? '',
      r.assessedBy, dmy(r.assessedOn), dmy(r.reviewDue),
    ].map(csvCell).join(','))
    return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`
  }
}
