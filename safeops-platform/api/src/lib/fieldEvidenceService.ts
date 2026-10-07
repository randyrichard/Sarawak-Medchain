import type { FieldEvidence, PrismaClient, Role } from '@prisma/client'
import { type Caller, membershipOf } from '../domain/caller.js'
import { isOwnedBy } from '../domain/access.js'
import { DomainError } from '../domain/errors.js'
import { IncidentError, IncidentService } from './incidentService.js'

/**
 * Photos and documents kept against an inspection, an audit answer, or a corrective
 * action raised outside an investigation (FieldEvidence in schema.prisma).
 *
 * Who may add one is who may do the work it proves:
 * - an inspection: its assigned inspector, whoever completed it, or a Safety Officer and above;
 * - an audit: the lead auditor and team, or an HSE Manager and above;
 * - an action: its owner, or a Safety Officer and above, while it is not yet verified or
 *   cancelled - the same people who may update it.
 *
 * Inspections and audits take evidence while they are open and for 24 hours after they are
 * completed - long enough for photos to finish uploading from a phone that lost signal on
 * the way back from the plant room, short enough that a photo added weeks later cannot pass
 * as part of the record. Every row keeps who added it and when, so the timeline is visible.
 *
 * Who may see one is who may see the record it belongs to. Downloads re-check that every
 * time, so a stored file name on its own grants nothing.
 */
export class FieldEvidenceError extends DomainError {}

export type EvidenceTarget =
  | { kind: 'inspection'; id: string }
  | { kind: 'audit'; id: string; itemId?: string }
  | { kind: 'action'; id: string }

/** How long after an inspection or audit is completed its evidence may still be added. */
export const EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000

const MANAGE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']
const REVIEW_ROLES: Role[] = ['admin', 'hse_manager']

interface Resolved {
  companyId: string
  /** The foreign key columns this target sets on a FieldEvidence row. */
  link: { inspectionId?: string; auditId?: string; auditItemId?: string | null; actionId?: string }
}

export class FieldEvidenceService {
  private incidents: IncidentService

  constructor(private db: PrismaClient) {
    this.incidents = new IncidentService(db)
  }

  /** Proves the caller may see the record (and, with `write`, add to it). */
  async resolve(caller: Caller, t: EvidenceTarget, write: boolean): Promise<Resolved> {
    const now = Date.now()
    const withinWindow = (completedAt: Date | null) =>
      !!completedAt && now - completedAt.getTime() <= EVIDENCE_WINDOW_MS

    if (t.kind === 'inspection') {
      const i = await this.db.inspection.findUnique({
        where: { id: t.id },
        select: { companyId: true, status: true, assignedTo: true, completedBy: true, completedAt: true },
      })
      if (!i) throw new FieldEvidenceError('not_found', 'Inspection not found.', 404)
      const m = membershipOf(caller, i.companyId, FieldEvidenceError)
      if (write) {
        const mayRun = MANAGE_ROLES.includes(m.role) || i.assignedTo === caller.name || i.completedBy === caller.name
        if (!mayRun) {
          throw new FieldEvidenceError('forbidden', 'Only the inspector (or a Safety Officer and above) can add photos to this inspection.', 403)
        }
        if (!(i.status === 'scheduled' || withinWindow(i.completedAt))) {
          throw new FieldEvidenceError('validation', 'Photos can be added to an inspection only until 24 hours after it was completed.')
        }
      }
      return { companyId: i.companyId, link: { inspectionId: t.id } }
    }

    if (t.kind === 'audit') {
      const a = await this.db.audit.findUnique({
        where: { id: t.id },
        select: { companyId: true, status: true, leadAuditor: true, team: true, completedAt: true, answers: true },
      })
      if (!a) throw new FieldEvidenceError('not_found', 'Audit not found.', 404)
      const m = membershipOf(caller, a.companyId, FieldEvidenceError)
      const itemId = t.itemId?.trim() || null
      if (write) {
        const mayRun = REVIEW_ROLES.includes(m.role) || a.leadAuditor === caller.name || a.team.includes(caller.name)
        if (!mayRun) {
          throw new FieldEvidenceError('forbidden', 'Only the audit team (or an HSE Manager and above) can add photos to this audit.', 403)
        }
        if (!(a.status === 'in_progress' || withinWindow(a.completedAt))) {
          throw new FieldEvidenceError('validation', 'Photos can be added to an audit while it is in progress and until 24 hours after it was completed.')
        }
        if (itemId) {
          if (itemId.length > 100) throw new FieldEvidenceError('validation', 'That checklist item is not on this audit.')
          // Once answered, a photo can only be for an item that was actually answered.
          const answered = Array.isArray(a.answers) ? (a.answers as { itemId?: string }[]).map((x) => x.itemId) : null
          if (answered && !answered.includes(itemId)) {
            throw new FieldEvidenceError('validation', 'That checklist item is not on this audit.')
          }
        }
      }
      return { companyId: a.companyId, link: { auditId: t.id, auditItemId: itemId } }
    }

    // A corrective action. Visibility is the register's own rule, so it is asked of the
    // service that owns it rather than restated here.
    let action
    try {
      action = await this.incidents.getAction(caller, t.id)
    } catch (e) {
      if (e instanceof IncidentError) throw new FieldEvidenceError(e.code, e.message, e.status)
      throw e
    }
    if (write) {
      if (action.incidentId) {
        throw new FieldEvidenceError('validation', 'This action belongs to an incident. Add its evidence on the incident.')
      }
      const m = membershipOf(caller, action.companyId, FieldEvidenceError)
      if (!isOwnedBy(action, caller) && !MANAGE_ROLES.includes(m.role)) {
        throw new FieldEvidenceError('forbidden', 'You can only add evidence to actions assigned to you.', 403)
      }
      if (action.status === 'verified' || action.status === 'cancelled') {
        throw new FieldEvidenceError('validation', 'This action is closed. Evidence can no longer be added.')
      }
    }
    return { companyId: action.companyId, link: { actionId: t.id } }
  }

  /** Records stored files against the target. The bytes are already on disk and hashed. */
  async add(caller: Caller, t: EvidenceTarget, files: {
    originalName: string; storedName: string; mimeType: string; sizeBytes: number; checksum: string
  }[]): Promise<FieldEvidence[]> {
    const { companyId, link } = await this.resolve(caller, t, true)
    return this.db.$transaction(async (tx) => {
      const rows: FieldEvidence[] = []
      for (const f of files) {
        rows.push(await tx.fieldEvidence.create({
          data: {
            companyId, ...link,
            originalName: f.originalName.slice(0, 255),
            storedName: f.storedName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, checksum: f.checksum,
            uploadedBy: caller.name, uploadedById: caller.userId,
          },
        }))
      }
      // The inspection's photo count is the number actually kept - the old field was
      // whatever number the browser sent, for photos it then threw away.
      if (link.inspectionId) {
        const n = await tx.fieldEvidence.count({ where: { inspectionId: link.inspectionId } })
        await tx.inspection.update({ where: { id: link.inspectionId }, data: { photoCount: n } })
      }
      if (link.auditId) {
        await tx.auditEvent.create({
          data: {
            auditId: link.auditId,
            action: 'Evidence uploaded',
            detail: files.map((f) => f.originalName.slice(0, 120)).join(', ').slice(0, 500)
              + (link.auditItemId ? ` (item ${link.auditItemId})` : ''),
            actor: caller.name,
            actorRole: membershipOf(caller, companyId, FieldEvidenceError).role,
          },
        })
      }
      return rows
    })
  }

  async list(caller: Caller, t: EvidenceTarget): Promise<FieldEvidence[]> {
    const { link } = await this.resolve(caller, t, false)
    return this.db.fieldEvidence.findMany({
      where: link.inspectionId ? { inspectionId: link.inspectionId }
        : link.auditId ? { auditId: link.auditId }
        : { actionId: link.actionId },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** One file, if the caller may see the record it belongs to. */
  async get(caller: Caller, evidenceId: string): Promise<FieldEvidence> {
    const row = await this.db.fieldEvidence.findUnique({ where: { id: evidenceId } })
    if (!row || !caller.roles.some((r) => r.companyId === row.companyId)) {
      throw new FieldEvidenceError('not_found', 'File not found.', 404)
    }
    const target: EvidenceTarget = row.inspectionId ? { kind: 'inspection', id: row.inspectionId }
      : row.auditId ? { kind: 'audit', id: row.auditId }
      : { kind: 'action', id: row.actionId! }
    await this.resolve(caller, target, false)
    return row
  }
}

/** Shape sent to the browser: no stored file name, which is the server's business. */
export const toEvidenceView = (r: FieldEvidence) => ({
  id: r.id,
  name: r.originalName,
  mimeType: r.mimeType,
  sizeBytes: r.sizeBytes,
  auditItemId: r.auditItemId,
  uploadedBy: r.uploadedBy,
  createdAt: r.createdAt.toISOString(),
})
