// ─── SafeOps demo dataset ────────────────────────────────────────────────────
// Hand-crafted, deterministic data with a coherent narrative:
//  • Bintulu LNG Terminal is deteriorating (rising incidents, overdue actions)
//  • Kuching Assembly Plant is the top performer
//  • Human Factors is the fastest-growing root cause company-wide

export const MONTHS = [
  'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
] as const

export interface Site {
  id: string
  name: string
  short: string
  industry: string
  headcount: number
  safetyScore: number
  complianceScore: number
  trifr: number // total recordable incident frequency rate per 1M hours
  trend: number[] // 12-month safety score
  incidents: number[] // 12-month incident counts
  nearMisses: number[]
  openActions: number
  overdueActions: number
}

export const SITES: Site[] = [
  {
    id: 'kch', name: 'Kuching Assembly Plant', short: 'Kuching', industry: 'Manufacturing',
    headcount: 1240, safetyScore: 94, complianceScore: 97, trifr: 0.8,
    trend: [88, 89, 90, 90, 91, 92, 92, 93, 93, 94, 94, 94],
    incidents: [2, 1, 2, 1, 1, 0, 1, 1, 0, 1, 0, 1],
    nearMisses: [14, 16, 15, 18, 17, 19, 21, 20, 22, 24, 23, 25],
    openActions: 6, overdueActions: 0,
  },
  {
    id: 'btu', name: 'Bintulu LNG Terminal', short: 'Bintulu', industry: 'Oil & Gas',
    headcount: 860, safetyScore: 71, complianceScore: 78, trifr: 3.4,
    trend: [84, 83, 82, 80, 79, 78, 76, 75, 74, 73, 72, 71],
    incidents: [2, 3, 3, 4, 3, 4, 5, 4, 5, 6, 5, 6],
    nearMisses: [9, 8, 10, 9, 11, 10, 12, 11, 13, 12, 14, 13],
    openActions: 14, overdueActions: 5,
  },
  {
    id: 'mri', name: 'Miri Fabrication Yard', short: 'Miri', industry: 'Construction',
    headcount: 620, safetyScore: 82, complianceScore: 85, trifr: 2.1,
    trend: [78, 79, 78, 80, 81, 80, 81, 82, 81, 82, 83, 82],
    incidents: [3, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 2],
    nearMisses: [11, 12, 10, 13, 12, 14, 13, 15, 14, 16, 15, 17],
    openActions: 9, overdueActions: 2,
  },
  {
    id: 'sbu', name: 'Sibu Logistics Hub', short: 'Sibu', industry: 'Logistics',
    headcount: 430, safetyScore: 88, complianceScore: 91, trifr: 1.3,
    trend: [82, 83, 84, 84, 85, 86, 86, 87, 87, 88, 88, 88],
    incidents: [2, 2, 1, 2, 1, 1, 2, 1, 1, 1, 1, 1],
    nearMisses: [8, 9, 10, 9, 11, 12, 11, 13, 12, 14, 13, 14],
    openActions: 4, overdueActions: 1,
  },
  {
    id: 'twu', name: 'Tawau Plantation Estate', short: 'Tawau', industry: 'Plantations',
    headcount: 980, safetyScore: 79, complianceScore: 82, trifr: 2.6,
    trend: [74, 75, 76, 75, 77, 76, 78, 77, 78, 79, 78, 79],
    incidents: [4, 3, 3, 4, 3, 3, 2, 3, 3, 2, 3, 2],
    nearMisses: [6, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12],
    openActions: 11, overdueActions: 3,
  },
  {
    id: 'sen', name: 'Senari Warehouse Complex', short: 'Senari', industry: 'Warehousing',
    headcount: 310, safetyScore: 90, complianceScore: 93, trifr: 1.1,
    trend: [85, 86, 86, 87, 88, 88, 89, 89, 90, 90, 90, 90],
    incidents: [1, 1, 2, 1, 1, 1, 0, 1, 1, 0, 1, 1],
    nearMisses: [7, 8, 7, 9, 8, 10, 9, 11, 10, 12, 11, 12],
    openActions: 3, overdueActions: 0,
  },
]

export const DEPARTMENTS = [
  { name: 'Production', score: 86, incidents: 21, nearMisses: 96, actions: 12 },
  { name: 'Maintenance', score: 74, incidents: 28, nearMisses: 71, actions: 17 },
  { name: 'Warehouse & Stores', score: 89, incidents: 11, nearMisses: 64, actions: 6 },
  { name: 'Logistics & Transport', score: 84, incidents: 16, nearMisses: 58, actions: 8 },
  { name: 'Contractors', score: 68, incidents: 32, nearMisses: 43, actions: 14 },
  { name: 'Field Operations', score: 80, incidents: 18, nearMisses: 66, actions: 9 },
]

// ─── Root causes ─────────────────────────────────────────────────────────────

export const ROOT_CAUSES = [
  'Unsafe Acts',
  'Unsafe Conditions',
  'Equipment Failure',
  'Human Factors',
  'Environmental Factors',
] as const
export type RootCause = (typeof ROOT_CAUSES)[number]

/** Monthly incident counts by root cause (rows align with MONTHS). */
export const ROOT_CAUSE_MONTHLY: Record<RootCause, number[]> = {
  'Unsafe Acts':          [5, 4, 5, 4, 3, 4, 4, 3, 4, 3, 3, 3],
  'Unsafe Conditions':    [3, 3, 4, 3, 3, 2, 3, 2, 3, 2, 2, 2],
  'Equipment Failure':    [2, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2],
  'Human Factors':        [2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6],
  'Environmental Factors':[2, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0],
}

/** Root cause counts per site (rows: cause, cols: SITES order). */
export const ROOT_CAUSE_BY_SITE: Record<RootCause, number[]> = {
  'Unsafe Acts':          [4, 12, 8, 4, 11, 6],
  'Unsafe Conditions':    [3, 9, 7, 3, 8, 2],
  'Equipment Failure':    [2, 11, 5, 4, 3, 2],
  'Human Factors':        [3, 14, 6, 5, 9, 4],
  'Environmental Factors':[1, 2, 1, 1, 3, 0],
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export type Severity = 'Critical' | 'Serious' | 'Moderate' | 'Minor'
export type Stage =
  | 'Reported'
  | 'Investigation'
  | 'Root Cause'
  | 'Corrective Action'
  | 'Approval'
  | 'Closed'

export const WORKFLOW_STAGES: Stage[] = [
  'Reported', 'Investigation', 'Root Cause', 'Corrective Action', 'Approval', 'Closed',
]

export interface Incident {
  id: string
  title: string
  site: string // site id
  department: string
  date: string
  severity: Severity
  type: string
  stage: Stage
  rootCause?: RootCause
  owner: string
  daysOpen: number
  description: string
  evidence: { name: string; kind: 'photo' | 'document' | 'statement' }[]
}

export const INCIDENTS: Incident[] = [
  {
    id: 'INC-2607', title: 'Hydrocarbon leak at loading arm 3', site: 'btu',
    department: 'Field Operations', date: '2026-07-12', severity: 'Critical',
    type: 'Loss of Containment', stage: 'Investigation', owner: 'Amirul Hassan', daysOpen: 3,
    description: 'Flange gasket failure on loading arm 3 released approx. 40L of condensate during transfer. Area isolated, no injuries. ESD triggered correctly.',
    evidence: [
      { name: 'loading-arm-3-flange.jpg', kind: 'photo' },
      { name: 'ESD-event-log.pdf', kind: 'document' },
      { name: 'operator-statement-rashid.pdf', kind: 'statement' },
    ],
  },
  {
    id: 'INC-2606', title: 'Forklift near-collision with pedestrian in Aisle D', site: 'sen',
    department: 'Warehouse & Stores', date: '2026-07-10', severity: 'Serious',
    type: 'Vehicle / Pedestrian', stage: 'Root Cause', owner: 'Grace Lim', daysOpen: 5,
    rootCause: 'Unsafe Conditions',
    description: 'Reach truck reversed into pedestrian walkway with obstructed mirror view. Pedestrian barrier segment had been removed for racking maintenance and not reinstated.',
    evidence: [
      { name: 'aisle-d-cctv-still.jpg', kind: 'photo' },
      { name: 'barrier-removal-permit.pdf', kind: 'document' },
    ],
  },
  {
    id: 'INC-2605', title: 'Worker heat exhaustion during fruit bunch harvesting', site: 'twu',
    department: 'Field Operations', date: '2026-07-08', severity: 'Serious',
    type: 'Occupational Illness', stage: 'Corrective Action', owner: 'Dayang Nurul', daysOpen: 7,
    rootCause: 'Environmental Factors',
    description: 'Harvester collapsed at Block 14 after 4 hours of continuous work in 36°C heat. Hydration station was 900m away, exceeding the 400m standard.',
    evidence: [
      { name: 'block-14-layout.pdf', kind: 'document' },
      { name: 'medical-report-summary.pdf', kind: 'document' },
    ],
  },
  {
    id: 'INC-2604', title: 'Dropped scaffold clamp from Level 12', site: 'mri',
    department: 'Contractors', date: '2026-07-05', severity: 'Serious',
    type: 'Dropped Object', stage: 'Approval', owner: 'Vincent Chai', daysOpen: 10,
    rootCause: 'Unsafe Acts',
    description: 'Unsecured clamp fell 34m into an exclusion zone during scaffold strike. Tool lanyard not used despite site rule. No injuries — exclusion zone held.',
    evidence: [
      { name: 'drop-zone-photo.jpg', kind: 'photo' },
      { name: 'toolbox-talk-record.pdf', kind: 'document' },
      { name: 'scaffolder-statement.pdf', kind: 'statement' },
    ],
  },
  {
    id: 'INC-2603', title: 'Conveyor belt pinch-point hand injury', site: 'kch',
    department: 'Production', date: '2026-07-02', severity: 'Moderate',
    type: 'Machinery', stage: 'Corrective Action', owner: 'Sarah Wong', daysOpen: 13,
    rootCause: 'Unsafe Conditions',
    description: 'Operator sustained laceration clearing a jam near an unguarded return roller. Interim guard fitted; permanent guarding on order.',
    evidence: [
      { name: 'return-roller-guard.jpg', kind: 'photo' },
      { name: 'first-aid-log.pdf', kind: 'document' },
    ],
  },
  {
    id: 'INC-2602', title: 'Compressor stage-2 bearing failure and small fire', site: 'btu',
    department: 'Maintenance', date: '2026-06-28', severity: 'Critical',
    type: 'Fire / Explosion', stage: 'Corrective Action', owner: 'Amirul Hassan', daysOpen: 17,
    rootCause: 'Equipment Failure',
    description: 'Bearing seizure on export compressor caused lube-oil mist ignition. Extinguished in 4 minutes. Vibration alarms had been in alarm-shelved state for 11 days.',
    evidence: [
      { name: 'compressor-bearing.jpg', kind: 'photo' },
      { name: 'vibration-trend-export.pdf', kind: 'document' },
      { name: 'alarm-shelving-log.pdf', kind: 'document' },
    ],
  },
  {
    id: 'INC-2601', title: 'Pallet truck struck racking upright, minor damage', site: 'sbu',
    department: 'Logistics & Transport', date: '2026-06-25', severity: 'Minor',
    type: 'Property Damage', stage: 'Closed', owner: 'Grace Lim', daysOpen: 6,
    rootCause: 'Human Factors',
    description: 'Powered pallet truck clipped rack leg in low-light staging area at shift change. Upright inspected — within tolerance. Lighting upgrade completed.',
    evidence: [{ name: 'rack-leg-inspection.pdf', kind: 'document' }],
  },
  {
    id: 'INC-2600', title: 'Chemical splash during pesticide mixing', site: 'twu',
    department: 'Field Operations', date: '2026-06-21', severity: 'Moderate',
    type: 'Chemical Exposure', stage: 'Closed', owner: 'Dayang Nurul', daysOpen: 12,
    rootCause: 'Unsafe Acts',
    description: 'Mixer decanted concentrate without face shield. Eye irrigation on site, no lasting injury. Refresher training and dispensing pump rollout complete.',
    evidence: [
      { name: 'mixing-station.jpg', kind: 'photo' },
      { name: 'sds-glyphosate.pdf', kind: 'document' },
    ],
  },
  {
    id: 'INC-2599', title: 'Scaffolder harness clipped to non-rated handrail', site: 'mri',
    department: 'Contractors', date: '2026-06-18', severity: 'Serious',
    type: 'Work at Height', stage: 'Closed', owner: 'Vincent Chai', daysOpen: 15,
    rootCause: 'Human Factors',
    description: 'Observation during routine walkdown: harness anchored to handrail rated below 15kN. Anchor point map reissued; all crews re-briefed.',
    evidence: [{ name: 'anchor-point-map-rev3.pdf', kind: 'document' }],
  },
  {
    id: 'INC-2598', title: 'Overhead crane load swing near operator cab', site: 'kch',
    department: 'Production', date: '2026-06-14', severity: 'Moderate',
    type: 'Lifting Operations', stage: 'Closed', owner: 'Sarah Wong', daysOpen: 9,
    rootCause: 'Human Factors',
    description: 'Uncontrolled load swing from over-speed slew during coil transfer. No contact. Slew speed limiter recalibrated, lift plan revised.',
    evidence: [{ name: 'lift-plan-rev2.pdf', kind: 'document' }],
  },
  {
    id: 'INC-2597', title: 'H2S detector fault in sulfur recovery unit', site: 'btu',
    department: 'Maintenance', date: '2026-06-10', severity: 'Serious',
    type: 'Gas Detection', stage: 'Closed', owner: 'Amirul Hassan', daysOpen: 21,
    rootCause: 'Equipment Failure',
    description: 'Fixed detector failed self-test; unit ran 6 hours before detection. Calibration interval halved and spares stock corrected.',
    evidence: [{ name: 'detector-calibration-history.pdf', kind: 'document' }],
  },
  {
    id: 'INC-2596', title: 'Slip on algae-covered walkway after rain', site: 'twu',
    department: 'Production', date: '2026-06-05', severity: 'Minor',
    type: 'Slip / Trip / Fall', stage: 'Closed', owner: 'Dayang Nurul', daysOpen: 8,
    rootCause: 'Environmental Factors',
    description: 'Worker slipped on mill walkway; bruising only. Anti-slip grating installed on affected sections, cleaning schedule doubled in monsoon months.',
    evidence: [{ name: 'walkway-after-grating.jpg', kind: 'photo' }],
  },
]

// ─── Corrective actions ──────────────────────────────────────────────────────

export type ActionStatus = 'On Track' | 'At Risk' | 'Overdue' | 'Awaiting Verification' | 'Completed'

export interface CorrectiveAction {
  id: string
  title: string
  incident: string
  site: string
  owner: string
  due: string
  progress: number
  status: ActionStatus
  priority: 'High' | 'Medium' | 'Low'
}

export const ACTIONS: CorrectiveAction[] = [
  { id: 'CA-441', title: 'Replace all loading-arm gaskets with spiral-wound type', incident: 'INC-2607', site: 'btu', owner: 'Amirul Hassan', due: '2026-07-25', progress: 20, status: 'On Track', priority: 'High' },
  { id: 'CA-440', title: 'Audit and close all shelved alarms > 24h across terminal', incident: 'INC-2602', site: 'btu', owner: 'Faizal Omar', due: '2026-07-11', progress: 55, status: 'Overdue', priority: 'High' },
  { id: 'CA-439', title: 'Install permanent guarding on line 2 return rollers', incident: 'INC-2603', site: 'kch', owner: 'Sarah Wong', due: '2026-07-30', progress: 65, status: 'On Track', priority: 'High' },
  { id: 'CA-438', title: 'Reinstate pedestrian barriers + interlock removal permits', incident: 'INC-2606', site: 'sen', owner: 'Grace Lim', due: '2026-07-18', progress: 80, status: 'At Risk', priority: 'High' },
  { id: 'CA-437', title: 'Deploy mobile hydration stations to all harvest blocks', incident: 'INC-2605', site: 'twu', owner: 'Dayang Nurul', due: '2026-07-20', progress: 45, status: 'On Track', priority: 'Medium' },
  { id: 'CA-436', title: 'Mandatory tool-lanyard checks at scaffold access points', incident: 'INC-2604', site: 'mri', owner: 'Vincent Chai', due: '2026-07-08', progress: 100, status: 'Awaiting Verification', priority: 'High' },
  { id: 'CA-435', title: 'Compressor vibration alarm rationalisation study', incident: 'INC-2602', site: 'btu', owner: 'Faizal Omar', due: '2026-08-15', progress: 15, status: 'On Track', priority: 'Medium' },
  { id: 'CA-434', title: 'Re-survey and reissue anchor point maps (all levels)', incident: 'INC-2599', site: 'mri', owner: 'Vincent Chai', due: '2026-07-01', progress: 100, status: 'Completed', priority: 'Medium' },
  { id: 'CA-433', title: 'Halve H2S detector calibration interval, fix spares min-stock', incident: 'INC-2597', site: 'btu', owner: 'Amirul Hassan', due: '2026-06-30', progress: 100, status: 'Completed', priority: 'High' },
  { id: 'CA-432', title: 'LED lighting upgrade — staging areas and dock doors', incident: 'INC-2601', site: 'sbu', owner: 'Grace Lim', due: '2026-06-28', progress: 100, status: 'Completed', priority: 'Low' },
  { id: 'CA-431', title: 'Closed-transfer dispensing pumps for all chemical mixing', incident: 'INC-2600', site: 'twu', owner: 'Dayang Nurul', due: '2026-07-05', progress: 100, status: 'Awaiting Verification', priority: 'Medium' },
  { id: 'CA-430', title: 'Anti-slip grating phase 2 — remaining mill walkways', incident: 'INC-2596', site: 'twu', owner: 'Dayang Nurul', due: '2026-07-04', progress: 70, status: 'Overdue', priority: 'Medium' },
  { id: 'CA-429', title: 'Slew speed limiter checks across all overhead cranes', incident: 'INC-2598', site: 'kch', owner: 'Sarah Wong', due: '2026-08-01', progress: 40, status: 'On Track', priority: 'Medium' },
  { id: 'CA-428', title: 'Contractor CSE refresher for all Miri scaffold crews', incident: 'INC-2604', site: 'mri', owner: 'Vincent Chai', due: '2026-07-12', progress: 60, status: 'Overdue', priority: 'High' },
]

// ─── Audit readiness ─────────────────────────────────────────────────────────

export interface AuditStandard {
  id: string
  name: string
  readiness: number
  totalClauses: number
  compliant: number
  minor: number
  major: number
  nextAudit: string
  outstanding: { item: string; site: string; severity: 'Major' | 'Minor'; due: string }[]
}

export const AUDIT_STANDARDS: AuditStandard[] = [
  {
    id: 'iso45001', name: 'ISO 45001:2018', readiness: 87, totalClauses: 54, compliant: 47, minor: 5, major: 2,
    nextAudit: '2026-09-14',
    outstanding: [
      { item: 'Management review records incomplete for Q1 2026 (Cl. 9.3)', site: 'btu', severity: 'Major', due: '2026-08-10' },
      { item: 'Contractor competency matrix not updated after crew change (Cl. 7.2)', site: 'mri', severity: 'Major', due: '2026-08-01' },
      { item: 'Emergency drill frequency below plan at 2 sites (Cl. 8.2)', site: 'twu', severity: 'Minor', due: '2026-08-20' },
    ],
  },
  {
    id: 'osha514', name: 'OSHA 1994 (Act 514) + 2022 Amendments', readiness: 92, totalClauses: 38, compliant: 35, minor: 3, major: 0,
    nextAudit: '2026-08-05',
    outstanding: [
      { item: 'Risk assessment register review overdue for new conveyor line', site: 'kch', severity: 'Minor', due: '2026-07-28' },
      { item: 'OSH coordinator appointment letter pending for Senari', site: 'sen', severity: 'Minor', due: '2026-07-31' },
    ],
  },
  {
    id: 'cimah', name: 'CIMAH 1996 (Major Hazard)', readiness: 74, totalClauses: 26, compliant: 19, minor: 4, major: 3,
    nextAudit: '2026-08-22',
    outstanding: [
      { item: 'Safety report revalidation overdue — export compressor MOC not reflected', site: 'btu', severity: 'Major', due: '2026-08-05' },
      { item: 'Off-site emergency plan not tested with local authority this cycle', site: 'btu', severity: 'Major', due: '2026-08-15' },
      { item: 'ERT respirator fit-test records expired for 8 personnel', site: 'btu', severity: 'Major', due: '2026-07-30' },
    ],
  },
  {
    id: 'fire', name: 'Fire Services Act 1988 (FSC)', readiness: 95, totalClauses: 22, compliant: 21, minor: 1, major: 0,
    nextAudit: '2026-10-02',
    outstanding: [
      { item: 'Hose reel annual service certificate renewal', site: 'sbu', severity: 'Minor', due: '2026-08-30' },
    ],
  },
]

// ─── Company-level monthly KPIs ──────────────────────────────────────────────

export const MONTHLY_KPI = MONTHS.map((m, i) => ({
  month: m,
  incidents: SITES.reduce((s, x) => s + x.incidents[i], 0),
  nearMisses: SITES.reduce((s, x) => s + x.nearMisses[i], 0),
  safetyScore: Math.round(SITES.reduce((s, x) => s + x.trend[i] * x.headcount, 0) / SITES.reduce((s, x) => s + x.headcount, 0)),
  trifr: [2.4, 2.3, 2.4, 2.2, 2.1, 2.0, 2.1, 1.9, 1.9, 1.8, 1.9, 1.8][i],
  hoursWorked: [712, 698, 725, 705, 690, 718, 702, 731, 715, 728, 720, 734][i], // thousands
  trainingCompliance: [81, 82, 84, 83, 85, 86, 88, 87, 89, 90, 91, 92][i],
  inspections: [118, 124, 131, 127, 135, 142, 138, 149, 152, 158, 161, 166][i],
}))

export const COMPANY = {
  safetyScore: MONTHLY_KPI[11].safetyScore,
  safetyScoreDelta: MONTHLY_KPI[11].safetyScore - MONTHLY_KPI[0].safetyScore,
  complianceScore: 88,
  complianceDelta: 1,
  trifr: 1.8,
  trifrTarget: 1.5,
  daysSinceLastLTI: 23,
  openIncidents: INCIDENTS.filter((i) => i.stage !== 'Closed').length,
  openActions: ACTIONS.filter((a) => a.status !== 'Completed').length,
  overdueActions: ACTIONS.filter((a) => a.status === 'Overdue').length,
}

export const siteById = (id: string) => SITES.find((s) => s.id === id)!

export const SEVERITY_RANK: Record<Severity, number> = { Critical: 0, Serious: 1, Moderate: 2, Minor: 3 }

// "What should I look at next" — the decision feed on the executive dashboard
export const ATTENTION_ITEMS = [
  {
    kind: 'critical' as const,
    title: 'Bintulu LNG Terminal safety score down 13 pts over 12 months',
    detail: '2 critical incidents in 30 days, 5 overdue actions, CIMAH readiness at 74%. Recommend an executive site review this week.',
    link: '/sites',
  },
  {
    kind: 'critical' as const,
    title: 'CIMAH revalidation overdue with audit in 38 days',
    detail: '3 major findings open, all at Bintulu. Safety report MOC gap is the long-lead item — start now.',
    link: '/audit',
  },
  {
    kind: 'serious' as const,
    title: 'Human Factors incidents have tripled since January',
    detail: 'Now the #1 root cause (6/mo). Concentrated in Maintenance and Contractors. Fatigue and shift-handover review recommended.',
    link: '/root-cause',
  },
  {
    kind: 'warning' as const,
    title: '3 corrective actions overdue, 2 awaiting verification > 7 days',
    detail: 'Oldest: alarm-shelving audit (CA-440), 4 days late on a critical-incident action.',
    link: '/actions',
  },
]
