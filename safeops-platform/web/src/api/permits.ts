// ─── Permit to Work domain ───────────────────────────────────────────────────
// A permit authorises high-risk work for a bounded window. The control that matters
// is the sequence: nobody starts until an approver has signed, and the permit closes
// only when the site is handed back. Expiring permits are the live safety risk, so
// they drive the board's ordering and the reminder sweep.

export const PERMIT_TYPES = [
  'hot_work', 'confined_space', 'working_at_height', 'electrical_isolation',
  'excavation', 'lifting_operation', 'line_breaking', 'radiography',
] as const
export type PermitType = (typeof PERMIT_TYPES)[number]

export const PERMIT_TYPE_LABEL: Record<PermitType, string> = {
  hot_work: 'Hot Work',
  confined_space: 'Confined Space Entry',
  working_at_height: 'Working at Height',
  electrical_isolation: 'Electrical Isolation',
  excavation: 'Excavation / Ground Disturbance',
  lifting_operation: 'Lifting Operation',
  line_breaking: 'Line Breaking',
  radiography: 'Radiography',
}

/** Maximum validity in hours per type — a permit must never outlive its risk assessment. */
export const PERMIT_MAX_HOURS: Record<PermitType, number> = {
  hot_work: 12,
  confined_space: 8,
  working_at_height: 12,
  electrical_isolation: 24,
  excavation: 24,
  lifting_operation: 12,
  line_breaking: 8,
  radiography: 12,
}

/**
 * Lifecycle. `draft → submitted → approved → active → closed`, with `rejected`,
 * `suspended` and `expired` as off-ramps. Work is legal only in `active`.
 */
export type PermitStatus =
  | 'draft' | 'submitted' | 'approved' | 'active'
  | 'suspended' | 'closed' | 'rejected' | 'expired'

export const PERMIT_STATUS_LABEL: Record<PermitStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting Approval',
  approved: 'Approved — Not Started',
  active: 'Work In Progress',
  suspended: 'Suspended',
  closed: 'Closed',
  rejected: 'Rejected',
  expired: 'Expired',
}

/** A control that must be confirmed before the permit can be issued. */
export interface PermitControl {
  id: string
  label: string
  /** Some controls are advisory; required ones block issue until confirmed. */
  required: boolean
  confirmed: boolean
  confirmedBy?: string
  confirmedAt?: string
  note?: string
}

/** An energy source locked out and tagged before work starts. */
export interface IsolationPoint {
  id: string
  description: string
  /** e.g. "LOTO-4471" — the physical lock/tag identifier. */
  tagId: string
  isolatedBy?: string
  isolatedAt?: string
  removedBy?: string
  removedAt?: string
}

/** Atmospheric test readings — confined space and hot work depend on these. */
export interface GasTest {
  id: string
  testedAt: string
  testedBy: string
  oxygenPct: number
  lelPct: number
  h2sPpm: number
  coPpm: number
  pass: boolean
  note?: string
}

export interface PermitSignature {
  role: 'applicant' | 'approver' | 'closer'
  name: string
  signedAt: string
  statement: string
}

export interface PermitEvent {
  id: string
  at: string
  actor: string
  /** The actor's role at the time. Optional: older rows predate it. */
  actorRole?: string
  action: string
  detail?: string
}

export interface Permit {
  id: string
  code: string // PTW-####
  type: PermitType
  title: string
  description: string

  companyId: string
  siteId: string
  department: string
  location: string

  /** Who is doing the work. */
  applicant: string
  contractor?: string
  workerCount: number

  /** Requested window. */
  validFrom: string // ISO
  validTo: string // ISO

  status: PermitStatus
  controls: PermitControl[]
  isolations: IsolationPoint[]
  gasTests: GasTest[]

  approver?: string
  approvedAt?: string
  rejectionReason?: string
  suspendedReason?: string

  closedBy?: string
  closedAt?: string
  /** Site handed back clean, tools removed, isolations released. */
  handbackConfirmed?: boolean

  /** Pre-start briefing. Null until it has been held. */
  toolboxAt?: string | null
  toolboxBy?: string | null
  /** Mandatory PPE, and the issuer's confirmation that it is actually on site. */
  requiredPpe?: string[]
  ppeAcknowledgedAt?: string | null
  ppeAcknowledgedBy?: string | null

  signatures: PermitSignature[]
  timeline: PermitEvent[]

  /** Set when a linked incident occurred under this permit. */
  linkedIncidentId?: string
  createdAt: string
}

/** Board/list view with the derived fields the UI needs. */
export interface PermitView extends Permit {
  /** Hours until validTo. Negative when overdue. */
  hoursRemaining: number
  /** True when active and inside the final hour — the operational alarm state. */
  expiringSoon: boolean
  /** Required controls still unconfirmed. */
  outstandingControls: number
  typeLabel: string
  statusLabel: string
}

/** The approval chain between submission and approval, as the server stores it. */
export type PermitReviewStage = 'supervisor_review' | 'hse_review' | 'area_authority'

export interface PermitFilters {
  q?: string
  siteId?: string | null
  type?: PermitType | ''
  /**
   * `awaiting` is submitted or anywhere in the approval chain; `expiring` is work in
   * progress whose window closes within seven days.
   */
  status?: PermitStatus | PermitReviewStage | 'all' | 'live' | 'awaiting' | 'expiring'
}

export interface PermitStats {
  activeNow: number
  awaitingApproval: number
  expiringWithin2h: number
  /** Anywhere in the approval chain, not just at submission. */
  awaitingReview: number
  suspended: number
  startingToday: number
  expiringToday: number
  /** People signed in to a confined space right now. */
  insideConfinedSpace: number
  expiredOpen: number
  closedThisMonth: number
  byType: { type: PermitType; label: string; active: number }[]
}

export interface NewPermitInput {
  type: PermitType
  title: string
  description: string
  companyId: string
  siteId: string
  department: string
  location: string
  applicant: string
  contractor?: string
  workerCount: number
  validFrom: string
  validTo: string
}

/**
 * Control checklists per permit type. These are the standard precautions a permit
 * issuer confirms on site — they are what makes the permit a control rather than
 * a form. Required items block issue.
 */
export const PERMIT_CONTROLS: Record<PermitType, { label: string; required: boolean }[]> = {
  hot_work: [
    { label: 'Combustible materials removed or protected within 11m', required: true },
    { label: 'Fire extinguisher and fire blanket at the work area', required: true },
    { label: 'Fire watch assigned for the duration and 60 min after', required: true },
    { label: 'Gas test completed — atmosphere below 10% LEL', required: true },
    { label: 'Drains, ducts and openings covered', required: true },
    { label: 'Sprinkler/detection isolation agreed with control room', required: false },
    { label: 'Welding screens erected', required: false },
  ],
  confined_space: [
    { label: 'Space isolated, drained, purged and ventilated', required: true },
    { label: 'Atmospheric test passed — O2 19.5–23.5%, LEL <10%, H2S <10ppm', required: true },
    { label: 'Continuous gas monitoring in place', required: true },
    { label: 'Standby attendant posted at entry point', required: true },
    { label: 'Rescue plan briefed and equipment on site', required: true },
    { label: 'Entry/exit log started', required: true },
    { label: 'Communication method confirmed with attendant', required: false },
  ],
  working_at_height: [
    { label: 'Scaffold/MEWP inspected and tagged within validity', required: true },
    { label: 'Fall arrest harness inspected, anchor point identified', required: true },
    { label: 'Exclusion zone barricaded below the work', required: true },
    { label: 'Tools secured against dropping', required: true },
    { label: 'Weather conditions assessed (wind, lightning)', required: true },
    { label: 'Rescue-at-height plan in place', required: false },
  ],
  electrical_isolation: [
    { label: 'Circuit identified and confirmed against drawings', required: true },
    { label: 'Isolated, locked and tagged at the source', required: true },
    { label: 'Proved dead with a tested instrument', required: true },
    { label: 'Earthing applied where required', required: true },
    { label: 'Stored energy discharged (capacitors, drives)', required: true },
    { label: 'Adjacent live parts screened', required: false },
  ],
  excavation: [
    { label: 'Underground services located and marked', required: true },
    { label: 'Excavation supported or battered to a safe angle', required: true },
    { label: 'Edge protection and access ladder in place', required: true },
    { label: 'Spoil kept clear of the excavation edge', required: true },
    { label: 'Atmospheric test for excavations deeper than 1.2m', required: false },
  ],
  lifting_operation: [
    { label: 'Lift plan approved and briefed to the crew', required: true },
    { label: 'Crane and rigging certificates valid', required: true },
    { label: 'Appointed person and banksman assigned', required: true },
    { label: 'Exclusion zone established, no personnel under load', required: true },
    { label: 'Ground conditions and outrigger loading checked', required: true },
    { label: 'Wind speed within the crane chart limit', required: false },
  ],
  line_breaking: [
    { label: 'Line identified, isolated and depressurised', required: true },
    { label: 'Line drained and flushed of hazardous contents', required: true },
    { label: 'Isolation verified by double block and bleed', required: true },
    { label: 'Appropriate PPE for the residual medium worn', required: true },
    { label: 'Spill containment and neutralising agent available', required: true },
    { label: 'Downwind exclusion zone set', required: false },
  ],
  radiography: [
    { label: 'Radiation area cordoned and signed', required: true },
    { label: 'Dosimeters issued to all personnel in the area', required: true },
    { label: 'Radiographer certification verified', required: true },
    { label: 'Source accounted for before and after exposure', required: true },
    { label: 'Adjacent work suspended during exposure', required: true },
    { label: 'Notification issued to all affected departments', required: false },
  ],
}

/** Types where a gas test is a precondition of issue. */
export const GAS_TEST_REQUIRED: PermitType[] = ['hot_work', 'confined_space', 'line_breaking']

/** Types where isolation points must be recorded. */
export const ISOLATION_REQUIRED: PermitType[] = ['electrical_isolation', 'line_breaking', 'confined_space']

/** Gas-test acceptance limits — the same thresholds referenced in the control text. */
export const GAS_LIMITS = {
  oxygenMin: 19.5,
  oxygenMax: 23.5,
  lelMax: 10,
  h2sMax: 10,
  coMax: 35,
}

export function gasTestPasses(t: Pick<GasTest, 'oxygenPct' | 'lelPct' | 'h2sPpm' | 'coPpm'>): boolean {
  return (
    t.oxygenPct >= GAS_LIMITS.oxygenMin &&
    t.oxygenPct <= GAS_LIMITS.oxygenMax &&
    t.lelPct < GAS_LIMITS.lelMax &&
    t.h2sPpm < GAS_LIMITS.h2sMax &&
    t.coPpm < GAS_LIMITS.coMax
  )
}
