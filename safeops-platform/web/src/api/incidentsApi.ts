import { API_BASE_URL, authApi, getAccessToken } from './authApi'
import { ApiError } from './types'
import type {
  FiveWhys, Incident, IncidentAction, IncidentAttachment, IncidentComment,
  IncidentTimelineEntry, RcaCause,
} from './incidents'

/**
 * HTTP client for the incident vertical.
 *
 * Replaces the incident, RCA, CAPA, note, archive and dashboard-counter methods that
 * MockApiClient served from localStorage. Nothing here reads browser storage: the server
 * is the only source of truth, and the access token lives in memory (see authApi).
 */

interface Page<T> {
  rows: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Server row shape. Deliberately separate from the UI `Incident` type. */
interface ServerIncident {
  id: string
  number: string
  companyId: string
  siteId: string
  title: string
  description: string
  type: Incident['type']
  severity: Incident['severity']
  stage: Incident['stage']
  department: string
  location: string
  gps: string | null
  immediateActions: string
  reporter: string
  reporterId: string | null
  investigator: string | null
  riskRating: string | null
  potentialSeverity: Incident['severity'] | null
  highRisk: boolean
  findings: string | null
  closeNote: string | null
  occurredAt: string
  reportedAt: string
  closedAt: string | null
  version: number
  rcaCauses: RcaCause[] | null
  rcaFiveWhys: FiveWhys | null
  rcaApprovedBy: string | null
  rcaApprovedAt: string | null
  events?: { id: string; action: string; detail: string | null; actor: string; actorRole: string | null; at: string }[]
  comments?: { id: string; body: string; author: string; mentions: string[]; createdAt: string }[]
  attachments?: { id: string; originalName: string; mimeType: string; sizeBytes: number; uploadedBy: string; createdAt: string }[]
  actions?: ServerAction[]
}

interface ServerAction {
  id: string
  code: string
  incidentId: string | null
  companyId: string
  siteId: string
  title: string
  detail: string
  owner: string
  dueDate: string
  priority: IncidentAction['priority']
  status: string
  evidenceNote: string | null
  completedAt: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  source: string
  version: number
  createdAt: string
  notes?: { id: string; body: string; author: string; mentions: string[]; createdAt: string }[]
}

/** Server status vocabulary → the labels the existing UI renders. */
const ACTION_STATUS: Record<string, IncidentAction['status']> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
}
const ACTION_STATUS_TO_SERVER: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_STATUS).map(([k, v]) => [v, k]),
)

function toAction(a: ServerAction): IncidentAction {
  return {
    id: a.id,
    code: a.code,
    title: a.title,
    causeId: null,
    owner: a.owner,
    dueDate: a.dueDate.slice(0, 10),
    priority: a.priority,
    status: ACTION_STATUS[a.status] ?? 'Open',
    evidenceRequired: true,
    evidenceNote: a.evidenceNote ?? undefined,
    verifiedBy: a.verifiedBy ?? undefined,
    verifiedAt: a.verifiedAt ?? undefined,
    completedAt: a.completedAt ?? undefined,
    createdAt: a.createdAt,
    notes: (a.notes ?? []).map((n) => ({
      id: n.id, author: n.author, at: n.createdAt, text: n.body, mentions: n.mentions,
    })),
  }
}

/** Maps a server row onto the shape the existing screens already render. */
export function toIncident(s: ServerIncident): Incident {
  return {
    id: s.id,
    number: s.number,
    title: s.title,
    description: s.description,
    type: s.type,
    severity: s.severity,
    stage: s.stage,
    companyId: s.companyId,
    siteId: s.siteId,
    department: s.department,
    location: s.location,
    gps: s.gps ?? undefined,
    immediateActions: s.immediateActions,
    reporter: s.reporter,
    investigator: s.investigator ?? undefined,
    highRisk: s.highRisk,
    archived: false, // archived rows are excluded server-side; a mapped row is always live
    peopleInvolved: [],
    witnesses: [],
    // Assessment is a nested object in the UI type, flat columns on the server.
    assessment: s.riskRating
      ? {
          riskRating: s.riskRating as never,
          potentialSeverity: (s.potentialSeverity ?? s.severity) as never,
          requiresInvestigation: true,
          assessedBy: '',
          assessedAt: s.reportedAt,
        }
      : undefined,
    findings: s.findings ?? undefined,
    closeNote: s.closeNote ?? undefined,
    occurredAt: s.occurredAt,
    reportedAt: s.reportedAt,
    closedAt: s.closedAt ?? undefined,
    version: s.version,
    rca: s.rcaCauses
      ? {
          causes: s.rcaCauses,
          fiveWhys: s.rcaFiveWhys ?? { problem: '', whys: ['', '', '', '', ''], rootStatement: '' },
          approvedBy: s.rcaApprovedBy ?? undefined,
          approvedAt: s.rcaApprovedAt ?? undefined,
        }
      : undefined,
    actions: (s.actions ?? []).map(toAction),
    comments: (s.comments ?? []).map<IncidentComment>((c) => ({
      id: c.id, text: c.body, author: c.author, mentions: c.mentions, at: c.createdAt,
    })),
    attachments: (s.attachments ?? []).map<IncidentAttachment>((a) => ({
      id: a.id,
      name: a.originalName,
      kind: a.mimeType.startsWith('image/') ? 'image' : 'pdf',
      sizeKb: Math.max(1, Math.round(a.sizeBytes / 1024)),
      uploadedBy: a.uploadedBy,
      at: a.createdAt,
    })),
    timeline: (s.events ?? []).map<IncidentTimelineEntry>((e) => ({
      id: e.id, action: e.action, detail: e.detail ?? undefined, actor: e.actor, at: e.at,
    })),
  }
}

/**
 * Single request helper.
 *
 * Refreshes a stale access token before the call rather than after a 401, so a normal
 * user action never fails on an expired token. A 401 that still comes back means the
 * session is genuinely gone, and one retry is attempted before giving up.
 */
async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  try {
    await authApi.refreshIfNeeded()
  } catch {
    // Refresh failed — let the request proceed and surface the real 401 below.
  }

  const isForm = init.body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    // Network-level failure — distinguishable from a server rejection so the UI can
    // offer "retry" rather than showing a validation-style message.
    throw new ApiError('network', 'Cannot reach the server. Check your connection and try again.')
  }

  if (res.status === 401 && retry) {
    try {
      await authApi.refreshIfNeeded()
      return await request<T>(path, init, false)
    } catch {
      throw new ApiError('unauthenticated', 'Your session has expired. Please sign in again.')
    }
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.error ?? 'request_failed', body.message ?? 'Something went wrong.')
  }
  return body as T
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  return p.toString()
}

export interface IncidentPageResult {
  rows: Incident[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const incidentsApi = {
  async list(companyId: string, filters: {
    page?: number; pageSize?: number; q?: string; type?: string
    severity?: string; stage?: string; status?: string; siteId?: string | null
  } = {}): Promise<IncidentPageResult> {
    const data = await request<Page<ServerIncident>>(
      `/incidents?${qs({ companyId, ...filters, siteId: filters.siteId ?? undefined })}`,
    )
    return { ...data, rows: data.rows.map(toIncident) }
  },

  async get(id: string): Promise<Incident> {
    return toIncident(await request<ServerIncident>(`/incidents/${id}`))
  },

  async create(input: {
    companyId: string; siteId: string; title: string; description?: string
    type: string; severity: string; department?: string; location: string
    gps?: string; immediateActions?: string; occurredAt: string
  }): Promise<Incident> {
    return toIncident(await request<ServerIncident>('/incidents', {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async advance(id: string, payload: {
    to: string; note?: string; investigator?: string; findings?: string
    riskRating?: string; potentialSeverity?: string; expectedVersion?: number
  }): Promise<Incident> {
    return toIncident(await request<ServerIncident>(`/incidents/${id}/advance`, {
      method: 'POST', body: JSON.stringify(payload),
    }))
  },

  async saveRca(id: string, causes: RcaCause[], fiveWhys: FiveWhys): Promise<Incident> {
    return toIncident(await request<ServerIncident>(`/incidents/${id}/rca`, {
      method: 'PUT', body: JSON.stringify({ causes, fiveWhys }),
    }))
  },

  async approveRca(id: string): Promise<Incident> {
    return toIncident(await request<ServerIncident>(`/incidents/${id}/rca/approve`, { method: 'POST' }))
  },

  async archive(id: string): Promise<void> {
    await request<unknown>(`/incidents/${id}/archive`, { method: 'POST' })
  },

  async addComment(id: string, body: string, mentions: string[] = []) {
    return request<{ id: string; body: string; author: string; createdAt: string }>(
      `/incidents/${id}/comments`, { method: 'POST', body: JSON.stringify({ body, mentions }) },
    )
  },

  /** Multipart upload. Content-Type is left unset so the browser adds the boundary. */
  async uploadAttachments(id: string, files: File[]) {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return request<{ attachments: unknown[] }>(`/incidents/${id}/attachments`, {
      method: 'POST', body: form,
    })
  },

  attachmentUrl: (attachmentId: string) => `${API_BASE_URL}/incidents/attachments/${attachmentId}`,

  // ── Corrective actions ─────────────────────────────────────────────────────

  async addAction(incidentId: string, input: {
    title: string; detail?: string; owner: string; dueDate: string; priority?: string
  }): Promise<IncidentAction> {
    return toAction(await request<ServerAction>(`/incidents/${incidentId}/actions`, {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async addStandaloneAction(input: {
    companyId: string; siteId: string; title: string; detail?: string
    owner: string; dueDate: string; priority?: string; source?: string
  }): Promise<IncidentAction> {
    return toAction(await request<ServerAction>('/incidents/actions', {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async updateAction(actionId: string, patch: {
    status?: IncidentAction['status']; evidenceNote?: string; dueDate?: string; expectedVersion?: number
  }): Promise<IncidentAction> {
    return toAction(await request<ServerAction>(`/incidents/actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...patch,
        status: patch.status ? ACTION_STATUS_TO_SERVER[patch.status] : undefined,
      }),
    }))
  },

  async getAction(actionId: string) {
    return request<ServerAction>(`/incidents/actions/${actionId}`)
  },

  async addActionNote(actionId: string, body: string, mentions: string[] = []) {
    return request<{ id: string; body: string; author: string; createdAt: string }>(
      `/incidents/actions/${actionId}/notes`, { method: 'POST', body: JSON.stringify({ body, mentions }) },
    )
  },

  async listActions(companyId: string, opts: {
    page?: number; pageSize?: number; status?: string; owner?: string
    overdue?: boolean; source?: string
  } = {}) {
    const data = await request<Page<ServerAction>>(`/incidents/actions/list?${qs({ companyId, ...opts })}`)
    // The register is company-wide, so an action has to carry where it belongs. `toAction`
    // returns the incident-scoped shape, which has no room for it — every row would land
    // in the list with no site, and the site filter would match nothing.
    return {
      ...data,
      rows: data.rows.map((r) => ({
        ...toAction(r),
        companyId: r.companyId,
        siteId: r.siteId,
        incidentId: r.incidentId,
        source: r.source,
      })),
    }
  },

  async actionAnalytics(companyId: string) {
    return request<{
      byStatus: { key: string; count: number }[]
      byPriority: { key: string; count: number }[]
      bySource: { key: string; count: number }[]
      overdue: number
      avgDaysToComplete: number | null
      totalClosed: number
    }>(`/incidents/actions/analytics?${qs({ companyId })}`)
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async stats(companyId: string, siteId?: string | null) {
    return request<{
      open: number; highRisk: number; nearMissThisMonth: number; closed: number; total: number
      openActions: number; overdueActions: number; awaitingVerification: number
    }>(`/incidents/stats?${qs({ companyId, siteId: siteId ?? undefined })}`)
  },
}
