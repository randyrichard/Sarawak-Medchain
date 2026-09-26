import { request, qs } from './http'

/**
 * The daily site toolbox meeting - the whole-site pre-shift briefing.
 *
 * Not the toolbox talk on a permit (see permitWorkflowApi), which briefs one job's named
 * crew. Attendance here is a headcount per organisation, because the meeting is hundreds
 * of people from several firms at a muster point.
 */

export interface AttendanceGroup {
  id?: string
  organisation: string
  count: number
}

export interface ToolboxMeeting {
  id: string
  number: string
  companyId: string
  siteId: string
  site?: { name: string; timezone: string }
  heldAt: string
  ledBy: string
  topic: string
  hazards: string
  notes: string
  headcount: number
  recordedBy: string
  groups: AttendanceGroup[]
  createdAt: string
  updatedAt: string
}

export interface ToolboxInput {
  siteId: string
  heldAt: string
  ledBy: string
  topic: string
  hazards?: string
  notes?: string
  groups: AttendanceGroup[]
}

export interface ToolboxFilters {
  siteId?: string
  from?: string
  to?: string
  q?: string
  page?: number
  pageSize?: number
}

export interface ToolboxToday {
  sites: {
    siteId: string
    siteName: string
    date: string
    held: boolean
    headcount: number
    meetings: Pick<ToolboxMeeting, 'id' | 'number' | 'heldAt' | 'topic' | 'ledBy' | 'headcount'>[]
  }[]
  held: number
  total: number
  headcount: number
}

export const toolboxApi = {
  list(companyId: string, f: ToolboxFilters = {}) {
    return request<{ rows: ToolboxMeeting[]; total: number; page: number; pageSize: number }>(
      `/toolbox?${qs({ companyId, ...f })}`,
    )
  },
  today(companyId: string) {
    return request<ToolboxToday>(`/toolbox/today?${qs({ companyId })}`)
  },
  organisations(companyId: string) {
    return request<{ rows: string[] }>(`/toolbox/organisations?${qs({ companyId })}`).then((r) => r.rows)
  },
  get(companyId: string, id: string) {
    return request<ToolboxMeeting>(`/toolbox/${id}?${qs({ companyId })}`)
  },
  create(companyId: string, input: ToolboxInput) {
    return request<ToolboxMeeting>('/toolbox', { method: 'POST', body: JSON.stringify({ companyId, ...input }) })
  },
  update(companyId: string, id: string, input: ToolboxInput) {
    return request<ToolboxMeeting>(`/toolbox/${id}`, { method: 'PUT', body: JSON.stringify({ companyId, ...input }) })
  },
  remove(companyId: string, id: string) {
    return request<void>(`/toolbox/${id}?${qs({ companyId })}`, { method: 'DELETE' })
  },
}
