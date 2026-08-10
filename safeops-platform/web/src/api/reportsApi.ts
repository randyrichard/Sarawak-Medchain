import { blob, request, qs } from './http'

/**
 * Scheduled reports.
 *
 * Delivery status is carried through verbatim: when no mail provider is configured the
 * server says so and the UI repeats it, rather than showing a green tick for an email
 * nobody received.
 */

export type ReportType = 'overdue_actions' | 'open_investigations'
export type ReportFrequency = 'daily' | 'weekly' | 'monthly'

export interface ReportColumn { key: string; label: string; width: number }

export interface ReportData {
  type: ReportType
  title: string
  companyName: string
  siteName: string | null
  generatedAt: string
  periodStart: string | null
  periodEnd: string
  summary: { label: string; value: string }[]
  columns: ReportColumn[]
  rows: Record<string, string>[]
  emptyMessage: string
}

export interface ReportRecipient {
  userId: string
  name: string
  email: string
  role: string
}

export interface ReportSchedule {
  id: string
  companyId: string
  name: string
  reportType: ReportType
  typeLabel: string
  enabled: boolean
  frequency: ReportFrequency
  dayOfWeek: number
  timeOfDay: string
  timezone: string
  /** "Every Monday at 08:00 Asia/Kuching" — built server-side so it cannot drift. */
  scheduleLabel: string
  recipientUserIds: string[]
  recipients: { userId: string; name: string; email: string }[]
  /** Recipients who have since left the workspace. Surfaced, not hidden. */
  unreachableRecipients: number
  siteId: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunError: string | null
  nextRunAt: string | null
  createdBy: string
  createdAt: string
}

export interface ReportRun {
  id: string
  scheduleId: string | null
  reportType: ReportType
  typeLabel: string
  trigger: string
  startedAt: string
  completedAt: string | null
  status: string
  rowCount: number
  recipientCount: number
  delivered: boolean
  deliveryNote: string | null
  /** generated | email_pending | sent | failed */
  deliveryStatus: 'generated' | 'email_pending' | 'sent' | 'failed'
  /** The provider's own id, for answering "did it go?" from their dashboard. */
  messageId: string | null
  sentAt: string | null
  failureReason: string | null
  /** resend | smtp. Never anything about its credentials. */
  provider: string | null
  /** Delivery attempts made so far, and the ceiling. Retrying is bounded, visibly. */
  attempts: number
  maxAttempts: number
  /** When the next attempt is due. Set only while a retry is still owed. */
  nextAttemptAt: string | null
  originalName: string | null
  sizeBytes: number | null
  error: string | null
  triggeredBy: string
}

export const reportsApi = {
  catalog(): Promise<{
    types: { key: ReportType; label: string }[]
    /** False when no provider is set up; the UI says so rather than implying delivery. */
    mailConfigured: boolean
    configured: boolean
    provider: string | null
  }> {
    return request('/reports/catalog')
  },

  preview(companyId: string, type: ReportType, siteId?: string): Promise<ReportData> {
    return request(`/reports/preview?${qs({ companyId, type, siteId })}`)
  },

  /** The same report as a PDF. Fetched as a blob so it carries the Authorization header. */
  previewPdf(companyId: string, type: ReportType, siteId?: string): Promise<Blob> {
    return blob(`/reports/preview.pdf?${qs({ companyId, type, siteId })}`)
  },

  recipients(companyId: string): Promise<ReportRecipient[]> {
    return request<{ rows: ReportRecipient[] }>(`/reports/recipients?${qs({ companyId })}`)
      .then((r) => r.rows)
  },

  listSchedules(companyId: string): Promise<ReportSchedule[]> {
    return request<{ rows: ReportSchedule[] }>(`/reports/schedules?${qs({ companyId })}`)
      .then((r) => r.rows)
  },

  createSchedule(input: {
    companyId: string
    name: string
    reportType: ReportType
    frequency: ReportFrequency
    dayOfWeek: number
    timeOfDay: string
    timezone: string
    recipientUserIds: string[]
    siteId?: string | null
    enabled?: boolean
  }): Promise<ReportSchedule> {
    return request('/reports/schedules', { method: 'POST', body: JSON.stringify(input) })
  },

  updateSchedule(id: string, input: Partial<{
    name: string
    frequency: ReportFrequency
    dayOfWeek: number
    timeOfDay: string
    timezone: string
    recipientUserIds: string[]
    siteId: string | null
    enabled: boolean
  }>): Promise<ReportSchedule> {
    return request(`/reports/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  },

  deleteSchedule(id: string): Promise<void> {
    return request(`/reports/schedules/${id}`, { method: 'DELETE' })
  },

  runNow(id: string): Promise<{ skipped: boolean; rowCount?: number }> {
    return request(`/reports/schedules/${id}/run`, { method: 'POST', body: JSON.stringify({}) })
  },

  history(companyId: string, scheduleId?: string): Promise<ReportRun[]> {
    return request<{ rows: ReportRun[] }>(`/reports/runs?${qs({ companyId, scheduleId })}`)
      .then((r) => r.rows)
  },

  runFile(runId: string): Promise<Blob> {
    return blob(`/reports/runs/${runId}/file`)
  },
}

/** Common zones, with Sarawak first because that is where the customers are. */
export const TIMEZONES = [
  'Asia/Kuching', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta',
  'Asia/Bangkok', 'Asia/Manila', 'Asia/Dubai', 'Europe/London', 'UTC',
]

export const WEEKDAYS = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]
