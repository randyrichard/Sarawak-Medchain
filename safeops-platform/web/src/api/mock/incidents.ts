// ─── Stateful incident store ─────────────────────────────────────────────────
// In-memory implementation of the incident workflow. Every mutation:
//   1. checks the actor's permission,  2. validates the state transition,
//   3. appends a timeline entry,       4. bumps the version,
//   5. emits notifications.
// The real API keeps this exact contract; UI code never bypasses it.

import { ApiError } from '../types'
import type {
  Actor, AdvancePayload, FiveWhys, Incident, IncidentAction, IncidentAttachment,
  IncidentFilters, IncidentStage, NewIncidentInput, RcaCause,
} from '../incidents'
import { INCIDENT_STAGES, STAGE_LABEL, TYPE_LABEL } from '../incidents'

// roles allowed to run investigations / edit cases
const MANAGE_ROLES = ['admin', 'hse_manager', 'safety_officer']
// roles allowed to approve reviews, verify evidence, close, and archive
const REVIEW_ROLES = ['admin', 'hse_manager']

const SEVERITY_RANK = { Critical: 0, Serious: 1, Moderate: 2, Minor: 3 } as const
export const OVERDUE_AFTER_DAYS = 14

type Notify = (kind: 'incident' | 'action', title: string, detail: string) => void

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const daysAgo = (d: number) => hoursAgo(d * 24)
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10)

let idCounter = 0
const uid = () => `x${(++idCounter).toString(36)}${Date.now().toString(36).slice(-4)}`

const STORAGE_KEY = 'safeops.incidents.v1'

export class IncidentStore {
  private incidents: Incident[] = []
  private nextNumber = 2610
  private notify: Notify

  constructor(notify: Notify) {
    this.notify = notify
    // Survive hard reloads like a real backend would: hydrate persisted state,
    // fall back to seeds on first run (or if storage is corrupt).
    const stored = this.hydrate()
    if (stored) {
      this.incidents = stored.incidents
      this.nextNumber = stored.nextNumber
    } else {
      this.incidents = buildSeeds()
      this.persist()
    }
  }

  private hydrate(): { incidents: Incident[]; nextNumber: number } | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed?.incidents) && typeof parsed?.nextNumber === 'number' ? parsed : null
    } catch {
      return null
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ incidents: this.incidents, nextNumber: this.nextNumber }))
    } catch {
      // storage full/unavailable — the session still works in memory
    }
  }

  // ── queries ────────────────────────────────────────────────────────────────

  list(companyId: string, filters: IncidentFilters): Incident[] {
    const q = filters.q?.trim().toLowerCase()
    return this.incidents
      .filter((i) => i.companyId === companyId && !i.archived)
      .filter((i) => !filters.siteId || i.siteId === filters.siteId)
      .filter((i) => !filters.type || i.type === filters.type)
      .filter((i) => !filters.severity || i.severity === filters.severity)
      .filter((i) => matchesStatus(i, filters.status ?? 'all'))
      .filter(
        (i) =>
          !q ||
          [i.number, i.title, i.reporter, i.investigator ?? '', i.department, i.location]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort(
        (a, b) =>
          (a.stage === 'closed' ? 1 : 0) - (b.stage === 'closed' ? 1 : 0) ||
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          b.reportedAt.localeCompare(a.reportedAt),
      )
  }

  get(id: string): Incident {
    const found = this.incidents.find((i) => i.id === id && !i.archived)
    if (!found) throw new ApiError('not_found', 'Incident not found or archived.')
    return found
  }

  // ── mutations ──────────────────────────────────────────────────────────────

  create(input: NewIncidentInput, actor: Actor): Incident {
    if (!input.title.trim() || !input.description.trim()) {
      throw new ApiError('validation', 'Title and description are required.')
    }
    if (!input.signature.trim()) throw new ApiError('validation', 'A digital signature is required to submit.')
    const now = new Date().toISOString()
    const incident: Incident = {
      id: `inc-${this.nextNumber}`,
      number: `INC-${this.nextNumber++}`,
      version: 1,
      archived: false,
      title: input.title.trim(),
      type: input.type,
      severity: input.severity,
      stage: 'reported',
      highRisk: input.severity === 'Critical',
      companyId: input.companyId,
      siteId: input.siteId,
      department: input.department,
      location: input.location,
      gps: input.gps,
      weather: input.weather,
      occurredAt: input.occurredAt,
      reportedAt: now,
      reporter: input.reporter,
      peopleInvolved: input.peopleInvolved,
      witnesses: input.witnesses,
      immediateActions: input.immediateActions,
      description: input.description,
      signature: input.signature,
      assignedManager: 'Marcus Tan',
      actions: [],
      attachments: input.attachments.map((a) => ({ ...a, id: uid(), at: now, uploadedBy: actor.name })),
      comments: [],
      timeline: [
        entry(actor.name, 'Incident reported', `${TYPE_LABEL[input.type]} · ${input.severity} severity`),
        entry('System', 'Manager assigned', 'Marcus Tan notified for initial assessment'),
      ],
    }
    this.incidents.unshift(incident)
    this.persist()
    this.notify('incident', `New incident reported: ${incident.number}`, `${incident.title} — awaiting initial assessment.`)
    return clone(incident)
  }

  advance(id: string, payload: AdvancePayload, actor: Actor): Incident {
    const incident = this.get(id)
    const from = incident.stage
    if (from === 'closed') throw new ApiError('validation', 'This incident is closed. Reopening requires an HSE Manager (future sprint).')
    const expectedNext = INCIDENT_STAGES[INCIDENT_STAGES.indexOf(from) + 1]
    if (payload.to !== expectedNext) {
      throw new ApiError('validation', `Cannot move from ${STAGE_LABEL[from]} to ${STAGE_LABEL[payload.to]} — next stage is ${STAGE_LABEL[expectedNext]}.`)
    }
    const needsReviewRole = payload.to === 'verification' || payload.to === 'closed'
    this.requireRole(actor, needsReviewRole ? REVIEW_ROLES : MANAGE_ROLES)

    switch (payload.to) {
      case 'assessment': {
        incident.assessment = {
          riskRating: payload.riskRating,
          potentialSeverity: payload.potentialSeverity,
          requiresInvestigation: payload.requiresInvestigation,
          note: payload.note,
          assessedBy: actor.name,
          assessedAt: new Date().toISOString(),
        }
        incident.highRisk =
          incident.highRisk || payload.riskRating === 'High' || payload.riskRating === 'Extreme'
        this.log(incident, actor, 'Initial assessment completed', `Risk rated ${payload.riskRating} · potential ${payload.potentialSeverity}`)
        break
      }
      case 'investigation': {
        if (!payload.investigator.trim()) throw new ApiError('validation', 'An investigator must be assigned.')
        incident.investigator = payload.investigator
        this.log(incident, actor, 'Investigation started', `Lead investigator: ${payload.investigator}`)
        this.notify('incident', `You lead the investigation for ${incident.number}`, `${payload.investigator} assigned — ${incident.title}`)
        break
      }
      case 'rca': {
        if (payload.findings.trim().length < 20) {
          throw new ApiError('validation', 'Findings are too short — summarise what the investigation established.')
        }
        incident.findings = payload.findings.trim()
        this.log(incident, actor, 'Findings recorded, RCA opened')
        break
      }
      case 'actions': {
        const rca = incident.rca
        if (!rca || rca.causes.length === 0 || !rca.fiveWhys.rootStatement.trim()) {
          throw new ApiError('validation', 'RCA needs at least one contributing cause and a 5-Why root statement first.')
        }
        this.log(incident, actor, 'RCA submitted', `${rca.causes.length} contributing cause(s) identified`)
        break
      }
      case 'review': {
        const uncovered = this.causesWithoutActions(incident)
        if (uncovered.length > 0) {
          throw new ApiError('validation', `Every root cause needs at least one corrective action. Missing: ${uncovered.join('; ')}.`)
        }
        const notDone = incident.actions.filter((a) => a.status !== 'Completed' && a.status !== 'Verified')
        if (notDone.length > 0) {
          throw new ApiError('validation', `${notDone.length} corrective action(s) are not completed yet.`)
        }
        this.log(incident, actor, 'Submitted for manager review')
        this.notify('incident', `${incident.number} awaits your review`, `${incident.title} — all corrective actions completed.`)
        break
      }
      case 'verification': {
        if (!payload.reviewNote.trim()) throw new ApiError('validation', 'A review note is required.')
        incident.reviewNote = payload.reviewNote.trim()
        if (incident.rca) {
          incident.rca.approvedBy = actor.name
          incident.rca.approvedAt = new Date().toISOString()
        }
        this.log(incident, actor, 'Root cause approved', 'Manager review passed — verification of evidence begins')
        break
      }
      case 'closed': {
        const unverified = incident.actions.filter((a) => a.status !== 'Verified')
        if (unverified.length > 0) {
          throw new ApiError('validation', `${unverified.length} action(s) still need verification before closing.`)
        }
        if (!payload.closeNote.trim()) throw new ApiError('validation', 'A closing note is required.')
        incident.closeNote = payload.closeNote.trim()
        incident.closedAt = new Date().toISOString()
        this.log(incident, actor, 'Incident closed', payload.closeNote.trim())
        this.notify('incident', `${incident.number} closed`, `${incident.title} — verification complete.`)
        break
      }
    }

    incident.stage = payload.to
    incident.version++
    this.persist()
    return clone(incident)
  }

  saveRca(id: string, causes: RcaCause[], fiveWhys: FiveWhys, actor: Actor): Incident {
    const incident = this.get(id)
    this.requireRole(actor, MANAGE_ROLES)
    if (incident.stage !== 'rca') throw new ApiError('validation', 'RCA can only be edited during the Root Cause Analysis stage.')
    incident.rca = { causes, fiveWhys, approvedBy: incident.rca?.approvedBy, approvedAt: incident.rca?.approvedAt }
    this.log(incident, actor, 'Root cause analysis updated', `${causes.length} cause(s) · 5-Why ${fiveWhys.whys.filter(Boolean).length} level(s)`)
    incident.version++
    this.persist()
    return clone(incident)
  }

  addAction(
    id: string,
    input: Pick<IncidentAction, 'title' | 'causeId' | 'owner' | 'dueDate' | 'priority' | 'evidenceRequired'>,
    actor: Actor,
  ): Incident {
    const incident = this.get(id)
    this.requireRole(actor, MANAGE_ROLES)
    if (incident.stage !== 'rca' && incident.stage !== 'actions') {
      throw new ApiError('validation', 'Corrective actions are raised during RCA or the Corrective Actions stage.')
    }
    if (!input.title.trim() || !input.owner.trim() || !input.dueDate) {
      throw new ApiError('validation', 'Action title, owner and due date are required.')
    }
    incident.actions.push({ ...input, id: uid(), status: 'Open' })
    this.log(incident, actor, 'Corrective action assigned', `${input.title} → ${input.owner}, due ${input.dueDate}`)
    this.notify('action', `Corrective action assigned to ${input.owner}`, `${input.title} (${incident.number}), due ${input.dueDate}.`)
    incident.version++
    this.persist()
    return clone(incident)
  }

  updateAction(
    id: string,
    actionId: string,
    patch: { status?: IncidentAction['status']; evidenceNote?: string },
    actor: Actor,
  ): Incident {
    const incident = this.get(id)
    this.requireRole(actor, MANAGE_ROLES)
    const action = incident.actions.find((a) => a.id === actionId)
    if (!action) throw new ApiError('not_found', 'Action not found.')

    if (patch.evidenceNote !== undefined) action.evidenceNote = patch.evidenceNote.trim() || undefined

    if (patch.status && patch.status !== action.status) {
      if (patch.status === 'Completed') {
        if (action.evidenceRequired && !action.evidenceNote) {
          throw new ApiError('validation', 'This action requires completion evidence before it can be marked complete.')
        }
        action.completedAt = new Date().toISOString()
        this.log(incident, actor, 'Action completed', action.title)
      } else if (patch.status === 'Verified') {
        this.requireRole(actor, REVIEW_ROLES)
        if (action.status !== 'Completed') throw new ApiError('validation', 'Only completed actions can be verified.')
        action.verifiedBy = actor.name
        action.verifiedAt = new Date().toISOString()
        this.log(incident, actor, 'Action verified', action.title)
      } else {
        this.log(incident, actor, `Action moved to ${patch.status}`, action.title)
      }
      action.status = patch.status
    }
    incident.version++
    this.persist()
    return clone(incident)
  }

  addComment(id: string, text: string, mentions: string[], actor: Actor): Incident {
    const incident = this.get(id)
    if (!text.trim()) throw new ApiError('validation', 'Comment cannot be empty.')
    incident.comments.push({ id: uid(), author: actor.name, at: new Date().toISOString(), text: text.trim(), mentions })
    mentions.forEach((m) =>
      this.notify('incident', `${actor.name} mentioned ${m} on ${incident.number}`, text.trim().slice(0, 90)),
    )
    incident.version++
    this.persist()
    return clone(incident)
  }

  addAttachment(id: string, att: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>, actor: Actor): Incident {
    const incident = this.get(id)
    if (incident.stage === 'closed') throw new ApiError('validation', 'Closed incidents are read-only.')
    incident.attachments.push({ ...att, id: uid(), at: new Date().toISOString(), uploadedBy: actor.name })
    this.log(incident, actor, 'Evidence uploaded', att.name)
    incident.version++
    this.persist()
    return clone(incident)
  }

  archive(id: string, actor: Actor): void {
    if (actor.role !== 'admin') throw new ApiError('forbidden', 'Only admins can archive incidents.')
    const incident = this.get(id)
    incident.archived = true
    this.log(incident, actor, 'Incident archived', 'Soft-deleted — recoverable by support')
    incident.version++
    this.persist()
  }

  // ── live stats for Mission Control ─────────────────────────────────────────

  liveStats(companyId: string, siteId: string | null) {
    const scoped = this.incidents.filter(
      (i) => i.companyId === companyId && !i.archived && (!siteId || i.siteId === siteId),
    )
    const open = scoped.filter((i) => i.stage !== 'closed')
    const bySite = new Map<string, number>()
    open.forEach((i) => bySite.set(i.siteId, (bySite.get(i.siteId) ?? 0) + 1))
    const recent = scoped
      .flatMap((i) => i.timeline.map((t) => ({ ...t, incident: i.number, title: i.title })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 3)
    return {
      openIncidents: open.length,
      highRisk: open.filter((i) => i.highRisk).length,
      bySite,
      recent,
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private causesWithoutActions(incident: Incident): string[] {
    const covered = new Set(incident.actions.map((a) => a.causeId).filter(Boolean))
    return (incident.rca?.causes ?? []).filter((c) => !covered.has(c.id)).map((c) => c.category)
  }

  private requireRole(actor: Actor, roles: string[]) {
    if (!roles.includes(actor.role)) {
      throw new ApiError('forbidden', 'Your role does not permit this step. Ask an HSE Manager or Admin.')
    }
  }

  private log(incident: Incident, actor: Actor, action: string, detail?: string) {
    incident.timeline.push(entry(actor.name, action, detail))
  }
}

const entry = (actor: string, action: string, detail?: string) => ({
  id: uid(),
  at: new Date().toISOString(),
  actor,
  action,
  detail,
})

const tl = (at: string, actor: string, action: string, detail?: string) => ({ id: uid(), at, actor, action, detail })

function matchesStatus(i: Incident, status: NonNullable<IncidentFilters['status']>): boolean {
  const daysOpen = (Date.now() - new Date(i.reportedAt).getTime()) / 86400_000
  switch (status) {
    case 'all': return true
    case 'open': return i.stage !== 'closed'
    case 'closed': return i.stage === 'closed'
    case 'overdue': return i.stage !== 'closed' && daysOpen > OVERDUE_AFTER_DAYS
    case 'high_risk': return i.stage !== 'closed' && i.highRisk
    case 'awaiting_review': return i.stage === 'review' || i.stage === 'verification'
    case 'investigating': return i.stage === 'investigation' || i.stage === 'rca'
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

// ─── Seeds — the same narrative Mission Control tells ────────────────────────

function buildSeeds(): Incident[] {
  const base = (over: Partial<Incident>): Incident => ({
    id: '', number: '', version: 3, archived: false,
    title: '', type: 'near_miss', severity: 'Minor', stage: 'reported', highRisk: false,
    companyId: 'big', siteId: 'kch', department: '', location: '',
    occurredAt: daysAgo(3), reportedAt: daysAgo(3), reporter: '',
    peopleInvolved: [], witnesses: [], immediateActions: '', description: '',
    assignedManager: 'Marcus Tan',
    actions: [], attachments: [], comments: [], timeline: [],
    ...over,
  })

  const att = (name: string, kind: IncidentAttachment['kind'], by: string, at: string, sizeKb = 640): IncidentAttachment =>
    ({ id: uid(), name, kind, sizeKb, uploadedBy: by, at })

  return [
    base({
      id: 'inc-2607', number: 'INC-2607',
      title: 'Hydrocarbon leak at loading arm 3', type: 'environmental', severity: 'Critical',
      stage: 'investigation', highRisk: true, siteId: 'btu', department: 'Field Operations',
      location: 'Jetty 2, loading arm 3 manifold', gps: '3.2608° N, 113.0662° E', weather: 'Overcast, 31°C',
      occurredAt: daysAgo(4.2), reportedAt: daysAgo(4),
      reporter: 'Rashid Karim', investigator: 'Amirul Hassan',
      peopleInvolved: [{ name: 'Rashid Karim', role: 'Employee', note: 'Loading master on duty' }],
      witnesses: ['Jetty operator (night shift)'],
      immediateActions: 'ESD triggered, area isolated, spill kit deployed. No injuries.',
      description: 'Flange gasket failure on loading arm 3 released approx. 40L of condensate during transfer. Emergency shutdown functioned correctly; containment held.',
      attachments: [
        att('loading-arm-3-flange.jpg', 'image', 'Rashid Karim', daysAgo(4)),
        att('esd-event-log.pdf', 'pdf', 'Amirul Hassan', daysAgo(3.7)),
        att('cctv-transfer-clip.mp4', 'video', 'Amirul Hassan', daysAgo(3.5), 18240),
      ],
      comments: [
        { id: uid(), author: 'Marcus Tan', at: daysAgo(3.6), text: 'Treat this as CIMAH-reportable until we confirm volumes. @Amirul Hassan please prioritise the gasket batch traceability.', mentions: ['Amirul Hassan'] },
        { id: uid(), author: 'Amirul Hassan', at: daysAgo(3.4), text: 'Batch records requested from warehouse. Same batch used on arms 1 and 2 — recommending precautionary inspection.', mentions: [] },
      ],
      timeline: [
        tl(daysAgo(4), 'Rashid Karim', 'Incident reported', 'Environmental Incident · Critical severity'),
        tl(daysAgo(4), 'System', 'Manager assigned', 'Marcus Tan notified for initial assessment'),
        tl(daysAgo(3.8), 'Marcus Tan', 'Initial assessment completed', 'Risk rated Extreme · potential Critical'),
        tl(daysAgo(3.6), 'Marcus Tan', 'Investigation started', 'Lead investigator: Amirul Hassan'),
        tl(daysAgo(3.5), 'Amirul Hassan', 'Evidence uploaded', 'cctv-transfer-clip.mp4'),
      ],
      assessment: { riskRating: 'Extreme', potentialSeverity: 'Critical', requiresInvestigation: true, note: 'Potential CIMAH-reportable loss of containment.', assessedBy: 'Marcus Tan', assessedAt: daysAgo(3.8) },
    }),

    base({
      id: 'inc-2606', number: 'INC-2606',
      title: 'Forklift near-collision with pedestrian in Aisle D', type: 'near_miss', severity: 'Serious',
      stage: 'rca', siteId: 'sen', department: 'Warehouse', location: 'Aisle D, racking bay 12',
      occurredAt: daysAgo(6.1), reportedAt: daysAgo(6), reporter: 'Grace Lim', investigator: 'Grace Lim',
      peopleInvolved: [{ name: 'Reach truck operator', role: 'Employee' }, { name: 'Picker (pedestrian)', role: 'Employee' }],
      witnesses: ['Inbound shift supervisor'],
      immediateActions: 'Aisle closed, temporary barriers placed, both workers stood down for the shift.',
      description: 'Reach truck reversed into the pedestrian walkway while a barrier segment was removed for racking maintenance and not reinstated.',
      findings: 'Barrier removal permit was issued but had no reinstatement step. Mirror blind spot known but not signed. Interviews complete; CCTV reviewed.',
      attachments: [att('aisle-d-cctv-still.jpg', 'image', 'Grace Lim', daysAgo(5.8)), att('barrier-removal-permit.pdf', 'pdf', 'Grace Lim', daysAgo(5.5))],
      rca: {
        causes: [{ id: 'c-2606-1', category: 'Procedure Failure', description: 'Barrier removal permit lacks a mandatory reinstatement step and sign-back.' }],
        fiveWhys: {
          problem: 'Reach truck reversed into an active pedestrian walkway.',
          whys: [
            'Why was the walkway unprotected? The barrier segment had been removed.',
            'Why was it not reinstated? The maintenance job closed without a reinstatement check.',
            'Why no check? The permit form has no reinstatement step.',
            'Why does the form lack it? Permit template predates the walkway redesign.',
            '',
          ],
          rootStatement: 'Permit-to-work template was never updated after the pedestrian walkway redesign, so barrier reinstatement is not enforced.',
        },
      },
      timeline: [
        tl(daysAgo(6), 'Grace Lim', 'Incident reported', 'Near Miss · Serious severity'),
        tl(daysAgo(5.9), 'Marcus Tan', 'Initial assessment completed', 'Risk rated High · potential Critical'),
        tl(daysAgo(5.7), 'Marcus Tan', 'Investigation started', 'Lead investigator: Grace Lim'),
        tl(daysAgo(4.9), 'Grace Lim', 'Findings recorded, RCA opened'),
      ],
      assessment: { riskRating: 'High', potentialSeverity: 'Critical', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(5.9) },
      highRisk: true,
    }),

    base({
      id: 'inc-2605', number: 'INC-2605',
      title: 'Worker heat exhaustion during fruit bunch harvesting', type: 'mtc', severity: 'Serious',
      stage: 'actions', siteId: 'twu', department: 'Field Operations', location: 'Harvest Block 14',
      occurredAt: daysAgo(9), reportedAt: daysAgo(8.8), reporter: 'Dayang Nurul', investigator: 'Dayang Nurul',
      peopleInvolved: [{ name: 'Harvester (B14 crew)', role: 'Contractor' }],
      witnesses: ['Crew leader Block 14'],
      immediateActions: 'Worker moved to shade, cooled, given ORS; sent to clinic for assessment.',
      description: 'Harvester collapsed after ~4 hours continuous work in 36°C heat. Nearest hydration station was 900m away, exceeding the 400m standard.',
      findings: 'Hydration stations were positioned per the old block map; blocks 12–16 re-planted last year doubled walking distances.',
      rca: {
        causes: [
          { id: 'c-2605-1', category: 'Management System Failure', description: 'Hydration station plan not updated after block re-planting.' },
          { id: 'c-2605-2', category: 'Environmental Factor', description: 'Extreme heat period without adjusted work-rest cycle.' },
        ],
        fiveWhys: {
          problem: 'Harvester collapsed from heat exhaustion in Block 14.',
          whys: [
            'Why did he overheat? Worked ~4h with no hydration break.',
            'Why no break? Nearest station was 900m away.',
            'Why so far? Station layout follows the pre-replanting block map.',
            'Why was the map stale? No trigger exists to review welfare facilities after agronomy changes.',
            '',
          ],
          rootStatement: 'No management-of-change trigger links agronomy re-planting decisions to welfare facility layouts.',
        },
        approvedBy: 'Marcus Tan', approvedAt: daysAgo(6.5),
      },
      actions: [
        { id: 'ca-2605-1', title: 'Deploy mobile hydration stations to blocks 12–16', causeId: 'c-2605-1', owner: 'Dayang Nurul', dueDate: inDays(4), priority: 'High', status: 'In Progress', evidenceRequired: true },
        { id: 'ca-2605-2', title: 'Publish heat-index work-rest cycle for harvest crews', causeId: 'c-2605-2', owner: 'Dayang Nurul', dueDate: inDays(-1), priority: 'Medium', status: 'Completed', evidenceRequired: true, evidenceNote: 'Work-rest matrix signed off by estate manager; briefed to all crew leaders 14 Jul.', completedAt: daysAgo(1) },
      ],
      attachments: [att('block-14-layout.pdf', 'pdf', 'Dayang Nurul', daysAgo(8)), att('clinic-report-summary.pdf', 'pdf', 'Dayang Nurul', daysAgo(7.5))],
      timeline: [
        tl(daysAgo(8.8), 'Dayang Nurul', 'Incident reported', 'Medical Treatment Case · Serious severity'),
        tl(daysAgo(8.5), 'Marcus Tan', 'Initial assessment completed', 'Risk rated High · potential Serious'),
        tl(daysAgo(8.2), 'Marcus Tan', 'Investigation started', 'Lead investigator: Dayang Nurul'),
        tl(daysAgo(7), 'Dayang Nurul', 'Findings recorded, RCA opened'),
        tl(daysAgo(6.5), 'Marcus Tan', 'RCA submitted', '2 contributing cause(s) identified'),
        tl(daysAgo(6.4), 'Dayang Nurul', 'Corrective action assigned', 'Mobile hydration stations → Dayang Nurul'),
        tl(daysAgo(1), 'Dayang Nurul', 'Action completed', 'Heat-index work-rest cycle'),
      ],
      assessment: { riskRating: 'High', potentialSeverity: 'Serious', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(8.5) },
      highRisk: true,
    }),

    base({
      id: 'inc-2604', number: 'INC-2604',
      title: 'Dropped scaffold clamp from Level 12', type: 'property_damage', severity: 'Serious',
      stage: 'review', siteId: 'mri', department: 'Contractors', location: 'Module M-04, level 12 scaffold',
      occurredAt: daysAgo(11), reportedAt: daysAgo(11), reporter: 'Vincent Chai', investigator: 'Vincent Chai',
      peopleInvolved: [{ name: 'Scaffolder (crew A)', role: 'Contractor' }],
      witnesses: ['Banksman', 'Deck supervisor'],
      immediateActions: 'Exclusion zone held; drop area swept; crew stood down pending toolbox talk.',
      description: 'Unsecured clamp fell 34m into the exclusion zone during scaffold strike. Tool lanyard not used despite site rule.',
      findings: 'Lanyard available but not clipped; supervision ratio diluted by concurrent lifts; last DROPS briefing 6 months old.',
      rca: {
        causes: [{ id: 'c-2604-1', category: 'Unsafe Behaviour', description: 'Tool lanyard not used during strike despite availability.' },
                 { id: 'c-2604-2', category: 'Training Deficiency', description: 'DROPS refresher lapsed for the contractor crew.' }],
        fiveWhys: {
          problem: 'A clamp fell 34m during scaffold dismantling.',
          whys: ['Why did it fall? It was unclipped during passing.', 'Why unclipped? Lanyard use is habitually skipped on strikes.', 'Why habitual? Refresher training lapsed and supervision was stretched.', '', ''],
          rootStatement: 'DROPS controls decay without scheduled refreshers tied to contractor mobilisation.',
        },
        approvedBy: 'Marcus Tan', approvedAt: daysAgo(5),
      },
      actions: [
        { id: 'ca-2604-1', title: 'Mandatory tool-lanyard checks at scaffold access points', causeId: 'c-2604-1', owner: 'Vincent Chai', dueDate: inDays(-8), priority: 'High', status: 'Completed', evidenceRequired: true, evidenceNote: 'Access-point checklists live at all 4 gates; spot audits x3 clean.', completedAt: daysAgo(3) },
        { id: 'ca-2604-2', title: 'DROPS refresher for all Miri scaffold crews', causeId: 'c-2604-2', owner: 'Vincent Chai', dueDate: inDays(-4), priority: 'High', status: 'Completed', evidenceRequired: true, evidenceNote: 'Attendance 41/41 signed; assessment pass records filed.', completedAt: daysAgo(2) },
      ],
      attachments: [att('drop-zone-photo.jpg', 'image', 'Vincent Chai', daysAgo(10.6)), att('toolbox-talk-record.pdf', 'pdf', 'Vincent Chai', daysAgo(9))],
      timeline: [
        tl(daysAgo(11), 'Vincent Chai', 'Incident reported', 'Property Damage · Serious severity'),
        tl(daysAgo(10.7), 'Marcus Tan', 'Initial assessment completed', 'Risk rated High · potential Critical'),
        tl(daysAgo(10.4), 'Marcus Tan', 'Investigation started', 'Lead investigator: Vincent Chai'),
        tl(daysAgo(8), 'Vincent Chai', 'Findings recorded, RCA opened'),
        tl(daysAgo(5), 'Marcus Tan', 'RCA submitted', '2 contributing cause(s) identified'),
        tl(daysAgo(2), 'Vincent Chai', 'Action completed', 'DROPS refresher'),
        tl(daysAgo(1.5), 'Vincent Chai', 'Submitted for manager review'),
      ],
      assessment: { riskRating: 'High', potentialSeverity: 'Critical', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(10.7) },
      highRisk: true,
    }),

    base({
      id: 'inc-2603', number: 'INC-2603',
      title: 'Conveyor pinch-point hand laceration', type: 'first_aid', severity: 'Moderate',
      stage: 'verification', siteId: 'kch', department: 'Production', location: 'Line 2, return roller station',
      occurredAt: daysAgo(14), reportedAt: daysAgo(14), reporter: 'Sarah Wong', investigator: 'Sarah Wong',
      peopleInvolved: [{ name: 'Line 2 operator', role: 'Employee' }],
      witnesses: [],
      immediateActions: 'First aid given on site; interim guard fitted the same shift.',
      description: 'Operator sustained a laceration clearing a jam near an unguarded return roller.',
      findings: 'Guarding gap introduced during last belt replacement; jam-clearing done live against SOP.',
      rca: {
        causes: [{ id: 'c-2603-1', category: 'Unsafe Condition', description: 'Return roller left unguarded after belt replacement.' }],
        fiveWhys: {
          problem: 'Operator lacerated hand at return roller.',
          whys: ['Why injured? Reached into an unguarded pinch point.', 'Why unguarded? Guard not re-fitted after maintenance.', 'Why not re-fitted? No post-maintenance guarding checklist.', '', ''],
          rootStatement: 'Maintenance close-out lacks a machine-guarding verification step.',
        },
        approvedBy: 'Marcus Tan', approvedAt: daysAgo(9),
      },
      reviewNote: 'RCA sound; guarding checklist is the systemic fix. Proceed to verification.',
      actions: [
        { id: 'ca-2603-1', title: 'Install permanent guarding on line 2 return rollers', causeId: 'c-2603-1', owner: 'Ganesh Pillai', dueDate: inDays(-2), priority: 'High', status: 'Completed', evidenceRequired: true, evidenceNote: 'Fixed guards installed and torque-checked; photos filed.', completedAt: daysAgo(2.5) },
        { id: 'ca-2603-2', title: 'Add guarding verification to maintenance close-out checklist', causeId: 'c-2603-1', owner: 'Sarah Wong', dueDate: inDays(-3), priority: 'Medium', status: 'Completed', evidenceRequired: false, completedAt: daysAgo(3) },
      ],
      attachments: [att('return-roller-guard.jpg', 'image', 'Ganesh Pillai', daysAgo(2.5)), att('first-aid-log.pdf', 'pdf', 'Sarah Wong', daysAgo(13.5))],
      timeline: [
        tl(daysAgo(14), 'Sarah Wong', 'Incident reported', 'First Aid Case · Moderate severity'),
        tl(daysAgo(13.6), 'Marcus Tan', 'Initial assessment completed', 'Risk rated Medium · potential Serious'),
        tl(daysAgo(13), 'Marcus Tan', 'Investigation started', 'Lead investigator: Sarah Wong'),
        tl(daysAgo(10), 'Sarah Wong', 'Findings recorded, RCA opened'),
        tl(daysAgo(9), 'Marcus Tan', 'RCA submitted', '1 contributing cause identified'),
        tl(daysAgo(2.5), 'Ganesh Pillai', 'Action completed', 'Permanent guarding installed'),
        tl(daysAgo(2), 'Sarah Wong', 'Submitted for manager review'),
        tl(daysAgo(1), 'Marcus Tan', 'Root cause approved', 'Manager review passed — verification of evidence begins'),
      ],
      assessment: { riskRating: 'Medium', potentialSeverity: 'Serious', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(13.6) },
    }),

    base({
      id: 'inc-2602', number: 'INC-2602',
      title: 'Compressor stage-2 bearing failure and small fire', type: 'fire', severity: 'Critical',
      stage: 'actions', highRisk: true, siteId: 'btu', department: 'Maintenance', location: 'Export compressor house',
      occurredAt: daysAgo(18), reportedAt: daysAgo(18), reporter: 'Faizal Omar', investigator: 'Faizal Omar',
      peopleInvolved: [{ name: 'Panel operator', role: 'Employee' }],
      witnesses: ['Fire watch (hot work nearby)'],
      immediateActions: 'Fire extinguished in 4 minutes; compressor tripped and isolated.',
      description: 'Bearing seizure on the export compressor ignited lube-oil mist. Vibration alarms had been shelved for 11 days.',
      findings: 'Alarm shelving culture normalised; predictive maintenance thresholds outdated for current duty.',
      rca: {
        causes: [
          { id: 'c-2602-1', category: 'Management System Failure', description: 'Alarm shelving without review or expiry.' },
          { id: 'c-2602-2', category: 'Equipment Failure', description: 'Bearing degradation undetected — PM thresholds stale.' },
        ],
        fiveWhys: {
          problem: 'Compressor bearing seized and ignited oil mist.',
          whys: ['Why seizure? Bearing degraded past limits.', 'Why undetected? Vibration alarms were shelved.', 'Why shelved so long? No expiry or review on shelving.', 'Why no review? Alarm-management standard never operationalised.', ''],
          rootStatement: 'Alarm management standard exists on paper but has no enforcement mechanism in the control room.',
        },
        approvedBy: 'Marcus Tan', approvedAt: daysAgo(12),
      },
      actions: [
        { id: 'ca-2602-1', title: 'Audit & close all shelved alarms > 24h across terminal', causeId: 'c-2602-1', owner: 'Faizal Omar', dueDate: inDays(-4), priority: 'High', status: 'In Progress', evidenceRequired: true },
        { id: 'ca-2602-2', title: 'Refresh vibration alarm thresholds for export duty', causeId: 'c-2602-2', owner: 'Faizal Omar', dueDate: inDays(9), priority: 'High', status: 'In Progress', evidenceRequired: true },
        { id: 'ca-2602-3', title: 'Control-room alarm shelving needs supervisor sign-off + 24h expiry', causeId: 'c-2602-1', owner: 'Rashid Karim', dueDate: inDays(6), priority: 'High', status: 'Open', evidenceRequired: false },
      ],
      attachments: [att('compressor-bearing.jpg', 'image', 'Faizal Omar', daysAgo(17)), att('alarm-shelving-log.xlsx', 'excel', 'Faizal Omar', daysAgo(16)), att('vibration-trend-export.pdf', 'pdf', 'Faizal Omar', daysAgo(15))],
      comments: [{ id: uid(), author: 'Marcus Tan', at: daysAgo(4), text: 'CA on shelved alarms is now 4 days overdue — escalated to site manager per the ladder.', mentions: [] }],
      timeline: [
        tl(daysAgo(18), 'Faizal Omar', 'Incident reported', 'Fire Incident · Critical severity'),
        tl(daysAgo(17.7), 'Marcus Tan', 'Initial assessment completed', 'Risk rated Extreme · potential Critical'),
        tl(daysAgo(17), 'Marcus Tan', 'Investigation started', 'Lead investigator: Faizal Omar'),
        tl(daysAgo(13), 'Faizal Omar', 'Findings recorded, RCA opened'),
        tl(daysAgo(12), 'Marcus Tan', 'RCA submitted', '2 contributing cause(s) identified'),
        tl(daysAgo(4), 'System', 'Investigation escalated', 'CA-2602-1 overdue — site manager notified'),
      ],
      assessment: { riskRating: 'Extreme', potentialSeverity: 'Critical', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(17.7) },
    }),

    base({
      id: 'inc-2598', number: 'INC-2598',
      title: 'Blocked emergency eyewash station in SRU', type: 'unsafe_condition', severity: 'Minor',
      stage: 'reported', siteId: 'btu', department: 'HSE', location: 'Sulfur recovery unit, column C-201',
      occurredAt: hoursAgo(31), reportedAt: hoursAgo(31), reporter: 'Field reporter (QR)',
      peopleInvolved: [], witnesses: [],
      immediateActions: 'Pallet moved aside by reporter; area photographed.',
      description: 'Emergency eyewash station blocked by a staged pallet of drums. Access clearance under 600mm.',
      attachments: [att('eyewash-blocked.jpg', 'image', 'Field reporter (QR)', hoursAgo(31))],
      timeline: [
        tl(hoursAgo(31), 'Field reporter (QR)', 'Incident reported', 'Unsafe Condition · Minor severity'),
        tl(hoursAgo(31), 'System', 'Manager assigned', 'Marcus Tan notified for initial assessment'),
      ],
    }),

    base({
      id: 'inc-2601', number: 'INC-2601',
      title: 'Pallet truck struck racking upright', type: 'vehicle', severity: 'Minor',
      stage: 'closed', siteId: 'sbu', department: 'Logistics', location: 'Staging area, dock 3',
      occurredAt: daysAgo(21), reportedAt: daysAgo(21), reporter: 'Grace Lim', investigator: 'Grace Lim',
      peopleInvolved: [{ name: 'PPT operator', role: 'Employee' }], witnesses: [],
      immediateActions: 'Rack leg inspected — within tolerance. Area coned.',
      description: 'Powered pallet truck clipped a rack leg in the low-light staging area at shift change.',
      findings: 'Lighting below 150 lux at the turn; no damage beyond cosmetic.',
      rca: {
        causes: [{ id: 'c-2601-1', category: 'Unsafe Condition', description: 'Sub-standard lighting in staging area at shift change.' }],
        fiveWhys: { problem: 'PPT clipped rack upright.', whys: ['Why? Operator misjudged the turn.', 'Why? Poor visibility at 19:00 changeover.', 'Why? Two luminaires failed and not replaced.', '', ''], rootStatement: 'Lighting faults had no reporting route to facilities.' },
        approvedBy: 'Marcus Tan', approvedAt: daysAgo(16),
      },
      reviewNote: 'Simple fix, verified on site.',
      closeNote: 'LED upgrade complete; lux survey passed; learning shared in weekly brief.',
      closedAt: daysAgo(12),
      actions: [{ id: 'ca-2601-1', title: 'LED lighting upgrade — staging & dock doors', causeId: 'c-2601-1', owner: 'Grace Lim', dueDate: inDays(-14), priority: 'Low', status: 'Verified', evidenceRequired: true, evidenceNote: 'Post-install lux survey attached.', completedAt: daysAgo(13), verifiedBy: 'Marcus Tan', verifiedAt: daysAgo(12) }],
      attachments: [att('rack-leg-inspection.pdf', 'pdf', 'Grace Lim', daysAgo(20))],
      timeline: [
        tl(daysAgo(21), 'Grace Lim', 'Incident reported', 'Vehicle Accident · Minor severity'),
        tl(daysAgo(20), 'Marcus Tan', 'Initial assessment completed', 'Risk rated Medium · potential Serious'),
        tl(daysAgo(19), 'Marcus Tan', 'Investigation started', 'Lead investigator: Grace Lim'),
        tl(daysAgo(17), 'Grace Lim', 'Findings recorded, RCA opened'),
        tl(daysAgo(16), 'Marcus Tan', 'RCA submitted', '1 contributing cause identified'),
        tl(daysAgo(13), 'Grace Lim', 'Action completed', 'LED lighting upgrade'),
        tl(daysAgo(12.5), 'Marcus Tan', 'Root cause approved', 'Manager review passed'),
        tl(daysAgo(12), 'Marcus Tan', 'Action verified', 'LED lighting upgrade'),
        tl(daysAgo(12), 'Marcus Tan', 'Incident closed', 'Verification complete'),
      ],
      assessment: { riskRating: 'Medium', potentialSeverity: 'Serious', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(20) },
    }),

    base({
      id: 'inc-2599', number: 'INC-2599',
      title: 'Harness clipped to non-rated handrail', type: 'unsafe_act', severity: 'Serious',
      stage: 'closed', siteId: 'mri', department: 'Contractors', location: 'Module M-02, level 8',
      occurredAt: daysAgo(28), reportedAt: daysAgo(28), reporter: 'Vincent Chai', investigator: 'Vincent Chai',
      peopleInvolved: [{ name: 'Scaffolder', role: 'Contractor' }], witnesses: ['Walkdown team'],
      immediateActions: 'Work paused; worker re-anchored to rated point; toolbox talk same day.',
      description: 'Routine walkdown observed a harness anchored to a handrail rated below 15kN.',
      findings: 'Anchor point map outdated for the current scaffold configuration.',
      rca: {
        causes: [{ id: 'c-2599-1', category: 'Training Deficiency', description: 'Crew unaware of updated anchor points after re-scaffold.' }],
        fiveWhys: { problem: 'Worker anchored to non-rated handrail.', whys: ['Why? Believed it was acceptable.', 'Why? Anchor map on site was outdated.', 'Why? Map not reissued after scaffold mod.', '', ''], rootStatement: 'Scaffold modification process does not trigger anchor-map reissue.' },
        approvedBy: 'Marcus Tan', approvedAt: daysAgo(24),
      },
      reviewNote: 'Systemic fix accepted.',
      closeNote: 'Anchor maps now version-controlled and posted at access points.',
      closedAt: daysAgo(20),
      actions: [{ id: 'ca-2599-1', title: 'Re-survey and reissue anchor point maps (all levels)', causeId: 'c-2599-1', owner: 'Vincent Chai', dueDate: inDays(-22), priority: 'Medium', status: 'Verified', evidenceRequired: true, evidenceNote: 'Rev-3 maps posted; crews briefed.', completedAt: daysAgo(21), verifiedBy: 'Marcus Tan', verifiedAt: daysAgo(20) }],
      attachments: [att('anchor-point-map-rev3.pdf', 'pdf', 'Vincent Chai', daysAgo(21))],
      timeline: [
        tl(daysAgo(28), 'Vincent Chai', 'Incident reported', 'Unsafe Act · Serious severity'),
        tl(daysAgo(27), 'Marcus Tan', 'Initial assessment completed', 'Risk rated High · potential Critical'),
        tl(daysAgo(26), 'Marcus Tan', 'Investigation started', 'Lead investigator: Vincent Chai'),
        tl(daysAgo(25), 'Vincent Chai', 'Findings recorded, RCA opened'),
        tl(daysAgo(24), 'Marcus Tan', 'RCA submitted', '1 contributing cause identified'),
        tl(daysAgo(21), 'Vincent Chai', 'Action completed', 'Anchor maps reissued'),
        tl(daysAgo(20.5), 'Marcus Tan', 'Root cause approved', 'Manager review passed'),
        tl(daysAgo(20), 'Marcus Tan', 'Incident closed', 'Verification complete'),
      ],
      assessment: { riskRating: 'High', potentialSeverity: 'Critical', requiresInvestigation: true, assessedBy: 'Marcus Tan', assessedAt: daysAgo(27) },
    }),

    // Kenyalang Construction
    base({
      id: 'inc-k101', number: 'INC-K101',
      title: 'Formwork prop failure during pour — near miss', type: 'near_miss', severity: 'Serious',
      stage: 'rca', highRisk: true, companyId: 'kcs', siteId: 'smh', department: 'M&E Installation', location: 'Zone C, level 2 deck',
      occurredAt: daysAgo(5), reportedAt: daysAgo(5), reporter: 'Azlan Mahmud', investigator: 'Azlan Mahmud',
      peopleInvolved: [{ name: 'Concrete gang (4)', role: 'Contractor' }], witnesses: ['Pour supervisor'],
      immediateActions: 'Pour stopped; deck evacuated; props re-shored under TWE direction.',
      description: 'A prop displaced under load during the deck pour. No collapse; high potential event.',
      findings: 'Prop stock mixes two load ratings visually identical; check-sheet does not record rating.',
      rca: {
        causes: [{ id: 'c-k101-1', category: 'Procedure Failure', description: 'Prop inspection sheet does not capture load rating.' }],
        fiveWhys: {
          problem: 'Prop displaced under pour load.',
          whys: ['Why displaced? Under-rated prop in the array.', 'Why present? Mixed stock, visually identical.', 'Why undetected? Check-sheet omits rating.', '', ''],
          rootStatement: 'Inspection paperwork never adapted after a second prop supplier was onboarded.',
        },
      },
      attachments: [att('prop-array-photo.jpg', 'image', 'Azlan Mahmud', daysAgo(4.8))],
      timeline: [
        tl(daysAgo(5), 'Azlan Mahmud', 'Incident reported', 'Near Miss · Serious severity'),
        tl(daysAgo(4.8), 'Azlan Mahmud', 'Initial assessment completed', 'Risk rated High · potential Critical'),
        tl(daysAgo(4.5), 'Azlan Mahmud', 'Investigation started', 'Lead investigator: Azlan Mahmud'),
        tl(daysAgo(2), 'Azlan Mahmud', 'Findings recorded, RCA opened'),
      ],
      assessment: { riskRating: 'High', potentialSeverity: 'Critical', requiresInvestigation: true, assessedBy: 'Azlan Mahmud', assessedAt: daysAgo(4.8) },
      assignedManager: 'Azlan Mahmud',
    }),

    base({
      id: 'inc-k102', number: 'INC-K102',
      title: 'Unbarricaded excavation on access road', type: 'unsafe_condition', severity: 'Moderate',
      stage: 'reported', companyId: 'kcs', siteId: 'pjy', department: 'Civil Works', location: 'Access road ch. 340',
      occurredAt: hoursAgo(30), reportedAt: hoursAgo(30), reporter: 'Field reporter (QR)',
      peopleInvolved: [], witnesses: [],
      immediateActions: 'Cones placed by reporter.',
      description: '1.2m deep service trench left unbarricaded overnight next to the pedestrian access route.',
      attachments: [],
      timeline: [
        tl(hoursAgo(30), 'Field reporter (QR)', 'Incident reported', 'Unsafe Condition · Moderate severity'),
        tl(hoursAgo(30), 'System', 'Manager assigned', 'Azlan Mahmud notified for initial assessment'),
      ],
      assignedManager: 'Azlan Mahmud',
    }),
  ]
}
