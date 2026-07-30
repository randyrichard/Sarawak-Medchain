import { drainRows } from './paging'
import { request, qs } from './http'
import type {
  Audit, AuditAnswer, AuditFilters, AuditFinding, AuditFindingView, AuditPriority,
  AuditStats, AuditStatus, AuditTemplate, AuditType, AuditView, CompleteAuditInput,
  ComplianceDocument, DocKind, DocStatus, FindingDerivedStatus,
  FindingSeverity, NewAuditInput, ObligationView,
} from './audits'

/**
 * HTTP client for the audit & compliance vertical.
 *
 * Replaces the browser-storage store. Scoring, checklist validation, the corrective
 * action raised for every finding and the rule that an audit cannot close over an
 * unverified action are all enforced on the server; this file only maps shapes.
 */

interface Page<T> {
  rows: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** The server stores snake_case enums; the screens render the labels below. */
const STATUS_FROM_SERVER: Record<string, AuditStatus> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  closed: 'Closed',
}
const STATUS_TO_SERVER: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_FROM_SERVER).map(([k, v]) => [v, k]),
)

const DOC_STATUS_FROM_SERVER: Record<string, DocStatus> = {
  Draft: 'Draft',
  PendingApproval: 'Pending Approval',
  Approved: 'Approved',
  Superseded: 'Superseded',
}

interface ServerFinding {
  id: string
  code: string
  category: string
  description: string
  severity: FindingSeverity
  evidenceNote: string | null
  photoCount: number
  linkedAssetId: string | null
  linkedIncidentId: string | null
  actionId: string
  raisedBy: string
  raisedAt: string
  auditId: string
  auditCode: string
  auditTitle: string
  siteId: string
  department: string
  status: FindingDerivedStatus
  actionCode: string
  actionOwner: string
  actionDue: string | null
  actionOverdue: boolean
}

interface ServerAudit {
  id: string
  code: string
  companyId: string
  siteId: string
  title: string
  type: AuditType
  customType: string | null
  department: string
  leadAuditor: string
  team: string[]
  templateId: string
  scheduledFor: string
  durationDays: number
  priority: AuditPriority
  status: string
  startedAt: string | null
  completedAt: string | null
  closedAt: string | null
  score: number | null
  answers: AuditAnswer[] | null
  signature: string | null
  gps: string | null
  findings: ServerFinding[]
  timeline: { id: string; action: string; detail: string | null; actor: string; at: string }[]
  templateName: string
  openFindings: number
  criticalFindings: number
  overdue: boolean
  daysToStart: number
}

interface ServerObligation {
  id: string
  companyId: string
  siteId: string | null
  regulation: string
  requirement: string
  responsible: string
  nextDue: string
  expiryDate: string | null
  evidenceDoc: string | null
  notes: string | null
  lastRenewedAt: string | null
  daysToDue: number
  status: ObligationView['status']
}

interface ServerDocument {
  id: string
  companyId: string
  siteId: string | null
  name: string
  kind: DocKind
  version: string
  status: string
  owner: string
  sizeKb: number
  approvedBy: string | null
  approvedAt: string | null
  updatedAt: string
  versions: { id: string; version: string; note: string; by: string; at: string }[]
}

const nu = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

/** Date-only fields are stored at UTC midnight, so the first ten characters are the date. */
const asDate = (iso: string) => iso.slice(0, 10)

function toFinding(f: ServerFinding): AuditFindingView {
  return {
    id: f.id,
    code: f.code,
    category: f.category,
    description: f.description,
    severity: f.severity,
    evidenceNote: nu(f.evidenceNote),
    photoCount: f.photoCount,
    linkedAssetId: nu(f.linkedAssetId),
    linkedIncidentId: nu(f.linkedIncidentId),
    actionId: f.actionId,
    raisedBy: f.raisedBy,
    raisedAt: f.raisedAt,
    auditId: f.auditId,
    auditCode: f.auditCode,
    auditTitle: f.auditTitle,
    siteId: f.siteId,
    department: f.department,
    status: f.status,
    actionCode: f.actionCode,
    actionOwner: f.actionOwner,
    actionDue: f.actionDue ? asDate(f.actionDue) : '—',
    actionOverdue: f.actionOverdue,
  }
}

export function toAudit(s: ServerAudit): AuditView {
  return {
    id: s.id,
    code: s.code,
    title: s.title,
    type: s.type,
    customType: nu(s.customType),
    companyId: s.companyId,
    siteId: s.siteId,
    department: s.department,
    leadAuditor: s.leadAuditor,
    team: s.team,
    templateId: s.templateId,
    scheduledFor: asDate(s.scheduledFor),
    durationDays: s.durationDays,
    priority: s.priority,
    status: STATUS_FROM_SERVER[s.status] ?? 'Planned',
    startedAt: nu(s.startedAt),
    completedAt: nu(s.completedAt),
    closedAt: nu(s.closedAt),
    score: nu(s.score),
    answers: nu(s.answers),
    signature: nu(s.signature),
    gps: nu(s.gps),
    findings: s.findings.map((f) => toFinding(f) as unknown as AuditFinding),
    timeline: s.timeline.map((e) => ({
      id: e.id, at: e.at, actor: e.actor, action: e.action, detail: nu(e.detail),
    })),
    templateName: s.templateName,
    openFindings: s.openFindings,
    criticalFindings: s.criticalFindings,
    overdue: s.overdue,
    daysToStart: s.daysToStart,
  }
}

function toObligation(o: ServerObligation): ObligationView {
  return {
    id: o.id,
    regulation: o.regulation,
    requirement: o.requirement,
    responsible: o.responsible,
    companyId: o.companyId,
    siteId: o.siteId,
    nextDue: asDate(o.nextDue),
    expiryDate: o.expiryDate ? asDate(o.expiryDate) : undefined,
    evidenceDoc: nu(o.evidenceDoc),
    notes: nu(o.notes),
    lastRenewedAt: nu(o.lastRenewedAt),
    daysToDue: o.daysToDue,
    status: o.status,
  }
}

function toDocument(d: ServerDocument): ComplianceDocument {
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    version: d.version,
    status: DOC_STATUS_FROM_SERVER[d.status] ?? 'Draft',
    owner: d.owner,
    companyId: d.companyId,
    siteId: d.siteId,
    sizeKb: d.sizeKb,
    updatedAt: d.updatedAt,
    approvedBy: nu(d.approvedBy),
    approvedAt: nu(d.approvedAt),
    history: d.versions.map((v) => ({
      version: v.version, at: v.at, by: v.by, note: v.note,
    })),
  }
}

export const auditsApi = {
  async listTemplates(companyId: string): Promise<AuditTemplate[]> {
    return request<AuditTemplate[]>(`/audits/templates?${qs({ companyId })}`)
  },

  async createTemplate(companyId: string, name: string, items: string[]): Promise<AuditTemplate> {
    return request<AuditTemplate>('/audits/templates', {
      method: 'POST', body: JSON.stringify({ companyId, name, items }),
    })
  },

  /** One page, with the server's true total — the input `drain` needs. */
  async listAuditsPage(
    companyId: string, filters: AuditFilters = {}, page = 1, pageSize = 200,
  ): Promise<{ rows: AuditView[]; total: number }> {
    const data = await request<Page<ServerAudit>>(`/audits?${qs({
      companyId,
      q: filters.q,
      siteId: filters.siteId,
      status: filters.status ? STATUS_TO_SERVER[filters.status] : undefined,
      type: filters.type || undefined,
      page,
      pageSize,
    })}`)
    return { rows: data.rows.map(toAudit), total: data.total }
  },

  /** Every audit matching the filter, not just the first page. See `paging.ts`. */
  async listAudits(companyId: string, filters: AuditFilters = {}): Promise<AuditView[]> {
    return drainRows((page, pageSize) => this.listAuditsPage(companyId, filters, page, pageSize))
  },

  async getAuditDetail(id: string) {
    const data = await request<{
      audit: ServerAudit; findings: ServerFinding[]; template: AuditTemplate
    }>(`/audits/${id}`)
    return {
      audit: toAudit(data.audit),
      findings: data.findings.map(toFinding),
      template: data.template,
    }
  },

  async createAudit(input: NewAuditInput): Promise<AuditView> {
    return toAudit(await request<ServerAudit>('/audits', {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async startAudit(id: string): Promise<AuditView> {
    return toAudit(await request<ServerAudit>(`/audits/${id}/start`, { method: 'POST' }))
  },

  async completeAudit(id: string, input: CompleteAuditInput) {
    const data = await request<{ audit: ServerAudit; findings: ServerFinding[] }>(
      `/audits/${id}/complete`, { method: 'POST', body: JSON.stringify(input) },
    )
    return { audit: toAudit(data.audit), findings: data.findings.map(toFinding) }
  },

  async closeAudit(id: string): Promise<AuditView> {
    return toAudit(await request<ServerAudit>(`/audits/${id}/close`, { method: 'POST' }))
  },

  async listFindings(companyId: string, severity?: string): Promise<AuditFindingView[]> {
    const rows = await request<ServerFinding[]>(`/audits/findings?${qs({ companyId, severity })}`)
    return rows.map(toFinding)
  },

  async listObligations(companyId: string): Promise<ObligationView[]> {
    const rows = await request<ServerObligation[]>(`/audits/obligations?${qs({ companyId })}`)
    return rows.map(toObligation)
  },

  async renewObligation(id: string, nextDue: string, note: string): Promise<ObligationView> {
    return toObligation(await request<ServerObligation>(`/audits/obligations/${id}/renew`, {
      method: 'POST', body: JSON.stringify({ nextDue, note }),
    }))
  },

  async listDocuments(companyId: string, q?: string, kind?: DocKind | ''): Promise<ComplianceDocument[]> {
    const rows = await request<ServerDocument[]>(
      `/audits/documents?${qs({ companyId, q, kind: kind || undefined })}`,
    )
    return rows.map(toDocument)
  },

  async addDocumentVersion(docId: string | null, input: {
    name: string; kind: DocKind; sizeKb: number; note: string
    companyId: string; siteId: string | null
  }): Promise<ComplianceDocument> {
    return toDocument(await request<ServerDocument>('/audits/documents', {
      method: 'POST', body: JSON.stringify({ docId, ...input }),
    }))
  },

  async approveDocument(id: string): Promise<ComplianceDocument> {
    return toDocument(await request<ServerDocument>(`/audits/documents/${id}/approve`, {
      method: 'POST',
    }))
  },

  async auditStats(companyId: string): Promise<AuditStats> {
    return request<AuditStats>(`/audits/stats?${qs({ companyId })}`)
  },
}

export type { Audit }
