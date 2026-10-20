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
import { PermitError, WINDOW_PASSED } from './permitService.js'
import { activationBlockers } from './permitCatalog.js'
import { equipmentBlockers } from './equipmentService.js'
import { membershipOf, type Caller } from '../domain/caller.js'
import {
  alreadyAccepted, claim, isNamedRowClash, isReplay, recordedAtOf, type FieldRecordMeta,
} from './fieldRecord.js'

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
    return membershipOf(caller, companyId, PermitError)
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
        // The floor under a time reported by a device: nothing recorded in the field can
        // predate the permit it is recorded against (see fieldRecord.recordedAtOf).
        createdAt: true,
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
    // Every stage is a step towards approval, and approval needs a window still to come.
    if (permit.validTo.getTime() < Date.now()) {
      throw new PermitError('validation', WINDOW_PASSED)
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
    const equipment = await equipmentBlockers(this.db, id)

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
        equipment,
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
    equipment?: string[]
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
    meta?: FieldRecordMeta,
  ) {
    const { permit, role } = await this.load(caller, id)
    if (await alreadyAccepted(this.db, permit.companyId, meta?.clientRef)) {
      return this.status(caller, id)
    }
    if (['closed', 'archived', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }

    /*
     * A toolbox talk is held at the job, standing in front of the work, and it is the one
     * thing on a permit that already had a field time of its own: `heldAt`. A record made
     * offline says nothing different, so recordedAt is the fallback rather than a second
     * mechanism — whichever the device supplied, the talk is filed when it happened.
     */
    const heldAt = input.heldAt
      ? new Date(input.heldAt)
      : recordedAtOf(meta, new Date(), { earliest: permit.createdAt })
    if (Number.isNaN(heldAt.getTime())) throw new PermitError('validation', 'That is not a valid time.')
    if (heldAt.getTime() > Date.now() + 60_000) {
      throw new PermitError('validation', 'A toolbox talk cannot be recorded before it has happened.')
    }

    try {
      await this.db.$transaction(async (tx) => {
        await claim(tx, meta, {
          companyId: permit.companyId, operation: 'permit.toolbox', subjectId: id,
          userId: caller.userId, recordedAt: heldAt,
        })
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
    } catch (e) {
      if (isReplay(e)) return this.status(caller, id)
      throw e
    }

    return this.status(caller, id)
  }

  /** One person acknowledging they were at the briefing and understood it. */
  async acknowledgeToolbox(
    caller: Caller, attendeeId: string, ctx: { ip?: string; device?: string } = {},
    meta?: FieldRecordMeta,
  ) {
    const row = await this.db.permitAttendee.findUnique({
      where: { id: attendeeId },
      include: { permit: { select: { id: true, companyId: true, code: true, toolboxAt: true } } },
    })
    if (!row) throw new PermitError('not_found', 'That person is not on this permit.', 404)
    const m = this.membership(caller, row.permit.companyId)

    /*
     * Before "Already acknowledged", which a replay trips by definition: the first copy of
     * this record is what acknowledged it. Refused, the queue would read a 400 as a payload
     * the server will never take, mark it blocked, and show a worker's acknowledgement as
     * something that failed to send.
     */
    if (await alreadyAccepted(this.db, row.permit.companyId, meta?.clientRef)) {
      return this.status(caller, row.permit.id)
    }
    if (!row.permit.toolboxAt) {
      throw new PermitError('validation', 'Record the toolbox talk before anyone acknowledges it.')
    }
    if (row.toolboxAckAt) throw new PermitError('validation', 'Already acknowledged.')

    const at = recordedAtOf(meta, new Date(), { earliest: row.permit.toolboxAt })

    try {
      await this.db.$transaction(async (tx) => {
        await claim(tx, meta, {
          companyId: row.permit.companyId, operation: 'permit.toolbox-ack', subjectId: row.permit.id,
          userId: caller.userId, recordedAt: at,
        })
        await tx.permitAttendee.update({ where: { id: attendeeId }, data: { toolboxAckAt: at } })
        await this.record(
          tx, row.permit, caller, m.role, 'Toolbox acknowledged', row.nameAtAssignment, ctx,
        )
      })
    } catch (e) {
      if (isReplay(e)) return this.status(caller, row.permit.id)
      throw e
    }

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

  async acknowledgePpe(
    caller: Caller, id: string, ctx: { ip?: string; device?: string } = {},
    meta?: FieldRecordMeta,
  ) {
    const { permit, role } = await this.load(caller, id)
    // Before "already acknowledged", for the same reason as the toolbox acknowledgement.
    if (await alreadyAccepted(this.db, permit.companyId, meta?.clientRef)) {
      return this.status(caller, id)
    }
    if (permit.requiredPpe.length === 0) {
      throw new PermitError('validation', 'No PPE has been specified for this permit.')
    }
    if (permit.ppeAcknowledgedAt) throw new PermitError('validation', 'PPE has already been acknowledged.')

    const at = recordedAtOf(meta, new Date(), { earliest: permit.createdAt })

    try {
      await this.db.$transaction(async (tx) => {
        await claim(tx, meta, {
          companyId: permit.companyId, operation: 'permit.ppe-ack', subjectId: id,
          userId: caller.userId, recordedAt: at,
        })
        await tx.permit.update({
          where: { id },
          data: { ppeAcknowledgedAt: at, ppeAcknowledgedBy: caller.name, version: { increment: 1 } },
        })
        await this.record(
          tx, permit, caller, role, 'PPE checked and acknowledged', permit.requiredPpe.join(', '), ctx,
        )
      })
    } catch (e) {
      if (isReplay(e)) return this.status(caller, id)
      throw e
    }

    return this.status(caller, id)
  }

  // ── JSA ────────────────────────────────────────────────────────────────────

  async listJsa(caller: Caller, id: string) {
    await this.load(caller, id)
    return this.db.permitJsaStep.findMany({ where: { permitId: id }, orderBy: { sequence: 'asc' } })
  }

  /**
   * Adds a row to the analysis — at the permit desk, or at the job with no signal.
   *
   * `clientId` is the name a device gave the row before the server had ever heard of it.
   * It is kept beside the row's own id rather than used as the id: a device naming a
   * primary key would be reaching into an id space shared by every tenant, and all that is
   * needed here is that the device can recognise its own row when it comes back.
   */
  async addJsaStep(caller: Caller, id: string, input: {
    step?: string; hazard: string; risk?: string; control: string
    responsible?: string; residualRisk?: string; clientId?: string
  }, ctx: { ip?: string; device?: string } = {}, meta?: FieldRecordMeta) {
    const { permit, role } = await this.load(caller, id)
    const clientId = input.clientId?.trim() || null

    /*
     * A replay must not add the hazard twice.
     *
     * A JSA with the same step listed twice is not merely untidy: the analysis is what the
     * approver signed, and a duplicated hazard reads as two separate exposures with two
     * separate controls.
     *
     * A row the device named answers this exactly: the same name is the same row, whatever
     * its text says now. That matters more than it looks for a row created offline, because
     * such a row is usually edited after it was created — so by the time a replay arrives,
     * the hazard on the server may no longer be the hazard in the queued copy.
     */
    if (clientId) {
      const already = await this.db.permitJsaStep.findFirst({ where: { permitId: id, clientId } })
      if (already) return already
    } else if (await alreadyAccepted(this.db, permit.companyId, meta?.clientRef)) {
      /*
       * Nothing named it, so the idempotency key is all there is, and the row it created
       * has to be guessed at from its hazard text — which two genuinely different steps are
       * free to share. A stopgap, kept only for records queued by a device that predates
       * clientId; those drain within a day or two and then stop existing.
       */
      const already = await this.db.permitJsaStep.findFirst({
        where: { permitId: id, hazard: input.hazard?.trim() ?? '' },
        orderBy: { sequence: 'desc' },
      })
      if (already) return already
    }
    if (['closed', 'archived', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is closed.')
    }
    if (!input.hazard?.trim()) throw new PermitError('validation', 'Name the hazard.')
    if (!input.control?.trim()) throw new PermitError('validation', 'A hazard without a control is not an analysis.')

    const at = recordedAtOf(meta, new Date(), { earliest: permit.createdAt })

    try {
      return await this.db.$transaction(async (tx) => {
        await claim(tx, meta, {
          companyId: permit.companyId, operation: 'permit.jsa-add', subjectId: id,
          userId: caller.userId, recordedAt: at,
        })
        /*
         * Bumping the permit version is what makes the JSA versioned: an approver who
         * signed version 3 did not sign version 4. A row written on a phone hours earlier
         * bumps it exactly as one typed at the desk does — a late row is allowed to land on
         * an approved permit only because its landing is visible.
         *
         * First in the transaction rather than last, and that is a lock rather than
         * housekeeping: it takes the permit row, so a second add on the same permit waits
         * here instead of racing the sequence read below.
         */
        await tx.permit.update({ where: { id }, data: { version: { increment: 1 } } })

        /*
         * The next position.
         *
         * Two rows arriving together would otherwise both read the same last sequence and
         * both take it — which a phone draining its queue while the permit desk adds a row
         * on a laptop makes ordinary rather than exotic. Reading inside the transaction is
         * not enough on its own: under read-committed both snapshots predate either commit,
         * which is what the lock above is for. The JSA is the sequence of the job, and two
         * steps sharing a position sort arbitrarily — putting a control under the wrong
         * step on the document somebody signs.
         *
         * A row recorded in the field lands at the end rather than where the device showed
         * it. That is the honest position: of the steps the permit has, it is the one added
         * last.
         */
        const last = await tx.permitJsaStep.findFirst({
          where: { permitId: id }, orderBy: { sequence: 'desc' }, select: { sequence: true },
        })
        const created = await tx.permitJsaStep.create({
          data: {
            permitId: id,
            clientId,
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
        await this.record(tx, permit, caller, role, 'JSA step added', created.hazard, ctx)
        return created
      })
    } catch (e) {
      /*
       * Two copies of the same record in flight together, which the checks above are too
       * early to see: one of them lost a race, on its idempotency key or on the row's name,
       * and the row the winner wrote is the answer. Returning it rather than the error is
       * what keeps the queue from marking a hazard that *is* on the analysis as refused.
       */
      if (isReplay(e) || (clientId && isNamedRowClash(e))) {
        const already = await this.db.permitJsaStep.findFirst({
          where: { permitId: id, ...(clientId ? { clientId } : { hazard: input.hazard.trim() }) },
          orderBy: { sequence: 'desc' },
        })
        if (already) return already
      }
      throw e
    }
  }

  async updateJsaStep(caller: Caller, stepId: string, patch: {
    step?: string; hazard?: string; risk?: string; control?: string
    responsible?: string; residualRisk?: string
  }, ctx: { ip?: string; device?: string } = {}, meta?: FieldRecordMeta) {
    const existing = await this.db.permitJsaStep.findUnique({
      where: { id: stepId },
      include: { permit: { select: { id: true, companyId: true, code: true, status: true } } },
    })
    if (!existing) throw new PermitError('not_found', 'JSA step not found.', 404)
    const m = this.membership(caller, existing.permit.companyId)
    // An edit is idempotent in its effect, but replaying it writes a second "JSA step
    // edited" line to the trail, which reads as the analysis being changed twice.
    if (await alreadyAccepted(this.db, existing.permit.companyId, meta?.clientRef)) {
      return existing
    }
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
      await claim(tx, meta, {
        companyId: existing.permit.companyId, operation: 'permit.jsa-update',
        subjectId: existing.permit.id, userId: caller.userId,
        recordedAt: recordedAtOf(meta, new Date()),
      })
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
