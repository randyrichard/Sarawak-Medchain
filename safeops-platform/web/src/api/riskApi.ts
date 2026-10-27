import { blob, qs, request } from './http'

/**
 * The HIRARC register: hazard identification, risk assessment and risk control, as the
 * DOSH Guidelines for HIRARC (2008) set it out.
 *
 * The rules - the bands, what a row still needs - are the server's (api/src/domain/hirarc.ts).
 * The scales are repeated here only to label the pickers and the matrix, and a test holds
 * them to the server's (riskScale.test.ts).
 */

export type RiskLevel = 'low' | 'medium' | 'high'
export type ControlsState = 'none' | 'planned' | 'in_progress' | 'done'

export interface RatingStep { value: number; label: string; description: string }

export const LIKELIHOOD: RatingStep[] = [
  { value: 5, label: 'Most Likely', description: 'The most likely result of the hazard or event being realised.' },
  { value: 4, label: 'Possible', description: 'Has a good chance of occurring and is not unusual.' },
  { value: 3, label: 'Conceivable', description: 'Might occur at some time in the future.' },
  { value: 2, label: 'Remote', description: 'Has not been known to occur after many years.' },
  { value: 1, label: 'Inconceivable', description: 'Is practically impossible and has never occurred.' },
]

export const SEVERITY: RatingStep[] = [
  { value: 5, label: 'Catastrophic', description: 'Numerous fatalities, irrecoverable property damage and loss of productivity.' },
  { value: 4, label: 'Fatal', description: 'Approximately one fatality; major property damage if the hazard is realised.' },
  { value: 3, label: 'Serious', description: 'Non-fatal injury, permanent disability.' },
  { value: 2, label: 'Minor', description: 'Disabling but not permanent injury.' },
  { value: 1, label: 'Negligible', description: 'Minor abrasions, bruises, cuts: a first-aid type injury.' },
]

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' }
export const RISK_BANDS: Record<RiskLevel, string> = { high: '15 to 25', medium: '5 to 12', low: '1 to 4' }
export const RISK_ACTION: Record<RiskLevel, string> = {
  high: 'Act now to control the hazard, following the hierarchy of control. Record the actions and their date for completion.',
  medium: 'Plan how to control the hazard, with temporary measures if they are needed. Record the actions and their date for completion.',
  low: 'May be acceptable as it is. If it can be resolved quickly and efficiently, put the control in place and record it.',
}

/** The band a score falls in: 15-25 high, 5-12 medium, 1-4 low. */
export const riskLevel = (score: number): RiskLevel => (score >= 15 ? 'high' : score >= 5 ? 'medium' : 'low')

export interface RiskAction {
  id: string
  code: string
  title: string
  owner: string
  dueDate: string
  status: 'open' | 'in_progress' | 'completed' | 'verified' | 'cancelled'
}

export interface RiskRow {
  id: string
  code: string
  companyId: string
  siteId: string
  siteName: string
  activity: string
  hazard: string
  effect: string
  existingControls: string
  likelihood: number
  severity: number
  riskScore: number
  level: RiskLevel
  additionalControls: string
  owner: string
  controlsDue: string | null
  residualLikelihood: number | null
  residualSeverity: number | null
  residualScore: number | null
  residualLevel: RiskLevel | null
  controls: ControlsState
  needsControls: boolean
  needsDate: boolean
  controlsOverdue: boolean
  reviewOverdue: boolean
  assessedBy: string
  assessedOn: string
  reviewDue: string
  archivedAt: string | null
  archivedBy: string | null
  archivedReason: string | null
  actions: RiskAction[]
  version: number
  updatedAt: string
  canEdit: boolean
}

export interface RiskRegister {
  rows: RiskRow[]
  total: number
  /** More rows matched than were sent: the matrix and counts still cover them all. */
  capped: boolean
  /** matrix.now[likelihood - 1][severity - 1]: rows in that cell. */
  matrix: { now: number[][]; residual: number[][] }
  counts: { high: number; medium: number; low: number; reviewOverdue: number; needsControls: number; controlsOverdue: number }
  canEdit: boolean
}

export type RiskAttention = 'review_overdue' | 'needs_controls' | 'controls_overdue'

export interface RiskFilters {
  siteId?: string | null
  level?: RiskLevel | null
  q?: string
  archived?: boolean
  attention?: RiskAttention | null
  likelihood?: number | null
  severity?: number | null
  residual?: boolean
}

export interface RiskInput {
  siteId: string
  activity: string
  hazard: string
  effect: string
  existingControls: string
  likelihood: number
  severity: number
  additionalControls: string
  owner: string
  controlsDue: string | null
  residualLikelihood: number | null
  residualSeverity: number | null
  assessedBy: string
  assessedOn: string
  reviewDue: string
}

export const riskApi = {
  list: (companyId: string, f: RiskFilters = {}) => request<RiskRegister>(`/risk-assessments?${qs({
    companyId, siteId: f.siteId, level: f.level, q: f.q?.trim(), archived: f.archived || undefined, attention: f.attention,
    likelihood: f.likelihood, severity: f.severity, residual: f.residual || undefined,
  })}`),
  get: (id: string) => request<RiskRow>(`/risk-assessments/${id}`),
  create: (companyId: string, input: RiskInput) =>
    request<RiskRow>('/risk-assessments', { method: 'POST', body: JSON.stringify({ companyId, ...input }) }),
  update: (id: string, input: RiskInput, version: number) =>
    request<RiskRow>(`/risk-assessments/${id}`, { method: 'PUT', body: JSON.stringify({ ...input, version }) }),
  archive: (id: string, reason: string) =>
    request<RiskRow>(`/risk-assessments/${id}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }),
  restore: (id: string) => request<RiskRow>(`/risk-assessments/${id}/restore`, { method: 'POST', body: '{}' }),
  raiseAction: (id: string, input: { title?: string; owner?: string; dueDate?: string }) =>
    request<{ id: string; code: string }>(`/risk-assessments/${id}/actions`, { method: 'POST', body: JSON.stringify(input) }),
  exportCsv: (companyId: string, siteId?: string | null) => blob(`/risk-assessments/export.csv?${qs({ companyId, siteId })}`),
}
