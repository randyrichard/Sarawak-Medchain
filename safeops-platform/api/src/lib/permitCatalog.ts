// ─── Permit catalogue ────────────────────────────────────────────────────────
// The precautions, duration limits and atmospheric thresholds that make a permit a
// control rather than a form.
//
// This is the authoritative copy. `web/src/api/permits.ts` carries the same values so
// the request dialog can preview the checklist and warn about an over-long window before
// a round trip, but the client copy is advisory only: every rule below is re-checked here
// before a permit is issued, so a tampered client changes what the user sees and nothing
// about what the server allows.

import type { PermitType } from '@prisma/client'

export const PERMIT_TYPES = [
  'hot_work', 'confined_space', 'working_at_height', 'electrical_isolation',
  'excavation', 'lifting_operation', 'line_breaking', 'radiography',
  'loto', 'cold_work', 'pressure_testing', 'vehicle_entry',
] as const satisfies readonly PermitType[]

export const PERMIT_TYPE_LABEL: Record<PermitType, string> = {
  hot_work: 'Hot Work',
  confined_space: 'Confined Space Entry',
  working_at_height: 'Working at Height',
  electrical_isolation: 'Electrical Isolation',
  excavation: 'Excavation / Ground Disturbance',
  lifting_operation: 'Lifting Operation',
  line_breaking: 'Line Breaking',
  radiography: 'Radiography',
  loto: 'Lockout / Tagout Isolation',
  cold_work: 'Cold Work',
  pressure_testing: 'Pressure Testing',
  vehicle_entry: 'Vehicle Entry',
}

export const PERMIT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Awaiting Approval',
  supervisor_review: 'With Supervisor',
  hse_review: 'With HSE',
  area_authority: 'With Area Authority',
  archived: 'Archived',
  approved: 'Approved — Not Started',
  active: 'Work In Progress',
  suspended: 'Suspended',
  closed: 'Closed',
  rejected: 'Rejected',
  expired: 'Expired',
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
  // A LOTO isolation often spans a shutdown; cold work and vehicle entry carry the least
  // acute risk and so get the longest windows.
  loto: 24,
  cold_work: 24,
  pressure_testing: 12,
  vehicle_entry: 24,
}

/**
 * Control checklists per permit type. These are the standard precautions a permit
 * issuer confirms on site. Required items block issue.
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
    // Subscripts are avoided in stored text on purpose. This string is written to the
    // database, and a Postgres cluster initialised under a Windows locale lands on
    // WIN1252, which has no U+2082 — the notation gas detectors and paper permits print
    // is "O2"/"H2S" anyway, so nothing is lost by matching them.
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
  loto: [
    { label: 'Energy sources identified and listed', required: true },
    { label: 'Isolation devices applied and locked', required: true },
    { label: 'Personal lock and tag applied by each worker', required: true },
    { label: 'Stored energy released (springs, hydraulics, capacitors)', required: true },
    { label: 'Zero-energy state verified by try-start', required: true },
    { label: 'Isolation register updated', required: false },
  ],
  cold_work: [
    { label: 'Work area inspected and access controlled', required: true },
    { label: 'Adjacent operations notified', required: true },
    { label: 'No ignition sources introduced', required: true },
    { label: 'Housekeeping and egress routes clear', required: false },
  ],
  pressure_testing: [
    { label: 'Test pressure and medium agreed and recorded', required: true },
    { label: 'Exclusion zone established and signed', required: true },
    { label: 'Relief device set below vessel rating', required: true },
    { label: 'Test equipment calibration in date', required: true },
    { label: 'Nobody in line with blind flanges or caps', required: true },
    { label: 'Depressurisation procedure agreed before start', required: false },
  ],
  vehicle_entry: [
    { label: 'Driver competency and licence verified', required: true },
    { label: 'Vehicle inspection completed and defect-free', required: true },
    { label: 'Spark arrestor fitted where required', required: true },
    { label: 'Route agreed and pedestrian segregation in place', required: true },
    { label: 'Banksman assigned for reversing', required: false },
  ],
}

/** Types where a gas test is a precondition of issue. */
export const GAS_TEST_REQUIRED: PermitType[] = ['hot_work', 'confined_space', 'line_breaking']

/** Types where isolation points must be recorded before issue. */
export const ISOLATION_REQUIRED: PermitType[] = ['electrical_isolation', 'line_breaking', 'confined_space']

/**
 * Types where the person who applied may not also issue the permit.
 *
 * Separation of duties. A permit to work is an authorisation given *to* someone *by*
 * somebody else who has independently checked the controls; one person doing both turns
 * the whole document into a self-declaration, and it is the first thing an auditor looks
 * for on a hot work permit.
 *
 * Deliberately not every type. A supervisor raising and issuing their own cold work or
 * working-at-height permit is normal practice on a small site, and a rule that blocked it
 * would be wrong for the customers this product is for - they would work around it by
 * sharing a login, which is worse than the thing the rule was protecting. So the
 * restriction covers the three where self-approval is genuinely indefensible: fire risk,
 * atmosphere risk, and radiation.
 *
 * Found by testing rather than by reading: the same account raised a permit and approved
 * it, and nothing objected.
 */
export const SEPARATE_APPROVER_REQUIRED: PermitType[] = ['hot_work', 'confined_space', 'radiography']

/** Gas-test acceptance limits — the same thresholds quoted in the control text. */
export const GAS_LIMITS = {
  oxygenMin: 19.5,
  oxygenMax: 23.5,
  lelMax: 10,
  h2sMax: 10,
  coMax: 35,
}

export function gasTestPasses(t: {
  oxygenPct: number; lelPct: number; h2sPpm: number; coPpm: number
}): boolean {
  return (
    t.oxygenPct >= GAS_LIMITS.oxygenMin &&
    t.oxygenPct <= GAS_LIMITS.oxygenMax &&
    t.lelPct < GAS_LIMITS.lelMax &&
    t.h2sPpm < GAS_LIMITS.h2sMax &&
    t.coPpm < GAS_LIMITS.coMax
  )
}

/**
 * Everything that must be true before a permit can go active, as sentences.
 *
 * Lives here rather than in either service because both need it: the review service
 * shows it on the permit so the issuer can see what is left, and the permit service
 * re-checks it at activation so it cannot be talked past. A pure function of the facts,
 * with no database access, so the two can never disagree.
 */
export function activationBlockers(p: {
  status: string
  toolboxAt: Date | null
  requiredPpe: string[]
  ppeAcknowledgedAt: Date | null
  attendees: number
  unacknowledged: number
  /**
   * Sentences for equipment booked onto the permit that is not fit for use, computed by
   * the equipment service. Passed in rather than looked up so this stays a pure function
   * of the facts and the two callers can never disagree.
   */
  equipment?: string[]
}): string[] {
  const out: string[] = []
  if (p.status !== 'approved') out.push('The permit has not completed the approval chain.')
  if (p.attendees === 0) out.push('Nobody is named on this permit.')
  if (!p.toolboxAt) out.push('The toolbox talk has not been recorded.')
  else if (p.unacknowledged > 0) {
    out.push(`${p.unacknowledged} of the people named have not acknowledged the toolbox talk.`)
  }
  if (p.requiredPpe.length > 0 && !p.ppeAcknowledgedAt) {
    out.push('Mandatory PPE has not been acknowledged by the issuer.')
  }
  out.push(...(p.equipment ?? []))
  return out
}

/**
 * Selectable PPE. A picked list rather than free text, so "harness" and "Harness" are
 * the same requirement and a permit pack can be checked for completeness.
 */
export const PPE_OPTIONS = [
  'Helmet', 'Safety Shoes', 'Gloves', 'Face Shield', 'Respirator', 'Harness',
  'Life Jacket', 'Gas Detector', 'SCBA', 'Hearing Protection', 'Other',
] as const
