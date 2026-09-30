// ─── Incident domain types ───────────────────────────────────────────────────
// The 8-stage workflow is a server-enforced state machine: the mock store (and
// later the real API) rejects invalid transitions regardless of what UI asks.

export const INCIDENT_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed',
  // A report started and not yet submitted. Last in the list because this is the storage
  // order, not the workflow order - the workflow is a state machine on the server.
  'draft',
] as const
export type IncidentStage = (typeof INCIDENT_STAGES)[number]

export const STAGE_LABEL: Record<IncidentStage, string> = {
  reported: 'Reported',
  assessment: 'Initial Assessment',
  investigation: 'Investigation',
  rca: 'Root Cause Analysis',
  actions: 'Corrective Actions',
  review: 'Manager Review',
  verification: 'Verification',
  closed: 'Closed',
  draft: 'Draft',
}

export const INCIDENT_TYPES = [
  'near_miss', 'first_aid', 'mtc', 'rwc', 'lti', 'fatality',
  'property_damage', 'environmental', 'vehicle', 'fire', 'unsafe_act', 'unsafe_condition',
  // Mirrors api/src/lib/incidentCatalog.ts. The server rejects anything not on its list,
  // and every map below has to cover every value or the register crashes rendering a row.
  'injury', 'chemical_spill', 'security', 'occupational_illness', 'equipment_failure',
] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

export const TYPE_LABEL: Record<IncidentType, string> = {
  near_miss: 'Near Miss',
  first_aid: 'First Aid Case',
  mtc: 'Medical Treatment Case',
  rwc: 'Restricted Work Case',
  lti: 'Lost Time Injury',
  fatality: 'Fatality',
  property_damage: 'Property Damage',
  environmental: 'Environmental Incident',
  vehicle: 'Vehicle Accident',
  fire: 'Fire Incident',
  unsafe_act: 'Unsafe Act',
  unsafe_condition: 'Unsafe Condition',
  injury: 'Injury',
  chemical_spill: 'Chemical Spill',
  security: 'Security',
  occupational_illness: 'Occupational Illness',
  equipment_failure: 'Equipment Failure',
}

/**
 * Outcome-based severity.
 *
 * The first four are the original scale and stay valid - rows carry them. The rest are the
 * enterprise classification. Mirrors api/src/lib/incidentCatalog.ts.
 */
export type IncidentSeverity =
  | 'Minor' | 'Moderate' | 'Serious' | 'Critical'
  | 'near_miss' | 'medical_treatment' | 'restricted_work' | 'lost_time_injury'
  | 'fatality' | 'environmental_major' | 'catastrophic'

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  near_miss: 'Near Miss',
  Minor: 'Minor',
  medical_treatment: 'Medical Treatment',
  restricted_work: 'Restricted Work Case',
  lost_time_injury: 'Lost Time Injury',
  environmental_major: 'Environmental Major',
  fatality: 'Fatality',
  catastrophic: 'Catastrophic',
  Moderate: 'Moderate',
  Serious: 'Serious',
  Critical: 'Critical',
}
export type RiskRating = 'Low' | 'Medium' | 'High' | 'Extreme'

export const RCA_CATEGORIES = [
  'Unsafe Behaviour', 'Unsafe Condition', 'Equipment Failure', 'Human Error',
  'Training Deficiency', 'Procedure Failure', 'Management System Failure', 'Environmental Factor',
] as const
export type RcaCategory = (typeof RCA_CATEGORIES)[number]

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'report'

export interface IncidentAttachment {
  id: string
  name: string
  kind: AttachmentKind
  sizeKb: number
  uploadedBy: string
  at: string
}

export interface PersonInvolved {
  name: string
  role: 'Employee' | 'Contractor'
  note?: string
}

export interface RcaCause {
  id: string
  category: RcaCategory
  description: string
}

export interface FiveWhys {
  problem: string
  whys: string[]
  rootStatement: string
}

export type ActionStatus = 'Open' | 'In Progress' | 'Completed' | 'Verified' | 'Cancelled'
export type ActionPriority = 'High' | 'Medium' | 'Low'

export interface IncidentAction {
  id: string
  /** human reference (CA-…); assigned by the store */
  code?: string
  title: string
  description?: string
  causeId: string | null
  owner: string
  /** The owner's account, when the action is linked to one. See ownsItem. */
  ownerId?: string | null
  reviewer?: string
  dueDate: string
  priority: ActionPriority
  status: ActionStatus
  /** 0 | 25 | 50 | 75 | 100 */
  progress?: number
  evidenceRequired: boolean
  evidenceNote?: string
  createdAt?: string
  startedAt?: string
  completedAt?: string
  verifiedBy?: string
  verifiedAt?: string
  cancelledAt?: string
  cancelReason?: string
  notes?: { id: string; author: string; at: string; text: string; mentions: string[] }[]
  /** per-action audit entries appended by CAPA mutations */
  log?: { id: string; at: string; actor: string; action: string; detail?: string }[]
}

export interface IncidentComment {
  id: string
  author: string
  at: string
  text: string
  mentions: string[]
}

export interface IncidentTimelineEntry {
  id: string
  at: string
  actor: string
  action: string
  detail?: string
}

export interface IncidentAssessment {
  riskRating: RiskRating
  potentialSeverity: IncidentSeverity
  requiresInvestigation: boolean
  note?: string
  assessedBy: string
  assessedAt: string
}

export interface Incident {
  id: string
  number: string
  version: number
  archived: boolean

  title: string
  type: IncidentType
  severity: IncidentSeverity
  stage: IncidentStage
  highRisk: boolean

  companyId: string
  siteId: string
  department: string
  location: string
  gps?: string
  weather?: string

  occurredAt: string
  reportedAt: string
  /** Last change of any kind. What the "recently updated" ordering sorts on. */
  updatedAt?: string
  reporter: string
  /** Reported without attribution; the server withholds the reporter below HSE manager. */
  anonymous?: boolean
  peopleInvolved: PersonInvolved[]
  witnesses: string[]
  immediateActions: string
  description: string
  signature?: string

  assignedManager?: string
  investigator?: string

  assessment?: IncidentAssessment
  findings?: string
  rca?: { causes: RcaCause[]; fiveWhys: FiveWhys; approvedBy?: string; approvedAt?: string }
  reviewNote?: string
  closeNote?: string
  closedAt?: string

  actions: IncidentAction[]
  attachments: IncidentAttachment[]
  comments: IncidentComment[]
  timeline: IncidentTimelineEntry[]
}

/** Who is performing a mutation — the mock store enforces permissions with it. */
export interface Actor {
  name: string
  /** The signed-in account. Absent in the offline demo, where names are all there is. */
  userId?: string
  role: string // Role from types.ts; kept loose here to avoid a cycle
  /** site scope from the membership; empty/undefined = org-wide */
  siteIds?: string[]
}

export interface NewIncidentInput {
  title: string
  type: IncidentType
  severity: IncidentSeverity
  companyId: string
  siteId: string
  department: string
  location: string
  gps?: string
  weather?: string
  /// Day / Night / Swing. A picked list, because the point of recording it is to count it.
  shift?: string
  emergencyResponseActivated?: boolean
  /// Reported without attribution. The server still records who, and withholds it from
  /// anyone below HSE manager.
  anonymous?: boolean
  departmentId?: string
  occurredAt: string
  reporter: string
  peopleInvolved: PersonInvolved[]
  witnesses: string[]
  immediateActions: string
  description: string
  attachments: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>[]
  signature: string
  /**
   * Idempotency key, set only when the report is being sent from the offline outbox.
   *
   * The same key is presented on every attempt so the server can recognise a replay. See
   * src/features/incidents/outbox.ts.
   */
  clientRef?: string
}

export type IncidentStatusFilter =
  | 'all' | 'open' | 'closed' | 'overdue' | 'high_risk' | 'awaiting_review' | 'investigating'
  | 'archived'

export interface IncidentFilters {
  q?: string
  siteId?: string
  type?: IncidentType | ''
  severity?: IncidentSeverity | ''
  status?: IncidentStatusFilter
}

/** Advance payloads per transition; the store validates the required one. */
export type AdvancePayload =
  | { to: 'assessment'; riskRating: RiskRating; potentialSeverity: IncidentSeverity; requiresInvestigation: boolean; note?: string }
  | { to: 'investigation'; investigator: string }
  | { to: 'rca'; findings: string }
  | { to: 'actions' }
  | { to: 'review' }
  | { to: 'verification'; reviewNote: string }
  | { to: 'closed'; closeNote: string }
