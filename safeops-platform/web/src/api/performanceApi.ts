import { request, qs } from './http'

/**
 * HSE performance - the organisation-wide view an HSE manager reports upwards.
 *
 * Lagging indicators are the industry-standard injury rates, normalised by exposure hours
 * so a 40-man site and a 900-man site can be compared on one scale. Leading indicators are
 * the activity that prevents injuries (ISO 45001 §9.1). The server computes every figure;
 * a rate that has no hours to divide by comes back as null, never as zero.
 */

export interface Indicators {
  // Lagging
  lostTime: number
  recordable: number
  fatalities: number
  injuries: number
  daysLost: number
  hours: number
  /** 0..1: the share of `hours` that is estimated from headcount rather than recorded. */
  estimatedShare: number
  workers: number
  /** Lost-time injuries per 1,000,000 hours (DOSH JKKP 8 / ILO). */
  frequencyRate: number | null
  /** Days lost per 1,000,000 hours (DOSH JKKP 8). */
  severityRate: number | null
  /** Lost-time injuries per 1,000 workers (DOSH JKKP 8). */
  incidenceRate: number | null
  /** Recordable injuries per 200,000 hours (OSHA). */
  trir: number | null
  // Leading
  nearMisses: number
  /** Near misses reported per recordable injury. */
  nearMissRatio: number | null
  actionsClosed: number
  actionsClosedOnTime: number
  /** 0..1 */
  onTimeClosure: number | null
  overdueActions: number
  toolboxMeetings: number
}

export interface MonthPoint {
  month: string // YYYY-MM
  lostTime: number
  recordable: number
  nearMisses: number
  hours: number
  estimatedShare: number
  frequencyRate: number | null
}

export interface SitePerformance extends Indicators {
  siteId: string
  siteName: string
}

/** Which indicators can carry a target. Matches TARGET_METRICS on the server. */
export type TargetMetric =
  | 'frequencyRate' | 'severityRate' | 'incidenceRate' | 'trir' | 'fatalities' | 'overdueActions'
  | 'nearMissRatio' | 'onTimeClosure'

export interface Target {
  metric: TargetMetric
  /** In the indicator's own unit; onTimeClosure is a fraction 0..1. */
  value: number
  /** `max`: on target at or below the value. `min`: at or above it. */
  direction: 'max' | 'min'
}

export interface PerformanceView {
  from: string
  to: string
  months: MonthPoint[]
  total: Indicators
  sites: SitePerformance[]
  targets: Target[]
  basis: { frequency: number; trir: number; incidence: number; estimatedHoursPerWorkerMonth: number }
}

export interface ManHoursMonth {
  month: string // YYYY-MM
  hours: number
  updatedBy: string
  updatedAt: string
}

export interface ManHoursSite {
  siteId: string
  siteName: string
  headcount: number
  estimatePerMonth: number
  months: ManHoursMonth[]
}

export interface ManHoursYear {
  year: number
  sites: ManHoursSite[]
}

export const performanceApi = {
  get: (p: { companyId: string; projectId?: string | null; months?: number; endMonth?: string }, signal?: AbortSignal) =>
    request<PerformanceView>(`/performance?${qs({ companyId: p.companyId, projectId: p.projectId, months: p.months, endMonth: p.endMonth })}`, { signal }),

  manHours: (companyId: string, year: number, signal?: AbortSignal) =>
    request<ManHoursYear>(`/performance/man-hours?${qs({ companyId, year })}`, { signal }),

  /** `hours: null` clears a recorded month so it falls back to the headcount estimate. */
  setManHours: (b: { companyId: string; siteId: string; month: string; hours: number | null }) =>
    request<unknown>('/performance/man-hours', { method: 'PUT', body: JSON.stringify(b) }),

  /** `value: null` removes the target. */
  setTarget: (b: { companyId: string; metric: TargetMetric; value: number | null }) =>
    request<unknown>('/performance/targets', { method: 'PUT', body: JSON.stringify(b) }),
}
