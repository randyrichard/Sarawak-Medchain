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
import type {
  CapaAnalytics, CapaDerivedStatus, CapaFilters, CapaItem, CapaPatch, CapaStats,
  CapaTimelineEntry, NewStandaloneAction,
} from '../capa'
import type {
  Asset, AssetFilters, AssetStats, AssetView, CompleteInspectionInput, Inspection,
  InspectionFilters, InspectionView, NewAssetInput,
} from '../assets'
import { FREQUENCY_DAYS } from '../assets'
import { buildAssetSeeds, buildInspectionSeeds, CHECKLISTS } from './assets'
import type {
  Audit, AuditFilters, AuditFinding, AuditFindingView, AuditStats, AuditTemplate,
  AuditView, CompleteAuditInput, ComplianceDocument, ComplianceObligation,
  DocKind, NewAuditInput, ObligationView,
} from '../audits'
import { SEVERITY_DUE_DAYS } from '../audits'
import { AUDIT_TEMPLATES, buildAuditSeeds, buildDocumentSeeds, buildObligationSeeds } from './audits'
import type {
  Certificate, CertificateView, CertVerification, CompetencyLevel, CompetencyStatus,
  CompleteSessionInput, CourseView, EmployeeCompetency, EmployeeTrainingProfile, MatrixCell,
  NewCourseInput, NewSessionInput, SessionAttendee, SessionFilters, SessionView, TrainingCourse,
  TrainingFilters, TrainingMatrix, TrainingSession, TrainingStats,
} from '../training'
import {
  buildCertificateSeeds, buildSessionSeeds, courseApplies, deptNameOf, requiredCoursesFor,
  rosterFor, TRAINING_COURSES,
} from './training'
import { EMPLOYEES } from './fixtures'

// roles allowed to run investigations / edit cases
const MANAGE_ROLES = ['admin', 'hse_manager', 'safety_officer']
// roles allowed to approve reviews, verify evidence, close, and archive
const REVIEW_ROLES = ['admin', 'hse_manager']

const SEVERITY_RANK = { Critical: 0, Serious: 1, Moderate: 2, Minor: 3 } as const
export const OVERDUE_AFTER_DAYS = 14

type Notify = (kind: 'incident' | 'action' | 'audit' | 'system', title: string, detail: string) => void

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const daysAgo = (d: number) => hoursAgo(d * 24)
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10)

let idCounter = 0
const uid = () => `x${(++idCounter).toString(36)}${Date.now().toString(36).slice(-4)}`

const STORAGE_KEY = 'safeops.incidents.v1'

/** Standalone corrective actions (audit/inspection findings) carry their own context. */
export type StandaloneAction = IncidentAction & {
  companyId: string
  siteId: string
  department: string
  rootCause?: string
  /** set when the action was auto-created from a failed asset inspection */
  assetId?: string
}

export class IncidentStore {
  private incidents: Incident[] = []
  private standalone: StandaloneAction[] = []
  private assets: Asset[] = []
  private inspections: Inspection[] = []
  private audits: Audit[] = []
  private obligations: ComplianceObligation[] = []
  private documents: ComplianceDocument[] = []
  private customTemplates: AuditTemplate[] = []
  private nextNumber = 2610
  private nextActionCode = 910
  private nextAssetCode = 1101
  private nextInspectionCode = 2080
  private nextAuditCode = 3010
  private nextFindingCode = 3110
  private sessions: TrainingSession[] = []
  private certificates: Certificate[] = []
  private customCourses: TrainingCourse[] = []
  private nextSessionCode = 505
  private nextCertSeq = 2000
  private nextCourseCode = 111
  /** reminder thresholds already notified, keyed `${actionId}:${tag}` */
  private remindersSent: Record<string, true> = {}
  /** training expiry reminders already sent, keyed `${certId}:${tag}` */
  private trainingRemindersSent: Record<string, true> = {}
  private notify: Notify

  constructor(notify: Notify) {
    this.notify = notify
    // Survive hard reloads like a real backend would: hydrate persisted state,
    // fall back to seeds on first run (or if storage is corrupt).
    const stored = this.hydrate()
    if (stored) {
      this.incidents = stored.incidents
      this.nextNumber = stored.nextNumber
      this.standalone = stored.standalone ?? buildStandaloneSeeds()
      this.remindersSent = stored.remindersSent ?? {}
      this.nextActionCode = stored.nextActionCode ?? 910
      if (stored.assets && stored.inspections) {
        this.assets = stored.assets
        this.inspections = stored.inspections
      } else {
        this.assets = buildAssetSeeds()
        this.inspections = buildInspectionSeeds(this.assets)
        this.ensureInspectionDefectSeeds()
      }
      this.nextAssetCode = stored.nextAssetCode ?? 1101
      this.nextInspectionCode = stored.nextInspectionCode ?? 2080
      if (stored.audits && stored.obligations && stored.documents) {
        this.audits = stored.audits
        this.obligations = stored.obligations
        this.documents = stored.documents
      } else {
        this.audits = buildAuditSeeds()
        this.obligations = buildObligationSeeds()
        this.documents = buildDocumentSeeds()
        this.ensureAuditFindingActionSeeds()
      }
      this.customTemplates = stored.customTemplates ?? []
      this.nextAuditCode = stored.nextAuditCode ?? 3010
      this.nextFindingCode = stored.nextFindingCode ?? 3110
      if (stored.sessions && stored.certificates) {
        this.sessions = stored.sessions
        this.certificates = stored.certificates
      } else {
        this.sessions = buildSessionSeeds()
        this.certificates = buildCertificateSeeds()
      }
      this.customCourses = stored.customCourses ?? []
      this.trainingRemindersSent = stored.trainingRemindersSent ?? {}
      this.nextSessionCode = stored.nextSessionCode ?? 505
      this.nextCertSeq = stored.nextCertSeq ?? 2000
      this.nextCourseCode = stored.nextCourseCode ?? 111
    } else {
      this.incidents = buildSeeds()
      this.standalone = buildStandaloneSeeds()
      this.assets = buildAssetSeeds()
      this.inspections = buildInspectionSeeds(this.assets)
      this.ensureInspectionDefectSeeds()
      this.audits = buildAuditSeeds()
      this.obligations = buildObligationSeeds()
      this.documents = buildDocumentSeeds()
      this.ensureAuditFindingActionSeeds()
      this.sessions = buildSessionSeeds()
      this.certificates = buildCertificateSeeds()
    }
    // audit seeds occupy literal codes CA-913..915 — never re-issue them
    this.nextActionCode = Math.max(this.nextActionCode, 916)
    this.normalizeActions()
    this.persist()
    this.sweepReminders()
  }

  /** Seeded audit findings reference corrective actions — create them once. */
  private ensureAuditFindingActionSeeds() {
    if (this.standalone.some((a) => a.id === 'sa-aud-1')) return
    const mk = (over: Partial<StandaloneAction> & Pick<StandaloneAction, 'id' | 'code' | 'title' | 'siteId' | 'department' | 'owner' | 'dueDate' | 'status' | 'rootCause'>): StandaloneAction => ({
      causeId: null, priority: 'High', evidenceRequired: true, progress: 0,
      companyId: 'big', reviewer: 'Marcus Tan',
      createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(), notes: [], log: [],
      description: undefined, ...over,
    })
    this.standalone.unshift(
      mk({
        id: 'sa-aud-1', code: 'CA-913', title: 'Major finding: enforce gas-test entries at hot-work permit reissue',
        siteId: 'kch', department: 'Site-wide', owner: 'Sarah Wong',
        dueDate: new Date(Date.now() + 12 * 86400_000).toISOString().slice(0, 10),
        status: 'In Progress', progress: 25, startedAt: new Date(Date.now() - 1 * 86400_000).toISOString(),
        rootCause: 'Audit finding (AUD-3001)',
      }),
      mk({
        id: 'sa-aud-2', code: 'CA-914', title: 'Minor finding: complete forklift refresher dates in training matrix',
        siteId: 'kch', department: 'Site-wide', owner: 'Sarah Wong', priority: 'Medium',
        dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
        status: 'Completed', progress: 100, evidenceRequired: false,
        completedAt: new Date(Date.now() - 0.5 * 86400_000).toISOString(),
        rootCause: 'Audit finding (AUD-3001)',
      }),
      mk({
        id: 'sa-aud-3', code: 'CA-915', title: 'Observation: complete shadow board labels at charging bay',
        siteId: 'sen', department: 'Warehouse', owner: 'Grace Lim', priority: 'Low', evidenceRequired: false,
        dueDate: new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10),
        status: 'Verified', progress: 100,
        completedAt: new Date(Date.now() - 11 * 86400_000).toISOString(),
        verifiedBy: 'Marcus Tan', verifiedAt: new Date(Date.now() - 9 * 86400_000).toISOString(),
        rootCause: 'Audit finding (AUD-3006)',
      }),
    )
  }

  /** The seeded failed inspection (INS-2043) references two defect actions. */
  private ensureInspectionDefectSeeds() {
    if (this.standalone.some((a) => a.id === 'sa-insp-1')) return
    const base = {
      causeId: null, priority: 'High' as const, evidenceRequired: true,
      companyId: 'big', siteId: 'twu', department: 'Mill', assetId: 'ast-1010',
      rootCause: 'Inspection defect (INS-2043)', reviewer: 'Marcus Tan',
      createdAt: new Date(Date.now() - 4 * 86400_000).toISOString(), notes: [], log: [],
    }
    this.standalone.unshift(
      {
        ...base, id: 'sa-insp-1', code: 'CA-908', owner: 'Dayang Nurul',
        title: 'Replace perished coolant hose — standby genset',
        description: 'Radiator-end hose weeping under load (found at INS-2043). Genset unavailable until replaced.',
        dueDate: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
        status: 'In Progress', progress: 50, startedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
      },
      {
        ...base, id: 'sa-insp-2', code: 'CA-909', owner: 'Dayang Nurul',
        title: 'Service battery terminals & retest cranking — genset',
        description: 'Heavy corrosion on terminals; slow crank recorded at INS-2043.',
        dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
        status: 'Open', progress: 0,
      },
    )
  }

  private hydrate(): {
    incidents: Incident[]
    nextNumber: number
    standalone?: StandaloneAction[]
    remindersSent?: Record<string, true>
    nextActionCode?: number
    assets?: Asset[]
    inspections?: Inspection[]
    nextAssetCode?: number
    nextInspectionCode?: number
    audits?: Audit[]
    obligations?: ComplianceObligation[]
    documents?: ComplianceDocument[]
    customTemplates?: AuditTemplate[]
    nextAuditCode?: number
    nextFindingCode?: number
    sessions?: TrainingSession[]
    certificates?: Certificate[]
    customCourses?: TrainingCourse[]
    trainingRemindersSent?: Record<string, true>
    nextSessionCode?: number
    nextCertSeq?: number
    nextCourseCode?: number
  } | null {
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
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          incidents: this.incidents,
          nextNumber: this.nextNumber,
          standalone: this.standalone,
          remindersSent: this.remindersSent,
          nextActionCode: this.nextActionCode,
          assets: this.assets,
          inspections: this.inspections,
          nextAssetCode: this.nextAssetCode,
          nextInspectionCode: this.nextInspectionCode,
          audits: this.audits,
          obligations: this.obligations,
          documents: this.documents,
          customTemplates: this.customTemplates,
          nextAuditCode: this.nextAuditCode,
          nextFindingCode: this.nextFindingCode,
          sessions: this.sessions,
          certificates: this.certificates,
          customCourses: this.customCourses,
          trainingRemindersSent: this.trainingRemindersSent,
          nextSessionCode: this.nextSessionCode,
          nextCertSeq: this.nextCertSeq,
          nextCourseCode: this.nextCourseCode,
        }),
      )
    } catch {
      // storage full/unavailable — the session still works in memory
    }
  }

  /** Backfill CAPA fields on actions persisted before Sprint 4. */
  private normalizeActions() {
    const seenCodes = new Set<string>()
    const norm = (a: IncidentAction, fallbackCreated: string) => {
      if (!a.code) {
        a.code = /^ca-[\w-]+$/i.test(a.id) ? a.id.toUpperCase() : `CA-${this.nextActionCode++}`
      }
      // heal any historical display-code collisions
      while (seenCodes.has(a.code)) a.code = `CA-${this.nextActionCode++}`
      seenCodes.add(a.code)
      if (a.progress === undefined) {
        a.progress = a.status === 'Verified' || a.status === 'Completed' ? 100 : a.status === 'In Progress' ? 50 : 0
      }
      a.notes = a.notes ?? []
      a.log = a.log ?? []
      a.createdAt = a.createdAt ?? fallbackCreated
    }
    this.incidents.forEach((i) => i.actions.forEach((a) => norm(a, i.reportedAt)))
    this.standalone.forEach((a) => norm(a, a.createdAt ?? new Date().toISOString()))
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
        const notDone = incident.actions.filter(
          (a) => a.status !== 'Completed' && a.status !== 'Verified' && a.status !== 'Cancelled',
        )
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
        const unverified = incident.actions.filter((a) => a.status !== 'Verified' && a.status !== 'Cancelled')
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

    if (action.status === 'Cancelled') throw new ApiError('validation', 'Cancelled actions are read-only.')

    if (patch.status && patch.status !== action.status) {
      if (patch.status === 'Completed') {
        if (action.evidenceRequired && !action.evidenceNote) {
          throw new ApiError('validation', 'This action requires completion evidence before it can be marked complete.')
        }
        action.completedAt = new Date().toISOString()
        action.progress = 100
        this.log(incident, actor, 'Action completed', action.title)
      } else if (patch.status === 'Verified') {
        this.requireRole(actor, REVIEW_ROLES)
        if (action.status !== 'Completed') throw new ApiError('validation', 'Only completed actions can be verified.')
        action.verifiedBy = actor.name
        action.verifiedAt = new Date().toISOString()
        this.log(incident, actor, 'Action verified', action.title)
      } else {
        if (patch.status === 'In Progress') {
          action.startedAt = action.startedAt ?? new Date().toISOString()
          action.progress = Math.max(action.progress ?? 0, 25)
        }
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

  // ── CAPA: unified corrective-action model ──────────────────────────────────

  /** Locate an action wherever it lives (embedded in an incident, or standalone). */
  private findAction(actionId: string): { action: IncidentAction; incident: Incident | null; standalone: StandaloneAction | null } {
    for (const incident of this.incidents) {
      if (incident.archived) continue
      const action = incident.actions.find((a) => a.id === actionId)
      if (action) return { action, incident, standalone: null }
    }
    const sa = this.standalone.find((a) => a.id === actionId)
    if (sa) return { action: sa, incident: null, standalone: sa }
    throw new ApiError('not_found', 'Corrective action not found.')
  }

  private toCapa(action: IncidentAction, incident: Incident | null, sa: StandaloneAction | null): CapaItem {
    const derived = deriveCapaStatus(action, incident)
    const daysToDue = dayDiff(action.dueDate)
    const timeline: CapaTimelineEntry[] = [
      { id: `${action.id}-t0`, at: action.createdAt ?? '', actor: incident ? incident.investigator ?? 'System' : 'System', action: 'Action created', detail: incident ? `Raised from ${incident.number}` : 'Standalone finding' },
      ...(action.startedAt ? [{ id: `${action.id}-t1`, at: action.startedAt, actor: action.owner, action: 'Work started' }] : []),
      ...(action.completedAt ? [{ id: `${action.id}-t2`, at: action.completedAt, actor: action.owner, action: 'Marked completed', detail: action.evidenceNote }] : []),
      ...(action.verifiedAt ? [{ id: `${action.id}-t3`, at: action.verifiedAt, actor: action.verifiedBy ?? '', action: 'Verification sign-off' }] : []),
      ...(action.cancelledAt ? [{ id: `${action.id}-t4`, at: action.cancelledAt, actor: 'HSE', action: 'Cancelled', detail: action.cancelReason }] : []),
      ...(action.log ?? []),
    ].sort((a, b) => a.at.localeCompare(b.at))

    return {
      id: action.id,
      code: action.code ?? action.id.toUpperCase(),
      title: action.title,
      description: action.description,
      companyId: incident ? incident.companyId : sa!.companyId,
      siteId: incident ? incident.siteId : sa!.siteId,
      department: incident ? incident.department : sa!.department,
      incidentId: incident ? incident.id : null,
      incidentNumber: incident?.number,
      incidentTitle: incident?.title,
      rootCause: incident
        ? incident.rca?.causes.find((c) => c.id === action.causeId)?.category
        : sa?.rootCause,
      owner: action.owner,
      reviewer: action.reviewer,
      priority: action.priority,
      dueDate: action.dueDate,
      createdAt: action.createdAt ?? '',
      status: action.status,
      derived,
      overdue: isActionOverdue(action),
      daysToDue,
      progress: action.progress ?? 0,
      evidenceRequired: action.evidenceRequired,
      evidenceNote: action.evidenceNote,
      startedAt: action.startedAt,
      completedAt: action.completedAt,
      verifiedBy: action.verifiedBy,
      verifiedAt: action.verifiedAt,
      cancelledAt: action.cancelledAt,
      cancelReason: action.cancelReason,
      notes: action.notes ?? [],
      timeline,
    }
  }

  private allCapa(companyId: string): CapaItem[] {
    const items: CapaItem[] = []
    for (const incident of this.incidents) {
      if (incident.archived || incident.companyId !== companyId) continue
      incident.actions.forEach((a) => items.push(this.toCapa(a, incident, null)))
    }
    this.standalone
      .filter((a) => a.companyId === companyId)
      .forEach((a) => items.push(this.toCapa(a, null, a)))
    return items
  }

  /** Role-based data scoping per the CAPA permission model. */
  private scopeCapa(items: CapaItem[], actor: Actor): CapaItem[] {
    const orgWide = !actor.siteIds || actor.siteIds.length === 0
    switch (actor.role) {
      case 'admin':
      case 'hse_manager':
      case 'ceo':
        return items
      case 'safety_officer':
      case 'supervisor':
        return items.filter((i) => i.owner === actor.name || orgWide || actor.siteIds!.includes(i.siteId))
      default: // employee: own actions only
        return items.filter((i) => i.owner === actor.name)
    }
  }

  listCapa(companyId: string, filters: CapaFilters, actor: Actor): CapaItem[] {
    this.sweepReminders()
    const q = filters.q?.trim().toLowerCase()
    return this.scopeCapa(this.allCapa(companyId), actor)
      .filter((i) => !filters.siteId || i.siteId === filters.siteId)
      .filter((i) => !filters.owner || i.owner === filters.owner)
      .filter((i) => !filters.priority || i.priority === filters.priority)
      .filter((i) => matchesBucket(i, filters.bucket ?? 'all'))
      .filter(
        (i) =>
          !q ||
          [i.code, i.title, i.owner, i.department, i.incidentNumber ?? '', i.rootCause ?? '']
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort(
        (a, b) =>
          (a.derived === 'Cancelled' ? 1 : 0) - (b.derived === 'Cancelled' ? 1 : 0) ||
          (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) ||
          a.dueDate.localeCompare(b.dueDate),
      )
  }

  capaStats(companyId: string, actor: Actor): CapaStats {
    const items = this.scopeCapa(this.allCapa(companyId), actor)
    const openStates: CapaDerivedStatus[] = ['Open', 'Assigned', 'In Progress', 'Waiting Verification']
    const open = items.filter((i) => openStates.includes(i.derived))
    const monthAgo = Date.now() - 30 * 86400_000
    return {
      open: open.length,
      overdue: items.filter((i) => i.overdue).length,
      completed30d: items.filter((i) => (i.verifiedAt ?? i.completedAt) && new Date(i.verifiedAt ?? i.completedAt!).getTime() > monthAgo && (i.derived === 'Verified' || i.derived === 'Closed')).length,
      verificationPending: items.filter((i) => i.derived === 'Waiting Verification').length,
      highPriority: open.filter((i) => i.priority === 'High').length,
      dueToday: open.filter((i) => i.daysToDue === 0).length,
    }
  }

  getCapa(actionId: string): CapaItem {
    const { action, incident, standalone } = this.findAction(actionId)
    return this.toCapa(action, incident, standalone)
  }

  addStandaloneAction(input: NewStandaloneAction, actor: Actor): CapaItem {
    if (!MANAGE_ROLES.includes(actor.role)) {
      throw new ApiError('forbidden', 'Only Safety Officers and above can raise corrective actions.')
    }
    if (!input.title.trim() || !input.owner.trim() || !input.dueDate) {
      throw new ApiError('validation', 'Title, owner and due date are required.')
    }
    const now = new Date().toISOString()
    const action: StandaloneAction = {
      id: `sa-${Date.now().toString(36)}`,
      code: `CA-${this.nextActionCode++}`,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      causeId: null,
      owner: input.owner,
      reviewer: input.reviewer,
      dueDate: input.dueDate,
      priority: input.priority,
      status: 'Open',
      progress: 0,
      evidenceRequired: input.evidenceRequired,
      createdAt: now,
      notes: [],
      log: [{ id: `l-${Date.now().toString(36)}`, at: now, actor: actor.name, action: 'Action created', detail: input.rootCause }],
      companyId: input.companyId,
      siteId: input.siteId,
      department: input.department,
      rootCause: input.rootCause,
    }
    this.standalone.unshift(action)
    this.persist()
    this.notify('action', `Corrective action assigned to ${input.owner}`, `${action.code} · ${action.title}, due ${input.dueDate}.`)
    return this.toCapa(action, null, action)
  }

  updateCapa(actionId: string, patch: CapaPatch, actor: Actor): CapaItem {
    const { action, incident, standalone } = this.findAction(actionId)
    if (action.status === 'Cancelled') throw new ApiError('validation', 'Cancelled actions are read-only.')
    const item = this.toCapa(action, incident, standalone)
    if (!canMutateCapa(actor, item)) {
      throw new ApiError('forbidden', 'You can only update actions assigned to you or within your site scope.')
    }

    const managementFields = ['owner', 'reviewer', 'dueDate', 'priority', 'description'] as const
    if (managementFields.some((f) => patch[f] !== undefined) && !REVIEW_ROLES.includes(actor.role)) {
      throw new ApiError('forbidden', 'Reassignment and schedule changes need an HSE Manager or Admin.')
    }

    const alog = (text: string, detail?: string) => {
      action.log = action.log ?? []
      action.log.push({ id: `l-${Date.now().toString(36)}${action.log.length}`, at: new Date().toISOString(), actor: actor.name, action: text, detail })
      if (incident) this.log(incident, actor, text, `${action.code} · ${action.title}`)
    }

    if (patch.owner !== undefined && patch.owner !== action.owner) {
      alog('Reassigned', `${action.owner || 'Unassigned'} → ${patch.owner}`)
      action.owner = patch.owner
      this.notify('action', `Corrective action assigned to ${patch.owner}`, `${action.code} · ${action.title}, due ${action.dueDate}.`)
    }
    if (patch.reviewer !== undefined) action.reviewer = patch.reviewer || undefined
    if (patch.dueDate !== undefined && patch.dueDate !== action.dueDate) {
      alog('Due date changed', `${action.dueDate} → ${patch.dueDate}`)
      action.dueDate = patch.dueDate
    }
    if (patch.priority !== undefined) action.priority = patch.priority
    if (patch.description !== undefined) action.description = patch.description.trim() || undefined
    if (patch.evidenceNote !== undefined) action.evidenceNote = patch.evidenceNote.trim() || undefined

    if (patch.progress !== undefined) {
      const allowed = [0, 25, 50, 75, 100]
      if (!allowed.includes(patch.progress)) throw new ApiError('validation', 'Progress moves in 25% steps.')
      action.progress = patch.progress
      if (patch.progress > 0 && action.status === 'Open') {
        action.status = 'In Progress'
        action.startedAt = action.startedAt ?? new Date().toISOString()
      }
      alog(`Progress updated to ${patch.progress}%`)
    }

    if (patch.status && patch.status !== action.status) {
      switch (patch.status) {
        case 'In Progress':
          if (action.status !== 'Open' && action.status !== 'Completed') {
            throw new ApiError('validation', 'Only open or sent-back actions can move to In Progress.')
          }
          if (action.status === 'Completed' && !REVIEW_ROLES.includes(actor.role)) {
            throw new ApiError('forbidden', 'Sending a completed action back for rework needs an HSE Manager.')
          }
          action.startedAt = action.startedAt ?? new Date().toISOString()
          action.progress = Math.max(action.progress ?? 0, 25)
          if (action.status === 'Completed') {
            action.completedAt = undefined
            action.progress = 75
            alog('Sent back for rework')
          } else {
            alog('Work started')
          }
          break
        case 'Completed':
          if (action.status !== 'Open' && action.status !== 'In Progress') {
            throw new ApiError('validation', 'Only open or in-progress actions can be completed.')
          }
          if (action.evidenceRequired && !action.evidenceNote) {
            throw new ApiError('validation', 'Completion evidence is required before this action can be marked complete.')
          }
          action.completedAt = new Date().toISOString()
          action.progress = 100
          alog('Marked completed', action.evidenceNote)
          this.notify('action', `${action.code} awaits verification`, `${action.title} — completed by ${action.owner}.`)
          break
        case 'Verified':
          if (action.status !== 'Completed') throw new ApiError('validation', 'Only completed actions can be verified.')
          if (!canVerifyCapa(actor, item)) {
            throw new ApiError('forbidden', 'Verification needs the assigned reviewer or an HSE Manager/Admin.')
          }
          action.verifiedBy = actor.name
          action.verifiedAt = new Date().toISOString()
          alog('Verification sign-off')
          this.notify('action', `${action.code} verified`, `${action.title} — signed off by ${actor.name}.`)
          break
        case 'Open':
          throw new ApiError('validation', 'Use "send back for rework" (In Progress) instead of reopening.')
        case 'Cancelled':
          throw new ApiError('validation', 'Use the cancel action, which records a reason.')
      }
      action.status = patch.status
    }

    if (incident) incident.version++
    this.persist()
    return this.toCapa(action, incident, standalone)
  }

  cancelCapa(actionId: string, reason: string, actor: Actor): CapaItem {
    const { action, incident, standalone } = this.findAction(actionId)
    if (!REVIEW_ROLES.includes(actor.role)) {
      throw new ApiError('forbidden', 'Only an HSE Manager or Admin can cancel a corrective action.')
    }
    if (action.status === 'Verified') throw new ApiError('validation', 'Verified actions cannot be cancelled.')
    if (!reason.trim()) throw new ApiError('validation', 'A cancellation reason is required.')
    action.status = 'Cancelled'
    action.cancelledAt = new Date().toISOString()
    action.cancelReason = reason.trim()
    action.log = action.log ?? []
    action.log.push({ id: `l-${Date.now().toString(36)}`, at: action.cancelledAt, actor: actor.name, action: 'Cancelled', detail: reason.trim() })
    if (incident) {
      this.log(incident, actor, 'Corrective action cancelled', `${action.code} — ${reason.trim()}`)
      incident.version++
    }
    this.persist()
    this.notify('action', `${action.code} cancelled`, `${action.title} — ${reason.trim()}`)
    return this.toCapa(action, incident, standalone)
  }

  addCapaNote(actionId: string, text: string, mentions: string[], actor: Actor): CapaItem {
    const { action, incident, standalone } = this.findAction(actionId)
    if (!text.trim()) throw new ApiError('validation', 'Comment cannot be empty.')
    action.notes = action.notes ?? []
    action.notes.push({ id: `n-${Date.now().toString(36)}`, author: actor.name, at: new Date().toISOString(), text: text.trim(), mentions })
    mentions.forEach((m) => this.notify('action', `${actor.name} mentioned ${m} on ${action.code}`, text.trim().slice(0, 90)))
    this.persist()
    return this.toCapa(action, incident, standalone)
  }

  capaAnalytics(companyId: string): CapaAnalytics {
    const items = this.allCapa(companyId).filter((i) => i.derived !== 'Cancelled')
    const done = items.filter((i) => i.derived === 'Verified' || i.derived === 'Closed')
    const completionRate = items.length ? Math.round((done.length / items.length) * 100) : 0

    const closeDays = done
      .filter((i) => i.createdAt && (i.verifiedAt ?? i.completedAt))
      .map((i) => (new Date(i.verifiedAt ?? i.completedAt!).getTime() - new Date(i.createdAt).getTime()) / 86400_000)
    const avgCloseDays = closeDays.length ? Math.round((closeDays.reduce((a, b) => a + b, 0) / closeDays.length) * 10) / 10 : null

    const finished = items.filter((i) => i.completedAt)
    const onTime = finished.filter((i) => i.completedAt!.slice(0, 10) <= i.dueDate)
    const onTimeRate = finished.length ? Math.round((onTime.length / finished.length) * 100) : 0

    const overdueBySite = new Map<string, number>()
    const loadBySite = new Map<string, number>()
    items.forEach((i) => {
      if (i.overdue) overdueBySite.set(i.siteId, (overdueBySite.get(i.siteId) ?? 0) + 1)
      if (['Open', 'Assigned', 'In Progress', 'Waiting Verification'].includes(i.derived)) {
        loadBySite.set(i.siteId, (loadBySite.get(i.siteId) ?? 0) + 1)
      }
    })
    const worst = [...overdueBySite.entries()].sort((a, b) => b[1] - a[1])[0]

    const byDept = new Map<string, { done: number; onTime: number }>()
    finished.forEach((i) => {
      const d = byDept.get(i.department) ?? { done: 0, onTime: 0 }
      d.done++
      if (i.completedAt!.slice(0, 10) <= i.dueDate) d.onTime++
      byDept.set(i.department, d)
    })

    const byOwnerMap = new Map<string, { open: number; overdue: number; completed: number }>()
    items.forEach((i) => {
      if (!i.owner) return
      const o = byOwnerMap.get(i.owner) ?? { open: 0, overdue: 0, completed: 0 }
      if (i.derived === 'Verified' || i.derived === 'Closed') o.completed++
      else o.open++
      if (i.overdue) o.overdue++
      byOwnerMap.set(i.owner, o)
    })

    const months: { month: string; Completed: number; Created: number }[] = []
    for (let m = 5; m >= 0; m--) {
      const d = new Date()
      d.setMonth(d.getMonth() - m)
      const key = d.toISOString().slice(0, 7)
      months.push({
        month: d.toLocaleDateString('en-MY', { month: 'short' }),
        Completed: items.filter((i) => (i.verifiedAt ?? i.completedAt ?? '').slice(0, 7) === key).length,
        Created: items.filter((i) => i.createdAt.slice(0, 7) === key).length,
      })
    }

    return {
      completionRate,
      avgCloseDays,
      onTimeRate,
      mostOverdueSite: worst ? { site: worst[0], count: worst[1] } : null,
      bySite: [...loadBySite.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byDepartment: [...byDept.entries()]
        .map(([name, v]) => ({ name, value: Math.round((v.onTime / v.done) * 100) }))
        .sort((a, b) => b.value - a.value),
      byOwner: [...byOwnerMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.open + b.overdue * 2 - (a.open + a.overdue * 2))
        .slice(0, 8),
      monthlyCompletions: months,
    }
  }

  // ── Assets & inspections ───────────────────────────────────────────────────

  private openDefectsFor(assetId: string): number {
    return this.standalone.filter(
      (a) => a.assetId === assetId && a.status !== 'Verified' && a.status !== 'Cancelled',
    ).length
  }

  private lastCompletedInspection(assetId: string): Inspection | undefined {
    return this.inspections
      .filter((i) => i.assetId === assetId && i.status === 'Completed')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0]
  }

  private toAssetView(a: Asset): AssetView {
    const openDefects = this.openDefectsFor(a.id)
    const daysToDue = dayDiff(a.nextDueDate)
    const active = a.status !== 'Retired'
    const overdue = active && daysToDue < 0
    const last = this.lastCompletedInspection(a.id)

    const factors: { label: string; delta: number }[] = []
    let health = 100
    if (overdue) {
      const penalty = Math.min(30, 10 + Math.abs(daysToDue) * 2)
      health -= penalty
      factors.push({ label: `Inspection ${Math.abs(daysToDue)}d overdue`, delta: -penalty })
    }
    if (openDefects > 0) {
      const penalty = Math.min(30, openDefects * 15)
      health -= penalty
      factors.push({ label: `${openDefects} open defect(s)`, delta: -penalty })
    }
    if (last?.outcome === 'failed') {
      health -= 15
      factors.push({ label: 'Last inspection failed', delta: -15 })
    }
    if (a.status === 'Under Maintenance') {
      health -= 10
      factors.push({ label: 'Under maintenance', delta: -10 })
    }
    if (a.status === 'Out of Service') {
      health -= 40
      factors.push({ label: 'Out of service', delta: -40 })
    }
    health = Math.max(5, Math.min(100, health))
    return {
      ...a,
      health,
      risk: health >= 80 ? 'Low' : health >= 60 ? 'Medium' : 'High',
      openDefects,
      overdue,
      daysToDue,
      lastOutcome: last?.outcome,
      healthFactors: factors,
    }
  }

  listAssets(companyId: string, filters: AssetFilters): AssetView[] {
    const q = filters.q?.trim().toLowerCase()
    return this.assets
      .filter((a) => a.companyId === companyId)
      .map((a) => this.toAssetView(a))
      .filter((a) => !filters.siteId || a.siteId === filters.siteId)
      .filter((a) => !filters.category || a.category === filters.category)
      .filter((a) => !filters.status || a.status === filters.status)
      .filter((a) => {
        switch (filters.bucket ?? 'all') {
          case 'all': return true
          case 'overdue': return a.overdue
          case 'due_week': return !a.overdue && a.daysToDue <= 7 && a.status !== 'Retired'
          case 'high_risk': return a.risk === 'High'
          case 'defects': return a.openDefects > 0
        }
      })
      .filter(
        (a) =>
          !q ||
          [a.code, a.name, a.serialNumber, a.owner, a.department, a.location, a.manufacturer]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => a.health - b.health || a.nextDueDate.localeCompare(b.nextDueDate))
  }

  getAssetProfile(idOrQr: string): { asset: AssetView; inspections: InspectionView[]; openActions: CapaItem[] } {
    const asset = this.assets.find((a) => a.id === idOrQr || a.qrKey === idOrQr || a.code === idOrQr)
    if (!asset) throw new ApiError('not_found', 'Asset not found — the QR label may be stale.')
    const inspections = this.inspections
      .filter((i) => i.assetId === asset.id)
      .map((i) => this.toInspectionView(i))
      .sort((a, b) => (b.completedAt ?? b.scheduledFor).localeCompare(a.completedAt ?? a.scheduledFor))
    const openActions = this.standalone
      .filter((a) => a.assetId === asset.id && a.status !== 'Verified' && a.status !== 'Cancelled')
      .map((a) => this.toCapa(a, null, a))
    return { asset: this.toAssetView(asset), inspections, openActions }
  }

  createAsset(input: NewAssetInput, actor: Actor): AssetView {
    if (!MANAGE_ROLES.includes(actor.role)) throw new ApiError('forbidden', 'Only Safety Officers and above can register assets.')
    if (!input.name.trim() || !input.serialNumber.trim() || !input.siteId || !input.owner) {
      throw new ApiError('validation', 'Name, serial number, site and owner are required.')
    }
    const code = `AST-${this.nextAssetCode++}`
    const nextDueDate = new Date(Date.now() + FREQUENCY_DAYS[input.frequency] * 86400_000).toISOString().slice(0, 10)
    const asset: Asset = {
      ...input,
      id: code.toLowerCase(),
      code,
      qrKey: code,
      status: 'In Service',
      documents: [],
      nextDueDate,
    }
    this.assets.unshift(asset)
    this.scheduleInternal(asset, nextDueDate, input.owner)
    this.persist()
    this.notify('system', `Asset registered: ${code}`, `${asset.name} — first inspection scheduled ${nextDueDate}.`)
    return this.toAssetView(asset)
  }

  private scheduleInternal(asset: Asset, date: string, inspector: string): Inspection {
    const existing = this.inspections.find((i) => i.assetId === asset.id && i.status === 'Scheduled')
    if (existing) {
      existing.scheduledFor = date
      existing.assignedTo = inspector
      return existing
    }
    const insp: Inspection = {
      id: `ins-${this.nextInspectionCode}`,
      code: `INS-${this.nextInspectionCode++}`,
      assetId: asset.id, companyId: asset.companyId, siteId: asset.siteId,
      scheduledFor: date, assignedTo: inspector, status: 'Scheduled', actionIds: [],
    }
    this.inspections.push(insp)
    return insp
  }

  scheduleInspection(assetId: string, date: string, inspector: string, actor: Actor): InspectionView {
    if (!MANAGE_ROLES.includes(actor.role)) throw new ApiError('forbidden', 'Only Safety Officers and above can schedule inspections.')
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) throw new ApiError('not_found', 'Asset not found.')
    if (!date || !inspector) throw new ApiError('validation', 'Date and inspector are required.')
    const insp = this.scheduleInternal(asset, date, inspector)
    asset.nextDueDate = date
    this.persist()
    this.notify('system', `Inspection scheduled: ${asset.code}`, `${asset.name} on ${date} — inspector ${inspector}.`)
    return this.toInspectionView(insp)
  }

  completeInspection(inspectionId: string, input: CompleteInspectionInput, actor: Actor): InspectionView {
    const insp = this.inspections.find((i) => i.id === inspectionId)
    if (!insp) throw new ApiError('not_found', 'Inspection not found.')
    if (insp.status !== 'Scheduled') throw new ApiError('validation', 'This inspection is already completed.')
    if (insp.assignedTo !== actor.name && !MANAGE_ROLES.includes(actor.role)) {
      throw new ApiError('forbidden', 'Only the assigned inspector (or a Safety Officer and above) can complete this inspection.')
    }
    const asset = this.assets.find((a) => a.id === insp.assetId)!
    const template = CHECKLISTS[asset.category]
    if (input.answers.length !== template.length || input.answers.some((a) => !a.result)) {
      throw new ApiError('validation', 'Every checklist item needs a Pass, Fail or N/A answer.')
    }
    const fails = input.answers.filter((a) => a.result === 'fail')
    if (fails.some((f) => !f.comment?.trim())) {
      throw new ApiError('validation', 'Each failed item needs a comment describing the defect.')
    }
    if (!input.signature.trim()) throw new ApiError('validation', 'A digital signature is required.')

    const now = new Date().toISOString()
    insp.status = 'Completed'
    insp.completedAt = now
    insp.completedBy = actor.name
    insp.outcome = fails.length > 0 ? 'failed' : 'passed'
    insp.answers = input.answers
    insp.comments = input.comments?.trim() || undefined
    insp.photoCount = input.photoCount
    insp.gps = input.gps
    insp.signature = input.signature.trim()

    // failed items become corrective actions, automatically
    for (const fail of fails) {
      const due = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
      const action: StandaloneAction = {
        id: `sa-${Date.now().toString(36)}${this.nextActionCode}`,
        code: `CA-${this.nextActionCode++}`,
        title: `Defect: ${fail.label} — ${asset.name}`,
        description: fail.comment?.trim(),
        causeId: null,
        owner: asset.owner,
        reviewer: 'Marcus Tan',
        dueDate: due,
        priority: 'High',
        status: 'Open',
        progress: 0,
        evidenceRequired: true,
        createdAt: now,
        notes: [],
        log: [{ id: `l-${Date.now().toString(36)}`, at: now, actor: actor.name, action: 'Action created', detail: `Auto-created from failed inspection ${insp.code}` }],
        companyId: asset.companyId,
        siteId: asset.siteId,
        department: asset.department,
        rootCause: `Inspection defect (${insp.code})`,
        assetId: asset.id,
      }
      this.standalone.unshift(action)
      insp.actionIds.push(action.id)
      this.notify('action', `Defect action ${action.code} assigned to ${asset.owner}`, `${fail.label} — ${asset.name}, due ${due}.`)
    }

    // roll the schedule forward so the asset can never fall off the calendar
    asset.lastInspectedAt = now
    asset.nextDueDate = new Date(Date.now() + FREQUENCY_DAYS[asset.frequency] * 86400_000).toISOString().slice(0, 10)
    this.scheduleInternal(asset, asset.nextDueDate, insp.assignedTo)

    this.persist()
    this.notify(
      insp.outcome === 'failed' ? 'action' : 'system',
      `${insp.code} completed — ${insp.outcome === 'failed' ? `${fails.length} defect(s) found` : 'passed'}`,
      `${asset.name} inspected by ${actor.name}. Next due ${asset.nextDueDate}.`,
    )
    return this.toInspectionView(insp)
  }

  private toInspectionView(i: Inspection): InspectionView {
    const asset = this.assets.find((a) => a.id === i.assetId)!
    const daysToDue = dayDiff(i.scheduledFor)
    return {
      ...i,
      assetName: asset.name,
      assetCode: asset.code,
      category: asset.category,
      department: asset.department,
      overdue: i.status === 'Scheduled' && daysToDue < 0,
      daysToDue,
      actionCodes: i.actionIds.map((id) => this.standalone.find((a) => a.id === id)?.code ?? id.toUpperCase()),
    }
  }

  listInspections(companyId: string, filters: InspectionFilters): InspectionView[] {
    const q = filters.q?.trim().toLowerCase()
    return this.inspections
      .filter((i) => i.companyId === companyId && i.status !== 'Cancelled')
      .map((i) => this.toInspectionView(i))
      .filter((i) => !filters.siteId || i.siteId === filters.siteId)
      .filter((i) => {
        switch (filters.status ?? 'all') {
          case 'all': return true
          case 'scheduled': return i.status === 'Scheduled'
          case 'overdue': return i.overdue
          case 'completed': return i.status === 'Completed'
          case 'failed': return i.outcome === 'failed'
        }
      })
      .filter(
        (i) => !q || [i.code, i.assetName, i.assetCode, i.assignedTo].join(' ').toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const rank = (x: InspectionView) => (x.overdue ? 0 : x.status === 'Scheduled' ? 1 : 2)
        return rank(a) - rank(b) || (rank(a) === 2
          ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
          : a.scheduledFor.localeCompare(b.scheduledFor))
      })
  }

  assetStats(companyId: string): AssetStats {
    const views = this.assets.filter((a) => a.companyId === companyId).map((a) => this.toAssetView(a))
    const active = views.filter((a) => a.status !== 'Retired')
    const overdueInspections = active.filter((a) => a.overdue).length
    const bySite = new Map<string, number[]>()
    active.forEach((a) => bySite.set(a.siteId, [...(bySite.get(a.siteId) ?? []), a.health]))

    const months: { month: string; Completed: number; Failed: number }[] = []
    for (let m = 5; m >= 0; m--) {
      const d = new Date()
      d.setMonth(d.getMonth() - m)
      const key = d.toISOString().slice(0, 7)
      const done = this.inspections.filter(
        (i) => i.companyId === companyId && i.status === 'Completed' && (i.completedAt ?? '').slice(0, 7) === key,
      )
      months.push({
        month: d.toLocaleDateString('en-MY', { month: 'short' }),
        Completed: done.length,
        Failed: done.filter((i) => i.outcome === 'failed').length,
      })
    }

    return {
      totalAssets: active.length,
      complianceRate: active.length ? Math.round(((active.length - overdueInspections) / active.length) * 100) : 100,
      overdueInspections,
      dueThisWeek: active.filter((a) => !a.overdue && a.daysToDue <= 7).length,
      openDefects: active.reduce((s, a) => s + a.openDefects, 0),
      avgHealth: active.length ? Math.round(active.reduce((s, a) => s + a.health, 0) / active.length) : 0,
      highestRisk: [...active].sort((a, b) => a.health - b.health).slice(0, 5)
        .map((a) => ({ code: a.code, name: a.name, health: a.health, siteId: a.siteId })),
      bySiteHealth: [...bySite.entries()]
        .map(([name, hs]) => ({ name, value: Math.round(hs.reduce((s, h) => s + h, 0) / hs.length) }))
        .sort((a, b) => a.value - b.value),
      monthlyTrend: months,
    }
  }

  // ── Audits & compliance ────────────────────────────────────────────────────

  listTemplates(): AuditTemplate[] {
    return [...AUDIT_TEMPLATES, ...this.customTemplates]
  }

  createTemplate(name: string, items: string[], actor: Actor): AuditTemplate {
    this.requireRole(actor, REVIEW_ROLES)
    const clean = items.map((t) => t.trim()).filter(Boolean)
    if (!name.trim() || clean.length < 3) {
      throw new ApiError('validation', 'A template needs a name and at least 3 checklist items.')
    }
    const tpl: AuditTemplate = {
      id: `tpl-c-${Date.now().toString(36)}`,
      name: name.trim(),
      type: 'custom',
      custom: true,
      sections: [{ title: 'Checklist', items: clean.map((text, i) => ({ id: `x${i}`, text })) }],
    }
    this.customTemplates.push(tpl)
    this.persist()
    return tpl
  }

  private templateOf(audit: Audit): AuditTemplate {
    return this.listTemplates().find((t) => t.id === audit.templateId) ?? AUDIT_TEMPLATES[0]
  }

  private actionStatusOf(actionId: string): IncidentAction['status'] | null {
    try {
      const { action } = this.findAction(actionId)
      return action.status
    } catch {
      return null
    }
  }

  private toFindingView(f: AuditFinding, audit: Audit): AuditFindingView {
    const a = (() => {
      try {
        return this.findAction(f.actionId).action
      } catch {
        return null
      }
    })()
    const st = a?.status
    const status =
      st === 'Verified' || st === 'Cancelled' ? 'Closed'
      : st === 'Completed' ? 'Awaiting Verification'
      : st === 'In Progress' ? 'Action In Progress'
      : 'Open'
    return {
      ...f,
      auditId: audit.id,
      auditCode: audit.code,
      auditTitle: audit.title,
      siteId: audit.siteId,
      department: audit.department,
      status,
      actionCode: a?.code ?? f.actionId.toUpperCase(),
      actionOwner: a?.owner ?? '—',
      actionDue: a?.dueDate ?? '—',
      actionOverdue: a ? isActionOverdue(a) : false,
    }
  }

  private toAuditView(a: Audit): AuditView {
    const open = a.findings.filter((f) => {
      const st = this.actionStatusOf(f.actionId)
      return st !== 'Verified' && st !== 'Cancelled'
    })
    const daysToStart = dayDiff(a.scheduledFor)
    return {
      ...a,
      templateName: this.templateOf(a).name,
      openFindings: open.length,
      criticalFindings: open.filter((f) => f.severity === 'Critical').length,
      overdue: a.status === 'Planned' && daysToStart < 0,
      daysToStart,
    }
  }

  listAudits(companyId: string, filters: AuditFilters): AuditView[] {
    const q = filters.q?.trim().toLowerCase()
    return this.audits
      .filter((a) => a.companyId === companyId)
      .map((a) => this.toAuditView(a))
      .filter((a) => !filters.siteId || a.siteId === filters.siteId)
      .filter((a) => !filters.status || a.status === filters.status)
      .filter((a) => !filters.type || a.type === filters.type)
      .filter(
        (a) => !q || [a.code, a.title, a.leadAuditor, a.department, ...a.team].join(' ').toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const rank = (x: AuditView) => (x.status === 'In Progress' ? 0 : x.status === 'Planned' ? 1 : x.status === 'Completed' ? 2 : 3)
        return rank(a) - rank(b) || a.scheduledFor.localeCompare(b.scheduledFor)
      })
  }

  getAuditDetail(id: string): { audit: AuditView; findings: AuditFindingView[]; template: AuditTemplate } {
    const audit = this.audits.find((a) => a.id === id)
    if (!audit) throw new ApiError('not_found', 'Audit not found.')
    return {
      audit: this.toAuditView(audit),
      findings: audit.findings.map((f) => this.toFindingView(f, audit)),
      template: this.templateOf(audit),
    }
  }

  createAudit(input: NewAuditInput, actor: Actor): AuditView {
    this.requireRole(actor, REVIEW_ROLES)
    if (!input.title.trim() || !input.leadAuditor || !input.scheduledFor || !input.siteId) {
      throw new ApiError('validation', 'Title, lead auditor, site and date are required.')
    }
    const audit: Audit = {
      ...input,
      id: `aud-${this.nextAuditCode}`,
      code: `AUD-${this.nextAuditCode++}`,
      status: 'Planned',
      findings: [],
      timeline: [{ id: `atl-${Date.now().toString(36)}`, at: new Date().toISOString(), actor: actor.name, action: 'Audit created', detail: input.title.trim() }],
    }
    this.audits.unshift(audit)
    this.persist()
    this.notify('audit', `Audit planned: ${audit.code}`, `${audit.title} — lead auditor ${audit.leadAuditor}, ${audit.scheduledFor}.`)
    return this.toAuditView(audit)
  }

  private canRunAudit(audit: Audit, actor: Actor): boolean {
    return (
      REVIEW_ROLES.includes(actor.role) ||
      audit.leadAuditor === actor.name ||
      audit.team.includes(actor.name)
    )
  }

  startAudit(id: string, actor: Actor): AuditView {
    const audit = this.audits.find((a) => a.id === id)
    if (!audit) throw new ApiError('not_found', 'Audit not found.')
    if (audit.status !== 'Planned') throw new ApiError('validation', 'Only planned audits can be started.')
    if (!this.canRunAudit(audit, actor)) {
      throw new ApiError('forbidden', 'Only the audit team (or an HSE Manager/Admin) can start this audit.')
    }
    audit.status = 'In Progress'
    audit.startedAt = new Date().toISOString()
    audit.timeline.push({ id: `atl-${Date.now().toString(36)}`, at: audit.startedAt, actor: actor.name, action: 'Audit started' })
    this.persist()
    return this.toAuditView(audit)
  }

  completeAudit(id: string, input: CompleteAuditInput, actor: Actor): { audit: AuditView; findings: AuditFindingView[] } {
    const audit = this.audits.find((a) => a.id === id)
    if (!audit) throw new ApiError('not_found', 'Audit not found.')
    if (audit.status !== 'In Progress') throw new ApiError('validation', 'Start the audit before completing it.')
    if (!this.canRunAudit(audit, actor)) throw new ApiError('forbidden', 'Only the audit team can complete this audit.')

    const template = this.templateOf(audit)
    const totalItems = template.sections.reduce((s, sec) => s + sec.items.length, 0)
    if (input.answers.length !== totalItems || input.answers.some((a) => !a.result)) {
      throw new ApiError('validation', 'Every checklist item needs a Pass, Fail or N/A answer.')
    }
    const fails = input.answers.filter((a) => a.result === 'fail')
    for (const f of fails) {
      const fi = input.fails[f.itemId]
      if (!fi || !fi.description.trim() || !fi.owner) {
        throw new ApiError('validation', 'Each failed item needs a finding description and an action owner.')
      }
    }
    if (!input.signature.trim()) throw new ApiError('validation', 'A digital signature is required.')

    const now = new Date().toISOString()
    const applicable = input.answers.filter((a) => a.result !== 'na')
    audit.score = applicable.length
      ? Math.round((applicable.filter((a) => a.result === 'pass').length / applicable.length) * 100)
      : 100
    audit.answers = input.answers
    audit.signature = input.signature.trim()
    audit.gps = input.gps
    audit.completedAt = now
    audit.status = 'Completed'

    // every failed item → finding → auto-created corrective action
    for (const f of fails) {
      const fi = input.fails[f.itemId]!
      const due = new Date(Date.now() + SEVERITY_DUE_DAYS[fi.severity] * 86400_000).toISOString().slice(0, 10)
      const action: StandaloneAction = {
        id: `sa-${Date.now().toString(36)}${this.nextActionCode}`,
        code: `CA-${this.nextActionCode++}`,
        title: `${fi.severity} finding: ${fi.description.trim().slice(0, 90)}`,
        description: `${f.section} — "${f.text}". ${fi.description.trim()}`,
        causeId: null,
        owner: fi.owner,
        reviewer: audit.leadAuditor,
        dueDate: due,
        priority: fi.severity === 'Critical' || fi.severity === 'Major' ? 'High' : fi.severity === 'Minor' ? 'Medium' : 'Low',
        status: 'Open',
        progress: 0,
        evidenceRequired: fi.severity !== 'Observation',
        createdAt: now,
        notes: [],
        log: [{ id: `l-${Date.now().toString(36)}`, at: now, actor: actor.name, action: 'Action created', detail: `Auto-created from audit finding (${audit.code})` }],
        companyId: audit.companyId,
        siteId: audit.siteId,
        department: audit.department,
        rootCause: `Audit finding (${audit.code})`,
        assetId: fi.linkedAssetId,
      }
      this.standalone.unshift(action)

      const finding: AuditFinding = {
        id: `f-${Date.now().toString(36)}${this.nextFindingCode}`,
        code: `F-${this.nextFindingCode++}`,
        category: f.section,
        description: fi.description.trim(),
        severity: fi.severity,
        photoCount: fi.photoCount,
        linkedAssetId: fi.linkedAssetId,
        actionId: action.id,
        raisedBy: actor.name,
        raisedAt: now,
      }
      audit.findings.push(finding)
      audit.timeline.push({ id: `atl-${Date.now().toString(36)}${finding.code}`, at: now, actor: actor.name, action: 'Finding raised', detail: `${finding.code} · ${fi.severity} — ${fi.description.trim().slice(0, 60)}` })
      audit.timeline.push({ id: `atl-${Date.now().toString(36)}${action.code}`, at: now, actor: 'System', action: 'Corrective action created', detail: `${action.code} → ${fi.owner}, due ${due}` })
      this.notify('audit', `Audit finding ${finding.code} (${fi.severity})`, `${fi.description.trim().slice(0, 80)} — action ${action.code} assigned to ${fi.owner}.`)
    }

    audit.timeline.push({ id: `atl-${Date.now().toString(36)}done`, at: now, actor: actor.name, action: 'Audit completed', detail: `Score ${audit.score}% · ${fails.length} finding(s)` })
    this.persist()
    this.notify('audit', `${audit.code} completed — score ${audit.score}%`, `${audit.title}: ${fails.length} finding(s) raised.`)
    return { audit: this.toAuditView(audit), findings: audit.findings.map((f) => this.toFindingView(f, audit)) }
  }

  closeAudit(id: string, actor: Actor): AuditView {
    const audit = this.audits.find((a) => a.id === id)
    if (!audit) throw new ApiError('not_found', 'Audit not found.')
    this.requireRole(actor, REVIEW_ROLES)
    if (audit.status !== 'Completed') throw new ApiError('validation', 'Only completed audits can be closed.')
    const unresolved = audit.findings.filter((f) => {
      const st = this.actionStatusOf(f.actionId)
      return st !== 'Verified' && st !== 'Cancelled'
    })
    if (unresolved.length > 0) {
      throw new ApiError('validation', `${unresolved.length} finding(s) still have unverified corrective actions.`)
    }
    audit.status = 'Closed'
    audit.closedAt = new Date().toISOString()
    audit.timeline.push({ id: `atl-${Date.now().toString(36)}close`, at: audit.closedAt, actor: actor.name, action: 'Audit closed', detail: 'All findings verified' })
    this.persist()
    this.notify('audit', `${audit.code} closed`, `${audit.title} — every finding verified and closed.`)
    return this.toAuditView(audit)
  }

  listFindings(companyId: string, severity?: string): AuditFindingView[] {
    return this.audits
      .filter((a) => a.companyId === companyId)
      .flatMap((a) => a.findings.map((f) => this.toFindingView(f, a)))
      .filter((f) => !severity || f.severity === severity)
      .sort((a, b) => {
        const sev = { Critical: 0, Major: 1, Minor: 2, Observation: 3 }
        const open = (x: AuditFindingView) => (x.status === 'Closed' ? 1 : 0)
        return open(a) - open(b) || sev[a.severity] - sev[b.severity] || b.raisedAt.localeCompare(a.raisedAt)
      })
  }

  listObligations(companyId: string): ObligationView[] {
    return this.obligations
      .filter((o) => o.companyId === companyId)
      .map((o) => {
        const daysToDue = dayDiff(o.nextDue)
        return {
          ...o,
          daysToDue,
          status: daysToDue < 0 ? 'Overdue' : daysToDue <= 30 ? 'Expiring Soon' : 'Compliant',
        } as ObligationView
      })
      .sort((a, b) => a.daysToDue - b.daysToDue)
  }

  renewObligation(id: string, nextDue: string, note: string, actor: Actor): ObligationView {
    this.requireRole(actor, REVIEW_ROLES)
    const o = this.obligations.find((x) => x.id === id)
    if (!o) throw new ApiError('not_found', 'Obligation not found.')
    if (!nextDue) throw new ApiError('validation', 'A new due date is required.')
    o.nextDue = nextDue
    if (o.expiryDate) o.expiryDate = nextDue
    o.lastRenewedAt = new Date().toISOString()
    o.notes = note.trim() || o.notes
    this.persist()
    this.notify('audit', `Compliance renewed: ${o.requirement}`, `${o.regulation} — next due ${nextDue}.`)
    const daysToDue = dayDiff(o.nextDue)
    return { ...o, daysToDue, status: daysToDue < 0 ? 'Overdue' : daysToDue <= 30 ? 'Expiring Soon' : 'Compliant' }
  }

  listDocuments(companyId: string, q?: string, kind?: DocKind | ''): ComplianceDocument[] {
    const query = q?.trim().toLowerCase()
    return this.documents
      .filter((d) => d.companyId === companyId)
      .filter((d) => !kind || d.kind === kind)
      .filter((d) => !query || [d.name, d.owner, d.version].join(' ').toLowerCase().includes(query))
      .sort((a, b) => (a.status === 'Pending Approval' ? 0 : 1) - (b.status === 'Pending Approval' ? 0 : 1) || b.updatedAt.localeCompare(a.updatedAt))
  }

  addDocumentVersion(
    docId: string | null,
    input: { name: string; kind: DocKind; sizeKb: number; note: string; companyId: string; siteId: string | null },
    actor: Actor,
  ): ComplianceDocument {
    if (!MANAGE_ROLES.includes(actor.role)) throw new ApiError('forbidden', 'Only Safety Officers and above can manage documents.')
    const now = new Date().toISOString()
    if (docId) {
      const doc = this.documents.find((d) => d.id === docId)
      if (!doc) throw new ApiError('not_found', 'Document not found.')
      const parsed = parseFloat(doc.version)
      doc.version = Number.isFinite(parsed) ? (Math.round((parsed + 0.1) * 10) / 10).toFixed(1) : now.slice(0, 10)
      doc.status = 'Pending Approval'
      doc.updatedAt = now
      doc.sizeKb = input.sizeKb
      doc.approvedBy = undefined
      doc.approvedAt = undefined
      doc.history.unshift({ version: doc.version, at: now, by: actor.name, note: input.note.trim() || 'New version uploaded' })
      this.persist()
      this.notify('system', `Document pending approval: ${doc.name}`, `v${doc.version} uploaded by ${actor.name}.`)
      return { ...doc }
    }
    if (!input.name.trim()) throw new ApiError('validation', 'Document name is required.')
    const doc: ComplianceDocument = {
      id: `doc-${Date.now().toString(36)}`,
      name: input.name.trim(),
      kind: input.kind,
      version: '1.0',
      status: 'Pending Approval',
      owner: actor.name,
      companyId: input.companyId,
      siteId: input.siteId,
      sizeKb: input.sizeKb,
      updatedAt: now,
      history: [{ version: '1.0', at: now, by: actor.name, note: input.note.trim() || 'Initial upload' }],
    }
    this.documents.unshift(doc)
    this.persist()
    this.notify('system', `Document pending approval: ${doc.name}`, `v1.0 uploaded by ${actor.name}.`)
    return { ...doc }
  }

  approveDocument(id: string, actor: Actor): ComplianceDocument {
    this.requireRole(actor, REVIEW_ROLES)
    const doc = this.documents.find((d) => d.id === id)
    if (!doc) throw new ApiError('not_found', 'Document not found.')
    if (doc.status !== 'Pending Approval') throw new ApiError('validation', 'Only documents pending approval can be approved.')
    doc.status = 'Approved'
    doc.approvedBy = actor.name
    doc.approvedAt = new Date().toISOString()
    this.persist()
    this.notify('system', `Document approved: ${doc.name}`, `v${doc.version} approved by ${actor.name}.`)
    return { ...doc }
  }

  auditStats(companyId: string): AuditStats {
    const audits = this.audits.filter((a) => a.companyId === companyId)
    const findings = this.listFindings(companyId)
    const openFindings = findings.filter((f) => f.status !== 'Closed')
    const obligations = this.listObligations(companyId)
    const compliant = obligations.filter((o) => o.status === 'Compliant').length
    const compliancePct = obligations.length ? Math.round((compliant / obligations.length) * 100) : 100
    const scored = audits.filter((a) => a.score !== undefined)
    const avgScore = scored.length ? Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length) : null
    const closurePct = findings.length
      ? Math.round((findings.filter((f) => f.status === 'Closed').length / findings.length) * 100)
      : 100
    const readiness = Math.round(0.4 * compliancePct + 0.3 * (avgScore ?? compliancePct) + 0.3 * closurePct)

    const byCat = new Map<string, number>()
    findings.forEach((f) => byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1))
    const bySite = new Map<string, number>()
    const byDept = new Map<string, number>()
    openFindings.forEach((f) => {
      bySite.set(f.siteId, (bySite.get(f.siteId) ?? 0) + 1)
      byDept.set(f.department, (byDept.get(f.department) ?? 0) + 1)
    })

    const months: { month: string; Audits: number; Findings: number }[] = []
    for (let m = 5; m >= 0; m--) {
      const d = new Date()
      d.setMonth(d.getMonth() - m)
      const key = d.toISOString().slice(0, 7)
      months.push({
        month: d.toLocaleDateString('en-MY', { month: 'short' }),
        Audits: audits.filter((a) => (a.completedAt ?? '').slice(0, 7) === key).length,
        Findings: findings.filter((f) => f.raisedAt.slice(0, 7) === key).length,
      })
    }

    return {
      upcoming30d: audits.filter((a) => a.status === 'Planned' && dayDiff(a.scheduledFor) <= 30).length,
      openFindings: openFindings.length,
      criticalFindings: openFindings.filter((f) => f.severity === 'Critical').length,
      overdueFindingActions: openFindings.filter((f) => f.actionOverdue).length,
      compliancePct,
      avgScore,
      readiness,
      completedAudits: audits.filter((a) => a.status === 'Completed' || a.status === 'Closed').length,
      findingsByCategory: [...byCat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6),
      bySiteOpenFindings: [...bySite.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      byDeptOpenFindings: [...byDept.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      monthlyTrend: months,
    }
  }

  // ── Training & competency ──────────────────────────────────────────────────

  private allCourses(): TrainingCourse[] {
    return [...TRAINING_COURSES, ...this.customCourses]
  }
  private courseById(id: string): TrainingCourse | undefined {
    return this.allCourses().find((c) => c.id === id)
  }

  /** Latest (highest issueDate) certificate an employee holds for a course. */
  private certFor(employeeId: string, courseId: string): Certificate | undefined {
    return this.certificates
      .filter((c) => c.employeeId === employeeId && c.courseId === courseId)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0]
  }

  /** IDs of the current (non-superseded) certificate per employee+course. A
   *  renewal supersedes the prior cert, so counts never double-count. */
  private currentCertIds(): Set<string> {
    const latest = new Map<string, Certificate>()
    for (const c of this.certificates) {
      const key = `${c.employeeId}:${c.courseId}`
      const prev = latest.get(key)
      if (!prev || c.issueDate > prev.issueDate) latest.set(key, c)
    }
    return new Set([...latest.values()].map((c) => c.id))
  }

  private certStatus(cert: Certificate): { status: 'competent' | 'expiring' | 'expired'; days: number | null } {
    if (cert.expiryDate === null) return { status: 'competent', days: null }
    const days = dayDiff(cert.expiryDate)
    return { status: days < 0 ? 'expired' : days <= 90 ? 'expiring' : 'competent', days }
  }

  private cellStatus(employeeId: string, course: TrainingCourse): MatrixCell {
    const cert = this.certFor(employeeId, course.id)
    if (!cert) return { courseId: course.id, status: 'missing' }
    const { status } = this.certStatus(cert)
    return { courseId: course.id, status, expiryDate: cert.expiryDate, certId: cert.id }
  }

  private levelOf(compliancePct: number, hasExpiredMandatory: boolean): CompetencyLevel {
    if (hasExpiredMandatory) return 'At Risk'
    if (compliancePct >= 100) return 'Fully Competent'
    if (compliancePct >= 75) return 'Competent'
    if (compliancePct >= 50) return 'Developing'
    return 'At Risk'
  }

  private competencyFor(emp: { id: string; name: string; position: string; siteId: string; department: string }): EmployeeCompetency {
    const required = requiredCoursesFor(emp.department)
    const cells: Record<string, MatrixCell> = {}
    let competent = 0
    let expiring = 0
    let gaps = 0
    let hasExpiredMandatory = false
    for (const course of required) {
      const cell = this.cellStatus(emp.id, course)
      cells[course.id] = cell
      if (cell.status === 'competent') competent++
      else if (cell.status === 'expiring') expiring++
      else {
        gaps++
        if (course.mandatory) hasExpiredMandatory = true
      }
    }
    const requiredCount = required.length
    const compliancePct = requiredCount ? Math.round((competent / requiredCount) * 100) : 100
    return {
      employeeId: emp.id, name: emp.name, position: emp.position, siteId: emp.siteId, department: emp.department,
      level: this.levelOf(compliancePct, hasExpiredMandatory),
      compliancePct, requiredCount, competentCount: competent, expiringCount: expiring, gapCount: gaps,
      hasExpiredMandatory, cells,
    }
  }

  private scopeRoster(companyId: string, actor: Actor) {
    const roster = rosterFor(companyId)
    const orgWide = !actor.siteIds || actor.siteIds.length === 0
    switch (actor.role) {
      case 'admin':
      case 'hse_manager':
      case 'ceo':
        return roster
      case 'safety_officer':
      case 'supervisor':
        return orgWide ? roster : roster.filter((e) => actor.siteIds!.includes(e.siteId))
      default: // employee — only self
        return roster.filter((e) => e.name === actor.name)
    }
  }

  listCourses(companyId: string): CourseView[] {
    const roster = rosterFor(companyId)
    return this.allCourses().map((course) => {
      const required = roster.filter((e) => courseApplies(course, e.department))
      const certified = required.filter((e) => {
        const cell = this.cellStatus(e.id, course)
        return cell.status === 'competent' || cell.status === 'expiring'
      })
      return {
        ...course,
        requiredEmployees: required.length,
        certifiedEmployees: certified.length,
        compliancePct: required.length ? Math.round((certified.length / required.length) * 100) : 100,
        upcomingSessions: this.sessions.filter((s) => s.courseId === course.id && s.companyId === companyId && s.status === 'Scheduled').length,
      }
    })
  }

  createCourse(input: NewCourseInput, actor: Actor): CourseView {
    this.requireRole(actor, ['admin', 'hse_manager'])
    if (!input.name.trim() || input.durationHours <= 0) {
      throw new ApiError('validation', 'Course name and a positive duration are required.')
    }
    const course: TrainingCourse = {
      ...input,
      id: `trn-c-${Date.now().toString(36)}`,
      code: `TRN-${this.nextCourseCode++}`,
      passMark: 80,
      applies: input.applies.length ? input.applies : 'all',
      custom: true,
    }
    this.customCourses.push(course)
    this.persist()
    this.notify('system', `Training course added: ${course.code}`, `${course.name} — ${course.mandatory ? 'mandatory' : 'optional'}, ${course.validityMonths ? `${course.validityMonths}-month validity` : 'no expiry'}.`)
    return { ...course, requiredEmployees: 0, certifiedEmployees: 0, compliancePct: 100, upcomingSessions: 0 }
  }

  trainingMatrix(companyId: string, actor: Actor): TrainingMatrix {
    const employees = this.scopeRoster(companyId, actor).map((e) => this.competencyFor(e))
    const usedCourseIds = new Set<string>()
    employees.forEach((e) => Object.keys(e.cells).forEach((id) => usedCourseIds.add(id)))
    const courses = this.allCourses()
      .filter((c) => usedCourseIds.has(c.id))
      .map((c) => ({ id: c.id, code: c.code, name: c.name, mandatory: c.mandatory }))
    return {
      courses,
      employees: employees.sort((a, b) => a.compliancePct - b.compliancePct || a.name.localeCompare(b.name)),
    }
  }

  private toCertView(cert: Certificate): CertificateView {
    const course = this.courseById(cert.courseId)
    const emp = EMPLOYEES.find((e) => e.id === cert.employeeId)
    const { status, days } = this.certStatus(cert)
    return {
      ...cert,
      status,
      daysToExpiry: days,
      siteId: emp?.siteId ?? '-',
      department: emp ? deptNameOf(emp.departmentId) : '-',
      mandatory: course?.mandatory ?? false,
    }
  }

  getEmployeeTraining(employeeId: string): EmployeeTrainingProfile {
    const emp = rosterFor('big').concat(rosterFor('kcs')).find((e) => e.id === employeeId)
    if (!emp) throw new ApiError('not_found', 'Employee not found.')
    const competency = this.competencyFor(emp)
    const required = requiredCoursesFor(emp.department).map((course) => {
      const cert = this.certFor(emp.id, course.id)
      return {
        course,
        status: competency.cells[course.id].status,
        cert: cert ? this.toCertView(cert) : undefined,
      }
    })
    const current = this.currentCertIds()
    const certificates = this.certificates
      .filter((c) => c.employeeId === employeeId && current.has(c.id))
      .map((c) => this.toCertView(c))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
    const upcomingRenewals = certificates
      .filter((c) => c.status === 'expiring' && c.daysToExpiry !== null)
      .map((c) => ({ courseName: c.courseName, expiryDate: c.expiryDate!, daysToExpiry: c.daysToExpiry! }))
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
    const enrolledSessions = this.sessions
      .filter((s) => s.enrolled.includes(employeeId) && s.status === 'Scheduled')
      .map((s) => this.toSessionView(s))
    const history: EmployeeTrainingProfile['history'] = [
      ...certificates.map((c) => ({ at: c.issueDate, kind: 'certified' as const, text: `Certified: ${c.courseName} (${c.number})` })),
      ...certificates.filter((c) => c.status === 'expired').map((c) => ({ at: c.expiryDate!, kind: 'expired' as const, text: `Expired: ${c.courseName}` })),
      ...enrolledSessions.map((s) => ({ at: s.scheduledFor, kind: 'enrolled' as const, text: `Enrolled: ${s.courseName} (${s.code})` })),
    ].sort((a, b) => b.at.localeCompare(a.at))
    return { competency, required, certificates, upcomingRenewals, enrolledSessions, history }
  }

  private toSessionView(s: TrainingSession): SessionView {
    const daysToStart = dayDiff(s.scheduledFor)
    return {
      ...s,
      enrolledCount: s.enrolled.length,
      passedCount: (s.attendance ?? []).filter((a) => a.result === 'pass').length,
      siteName: s.siteId.toUpperCase(),
      daysToStart,
      overdue: s.status === 'Scheduled' && daysToStart < 0,
      seatsLeft: Math.max(0, s.maxParticipants - s.enrolled.length),
    }
  }

  listSessions(companyId: string, filters: SessionFilters): SessionView[] {
    const q = filters.q?.trim().toLowerCase()
    return this.sessions
      .filter((s) => s.companyId === companyId)
      .map((s) => this.toSessionView(s))
      .filter((s) => !filters.siteId || s.siteId === filters.siteId)
      .filter((s) => {
        switch (filters.status ?? 'all') {
          case 'all': return true
          case 'scheduled': return s.status === 'Scheduled'
          case 'completed': return s.status === 'Completed'
        }
      })
      .filter((s) => !q || [s.code, s.courseName, s.trainer, s.venue].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (x: SessionView) => (x.status === 'Scheduled' ? 0 : 1)
        return rank(a) - rank(b) || (rank(a) === 0 ? a.scheduledFor.localeCompare(b.scheduledFor) : b.scheduledFor.localeCompare(a.scheduledFor))
      })
  }

  createSession(input: NewSessionInput, actor: Actor): SessionView {
    this.requireRole(actor, ['admin', 'hse_manager', 'safety_officer'])
    const course = this.courseById(input.courseId)
    if (!course) throw new ApiError('validation', 'Select a valid course.')
    if (!input.trainer || !input.venue.trim() || !input.scheduledFor) {
      throw new ApiError('validation', 'Trainer, venue and date are required.')
    }
    if (input.enrolled.length > input.maxParticipants) {
      throw new ApiError('validation', `Enrolment exceeds the ${input.maxParticipants}-seat capacity.`)
    }
    const session: TrainingSession = {
      id: `ses-${this.nextSessionCode}`,
      code: `SES-${this.nextSessionCode++}`,
      courseId: course.id, courseName: course.name,
      trainer: input.trainer, venue: input.venue.trim(), mode: input.mode,
      scheduledFor: input.scheduledFor, durationHours: course.durationHours,
      maxParticipants: input.maxParticipants, companyId: input.companyId, siteId: input.siteId,
      status: 'Scheduled', enrolled: [...new Set(input.enrolled)], certificatesIssued: [],
    }
    this.sessions.push(session)
    this.persist()
    this.notify('system', `Training session scheduled: ${session.code}`, `${course.name} on ${input.scheduledFor} — trainer ${input.trainer}, ${session.enrolled.length} enrolled.`)
    return this.toSessionView(session)
  }

  enrollSession(sessionId: string, employeeIds: string[], actor: Actor): SessionView {
    this.requireRole(actor, ['admin', 'hse_manager', 'safety_officer'])
    const s = this.sessions.find((x) => x.id === sessionId)
    if (!s) throw new ApiError('not_found', 'Session not found.')
    if (s.status !== 'Scheduled') throw new ApiError('validation', 'Only scheduled sessions accept enrolment.')
    const merged = [...new Set([...s.enrolled, ...employeeIds])]
    if (merged.length > s.maxParticipants) throw new ApiError('validation', `That exceeds the ${s.maxParticipants}-seat capacity.`)
    s.enrolled = merged
    this.persist()
    return this.toSessionView(s)
  }

  completeSession(sessionId: string, input: CompleteSessionInput, actor: Actor): { session: SessionView; certificates: CertificateView[] } {
    const s = this.sessions.find((x) => x.id === sessionId)
    if (!s) throw new ApiError('not_found', 'Session not found.')
    if (s.status !== 'Scheduled') throw new ApiError('validation', 'This session is already completed.')
    if (s.trainer !== actor.name && !['admin', 'hse_manager', 'safety_officer'].includes(actor.role)) {
      throw new ApiError('forbidden', 'Only the trainer (or a Safety Officer and above) can close this session.')
    }
    if (!input.signature.trim()) throw new ApiError('validation', 'A trainer signature is required.')
    if (input.attendance.length === 0) throw new ApiError('validation', 'Record attendance before completing.')
    for (const a of input.attendance) {
      if (a.present && a.result === null) {
        throw new ApiError('validation', 'Every present attendee needs a Pass or Fail result.')
      }
    }

    const course = this.courseById(s.courseId)!
    const now = new Date().toISOString()
    const issued: Certificate[] = []
    for (const att of input.attendance) {
      if (att.present && att.result === 'pass') {
        // newly issued numbers live in the 2000+ range, clear of the ≤1999 seeds
        const number = `CERT-2026-${String(this.nextCertSeq++).padStart(4, '0')}`
        // supersede any prior cert for this employee+course by adding a newer one
        const cert: Certificate = {
          id: `cert-${att.employeeId}-${s.courseId}-${this.nextCertSeq}`,
          number,
          qrKey: number,
          employeeId: att.employeeId,
          employeeName: att.employeeName,
          courseId: s.courseId,
          courseName: s.courseName,
          sessionId: s.id,
          issueDate: now.slice(0, 10),
          expiryDate: course.validityMonths
            ? (() => { const d = new Date(); d.setMonth(d.getMonth() + course.validityMonths!); return d.toISOString().slice(0, 10) })()
            : null,
          issuedBy: actor.name,
          score: att.score,
        }
        this.certificates.push(cert)
        issued.push(cert)
        s.certificatesIssued.push(cert.id)
      }
    }
    s.status = 'Completed'
    s.attendance = input.attendance
    s.completedAt = now
    s.completedBy = actor.name
    s.signature = input.signature.trim()
    this.persist()
    this.notify('system', `${s.code} completed — ${issued.length} certificate(s) issued`, `${s.courseName}: ${input.attendance.filter((a) => a.present).length} attended, ${issued.length} passed.`)
    return { session: this.toSessionView(s), certificates: issued.map((c) => this.toCertView(c)) }
  }

  listCertificates(companyId: string, filters: TrainingFilters, actor: Actor): CertificateView[] {
    const scopedIds = new Set(this.scopeRoster(companyId, actor).map((e) => e.id))
    const current = this.currentCertIds()
    const q = filters.q?.trim().toLowerCase()
    return this.certificates
      .filter((c) => current.has(c.id))
      .map((c) => this.toCertView(c))
      .filter((c) => scopedIds.has(c.employeeId))
      .filter((c) => !filters.siteId || c.siteId === filters.siteId)
      .filter((c) => (filters.status ?? 'all') === 'all' || c.status === filters.status)
      .filter((c) => !q || [c.number, c.employeeName, c.courseName].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = { expired: 0, expiring: 1, competent: 2 }
        return rank[a.status] - rank[b.status] || (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9)
      })
  }

  verifyCertificate(codeOrKey: string): CertVerification {
    const key = codeOrKey.trim().toUpperCase()
    const cert = this.certificates.find((c) => c.number.toUpperCase() === key || c.qrKey.toUpperCase() === key)
    if (!cert) return { valid: false, reason: 'No certificate matches this code. It may be counterfeit or mistyped.' }
    const view = this.toCertView(cert)
    if (view.status === 'expired') return { valid: false, reason: `Certificate expired on ${cert.expiryDate}. Renewal required.`, certificate: view }
    return { valid: true, reason: view.status === 'expiring' ? `Valid — expires in ${view.daysToExpiry} days.` : 'Valid and current.', certificate: view }
  }

  /** Manager escalation: turn a lapsed mandatory competency into a tracked CAPA action. */
  raiseTrainingAction(employeeId: string, courseId: string, actor: Actor): CapaItem {
    this.requireRole(actor, REVIEW_ROLES)
    const emp = rosterFor('big').concat(rosterFor('kcs')).find((e) => e.id === employeeId)
    const course = this.courseById(courseId)
    if (!emp || !course) throw new ApiError('not_found', 'Employee or course not found.')
    const now = new Date().toISOString()
    const action: StandaloneAction = {
      id: `sa-trn-${Date.now().toString(36)}`,
      code: `CA-${this.nextActionCode++}`,
      title: `Training lapse: ${emp.name} — ${course.name}`,
      description: `${course.name} is a mandatory competency for ${emp.department} and has lapsed or is missing for ${emp.name}. Enrol and re-certify.`,
      causeId: null,
      owner: emp.department.includes('HSE') ? 'Marcus Tan' : emp.name,
      reviewer: 'Marcus Tan',
      dueDate: new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10),
      priority: 'High',
      status: 'Open',
      progress: 0,
      evidenceRequired: true,
      createdAt: now,
      notes: [],
      log: [{ id: `l-${Date.now().toString(36)}`, at: now, actor: actor.name, action: 'Action created', detail: `Raised from training competency gap` }],
      companyId: EMPLOYEES.find((e) => e.id === employeeId)!.companyId,
      siteId: emp.siteId,
      department: emp.department,
      rootCause: `Training lapse (${course.code})`,
    }
    this.standalone.unshift(action)
    this.persist()
    this.notify('action', `Corrective action ${action.code} raised`, `${emp.name} — ${course.name} competency lapse.`)
    return this.toCapa(action, null, action)
  }

  trainingStats(companyId: string): TrainingStats {
    const roster = rosterFor(companyId)
    const comps = roster.map((e) => this.competencyFor(e))
    const totalRequired = comps.reduce((s, c) => s + c.requiredCount, 0)
    const totalCompetent = comps.reduce((s, c) => s + c.competentCount, 0)
    const compliancePct = totalRequired ? Math.round((totalCompetent / totalRequired) * 100) : 100

    // mandatory-only compliance
    let mReq = 0
    let mOk = 0
    for (const e of roster) {
      for (const course of requiredCoursesFor(e.department)) {
        if (!course.mandatory) continue
        mReq++
        if (this.cellStatus(e.id, course).status === 'competent') mOk++
      }
    }
    const mandatoryPct = mReq ? Math.round((mOk / mReq) * 100) : 100

    const current = this.currentCertIds()
    const certs = this.certificates
      .filter((c) => current.has(c.id) && roster.some((e) => e.id === c.employeeId))
      .map((c) => this.toCertView(c))
    const expiring = (within: number) => certs.filter((c) => c.status === 'expiring' && c.daysToExpiry !== null && c.daysToExpiry <= within).length

    // department & site training scores (compliance %)
    const deptAgg = new Map<string, { req: number; ok: number }>()
    const siteAgg = new Map<string, { req: number; ok: number }>()
    comps.forEach((c) => {
      const d = deptAgg.get(c.department) ?? { req: 0, ok: 0 }
      d.req += c.requiredCount; d.ok += c.competentCount; deptAgg.set(c.department, d)
      const s = siteAgg.get(c.siteId) ?? { req: 0, ok: 0 }
      s.req += c.requiredCount; s.ok += c.competentCount; siteAgg.set(c.siteId, s)
    })
    const pct = (v: { req: number; ok: number }) => (v.req ? Math.round((v.ok / v.req) * 100) : 100)

    // training hours delivered per month (present attendees × course hours)
    const months: { month: string; Hours: number }[] = []
    for (let m = 5; m >= 0; m--) {
      const d = new Date(); d.setMonth(d.getMonth() - m)
      const key = d.toISOString().slice(0, 7)
      const hrs = this.sessions
        .filter((s) => s.companyId === companyId && s.status === 'Completed' && (s.completedAt ?? '').slice(0, 7) === key)
        .reduce((sum, s) => sum + s.durationHours * (s.attendance ?? []).filter((a) => a.present).length, 0)
      months.push({ month: d.toLocaleDateString('en-MY', { month: 'short' }), Hours: hrs })
    }

    return {
      compliancePct,
      mandatoryPct,
      totalEmployees: roster.length,
      employeesTrained: comps.filter((c) => c.compliancePct >= 100).length,
      employeesOverdue: comps.filter((c) => c.hasExpiredMandatory).length,
      expiring30: expiring(30),
      expiring60: expiring(60),
      expiring90: expiring(90),
      expired: certs.filter((c) => c.status === 'expired').length,
      upcomingSessions: this.sessions.filter((s) => s.companyId === companyId && s.status === 'Scheduled').length,
      trainingHoursMonth: months[months.length - 1]?.Hours ?? 0,
      byDepartment: [...deptAgg.entries()].map(([name, v]) => ({ name, value: pct(v) })).sort((a, b) => a.value - b.value),
      bySite: [...siteAgg.entries()].map(([name, v]) => ({ name: name.toUpperCase(), value: pct(v) })).sort((a, b) => a.value - b.value),
      expiryBreakdown: [
        { name: 'Expired', value: certs.filter((c) => c.status === 'expired').length },
        { name: '≤30 days', value: expiring(30) },
        { name: '31–60 days', value: expiring(60) - expiring(30) },
        { name: '61–90 days', value: expiring(90) - expiring(60) },
      ],
      monthlyHours: months,
    }
  }

  /** Deterministic reminder + escalation sweep; each threshold fires once. */
  private sweepReminders() {
    const thresholds: { tag: string; test: (d: number) => boolean; title: (i: CapaItem) => string; detail: (i: CapaItem) => string }[] = [
      { tag: 'd7', test: (d) => d === 7, title: (i) => `${i.code} due in 7 days`, detail: (i) => `${i.title} — owner ${i.owner}.` },
      { tag: 'd3', test: (d) => d === 3, title: (i) => `${i.code} due in 3 days`, detail: (i) => `${i.title} — owner ${i.owner}.` },
      { tag: 'd1', test: (d) => d === 1, title: (i) => `${i.code} due tomorrow`, detail: (i) => `${i.title} — owner ${i.owner}.` },
      { tag: 'd0', test: (d) => d === 0, title: (i) => `${i.code} is due today`, detail: (i) => `${i.title} — owner ${i.owner}.` },
      { tag: 'over', test: (d) => d < 0, title: (i) => `${i.code} is overdue`, detail: (i) => `${i.title} — ${Math.abs(i.daysToDue)} day(s) late.` },
      { tag: 'esc1', test: (d) => d <= -3, title: (i) => `Escalated to site manager: ${i.code}`, detail: (i) => `${i.title} — 3+ days overdue at ${i.siteId.toUpperCase()}.` },
      { tag: 'esc2', test: (d) => d <= -7, title: (i) => `Escalated to HSE Manager: ${i.code}`, detail: (i) => `${i.title} — 7+ days overdue. Intervention required.` },
    ]
    let changed = false
    for (const companyId of ['big', 'kcs']) {
      for (const item of this.allCapa(companyId)) {
        if (!['Open', 'Assigned', 'In Progress'].includes(item.derived)) continue
        for (const t of thresholds) {
          const key = `${item.id}:${t.tag}`
          if (!this.remindersSent[key] && t.test(item.daysToDue)) {
            this.remindersSent[key] = true
            this.notify('action', t.title(item), t.detail(item))
            changed = true
          }
        }
      }
    }
    if (this.sweepTrainingReminders()) changed = true
    if (changed) this.persist()
  }

  /** Certificate expiry reminders (90/60/30/7 days) + expired escalation. */
  private sweepTrainingReminders(): boolean {
    const bands: { tag: string; test: (d: number) => boolean; title: (c: CertificateView) => string }[] = [
      { tag: 't90', test: (d) => d === 90, title: (c) => `${c.courseName} expires in 90 days — ${c.employeeName}` },
      { tag: 't60', test: (d) => d === 60, title: (c) => `${c.courseName} expires in 60 days — ${c.employeeName}` },
      { tag: 't30', test: (d) => d === 30, title: (c) => `${c.courseName} expires in 30 days — ${c.employeeName}` },
      { tag: 't7', test: (d) => d === 7, title: (c) => `${c.courseName} expires in 7 days — ${c.employeeName}` },
      { tag: 'texp', test: (d) => d < 0, title: (c) => `${c.mandatory ? 'MANDATORY training expired' : 'Certificate expired'}: ${c.employeeName} — ${c.courseName}` },
    ]
    let changed = false
    const current = this.currentCertIds()
    for (const cert of this.certificates) {
      if (cert.expiryDate === null || !current.has(cert.id)) continue
      const view = this.toCertView(cert)
      if (view.daysToExpiry === null) continue
      for (const b of bands) {
        const key = `${cert.id}:${b.tag}`
        if (!this.trainingRemindersSent[key] && b.test(view.daysToExpiry)) {
          this.trainingRemindersSent[key] = true
          this.notify(cert.expiryDate && view.daysToExpiry < 0 && view.mandatory ? 'action' : 'system', b.title(view),
            view.daysToExpiry < 0
              ? `${Math.abs(view.daysToExpiry)} day(s) overdue${view.mandatory ? ' — escalated to manager' : ''}.`
              : `Renewal reminder — schedule a session for ${cert.courseName}.`)
          changed = true
        }
      }
    }
    return changed
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

    const capa = this.allCapa(companyId).filter((a) => !siteId || a.siteId === siteId)
    const overdueBySite = new Map<string, number>()
    capa.filter((a) => a.overdue).forEach((a) => overdueBySite.set(a.siteId, (overdueBySite.get(a.siteId) ?? 0) + 1))

    const scopedAssets = this.assets
      .filter((a) => a.companyId === companyId && (!siteId || a.siteId === siteId) && a.status !== 'Retired')
      .map((a) => this.toAssetView(a))

    const astats = this.auditStats(companyId)
    const tstats = this.trainingStats(companyId)

    return {
      openIncidents: open.length,
      highRisk: open.filter((i) => i.highRisk).length,
      bySite,
      recent,
      overdueActions: capa.filter((a) => a.overdue).length,
      verificationPending: capa.filter((a) => a.derived === 'Waiting Verification').length,
      overdueActionsBySite: overdueBySite,
      overdueInspections: scopedAssets.filter((a) => a.overdue).length,
      avgAssetHealth: scopedAssets.length
        ? Math.round(scopedAssets.reduce((s, a) => s + a.health, 0) / scopedAssets.length)
        : null,
      auditReadiness: astats.readiness,
      compliancePct: astats.compliancePct,
      criticalFindings: astats.criticalFindings,
      upcomingAudits30d: astats.upcoming30d,
      openFindings: astats.openFindings,
      trainingCompliance: tstats.compliancePct,
      certsExpiring90: tstats.expiring90,
      employeesTrainingOverdue: tstats.employeesOverdue,
      trainingDeptRankings: tstats.byDepartment,
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private causesWithoutActions(incident: Incident): string[] {
    const covered = new Set(
      incident.actions.filter((a) => a.status !== 'Cancelled').map((a) => a.causeId).filter(Boolean),
    )
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

// ─── CAPA helpers ────────────────────────────────────────────────────────────

/** Whole days from today to the due date (negative = overdue). */
function dayDiff(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate + 'T00:00:00')
  return Math.round((due.getTime() - today.getTime()) / 86400_000)
}

function isActionOverdue(a: IncidentAction): boolean {
  if (a.status === 'Verified' || a.status === 'Cancelled' || a.status === 'Completed') return false
  return dayDiff(a.dueDate) < 0
}

function deriveCapaStatus(a: IncidentAction, incident: Incident | null): CapaDerivedStatus {
  if (a.status === 'Cancelled') return 'Cancelled'
  if (a.status === 'Verified') return incident ? (incident.stage === 'closed' ? 'Closed' : 'Verified') : 'Closed'
  if (a.status === 'Completed') return 'Waiting Verification'
  if (a.status === 'In Progress') return 'In Progress'
  return a.owner ? 'Assigned' : 'Open'
}

function matchesBucket(i: CapaItem, bucket: NonNullable<CapaFilters['bucket']>): boolean {
  const openStates: CapaDerivedStatus[] = ['Open', 'Assigned', 'In Progress', 'Waiting Verification']
  switch (bucket) {
    case 'all': return i.derived !== 'Cancelled'
    case 'open': return openStates.includes(i.derived)
    case 'overdue': return i.overdue
    case 'due_today': return i.daysToDue === 0 && openStates.includes(i.derived)
    case 'verification': return i.derived === 'Waiting Verification'
    case 'high_priority': return i.priority === 'High' && openStates.includes(i.derived)
    case 'completed': return i.derived === 'Verified' || i.derived === 'Closed'
    case 'cancelled': return i.derived === 'Cancelled'
  }
}

function canMutateCapa(actor: Actor, item: CapaItem): boolean {
  const orgWide = !actor.siteIds || actor.siteIds.length === 0
  switch (actor.role) {
    case 'admin':
    case 'hse_manager':
      return true
    case 'safety_officer':
    case 'supervisor':
      return item.owner === actor.name || orgWide || actor.siteIds!.includes(item.siteId)
    case 'employee':
      return item.owner === actor.name
    default:
      return false
  }
}

function canVerifyCapa(actor: Actor, item: CapaItem): boolean {
  return REVIEW_ROLES.includes(actor.role) || (!!item.reviewer && item.reviewer === actor.name)
}

// ─── Standalone action seeds (audit & inspection findings) ───────────────────

function buildStandaloneSeeds(): StandaloneAction[] {
  const mk = (over: Partial<StandaloneAction> & Pick<StandaloneAction, 'id' | 'code' | 'title' | 'companyId' | 'siteId' | 'department' | 'owner' | 'dueDate' | 'priority' | 'status'>): StandaloneAction => ({
    causeId: null,
    evidenceRequired: true,
    progress: over.status === 'Verified' ? 100 : over.status === 'In Progress' ? 50 : 0,
    createdAt: daysAgo(10),
    notes: [],
    log: [],
    reviewer: 'Marcus Tan',
    ...over,
  })

  return [
    mk({
      id: 'sa-901', code: 'CA-901', title: 'Replace expired fire extinguishers — Block C racking',
      description: 'Monthly inspection found 6 extinguishers past service date in Block C.',
      companyId: 'big', siteId: 'sen', department: 'Warehouse', rootCause: 'Inspection finding',
      owner: 'Grace Lim', dueDate: inDays(3), priority: 'Medium', status: 'In Progress', progress: 50,
      createdAt: daysAgo(6), startedAt: daysAgo(4),
    }),
    mk({
      id: 'sa-902', code: 'CA-902', title: 'CIMAH: revalidate safety report for compressor MOC',
      description: 'Major audit finding — safety report does not reflect the export compressor modification.',
      companyId: 'big', siteId: 'btu', department: 'HSE', rootCause: 'Audit finding (CIMAH)',
      owner: 'Marcus Tan', reviewer: 'Randy Richard', dueDate: inDays(19), priority: 'High', status: 'Open', progress: 0,
      createdAt: daysAgo(12),
    }),
    mk({
      id: 'sa-903', code: 'CA-903', title: 'Repaint pedestrian walkway demarcation after resurfacing',
      description: 'Resurfacing works removed walkway lines on the main production route.',
      companyId: 'big', siteId: 'kch', department: 'Production', rootCause: 'Inspection finding',
      owner: 'Sarah Wong', dueDate: inDays(-2), priority: 'High', status: 'In Progress', progress: 75,
      createdAt: daysAgo(14), startedAt: daysAgo(9),
    }),
    mk({
      id: 'sa-904', code: 'CA-904', title: 'Clear quarterly harness inspection backlog (Crew A & B)',
      companyId: 'big', siteId: 'mri', department: 'Contractors', rootCause: 'Compliance schedule',
      owner: 'Vincent Chai', dueDate: inDays(6), priority: 'Medium', status: 'Open', progress: 0,
      createdAt: daysAgo(5),
    }),
    mk({
      id: 'sa-905', code: 'CA-905', title: 'Update chemical register for new solvent line',
      companyId: 'big', siteId: 'twu', department: 'Mill', rootCause: 'Management of change',
      owner: 'Dayang Nurul', dueDate: inDays(0), priority: 'Medium', status: 'In Progress', progress: 25,
      createdAt: daysAgo(8), startedAt: daysAgo(3), evidenceRequired: false,
    }),
    mk({
      id: 'sa-906', code: 'CA-906', title: 'Relocate eyewash signage — inbound dock',
      companyId: 'big', siteId: 'sen', department: 'Warehouse', rootCause: 'Duplicate entry',
      owner: 'Grace Lim', dueDate: inDays(4), priority: 'Low', status: 'Cancelled', progress: 0,
      createdAt: daysAgo(9), cancelledAt: daysAgo(7), cancelReason: 'Duplicate of CA-901 scope.',
    }),
    mk({
      id: 'sa-907', code: 'CA-907', title: 'Renew hose reel annual service certificates',
      companyId: 'big', siteId: 'sbu', department: 'Logistics', rootCause: 'Compliance schedule',
      owner: 'Grace Lim', dueDate: inDays(-16), priority: 'Low', status: 'Verified', progress: 100,
      createdAt: daysAgo(30), startedAt: daysAgo(25), completedAt: daysAgo(18),
      verifiedBy: 'Marcus Tan', verifiedAt: daysAgo(17),
      evidenceNote: 'Service certificates uploaded and filed against each reel.',
    }),
    mk({
      id: 'sa-k90', code: 'CA-K90', title: 'Install task lighting for night pours — Zone B',
      companyId: 'kcs', siteId: 'pjy', department: 'Civil Works', rootCause: 'Inspection finding',
      owner: 'Azlan Mahmud', reviewer: 'Azlan Mahmud', dueDate: inDays(5), priority: 'Medium', status: 'In Progress', progress: 25,
      createdAt: daysAgo(4), startedAt: daysAgo(2),
    }),
  ]
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
