// ─── Mission Control demo dataset ────────────────────────────────────────────
// Hand-tuned, deterministic seeds with one coherent narrative:
//  • Bintulu LNG Terminal is in the red and still sliding (the story to act on)
//  • Kuching leads; Senari is the most improved (+8 over 12 months)
//  • Unsafe Acts dominate root causes; action discipline is improving
// The builder scopes everything by company + optional site, exactly like the
// future rollup API will.

import type {
  DashboardCharts, DashboardData, Insight, Kpi, LeaderboardEntry,
  PriorityItem, RiskBand, SiteRisk, TimelineEvent, UpcomingEvent,
} from '../dashboard'

export const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']

interface SiteSeed {
  id: string
  companyId: string
  name: string
  short: string
  headcount: number
  scoreTrend: number[]
  incidents: number[]
  nearMisses: number[]
  lti: number[]
  compliance: number
  trifr: number
  openIncidents: number
  highRisk: number
  overdueActions: number
  /** 12-month root cause totals: unsafe acts, unsafe conditions, equipment, human factors, environmental */
  rootCauses: [number, number, number, number, number]
  actionCompletion: number[]
}

const SEEDS: SiteSeed[] = [
  {
    id: 'kch', companyId: 'big', name: 'Kuching Assembly Plant', short: 'Kuching', headcount: 1240,
    scoreTrend: [88, 88, 89, 90, 90, 91, 91, 92, 92, 92, 92, 92],
    incidents: [2, 1, 2, 1, 1, 0, 1, 1, 0, 1, 0, 1],
    nearMisses: [14, 16, 15, 18, 17, 19, 21, 20, 22, 24, 23, 25],
    lti: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    compliance: 96, trifr: 0.8, openIncidents: 1, highRisk: 0, overdueActions: 0,
    rootCauses: [4, 3, 2, 2, 0],
    actionCompletion: [82, 84, 83, 86, 88, 87, 89, 90, 91, 92, 92, 94],
  },
  {
    id: 'btu', companyId: 'big', name: 'Bintulu LNG Terminal', short: 'Bintulu', headcount: 860,
    scoreTrend: [74, 73, 71, 70, 68, 67, 65, 63, 62, 60, 59, 58],
    incidents: [2, 3, 3, 4, 3, 4, 5, 4, 5, 6, 5, 6],
    nearMisses: [9, 8, 10, 9, 11, 10, 12, 11, 13, 12, 14, 13],
    lti: [0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    compliance: 74, trifr: 3.4, openIncidents: 4, highRisk: 2, overdueActions: 5,
    rootCauses: [13, 8, 11, 14, 2],
    actionCompletion: [70, 68, 69, 66, 67, 64, 65, 62, 63, 60, 61, 58],
  },
  {
    id: 'mri', companyId: 'big', name: 'Miri Fabrication Yard', short: 'Miri', headcount: 620,
    scoreTrend: [74, 75, 74, 76, 76, 75, 77, 77, 78, 78, 78, 78],
    incidents: [3, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2],
    nearMisses: [11, 12, 10, 13, 12, 14, 13, 15, 14, 16, 15, 17],
    lti: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    compliance: 85, trifr: 2.1, openIncidents: 2, highRisk: 1, overdueActions: 2,
    rootCauses: [9, 7, 4, 6, 1],
    actionCompletion: [74, 75, 73, 76, 77, 76, 78, 79, 78, 80, 81, 82],
  },
  {
    id: 'sbu', companyId: 'big', name: 'Sibu Logistics Hub', short: 'Sibu', headcount: 430,
    scoreTrend: [80, 80, 81, 81, 82, 82, 83, 83, 83, 84, 84, 84],
    incidents: [2, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1],
    nearMisses: [8, 9, 10, 9, 11, 12, 11, 13, 12, 14, 13, 14],
    lti: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    compliance: 90, trifr: 1.3, openIncidents: 1, highRisk: 0, overdueActions: 1,
    rootCauses: [5, 3, 3, 4, 1],
    actionCompletion: [78, 79, 80, 79, 81, 82, 83, 84, 83, 85, 86, 87],
  },
  {
    id: 'twu', companyId: 'big', name: 'Tawau Plantation Estate', short: 'Tawau', headcount: 980,
    scoreTrend: [68, 68, 69, 68, 70, 69, 70, 70, 71, 71, 71, 71],
    incidents: [4, 3, 3, 4, 3, 3, 2, 3, 3, 2, 3, 2],
    nearMisses: [6, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12],
    lti: [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    compliance: 81, trifr: 2.6, openIncidents: 2, highRisk: 0, overdueActions: 3,
    rootCauses: [11, 8, 3, 9, 4],
    actionCompletion: [69, 70, 71, 70, 72, 73, 74, 73, 75, 76, 75, 77],
  },
  {
    id: 'sen', companyId: 'big', name: 'Senari Warehouse Complex', short: 'Senari', headcount: 310,
    scoreTrend: [79, 80, 81, 82, 83, 83, 84, 85, 86, 86, 87, 87],
    incidents: [1, 1, 2, 1, 1, 1, 0, 1, 1, 0, 1, 1],
    nearMisses: [7, 8, 7, 9, 8, 10, 9, 11, 10, 12, 11, 12],
    lti: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    compliance: 93, trifr: 1.1, openIncidents: 1, highRisk: 0, overdueActions: 0,
    rootCauses: [3, 4, 1, 3, 0],
    actionCompletion: [76, 78, 79, 81, 82, 84, 85, 86, 88, 89, 90, 91],
  },
  {
    id: 'pjy', companyId: 'kcs', name: 'Petra Jaya Township Project', short: 'Petra Jaya', headcount: 480,
    scoreTrend: [77, 77, 78, 78, 79, 79, 80, 80, 80, 81, 81, 81],
    incidents: [2, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 1],
    nearMisses: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11],
    lti: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    compliance: 84, trifr: 1.9, openIncidents: 1, highRisk: 0, overdueActions: 1,
    rootCauses: [7, 5, 2, 4, 1],
    actionCompletion: [72, 73, 74, 75, 76, 76, 77, 78, 79, 80, 81, 82],
  },
  {
    id: 'smh', companyId: 'kcs', name: 'Samalaju Plant Expansion', short: 'Samalaju', headcount: 350,
    scoreTrend: [79, 79, 78, 78, 77, 78, 77, 77, 76, 76, 76, 76],
    incidents: [1, 2, 2, 2, 2, 3, 2, 2, 3, 2, 3, 2],
    nearMisses: [4, 5, 4, 6, 5, 6, 6, 7, 6, 8, 7, 8],
    lti: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    compliance: 79, trifr: 2.3, openIncidents: 1, highRisk: 1, overdueActions: 2,
    rootCauses: [8, 6, 4, 5, 1],
    actionCompletion: [71, 70, 72, 71, 73, 72, 74, 73, 74, 75, 74, 76],
  },
]

// ─── Priorities, insights, events, activity (org-level, site-tagged) ─────────

const iso = (daysFromNow: number) => {
  const d = new Date('2026-07-16T08:00:00+08:00')
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}
const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()

const PRIORITIES: PriorityItem[] = [
  {
    id: 'p1', kind: 'action', priority: 'Critical',
    title: 'Overdue: audit & close all shelved alarms > 24h (CA-440)',
    owner: 'Faizal Omar', siteId: 'btu', site: 'Bintulu', department: 'Maintenance',
    due: iso(-4), dueLabel: '4 days overdue', overdue: true, cta: 'Escalate',
    detail: 'Raised after the compressor fire (INC-2602). Vibration alarms were shelved for 11 days before the bearing failure.',
    recommended: 'Escalate to the site manager and set a hard completion date this week — this action guards against a repeat critical incident.',
  },
  {
    id: 'p2', kind: 'incident', priority: 'Critical',
    title: 'High-risk investigation unassigned: hydrocarbon leak, loading arm 3',
    owner: 'Amirul Hassan', siteId: 'btu', site: 'Bintulu', department: 'Field Operations',
    due: iso(0), dueLabel: 'assign today', overdue: false, cta: 'Review',
    detail: 'INC-2607 (critical severity) reported 4 days ago. Scene evidence secured; no investigation lead confirmed yet.',
    recommended: 'Confirm the investigation lead today — critical investigations must start within 24h of reporting.',
  },
  {
    id: 'p3', kind: 'permit', priority: 'High',
    title: 'Hot work permit PTW-1183 expires today (jetty maintenance)',
    owner: 'Rashid Karim', siteId: 'btu', site: 'Bintulu', department: 'Jetty & Loading',
    due: iso(0), dueLabel: 'expires 18:00 today', overdue: false, cta: 'Renew',
    detail: 'Welding work on the loading arm 2 support structure is 60% complete. Continuing without renewal is a stop-work trigger.',
    recommended: 'Renew with a fresh gas test, or formally suspend the work before the permit lapses.',
  },
  {
    id: 'p4', kind: 'audit', priority: 'High',
    title: 'CIMAH audit in 37 days — 3 major findings still open',
    owner: 'Marcus Tan', siteId: 'btu', site: 'Bintulu', department: 'HSE',
    due: iso(37), dueLabel: 'audit 22 Aug', overdue: false, cta: 'Plan',
    detail: 'Safety report revalidation, off-site emergency plan test, and ERT fit-tests are the open majors.',
    recommended: 'The safety-report MOC gap is the long-lead item — start it this week or the audit date is at risk.',
  },
  {
    id: 'p5', kind: 'training', priority: 'High',
    title: '12 forklift operator certifications expire within 30 days',
    owner: 'Grace Lim', siteId: 'sen', site: 'Senari', department: 'Warehouse',
    due: iso(30), dueLabel: 'first lapse 8 Aug', overdue: false, cta: 'Schedule',
    detail: 'Covers the entire inbound shift. Expired certs mean those operators legally cannot drive.',
    recommended: 'Book the refresher assessor now — August slots fill fast and an uncovered shift halts inbound.',
  },
  {
    id: 'p6', kind: 'inspection', priority: 'Medium',
    title: 'Overhead crane statutory inspection overdue (6 days)',
    owner: 'Ganesh Pillai', siteId: 'kch', site: 'Kuching', department: 'Maintenance',
    due: iso(-6), dueLabel: '6 days overdue', overdue: true, cta: 'Assign',
    detail: 'PMA renewal inspection for crane KCH-OHC-02 missed its window while the competent person was on leave.',
    recommended: 'Assign a backup competent person and quarantine the crane until inspected.',
  },
  {
    id: 'p7', kind: 'action', priority: 'Medium',
    title: 'Overdue: anti-slip grating phase 2 — mill walkways (CA-430)',
    owner: 'Dayang Nurul', siteId: 'twu', site: 'Tawau', department: 'Mill',
    due: iso(-12), dueLabel: '12 days overdue', overdue: true, cta: 'Review',
    detail: '70% complete; material delivery slipped. Monsoon season starts in ~10 weeks.',
    recommended: 'Get a firm delivery date and re-baseline — this must close before the rains return.',
  },
  {
    id: 'p8', kind: 'inspection', priority: 'Medium',
    title: 'Scaffold weekly inspection due tomorrow (Level 9–12)',
    owner: 'Vincent Chai', siteId: 'mri', site: 'Miri', department: 'Contractors',
    due: iso(1), dueLabel: 'due tomorrow', overdue: false, cta: 'Schedule',
    detail: 'Green-tag expires tomorrow across four lifts currently in use by two crews.',
    recommended: 'Schedule the competent scaffolder for 07:00 so crews are not stood down.',
  },
  // Kenyalang Construction items
  {
    id: 'p9', kind: 'incident', priority: 'High',
    title: 'High-risk investigation open: formwork collapse near-miss',
    owner: 'Azlan Mahmud', siteId: 'smh', site: 'Samalaju', department: 'M&E Installation',
    due: iso(2), dueLabel: 'RCA due in 2 days', overdue: false, cta: 'Review',
    detail: 'Prop failure during pour — no injuries, high potential. Root cause workshop scheduled.',
    recommended: 'Confirm temporary-works engineer attendance at the RCA workshop.',
  },
  {
    id: 'p10', kind: 'training', priority: 'Medium',
    title: 'CIDB green cards expiring for 8 workers this month',
    owner: 'Lau Tze Ming', siteId: 'pjy', site: 'Petra Jaya', department: 'Civil Works',
    due: iso(14), dueLabel: 'first lapse 30 Jul', overdue: false, cta: 'Schedule',
    detail: 'Renewal course availability confirmed in Kuching; transport not yet arranged.',
    recommended: 'Book the renewal batch and arrange site transport this week.',
  },
]

const INSIGHTS: Insight[] = [
  {
    id: 'i1', severity: 'critical',
    text: 'Night-shift incidents at Bintulu are up 18% quarter-on-quarter — concentrated in Maintenance between 02:00 and 05:00.',
    suggestion: 'Review fatigue controls and shift-handover quality for the rotating-equipment crew.',
  },
  {
    id: 'i2', severity: 'serious',
    text: 'Unsafe behaviour contributes 38% of all incidents this year — the single largest root-cause category.',
    suggestion: 'A targeted behavioural-safety refresher would address the top cause directly.',
  },
  {
    id: 'i3', severity: 'warning',
    text: 'Three corrective actions become overdue tomorrow: two at Bintulu, one at Tawau.',
    suggestion: 'A 15-minute owner check-in today prevents three new escalations tomorrow.',
  },
  {
    id: 'i4', severity: 'info',
    text: 'Senari has reported 25% more near-misses while incidents fell — a healthy vigilance signal worth reinforcing.',
    suggestion: 'Consider a toolbox talk at Warehouse A to recognise the inbound shift\'s reporting culture.',
  },
]

const KCS_INSIGHTS: Insight[] = [
  {
    id: 'ki1', severity: 'serious',
    text: 'Samalaju\'s safety score has slipped 3 points since January while Petra Jaya improved 4.',
    suggestion: 'Compare temporary-works supervision arrangements between the two projects.',
  },
  {
    id: 'ki2', severity: 'warning',
    text: 'Working-at-height findings account for 45% of open items across both projects.',
    suggestion: 'Schedule a joint harness and anchor-point inspection sweep.',
  },
]

const EVENTS: UpcomingEvent[] = [
  { id: 'e1', date: iso(1), kind: 'inspection', title: 'Scaffold weekly re-inspection (L9–12)', site: 'Miri' },
  { id: 'e2', date: iso(3), kind: 'training', title: 'Permit-to-work refresher — night shift', site: 'Bintulu' },
  { id: 'e3', date: iso(6), kind: 'audit', title: 'Internal ISO 45001 pre-audit walkdown', site: 'Kuching' },
  { id: 'e4', date: iso(8), kind: 'permit', title: 'Confined space permit review — tank T-104', site: 'Bintulu' },
  { id: 'e5', date: iso(12), kind: 'training', title: 'Forklift recertification batch 1 of 3', site: 'Senari' },
  { id: 'e6', date: iso(15), kind: 'certification', title: 'ERT respirator fit-tests (8 personnel)', site: 'Bintulu' },
  { id: 'e7', date: iso(20), kind: 'audit', title: 'OSHA (Act 514) external audit', site: 'Kuching' },
  { id: 'e8', date: iso(26), kind: 'inspection', title: 'Quarterly rack integrity inspection', site: 'Senari' },
  { id: 'e9', date: iso(37), kind: 'audit', title: 'CIMAH major-hazard audit', site: 'Bintulu' },
  { id: 'e10', date: iso(45), kind: 'certification', title: 'Crane operator PMA renewals (3)', site: 'Kuching' },
]

const KCS_EVENTS: UpcomingEvent[] = [
  { id: 'ke1', date: iso(2), kind: 'inspection', title: 'Formwork & falsework inspection — Zone C', site: 'Samalaju' },
  { id: 'ke2', date: iso(7), kind: 'training', title: 'CIDB green card renewal batch', site: 'Petra Jaya' },
  { id: 'ke3', date: iso(16), kind: 'audit', title: 'Client HSE compliance audit', site: 'Samalaju' },
  { id: 'ke4', date: iso(24), kind: 'permit', title: 'Night-works permit renewal', site: 'Petra Jaya' },
]

const ACTIVITY: TimelineEvent[] = [
  { id: 'a1', at: ago(24), kind: 'action_assigned', actor: 'Marcus Tan', text: 'assigned corrective action', target: 'CA-445 · Interim alarm-management standdown (Bintulu)' },
  { id: 'a2', at: ago(63), kind: 'incident_reported', actor: 'Field reporter', text: 'reported a near-miss', target: 'Reversing tele-handler near walkway — Miri laydown' },
  { id: 'a3', at: ago(60 * 3), kind: 'investigation_started', actor: 'Amirul Hassan', text: 'started the investigation for', target: 'INC-2607 · Hydrocarbon leak at loading arm 3' },
  { id: 'a4', at: ago(60 * 5), kind: 'action_completed', actor: 'Grace Lim', text: 'completed and submitted evidence for', target: 'CA-438 · Reinstate pedestrian barriers (Senari)' },
  { id: 'a5', at: ago(60 * 8), kind: 'training_completed', actor: '14 employees', text: 'completed', target: 'Chemical handling refresher — Tawau mill' },
  { id: 'a6', at: ago(60 * 11), kind: 'audit_created', actor: 'Marcus Tan', text: 'scheduled', target: 'Internal ISO 45001 pre-audit — Kuching (22 Jul)' },
  { id: 'a7', at: ago(60 * 26), kind: 'action_completed', actor: 'Sarah Wong', text: 'verified completion of', target: 'CA-429 · Slew speed limiter checks (Kuching)' },
  { id: 'a8', at: ago(60 * 31), kind: 'incident_reported', actor: 'Field reporter', text: 'reported unsafe condition', target: 'Blocked emergency eyewash — Bintulu SRU' },
]

const KCS_ACTIVITY: TimelineEvent[] = [
  { id: 'ka1', at: ago(95), kind: 'investigation_started', actor: 'Azlan Mahmud', text: 'started the investigation for', target: 'Formwork collapse near-miss — Samalaju Zone C' },
  { id: 'ka2', at: ago(60 * 7), kind: 'action_assigned', actor: 'Lau Tze Ming', text: 'assigned corrective action', target: 'Re-certify prop stock before next pour' },
  { id: 'ka3', at: ago(60 * 22), kind: 'training_completed', actor: '22 workers', text: 'completed', target: 'Working-at-height rescue drill — Petra Jaya' },
  { id: 'ka4', at: ago(60 * 30), kind: 'incident_reported', actor: 'Field reporter', text: 'reported a hazard', target: 'Unbarricaded excavation — Petra Jaya access road' },
]

// ─── Builder ─────────────────────────────────────────────────────────────────

const bandOf = (score: number): RiskBand => (score >= 85 ? 'green' : score >= 75 ? 'yellow' : score >= 65 ? 'orange' : 'red')

const sum = (arrs: number[][]) => arrs[0].map((_, i) => arrs.reduce((s, a) => s + a[i], 0))
const weightedAvg = (pairs: [number[], number][]) => {
  const totalW = pairs.reduce((s, [, w]) => s + w, 0)
  return pairs[0][0].map((_, i) => Math.round(pairs.reduce((s, [a, w]) => s + a[i] * w, 0) / totalW))
}

function toSiteRisk(s: SiteSeed): SiteRisk {
  const score = s.scoreTrend[11]
  return {
    id: s.id, name: s.name, short: s.short, score, band: bandOf(score),
    delta12mo: score - s.scoreTrend[0], trend: s.scoreTrend,
    openIncidents: s.openIncidents, highRisk: s.highRisk, overdueActions: s.overdueActions,
    compliance: s.compliance, trifr: s.trifr, headcount: s.headcount,
  }
}

function buildCharts(seeds: SiteSeed[]): DashboardCharts {
  const incidents = sum(seeds.map((s) => s.incidents))
  const nearMisses = sum(seeds.map((s) => s.nearMisses))
  const lti = sum(seeds.map((s) => s.lti))
  // behaviour series derived deterministically from incident/near-miss volumes
  const unsafeActs = incidents.map((v, i) => Math.round(v * 0.45 + nearMisses[i] * 0.12))
  const unsafeConditions = incidents.map((v, i) => Math.round(v * 0.3 + nearMisses[i] * 0.08))
  const rc = seeds.reduce(
    (acc, s) => acc.map((v, i) => v + s.rootCauses[i]),
    [0, 0, 0, 0, 0],
  )
  return {
    months: MONTHS,
    incidents,
    nearMisses,
    lti,
    unsafeActs,
    unsafeConditions,
    rootCauses: [
      { name: 'Unsafe Acts', value: rc[0] },
      { name: 'Human Factors', value: rc[3] },
      { name: 'Unsafe Conditions', value: rc[1] },
      { name: 'Equipment Failure', value: rc[2] },
      { name: 'Environmental', value: rc[4] },
    ].sort((a, b) => b.value - a.value),
    actionCompletion: weightedAvg(seeds.map((s) => [s.actionCompletion, s.headcount] as [number[], number])),
    incidentsLastYear: incidents.map((v, i) => Math.round(v * 1.35) + (i % 3 === 0 ? 1 : 0)),
  }
}

function buildKpis(seeds: SiteSeed[], charts: DashboardCharts): Kpi[] {
  const w = seeds.map((s) => s.headcount)
  const totalW = w.reduce((a, b) => a + b, 0)
  const scoreSpark = weightedAvg(seeds.map((s) => [s.scoreTrend, s.headcount] as [number[], number]))
  const score = scoreSpark[11]
  const compliance = Math.round(seeds.reduce((s, x, i) => s + x.compliance * w[i], 0) / totalW)
  const openIncidents = seeds.reduce((s, x) => s + x.openIncidents, 0)
  const highRisk = seeds.reduce((s, x) => s + x.highRisk, 0)
  const overdue = seeds.reduce((s, x) => s + x.overdueActions, 0)
  const nmThis = charts.nearMisses[11]
  const nmDelta = nmThis - charts.nearMisses[10]
  const completion = charts.actionCompletion[11]
  const topBy = <T,>(f: (s: SiteSeed) => number, fmt: (s: SiteSeed) => T) =>
    [...seeds].sort((a, b) => f(b) - f(a)).slice(0, 3).map(fmt)

  const auditReadiness = Math.max(55, Math.min(97, compliance - 5))
  const training = Math.min(97, Math.round(completion + 6))

  return [
    {
      id: 'safety-score', label: 'Safety Score', value: String(score), unit: '/ 100',
      delta: score - scoreSpark[10], goodWhen: 'up',
      tone: score >= 85 ? 'good' : score >= 75 ? 'warning' : score >= 65 ? 'serious' : 'critical',
      spark: scoreSpark,
      definition: 'Composite 0–100: 40% lagging (TRIFR vs target, severity-weighted rate), 35% leading (near-miss rate, training), 25% action discipline. Headcount-weighted across sites in scope.',
      breakdown: topBy((s) => -s.scoreTrend[11], (s) => ({ label: `${s.short} (lowest)`, value: String(s.scoreTrend[11]) })),
    },
    {
      id: 'compliance', label: 'Compliance Score', value: String(compliance), unit: '%',
      delta: 1, goodWhen: 'up',
      tone: compliance >= 90 ? 'good' : compliance >= 80 ? 'warning' : 'serious',
      spark: scoreSpark.map((v) => Math.min(97, v + 6)),
      definition: 'Weighted clause compliance across enabled standards (ISO 45001, OSHA 514, CIMAH, FSA). Majors weigh 5× minors.',
      breakdown: topBy((s) => -s.compliance, (s) => ({ label: `${s.short} (lowest)`, value: `${s.compliance}%` })),
    },
    {
      id: 'open-incidents', label: 'Open Incidents', value: String(openIncidents),
      delta: 2, goodWhen: 'down',
      tone: openIncidents === 0 ? 'good' : highRisk > 0 ? 'serious' : 'warning',
      spark: charts.incidents,
      definition: 'Investigations not yet closed, all severities. Closure requires verified corrective actions.',
      breakdown: topBy((s) => s.openIncidents, (s) => ({ label: s.short, value: String(s.openIncidents) })),
    },
    {
      id: 'near-misses', label: 'Near Misses This Month', value: String(nmThis),
      delta: nmDelta, goodWhen: 'up',
      tone: nmDelta >= 0 ? 'good' : 'warning',
      spark: charts.nearMisses,
      definition: 'Rising near-miss reporting alongside falling incidents indicates healthy vigilance, not worsening safety.',
      breakdown: topBy((s) => s.nearMisses[11], (s) => ({ label: s.short, value: String(s.nearMisses[11]) })),
    },
    {
      id: 'overdue-actions', label: 'Overdue Corrective Actions', value: String(overdue),
      delta: -1, goodWhen: 'down',
      tone: overdue === 0 ? 'good' : overdue >= 5 ? 'critical' : 'serious',
      spark: charts.actionCompletion.map((v) => 100 - v),
      definition: 'Corrective actions past their due date without verified completion. Escalates automatically: owner → site manager (T+5) → HSE manager (T+10).',
      breakdown: topBy((s) => s.overdueActions, (s) => ({ label: s.short, value: String(s.overdueActions) })),
    },
    {
      id: 'audit-readiness', label: 'Audit Readiness', value: String(auditReadiness), unit: '%',
      delta: 2, goodWhen: 'up',
      tone: auditReadiness >= 90 ? 'good' : auditReadiness >= 78 ? 'warning' : 'serious',
      spark: scoreSpark.map((v) => Math.max(50, v - 4)),
      definition: 'Share of audit clauses currently compliant across upcoming external audits, weighted by audit proximity.',
      breakdown: [
        { label: 'CIMAH (Bintulu, 22 Aug)', value: '74%' },
        { label: 'OSHA 514 (5 Aug)', value: '92%' },
        { label: 'ISO 45001 (14 Sep)', value: '87%' },
      ],
    },
    {
      id: 'training', label: 'Training Completion', value: String(training), unit: '%',
      delta: 1, goodWhen: 'up',
      tone: training >= 90 ? 'good' : 'warning',
      spark: charts.actionCompletion.map((v) => Math.min(97, v + 6)),
      definition: 'Completed mandatory HSE training vs assigned, trailing 12 months. Contractors are the lowest cohort.',
      breakdown: [
        { label: 'Employees', value: '95%' },
        { label: 'Supervisors', value: '92%' },
        { label: 'Contractors', value: '78%' },
      ],
    },
    {
      id: 'high-risk', label: 'Active High-Risk Incidents', value: String(highRisk),
      delta: 1, goodWhen: 'down',
      tone: highRisk === 0 ? 'good' : 'critical',
      spark: charts.lti,
      definition: 'Open incidents graded Critical or Serious with high recurrence potential. These carry executive visibility until closed.',
      breakdown: topBy((s) => s.highRisk, (s) => ({ label: s.short, value: String(s.highRisk) })),
    },
  ]
}

function buildLeaderboard(sites: SiteRisk[]): LeaderboardEntry[] {
  const by = <K extends keyof SiteRisk>(k: K, dir: 1 | -1) =>
    [...sites].sort((a, b) => dir * ((b[k] as number) - (a[k] as number)))[0]
  const best = by('score', 1)
  const improved = by('delta12mo', 1)
  const risk = by('score', -1)
  const overdue = by('overdueActions', 1)
  const compliant = by('compliance', 1)
  return [
    { title: 'Best performing site', siteName: best.name, metric: `Safety score ${best.score}`, kind: 'good' },
    { title: 'Most improved (12 mo)', siteName: improved.name, metric: `${improved.delta12mo > 0 ? '+' : ''}${improved.delta12mo} points`, kind: 'good' },
    { title: 'Highest risk site', siteName: risk.name, metric: `Score ${risk.score} · ${risk.highRisk} high-risk open`, kind: 'critical' },
    { title: 'Most overdue actions', siteName: overdue.name, metric: `${overdue.overdueActions} overdue`, kind: 'serious' },
    { title: 'Highest compliance', siteName: compliant.name, metric: `${compliant.compliance}% compliant`, kind: 'good' },
  ]
}

export function buildDashboard(companyId: string, siteId: string | null, scopeLabel: string): DashboardData {
  const inCompany = SEEDS.filter((s) => s.companyId === companyId)
  const seeds = siteId ? inCompany.filter((s) => s.id === siteId) : inCompany
  const scoped = seeds.length > 0 ? seeds : inCompany

  const charts = buildCharts(scoped)
  const sites = inCompany.map(toSiteRisk) // heatmap always shows the whole company
  const siteIds = new Set(scoped.map((s) => s.id))

  const priorities = PRIORITIES.filter((p) => siteIds.has(p.siteId))
    .sort((a, b) => ['Critical', 'High', 'Medium'].indexOf(a.priority) - ['Critical', 'High', 'Medium'].indexOf(b.priority))

  const isBig = companyId === 'big'
  const insights = (isBig ? INSIGHTS : KCS_INSIGHTS).slice(0, siteId ? 3 : 4)
  const events = (isBig ? EVENTS : KCS_EVENTS).filter((e) => !siteId || scoped.some((s) => s.short === e.site))
  const activity = (isBig ? ACTIVITY : KCS_ACTIVITY).filter(
    (a) => !siteId || scoped.some((s) => a.target.toLowerCase().includes(s.short.toLowerCase())),
  )

  return {
    scopeLabel,
    generatedAt: new Date().toISOString(),
    kpis: buildKpis(scoped, charts),
    priorities,
    sites,
    charts,
    leaderboard: buildLeaderboard(sites),
    activity: activity.length > 0 ? activity : (isBig ? ACTIVITY : KCS_ACTIVITY).slice(0, 3),
    insights,
    events,
  }
}
