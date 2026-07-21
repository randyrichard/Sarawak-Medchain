// ─── Audit & Compliance domain ───────────────────────────────────────────────
// Audits run reusable checklist templates; failed items become findings; every
// finding auto-creates a corrective action (CAPA). An audit cannot close until
// each finding's action is verified — audit-ready every day, by construction.

export const AUDIT_TYPES = [
  'internal', 'external', 'dosh', 'iso45001', 'customer', 'contractor',
  'supplier', 'environmental', 'quality', 'custom',
] as const
export type AuditType = (typeof AUDIT_TYPES)[number]

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  internal: 'Internal Audit',
  external: 'External Audit',
  dosh: 'DOSH Inspection',
  iso45001: 'ISO 45001 Audit',
  customer: 'Customer Audit',
  contractor: 'Contractor Audit',
  supplier: 'Supplier Audit',
  environmental: 'Environmental Audit',
  quality: 'Quality Audit',
  custom: 'Custom Audit',
}

export type AuditStatus = 'Planned' | 'In Progress' | 'Completed' | 'Closed'
export type AuditPriority = 'High' | 'Medium' | 'Low'

export type FindingSeverity = 'Critical' | 'Major' | 'Minor' | 'Observation'

/** Days-to-due for the auto-created corrective action, by severity. */
export const SEVERITY_DUE_DAYS: Record<FindingSeverity, number> = {
  Critical: 7, Major: 14, Minor: 30, Observation: 45,
}

export interface AuditTemplateItem {
  id: string
  text: string
  guidance?: string
}

export interface AuditTemplateSection {
  title: string
  items: AuditTemplateItem[]
}

export interface AuditTemplate {
  id: string
  name: string
  type: AuditType
  sections: AuditTemplateSection[]
  /** custom templates are tenant-created */
  custom?: boolean
}

export type AuditAnswerResult = 'pass' | 'fail' | 'na'

export interface AuditAnswer {
  itemId: string
  section: string
  text: string
  result: AuditAnswerResult
  comment?: string
  photoCount?: number
}

export interface AuditFinding {
  id: string
  code: string // F-####
  category: string // checklist section
  description: string
  severity: FindingSeverity
  evidenceNote?: string
  photoCount: number
  linkedAssetId?: string
  linkedIncidentId?: string
  /** the auto-created corrective action */
  actionId: string
  raisedBy: string
  raisedAt: string
}

export interface AuditTimelineEntry {
  id: string
  at: string
  actor: string
  action: string
  detail?: string
}

export interface Audit {
  id: string
  code: string // AUD-####
  title: string
  type: AuditType
  customType?: string
  companyId: string
  siteId: string
  department: string
  leadAuditor: string
  team: string[]
  templateId: string
  scheduledFor: string
  durationDays: number
  priority: AuditPriority
  status: AuditStatus
  startedAt?: string
  completedAt?: string
  closedAt?: string
  /** % of applicable items that passed */
  score?: number
  answers?: AuditAnswer[]
  signature?: string
  gps?: string
  findings: AuditFinding[]
  timeline: AuditTimelineEntry[]
}

export type FindingDerivedStatus = 'Open' | 'Action In Progress' | 'Awaiting Verification' | 'Closed'

export interface AuditFindingView extends AuditFinding {
  auditId: string
  auditCode: string
  auditTitle: string
  siteId: string
  department: string
  status: FindingDerivedStatus
  actionCode: string
  actionOwner: string
  actionDue: string
  actionOverdue: boolean
}

export interface AuditView extends Audit {
  templateName: string
  openFindings: number
  criticalFindings: number
  /** planned date passed without starting */
  overdue: boolean
  daysToStart: number
}

// ─── Compliance register ─────────────────────────────────────────────────────

export type ObligationStatus = 'Compliant' | 'Expiring Soon' | 'Overdue'

export interface ComplianceObligation {
  id: string
  regulation: string
  requirement: string
  responsible: string
  companyId: string
  siteId: string | null // null = organisation-wide
  nextDue: string
  expiryDate?: string
  evidenceDoc?: string
  notes?: string
  lastRenewedAt?: string
}

export interface ObligationView extends ComplianceObligation {
  status: ObligationStatus
  daysToDue: number
}

// ─── Document management ─────────────────────────────────────────────────────

export const DOC_KINDS = [
  'policy', 'sop', 'certificate', 'inspection_report', 'permit', 'training_record', 'audit_report',
] as const
export type DocKind = (typeof DOC_KINDS)[number]

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  policy: 'Policy',
  sop: 'SOP',
  certificate: 'Certificate',
  inspection_report: 'Inspection Report',
  permit: 'Permit',
  training_record: 'Training Record',
  audit_report: 'Audit Report',
}

export type DocStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Superseded'

export interface ComplianceDocument {
  id: string
  name: string
  kind: DocKind
  version: string
  status: DocStatus
  owner: string
  companyId: string
  siteId: string | null
  sizeKb: number
  updatedAt: string
  approvedBy?: string
  approvedAt?: string
  history: { version: string; at: string; by: string; note: string }[]
}

// ─── Inputs & stats ──────────────────────────────────────────────────────────

export interface NewAuditInput {
  title: string
  type: AuditType
  customType?: string
  companyId: string
  siteId: string
  department: string
  leadAuditor: string
  team: string[]
  templateId: string
  scheduledFor: string
  durationDays: number
  priority: AuditPriority
}

export interface FailInput {
  severity: FindingSeverity
  description: string
  owner: string
  photoCount: number
  linkedAssetId?: string
}

export interface CompleteAuditInput {
  answers: AuditAnswer[]
  /** per failed itemId: the finding to raise */
  fails: Record<string, FailInput>
  signature: string
  gps?: string
}

export interface AuditFilters {
  q?: string
  siteId?: string
  status?: AuditStatus | ''
  type?: AuditType | ''
}

export interface AuditStats {
  upcoming30d: number
  openFindings: number
  criticalFindings: number
  overdueFindingActions: number
  compliancePct: number
  avgScore: number | null
  readiness: number
  completedAudits: number
  findingsByCategory: { name: string; value: number }[]
  bySiteOpenFindings: { name: string; value: number }[]
  byDeptOpenFindings: { name: string; value: number }[]
  monthlyTrend: { month: string; Audits: number; Findings: number }[]
}
