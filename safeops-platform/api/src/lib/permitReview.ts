/**
 * The permit approval chain.
 *
 * A permit to work is a transfer of authority: the person who owns the plant hands
 * control of a piece of it to the person doing the job. Three people sign that transfer,
 * and they sign in order, each checking something the previous one could not:
 *
 *   Supervisor   — is the method right, and are these the right people?
 *   HSE          — are the controls adequate for the hazard?
 *   Area authority — is the plant actually free to be worked on right now?
 *
 * The order is the control. An area authority who signs before HSE is approving a method
 * nobody has assessed; an HSE reviewer who signs before the supervisor is assessing a job
 * nobody has planned. So each stage refuses to run out of turn rather than warning.
 *
 * Every transition writes to both the permit timeline (what the permit says happened) and
 * the tenant audit log (what the platform recorded, with actor, IP and device).
 */
import type { PrismaClient, Role, PermitStatus } from '@prisma/client'
import { PermitError } from './permitService.js'
import { activationBlockers } from './permitCatalog.js'
import type { Caller } from './incidentService.js'

/**
 * Who may sign each stage.
 *
 * Admin appears everywhere because a single-site customer often has one person holding
 * every hat, and a chain nobody can complete is a chain that gets bypassed on paper.
 */
const STAGE_ROLES: Record<string, Role[]> = {
  supervisor_review: ['supervisor', 'hse_manager', 'admin'],
  hse_review: ['hse_manager', 'safety_officer', 'admin'],
  area_authority: ['hse_manager', 'admin', 'ceo'],
}

/** The chain, in order. Index position is what makes skipping detectable. */
export const REVIEW_CHAIN: PermitStatus[] = ['supervisor_review', 'hse_review', 'area_authority']

export const STAGE_LABEL: Record<string, string> = {
  supervisor_review: 'Supervisor review',
  hse_review: 'HSE review',
  area_authority: 'Area authority review',
}

/** What a permit in each stage advances to when the stage signs off. */
const NEXT_AFTER: Record<string, PermitStatus> = {
  submitted: 'supervisor_review',
  supervisor_review: 'hse_review',
  hse_review: 'area_authority',
  area_authority: 'approved',
}

export class PermitReviewService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  /** Timeline entry plus tenant audit entry — the permit's record and the platform's. */
  private async record(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    permit: { id: string; companyId: string; code: string },
    caller: Caller,
    role: Role,
    action: string,
    detail: string,
    ctx: { ip?: string; device?: string },
  ) {
    await tx.permitEvent.create({
      data: { permitId: permit.id, action, detail, actor: caller.name, actorRole: role },
    })
    await tx.adminAuditEntry.create({
      data: {
        companyId: permit.companyId,
        actor: caller.name,
        actorRole: role,
        action,
        module: 'permits',
        target: permit.code,
        ip: ctx.ip ?? '',
        device: ctx.device ?? '',
      },
    })
  }

  private async load(caller: Caller, id: string) {
    const permit = await this.db.permit.findUnique({
      where: { id },
      select: {
        id: true, companyId: true, code: true, status: true, type: true,
        validFrom: true, validTo: true, toolboxAt: true, requiredPpe: true,
        ppeAcknowledgedAt: true,
      },
    })
    if (!permit) throw new PermitError('not_found', 'Permit not found.', 404)
    const m = this.membership(caller, permit.companyId)
    return { permit, role: m.role }
  }

  /**
   * Advance one stage.
   *
   * Deliberately takes no target: the caller says "I have reviewed this", and the chain
   * decides what comes next. A client that could name the target could name `approved`
   * from `submitted` and skip both reviews.
   */
  async advance(
    caller: Caller, id: string, statement: string, ctx: { ip?: string; device?: string } = {},
  ) {
    const { permit, role } = await this.load(caller, id)

    const next = NEXT_AFTER[permit.status]
    if (!next) {
      throw new PermitError(
        'validation',
        `A ${permit.status.replace(/_/g, ' ')} permit is not awaiting review.`,
      )
    }

    // The stage being signed is the permit's *current* one, except for `submitted`,
    // which nobody signs — it simply enters the chain.
    const signing = permit.status === 'submitted' ? null : permit.status
    if (signing) {
      const allowed = STAGE_ROLES[signing] ?? []
      if (!allowed.includes(role)) {
        throw new PermitError(
          'forbidden',
          `${STAGE_LABEL[signing]} must be signed by ${allowed.join(', ').replace(/_/g, ' ')}.`,
          403,
        )
      }
    }

    if (!statement.trim()) {
      throw new PermitError('validation', 'Record what you checked before signing.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id },
        data: {
          status: next,
          version: { increment: 1 },
          ...(signing
            ? {
                signatures: {
                  create: {
                    role: 'approver',
                    name: caller.name,
                    statement: `${STAGE_LABEL[signing]}: ${statement.trim()}`,
                  },
                },
              }
            : {}),
        },
      })
      await this.record(
        tx, permit, caller, role,
        signing ? `${STAGE_LABEL[signing]} signed` : 'Entered review',
        signing ? statement.trim() : `Now with ${STAGE_LABEL[next] ?? next}`,
        ctx,
      )
    })

    return this.status(caller, id)
  }

  /**
   * Send a permit back down the chain.
   *
   * A reviewer who finds a problem returns it to draft rather than rejecting outright:
   * the applicant fixes the method statement and resubmits, and the whole chain signs
   * again. Restarting the chain is the point — a fix nobody re-reviewed is a fix nobody
   * checked.
   */
  async returnToApplicant(
    caller: Caller, id: string, reason: string, ctx: { ip?: string; device?: string } = {},
  ) {
    const { permit, role } = await this.load(caller, id)

    if (!REVIEW_CHAIN.includes(permit.status) && permit.status !== 'submitted') {
      throw new PermitError('validation', 'Only a permit in review can be sent back.')
    }
    if (!reason.trim()) throw new PermitError('validation', 'Say what has to change.')

    await this.db.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id },
        // Back to draft, and every signature so far is void: the chain starts again.
        data: { status: 'draft', version: { increment: 1 }, rejectionReason: reason.trim() },
      })
      await tx.permitSignature.deleteMany({ where: { permitId: id, role: 'approver' } })
      await this.record(tx, permit, caller, role, 'Returned to applicant', reason.trim(), ctx)
    })

    return this.status(caller, id)
  }

  /** Where the permit is in the chain, and what still blocks activation. */
  async status(caller: Caller, id: string) {
    const { permit, role } = await this.load(caller, id)

    const stageIndex = REVIEW_CHAIN.indexOf(permit.status)
    const currentStage = stageIndex >= 0 ? permit.status : null

    const attendees = await this.db.permitAttendee.count({ where: { permitId: id } })
    const unacknowledged = await this.db.permitAttendee.count({
      where: { permitId: id, toolboxAckAt: null },
    })

    return {
      status: permit.status,
      chain: REVIEW_CHAIN.map((s, i) => ({
        stage: s,
        label: STAGE_LABEL[s],
        state: stageIndex < 0
          ? (['approved', 'active', 'suspended', 'closed', 'archived'].includes(permit.status) ? 'done' : 'pending')
          : i < stageIndex ? 'done' : i === stageIndex ? 'current' : 'pending',
        canSign: currentStage === s && (STAGE_ROLES[s] ?? []).includes(role),
      })),
      /** Everything that must be true before this permit can go active. */
      activationBlockers: this.blockers({
        status: permit.status,
        toolboxAt: permit.toolboxAt,
        requiredPpe: permit.requiredPpe,
        ppeAcknowledgedAt: permit.ppeAcknowledgedAt,
        attendees,
        unacknowledged,
      }),
    }
  }

  /** The activation gate. One definition, shared with the permit service. */
  blockers(p: {
    status: string
    toolboxAt: Date | null
    requiredPpe: string[]
    ppeAcknowledgedAt: Date | null
    attendees: number
    unacknowledged: number
  }): string[] {
    return activationBlockers(p)
  }

  // ── Toolbox ────────────────────────────────────────────────────────────────

  /**
   * Record the pre-start briefing.
   *
   * A permit issued without one is the most common finding in a post-incident review, so
   * it is a stored fact with a time and a name rather than a tick.
   */
  async recordToolbox(
    caller: Caller, id: string, input: { heldAt?: string; supervisor?: string },
    ctx: { ip?: string; device?: string } = {},
  ) {
    const { permit, role } = await this.load(caller, id)
    if (['closed', 'archived', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }

    const heldAt = input.heldAt ? new Date(input.heldAt) : new Date()
    if (Number.isNaN(heldAt.getTime())) throw new PermitError('validation', 'That is not a valid time.')
    if (heldAt.getTime() > Date.now() + 60_000) {
      throw new PermitError('validation', 'A toolbox talk cannot be recorded before it has happened.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id },
        data: { toolboxAt: heldAt, toolboxBy: input.supervisor?.trim() || caller.name, version: { increment: 1 } },
      })
      await this.record(
        tx, permit, caller, role, 'Toolbox talk recorded',
        `held ${heldAt.toISOString().slice(0, 16).replace('T', ' ')} by ${input.supervisor?.trim() || caller.name}`,
        ctx,
      )
    })

    return this.status(caller, id)
  }

  /** One person acknowledging they were at the briefing and understood it. */
  async acknowledgeToolbox(caller: Caller, attendeeId: string, ctx: { ip?: string; device?: string } = {}) {
    const row = await this.db.permitAttendee.findUnique({
      where: { id: attendeeId },
      include: { permit: { select: { id: true, companyId: true, code: true, toolboxAt: true } } },
    })
    if (!row) throw new PermitError('not_found', 'That person is not on this permit.', 404)
    const m = this.membership(caller, row.permit.companyId)
    if (!row.permit.toolboxAt) {
      throw new PermitError('validation', 'Record the toolbox talk before anyone acknowledges it.')
    }
    if (row.toolboxAckAt) throw new PermitError('validation', 'Already acknowledged.')

    await this.db.$transaction(async (tx) => {
      await tx.permitAttendee.update({ where: { id: attendeeId }, data: { toolboxAckAt: new Date() } })
      await this.record(
        tx, row.permit, caller, m.role, 'Toolbox acknowledged', row.nameAtAssignment, ctx,
      )
    })

    return this.status(caller, row.permit.id)
  }

  // ── PPE ────────────────────────────────────────────────────────────────────

  async setRequiredPpe(
    caller: Caller, id: string, items: string[], ctx: { ip?: string; device?: string } = {},
  ) {
    const { permit, role } = await this.load(caller, id)
    if (['closed', 'archived', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }

    const clean = [...new Set(items.map((i) => i.trim()).filter(Boolean))]

    await this.db.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id },
        // Changing the list voids the acknowledgement: what was signed for is no longer
        // what is required.
        data: {
          requiredPpe: clean,
          ppeAcknowledgedAt: null,
          ppeAcknowledgedBy: null,
          version: { increment: 1 },
        },
      })
      await this.record(tx, permit, caller, role, 'Required PPE set', clean.join(', ') || 'none', ctx)
    })

    return this.status(caller, id)
  }

  async acknowledgePpe(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const { permit, role } = await this.load(caller, id)
    if (permit.requiredPpe.length === 0) {
      throw new PermitError('validation', 'No PPE has been specified for this permit.')
    }
    if (permit.ppeAcknowledgedAt) throw new PermitError('validation', 'PPE has already been acknowledged.')

    await this.db.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id },
        data: { ppeAcknowledgedAt: new Date(), ppeAcknowledgedBy: caller.name, version: { increment: 1 } },
      })
      await this.record(
        tx, permit, caller, role, 'PPE checked and acknowledged', permit.requiredPpe.join(', '), ctx,
      )
    })

    return this.status(caller, id)
  }

  // ── JSA ────────────────────────────────────────────────────────────────────

  async listJsa(caller: Caller, id: string) {
    await this.load(caller, id)
    return this.db.permitJsaStep.findMany({ where: { permitId: id }, orderBy: { sequence: 'asc' } })
  }

  async addJsaStep(caller: Caller, id: string, input: {
    step?: string; hazard: string; risk?: string; control: string
    responsible?: string; residualRisk?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const { permit, role } = await this.load(caller, id)
    if (['closed', 'archived', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }
    if (!input.hazard?.trim()) throw new PermitError('validation', 'Name the hazard.')
    if (!input.control?.trim()) throw new PermitError('validation', 'A hazard without a control is not an analysis.')

    const last = await this.db.permitJsaStep.findFirst({
      where: { permitId: id }, orderBy: { sequence: 'desc' }, select: { sequence: true },
    })

    return this.db.$transaction(async (tx) => {
      const created = await tx.permitJsaStep.create({
        data: {
          permitId: id,
          sequence: (last?.sequence ?? 0) + 1,
          step: input.step?.trim() ?? '',
          hazard: input.hazard.trim(),
          risk: input.risk?.trim() ?? '',
          control: input.control.trim(),
          responsible: input.responsible?.trim() ?? '',
          residualRisk: input.residualRisk?.trim() ?? '',
          createdBy: caller.name,
        },
      })
      // Bumping the permit version is what makes the JSA versioned: an approver who
      // signed version 3 did not sign version 4.
      await tx.permit.update({ where: { id }, data: { version: { increment: 1 } } })
      await this.record(tx, permit, caller, role, 'JSA step added', created.hazard, ctx)
      return created
    })
  }

  async updateJsaStep(caller: Caller, stepId: string, patch: {
    step?: string; hazard?: string; risk?: string; control?: string
    responsible?: string; residualRisk?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.permitJsaStep.findUnique({
      where: { id: stepId },
      include: { permit: { select: { id: true, companyId: true, code: true, status: true } } },
    })
    if (!existing) throw new PermitError('not_found', 'JSA step not found.', 404)
    const m = this.membership(caller, existing.permit.companyId)
    if (['closed', 'archived', 'rejected'].includes(existing.permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }
    if (patch.hazard !== undefined && !patch.hazard.trim()) {
      throw new PermitError('validation', 'Name the hazard.')
    }
    if (patch.control !== undefined && !patch.control.trim()) {
      throw new PermitError('validation', 'A hazard without a control is not an analysis.')
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.permitJsaStep.update({
        where: { id: stepId },
        data: {
          ...(patch.step !== undefined ? { step: patch.step.trim() } : {}),
          ...(patch.hazard !== undefined ? { hazard: patch.hazard.trim() } : {}),
          ...(patch.risk !== undefined ? { risk: patch.risk.trim() } : {}),
          ...(patch.control !== undefined ? { control: patch.control.trim() } : {}),
          ...(patch.responsible !== undefined ? { responsible: patch.responsible.trim() } : {}),
          ...(patch.residualRisk !== undefined ? { residualRisk: patch.residualRisk.trim() } : {}),
        },
      })
      await tx.permit.update({ where: { id: existing.permit.id }, data: { version: { increment: 1 } } })
      await this.record(
        tx, existing.permit, caller, m.role, 'JSA step edited',
        `${existing.hazard} -> ${updated.hazard}`, ctx,
      )
      return updated
    })
  }

  async removeJsaStep(caller: Caller, stepId: string, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.permitJsaStep.findUnique({
      where: { id: stepId },
      include: { permit: { select: { id: true, companyId: true, code: true, status: true } } },
    })
    if (!existing) throw new PermitError('not_found', 'JSA step not found.', 404)
    const m = this.membership(caller, existing.permit.companyId)
    if (['closed', 'archived', 'rejected'].includes(existing.permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.permitJsaStep.delete({ where: { id: stepId } })
      await tx.permit.update({ where: { id: existing.permit.id }, data: { version: { increment: 1 } } })
      await this.record(tx, existing.permit, caller, m.role, 'JSA step removed', existing.hazard, ctx)
    })
  }
}
