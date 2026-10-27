import type { PrismaClient, Role } from '@prisma/client'
import { incidentScopeWhere } from '../domain/access.js'
import { type Caller, membershipOf } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'
import {
  DOSH_LABEL, DOSH_RULES, doshProblem, doshStatus, suggestDosh,
  type DoshCategory, type DoshInput, type DoshStatus, type DoshSuggestion,
} from '../domain/doshNotification.js'

/**
 * DOSH notification for an incident: the decision, the immediate notice, the written report.
 *
 * The rules are domain/doshNotification.ts; this is where they meet the record. Separate
 * from IncidentService for the reason the investigation is: it is a different concern, with
 * a different audience - the regulator - and the incident service is long enough already.
 */
export class DoshError extends DomainError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status)
    this.name = 'DoshError'
  }
}

/**
 * Who may decide whether DOSH is told, and record that it was.
 *
 * Narrower than who may report or investigate: telling a regulator what happened, or that
 * nothing needed telling, is the employer's statement, made by the people who answer for it.
 */
const DECIDE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

/**
 * How far back an undecided incident is still asked about.
 *
 * A decision is owed within days, and incidents filed before SafeChain tracked this were
 * handled outside it. Listing every one of them as "decide" would bury the live question
 * under a backlog nobody can act on. A notifiable one already decided stays listed until
 * its form is recorded, however old.
 */
export const DECIDE_WINDOW_DAYS = 30

const DAY = 86_400_000

const SELECT = {
  id: true, number: true, title: true, companyId: true, siteId: true, type: true, severity: true,
  occurredAt: true, archived: true,
  doshCategory: true, doshDetail: true, doshNotRequiredReason: true, doshDecidedBy: true, doshDecidedAt: true,
  doshClockFrom: true, doshInformedAt: true, doshInformedHow: true, doshOffice: true,
  doshSubmittedAt: true, doshReference: true,
  site: { select: { name: true, timezone: true } },
  people: { where: { role: 'injured' as const }, select: { daysLost: true } },
} as const

type Row = {
  id: string; number: string; title: string; companyId: string; siteId: string; type: string; severity: string
  occurredAt: Date; archived: boolean
  doshCategory: DoshCategory | null; doshDetail: string | null; doshNotRequiredReason: string | null
  doshDecidedBy: string | null; doshDecidedAt: Date | null; doshClockFrom: Date | null
  doshInformedAt: Date | null; doshInformedHow: string | null; doshOffice: string | null
  doshSubmittedAt: Date | null; doshReference: string | null
  site: { name: string; timezone: string }
  people: { daysLost: number | null }[]
}

export interface DoshView {
  incidentId: string
  category: DoshCategory | null
  categoryLabel: string | null
  detail: string | null
  notRequiredReason: string | null
  decidedBy: string | null
  decidedAt: string | null
  clockFrom: string | null
  informedAt: string | null
  informedHow: string | null
  office: string | null
  submittedAt: string | null
  reference: string | null
  suggestion: DoshSuggestion
  status: DoshStatus
  /** The caller may record the decision and the notification. */
  canEdit: boolean
}

const iso = (d: Date | null) => d?.toISOString() ?? null

function viewOf(row: Row, canEdit: boolean, now: Date): DoshView {
  const suggestion = suggestDosh({ type: row.type, severity: row.severity, injured: row.people })
  return {
    incidentId: row.id,
    category: row.doshCategory,
    categoryLabel: row.doshCategory ? DOSH_LABEL[row.doshCategory] : null,
    detail: row.doshDetail,
    notRequiredReason: row.doshNotRequiredReason,
    decidedBy: row.doshDecidedBy,
    decidedAt: iso(row.doshDecidedAt),
    clockFrom: iso(row.doshClockFrom),
    informedAt: iso(row.doshInformedAt),
    informedHow: row.doshInformedHow,
    office: row.doshOffice,
    submittedAt: iso(row.doshSubmittedAt),
    reference: row.doshReference,
    suggestion,
    status: doshStatus({
      category: row.doshCategory, occurredAt: row.occurredAt, clockFrom: row.doshClockFrom,
      informedAt: row.doshInformedAt, submittedAt: row.doshSubmittedAt,
    }, suggestion.flagged, now, row.site.timezone),
    canEdit,
  }
}

const trimmed = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)
const sameInstant = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null)
const fmtDay = (d: Date, tz: string) =>
  d.toLocaleString('en-MY', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export class DoshService {
  constructor(private db: PrismaClient) {}

  private async rowFor(caller: Caller, incidentId: string): Promise<Row> {
    const row = await this.db.incident.findUnique({ where: { id: incidentId }, select: SELECT }) as Row | null
    if (!row || row.archived) throw new DoshError('not_found', 'Incident not found.', 404)
    // Another workspace's incident is "not found", exactly as IncidentService.get answers.
    if (!caller.roles.some((r) => r.companyId === row.companyId)) {
      throw new DoshError('not_found', 'Incident not found.', 404)
    }
    const visible = await this.db.incident.findFirst({
      where: { id: incidentId, ...incidentScopeWhere(caller, row.companyId) }, select: { id: true },
    })
    if (!visible) throw new DoshError('forbidden', 'You do not have access to this incident.', 403)
    return row
  }

  private canEdit(caller: Caller, companyId: string) {
    return DECIDE_ROLES.includes(membershipOf(caller, companyId, DoshError).role)
  }

  async get(caller: Caller, incidentId: string, now = new Date()): Promise<DoshView> {
    const row = await this.rowFor(caller, incidentId)
    return viewOf(row, this.canEdit(caller, row.companyId), now)
  }

  /**
   * Record the decision and, as they happen, the immediate notice and the written report.
   *
   * The whole record each time, not a patch: the card edits it as one form, so a field left
   * empty is a field cleared. Every change lands on the incident's timeline in the same
   * transaction, so the case file says who decided, when DOSH was told and what reference
   * they gave - which is what an inspector asks to see.
   */
  async save(
    caller: Caller, incidentId: string, input: DoshInput,
    ctx: { ip?: string; device?: string } = {}, now = new Date(),
  ): Promise<DoshView> {
    const row = await this.rowFor(caller, incidentId)
    const m = membershipOf(caller, row.companyId, DoshError)
    if (!DECIDE_ROLES.includes(m.role)) {
      throw new DoshError('forbidden', 'Deciding whether DOSH is told is for an HSE Manager, Safety Officer or Admin.', 403)
    }
    const problem = doshProblem(input, { occurredAt: row.occurredAt, now })
    if (problem) throw new DoshError('validation', problem)

    const rule = DOSH_RULES[input.category]
    const next = {
      doshCategory: input.category,
      doshDetail: trimmed(input.detail),
      doshNotRequiredReason: input.category === 'not_notifiable' ? trimmed(input.notRequiredReason) : null,
      doshClockFrom: input.clockFrom ?? null,
      doshInformedAt: rule.notifiable ? input.informedAt ?? null : null,
      doshInformedHow: rule.notifiable ? trimmed(input.informedHow) : null,
      doshOffice: rule.notifiable ? trimmed(input.office) : null,
      doshSubmittedAt: rule.notifiable ? input.submittedAt ?? null : null,
      doshReference: rule.notifiable ? trimmed(input.reference) : null,
    }
    const decided = row.doshCategory !== input.category

    const events: { action: string; detail: string | null }[] = []
    if (decided) {
      events.push({
        action: input.category === 'not_notifiable' ? 'DOSH: not notifiable' : `DOSH: ${DOSH_LABEL[input.category]}`,
        detail: next.doshNotRequiredReason ?? next.doshDetail,
      })
    }
    const tz = row.site.timezone
    if (next.doshInformedAt && !sameInstant(row.doshInformedAt, next.doshInformedAt)) {
      const how = [next.doshInformedHow, next.doshOffice].filter(Boolean).join(', ')
      events.push({ action: 'DOSH told', detail: `${fmtDay(next.doshInformedAt, tz)}${how ? ` · ${how}` : ''}` })
    }
    if (next.doshSubmittedAt && !sameInstant(row.doshSubmittedAt, next.doshSubmittedAt)) {
      events.push({
        action: `${rule.form} sent to DOSH`,
        detail: `${fmtDay(next.doshSubmittedAt, tz)}${next.doshReference ? ` · ref ${next.doshReference}` : ''}`,
      })
    } else if (next.doshReference && next.doshReference !== row.doshReference) {
      events.push({ action: 'DOSH reference recorded', detail: next.doshReference })
    }

    await this.db.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id: incidentId },
        data: {
          ...next,
          ...(decided ? { doshDecidedBy: caller.name, doshDecidedAt: now } : {}),
          version: { increment: 1 },
        },
      })
      for (const e of events) {
        await tx.incidentEvent.create({
          data: { incidentId, action: e.action, detail: e.detail, actor: caller.name, actorRole: m.role },
        })
      }
    })
    await this.db.adminAuditEntry.create({
      data: {
        companyId: row.companyId, actor: caller.name, actorRole: m.role,
        action: 'DOSH notification recorded', module: 'incidents', target: row.number,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
    return this.get(caller, incidentId, now)
  }

  /**
   * What is owed to DOSH across the workspace, soonest first: decisions not yet made on
   * recent incidents that point at a duty, and notifiable incidents whose written report,
   * or immediate notice, is not recorded.
   */
  async outstanding(caller: Caller, companyId: string, now = new Date()) {
    membershipOf(caller, companyId, DoshError)
    const notifiable = (Object.keys(DOSH_RULES) as DoshCategory[]).filter((c) => DOSH_RULES[c].notifiable)
    const rows = await this.db.incident.findMany({
      where: {
        // The workspace, then the caller's view of it. The scope alone is empty for an HSE
        // Manager, which would be every workspace they belong to.
        companyId,
        ...incidentScopeWhere(caller, companyId),
        archived: false,
        OR: [
          { doshCategory: { in: notifiable }, OR: [{ doshSubmittedAt: null }, { doshInformedAt: null }] },
          { doshCategory: null, occurredAt: { gte: new Date(now.getTime() - DECIDE_WINDOW_DAYS * DAY) } },
        ],
      },
      select: SELECT,
      orderBy: { occurredAt: 'asc' },
      take: 500,
    }) as Row[]

    const canEdit = this.canEdit(caller, companyId)
    return rows
      .map((r) => ({ row: r, view: viewOf(r, canEdit, now) }))
      .filter(({ view }) => ['decide', 'due', 'overdue'].includes(view.status.state) || view.status.immediateOutstanding)
      .sort((a, b) => (a.view.status.dueDate ?? '9999').localeCompare(b.view.status.dueDate ?? '9999'))
      .map(({ row, view }) => ({
        incidentId: row.id,
        number: row.number,
        title: row.title,
        siteName: row.site.name,
        occurredAt: row.occurredAt.toISOString(),
        category: view.category,
        categoryLabel: view.categoryLabel,
        state: view.status.state,
        form: view.status.form,
        dueDate: view.status.dueDate,
        daysLeft: view.status.daysLeft,
        immediateOutstanding: view.status.immediateOutstanding,
        reason: view.suggestion.reason,
      }))
  }
}
