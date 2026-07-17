// ─── Incident domain types ───────────────────────────────────────────────────
// The 8-stage workflow is a server-enforced state machine: the mock store (and
// later the real API) rejects invalid transitions regardless of what UI asks.

export const INCIDENT_STAGES = [
  'reported', 'assessment', 'investigation', 'rca', 'actions', 'review', 'verification', 'closed',
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
}

export const INCIDENT_TYPES = [
  'near_miss', 'first_aid', 'mtc', 'rwc', 'lti', 'fatality',
  'property_damage', 'environmental', 'vehicle', 'fire', 'unsafe_act', 'unsafe_condition',
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
}

export type IncidentSeverity = 'Minor' | 'Moderate' | 'Serious' | 'Critical'
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

export type ActionStatus = 'Open' | 'In Progress' | 'Completed' | 'Verified'
export type ActionPriority = 'High' | 'Medium' | 'Low'

export interface IncidentAction {
  id: string
  title: string
  causeId: string | null
  owner: string
  dueDate: string
  priority: ActionPriority
  status: ActionStatus
  evidenceRequired: boolean
  evidenceNote?: string
  completedAt?: string
  verifiedBy?: string
  verifiedAt?: string
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
  reporter: string
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
  role: string // Role from types.ts; kept loose here to avoid a cycle
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
  occurredAt: string
  reporter: string
  peopleInvolved: PersonInvolved[]
  witnesses: string[]
  immediateActions: string
  description: string
  attachments: Omit<IncidentAttachment, 'id' | 'at' | 'uploadedBy'>[]
  signature: string
}

export type IncidentStatusFilter =
  | 'all' | 'open' | 'closed' | 'overdue' | 'high_risk' | 'awaiting_review' | 'investigating'

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
