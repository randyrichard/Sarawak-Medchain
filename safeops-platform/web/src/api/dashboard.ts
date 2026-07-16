// ─── Mission Control payload types ───────────────────────────────────────────
// One scoped payload powers the whole dashboard. The mock builder assembles it
// from per-site seeds; the real API will return the same shape from rollups.

import type { StatusKind } from '@/components/ui'

export type KpiTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral'

export interface Kpi {
  id: string
  label: string
  value: string
  unit?: string
  /** change vs last month, in the KPI's own unit */
  delta: number
  deltaSuffix?: string
  goodWhen: 'up' | 'down'
  tone: KpiTone
  spark: number[]
  definition: string
  breakdown: { label: string; value: string }[]
}

export type PriorityKind = 'action' | 'incident' | 'permit' | 'audit' | 'training' | 'inspection'
export type PriorityLevel = 'Critical' | 'High' | 'Medium'

export interface PriorityItem {
  id: string
  kind: PriorityKind
  priority: PriorityLevel
  title: string
  owner: string
  siteId: string
  site: string
  department: string
  due: string
  dueLabel: string
  overdue: boolean
  cta: string
  detail: string
  recommended: string
}

export type RiskBand = 'green' | 'yellow' | 'orange' | 'red'

export interface SiteRisk {
  id: string
  name: string
  short: string
  score: number
  band: RiskBand
  delta12mo: number
  trend: number[]
  openIncidents: number
  highRisk: number
  overdueActions: number
  compliance: number
  trifr: number
  headcount: number
}

export interface DashboardCharts {
  months: string[]
  incidents: number[]
  nearMisses: number[]
  lti: number[]
  unsafeActs: number[]
  unsafeConditions: number[]
  rootCauses: { name: string; value: number }[]
  actionCompletion: number[]
  incidentsLastYear: number[]
}

export interface LeaderboardEntry {
  title: string
  siteName: string
  metric: string
  kind: StatusKind
}

export type TimelineKind =
  | 'incident_reported' | 'investigation_started' | 'action_assigned'
  | 'action_completed' | 'audit_created' | 'training_completed'

export interface TimelineEvent {
  id: string
  at: string
  kind: TimelineKind
  actor: string
  text: string
  target: string
}

export interface Insight {
  id: string
  severity: StatusKind
  text: string
  suggestion: string
}

export type EventKind = 'audit' | 'training' | 'inspection' | 'permit' | 'certification'

export interface UpcomingEvent {
  id: string
  date: string
  kind: EventKind
  title: string
  site: string
}

export interface DashboardData {
  scopeLabel: string
  generatedAt: string
  kpis: Kpi[]
  priorities: PriorityItem[]
  sites: SiteRisk[]
  charts: DashboardCharts
  leaderboard: LeaderboardEntry[]
  activity: TimelineEvent[]
  insights: Insight[]
  events: UpcomingEvent[]
}
