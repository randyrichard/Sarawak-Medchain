import type { Prisma, PrismaClient, Role } from '@prisma/client'
import { AuthError } from './authService.js'
import { enqueueEvent } from './webhookService.js'
import {
  INCIDENT_SEVERITIES, INCIDENT_TYPES, LOST_TIME_SEVERITIES, SEVERITY_RANK,
} from './incidentCatalog.js'
import { DomainError } from '../domain/errors.js'
import { stageGateProblem } from '../domain/incidentStageGate.js'
import { recentLocalMonths } from '../domain/businessDay.js'
import { membershipOf, type Caller } from '../domain/caller.js'
import { resolveOwnerId } from './actionOwner.js'
import {
  incidentScopeWhere, isOwnedBy, overdueActionWhere, ownedByWhere, startOfToday,
} from '../domain/access.js'

/** Roles permitted to triage and progress an investigation. */
const MANAGE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']
/** Roles permitted to review, verify and close. */
const REVIEW_ROLES: Role[] = ['admin', 'hse_manager']


export class IncidentError extends DomainError {}

/**
 * An inclusive date range over a timestamp column.
 *
 * `to` is pushed to the end of that day. A range of 1st-1st that matched nothing because
 * the incident happened at 09:14 and the filter asked for exactly midnight is the kind of
 * thing that makes people stop trusting the filters.
 */
function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const gte = from ? new Date(from) : undefined
  const lte = to ? new Date(to) : undefined
  if (gte && Number.isNaN(gte.getTime())) return undefined
  if (lte && Number.isNaN(lte.getTime())) return undefined
  if (lte) lte.setUTCHours(23, 59, 59, 999)
  if (!gte && !lte) return undefined
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

/** What an `action.*` webhook carries. One shape, so both raising paths agree. */
function actionPayload(a: {
  id: string; code: string; title: string; owner: string; dueDate: Date
  priority: string; status: string; siteId: string; incidentId: string | null
}): Record<string, unknown> {
  return {
    id: a.id,
    code: a.code,
    title: a.title,
    owner: a.owner,
    dueDate: a.dueDate.toISOString(),
    priority: a.priority,
    status: a.status,
    siteId: a.siteId,
    incidentId: a.incidentId,
  }
}

export interface ListParams {
  companyId: string
  page: number
  pageSize: number
  q?: string
  type?: string
  severity?: string
  stage?: string
  status?: IncidentStatusFilter
  siteId?: string
  department?: string
  investigator?: string
  /** Inclusive, on the date the incident happened - not the date it was typed in. */
  from?: string
  to?: string
  anonymous?: boolean
  emergencyResponse?: boolean
  shift?: string
  sort?: SortKey
}

/**
 * What the register may be ordered by.
 *
 * An allow-list, not a field name off the query string: passing a caller-supplied column
 * into orderBy is how a sort parameter becomes a way to probe columns it was never meant
 * to reach. Every entry names real columns and ends in a unique tiebreak, because a sort
 * without one makes pagination non-deterministic - the same row can appear on two pages
 * while another appears on none.
 */
export const SORT_KEYS = [
  'priority', 'newest', 'oldest', 'severity', 'updated', 'site', 'type', 'status',
] as const
export type SortKey = (typeof SORT_KEYS)[number]

const SORT_ORDER: Record<SortKey, Prisma.IncidentOrderByWithRelationInput[]> = {
  /*
   * The default, and the reason it is not simply "newest": an HSE manager opening the
   * board needs the serious open incidents at the top, not whatever was typed in last.
   * Severity first, then the oldest of those - a serious incident sitting untouched for
   * three weeks is more urgent than one reported this morning.
   */
  priority: [{ severityRank: 'desc' }, { occurredAt: 'asc' }, { id: 'desc' }],
  newest: [{ occurredAt: 'desc' }, { id: 'desc' }],
  oldest: [{ occurredAt: 'asc' }, { id: 'asc' }],
  severity: [{ severityRank: 'desc' }, { occurredAt: 'desc' }, { id: 'desc' }],
  updated: [{ updatedAt: 'desc' }, { id: 'desc' }],
  site: [{ siteId: 'asc' }, { occurredAt: 'desc' }, { id: 'desc' }],
  type: [{ type: 'asc' }, { occurredAt: 'desc' }, { id: 'desc' }],
  status: [{ stage: 'asc' }, { severityRank: 'desc' }, { id: 'desc' }],
}

/**
 * The status chips on the incident register.
 *
 * These are views over stage and age, not stored values. All seven must be understood
 * here: an unknown one used to fail validation at the route and the list silently came
 * back empty, which read as "the filter is broken" rather than "the server rejected it".
 */
export const INCIDENT_STATUS_FILTERS = [
  'all', 'open', 'closed', 'high_risk', 'investigating', 'awaiting_review', 'overdue', 'archived',
] as const
export type IncidentStatusFilter = (typeof INCIDENT_STATUS_FILTERS)[number]

/** An open incident older than this reads as overdue. Matches the register's chip label. */
export const OVERDUE_AFTER_DAYS = 14

const ORDERED_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed',
] as const

/**
 * Stage groupings behind two of the chips. "Investigating" covers the evidence-gathering
 * stages and "awaiting review" the two sign-off stages, so a case sitting with a reviewer
 * is not reported as still under investigation.
 */
/*
 * Exported so the dashboard counts the same thing this module does. Two definitions of
 * "under investigation" is two different numbers on two screens a click apart.
 */
export const INVESTIGATING_STAGES = ['investigation', 'rca'] as const
export const AWAITING_REVIEW_STAGES = ['review', 'verification'] as const

/**
 * Translates a status chip into a WHERE clause.
 *
 * Every chip except "all" narrows to something, so a filter the server does not
 * understand can never quietly behave like "show everything".
 */
function statusWhere(status: IncidentStatusFilter | undefined): Prisma.IncidentWhereInput {
  switch (status) {
    case 'open': return { stage: { not: 'closed' } }
    case 'closed': return { stage: 'closed' }
    case 'high_risk': return { highRisk: true, stage: { not: 'closed' } }
    case 'investigating': return { stage: { in: INVESTIGATING_STAGES as never } }
    case 'awaiting_review': return { stage: { in: AWAITING_REVIEW_STAGES as never } }
    case 'overdue': return {
      stage: { not: 'closed' },
      reportedAt: { lt: new Date(Date.now() - OVERDUE_AFTER_DAYS * 86400_000) },
    }
    // The archived flag is applied on the base where clause, so this chip adds nothing.
    case 'archived': return {}
    default: return {}
  }
}

/** An action with its parent incident flattened to the number, title and department. */
function withIncidentRef<A extends { incident: { number: string; title: string; department: string } | null }>(
  { incident, ...a }: A,
): Omit<A, 'incident'> & { incidentNumber: string | null; incidentTitle: string | null; department: string } {
  return { ...a, incidentNumber: incident?.number ?? null, incidentTitle: incident?.title ?? null, department: incident?.department ?? '' }
}

export class IncidentService {
  constructor(private db: PrismaClient) {}

  /**
   * The caller's membership in a company. Everything else derives from this, so a caller
   * with no membership simply cannot address the tenant — the check is not skippable by
   * passing a different companyId, because we look it up rather than trust it.
   */
  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, IncidentError)
  }


  private requireRole(caller: Caller, companyId: string, allowed: Role[]) {
    const m = this.membership(caller, companyId)
    if (!allowed.includes(m.role)) {
      throw new IncidentError('forbidden', 'Your role does not permit this action.', 403)
    }
    return m
  }

  /**
   * Row-level scoping. A supervisor or employee sees only their own sites; an employee
   * additionally sees only what they reported. Applied as a WHERE clause so restricted
   * rows never leave the database, rather than being filtered in the client.
   */
  private scopeWhere(caller: Caller, companyId: string): Prisma.IncidentWhereInput {
    return incidentScopeWhere(caller, companyId)
  }

  async list(caller: Caller, p: ListParams) {
    this.membership(caller, p.companyId)

    const where: Prisma.IncidentWhereInput = {
      companyId: p.companyId,
      // Archived rows are hidden from every other view, and visible only when explicitly
      // asked for. Archiving is reversible bookkeeping, not deletion, so the register has
      // to be able to show what was archived — otherwise the audit trail points at rows
      // nobody can reach.
      archived: p.status === 'archived',
      ...this.scopeWhere(caller, p.companyId),
      ...(p.siteId ? { siteId: p.siteId } : {}),
      ...(p.type ? { type: p.type as never } : {}),
      ...(p.severity ? { severity: p.severity as never } : {}),
      ...(p.stage ? { stage: p.stage as never } : {}),
      ...(p.department ? { department: { equals: p.department, mode: 'insensitive' } } : {}),
      ...(p.shift ? { shift: { equals: p.shift, mode: 'insensitive' } } : {}),
      ...(p.anonymous === undefined ? {} : { anonymous: p.anonymous }),
      ...(p.emergencyResponse === undefined
        ? {}
        : { emergencyResponseActivated: p.emergencyResponse }),
      /*
       * The investigator filter matches either field. An incident can carry a triage
       * investigator and a separate lead once the investigation proper starts, and
       * somebody filtering by their own name means "mine" - not "mine, but only if I was
       * assigned in the right one of two columns".
       */
      ...(p.investigator
        ? {
            OR: [
              { investigator: { contains: p.investigator, mode: 'insensitive' } },
              { leadInvestigator: { contains: p.investigator, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Filtered on when it happened, not when it was reported: a late report of a
      // Tuesday incident belongs to Tuesday.
      ...(dateRange(p.from, p.to) ? { occurredAt: dateRange(p.from, p.to) } : {}),
      ...statusWhere(p.status),
      ...(p.q
        ? {
            OR: [
              { number: { contains: p.q, mode: 'insensitive' } },
              { title: { contains: p.q, mode: 'insensitive' } },
              { location: { contains: p.q, mode: 'insensitive' } },
              { reporter: { contains: p.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    // Count and page in one round trip; the client needs both to render pagination.
    const [total, rows] = await this.db.$transaction([
      this.db.incident.count({ where }),
      this.db.incident.findMany({
        where,
        orderBy: SORT_ORDER[p.sort ?? 'priority'],
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
    ])

    return {
      // Masked here too. A register that lists the reporter defeats the point of the
      // anonymous flag entirely, and the list is where most people would see it.
      rows: rows.map((r) => this.maskAnonymous(caller, r)),
      page: p.page,
      pageSize: p.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
    }
  }

  async get(caller: Caller, id: string) {
    const incident = await this.db.incident.findUnique({
      where: { id },
      include: {
        // Two events written in the same transaction share a timestamp, so `at` alone is
        // a tie and Postgres may return them either way round - a case file that reads
        // "action verified" before "action completed". The id breaks the tie in insertion
        // order. Same fix as the visitor and equipment histories.
        events: { orderBy: [{ at: 'desc' }, { id: 'desc' }] },
        comments: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
        actions: { orderBy: { dueDate: 'asc' } },
      },
    })
    if (!incident || incident.archived) {
      throw new IncidentError('not_found', 'Incident not found.', 404)
    }
    /*
     * Another tenant's incident is "not found", not "forbidden".
     *
     * Answering 403 here while an unknown id answers 404 tells a caller which ids are real
     * somewhere else in the system - an enumeration oracle, and inconsistent with the
     * organisation console, which has always returned 404 for another tenant's rows.
     *
     * Within a workspace the caller is a member of, 403 is still right: they know the
     * workspace exists, and being told an incident is out of their scope is useful rather
     * than leaky.
     */
    if (!caller.roles.some((r) => r.companyId === incident.companyId)) {
      throw new IncidentError('not_found', 'Incident not found.', 404)
    }

    // Re-apply scoping to a direct fetch: a guessed id must not bypass row-level access.
    const scope = this.scopeWhere(caller, incident.companyId)
    const visible = await this.db.incident.findFirst({
      where: { id, ...scope },
      select: { id: true },
    })
    if (!visible) throw new IncidentError('forbidden', 'You do not have access to this incident.', 403)
    return this.maskAnonymous(caller, incident)
  }

  /**
   * Withhold the reporter on an anonymous report.
   *
   * The columns are still written - somebody has to be able to follow up on a serious
   * allegation, and an anonymous channel that keeps no record at all cannot be audited.
   * They are stripped on the way out for everyone below HSE manager, which is the promise
   * actually made to the person reporting.
   */
  private maskAnonymous<T extends { companyId: string; anonymous: boolean; reporter: string; reporterId: string | null }>(
    caller: Caller, incident: T,
  ): T {
    if (!incident.anonymous) return incident
    const role = caller.roles.find((r) => r.companyId === incident.companyId)?.role
    if (role && REVIEW_ROLES.includes(role)) return incident
    const hidden = 'Reported anonymously'
    const who = incident.reporter
    const whoId = incident.reporterId
    const out: T = { ...incident, reporter: hidden, reporterId: null }
    /*
     * The reporter's own entries in the activity log and the evidence list too. The header
     * said "Reported anonymously" while the log beneath it said "Incident reported - <name>,
     * employee", to everyone who could open the incident.
     */
    const parts = incident as T & {
      events?: { actor: string; actorRole: string }[]
      attachments?: { uploadedBy: string; uploadedById: string | null }[]
    }
    const target = out as typeof parts
    if (parts.events) {
      target.events = parts.events.map((e) => (e.actor === who ? { ...e, actor: hidden, actorRole: '' } : e))
    }
    if (parts.attachments) {
      target.attachments = parts.attachments.map((a) =>
        (whoId && a.uploadedById === whoId) || a.uploadedBy === who ? { ...a, uploadedBy: hidden, uploadedById: null } : a)
    }
    return out
  }

  /**
   * Allocates the next INC number and creates the incident in one transaction, so two
   * simultaneous reports cannot be handed the same reference.
   */
  async create(caller: Caller, input: {
    companyId: string
    siteId: string
    title: string
    description?: string
    type: string
    severity: string
    department?: string
    location: string
    gps?: string
    immediateActions?: string
    occurredAt: string
    departmentId?: string
    weather?: string
    shift?: string
    emergencyResponseActivated?: boolean
    /// Reported without attribution. The reporter is still recorded - somebody has to be
    /// able to follow up - but withheld from anyone below HSE manager on the way out.
    anonymous?: boolean
    /// Idempotency key from the reporting browser. See the clientRef handling below.
    clientRef?: string
  }) {
    this.membership(caller, input.companyId) // any member may report

    if (!input.title?.trim()) throw new IncidentError('validation', 'A title is required.')
    if (!input.location?.trim()) throw new IncidentError('validation', 'A location is required.')

    /*
     * Idempotency, for reports filed offline and replayed later.
     *
     * A phone on a site loses signal mid-submit, queues the report, and sends it again when
     * it can. The retry cannot distinguish "never arrived" from "arrived, committed, and the
     * response was lost coming back" - so without a key the second case files the injury a
     * second time. Not a cosmetic duplicate: it double-counts in the incident statistics and
     * in whatever is reported to DOSH from them.
     *
     * Checked here and caught again after the insert, because a check and an insert are not
     * atomic. This lookup covers the ordinary replay, minutes or hours later; the catch
     * covers two copies of one queued report arriving together, which is what happens when a
     * phone regains signal with the app open in more than one tab.
     */
    if (input.clientRef) {
      const already = await this.db.incident.findFirst({
        where: { companyId: input.companyId, clientRef: input.clientRef },
      })
      if (already) return already
    }

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new IncidentError('validation', 'Unknown site for this workspace.')

    if (!INCIDENT_TYPES.some((t) => t.value === input.type)) {
      throw new IncidentError('validation', 'Unknown incident type.')
    }
    if (!INCIDENT_SEVERITIES.some((sv) => sv.value === input.severity)) {
      throw new IncidentError('validation', 'Unknown severity.')
    }

    // The department is kept as text as well as a link, so renaming or removing a
    // department does not rewrite what the report said at the time.
    let departmentName = input.department?.trim() ?? ''
    if (input.departmentId) {
      const dept = await this.db.department.findFirst({
        // Departments hang off a site, so the workspace check goes through the site.
        where: { id: input.departmentId, site: { companyId: input.companyId } },
        select: { name: true },
      })
      if (!dept) throw new IncidentError('validation', 'Unknown department for this workspace.')
      departmentName = dept.name
    }

    try {
      const created = await this.createInTransaction(caller, input, departmentName)
      /*
       * Queued for any webhook subscribed to it, after the record is committed and without
       * being awaited on the caller's behalf. Reporting an incident must not wait on, or be
       * failed by, a notification - the record is the product and the webhook is a
       * courtesy. `enqueueEvent` swallows its own failures for the same reason.
       *
       * Deliberately not on the raced path below: that returns an incident somebody else
       * already filed, and it was announced when they filed it. Announcing it twice would
       * make an offline browser's replay look like a second injury.
       */
      await enqueueEvent(this.db, input.companyId, 'incident.created', {
        id: created.id,
        number: created.number,
        title: created.title,
        type: created.type,
        severity: created.severity,
        siteId: created.siteId,
        location: created.location,
        occurredAt: created.occurredAt.toISOString(),
        // Withheld on an anonymous report, exactly as it is withheld from the screen. A
        // webhook is read by whatever system is on the other end, which is further from
        // the HSE function than anyone `maskAnonymous` already hides it from.
        reporter: created.anonymous ? null : created.reporter,
      })
      return created
    } catch (e) {
      // Someone else committed the same queued report first. Their row is the one that
      // exists, so return it: the caller asked for this report to be filed, and it is.
      if (input.clientRef && (e as { code?: string }).code === 'P2002') {
        const raced = await this.db.incident.findFirst({
          where: { companyId: input.companyId, clientRef: input.clientRef },
        })
        if (raced) return raced
      }
      throw e
    }
  }

  /** The insert itself, split out only so the clientRef race above has something to wrap. */
  private async createInTransaction(
    caller: Caller,
    input: Parameters<IncidentService['create']>[1],
    departmentName: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'incident' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'incident', next: 2601 },
        select: { next: true },
      })
      const number = `INC-${counter.next}`

      const incident = await tx.incident.create({
        data: {
          number,
          companyId: input.companyId,
          siteId: input.siteId,
          title: input.title.trim(),
          description: input.description?.trim() ?? '',
          type: input.type as never,
          severity: input.severity as never,
          // Maintained here so the column can never disagree with the severity beside it.
          severityRank: SEVERITY_RANK[input.severity as never] ?? 0,
          department: departmentName,
          departmentId: input.departmentId ?? null,
          location: input.location.trim(),
          gps: input.gps,
          immediateActions: input.immediateActions ?? '',
          weather: input.weather?.trim() ?? '',
          shift: input.shift?.trim() ?? '',
          emergencyResponseActivated: input.emergencyResponseActivated ?? false,
          anonymous: input.anonymous ?? false,
          reporter: caller.name,
          reporterId: caller.userId,
          occurredAt: new Date(input.occurredAt),
          clientRef: input.clientRef ?? null,
        },
      })

      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          action: 'Incident reported',
          detail: `${input.type} · ${input.severity}`,
          actor: caller.name,
          actorRole: this.membership(caller, input.companyId).role,
        },
      })

      return incident
    })
  }

  /**
   * Stage transition. Only forward moves along the defined sequence are accepted, and the
   * role required depends on the target — review and closure need a manager.
   */
  async advance(caller: Caller, id: string, payload: {
    to: string
    note?: string
    investigator?: string
    findings?: string
    riskRating?: string
    potentialSeverity?: string
    expectedVersion?: number
  }) {
    const current = await this.db.incident.findUnique({ where: { id } })
    if (!current) throw new IncidentError('not_found', 'Incident not found.', 404)

    const needsReview = ['review', 'verification', 'closed'].includes(payload.to)
    const m = this.requireRole(caller, current.companyId, needsReview ? REVIEW_ROLES : MANAGE_ROLES)

    const fromIdx = ORDERED_STAGES.indexOf(current.stage as never)
    const toIdx = ORDERED_STAGES.indexOf(payload.to as never)
    if (toIdx === -1) throw new IncidentError('validation', 'Unknown stage.')
    if (toIdx <= fromIdx) {
      throw new IncidentError('validation', 'An investigation cannot move backwards.')
    }
    if (toIdx > fromIdx + 1) {
      throw new IncidentError('validation', 'Stages must be completed in order.')
    }

    // Optimistic concurrency: reject a write based on a stale read rather than
    // silently overwriting a colleague's update.
    if (payload.expectedVersion !== undefined && payload.expectedVersion !== current.version) {
      throw new IncidentError(
        'conflict',
        'This incident was updated by someone else. Reload to see the latest version.',
        409,
      )
    }

    // What the stage needs before it may be entered (domain/incidentStageGate.ts).
    const actions = await this.db.correctiveAction.findMany({ where: { incidentId: id }, select: { status: true } })
    const problem = stageGateProblem(payload.to, {
      investigator: payload.investigator ?? current.investigator,
      findings: payload.findings ?? current.findings,
      note: payload.note ?? null,
      causes: Array.isArray(current.rcaCauses) ? current.rcaCauses : [],
      rootStatement: (current.rcaFiveWhys as { rootStatement?: string } | null)?.rootStatement ?? null,
      actions,
    })
    if (problem) throw new IncidentError('validation', problem)

    await this.db.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id },
        data: {
          stage: payload.to as never,
          version: { increment: 1 },
          ...(payload.investigator ? { investigator: payload.investigator } : {}),
          ...(payload.findings ? { findings: payload.findings } : {}),
          ...(payload.riskRating ? { riskRating: payload.riskRating } : {}),
          ...(payload.potentialSeverity
            ? {
                potentialSeverity: payload.potentialSeverity as never,
                /*
                 * By rank, not by a hardcoded pair. This read ['Serious', 'Critical'],
                 * which predates the outcome-based severities - so an incident whose
                 * potential outcome was a fatality or a catastrophe was not flagged as
                 * high risk, while a legacy Serious was. Anything at or above Serious.
                 */
                highRisk: (SEVERITY_RANK[payload.potentialSeverity as never] ?? 0)
                  >= SEVERITY_RANK.Serious,
              }
            : {}),
          ...(payload.to === 'closed' ? { closedAt: new Date(), closeNote: payload.note } : {}),
        },
      })

      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          action: `Moved to ${payload.to}`,
          detail: payload.note,
          actor: caller.name,
          actorRole: m.role,
        },
      })

      return updated
    })

    if (payload.to === 'closed') {
      await enqueueEvent(this.db, current.companyId, 'incident.closed', {
        id: current.id,
        number: current.number,
        title: current.title,
        severity: current.severity,
        siteId: current.siteId,
        closedBy: caller.name,
        closeNote: payload.note ?? null,
      })
    }

    // Re-read with relations. The transaction returns the bare row, and the detail screen
    // renders whatever it is handed — so returning it directly made a case's corrective
    // actions, comments and attachments vanish from the screen on every stage change. The
    // rows were never touched, but "my actions disappeared" is indistinguishable from data
    // loss to the person watching.
    return this.get(caller, id)
  }


  // ── Comments ───────────────────────────────────────────────────────────────

  /** Any member who can see the incident may comment; visibility is the access check. */
  async addComment(caller: Caller, incidentId: string, body: string, mentions: string[] = []) {
    const incident = await this.get(caller, incidentId)
    if (!body?.trim()) throw new IncidentError('validation', 'A comment cannot be empty.')

    const comment = await this.db.incidentComment.create({
      data: {
        incidentId: incident.id,
        body: body.trim(),
        author: caller.name,
        authorId: caller.userId,
        mentions,
      },
    })
    await this.db.incidentEvent.create({
      data: {
        incidentId: incident.id,
        action: 'Comment added',
        detail: body.trim().slice(0, 140),
        actor: caller.name,
        actorRole: this.membership(caller, incident.companyId).role,
      },
    })
    return comment
  }

  // ── Attachments ────────────────────────────────────────────────────────────

  async addAttachment(caller: Caller, incidentId: string, file: {
    originalName: string
    storedName: string
    mimeType: string
    sizeBytes: number
    /// SHA-256 of the bytes as written. See lib/fileIntegrity.ts.
    checksum?: string
    /// The corrective action this file proves, when it is evidence for one. Null attaches
    /// it to the incident generally.
    actionId?: string
  }) {
    const incident = await this.get(caller, incidentId)

    // A file offered as proof of an action has to belong to this incident's action, not
    // to one on somebody else's case.
    let action: { id: string; code: string } | null = null
    if (file.actionId) {
      action = await this.db.correctiveAction.findFirst({
        where: { id: file.actionId, incidentId: incident.id },
        select: { id: true, code: true },
      })
      if (!action) {
        throw new IncidentError('validation', 'That corrective action is not on this incident.')
      }
    }

    const { actionId, ...rest } = file
    const att = await this.db.incidentAttachment.create({
      data: {
        incidentId: incident.id, ...rest,
        actionId: action?.id ?? null,
        uploadedBy: caller.name, uploadedById: caller.userId,
      },
    })
    await this.db.incidentEvent.create({
      data: {
        incidentId: incident.id,
        action: 'Evidence uploaded',
        detail: file.originalName + ' (' + Math.round(file.sizeBytes / 1024) + ' KB)'
          + (action ? ' for ' + action.code : ''),
        actor: caller.name,
        actorRole: this.membership(caller, incident.companyId).role,
      },
    })
    return att
  }

  /** Resolves an attachment only if the caller may see its parent incident. */
  async getAttachment(caller: Caller, attachmentId: string) {
    const att = await this.db.incidentAttachment.findUnique({ where: { id: attachmentId } })
    if (!att) throw new IncidentError('not_found', 'Attachment not found.', 404)
    await this.get(caller, att.incidentId) // throws 403/404 when not visible
    return att
  }

  // ── Corrective actions (CAPA) ──────────────────────────────────────────────

  async addAction(caller: Caller, incidentId: string, input: {
    title: string
    detail?: string
    owner: string
    ownerId?: string
    dueDate: string
    priority?: string
    /// Decided when the action is raised, not after the fact: deciding later that proof
    /// was needed is how actions get closed on a promise.
    evidenceRequired?: boolean
  }) {
    const incident = await this.get(caller, incidentId)
    this.requireRole(caller, incident.companyId, MANAGE_ROLES)
    if (!input.title?.trim()) throw new IncidentError('validation', 'An action title is required.')
    if (!input.owner?.trim()) throw new IncidentError('validation', 'Every action needs an owner.')
    const due = new Date(input.dueDate)
    if (Number.isNaN(due.getTime())) {
      throw new IncidentError('validation', 'A valid target completion date is required.')
    }

    const raised = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: incident.companyId, kind: 'capa' } },
        update: { next: { increment: 1 } },
        create: { companyId: incident.companyId, kind: 'capa', next: 401 },
        select: { next: true },
      })
      const action = await tx.correctiveAction.create({
        data: {
          code: 'CA-' + counter.next,
          incidentId: incident.id,
          companyId: incident.companyId,
          siteId: incident.siteId,
          title: input.title.trim(),
          detail: input.detail?.trim() ?? '',
          owner: input.owner.trim(),
          ownerId: await resolveOwnerId(tx, incident.companyId, input.owner, input.ownerId),
          dueDate: due,
          priority: (input.priority ?? 'Medium') as never,
          evidenceRequired: input.evidenceRequired ?? false,
          createdBy: caller.name,
        },
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          action: 'Corrective action raised',
          detail: action.code + ' - ' + action.title + ' (owner ' + action.owner + ')'
            + (action.evidenceRequired ? ', evidence required' : ''),
          actor: caller.name,
          actorRole: this.membership(caller, incident.companyId).role,
        },
      })

      // Addressed to the owner, not shouted at the workspace. An action assigned to
      // somebody who never learns of it is how a due date passes unnoticed.
      await tx.notification.create({
        data: {
          companyId: incident.companyId,
          kind: 'action',
          title: 'Corrective action assigned: ' + action.code,
          detail: action.title + '. Due ' + due.toISOString().slice(0, 10)
            + (action.evidenceRequired ? '. Evidence required before it can be completed.' : '.'),
          href: '/actions?open=' + action.id,
          recipientUserId: action.ownerId,
          recipientName: action.owner,
          recipientRole: 'capa_owner',
        },
      })
      return action
    })

    await enqueueEvent(this.db, incident.companyId, 'action.assigned', actionPayload(raised))
    return raised
  }

  /**
   * Progress update.
   *
   * The owner may move their own action forward and supply evidence. Verification is
   * deliberately not self-service: only a manager can verify, so the person who did the
   * work cannot also sign it off.
   */
  async updateAction(caller: Caller, actionId: string, patch: {
    status?: string
    evidenceNote?: string
    dueDate?: string
    expectedVersion?: number
  }) {
    const action = await this.db.correctiveAction.findUnique({ where: { id: actionId } })
    if (!action || !caller.roles.some((r) => r.companyId === action.companyId)) {
      throw new IncidentError('not_found', 'Action not found.', 404)
    }

    const m = this.membership(caller, action.companyId)
    const isOwner = isOwnedBy(action, caller)
    const isManager = REVIEW_ROLES.includes(m.role)

    if (!isOwner && !MANAGE_ROLES.includes(m.role)) {
      throw new IncidentError('forbidden', 'You can only update actions assigned to you.', 403)
    }
    if (patch.status === 'verified' && !isManager) {
      throw new IncidentError('forbidden', 'Verification requires an HSE Manager or Admin.', 403)
    }
    if (patch.status === 'cancelled' && !isManager) {
      throw new IncidentError('forbidden', 'Cancelling an action requires an HSE Manager or Admin.', 403)
    }
    if (patch.status === 'completed' && !patch.evidenceNote?.trim() && !action.evidenceNote) {
      throw new IncidentError('validation', 'Describe the evidence before marking this complete.')
    }

    /*
     * Evidence that was demanded when the action was raised has to actually exist.
     *
     * A note is a claim - "guard refitted" - and a file is proof of it. Where somebody
     * decided at the outset that proof would be needed, a note is not a substitute, and
     * closing on one is how corrective actions stop meaning anything. Enforced here rather
     * than on the screen: the screen can be skipped.
     */
    if (patch.status === 'completed' && action.evidenceRequired) {
      const files = await this.db.incidentAttachment.count({ where: { actionId: action.id } })
      if (files === 0) {
        throw new IncidentError(
          'validation',
          'Evidence is required before this corrective action can be completed. Upload a photo or document first.',
        )
      }
    }

    /*
     * Reopening a settled action.
     *
     * Verification can be wrong — the evidence looked right and the guard is still off. The
     * alternative to reopening is raising a duplicate, which loses the history of the first
     * attempt and quietly double-counts the work in every report. Restricted to managers,
     * because it undoes a manager's sign-off, and the sign-off fields are cleared so a
     * reopened action cannot show as verified while sitting open.
     */
    const isReopening = ['open', 'in_progress'].includes(patch.status ?? '')
      && ['verified', 'completed', 'cancelled'].includes(action.status)
    if (isReopening && !isManager) {
      throw new IncidentError('forbidden', 'Reopening a settled action requires an HSE Manager or Admin.', 403)
    }
    if (patch.dueDate && !isManager) {
      throw new IncidentError('forbidden', 'Changing the target date requires an HSE Manager or Admin.', 403)
    }
    if (patch.expectedVersion !== undefined && patch.expectedVersion !== action.version) {
      throw new IncidentError('conflict', 'This action was updated by someone else. Reload to see the latest.', 409)
    }

    const saved = await this.db.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.update({
        where: { id: actionId },
        data: {
          version: { increment: 1 },
          ...(patch.status ? { status: patch.status as never } : {}),
          ...(patch.evidenceNote ? { evidenceNote: patch.evidenceNote.trim() } : {}),
          ...(patch.dueDate ? { dueDate: new Date(patch.dueDate) } : {}),
          ...(patch.status === 'completed' ? { completedAt: new Date() } : {}),
          ...(patch.status === 'verified' ? { verifiedBy: caller.name, verifiedAt: new Date() } : {}),
          // A reopened action is genuinely unfinished again: clear the sign-off and the
          // completion stamp so it cannot read as verified while it sits open.
          ...(isReopening
            ? { verifiedBy: null, verifiedAt: null, completedAt: null }
            : {}),
        },
      })
      // The audit event hangs off the parent investigation. A standalone action has no
      // parent, so it currently has no trail of its own — tracked as debt (M1.1 note):
      // an ActionEvent table is needed before standalone actions are audit-complete.
      if (action.incidentId) {
        await tx.incidentEvent.create({
          data: {
            incidentId: action.incidentId,
            action: patch.status ? 'Action ' + updated.code + ' -> ' + patch.status : 'Action ' + updated.code + ' updated',
            detail: patch.evidenceNote?.slice(0, 140),
            actor: caller.name,
            actorRole: m.role,
          },
        })
      }
      return updated
    })

    /*
     * Verification is the event worth announcing, not every field change. It is the point
     * at which somebody independent has confirmed the work was actually done - which is
     * the thing a manager's dashboard on the other end of a webhook is waiting for.
     */
    if (patch.status === 'verified') {
      await enqueueEvent(this.db, saved.companyId, 'action.verified', {
        ...actionPayload(saved),
        verifiedBy: caller.name,
      })
    }
    return saved
  }


  /**
   * Raises an action with no parent investigation — an audit finding, a failed
   * inspection, or a manual entry. Shares the CA-#### sequence with incident-derived
   * actions so the register reads as one continuous list.
   */
  async createStandaloneAction(caller: Caller, input: {
    companyId: string
    siteId: string
    title: string
    detail?: string
    owner: string
    dueDate: string
    priority?: string
    source?: string
  }) {
    this.requireRole(caller, input.companyId, MANAGE_ROLES)
    if (!input.title?.trim()) throw new IncidentError('validation', 'An action title is required.')
    if (!input.owner?.trim()) throw new IncidentError('validation', 'Every action needs an owner.')
    const due = new Date(input.dueDate)
    if (Number.isNaN(due.getTime())) {
      throw new IncidentError('validation', 'A valid target completion date is required.')
    }

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new IncidentError('validation', 'Unknown site for this workspace.')

    const raised = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'capa' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'capa', next: 401 },
        select: { next: true },
      })
      return tx.correctiveAction.create({
        data: {
          code: 'CA-' + counter.next,
          incidentId: null,
          source: (input.source ?? 'manual') as never,
          companyId: input.companyId,
          siteId: input.siteId,
          title: input.title.trim(),
          detail: input.detail?.trim() ?? '',
          owner: input.owner.trim(),
          ownerId: await resolveOwnerId(tx, input.companyId, input.owner),
          dueDate: due,
          priority: (input.priority ?? 'Medium') as never,
          createdBy: caller.name,
        },
      })
    })

    await enqueueEvent(this.db, input.companyId, 'action.assigned', actionPayload(raised))
    return raised
  }

  /** Actions across the workspace — the SAIL list, scoped and paginated. */
  async listActions(caller: Caller, companyId: string, opts: {
    page: number; pageSize: number; status?: string; owner?: string; overdue?: boolean; source?: string
  }) {
    const m = this.membership(caller, companyId)
    const where: Prisma.CorrectiveActionWhereInput = {
      companyId,
      ...(opts.status ? { status: opts.status as never } : {}),
      ...(opts.owner ? { owner: opts.owner } : {}),
      ...(opts.source ? { source: opts.source as never } : {}),
      ...(opts.overdue ? overdueActionWhere() : {}),
      // Employees and supervisors see only what they own.
      ...(['employee', 'supervisor'].includes(m.role) ? ownedByWhere(caller) : {}),
    }
    const [total, rows] = await this.db.$transaction([
      this.db.correctiveAction.count({ where }),
      this.db.correctiveAction.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }],
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { incident: { select: { number: true, title: true, department: true } } },
      }),
    ])
    return {
      /*
       * Which incident an action came from, by number and title, and that incident's
       * department. Without them the register's link to the incident read "·" and its
       * export had empty Incident and Department columns. Found on a phone, where the
       * action drawer is how an owner reaches the incident.
       */
      rows: rows.map(withIncidentRef),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: Math.max(1, Math.ceil(total / opts.pageSize)),
    }
  }


  // ── Root cause analysis ────────────────────────────────────────────────────

  /**
   * Saves the RCA. Editable while the investigation is at the `rca` stage and not yet
   * approved — once a manager approves it the analysis is the basis of the corrective
   * actions and must not move underneath them.
   */
  async saveRca(caller: Caller, id: string, input: {
    causes: { id: string; category: string; description: string }[]
    fiveWhys: { problem: string; whys: string[]; rootStatement: string }
  }) {
    const incident = await this.get(caller, id)
    const m = this.requireRole(caller, incident.companyId, MANAGE_ROLES)

    if (incident.rcaApprovedBy) {
      throw new IncidentError('validation', 'This analysis has been approved and is locked.')
    }
    /*
     * A closed incident's analysis is part of the record.
     *
     * The screen already hides the editor once the incident leaves the rca stage, but the
     * server was enforcing only the approval lock - so the root cause of a closed
     * investigation could still be rewritten through the API, which is precisely the thing
     * an audit trail exists to prevent. The same rule as saveInvestigation.
     */
    if (incident.stage === 'closed' || incident.archived) {
      throw new IncidentError('validation',
        'This incident is closed. Its root cause analysis is part of the record.')
    }
    if (!Array.isArray(input.causes)) {
      throw new IncidentError('validation', 'Contributing causes are required.')
    }

    await this.db.$transaction(async (tx) => {
      const inc = await tx.incident.update({
        where: { id },
        data: {
          rcaCauses: input.causes as never,
          rcaFiveWhys: input.fiveWhys as never,
          version: { increment: 1 },
        },
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          action: 'Root cause analysis saved',
          detail: `${input.causes.length} contributing cause(s)`,
          actor: caller.name,
          actorRole: m.role,
        },
      })
      return inc
    })
    // Same reasoning as `advance`: the screen renders what this returns, and the bare row
    // carries no actions, comments or attachments.
    return this.get(caller, id)
  }

  /** Approval locks the analysis. Manager-only, and it must have real content. */
  async approveRca(caller: Caller, id: string) {
    const incident = await this.get(caller, id)
    const m = this.requireRole(caller, incident.companyId, REVIEW_ROLES)

    const causes = (incident.rcaCauses ?? []) as unknown[]
    const whys = incident.rcaFiveWhys as { rootStatement?: string } | null
    if (!Array.isArray(causes) || causes.length === 0) {
      throw new IncidentError('validation', 'Record at least one contributing cause before approving.')
    }
    if (!whys?.rootStatement?.trim()) {
      throw new IncidentError('validation', 'A root cause statement is required before approving.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id },
        data: { rcaApprovedBy: caller.name, rcaApprovedAt: new Date(), version: { increment: 1 } },
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          action: 'Root cause analysis approved',
          actor: caller.name,
          actorRole: m.role,
        },
      })
    })
    return this.get(caller, id)
  }

  // ── Archive ────────────────────────────────────────────────────────────────

  /**
   * Soft delete. Records are never physically removed — a safety register that can be
   * erased is not a register — so the row is hidden from lists and marked in the trail.
   */
  async archive(caller: Caller, id: string) {
    const incident = await this.get(caller, id)
    const m = this.requireRole(caller, incident.companyId, REVIEW_ROLES)

    return this.db.$transaction(async (tx) => {
      const inc = await tx.incident.update({
        where: { id },
        data: { archived: true, version: { increment: 1 } },
      })
      await tx.incidentEvent.create({
        data: { incidentId: id, action: 'Incident archived', actor: caller.name, actorRole: m.role },
      })
      return inc
    })
  }

  // ── Corrective action notes ────────────────────────────────────────────────

  async addActionNote(caller: Caller, actionId: string, body: string, mentions: string[] = []) {
    const action = await this.db.correctiveAction.findUnique({ where: { id: actionId } })
    await this.assertActionVisible(caller, action)
    if (!body?.trim()) throw new IncidentError('validation', 'A note cannot be empty.')

    return this.db.capaNote.create({
      data: {
        actionId,
        body: body.trim(),
        author: caller.name,
        authorId: caller.userId,
        mentions,
      },
    })
  }

  async getAction(caller: Caller, actionId: string) {
    const action = await this.db.correctiveAction.findUnique({
      where: { id: actionId },
      include: {
        notes: { orderBy: { createdAt: 'asc' } },
        incident: { select: { number: true, title: true, department: true } },
      },
    })
    await this.assertActionVisible(caller, action)
    return withIncidentRef(action!)
  }

  /**
   * Whether the caller may open one corrective action - the same rows the register and
   * the incident page already show them, and no others.
   *
   * The register narrows employees and supervisors to the actions they own, but a direct
   * fetch by id checked only the tenant, and action ids are not secret: every action
   * reminder is broadcast to the whole workspace carrying /actions/<id> in its link, so
   * every employee's notification feed hands them the ids. With those, any employee could
   * read - and write notes onto - any action in the company through the API.
   *
   * Visible when the caller:
   *   - holds a role the register shows every action to (admin, HSE manager, safety
   *     officer, executive), or
   *   - owns it - the register's rule for employees and supervisors, or
   *   - can open the incident it was raised on, where the incident page already lists it.
   *
   * Another workspace's action is "not found" rather than "forbidden", as for incidents:
   * a 403 for a real id beside a 404 for an invented one says which ids exist.
   */
  private async assertActionVisible(
    caller: Caller,
    action: { companyId: string; owner: string; ownerId: string | null; incidentId: string | null } | null,
  ): Promise<void> {
    if (!action || !caller.roles.some((r) => r.companyId === action.companyId)) {
      throw new IncidentError('not_found', 'Action not found.', 404)
    }
    const m = this.membership(caller, action.companyId)
    if (!['employee', 'supervisor'].includes(m.role)) return
    if (isOwnedBy(action, caller)) return
    if (action.incidentId) {
      const incident = await this.db.incident.findFirst({
        where: { id: action.incidentId, archived: false, ...this.scopeWhere(caller, action.companyId) },
        select: { id: true },
      })
      if (incident) return
    }
    throw new IncidentError('forbidden', 'You do not have access to this action.', 403)
  }

  // ── Action analytics ───────────────────────────────────────────────────────

  /** Counts by status, priority and source, plus overdue and average days to close. */
  async actionAnalytics(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    const scope = ['employee', 'supervisor'].includes(m.role) ? ownedByWhere(caller) : {}
    const where = { companyId, ...scope }

    const [byStatus, byPriority, bySource, overdue, closed] = await this.db.$transaction([
      this.db.correctiveAction.groupBy({ by: ['status'], where, _count: { _all: true }, orderBy: undefined }),
      this.db.correctiveAction.groupBy({ by: ['priority'], where, _count: { _all: true }, orderBy: undefined }),
      this.db.correctiveAction.groupBy({ by: ['source'], where, _count: { _all: true }, orderBy: undefined }),
      this.db.correctiveAction.count({
        where: { ...where, status: { in: ['open', 'in_progress'] }, dueDate: { lt: startOfToday() } },
      }),
      this.db.correctiveAction.findMany({
        where: { ...where, completedAt: { not: null } },
        select: { createdAt: true, completedAt: true },
        take: 500,
      }),
    ])

    const days = closed
      .filter((a) => a.completedAt)
      .map((a) => (a.completedAt!.getTime() - a.createdAt.getTime()) / 86400_000)
    const avgDaysToComplete = days.length
      ? Math.round((days.reduce((x, y) => x + y, 0) / days.length) * 10) / 10
      : null

    // Prisma's groupBy result type is conditional on the _count shape; narrow locally
    // rather than thread the generic through, which buys nothing at one call site.
    const shape = (rows: unknown[], key: string) =>
      (rows as Record<string, { _all: number } | undefined>[]).map((r) => ({
        key: String((r as unknown as Record<string, unknown>)[key]),
        count: (r as { _count?: { _all: number } })._count?._all ?? 0,
      }))

    return {
      byStatus: shape(byStatus, 'status'),
      byPriority: shape(byPriority, 'priority'),
      bySource: shape(bySource, 'source'),
      overdue,
      avgDaysToComplete,
      totalClosed: closed.length,
    }
  }

  /** Dashboard counters, computed in the database rather than by loading every row. */

  /**
   * The incident board.
   *
   * Counted in one transaction against one scope, so no two tiles can disagree. The
   * breakdowns are tallied from a single bounded read rather than four groupBy calls: the
   * rows are the same rows the tiles counted, which is what stops the pie chart summing to
   * a different total than the headline.
   */
  async board(caller: Caller, companyId: string, siteId?: string) {
    this.membership(caller, companyId)
    const base: Prisma.IncidentWhereInput = {
      companyId,
      archived: false,
      ...this.scopeWhere(caller, companyId),
      ...(siteId ? { siteId } : {}),
    }

    // The local calendar month (APP_TIMEZONE), not the server's clock zone (UTC in the container).
    const monthStart = recentLocalMonths(1)[0].start

    const actionBase = {
      companyId,
      ...(siteId ? { siteId } : {}),
    }
    const OPEN_ACTION: Prisma.EnumCapaStatusFilter = { in: ['open', 'in_progress'] }

    const [openIncidents, overdueCapas, lostTime, nearMisses, thisMonth, openInvestigations, total, sites] =
      await this.db.$transaction([
        this.db.incident.count({ where: { ...base, stage: { notIn: ['closed'] } } }),
        this.db.correctiveAction.count({
          where: { ...actionBase, status: OPEN_ACTION, dueDate: { lt: startOfToday() } },
        }),
        // Severity, not type: a lost-time injury is an outcome. The legacy type values are
        // counted too, because rows reported under the old scale still happened.
        this.db.incident.count({
          where: {
            ...base,
            OR: [
              { severity: { in: LOST_TIME_SEVERITIES } },
              { type: { in: ['lti', 'fatality'] } },
            ],
          },
        }),
        this.db.incident.count({
          where: { ...base, OR: [{ severity: 'near_miss' }, { type: 'near_miss' }] },
        }),
        this.db.incident.count({ where: { ...base, reportedAt: { gte: monthStart } } }),
        // Started and not signed off. An investigation nobody has closed out is the one
        // that quietly runs past its deadline.
        this.db.incident.count({
          where: { ...base, investigationStartedAt: { not: null }, investigationCompletedAt: null },
        }),
        this.db.incident.count({ where: base }),
        this.db.site.findMany({ where: { companyId }, select: { id: true, name: true } }),
      ])

    /*
     * The breakdowns are counted by the database, one GROUP BY per dimension.
     *
     * They used to be tallied here from up to 5,000 loaded rows, which cost memory and a
     * transfer proportional to the whole register on every board load - and past 5,000
     * incidents quietly reported a truncated total and truncated breakdowns. A GROUP BY
     * returns one row per distinct value, whatever the register's size.
     */
    const [bySeverityRows, byTypeRows, byDepartmentRows, bySiteRows, byRootCauseRows] = await Promise.all([
      this.db.incident.groupBy({ by: ['severity'], where: base, _count: { _all: true } }),
      this.db.incident.groupBy({ by: ['type'], where: base, _count: { _all: true } }),
      this.db.incident.groupBy({ by: ['department'], where: base, _count: { _all: true } }),
      this.db.incident.groupBy({ by: ['siteId'], where: base, _count: { _all: true } }),
      this.db.incident.groupBy({ by: ['rootCause'], where: base, _count: { _all: true } }),
    ])

    const siteName = new Map(sites.map((x) => [x.id, x.name]))

    // Free-text values are trimmed and merged, and blanks dropped, exactly as the per-row
    // tally did: " Welding" and "Welding" are one department.
    const tally = <K extends string>(
      groups: ({ _count: { _all: number } } & Record<K, string | null>)[],
      key: K,
      label: (v: string) => string = (v) => v,
    ) => {
      const m = new Map<string, number>()
      for (const g of groups) {
        const k = label((g[key] ?? '').trim())
        if (!k) continue
        m.set(k, (m.get(k) ?? 0) + g._count._all)
      }
      return [...m.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    }

    return {
      openIncidents,
      overdueCapas,
      lostTime,
      nearMisses,
      thisMonth,
      openInvestigations,
      total,
      // Ordered by how serious, not by how many: a board that puts "Minor (48)" first
      // buries the fatality underneath it.
      bySeverity: tally(bySeverityRows, 'severity')
        .sort((a, b) =>
          (SEVERITY_RANK[b.name as never] ?? 0) - (SEVERITY_RANK[a.name as never] ?? 0)),
      byType: tally(byTypeRows, 'type'),
      byDepartment: tally(byDepartmentRows, 'department').slice(0, 12),
      bySite: tally(bySiteRows, 'siteId', (id) => siteName.get(id) ?? id),
      /** What keeps causing things. The reason an investigation is worth doing at all. */
      topRootCauses: tally(byRootCauseRows, 'rootCause').slice(0, 8),
    }
  }

  async stats(caller: Caller, companyId: string, siteId?: string) {
    this.membership(caller, companyId)
    const base: Prisma.IncidentWhereInput = {
      companyId,
      archived: false,
      ...this.scopeWhere(caller, companyId),
      ...(siteId ? { siteId } : {}),
    }
    // The local calendar month (APP_TIMEZONE), not the server's clock zone (UTC in the container).
    const monthStart = recentLocalMonths(1)[0].start

    // Actions are scoped by company/site directly; they are not all incident-derived.
    const actionBase = {
      companyId,
      ...(siteId ? { siteId } : {}),
      ...(['employee', 'supervisor'].includes(this.membership(caller, companyId).role)
        ? ownedByWhere(caller)
        : {}),
    }
    const OPEN_ACTION: Prisma.EnumCapaStatusFilter = { in: ['open', 'in_progress'] }

    const [open, highRisk, nearMissMonth, closed, total, openActions, overdueActions, awaitingVerification] =
      await this.db.$transaction([
        this.db.incident.count({ where: { ...base, stage: { not: 'closed' } } }),
        this.db.incident.count({ where: { ...base, highRisk: true, stage: { not: 'closed' } } }),
        this.db.incident.count({ where: { ...base, type: 'near_miss', reportedAt: { gte: monthStart } } }),
        this.db.incident.count({ where: { ...base, stage: 'closed' } }),
        this.db.incident.count({ where: base }),
        this.db.correctiveAction.count({ where: { ...actionBase, status: OPEN_ACTION } }),
        this.db.correctiveAction.count({
          where: { ...actionBase, status: OPEN_ACTION, dueDate: { lt: startOfToday() } },
        }),
        this.db.correctiveAction.count({ where: { ...actionBase, status: 'completed' } }),
      ])

    return {
      open,
      highRisk,
      nearMissThisMonth: nearMissMonth,
      closed,
      total,
      openActions,
      overdueActions,
      awaitingVerification,
    }
  }
}

export { AuthError }
