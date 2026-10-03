/**
 * The Mission Control priority queue, derived from live records.
 *
 * This list is the first thing anyone reads, and until now it was illustrative: a fixed
 * set of plausible items naming actions and permits that do not exist. That is fine for a
 * design review and fatal in front of a customer, because the queue is precisely the part
 * a visitor will test — they pick the most alarming row and ask to see it.
 *
 * Every item below is built from a record the user can open. Nothing is invented: if the
 * workspace has no overdue work, the queue is empty and says so, which is a truthful and
 * far better outcome than six fictional emergencies.
 */
import type { CapaItem } from './capa'
import type { Insight, PriorityItem, PriorityLevel } from './dashboard'
import type { Incident } from './incidents'
import type { AssetView } from './assets'
import type { ExpiringPermit } from './permitsApi'
import { localISODate } from '@/lib/localDate'

/** How many rows the queue shows before it stops being a queue and becomes a list. */
const MAX_ITEMS = 10

const RANK: Record<PriorityLevel, number> = { Critical: 0, High: 1, Medium: 2 }

/** A stored date-only value (due date), read as the date it was stored as. */
const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)
/** A moment (reported, valid until, now), shown as the person's local date. */
const localDay = (iso: string) => localISODate(new Date(iso))

function dueLabel(days: number): string {
  if (days < -1) return `${Math.abs(days)} days overdue`
  if (days === -1) return '1 day overdue'
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due in ${days} days`
}

const minutesUntil = (iso: string) => Math.floor((new Date(iso).getTime() - Date.now()) / 60_000)

/** "in 3h" / "in 40 min" / "now". Rounding hours would call a live permit expired. */
function untilLabel(mins: number): string {
  if (mins <= 0) return 'now'
  if (mins < 90) return `in ${mins} min`
  return `in ${Math.floor(mins / 60)}h`
}

export interface PrioritySources {
  siteName: (siteId: string) => string
  overdueActions: CapaItem[]
  highRiskIncidents: Incident[]
  expiringPermits: ExpiringPermit[]
  overdueAssets: AssetView[]
  training: { expiring90: number; employeesOverdue: number } | null
  audit: { openFindings: number; criticalFindings: number; upcoming30d: number } | null
}

export function buildPriorities(src: PrioritySources): PriorityItem[] {
  const items: PriorityItem[] = []
  const site = src.siteName

  // ── Overdue corrective actions ─────────────────────────────────────────────
  // The clearest signal there is: someone owns this, the date has passed.
  for (const a of src.overdueActions) {
    const level: PriorityLevel = a.priority === 'High' ? 'Critical' : 'Medium'
    items.push({
      id: `action:${a.id}`,
      kind: 'action',
      priority: level,
      title: `Overdue: ${a.title} (${a.code})`,
      owner: a.owner,
      siteId: a.siteId,
      site: site(a.siteId),
      department: a.department || 'Corrective actions',
      due: dayOf(a.dueDate),
      dueLabel: dueLabel(a.daysToDue),
      overdue: true,
      cta: 'Review',
      detail:
        `${a.code} was due ${dueLabel(a.daysToDue).replace('overdue', 'ago')} and is still ${a.status.replace('_', ' ')}.` +
        (a.incidentNumber ? ` It was raised from ${a.incidentNumber}.` : ''),
      recommended: `Open the action, agree a revised date with ${a.owner}, and record why it slipped.`,
    })
  }

  // ── High-risk incidents without an investigator ────────────────────────────
  for (const i of src.highRiskIncidents) {
    if (i.investigator) continue
    items.push({
      id: `incident:${i.id}`,
      kind: 'incident',
      priority: 'Critical',
      title: `High-risk investigation unassigned: ${i.title.toLowerCase()}`,
      owner: i.assignedManager ?? i.reporter,
      siteId: i.siteId,
      site: site(i.siteId),
      department: i.department,
      due: localDay(i.reportedAt),
      dueLabel: 'assign today',
      overdue: false,
      cta: 'Assign',
      detail: `${i.number} is flagged high risk and has no investigator. It was reported by ${i.reporter} at ${i.location}.`,
      recommended: 'Name an investigator so the RCA can start while the evidence is fresh.',
    })
  }

  // ── Permits about to lapse ─────────────────────────────────────────────────
  for (const p of src.expiringPermits) {
    const mins = minutesUntil(p.validTo)
    const label = untilLabel(mins)
    items.push({
      id: `permit:${p.id}`,
      kind: 'permit',
      priority: mins <= 120 ? 'Critical' : 'High',
      title: `${p.typeLabel} permit ${p.code} expires ${label} (${p.location})`,
      owner: p.applicant,
      siteId: '',
      site: p.location,
      department: 'Permit to work',
      due: localDay(p.validTo),
      dueLabel: mins <= 0 ? 'expired' : `expires ${label}`,
      overdue: mins <= 0,
      cta: 'Review',
      detail: `${p.code} authorises work at ${p.location} until ${new Date(p.validTo).toLocaleString()}. Work must stop at expiry unless a fresh permit is issued.`,
      recommended: 'Confirm with the permit holder whether the work will finish in time, or issue a fresh permit.',
    })
  }

  // ── Assets past their inspection date ──────────────────────────────────────
  if (src.overdueAssets.length > 0) {
    const worst = [...src.overdueAssets].sort((a, b) => a.daysToDue - b.daysToDue)[0]
    const rest = src.overdueAssets.length - 1
    items.push({
      id: 'inspection:overdue',
      kind: 'inspection',
      priority: src.overdueAssets.length >= 3 ? 'Critical' : 'Medium',
      title:
        rest > 0
          ? `${src.overdueAssets.length} asset inspections overdue — worst is ${worst.name}`
          : `Inspection overdue: ${worst.name}`,
      owner: worst.owner,
      siteId: worst.siteId,
      site: site(worst.siteId),
      department: worst.department || 'Inspections',
      due: dayOf(worst.nextDueDate),
      dueLabel: dueLabel(worst.daysToDue),
      overdue: true,
      cta: 'Schedule',
      detail:
        `${worst.name} (${worst.code}) at ${worst.location} is ${Math.abs(worst.daysToDue)} days past its ` +
        `${worst.frequency} inspection.` + (rest > 0 ? ` ${rest} other asset(s) are also overdue.` : ''),
      recommended: 'Book the inspections from the asset register; an overdue statutory item is a finding waiting to happen.',
    })
  }

  // ── Competency about to lapse ──────────────────────────────────────────────
  if (src.training && src.training.employeesOverdue > 0) {
    items.push({
      id: 'training:overdue',
      kind: 'training',
      priority: 'High',
      title: `${src.training.employeesOverdue} employee(s) are not competent for their role`,
      owner: 'Line supervisors',
      siteId: '',
      site: 'All sites',
      department: 'Training',
      due: localISODate(),
      dueLabel: 'schedule now',
      overdue: true,
      cta: 'Review',
      detail: `The competency matrix shows ${src.training.employeesOverdue} people missing or holding a lapsed certificate for a course their role requires.`,
      recommended: 'Open the matrix, filter to the gaps, and schedule a session for the largest group.',
    })
  }
  if (src.training && src.training.expiring90 > 0) {
    items.push({
      id: 'training:expiring',
      kind: 'training',
      priority: 'Medium',
      title: `${src.training.expiring90} certification(s) expire within 90 days`,
      owner: 'Line supervisors',
      siteId: '',
      site: 'All sites',
      department: 'Training',
      due: localISODate(new Date(Date.now() + 90 * 86400_000)),
      dueLabel: 'plan this quarter',
      overdue: false,
      cta: 'Schedule',
      detail: 'Renewals booked early cost a training day. Booked late they cost a person off the job.',
      recommended: 'Batch the renewals into one session rather than losing people one at a time.',
    })
  }

  // ── Audit findings still open ──────────────────────────────────────────────
  if (src.audit && src.audit.openFindings > 0) {
    items.push({
      id: 'audit:findings',
      kind: 'audit',
      priority: src.audit.criticalFindings > 0 ? 'Critical' : 'Medium',
      title:
        src.audit.criticalFindings > 0
          ? `${src.audit.criticalFindings} critical audit finding(s) still open`
          : `${src.audit.openFindings} audit finding(s) still open`,
      owner: 'Finding owners',
      siteId: '',
      site: 'All sites',
      department: 'Audit & compliance',
      due: localISODate(),
      dueLabel: 'blocking closure',
      overdue: false,
      cta: 'Review',
      detail: 'An audit cannot be closed while any of its findings has an unverified action. These are what is holding the audits open.',
      recommended: 'Work the findings register down; each one closes when its action is verified.',
    })
  }

  return items
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || Number(b.overdue) - Number(a.overdue))
    .slice(0, MAX_ITEMS)
}

// ─── Insights ────────────────────────────────────────────────────────────────

const INCIDENT_TYPE_LABEL: Record<string, string> = {
  near_miss: 'near misses', first_aid: 'first-aid cases', mtc: 'medical treatment cases',
  rwc: 'restricted-work cases', lti: 'lost-time injuries', fatality: 'fatalities',
  property_damage: 'property damage', environmental: 'environmental events',
  vehicle: 'vehicle incidents', fire: 'fire events', unsafe_act: 'unsafe acts',
  unsafe_condition: 'unsafe conditions',
}

/**
 * Observations computed from the workspace's own records.
 *
 * The previous version of this panel asserted specific statistics — an 18% quarterly rise
 * in night-shift incidents, a 38% behavioural root-cause share — about data that did not
 * exist. Under a footnote reading "generated from your own trends", that is not a
 * placeholder, it is a false claim, and it is the first thing a safety manager will check.
 *
 * Each observation below is arithmetic over rows the reader can go and count. Where there
 * is not enough data to say something true, nothing is said.
 */
export function buildInsights(src: {
  incidents: Incident[]
  actions: CapaItem[]
  overdueAssets: AssetView[]
  siteName: (siteId: string) => string
  training: { expiring90: number; employeesOverdue: number } | null
}): Insight[] {
  const out: Insight[] = []
  const { incidents, actions } = src

  // Where incidents concentrate.
  const bySite = new Map<string, number>()
  for (const i of incidents) bySite.set(i.siteId, (bySite.get(i.siteId) ?? 0) + 1)
  const topSite = [...bySite.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topSite && incidents.length >= 4 && topSite[1] / incidents.length >= 0.3) {
    const pct = Math.round((topSite[1] / incidents.length) * 100)
    out.push({
      id: 'in-site',
      severity: pct >= 50 ? 'serious' : 'warning',
      text: `${src.siteName(topSite[0])} accounts for ${pct}% of reported incidents (${topSite[1]} of ${incidents.length}) despite being one site of ${bySite.size}.`,
      suggestion: 'Compare supervision ratios and toolbox-talk frequency there against a site with a similar hazard profile.',
    })
  }

  // What kind of event dominates.
  const byType = new Map<string, number>()
  for (const i of incidents) byType.set(i.type, (byType.get(i.type) ?? 0) + 1)
  const topType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topType && incidents.length >= 4) {
    const label = INCIDENT_TYPE_LABEL[topType[0]] ?? topType[0]
    const pct = Math.round((topType[1] / incidents.length) * 100)
    const positive = topType[0] === 'near_miss'
    out.push({
      id: 'in-type',
      severity: positive ? 'info' : 'warning',
      text: positive
        ? `${pct}% of reports are near misses (${topType[1]} of ${incidents.length}) — hazards are being caught before they cause harm.`
        : `${label.charAt(0).toUpperCase() + label.slice(1)} are the largest category at ${pct}% of reports (${topType[1]} of ${incidents.length}).`,
      suggestion: positive
        ? 'Reporting culture is the leading indicator worth protecting. Recognise the crews doing it.'
        : `Target the next safety campaign at ${label} rather than spreading effort evenly.`,
    })
  }

  // Actions falling due, which is the difference between a register and a system of record.
  const dueSoon = actions.filter((a) => !a.overdue && a.daysToDue >= 0 && a.daysToDue <= 7 &&
    (a.status === 'Open' || a.status === 'In Progress'))
  const overdue = actions.filter((a) => a.overdue)
  if (overdue.length > 0 || dueSoon.length > 0) {
    out.push({
      id: 'in-actions',
      severity: overdue.length > 0 ? 'critical' : 'warning',
      text: overdue.length > 0
        ? `${overdue.length} corrective action(s) are past due and ${dueSoon.length} more fall due within seven days.`
        : `${dueSoon.length} corrective action(s) fall due within seven days.`,
      suggestion: 'A fifteen-minute owner check-in this week is cheaper than the escalations next week.',
    })
  }

  // Competency, which lapses quietly.
  if (src.training && src.training.employeesOverdue > 0) {
    out.push({
      id: 'in-training',
      severity: 'serious',
      text: `${src.training.employeesOverdue} employee(s) hold a lapsed or missing certificate for a course their role requires${
        src.training.expiring90 > 0 ? `, and ${src.training.expiring90} more certificates expire within 90 days` : ''
      }.`,
      suggestion: 'Batch the renewals into one session — competency gaps are found by auditors long before they are found by supervisors.',
    })
  }

  // Assets past inspection.
  if (src.overdueAssets.length > 0) {
    out.push({
      id: 'in-assets',
      severity: 'warning',
      text: `${src.overdueAssets.length} asset(s) are past their inspection date, the oldest by ${Math.abs(
        Math.min(...src.overdueAssets.map((a) => a.daysToDue)),
      )} days.`,
      suggestion: 'Overdue inspections are the leading indicator that defects go unfound, and the first thing an external auditor samples.',
    })
  }

  return out.slice(0, 4)
}
