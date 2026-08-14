/**
 * Pilot demo dataset.
 *
 * Separate from `seed.ts` on purpose. The base seed is the minimum a working install
 * needs — companies, sites, departments, teams, the roster and the demo logins. This
 * file is the *story*: a workspace that looks like a month of real operations, so a
 * customer sees a product in use rather than an empty shell.
 *
 *   npm run demo         tidy up test debris, then populate (no-op if already loaded)
 *   npm run demo:reset   as above, but rebuild the dataset from scratch
 *   npm run demo:tidy    tidy only — leave the dataset alone
 *
 * Two properties it holds to:
 *
 *  1. Nothing it writes is visibly tagged. A demo that renders "demo:pilot" in an
 *     incident description is a demo that looks like test data. Rows are identified for
 *     removal by `createdBy` — provenance no screen renders — or by the natural keys
 *     declared below.
 *  2. Dates are relative to the run. "Overdue by four days" stays overdue whenever the
 *     demo happens, so the dataset cannot go stale between meetings.
 *
 * It writes through Prisma rather than the services, so the service-layer gates (a permit
 * needs its required precautions confirmed before issue; an audit cannot close on an
 * unverified finding) are not exercised on the way in. Every record below is therefore
 * built to satisfy them anyway — an active confined-space permit here carries its gas
 * test, and a closed audit carries no open finding. Seeding a state the product would
 * refuse to create is how a demo ends up demonstrating a bug.
 */
import { PrismaClient, type IncidentSeverity, type IncidentStage, type IncidentType } from '@prisma/client'
import { PERMIT_CONTROLS } from '../src/lib/permitCatalog.js'
import { TRAINING_COURSES, courseApplies } from '../src/lib/trainingCatalog.js'

/*
 * Refused in production, for the same reason the base seed is.
 *
 * This one is arguably worse. The seed creates logins; this writes a month of fabricated
 * incidents, permits, audits and training records into a workspace. In a system a company
 * keeps for regulatory reasons, invented safety records are not merely untidy - they sit
 * alongside the real ones in the register an inspector reads.
 *
 * The reset is scoped by `createdBy` and would not delete a customer's rows, but nothing
 * scopes the insert away from a real workspace, so the guard is on the whole script.
 */
if (process.env.NODE_ENV === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'yes') {
  // eslint-disable-next-line no-console
  console.error(
    'Refusing to load the demo dataset: NODE_ENV=production. '
    + 'This writes fabricated incidents, permits and audits into a workspace, which in a '
    + 'compliance system sits alongside the real ones an inspector reads. '
    + 'Set SEED_ALLOW_PRODUCTION=yes only if you genuinely intend that on this database.',
  )
  process.exit(1)
}

const db = new PrismaClient()

/** Written to `createdBy`, which no screen renders. The handle for a clean removal. */
const DEMO_MARK = 'demo-dataset'

const DAY = 86400_000
const HOUR = 3600_000
const ago = (days: number) => new Date(Date.now() - days * DAY)
const ahead = (days: number) => new Date(Date.now() + days * DAY)
/** Date-only values are pinned to UTC midnight — the rule every service follows. */
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

const COMPANIES = ['big', 'kcs'] as const
type CompanyId = (typeof COMPANIES)[number]

// ─── The dataset ─────────────────────────────────────────────────────────────
// Declared up front so the reset can match on natural keys for the tables that have no
// provenance column of their own. Names, sites and departments are the ones the base
// seed creates — an owner who is not on the roster is the detail that gives a demo away.

type IncidentSpec = {
  title: string; type: IncidentType; severity: IncidentSeverity; site: string
  dept: string; location: string; reporter: string; daysAgo: number
  stage: IncidentStage; highRisk?: boolean
}

const INCIDENTS: Record<CompanyId, IncidentSpec[]> = {
  big: [
    { title: 'Hydrocarbon leak at loading arm 3', type: 'environmental', severity: 'Critical', site: 'btu', dept: 'Field Operations', location: 'Jetty 2, loading arm 3', reporter: 'Rashid Karim', daysAgo: 2, stage: 'investigation', highRisk: true },
    { title: 'Scaffold clamp dropped from Level 8', type: 'near_miss', severity: 'Serious', site: 'mri', dept: 'Contractors', location: 'Module M-04, level 8', reporter: 'Kumar Raj', daysAgo: 4, stage: 'rca', highRisk: true },
    { title: 'Forklift near-collision with pedestrian', type: 'near_miss', severity: 'Moderate', site: 'sen', dept: 'Warehouse', location: 'Aisle D crossing', reporter: 'Siti Aminah', daysAgo: 5, stage: 'actions' },
    { title: 'Operator hand laceration on guard removal', type: 'mtc', severity: 'Moderate', site: 'kch', dept: 'Production', location: 'Line 2, infeed guard', reporter: 'Rosli Ahmad', daysAgo: 9, stage: 'verification' },
    { title: 'Blocked emergency eyewash station', type: 'unsafe_condition', severity: 'Minor', site: 'btu', dept: 'HSE', location: 'Sulfur recovery unit', reporter: 'Nurul Izzah', daysAgo: 11, stage: 'closed' },
    { title: 'Chemical splash during drum decanting', type: 'first_aid', severity: 'Moderate', site: 'twu', dept: 'Mill', location: 'Chemical store, bay 2', reporter: 'Lim Boon Keat', daysAgo: 14, stage: 'closed' },
    { title: 'Reversing telehandler without a banksman', type: 'unsafe_act', severity: 'Serious', site: 'mri', dept: 'Contractors', location: 'Laydown yard', reporter: 'Vincent Chai', daysAgo: 18, stage: 'closed' },
    { title: 'Pallet racking beam dislodged by reach truck', type: 'property_damage', severity: 'Minor', site: 'sen', dept: 'Warehouse', location: 'Rack row 7', reporter: 'Bong Chin Hui', daysAgo: 21, stage: 'closed' },
    { title: 'Slip on wet walkway near the wash bay', type: 'first_aid', severity: 'Minor', site: 'kch', dept: 'Maintenance', location: 'Wash bay approach', reporter: 'Kenny Lau', daysAgo: 24, stage: 'closed' },
    { title: 'Unsecured gas cylinder in transit', type: 'unsafe_condition', severity: 'Moderate', site: 'btu', dept: 'Maintenance', location: 'Workshop compound', reporter: 'Faizal Omar', daysAgo: 28, stage: 'closed' },
    { title: 'Overheating breaker in MCC panel 7', type: 'unsafe_condition', severity: 'Serious', site: 'kch', dept: 'Maintenance', location: 'MCC Room B', reporter: 'Ganesh Pillai', daysAgo: 32, stage: 'closed' },
    { title: 'Contractor working at height without a harness', type: 'unsafe_act', severity: 'Serious', site: 'mri', dept: 'Contractors', location: 'Process tower level 12', reporter: 'Vincent Chai', daysAgo: 36, stage: 'closed' },
  ],
  // A second, smaller workspace. Its job in the demo is to make tenant separation
  // visible: switch company and every figure on Mission Control changes.
  kcs: [
    { title: 'Rebar cage shifted during lifting', type: 'near_miss', severity: 'Serious', site: 'pjy', dept: 'Civil Works', location: 'Block C, pile cap 12', reporter: 'Azlan Mahmud', daysAgo: 3, stage: 'investigation', highRisk: true },
    { title: 'Cable tray dropped from ceiling void', type: 'near_miss', severity: 'Moderate', site: 'smh', dept: 'M&E Installation', location: 'Substation 2, ceiling void', reporter: 'Lau Tze Ming', daysAgo: 8, stage: 'actions' },
    { title: 'Worker cut hand on exposed rebar', type: 'first_aid', severity: 'Minor', site: 'pjy', dept: 'Civil Works', location: 'Block A slab', reporter: 'Azlan Mahmud', daysAgo: 16, stage: 'closed' },
    { title: 'Temporary power board left unlocked', type: 'unsafe_condition', severity: 'Moderate', site: 'smh', dept: 'M&E Installation', location: 'Level 1 riser', reporter: 'Lau Tze Ming', daysAgo: 22, stage: 'closed' },
  ],
}

type ActionSpec = {
  title: string; owner: string; site: string; dueInDays: number
  status: 'open' | 'in_progress' | 'completed' | 'verified'
  priority: 'High' | 'Medium' | 'Low'
  source?: 'inspection' | 'manual'
  incidentIdx?: number
}

/** A register worth looking at: two genuinely overdue, several in flight, some verified. */
const ACTIONS: Record<CompanyId, ActionSpec[]> = {
  big: [
    { title: 'Replace failed flange gasket and pressure-test loading arm 3', owner: 'Faizal Omar', site: 'btu', dueInDays: 3, status: 'in_progress', priority: 'High', incidentIdx: 0 },
    { title: 'Introduce a dropped-object register for all tower work', owner: 'Vincent Chai', site: 'mri', dueInDays: 9, status: 'open', priority: 'High', incidentIdx: 1 },
    { title: 'Reinstate pedestrian barriers at the aisle D crossing', owner: 'Grace Lim', site: 'sen', dueInDays: -4, status: 'in_progress', priority: 'High', incidentIdx: 2 },
    { title: 'Fit an interlock on the Line 2 infeed guard', owner: 'Sarah Wong', site: 'kch', dueInDays: -2, status: 'completed', priority: 'High', incidentIdx: 3 },
    { title: 'Add a monthly eyewash check to the SRU inspection round', owner: 'Nurul Izzah', site: 'btu', dueInDays: 12, status: 'verified', priority: 'Medium', incidentIdx: 4 },
    { title: 'Reissue the chemical decanting SOP with a PPE matrix', owner: 'Lim Boon Keat', site: 'twu', dueInDays: 20, status: 'verified', priority: 'Medium', incidentIdx: 5 },
    { title: 'Banksman refresher for all telehandler operators', owner: 'Vincent Chai', site: 'mri', dueInDays: 15, status: 'in_progress', priority: 'Medium', incidentIdx: 6 },
    { title: 'Racking inspection by a competent person', owner: 'Grace Lim', site: 'sen', dueInDays: 25, status: 'open', priority: 'Medium', source: 'inspection' },
    { title: 'Apply anti-slip coating to the wash bay approach', owner: 'Kenny Lau', site: 'kch', dueInDays: 30, status: 'open', priority: 'Low', source: 'inspection' },
    { title: 'Thermographic survey of all MCC panels', owner: 'Ganesh Pillai', site: 'kch', dueInDays: 6, status: 'in_progress', priority: 'High', source: 'manual' },
  ],
  kcs: [
    { title: 'Third-party check of all lifting gear certificates', owner: 'Azlan Mahmud', site: 'pjy', dueInDays: 5, status: 'in_progress', priority: 'High', incidentIdx: 0 },
    { title: 'Toolbox talk on securing overhead loads', owner: 'Lau Tze Ming', site: 'smh', dueInDays: -3, status: 'open', priority: 'Medium', incidentIdx: 1 },
    { title: 'Cap all exposed rebar starter bars on Block A', owner: 'Azlan Mahmud', site: 'pjy', dueInDays: 11, status: 'verified', priority: 'Medium', incidentIdx: 2 },
  ],
}

type AssetSpec = {
  name: string
  category: 'fire_extinguisher' | 'forklift' | 'ladder' | 'scaffolding' | 'machinery'
    | 'electrical_panel' | 'emergency_lighting' | 'vehicle' | 'pressure_vessel'
  serial: string; site: string; dept: string; owner: string; location: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  dueInDays: number
  /** The historical inspection failed, so the asset carries a defect. */
  lastFailed?: boolean
}

const ASSETS: Record<CompanyId, AssetSpec[]> = {
  big: [
    { name: 'Reach truck RT-07', category: 'forklift', serial: 'RT07-2211-MY', site: 'sen', dept: 'Warehouse', owner: 'Grace Lim', location: 'Charging bay 3', frequency: 'weekly', dueInDays: -3 },
    { name: 'CO2 extinguisher — Dock 2 pillar', category: 'fire_extinguisher', serial: 'FE-CO2-8841', site: 'sen', dept: 'Warehouse', owner: 'Grace Lim', location: 'Dock 2, pillar D2-04', frequency: 'monthly', dueInDays: 12 },
    { name: 'Extension ladder 6m', category: 'ladder', serial: 'LDR-6M-114', site: 'kch', dept: 'Maintenance', owner: 'Ganesh Pillai', location: 'Maintenance store, rack L2', frequency: 'monthly', dueInDays: 2 },
    { name: 'Scaffold — Module M-04 L12', category: 'scaffolding', serial: 'SCF-M04-12', site: 'mri', dept: 'Contractors', owner: 'Vincent Chai', location: 'Module M-04, level 12', frequency: 'weekly', dueInDays: -1 },
    { name: 'Conveyor line 2 drive unit', category: 'machinery', serial: 'CNV-L2-DRV', site: 'kch', dept: 'Production', owner: 'Sarah Wong', location: 'Line 2, drive end', frequency: 'monthly', dueInDays: 18 },
    { name: 'MCC Panel B — compressor house', category: 'electrical_panel', serial: 'MCC-B-0442', site: 'btu', dept: 'Maintenance', owner: 'Faizal Omar', location: 'Compressor house, bay 2', frequency: 'quarterly', dueInDays: 51 },
    { name: 'Emergency lighting loop — SRU', category: 'emergency_lighting', serial: 'EML-SRU-01', site: 'btu', dept: 'HSE', owner: 'Amirul Hassan', location: 'Sulfur recovery unit', frequency: 'monthly', dueInDays: -5 },
    { name: 'Standby diesel genset 500kVA', category: 'machinery', serial: 'GEN-500-TWU', site: 'twu', dept: 'Mill', owner: 'Dayang Nurul', location: 'Genset house', frequency: 'monthly', dueInDays: 26, lastFailed: true },
    { name: 'Air receiver AR-2 (statutory)', category: 'pressure_vessel', serial: 'AR2-KCH-1998', site: 'kch', dept: 'Maintenance', owner: 'Ganesh Pillai', location: 'Compressor room', frequency: 'annual', dueInDays: 40 },
    { name: 'Hilux crew cab — QSK 8812', category: 'vehicle', serial: 'QSK8812', site: 'sbu', dept: 'Logistics & Transport', owner: 'Marcus Tan', location: 'Depot parking A', frequency: 'monthly', dueInDays: 16 },
  ],
  kcs: [
    { name: 'Tower crane TC-1 (Block C)', category: 'machinery', serial: 'TC1-PJY-0091', site: 'pjy', dept: 'Civil Works', owner: 'Azlan Mahmud', location: 'Block C base', frequency: 'weekly', dueInDays: 4 },
    { name: 'ABC extinguisher — site office', category: 'fire_extinguisher', serial: 'FE-ABC-3312', site: 'smh', dept: 'M&E Installation', owner: 'Lau Tze Ming', location: 'Site office entrance', frequency: 'monthly', dueInDays: -2 },
  ],
}

type PermitSpec = {
  title: string
  type: 'hot_work' | 'confined_space' | 'working_at_height' | 'electrical_isolation' | 'lifting_operation'
  site: string; dept: string; location: string; applicant: string
  status: 'submitted' | 'approved' | 'active' | 'closed'
  /** Hours relative to now — a live board is the point, so something must be running. */
  fromHours: number; toHours: number
  gasTest?: boolean
  isolation?: { description: string; tagId: string }
}

const PERMITS: Record<CompanyId, PermitSpec[]> = {
  big: [
    // Deliberately close to expiry: the permit board only means anything when something
    // is running. Three hours is long enough to survive a meeting, short enough to be
    // the first thing an HSE manager reaches for.
    { title: 'Weld repair on jetty pipe support', type: 'hot_work', site: 'btu', dept: 'Maintenance', location: 'Jetty 2, loading arm 3 manifold', applicant: 'Faizal Omar', status: 'active', fromHours: -3, toHours: 3, gasTest: true },
    { title: 'Internal inspection of settling tank T-104', type: 'confined_space', site: 'btu', dept: 'Field Operations', location: 'Tank farm, T-104', applicant: 'Hafiz Rahman', status: 'active', fromHours: -1, toHours: 6.5, gasTest: true },
    // Inside its final hour, which is what the server calls expiringSoon. It is the one
    // permit Mission Control raises, and if a meeting overruns it lapses on screen —
    // which demonstrates derived status better than any amount of explaining.
    { title: 'Blind flange fitting on line 12 inch NG-104', type: 'working_at_height', site: 'btu', dept: 'Field Operations', location: 'Pipe rack 4, north', applicant: 'Rashid Karim', status: 'active', fromHours: -7, toHours: 0.8 },
    { title: 'Replace corroded handrail on Level 12', type: 'working_at_height', site: 'mri', dept: 'Contractors', location: 'Process tower, Level 12', applicant: 'Kumar Raj', status: 'submitted', fromHours: 2, toHours: 12 },
    { title: 'Lift replacement pump into pump house 2', type: 'lifting_operation', site: 'kch', dept: 'Maintenance', location: 'Pump house 2', applicant: 'Ganesh Pillai', status: 'approved', fromHours: 1, toHours: 9 },
    { title: 'Motor control centre panel upgrade', type: 'electrical_isolation', site: 'kch', dept: 'Maintenance', location: 'MCC Room B, panel 7', applicant: 'Kenny Lau', status: 'closed', fromHours: -30, toHours: -6, isolation: { description: 'MCC Panel 7 incomer, 415V', tagId: 'LOTO-4471' } },
  ],
  kcs: [
    { title: 'Cutting and welding of a steel bracket', type: 'hot_work', site: 'smh', dept: 'M&E Installation', location: 'Substation 2, riser', applicant: 'Lau Tze Ming', status: 'active', fromHours: -2, toHours: 3, gasTest: true },
  ],
}

type ObligationSpec = { regulation: string; requirement: string; site: string | null; responsible: string; dueInDays: number }

const OBLIGATIONS: Record<CompanyId, ObligationSpec[]> = {
  big: [
    { regulation: 'OSHA 1994 s.29', requirement: 'Safety & Health Officer appointment (JKKP 8)', site: 'btu', responsible: 'Amirul Hassan', dueInDays: 210 },
    { regulation: 'FMA 1967 (PMA)', requirement: 'Air receiver AR-2 certificate of fitness', site: 'kch', responsible: 'Ganesh Pillai', dueInDays: 40 },
    { regulation: 'EQA 1974', requirement: 'Scheduled waste consignment reporting', site: 'twu', responsible: 'Dayang Nurul', dueInDays: 120 },
    // One overdue and one inside the renewal window. A register where half the entries are
    // late is not a company anyone would put in front of a prospect; a register where
    // nothing is ever due has nothing to demonstrate.
    { regulation: 'USECHH 2000', requirement: 'Chemical health risk assessment review', site: 'kch', responsible: 'Sarah Wong', dueInDays: -6 },
    { regulation: 'CIMAH 1996', requirement: 'Major hazard installation safety report', site: 'btu', responsible: 'Marcus Tan', dueInDays: 95 },
    { regulation: 'OSHA 1994 s.30', requirement: 'Safety & health committee quarterly meeting', site: null, responsible: 'Marcus Tan', dueInDays: 24 },
    { regulation: 'BOWEC 1986', requirement: 'Lifting machinery certificate of fitness (crane CR-2)', site: 'mri', responsible: 'Vincent Chai', dueInDays: 165 },
    { regulation: 'Fire Services Act 1988', requirement: 'Fire certificate renewal — assembly plant', site: 'kch', responsible: 'Ganesh Pillai', dueInDays: 240 },
  ],
  kcs: [
    { regulation: 'CIDB Act 520', requirement: 'Green card verification for all site workers', site: 'pjy', responsible: 'Azlan Mahmud', dueInDays: 18 },
    { regulation: 'OSHA 1994 s.29', requirement: 'Site Safety Supervisor appointment', site: 'smh', responsible: 'Lau Tze Ming', dueInDays: -9 },
    { regulation: 'BOWEC 1986', requirement: 'Tower crane TC-1 certificate of fitness', site: 'pjy', responsible: 'Azlan Mahmud', dueInDays: 130 },
    { regulation: 'EQA 1974', requirement: 'Construction site erosion & sediment control plan', site: 'pjy', responsible: 'Azlan Mahmud', dueInDays: 200 },
    { regulation: 'OSHA 1994 s.30', requirement: 'Site safety committee monthly meeting', site: null, responsible: 'Azlan Mahmud', dueInDays: 60 },
  ],
}

type DocumentSpec = {
  name: string
  kind: 'policy' | 'sop' | 'certificate' | 'audit_report' | 'training_record'
  status: 'Approved' | 'PendingApproval'
  version: string; owner: string
}

const DOCUMENTS: Record<CompanyId, DocumentSpec[]> = {
  big: [
    { name: 'Group OH&S Policy', kind: 'policy', status: 'Approved', version: '4.0', owner: 'Marcus Tan' },
    { name: 'HIRARC Procedure', kind: 'sop', status: 'PendingApproval', version: '2.1', owner: 'Marcus Tan' },
    { name: 'Permit-to-Work Procedure', kind: 'sop', status: 'Approved', version: '3.3', owner: 'Amirul Hassan' },
    { name: 'PMA certificate PMT-4/2026 (AR-2)', kind: 'certificate', status: 'Approved', version: '2026', owner: 'Ganesh Pillai' },
    { name: 'Emergency Response Plan — Bintulu', kind: 'sop', status: 'Approved', version: '5.0', owner: 'Nurul Izzah' },
    { name: 'Contractor HSE audit report — Q2 2026', kind: 'audit_report', status: 'Approved', version: 'Q2-2026', owner: 'Vincent Chai' },
  ],
  kcs: [
    { name: 'Project HSE Plan — Petra Jaya', kind: 'policy', status: 'Approved', version: '2.0', owner: 'Azlan Mahmud' },
    { name: 'Lifting Operations Method Statement', kind: 'sop', status: 'PendingApproval', version: '1.4', owner: 'Azlan Mahmud' },
  ],
}

type AuditSpec = {
  title: string
  type: 'internal' | 'dosh' | 'contractor' | 'environmental' | 'quality'
  template: string; site: string; dept: string; lead: string
  scheduledInDays: number
  status: 'planned' | 'in_progress' | 'completed' | 'closed'
  score?: number
  /**
   * An audit that scored 88% found something. A closed audit whose findings are all
   * verified is the normal, healthy case — and without a few of them the closure rate
   * that feeds audit readiness is 0%, which makes a well-run programme look abandoned.
   */
  findings?: {
    category: string; description: string
    severity: 'Critical' | 'Major' | 'Minor' | 'Observation'
    action: string; owner: string
    /** Verified findings are settled; an open one blocks its audit from closing. */
    settled: boolean
  }[]
}

const AUDITS: Record<CompanyId, AuditSpec[]> = {
  big: [
    { title: 'ISO 45001 internal pre-audit — Kuching', type: 'internal', template: 'tpl-iso45001', site: 'kch', dept: 'Site-wide', lead: 'Marcus Tan', scheduledInDays: 9, status: 'planned' },
    { title: 'DOSH readiness walk — Bintulu terminal', type: 'dosh', template: 'tpl-dosh', site: 'btu', dept: 'Site-wide', lead: 'Amirul Hassan', scheduledInDays: 2, status: 'in_progress' },
    {
      title: 'Contractor HSE audit — scaffold crews', type: 'contractor', template: 'tpl-contractor',
      site: 'mri', dept: 'Contractors', lead: 'Vincent Chai', scheduledInDays: -6, status: 'completed', score: 78,
      findings: [{
        category: 'Mobilisation',
        description: 'Harness inspection records incomplete for two scaffold crews.',
        severity: 'Major',
        action: 'Reissue harness inspection records and re-verify all scaffold crew equipment',
        owner: 'Vincent Chai',
        settled: false,
      }],
    },
    {
      title: 'Environmental audit — scheduled waste', type: 'environmental', template: 'tpl-env',
      site: 'twu', dept: 'Mill', lead: 'Dayang Nurul', scheduledInDays: -14, status: 'closed', score: 92,
      findings: [{
        category: 'Waste management',
        description: 'Scheduled waste store lacked a spill kit within 10m of the bunded area.',
        severity: 'Minor',
        action: 'Install a spill kit at the scheduled waste store and add it to the monthly round',
        owner: 'Dayang Nurul',
        settled: true,
      }],
    },
    {
      title: '5S quality walk — Senari warehouse', type: 'quality', template: 'tpl-5s',
      site: 'sen', dept: 'Warehouse', lead: 'Grace Lim', scheduledInDays: -21, status: 'closed', score: 88,
      findings: [{
        category: 'Set in order',
        description: 'Aisle D walkway markings worn through; pedestrian route not clearly defined.',
        severity: 'Minor',
        action: 'Re-line the aisle D pedestrian walkway',
        owner: 'Grace Lim',
        settled: true,
      }],
    },
  ],
  kcs: [
    { title: 'Monthly site HSE inspection — Petra Jaya', type: 'internal', template: 'tpl-iso45001', site: 'pjy', dept: 'Civil Works', lead: 'Azlan Mahmud', scheduledInDays: 5, status: 'planned' },
    {
      title: 'Subcontractor audit — M&E installation', type: 'contractor', template: 'tpl-contractor',
      site: 'smh', dept: 'M&E Installation', lead: 'Lau Tze Ming', scheduledInDays: -10, status: 'closed', score: 84,
      findings: [{
        category: 'Documentation',
        description: 'Two electricians could not produce a current competency certificate on site.',
        severity: 'Minor',
        action: 'Collect and file competency certificates for all M&E subcontractor staff',
        owner: 'Lau Tze Ming',
        settled: true,
      }],
    },
  ],
}

// Certificates are issued against the standard catalogue, and only for the courses that
// actually apply to a person's department — the same rule the competency matrix uses to
// decide what someone is *required* to hold. Issuing a flat set to everyone leaves every
// employee short of the courses nobody was given, which reads as a workforce where not one
// person is fully trained.

const SESSIONS: Record<CompanyId, { courseId: string; courseName: string; site: string; trainer: string; venue: string; inDays: number; seats: number }> = {
  big: { courseId: 'trn-104', courseName: 'Lockout / Tagout (LOTO)', site: 'kch', trainer: 'Marcus Tan', venue: 'Kuching training room 2', inDays: 6, seats: 12 },
  kcs: { courseId: 'trn-101', courseName: 'Safety Induction', site: 'pjy', trainer: 'Azlan Mahmud', venue: 'Petra Jaya site office', inDays: 3, seats: 20 },
}

/**
 * Rows left behind by load testing and manual verification.
 *
 * These are not customer data and not demo data — they are the debris of building the
 * product, and they are the single biggest thing standing between this database and a
 * customer meeting. An incident register whose first page reads "Load test incident 494"
 * undoes whatever the rest of the screen was saying.
 *
 * Incidents are *archived* rather than deleted: `archived` already excludes them from
 * every list, count and lookup, so one UPDATE reverses this entirely. The rest are
 * removed, because they are duplicates of records the dataset below creates properly.
 */
const TEST_ARTIFACTS = {
  /**
   * The tenant those rows live in. Reference codes are per-tenant, so an unscoped
   * `code: 'CA-401'` matches the first action of *every* workspace — including one this
   * file had just created. Scoping is not tidiness here, it is correctness.
   */
  companyId: 'big',
  /** Titles only a test harness produces. Matched as prefixes. */
  incidentTitlePrefixes: ['Load test incident ', 'RCA endpoint check'],
  /** One-off rows from manual verification on this machine. */
  incidentTitles: ['Unguarded rotating shaft on pump P-104'],
  actionCodes: ['CA-401', 'CA-402', 'CA-403', 'CA-404'],
  permitCodes: ['PTW-4404'],
  assetCodes: ['AST-1101'],
  auditCodes: ['AUD-3010'],
  sessionCodes: ['SES-505'],
}

async function tidy() {
  const { companyId } = TEST_ARTIFACTS
  // Belt and braces: nothing this file created is ever a candidate, whatever its code.
  const notDemo = { companyId, createdBy: { not: DEMO_MARK } }

  const archived = await db.incident.updateMany({
    where: {
      companyId,
      archived: false,
      OR: [
        ...TEST_ARTIFACTS.incidentTitlePrefixes.map((p) => ({ title: { startsWith: p } })),
        { title: { in: TEST_ARTIFACTS.incidentTitles } },
      ],
    },
    data: { archived: true },
  })

  // Order matters: a finding holds a required reference to its action, and a session
  // owns its certificates, so the dependants go first.
  const auditWhere = { ...notDemo, code: { in: TEST_ARTIFACTS.auditCodes } }
  await db.auditFinding.deleteMany({ where: { audit: auditWhere } })
  await db.audit.deleteMany({ where: auditWhere })

  const sessionWhere = { ...notDemo, code: { in: TEST_ARTIFACTS.sessionCodes } }
  await db.certificate.deleteMany({ where: { session: sessionWhere } })
  await db.trainingSession.deleteMany({ where: sessionWhere })

  await db.correctiveAction.deleteMany({ where: { ...notDemo, code: { in: TEST_ARTIFACTS.actionCodes } } })
  await db.permit.deleteMany({ where: { ...notDemo, code: { in: TEST_ARTIFACTS.permitCodes } } })
  await db.asset.deleteMany({ where: { ...notDemo, code: { in: TEST_ARTIFACTS.assetCodes } } })

  if (archived.count > 0) console.log(`Tidied: ${archived.count} test incidents archived.`)
}

/** Who runs an investigation at each site — the safety officer or the site's HSE lead. */
const INVESTIGATOR_BY_SITE: Record<string, string> = {
  kch: 'Ganesh Pillai', btu: 'Amirul Hassan', mri: 'Vincent Chai',
  sbu: 'Marcus Tan', twu: 'Dayang Nurul', sen: 'Grace Lim',
  pjy: 'Azlan Mahmud', smh: 'Lau Tze Ming',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Allocates a reference from the same Counter the services use, so nothing collides. */
async function nextRef(companyId: string, kind: string, start: number): Promise<number> {
  const c = await db.counter.upsert({
    where: { companyId_kind: { companyId, kind } },
    update: { next: { increment: 1 } },
    create: { companyId, kind, next: start },
    select: { next: true },
  })
  return c.next
}

/**
 * Certificate numbers come from the reserved global sequence, exactly as trainingService
 * does. They are quoted externally and verified by number alone, so two tenants must
 * never mint the same one.
 */
async function nextCertificateNumber(issueDate: Date): Promise<string> {
  const n = await nextRef('__global__', 'certificate', 2000)
  return `CERT-${issueDate.getUTCFullYear()}-${String(n).padStart(4, '0')}`
}

// ─── Reset ───────────────────────────────────────────────────────────────────

async function reset() {
  for (const companyId of COMPANIES) {
    // Children first wherever the relation does not cascade.
    await db.auditFinding.deleteMany({ where: { audit: { companyId, createdBy: DEMO_MARK } } })
    await db.audit.deleteMany({ where: { companyId, createdBy: DEMO_MARK } })

    // A certificate cascades from neither employee nor course, so it is matched on the
    // marker parked in docName — a field no screen renders.
    await db.certificate.deleteMany({ where: { companyId, docName: DEMO_MARK } })
    await db.trainingSession.deleteMany({ where: { companyId, createdBy: DEMO_MARK } })

    // Inspections cascade from the asset. Corrective actions only null their asset link,
    // so they are removed by their own marker.
    await db.asset.deleteMany({ where: { companyId, createdBy: DEMO_MARK } })
    await db.permit.deleteMany({ where: { companyId, createdBy: DEMO_MARK } })
    await db.correctiveAction.deleteMany({ where: { companyId, createdBy: DEMO_MARK } })

    // Incidents, obligations and documents have no provenance column; their natural keys
    // are declared above and are specific enough to match nothing else.
    await db.incident.deleteMany({
      where: { companyId, title: { in: INCIDENTS[companyId].map((i) => i.title) } },
    })
    await db.complianceObligation.deleteMany({
      where: { companyId, requirement: { in: OBLIGATIONS[companyId].map((o) => o.requirement) } },
    })
    await db.complianceDocument.deleteMany({
      where: { companyId, name: { in: DOCUMENTS[companyId].map((d) => d.name) } },
    })
  }
  console.log('Removed the previous demo records.')
}

// ─── Builders ────────────────────────────────────────────────────────────────

async function seedIncidents(companyId: CompanyId): Promise<string[]> {
  const ids: string[] = []
  for (const i of INCIDENTS[companyId]) {
    const n = await nextRef(companyId, 'incident', 2601)
    const incident = await db.incident.create({
      data: {
        number: `INC-${n}`,
        companyId,
        siteId: i.site,
        title: i.title,
        description: `${i.title}. Reported from the field and triaged by the site safety officer.`,
        type: i.type,
        severity: i.severity,
        stage: i.stage,
        department: i.dept,
        location: i.location,
        reporter: i.reporter,
        // An incident sitting at Verification with nobody investigating it reads as a
        // broken record. Anything past the initial assessment carries its investigator;
        // the two newest high-risk cases deliberately do not, because "unassigned
        // high-risk investigation" is the alarm Mission Control is supposed to raise.
        investigator: i.stage === 'reported' || i.stage === 'assessment' || i.highRisk
          ? null
          : INVESTIGATOR_BY_SITE[i.site] ?? 'Marcus Tan',
        highRisk: i.highRisk ?? false,
        riskRating: i.highRisk ? 'High' : null,
        occurredAt: ago(i.daysAgo),
        reportedAt: ago(i.daysAgo),
        closedAt: i.stage === 'closed' ? ago(Math.max(0, i.daysAgo - 6)) : null,
      },
    })

    const trail: { action: string; detail?: string; actor: string; daysAgo: number }[] = [
      { action: 'Incident reported', detail: `${i.severity} · ${i.location}`, actor: i.reporter, daysAgo: i.daysAgo },
    ]
    if (i.stage !== 'reported') {
      trail.push({ action: 'Investigation started', actor: 'Marcus Tan', daysAgo: Math.max(0, i.daysAgo - 1) })
    }
    if (i.stage === 'closed') {
      trail.push({ action: 'Incident closed', detail: 'Actions verified effective.', actor: 'Marcus Tan', daysAgo: Math.max(0, i.daysAgo - 6) })
    }
    await db.incidentEvent.createMany({
      data: trail.map((t) => ({
        incidentId: incident.id, action: t.action, detail: t.detail ?? null,
        actor: t.actor, at: ago(t.daysAgo),
      })),
    })
    ids.push(incident.id)
  }
  return ids
}

async function seedActions(companyId: CompanyId, incidentIds: string[]) {
  for (const a of ACTIONS[companyId]) {
    const done = a.status === 'completed' || a.status === 'verified'
    await db.correctiveAction.create({
      data: {
        code: `CA-${await nextRef(companyId, 'capa', 401)}`,
        companyId,
        siteId: a.site,
        incidentId: a.incidentIdx !== undefined ? incidentIds[a.incidentIdx] : null,
        source: a.incidentIdx !== undefined ? 'incident' : (a.source ?? 'manual'),
        title: a.title,
        detail: 'Raised from the site safety programme.',
        owner: a.owner,
        dueDate: utcDay(ahead(a.dueInDays)),
        priority: a.priority,
        status: a.status,
        completedAt: done ? ago(2) : null,
        evidenceNote: done ? 'Work completed, photographed and handed back to the area owner.' : null,
        verifiedBy: a.status === 'verified' ? 'Marcus Tan' : null,
        verifiedAt: a.status === 'verified' ? ago(1) : null,
        createdBy: DEMO_MARK,
      },
    })
  }
}

async function seedAssets(companyId: CompanyId) {
  for (const a of ASSETS[companyId]) {
    const code = await nextRef(companyId, 'asset', 1101)
    const asset = await db.asset.create({
      data: {
        code: `AST-${code}`,
        qrKey: `AST-${code}`,
        companyId,
        siteId: a.site,
        name: a.name,
        category: a.category,
        serialNumber: a.serial,
        department: a.dept,
        owner: a.owner,
        location: a.location,
        frequency: a.frequency,
        nextDueDate: utcDay(ahead(a.dueInDays)),
        lastInspectedAt: ago(20),
        createdBy: DEMO_MARK,
      },
    })

    // The open booking that keeps the asset on the calendar.
    await db.inspection.create({
      data: {
        code: `INS-${await nextRef(companyId, 'inspection', 2080)}`,
        assetId: asset.id, companyId, siteId: a.site,
        scheduledFor: utcDay(ahead(a.dueInDays)), assignedTo: a.owner,
      },
    })

    // One completed inspection behind it, so the compliance rate is not 0% on day one.
    const done = await db.inspection.create({
      data: {
        code: `INS-${await nextRef(companyId, 'inspection', 2080)}`,
        assetId: asset.id, companyId, siteId: a.site,
        scheduledFor: utcDay(ago(20)), assignedTo: a.owner,
        status: 'completed', completedAt: ago(20), completedBy: a.owner,
        outcome: a.lastFailed ? 'failed' : 'passed',
        comments: a.lastFailed ? 'Battery charger faulty; the unit will not auto-start on mains failure.' : null,
        signature: a.owner, photoCount: 2,
      },
    })

    // A failed inspection that raises no action is just a note, and the register would
    // show a failure against an asset with no open defects. The service raises one on
    // completion; seeding directly has to do the same.
    if (a.lastFailed) {
      await db.correctiveAction.create({
        data: {
          code: `CA-${await nextRef(companyId, 'capa', 401)}`,
          source: 'inspection', companyId, siteId: a.site,
          assetId: asset.id, inspectionId: done.id,
          title: `Defect: ${a.name} — battery charger faulty`,
          detail: `Raised from ${done.code}. The set will not auto-start on mains failure.`,
          owner: a.owner,
          dueDate: utcDay(ahead(4)),
          priority: 'High',
          status: 'in_progress',
          createdBy: DEMO_MARK,
        },
      })
    }
  }
}

async function seedPermits(companyId: CompanyId) {
  for (const p of PERMITS[companyId]) {
    const issued = p.status === 'approved' || p.status === 'active' || p.status === 'closed'
    const approvedAt = new Date(Date.now() + (p.fromHours - 0.5) * HOUR)

    const permit = await db.permit.create({
      data: {
        code: `PTW-${await nextRef(companyId, 'permit', 4401)}`,
        companyId, siteId: p.site, type: p.type, title: p.title,
        description: `${p.title}. Scope agreed at the pre-job briefing.`,
        department: p.dept, location: p.location, applicant: p.applicant, workerCount: 3,
        validFrom: new Date(Date.now() + p.fromHours * HOUR),
        validTo: new Date(Date.now() + p.toHours * HOUR),
        status: p.status,
        approver: issued ? 'Amirul Hassan' : null,
        approvedAt: issued ? approvedAt : null,
        closedBy: p.status === 'closed' ? 'Amirul Hassan' : null,
        closedAt: p.status === 'closed' ? new Date(Date.now() + (p.toHours + 0.5) * HOUR) : null,
        handbackConfirmed: p.status === 'closed',
        createdBy: DEMO_MARK,
      },
    })

    // The real checklist for the type. Anything issued has every required precaution
    // confirmed — that is the gate the service enforces, so seeded data must respect it.
    await db.permitControl.createMany({
      data: PERMIT_CONTROLS[p.type].map((c, position) => {
        const confirmed = issued && (c.required || position % 2 === 0)
        return {
          permitId: permit.id,
          position,
          label: c.label,
          required: c.required,
          confirmed,
          confirmedBy: confirmed ? 'Amirul Hassan' : null,
          confirmedAt: confirmed ? approvedAt : null,
        }
      }),
    })

    if (p.gasTest) {
      await db.gasTest.create({
        data: {
          permitId: permit.id,
          testedBy: 'Amirul Hassan',
          testedAt: approvedAt,
          oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 2,
          pass: true,
          note: 'Pre-entry test with a calibrated four-gas detector.',
        },
      })
    }

    if (p.isolation) {
      await db.isolationPoint.create({
        data: {
          permitId: permit.id,
          description: p.isolation.description,
          tagId: p.isolation.tagId,
          isolatedBy: p.applicant,
          isolatedAt: approvedAt,
          // Released before closure — a permit cannot close on a live isolation.
          removedBy: p.applicant,
          removedAt: new Date(Date.now() + (p.toHours + 0.25) * HOUR),
        },
      })
    }

    const events: { action: string; detail?: string; actor: string; at: Date }[] = [
      { action: 'Permit requested', detail: p.title, actor: p.applicant, at: new Date(Date.now() + (p.fromHours - 2) * HOUR) },
    ]
    if (issued) events.push({ action: 'Approved', detail: 'Precautions verified on site.', actor: 'Amirul Hassan', at: approvedAt })
    if (p.status === 'active') events.push({ action: 'Work started', actor: p.applicant, at: new Date(Date.now() + p.fromHours * HOUR) })
    if (p.status === 'closed') events.push({ action: 'Closed', detail: 'Handback confirmed, isolations released.', actor: 'Amirul Hassan', at: new Date(Date.now() + (p.toHours + 0.5) * HOUR) })

    await db.permitEvent.createMany({
      data: events.map((e) => ({ permitId: permit.id, action: e.action, detail: e.detail ?? null, actor: e.actor, at: e.at })),
    })
  }
}

async function seedCompliance(companyId: CompanyId) {
  for (const o of OBLIGATIONS[companyId]) {
    await db.complianceObligation.create({
      data: {
        companyId, siteId: o.site, regulation: o.regulation, requirement: o.requirement,
        responsible: o.responsible,
        nextDue: utcDay(ahead(o.dueInDays)),
        lastRenewedAt: utcDay(ago(300)),
        notes: 'Tracked in the statutory compliance register.',
      },
    })
  }

  for (const d of DOCUMENTS[companyId]) {
    const doc = await db.complianceDocument.create({
      data: {
        companyId, name: d.name, kind: d.kind, version: d.version, status: d.status,
        owner: d.owner, sizeKb: 240 + d.name.length * 7,
        approvedBy: d.status === 'Approved' ? 'Marcus Tan' : null,
        approvedAt: d.status === 'Approved' ? ago(30) : null,
      },
    })
    await db.documentVersion.create({
      data: { documentId: doc.id, version: d.version, by: d.owner, note: 'Scheduled review', at: ago(30) },
    })
  }
}

async function seedAudits(companyId: CompanyId) {
  for (const a of AUDITS[companyId]) {
    const elapsed = Math.abs(a.scheduledInDays)
    const audit = await db.audit.create({
      data: {
        code: `AUD-${await nextRef(companyId, 'audit', 3010)}`,
        companyId, siteId: a.site, title: a.title, type: a.type,
        department: a.dept, leadAuditor: a.lead, team: [],
        templateId: a.template,
        scheduledFor: utcDay(ahead(a.scheduledInDays)),
        durationDays: 1, priority: 'Medium', status: a.status,
        score: a.score ?? null,
        startedAt: a.status === 'planned' ? null : ago(elapsed),
        completedAt: a.score != null ? ago(elapsed) : null,
        closedAt: a.status === 'closed' ? ago(Math.max(0, elapsed - 2)) : null,
        createdBy: DEMO_MARK,
      },
    })
    await db.auditEvent.create({
      data: { auditId: audit.id, action: 'Audit scheduled', detail: a.title, actor: a.lead, at: ago(elapsed + 3) },
    })

    for (const f of a.findings ?? []) {
      // The action comes first: a finding without an owned action is a note, and the
      // schema makes the relation required precisely so an audit cannot close on notes.
      const action = await db.correctiveAction.create({
        data: {
          code: `CA-${await nextRef(companyId, 'capa', 401)}`,
          source: 'audit', companyId, siteId: a.site,
          title: f.action,
          detail: `Raised from ${audit.code} — ${f.description}`,
          owner: f.owner,
          dueDate: utcDay(ahead(f.settled ? -(elapsed - 4) : 8)),
          priority: f.severity === 'Major' || f.severity === 'Critical' ? 'High' : 'Medium',
          status: f.settled ? 'verified' : 'open',
          completedAt: f.settled ? ago(Math.max(1, elapsed - 4)) : null,
          evidenceNote: f.settled ? 'Completed and photographed; closed out with the lead auditor.' : null,
          verifiedBy: f.settled ? a.lead : null,
          verifiedAt: f.settled ? ago(Math.max(1, elapsed - 3)) : null,
          createdBy: DEMO_MARK,
        },
      })
      await db.auditFinding.create({
        data: {
          code: `F-${await nextRef(companyId, 'finding', 3110)}`,
          auditId: audit.id,
          category: f.category,
          description: f.description,
          severity: f.severity,
          actionId: action.id,
          raisedBy: a.lead,
          raisedAt: ago(elapsed),
        },
      })
      await db.auditEvent.create({
        data: { auditId: audit.id, action: 'Finding raised', detail: `${f.severity} · ${f.category}`, actor: a.lead, at: ago(elapsed) },
      })
    }
  }
}

async function seedTraining(companyId: CompanyId): Promise<number> {
  const roster = await db.employee.findMany({
    where: { companyId, active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (roster.length === 0) return 0

  let issued = 0
  for (const [p, employee] of roster.entries()) {
    const required = TRAINING_COURSES.filter((c) => courseApplies(c, employee.department))

    for (const [c, course] of required.entries()) {
      // A deterministic spread, so the matrix looks like a real workforce rather than a
      // grid of ticks: a couple of outright gaps, a couple of lapses, a renewal wave,
      // and everyone else in date. The moduli are coprime with the roster size so the
      // gaps scatter instead of lining up in a column.
      const gap = (p * 7 + c * 3) % 23 === 0
      if (gap) continue

      const lapsed = (p * 5 + c * 11) % 17 === 0
      const renewingSoon = (p + c * 2) % 6 === 0

      const validity = course.validityMonths ?? 24
      const expiresInDays = lapsed ? -(10 + (p % 40)) : renewingSoon ? 25 + (c * 9) % 60 : 150 + ((p * 13 + c * 29) % 400)
      const issueDate = utcDay(ago(validity * 30 - expiresInDays))
      const number = await nextCertificateNumber(issueDate)

      await db.certificate.create({
        data: {
          number,
          qrKey: number,
          employeeId: employee.id,
          companyId,
          courseId: course.id,
          courseName: course.name,
          issueDate,
          expiryDate: utcDay(ahead(expiresInDays)),
          issuedBy: 'Marcus Tan',
          score: course.passMark + ((p * 3 + c * 7) % (100 - course.passMark)),
          // Provenance for the reset. Not rendered anywhere in the product.
          docName: DEMO_MARK,
        },
      })
      issued++
    }
  }

  const s = SESSIONS[companyId]
  await db.trainingSession.create({
    data: {
      code: `SES-${await nextRef(companyId, 'session', 505)}`,
      companyId, siteId: s.site,
      courseId: s.courseId, courseName: s.courseName,
      trainer: s.trainer, venue: s.venue, mode: 'physical',
      scheduledFor: utcDay(ahead(s.inDays)),
      durationHours: 4, maxParticipants: s.seats,
      createdBy: DEMO_MARK,
      enrolments: { create: roster.slice(0, Math.min(6, roster.length)).map((e) => ({ employeeId: e.id })) },
    },
  })

  return issued
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const doReset = process.argv.includes('--reset')
  const tidyOnly = process.argv.includes('--tidy')
  console.log('\nSafeOps pilot demo dataset\n')

  for (const id of COMPANIES) {
    if (!(await db.company.findUnique({ where: { id }, select: { id: true } }))) {
      console.error(`Workspace "${id}" does not exist. Run the base seed first:  npm run seed`)
      process.exit(1)
    }
  }

  await tidy()
  if (tidyOnly) return
  if (doReset) await reset()

  if ((await db.asset.count({ where: { createdBy: DEMO_MARK } })) > 0) {
    console.log('The demo dataset is already loaded. Use `npm run demo:reset` to rebuild it.\n')
    return
  }

  for (const companyId of COMPANIES) {
    const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } })
    const incidentIds = await seedIncidents(companyId)
    await seedActions(companyId, incidentIds)
    await seedAssets(companyId)
    await seedPermits(companyId)
    await seedCompliance(companyId)
    await seedAudits(companyId)
    await seedTraining(companyId)

    // Counted back out of the database rather than off the specs above. A summary that
    // reports what the script *meant* to write hides exactly the bug worth catching.
    const w = { companyId }
    const [incidents, actions, assets, permits, audits, obligations, documents, certificates] =
      await Promise.all([
        db.incident.count({ where: { ...w, archived: false } }),
        db.correctiveAction.count({ where: w }),
        db.asset.count({ where: w }),
        db.permit.count({ where: w }),
        db.audit.count({ where: w }),
        db.complianceObligation.count({ where: w }),
        db.complianceDocument.count({ where: w }),
        db.certificate.count({ where: w }),
      ])

    console.log(
      `${company.name} (${companyId})\n` +
      `  ${incidents} incidents · ${actions} actions · ${assets} assets · ${permits} permits · ` +
      `${audits} audits · ${obligations} obligations · ${documents} documents · ` +
      `${certificates} certificates`,
    )
  }

  console.log('\nReady. Sign in as hse@demo.safeops.app / SafeOpsPlatform2026\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
