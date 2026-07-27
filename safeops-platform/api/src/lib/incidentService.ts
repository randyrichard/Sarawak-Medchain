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
  status?: 'open' | 'closed' | 'high_risk' | 'all'
  siteId?: string
}

const ORDERED_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed',
] as const

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
      ...(p.status === 'open' ? { stage: { not: 'closed' } } : {}),
      ...(p.status === 'closed' ? { stage: 'closed' } : {}),
      ...(p.status === 'high_risk' ? { highRisk: true, stage: { not: 'closed' } } : {}),
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
      include: { events: { orderBy: { at: 'desc' } } },
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
        where: { companyId_id: { companyId: input.companyId, id: 'incident' } },
        update: { next: { increment: 1 } },
        create: { id: 'incident', companyId: input.companyId, next: 2601 },
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

    return this.db.$transaction(async (tx) => {
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

    const [open, highRisk, nearMissMonth, closed, total] = await this.db.$transaction([
      this.db.incident.count({ where: { ...base, stage: { not: 'closed' } } }),
      this.db.incident.count({ where: { ...base, highRisk: true, stage: { not: 'closed' } } }),
      this.db.incident.count({ where: { ...base, type: 'near_miss', reportedAt: { gte: monthStart } } }),
      this.db.incident.count({ where: { ...base, stage: 'closed' } }),
      this.db.incident.count({ where: base }),
    ])

    return { open, highRisk, nearMissThisMonth: nearMissMonth, closed, total }
  }
}

export { AuthError }
