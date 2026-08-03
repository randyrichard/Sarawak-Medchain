import type { Prisma, PrismaClient, Role } from '@prisma/client'
import { AuthError } from './authService.js'

/** Roles permitted to triage and progress an investigation. */
const MANAGE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']
/** Roles permitted to review, verify and close. */
const REVIEW_ROLES: Role[] = ['admin', 'hse_manager']

/** The caller's verified identity, derived from the signed access token — never from the body. */
export interface Caller {
  userId: string
  name: string
  roles: { companyId: string; role: Role; siteIds: string[] }[]
}

export class IncidentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
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
}

/**
 * The status chips on the incident register.
 *
 * These are views over stage and age, not stored values. All seven must be understood
 * here: an unknown one used to fail validation at the route and the list silently came
 * back empty, which read as "the filter is broken" rather than "the server rejected it".
 */
export const INCIDENT_STATUS_FILTERS = [
  'all', 'open', 'closed', 'high_risk', 'investigating', 'awaiting_review', 'overdue',
] as const
export type IncidentStatusFilter = (typeof INCIDENT_STATUS_FILTERS)[number]

/** An open incident older than this reads as overdue. Matches the register's chip label. */
export const OVERDUE_AFTER_DAYS = 14

/**
 * Today at UTC midnight — the boundary an action's due date is measured against.
 *
 * Due dates are date-only, stored at UTC midnight. Comparing them with `now` makes
 * everything due today overdue from one second past midnight, which is why the Overdue
 * chip and the Overdue list disagreed by exactly the actions due today.
 */
function startOfToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

const ORDERED_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed',
] as const

/**
 * Stage groupings behind two of the chips. "Investigating" covers the evidence-gathering
 * stages and "awaiting review" the two sign-off stages, so a case sitting with a reviewer
 * is not reported as still under investigation.
 */
const INVESTIGATING_STAGES = ['investigation', 'rca'] as const
const AWAITING_REVIEW_STAGES = ['review', 'verification'] as const

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
    default: return {}
  }
}

export class IncidentService {
  constructor(private db: PrismaClient) {}

  /**
   * The caller's membership in a company. Everything else derives from this, so a caller
   * with no membership simply cannot address the tenant — the check is not skippable by
   * passing a different companyId, because we look it up rather than trust it.
   */
  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new IncidentError('forbidden', 'You do not have access to this workspace.', 403)
    return m
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
    const m = this.membership(caller, companyId)
    if (['admin', 'hse_manager', 'ceo'].includes(m.role)) return {}
    if (m.role === 'safety_officer' || m.role === 'supervisor') {
      return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
    }
    // employee
    return { reporterId: caller.userId }
  }

  async list(caller: Caller, p: ListParams) {
    this.membership(caller, p.companyId)

    const where: Prisma.IncidentWhereInput = {
      companyId: p.companyId,
      archived: false,
      ...this.scopeWhere(caller, p.companyId),
      ...(p.siteId ? { siteId: p.siteId } : {}),
      ...(p.type ? { type: p.type as never } : {}),
      ...(p.severity ? { severity: p.severity as never } : {}),
      ...(p.stage ? { stage: p.stage as never } : {}),
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
        orderBy: [{ severity: 'desc' }, { reportedAt: 'desc' }],
        skip: (p.page - 1) * p.pageSize,
        take: p.pageSize,
      }),
    ])

    return {
      rows,
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
        events: { orderBy: { at: 'desc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
        actions: { orderBy: { dueDate: 'asc' } },
      },
    })
    if (!incident || incident.archived) {
      throw new IncidentError('not_found', 'Incident not found.', 404)
    }
    // Re-apply scoping to a direct fetch: a guessed id must not bypass row-level access.
    const scope = this.scopeWhere(caller, incident.companyId)
    const visible = await this.db.incident.findFirst({
      where: { id, ...scope },
      select: { id: true },
    })
    if (!visible) throw new IncidentError('forbidden', 'You do not have access to this incident.', 403)
    return incident
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
  }) {
    this.membership(caller, input.companyId) // any member may report

    if (!input.title?.trim()) throw new IncidentError('validation', 'A title is required.')
    if (!input.location?.trim()) throw new IncidentError('validation', 'A location is required.')

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new IncidentError('validation', 'Unknown site for this workspace.')

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
          department: input.department ?? '',
          location: input.location.trim(),
          gps: input.gps,
          immediateActions: input.immediateActions ?? '',
          reporter: caller.name,
          reporterId: caller.userId,
          occurredAt: new Date(input.occurredAt),
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
                highRisk: ['Serious', 'Critical'].includes(payload.potentialSeverity),
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
  }) {
    const incident = await this.get(caller, incidentId)
    const att = await this.db.incidentAttachment.create({
      data: { incidentId: incident.id, ...file, uploadedBy: caller.name, uploadedById: caller.userId },
    })
    await this.db.incidentEvent.create({
      data: {
        incidentId: incident.id,
        action: 'Evidence uploaded',
        detail: file.originalName + ' (' + Math.round(file.sizeBytes / 1024) + ' KB)',
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
    dueDate: string
    priority?: string
  }) {
    const incident = await this.get(caller, incidentId)
    this.requireRole(caller, incident.companyId, MANAGE_ROLES)
    if (!input.title?.trim()) throw new IncidentError('validation', 'An action title is required.')
    if (!input.owner?.trim()) throw new IncidentError('validation', 'Every action needs an owner.')
    const due = new Date(input.dueDate)
    if (Number.isNaN(due.getTime())) {
      throw new IncidentError('validation', 'A valid target completion date is required.')
    }

    return this.db.$transaction(async (tx) => {
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
          dueDate: due,
          priority: (input.priority ?? 'Medium') as never,
          createdBy: caller.name,
        },
      })
      await tx.incidentEvent.create({
        data: {
          incidentId: incident.id,
          action: 'Corrective action raised',
          detail: action.code + ' — ' + action.title + ' (owner ' + action.owner + ')',
          actor: caller.name,
          actorRole: this.membership(caller, incident.companyId).role,
        },
      })
      return action
    })
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
    if (!action) throw new IncidentError('not_found', 'Action not found.', 404)

    const m = this.membership(caller, action.companyId)
    const isOwner = action.owner === caller.name
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
    if (patch.dueDate && !isManager) {
      throw new IncidentError('forbidden', 'Changing the target date requires an HSE Manager or Admin.', 403)
    }
    if (patch.expectedVersion !== undefined && patch.expectedVersion !== action.version) {
      throw new IncidentError('conflict', 'This action was updated by someone else. Reload to see the latest.', 409)
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.correctiveAction.update({
        where: { id: actionId },
        data: {
          version: { increment: 1 },
          ...(patch.status ? { status: patch.status as never } : {}),
          ...(patch.evidenceNote ? { evidenceNote: patch.evidenceNote.trim() } : {}),
          ...(patch.dueDate ? { dueDate: new Date(patch.dueDate) } : {}),
          ...(patch.status === 'completed' ? { completedAt: new Date() } : {}),
          ...(patch.status === 'verified' ? { verifiedBy: caller.name, verifiedAt: new Date() } : {}),
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

    return this.db.$transaction(async (tx) => {
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
          dueDate: due,
          priority: (input.priority ?? 'Medium') as never,
          createdBy: caller.name,
        },
      })
    })
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
      ...(opts.overdue ? { dueDate: { lt: startOfToday() }, status: { in: ['open', 'in_progress'] } } : {}),
      // Employees and supervisors see only what they own.
      ...(['employee', 'supervisor'].includes(m.role) ? { owner: caller.name } : {}),
    }
    const [total, rows] = await this.db.$transaction([
      this.db.correctiveAction.count({ where }),
      this.db.correctiveAction.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }],
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
    ])
    return {
      rows,
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
    if (!action) throw new IncidentError('not_found', 'Action not found.', 404)
    this.membership(caller, action.companyId)
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
      include: { notes: { orderBy: { createdAt: 'asc' } } },
    })
    if (!action) throw new IncidentError('not_found', 'Action not found.', 404)
    this.membership(caller, action.companyId)
    return action
  }

  // ── Action analytics ───────────────────────────────────────────────────────

  /** Counts by status, priority and source, plus overdue and average days to close. */
  async actionAnalytics(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    const scope = ['employee', 'supervisor'].includes(m.role) ? { owner: caller.name } : {}
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
  async stats(caller: Caller, companyId: string, siteId?: string) {
    this.membership(caller, companyId)
    const base: Prisma.IncidentWhereInput = {
      companyId,
      archived: false,
      ...this.scopeWhere(caller, companyId),
      ...(siteId ? { siteId } : {}),
    }
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    // Actions are scoped by company/site directly; they are not all incident-derived.
    const actionBase = {
      companyId,
      ...(siteId ? { siteId } : {}),
      ...(['employee', 'supervisor'].includes(this.membership(caller, companyId).role)
        ? { owner: caller.name }
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
