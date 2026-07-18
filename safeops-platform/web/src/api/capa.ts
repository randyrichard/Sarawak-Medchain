// ─── CAPA (Corrective Action) domain ─────────────────────────────────────────
// One unified read model over every corrective action in the system — embedded
// in incidents (Sprint 3) or standalone (audit/inspection findings). The store
// owns both; the CAPA module is views over this model.

import type { ActionPriority, ActionStatus } from './incidents'

/** Stored status lives on the action; display status is derived from context. */
export type CapaDerivedStatus =
  | 'Open'                 // no owner yet (standalone intake)
  | 'Assigned'             // owner set, work not started
  | 'In Progress'
  | 'Waiting Verification' // completed, reviewer has not signed off
  | 'Verified'
  | 'Closed'               // verified and parent incident closed (or standalone signed off)
  | 'Cancelled'

export type KanbanColumn = 'Open' | 'Assigned' | 'In Progress' | 'Verification' | 'Completed'

export const COLUMN_OF: Record<CapaDerivedStatus, KanbanColumn | null> = {
  Open: 'Open',
  Assigned: 'Assigned',
  'In Progress': 'In Progress',
  'Waiting Verification': 'Verification',
  Verified: 'Completed',
  Closed: 'Completed',
  Cancelled: null, // cancelled actions never appear on the board
}

export interface ActionNote {
  id: string
  author: string
  at: string
  text: string
  mentions: string[]
}

export interface CapaTimelineEntry {
  id: string
  at: string
  actor: string
  action: string
  detail?: string
}

export interface CapaItem {
  id: string
  code: string // human ref, e.g. CA-2605-1 / CA-903
  title: string
  description?: string

  companyId: string
  siteId: string
  department: string

  incidentId: string | null
  incidentNumber?: string
  incidentTitle?: string
  rootCause?: string // RCA category (linked) or finding source (standalone)

  owner: string
  reviewer?: string
  priority: ActionPriority
  dueDate: string
  createdAt: string

  status: ActionStatus
  derived: CapaDerivedStatus
  overdue: boolean
  /** negative = overdue by n days */
  daysToDue: number

  progress: number // 0 | 25 | 50 | 75 | 100
  evidenceRequired: boolean
  evidenceNote?: string
  startedAt?: string
  completedAt?: string
  verifiedBy?: string
  verifiedAt?: string
  cancelledAt?: string
  cancelReason?: string

  notes: ActionNote[]
  timeline: CapaTimelineEntry[]
}

export interface CapaFilters {
  q?: string
  siteId?: string
  owner?: string
  priority?: ActionPriority | ''
  /** derived-status bucket */
  bucket?: 'all' | 'open' | 'overdue' | 'due_today' | 'verification' | 'high_priority' | 'completed' | 'cancelled'
}

export interface CapaStats {
  open: number
  overdue: number
  completed30d: number
  verificationPending: number
  highPriority: number
  dueToday: number
}

export interface NewStandaloneAction {
  title: string
  description?: string
  companyId: string
  siteId: string
  department: string
  rootCause?: string
  owner: string
  reviewer?: string
  priority: ActionPriority
  dueDate: string
  evidenceRequired: boolean
}

export interface CapaPatch {
  status?: ActionStatus
  progress?: number
  evidenceNote?: string
  owner?: string
  reviewer?: string
  dueDate?: string
  priority?: ActionPriority
  description?: string
}

export interface CapaAnalytics {
  completionRate: number // % verified/closed of all non-cancelled
  avgCloseDays: number | null
  onTimeRate: number
  mostOverdueSite: { site: string; count: number } | null
  bySite: { name: string; value: number }[] // open+overdue load per site
  byDepartment: { name: string; value: number }[] // on-time completion %
  byOwner: { name: string; open: number; overdue: number; completed: number }[]
  monthlyCompletions: { month: string; Completed: number; Created: number }[]
}
