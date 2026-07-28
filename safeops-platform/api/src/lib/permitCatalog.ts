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
}

export const PERMIT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Awaiting Approval',
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
}

/** Types where a gas test is a precondition of issue. */
export const GAS_TEST_REQUIRED: PermitType[] = ['hot_work', 'confined_space', 'line_breaking']

/** Types where isolation points must be recorded before issue. */
export const ISOLATION_REQUIRED: PermitType[] = ['electrical_isolation', 'line_breaking', 'confined_space']

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
