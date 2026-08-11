import type {
  AttentionItem, AttentionKind, AttentionPriority, DashboardOverview,
} from '@/api/dashboardApi'

/**
 * The dashboard's presentation decisions.
 *
 * Extracted from the page so they can be asserted directly - the web suite has no DOM
 * renderer, and these are the parts that can be wrong in a way an operator notices: a
 * critical item shown in a calm colour, an empty state that reads like a failure, a KPI
 * linking to the wrong register.
 *
 * The page imports these; there is no second copy.
 */

export type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical'

/** What each KPI card shows, where it goes, and when it is worth looking at. */
export interface KpiCard {
  id: string
  label: string
  value: number
  href: string
  tone: Tone
  /** Said under the number when there is nothing to do, instead of a bare zero. */
  quiet: string
}

/**
 * A KPI is only coloured when it is asking for something.
 *
 * Ten active permits is not a problem, it is a Tuesday. Colouring every tile by magnitude
 * turns the dashboard into wallpaper and the one number that matters stops standing out.
 */
export function kpiCards(d: DashboardOverview): KpiCard[] {
  const k = d.kpis
  return [
    {
      id: 'activePermits',
      label: 'Active permits',
      value: k.activePermits,
      href: '/permits?status=active',
      tone: 'neutral',
      quiet: 'No live work under permit',
    },
    {
      id: 'permitsAwaitingReview',
      label: 'Permits awaiting review',
      value: k.permitsAwaitingReview,
      href: '/permits?status=awaiting',
      tone: k.permitsAwaitingReview > 0 ? 'warning' : 'neutral',
      quiet: 'Nothing waiting on a signature',
    },
    {
      id: 'overdueActions',
      label: 'Overdue actions',
      value: k.overdueActions,
      href: '/actions?due=overdue',
      tone: k.overdueActions > 0 ? 'critical' : 'good',
      quiet: 'No overdue actions',
    },
    {
      id: 'openInvestigations',
      label: 'Open investigations',
      value: k.openInvestigations,
      href: '/incidents/board?status=investigating',
      tone: k.openInvestigations > 0 ? 'serious' : 'good',
      quiet: 'Nothing under investigation',
    },
    {
      id: 'expiringEquipment',
      label: 'Equipment expiring',
      value: k.expiringEquipment,
      href: '/assets?bucket=due',
      tone: k.expiringEquipment > 0 ? 'warning' : 'good',
      quiet: 'All certificates current',
    },
    {
      id: 'equipmentOutOfService',
      label: 'Out of service',
      value: k.equipmentOutOfService,
      href: '/assets?status=out_of_service',
      tone: k.equipmentOutOfService > 0 ? 'warning' : 'neutral',
      quiet: 'Everything in service',
    },
    {
      id: 'visitorsOnSite',
      label: 'Visitors on site',
      value: k.visitorsOnSite,
      href: '/visitors?status=on_site',
      tone: 'neutral',
      quiet: 'Nobody signed in',
    },
    {
      id: 'incidentsInRange',
      label: 'Incidents in range',
      value: k.incidentsInRange,
      href: '/incidents',
      tone: 'neutral',
      quiet: 'None reported in this period',
    },
  ]
}

/** How each urgency band reads. Order here is the order the queue is shown in. */
const PRIORITY_META: Record<AttentionPriority, { label: string; tone: Tone; rank: number }> = {
  critical: { label: 'Critical', tone: 'critical', rank: 0 },
  overdue: { label: 'Overdue', tone: 'critical', rank: 1 },
  today: { label: 'Due today', tone: 'warning', rank: 2 },
  soon: { label: 'Expiring soon', tone: 'warning', rank: 3 },
  review: { label: 'Pending review', tone: 'accent', rank: 4 },
}

export function priorityLabel(p: AttentionPriority) { return PRIORITY_META[p].label }
export function priorityTone(p: AttentionPriority): Tone { return PRIORITY_META[p].tone }
export function priorityRank(p: AttentionPriority) { return PRIORITY_META[p].rank }

const KIND_LABEL: Record<AttentionKind, string> = {
  incident: 'Incident',
  action: 'Action',
  permit: 'Permit',
  equipment: 'Equipment',
  visitor: 'Visitor',
  report: 'Report',
}

export function kindLabel(k: AttentionKind) { return KIND_LABEL[k] }

/**
 * How late something is, in words.
 *
 * "31 days" is a number to decode; "a month overdue" is a fact. Zero is not "0 days late",
 * it is due today - and saying it wrong makes the operator distrust the rest of the row.
 */
export function overdueLabel(days: number | null): string | null {
  if (days === null) return null
  if (days <= 0) return 'due today'
  if (days === 1) return '1 day overdue'
  if (days < 31) return `${days} days overdue`
  const months = Math.floor(days / 30)
  return months === 1 ? 'over a month overdue' : `over ${months} months overdue`
}

/**
 * Re-sort a queue client-side after filtering by kind.
 *
 * The server already returns it ordered; this keeps that order stable when the operator
 * narrows to one kind, rather than falling back to whatever order the filter left behind.
 */
export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const band = priorityRank(a.priority) - priorityRank(b.priority)
    if (band !== 0) return band
    return (b.overdueDays ?? -1) - (a.overdueDays ?? -1)
  })
}

export function filterAttention(items: AttentionItem[], kind: AttentionKind | 'all') {
  return kind === 'all' ? items : items.filter((i) => i.kind === kind)
}

/**
 * The one-line verdict at the top of the page.
 *
 * An HSE manager should be able to read this and stop, if it says nothing is wrong.
 */
export function headline(d: DashboardOverview): { text: string; tone: Tone } {
  const critical = d.attention.filter((a) => a.priority === 'critical').length
  if (critical > 0) {
    return {
      text: `${critical} critical item${critical === 1 ? ' needs' : 's need'} attention now.`,
      tone: 'critical',
    }
  }
  const overdue = d.attention.filter((a) => a.priority === 'overdue').length
  if (overdue > 0) {
    return {
      text: `${overdue} overdue item${overdue === 1 ? '' : 's'} to clear.`,
      tone: 'warning',
    }
  }
  if (d.attentionTotal > 0) {
    return { text: `${d.attentionTotal} item(s) waiting, none overdue.`, tone: 'accent' }
  }
  return { text: 'All clear — nothing needs attention right now.', tone: 'good' }
}

/** Severity bars, sized against the largest band so a single row still reads. */
export function severityBars(d: DashboardOverview) {
  const max = Math.max(1, ...d.incidents.bySeverity.map((s) => s.count))
  return d.incidents.bySeverity.map((s) => ({
    ...s,
    /** Percentage width, floored so a count of one is still visible. */
    percent: Math.max(6, Math.round((s.count / max) * 100)),
    tone: (s.rank >= 6 ? 'critical' : s.rank >= 4 ? 'serious' : s.rank >= 2 ? 'warning' : 'neutral') as Tone,
  }))
}

/** Delivery status of a report run, in the same words the Reports page uses. */
export function reportStatusLabel(deliveryStatus: string): { label: string; tone: Tone } {
  switch (deliveryStatus) {
    case 'sent': return { label: 'Sent', tone: 'good' }
    case 'failed': return { label: 'Failed', tone: 'critical' }
    case 'email_pending': return { label: 'Sending', tone: 'warning' }
    default: return { label: 'Generated', tone: 'neutral' }
  }
}

/**
 * Which permit stages are worth showing.
 *
 * The workflow has ten states and most are empty most of the time. Showing every one turns
 * a status strip into a row of zeroes; the stages that always matter stay regardless.
 */
const ALWAYS_SHOWN = ['submitted', 'supervisor_review', 'hse_review', 'area_authority', 'active']

export function visiblePermitStages(d: DashboardOverview) {
  return d.permits.byStage.filter((s) => s.count > 0 || ALWAYS_SHOWN.includes(s.stage))
}

/** The scope line under the title: what this page is currently counting. */
export function scopeSummary(d: DashboardOverview): string {
  const parts = [d.scope.siteName ?? 'All sites']
  if (d.scope.department) parts.push(d.scope.department)
  parts.push(`${d.scope.from.slice(0, 10)} to ${d.scope.to.slice(0, 10)}`)
  return parts.join(' · ')
}

/**
 * Caveats the operator needs before they reconcile a number against a module.
 *
 * Silence here would be the dishonest option: a department filter that reached actions
 * only through their incident produces a total the Actions register will not reproduce.
 */
export function scopeCaveats(d: DashboardOverview): string[] {
  const out: string[] = []
  if (d.scope.notes.actionsFilteredByIncidentDepartment) {
    out.push(
      'Actions have no department of their own, so the department filter matched them '
      + 'through the incident that raised them. Standalone actions are excluded.',
    )
  }
  if (d.scope.siteName && d.scope.notes.reportsAreCompanyWide) {
    out.push('Scheduled reports are company-wide, so the site filter does not apply to them.')
  }
  return out
}
