import type { PrismaClient } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller } from './incidentService.js'
import { DomainError } from './errors.js'

export class ActivityError extends DomainError {}

/**
 * The organisation's activity feed.
 *
 * Nothing here is stored. Every vertical already keeps an append-only trail of what was
 * done to its own records — IncidentEvent, PermitEvent, AuditEvent, the corrective
 * action register, issued certificates — and the feed is those trails merged and sorted.
 * A separate "activity" table would be a second copy of facts that already exist, and a
 * second copy is a copy that can disagree.
 */

export type TimelineKind =
  | 'incident_reported' | 'investigation_started' | 'action_assigned' | 'action_completed'
  | 'audit_created' | 'training_completed' | 'permit_issued' | 'inspection_completed'

export interface ActivityItem {
  id: string
  at: Date
  kind: TimelineKind
  actor: string
  /** What they did, as a verb phrase. */
  text: string
  /** What they did it to. */
  target: string
  siteId: string | null
}

const LIMIT = 40

export class ActivityService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new ActivityError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  /**
   * Recent activity across the workspace.
   *
   * Each source is queried for its own most-recent slice and the merged result is cut to
   * the feed length, so one noisy module cannot crowd the others out of the query while
   * still losing to them on time.
   */
  async list(caller: Caller, companyId: string, siteId?: string | null): Promise<ActivityItem[]> {
    this.membership(caller, companyId)

    const [incidentEvents, actions, permitEvents, auditEvents, certificates, inspections] =
      await this.db.$transaction([
        this.db.incidentEvent.findMany({
          where: {
            incident: { companyId, archived: false, ...(siteId ? { siteId } : {}) },
            action: { in: ['Incident reported', 'Moved to investigation'] },
          },
          include: { incident: { select: { number: true, title: true, siteId: true } } },
          orderBy: { at: 'desc' },
          take: LIMIT,
        }),
        this.db.correctiveAction.findMany({
          where: { companyId, ...(siteId ? { siteId } : {}) },
          orderBy: { updatedAt: 'desc' },
          take: LIMIT,
        }),
        this.db.permitEvent.findMany({
          where: {
            permit: { companyId, ...(siteId ? { siteId } : {}) },
            action: { in: ['Approved', 'Suspended'] },
          },
          include: { permit: { select: { code: true, title: true, siteId: true } } },
          orderBy: { at: 'desc' },
          take: LIMIT,
        }),
        this.db.auditEvent.findMany({
          where: {
            audit: { companyId, ...(siteId ? { siteId } : {}) },
            action: { in: ['Audit created', 'Audit completed', 'Finding raised'] },
          },
          include: { audit: { select: { code: true, title: true, siteId: true } } },
          orderBy: { at: 'desc' },
          take: LIMIT,
        }),
        this.db.certificate.findMany({
          where: { companyId },
          include: { employee: { select: { name: true, siteId: true } } },
          orderBy: { issueDate: 'desc' },
          take: LIMIT,
        }),
        this.db.inspection.findMany({
          where: { companyId, status: 'completed', ...(siteId ? { siteId } : {}) },
          include: { asset: { select: { code: true, name: true } } },
          orderBy: { completedAt: 'desc' },
          take: LIMIT,
        }),
      ])

    const items: ActivityItem[] = []

    for (const e of incidentEvents) {
      items.push({
        id: `ie-${e.id}`,
        at: e.at,
        kind: e.action === 'Incident reported' ? 'incident_reported' : 'investigation_started',
        actor: e.actor,
        text: e.action === 'Incident reported' ? 'reported' : 'started the investigation for',
        target: `${e.incident.number} · ${e.incident.title}`,
        siteId: e.incident.siteId,
      })
    }

    for (const a of actions) {
      // The register keeps one row per action, so the feed reports where it has got to
      // rather than inventing a separate entry for every transition.
      const settled = a.status === 'verified' || a.status === 'completed'
      items.push({
        id: `ca-${a.id}`,
        at: a.updatedAt,
        kind: settled ? 'action_completed' : 'action_assigned',
        actor: settled ? (a.verifiedBy ?? a.owner) : a.createdBy,
        text: settled
          ? (a.status === 'verified' ? 'verified completion of' : 'completed')
          : 'assigned corrective action',
        target: `${a.code} · ${a.title}`,
        siteId: a.siteId,
      })
    }

    for (const e of permitEvents) {
      items.push({
        id: `pe-${e.id}`,
        at: e.at,
        kind: 'permit_issued',
        actor: e.actor,
        text: e.action === 'Approved' ? 'issued permit' : 'suspended permit',
        target: `${e.permit.code} · ${e.permit.title}`,
        siteId: e.permit.siteId,
      })
    }

    for (const e of auditEvents) {
      items.push({
        id: `ae-${e.id}`,
        at: e.at,
        kind: 'audit_created',
        actor: e.actor,
        text: e.action === 'Audit created' ? 'scheduled'
          : e.action === 'Audit completed' ? 'completed'
          : 'raised a finding on',
        target: `${e.audit.code} · ${e.audit.title}`,
        siteId: e.audit.siteId,
      })
    }

    for (const c of certificates) {
      items.push({
        id: `ct-${c.id}`,
        at: c.issueDate,
        kind: 'training_completed',
        actor: c.employee.name,
        text: 'was certified in',
        target: `${c.courseName} (${c.number})`,
        siteId: c.employee.siteId,
      })
    }

    for (const i of inspections) {
      items.push({
        id: `in-${i.id}`,
        at: i.completedAt ?? i.updatedAt,
        kind: 'inspection_completed',
        actor: i.completedBy ?? '—',
        text: i.outcome === 'failed' ? 'recorded a failed inspection of' : 'inspected',
        target: `${i.asset.code} · ${i.asset.name}`,
        siteId: i.siteId,
      })
    }

    // A certificate carries the holder's site, which the SQL filter above cannot reach,
    // so the site filter is completed here rather than left half-applied.
    const scoped = siteId ? items.filter((i) => i.siteId === siteId) : items

    return scoped.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, LIMIT)
  }
}
