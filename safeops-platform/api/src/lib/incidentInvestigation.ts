import type {
  IncidentLinkKind, IncidentPersonRole, PrismaClient, Role,
} from '@prisma/client'
import type { Caller } from './incidentService.js'
import { MANDATORY_INVESTIGATION } from './incidentCatalog.js'

/**
 * The investigation half of incident management: who was involved, what else the event
 * touched, and the causal analysis.
 *
 * Separate from IncidentService for the same reason PermitReviewService is separate from
 * PermitService - the case file and the workflow are different concerns, and the file was
 * already long enough that a reader could not hold it in their head.
 */
export class InvestigationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
    this.name = 'InvestigationError'
  }
}

/** Who may record people, links and causal analysis. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

/**
 * Who may sign off the investigation as complete.
 *
 * Narrower than WRITE_ROLES on purpose: a supervisor can gather statements and name a
 * witness, but declaring the cause of a lost-time injury established is a different act
 * with a different signature on it.
 */
const SIGNOFF_ROLES: Role[] = ['admin', 'hse_manager']

export const PERSON_ROLE_LABEL: Record<IncidentPersonRole, string> = {
  witness: 'Witness',
  injured: 'Injured person',
  involved: 'Involved',
  first_aider: 'First aider',
}

export const LINK_KIND_LABEL: Record<IncidentLinkKind, string> = {
  permit: 'Permit',
  employee: 'Employee',
  contractor: 'Contractor company',
  contractor_worker: 'Contractor worker',
  visitor: 'Visitor',
  asset: 'Equipment',
}

export interface InvestigationFacts {
  severity: string
  leadInvestigator: string | null
  investigationStartedAt: Date | null
  directCause: string | null
  rootCause: string | null
  rcaFiveWhys: unknown
  peopleCount: number
  openActions: number
}

/**
 * Everything still outstanding before an investigation can be signed off, as sentences.
 *
 * A pure function of the facts with no database access, so the panel showing what is left
 * and the server refusing the sign-off cannot disagree. The same shape as the permit
 * activation gate and the visitor gate, deliberately: three modules, one idea.
 */
export function completionBlockers(f: InvestigationFacts): string[] {
  const out: string[] = []
  if (!f.leadInvestigator) out.push('No lead investigator has been named.')
  if (!f.investigationStartedAt) out.push('The investigation has not been started.')
  if (!f.directCause?.trim()) out.push('The direct cause has not been recorded.')
  if (!f.rootCause?.trim()) out.push('The root cause has not been recorded.')

  /*
   * Only for the severities where an investigation is obligatory. Demanding a witness
   * statement for every unsafe-condition report is how a mandatory field becomes a field
   * everybody types "n/a" into.
   */
  if (MANDATORY_INVESTIGATION.includes(f.severity as never)) {
    if (f.peopleCount === 0) {
      out.push('Nobody has been named as a witness or an injured person.')
    }
    if (f.openActions === 0) {
      out.push('No corrective action has been raised.')
    }
  }
  return out
}

export class InvestigationService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new InvestigationError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  private require(caller: Caller, companyId: string, roles: Role[], doing: string) {
    const m = this.membership(caller, companyId)
    if (!roles.includes(m.role)) {
      throw new InvestigationError('forbidden', `Your role does not permit ${doing}.`, 403)
    }
    return m
  }

  private async incidentFor(caller: Caller, id: string) {
    const inc = await this.db.incident.findUnique({ where: { id } })
    if (!inc) throw new InvestigationError('not_found', 'Incident not found.', 404)
    this.membership(caller, inc.companyId)
    return inc
  }

  /** Timeline and audit, written together with the change that caused them. */
  private event(
    tx: Pick<PrismaClient, 'incidentEvent'>,
    incidentId: string, action: string, actor: string, detail?: string,
  ) {
    return tx.incidentEvent.create({
      data: { incidentId, action, actor, detail: detail ?? null },
    })
  }

  private async log(
    caller: Caller, companyId: string, action: string, target: string,
    ctx: { ip?: string; device?: string } = {},
  ) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId, actor: caller.name, actorRole: m?.role ?? '',
        action, module: 'incidents', target,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
  }

  // ── People ─────────────────────────────────────────────────────────────────

  async listPeople(caller: Caller, incidentId: string) {
    const inc = await this.incidentFor(caller, incidentId)
    const rows = await this.db.incidentPerson.findMany({
      where: { incidentId: inc.id },
      orderBy: [{ role: 'asc' }, { addedAt: 'asc' }],
    })
    return rows.map((r) => ({
      ...r,
      roleLabel: PERSON_ROLE_LABEL[r.role],
      addedAt: r.addedAt.toISOString(),
      /** Which register they came from, or none. */
      source: r.employeeId ? 'employee'
        : r.contractorWorkerId ? 'contractor'
          : r.visitorId ? 'visitor' : 'external',
    }))
  }

  async addPerson(caller: Caller, incidentId: string, input: {
    role: IncidentPersonRole
    employeeId?: string
    contractorWorkerId?: string
    visitorId?: string
    name?: string
    company?: string
    injuryType?: string
    bodyPart?: string
    treatment?: string
    daysLost?: number
    statement?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const inc = await this.incidentFor(caller, incidentId)
    this.require(caller, inc.companyId, WRITE_ROLES, 'naming people on an incident')

    const linked = [input.employeeId, input.contractorWorkerId, input.visitorId].filter(Boolean)
    if (linked.length > 1) {
      throw new InvestigationError('validation',
        'A person is one person. Name them from the workforce, the contractor register or the visitor log, not several.')
    }

    /*
     * The name is resolved from whichever register was used and stored alongside the link.
     * A statement has to survive the witness leaving the company, and an injured contractor
     * may be in no register at all - which is exactly when the name matters most.
     */
    let name = input.name?.trim() ?? ''
    let company = input.company?.trim() ?? ''

    if (input.employeeId) {
      const e = await this.db.employee.findUnique({
        where: { id: input.employeeId },
        select: { name: true, companyId: true, department: true },
      })
      if (!e || e.companyId !== inc.companyId) {
        throw new InvestigationError('validation', 'That employee is not in this workspace.')
      }
      name = e.name
      company = company || e.department
    } else if (input.contractorWorkerId) {
      const w = await this.db.contractorWorker.findUnique({
        where: { id: input.contractorWorkerId },
        select: { name: true, companyId: true, contractorCompany: { select: { name: true } } },
      })
      if (!w || w.companyId !== inc.companyId) {
        throw new InvestigationError('validation', 'That contractor worker is not in this workspace.')
      }
      name = w.name
      company = company || w.contractorCompany?.name || ''
    } else if (input.visitorId) {
      const v = await this.db.visitor.findUnique({
        where: { id: input.visitorId },
        select: { name: true, companyId: true, visitorCompany: true },
      })
      if (!v || v.companyId !== inc.companyId) {
        throw new InvestigationError('validation', 'That visitor is not in this workspace.')
      }
      name = v.name
      company = company || v.visitorCompany
    }

    if (!name) {
      throw new InvestigationError('validation',
        'Give a name, or pick somebody from one of the registers.')
    }
    if (input.daysLost !== undefined && input.daysLost < 0) {
      throw new InvestigationError('validation', 'Days lost cannot be negative.')
    }
    // Injury detail belongs to an injured person. Recorded against a witness it would show
    // up in the injury figures for somebody who was not hurt.
    if (input.role !== 'injured' && (input.injuryType || input.bodyPart || input.daysLost)) {
      throw new InvestigationError('validation',
        'Injury detail can only be recorded against somebody named as injured.')
    }

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.incidentPerson.create({
        data: {
          incidentId: inc.id,
          role: input.role,
          employeeId: input.employeeId ?? null,
          contractorWorkerId: input.contractorWorkerId ?? null,
          visitorId: input.visitorId ?? null,
          name,
          company,
          injuryType: input.injuryType?.trim() || null,
          bodyPart: input.bodyPart?.trim() || null,
          treatment: input.treatment?.trim() || null,
          daysLost: input.daysLost ?? null,
          statement: input.statement?.trim() || null,
          addedBy: caller.name,
        },
      })
      await this.event(tx, inc.id, `${PERSON_ROLE_LABEL[input.role]} named`, caller.name,
        `${name}${company ? ` (${company})` : ''}`)
      await tx.incident.update({
        where: { id: inc.id }, data: { version: { increment: 1 } },
      })
      return row
    })

    await this.log(caller, inc.companyId, `Incident ${PERSON_ROLE_LABEL[input.role].toLowerCase()} named`,
      `${inc.number}: ${name}`, ctx)
    return created
  }

  async updatePerson(caller: Caller, personId: string, input: {
    statement?: string
    injuryType?: string
    bodyPart?: string
    treatment?: string
    daysLost?: number
  }, ctx: { ip?: string; device?: string } = {}) {
    const row = await this.db.incidentPerson.findUnique({
      where: { id: personId },
      include: { incident: { select: { id: true, number: true, companyId: true } } },
    })
    if (!row) throw new InvestigationError('not_found', 'That person is not on this incident.', 404)
    this.require(caller, row.incident.companyId, WRITE_ROLES, 'editing incident statements')

    if (input.daysLost !== undefined && input.daysLost < 0) {
      throw new InvestigationError('validation', 'Days lost cannot be negative.')
    }
    if (row.role !== 'injured' && (input.injuryType || input.bodyPart || input.daysLost)) {
      throw new InvestigationError('validation',
        'Injury detail can only be recorded against somebody named as injured.')
    }

    const updated = await this.db.$transaction(async (tx) => {
      const r = await tx.incidentPerson.update({
        where: { id: personId },
        data: {
          statement: input.statement === undefined ? undefined : (input.statement.trim() || null),
          injuryType: input.injuryType === undefined ? undefined : (input.injuryType.trim() || null),
          bodyPart: input.bodyPart === undefined ? undefined : (input.bodyPart.trim() || null),
          treatment: input.treatment === undefined ? undefined : (input.treatment.trim() || null),
          daysLost: input.daysLost ?? undefined,
        },
      })
      await this.event(tx, row.incident.id,
        input.statement !== undefined ? 'Statement recorded' : 'Injury detail updated',
        caller.name, row.name)
      return r
    })

    await this.log(caller, row.incident.companyId, 'Incident person updated',
      `${row.incident.number}: ${row.name}`, ctx)
    return updated
  }

  async removePerson(caller: Caller, personId: string, ctx: { ip?: string; device?: string } = {}) {
    const row = await this.db.incidentPerson.findUnique({
      where: { id: personId },
      include: { incident: { select: { id: true, number: true, companyId: true, stage: true } } },
    })
    if (!row) throw new InvestigationError('not_found', 'That person is not on this incident.', 404)
    this.require(caller, row.incident.companyId, WRITE_ROLES, 'removing people from an incident')

    if (row.incident.stage === 'closed') {
      throw new InvestigationError('validation',
        'This incident is closed. Who was named on it is part of the record.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.incidentPerson.delete({ where: { id: personId } })
      await this.event(tx, row.incident.id, 'Person removed', caller.name,
        `${PERSON_ROLE_LABEL[row.role]}: ${row.name}`)
    })
    await this.log(caller, row.incident.companyId, 'Incident person removed',
      `${row.incident.number}: ${row.name}`, ctx)
  }

  // ── Related records ────────────────────────────────────────────────────────

  async listLinks(caller: Caller, incidentId: string) {
    const inc = await this.incidentFor(caller, incidentId)
    const rows = await this.db.incidentLink.findMany({
      where: { incidentId: inc.id },
      orderBy: [{ kind: 'asc' }, { addedAt: 'asc' }],
    })
    return rows.map((r) => ({
      ...r,
      kindLabel: LINK_KIND_LABEL[r.kind],
      addedAt: r.addedAt.toISOString(),
      href: hrefFor(r.kind, r.targetId),
    }))
  }

  /**
   * Link a record elsewhere in the platform to this incident.
   *
   * The target is resolved now and its code and label stored, so the link still reads
   * correctly after the permit is archived or the visitor record is purged - and so the
   * case file renders without four joins.
   */
  async addLink(caller: Caller, incidentId: string, input: {
    kind: IncidentLinkKind
    targetId: string
    note?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const inc = await this.incidentFor(caller, incidentId)
    this.require(caller, inc.companyId, WRITE_ROLES, 'linking records to an incident')

    const resolved = await this.resolveTarget(inc.companyId, input.kind, input.targetId)
    if (!resolved) {
      throw new InvestigationError('validation', 'That record is not in this workspace.')
    }

    const exists = await this.db.incidentLink.findFirst({
      where: { incidentId: inc.id, kind: input.kind, targetId: input.targetId },
      select: { id: true },
    })
    if (exists) {
      throw new InvestigationError('validation',
        `${resolved.code || resolved.label} is already linked to this incident.`)
    }

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.incidentLink.create({
        data: {
          incidentId: inc.id,
          kind: input.kind,
          targetId: input.targetId,
          targetCode: resolved.code,
          targetLabel: resolved.label,
          note: input.note?.trim() || null,
          addedBy: caller.name,
        },
      })
      await this.event(tx, inc.id, `${LINK_KIND_LABEL[input.kind]} linked`, caller.name,
        [resolved.code, resolved.label].filter(Boolean).join(' - '))
      await tx.incident.update({ where: { id: inc.id }, data: { version: { increment: 1 } } })
      return row
    })

    await this.log(caller, inc.companyId, `Incident linked to ${LINK_KIND_LABEL[input.kind].toLowerCase()}`,
      `${inc.number}: ${resolved.code || resolved.label}`, ctx)
    return created
  }

  async removeLink(caller: Caller, linkId: string, ctx: { ip?: string; device?: string } = {}) {
    const row = await this.db.incidentLink.findUnique({
      where: { id: linkId },
      include: { incident: { select: { id: true, number: true, companyId: true, stage: true } } },
    })
    if (!row) throw new InvestigationError('not_found', 'That link no longer exists.', 404)
    this.require(caller, row.incident.companyId, WRITE_ROLES, 'removing incident links')

    if (row.incident.stage === 'closed') {
      throw new InvestigationError('validation',
        'This incident is closed. What it referenced is part of the record.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.incidentLink.delete({ where: { id: linkId } })
      await this.event(tx, row.incident.id, `${LINK_KIND_LABEL[row.kind]} unlinked`, caller.name,
        row.targetCode || row.targetLabel)
    })
    await this.log(caller, row.incident.companyId, 'Incident link removed',
      `${row.incident.number}: ${row.targetCode || row.targetLabel}`, ctx)
  }

  /** Resolve a link target to a code and a label, scoped to the workspace. */
  private async resolveTarget(companyId: string, kind: IncidentLinkKind, id: string) {
    switch (kind) {
      case 'permit': {
        const r = await this.db.permit.findUnique({
          where: { id }, select: { code: true, title: true, companyId: true },
        })
        return r && r.companyId === companyId ? { code: r.code, label: r.title } : null
      }
      case 'asset': {
        const r = await this.db.asset.findUnique({
          where: { id }, select: { code: true, name: true, companyId: true },
        })
        return r && r.companyId === companyId ? { code: r.code, label: r.name } : null
      }
      case 'employee': {
        const r = await this.db.employee.findUnique({
          where: { id }, select: { employeeNo: true, name: true, companyId: true },
        })
        return r && r.companyId === companyId ? { code: r.employeeNo, label: r.name } : null
      }
      case 'contractor': {
        const r = await this.db.contractorCompany.findUnique({
          where: { id }, select: { code: true, name: true, companyId: true },
        })
        return r && r.companyId === companyId ? { code: r.code, label: r.name } : null
      }
      case 'contractor_worker': {
        const r = await this.db.contractorWorker.findUnique({
          where: { id }, select: { workerNo: true, name: true, companyId: true },
        })
        return r && r.companyId === companyId ? { code: r.workerNo, label: r.name } : null
      }
      case 'visitor': {
        const r = await this.db.visitor.findUnique({
          where: { id }, select: { code: true, name: true, companyId: true },
        })
        return r && r.companyId === companyId ? { code: r.code, label: r.name } : null
      }
    }
  }

  /**
   * Incidents that reference a given record.
   *
   * The reverse question, and the one worth asking: what has gone wrong around this permit,
   * this contractor, this visitor. Equipment answers it through its own table.
   */
  async incidentsFor(caller: Caller, companyId: string, kind: IncidentLinkKind, targetId: string) {
    this.membership(caller, companyId)
    const rows = await this.db.incidentLink.findMany({
      where: { kind, targetId, incident: { companyId } },
      include: {
        incident: {
          select: {
            id: true, number: true, title: true, severity: true, type: true,
            stage: true, occurredAt: true,
          },
        },
      },
      orderBy: { addedAt: 'desc' },
      take: 50,
    })
    return rows.map((r) => ({
      linkId: r.id,
      note: r.note,
      ...r.incident,
      occurredAt: r.incident.occurredAt.toISOString(),
    }))
  }

  // ── The investigation ──────────────────────────────────────────────────────

  async getInvestigation(caller: Caller, incidentId: string) {
    const inc = await this.incidentFor(caller, incidentId)
    const [peopleCount, openActions] = await Promise.all([
      this.db.incidentPerson.count({ where: { incidentId: inc.id } }),
      this.db.correctiveAction.count({ where: { incidentId: inc.id } }),
    ])

    return {
      leadInvestigator: inc.leadInvestigator,
      investigationTeam: inc.investigationTeam,
      investigationStartedAt: inc.investigationStartedAt?.toISOString() ?? null,
      investigationCompletedAt: inc.investigationCompletedAt?.toISOString() ?? null,
      directCause: inc.directCause,
      underlyingCause: inc.underlyingCause,
      rootCause: inc.rootCause,
      contributingFactors: inc.contributingFactors,
      recommendations: inc.recommendations,
      fishbone: inc.rcaFishbone,
      /** Obliged by severity, whatever anyone thinks of the event. */
      mandatory: MANDATORY_INVESTIGATION.includes(inc.severity),
      blockers: completionBlockers({
        severity: inc.severity,
        leadInvestigator: inc.leadInvestigator,
        investigationStartedAt: inc.investigationStartedAt,
        directCause: inc.directCause,
        rootCause: inc.rootCause,
        rcaFiveWhys: inc.rcaFiveWhys,
        peopleCount,
        openActions,
      }),
    }
  }

  async saveInvestigation(caller: Caller, incidentId: string, input: {
    leadInvestigator?: string
    investigationTeam?: string
    directCause?: string
    underlyingCause?: string
    rootCause?: string
    contributingFactors?: string
    recommendations?: string
    fishbone?: Record<string, string[]>
  }, ctx: { ip?: string; device?: string } = {}) {
    const inc = await this.incidentFor(caller, incidentId)
    this.require(caller, inc.companyId, WRITE_ROLES, 'recording an investigation')

    if (inc.stage === 'closed') {
      throw new InvestigationError('validation',
        'This incident is closed. Its investigation is part of the record.')
    }

    // Naming a lead starts the clock if nothing else has. Otherwise "investigation started"
    // means whenever somebody happened to press a button, which is not a date worth having.
    const startNow = !inc.investigationStartedAt
      && (input.leadInvestigator?.trim() || input.directCause?.trim())

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.incident.update({
        where: { id: incidentId },
        data: {
          leadInvestigator: input.leadInvestigator?.trim() ?? undefined,
          investigationTeam: input.investigationTeam?.trim() ?? undefined,
          directCause: input.directCause === undefined ? undefined : (input.directCause.trim() || null),
          underlyingCause: input.underlyingCause === undefined ? undefined : (input.underlyingCause.trim() || null),
          rootCause: input.rootCause === undefined ? undefined : (input.rootCause.trim() || null),
          contributingFactors: input.contributingFactors === undefined ? undefined : (input.contributingFactors.trim() || null),
          recommendations: input.recommendations === undefined ? undefined : (input.recommendations.trim() || null),
          rcaFishbone: input.fishbone === undefined ? undefined : (input.fishbone as never),
          investigationStartedAt: startNow ? new Date() : undefined,
          version: { increment: 1 },
        },
      })
      if (startNow) {
        await this.event(tx, incidentId, 'Investigation started', caller.name,
          input.leadInvestigator?.trim() ? `Lead: ${input.leadInvestigator.trim()}` : undefined)
      } else {
        await this.event(tx, incidentId, 'Investigation updated', caller.name)
      }
      return row
    })

    await this.log(caller, inc.companyId, 'Investigation updated', inc.number, ctx)
    return updated
  }

  /**
   * Sign the investigation off as complete.
   *
   * Refused while anything is outstanding, and the refusal names the first thing missing.
   * An investigation closed without a root cause is a file, not a finding.
   */
  async completeInvestigation(caller: Caller, incidentId: string, ctx: { ip?: string; device?: string } = {}) {
    const inc = await this.incidentFor(caller, incidentId)
    this.require(caller, inc.companyId, SIGNOFF_ROLES, 'signing off an investigation')

    if (inc.investigationCompletedAt) {
      throw new InvestigationError('validation', 'This investigation is already signed off.')
    }

    const [peopleCount, openActions] = await Promise.all([
      this.db.incidentPerson.count({ where: { incidentId: inc.id } }),
      this.db.correctiveAction.count({ where: { incidentId: inc.id } }),
    ])
    const blockers = completionBlockers({
      severity: inc.severity,
      leadInvestigator: inc.leadInvestigator,
      investigationStartedAt: inc.investigationStartedAt,
      directCause: inc.directCause,
      rootCause: inc.rootCause,
      rcaFiveWhys: inc.rcaFiveWhys,
      peopleCount,
      openActions,
    })
    if (blockers.length > 0) throw new InvestigationError('validation', blockers[0])

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.incident.update({
        where: { id: incidentId },
        data: { investigationCompletedAt: new Date(), version: { increment: 1 } },
      })
      await this.event(tx, incidentId, 'Investigation signed off', caller.name, inc.rootCause ?? undefined)
      return row
    })

    await this.log(caller, inc.companyId, 'Investigation signed off', inc.number, ctx)

    await this.db.notification.create({
      data: {
        companyId: inc.companyId, kind: 'incident',
        title: `Investigation complete: ${inc.number}`,
        detail: `${inc.title}. Root cause: ${inc.rootCause ?? 'not stated'}.`,
        href: `/incidents/${inc.id}`,
      },
    })
    return updated
  }
}

/** Where a linked record lives in the app. */
function hrefFor(kind: IncidentLinkKind, id: string) {
  switch (kind) {
    case 'permit': return `/permits?open=${id}`
    case 'asset': return `/assets?open=${id}`
    case 'employee': return `/employees?open=${id}`
    case 'contractor': return `/contractors?open=${id}`
    case 'contractor_worker': return `/contractors?worker=${id}`
    case 'visitor': return `/visitors?open=${id}`
  }
}
