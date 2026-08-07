import type { IncidentSeverity, IncidentType } from '@prisma/client'

/**
 * Incident classification.
 *
 * The authoritative copy. The web app mirrors the labels; the server validates against
 * this, so a client that submits an invented type is rejected rather than recorded.
 *
 * Both lists carry legacy values. Postgres enums are append-only and thousands of rows
 * already carry the old scale - a first-aid case reported last year is still a first-aid
 * case, and rewriting history to fit a new taxonomy would be a lie. Legacy values are
 * marked so the report forms stop offering them while the register still renders them.
 */

export interface Classification<T extends string> {
  value: T
  label: string
  /** Kept for existing rows; not offered on new reports. */
  legacy?: boolean
  hint?: string
}

export const INCIDENT_TYPES: Classification<IncidentType>[] = [
  { value: 'injury', label: 'Injury' },
  { value: 'near_miss', label: 'Near Miss', hint: 'No harm, but it could have gone otherwise' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'fire', label: 'Fire' },
  { value: 'chemical_spill', label: 'Chemical Spill' },
  { value: 'unsafe_act', label: 'Unsafe Act' },
  { value: 'unsafe_condition', label: 'Unsafe Condition' },
  { value: 'security', label: 'Security' },
  { value: 'occupational_illness', label: 'Occupational Illness' },
  { value: 'equipment_failure', label: 'Equipment Failure' },
  // Outcome classifications that predate the type/severity split. They describe how badly
  // somebody was hurt, which is now severity's job.
  { value: 'first_aid', label: 'First Aid (legacy)', legacy: true },
  { value: 'mtc', label: 'Medical Treatment Case (legacy)', legacy: true },
  { value: 'rwc', label: 'Restricted Work Case (legacy)', legacy: true },
  { value: 'lti', label: 'Lost Time Injury (legacy)', legacy: true },
  { value: 'fatality', label: 'Fatality (legacy)', legacy: true },
]

/**
 * Severity, ordered least to most serious.
 *
 * Order matters: it drives the board, the escalation rules and "worst severity in scope".
 * Legacy values are placed at the rank they were understood to mean, so a historic
 * "Critical" still sorts above a "Minor" rather than falling off the scale.
 */
export const INCIDENT_SEVERITIES: Classification<IncidentSeverity>[] = [
  { value: 'near_miss', label: 'Near Miss' },
  { value: 'Minor', label: 'Minor' },
  { value: 'medical_treatment', label: 'Medical Treatment' },
  { value: 'restricted_work', label: 'Restricted Work Case' },
  { value: 'lost_time_injury', label: 'Lost Time Injury' },
  { value: 'environmental_major', label: 'Environmental Major' },
  { value: 'fatality', label: 'Fatality' },
  { value: 'catastrophic', label: 'Catastrophic' },
  { value: 'Moderate', label: 'Moderate (legacy)', legacy: true },
  { value: 'Serious', label: 'Serious (legacy)', legacy: true },
  { value: 'Critical', label: 'Critical (legacy)', legacy: true },
]

/** Rank, least to most serious. Legacy values sit at the rank they were taken to mean. */
export const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  near_miss: 0,
  Minor: 1,
  medical_treatment: 2,
  Moderate: 2,
  restricted_work: 3,
  Serious: 4,
  lost_time_injury: 5,
  environmental_major: 6,
  Critical: 6,
  fatality: 7,
  catastrophic: 8,
}

export const TYPE_LABEL: Record<IncidentType, string> =
  Object.fromEntries(INCIDENT_TYPES.map((t) => [t.value, t.label])) as Record<IncidentType, string>

export const SEVERITY_LABEL: Record<IncidentSeverity, string> =
  Object.fromEntries(INCIDENT_SEVERITIES.map((s) => [s.value, s.label])) as Record<IncidentSeverity, string>

/**
 * Severities that make an incident a recordable lost-time case.
 *
 * Named once here because three places count it - the board, the monthly figures and the
 * escalation rule - and three separate lists would eventually disagree about whether a
 * fatality counts as lost time. It does.
 */
export const LOST_TIME_SEVERITIES: IncidentSeverity[] = [
  'lost_time_injury', 'fatality', 'catastrophic',
]

/** Severities that oblige an investigation regardless of what anyone thinks of the event. */
export const MANDATORY_INVESTIGATION: IncidentSeverity[] = [
  'restricted_work', 'lost_time_injury', 'environmental_major',
  'fatality', 'catastrophic', 'Serious', 'Critical',
]

/**
 * Shift patterns and weather, offered as a picked list.
 *
 * Free text would make "night", "Night" and "nite" three different shifts, and the point
 * of recording them is to be able to count them.
 */
export const SHIFTS = ['Day', 'Night', 'Swing', 'Rotating', 'Office hours'] as const
export const WEATHER = [
  'Clear', 'Overcast', 'Light rain', 'Heavy rain', 'Storm', 'Haze', 'Night - poor light',
] as const

export const isLegacyType = (v: IncidentType) =>
  !!INCIDENT_TYPES.find((t) => t.value === v)?.legacy
export const isLegacySeverity = (v: IncidentSeverity) =>
  !!INCIDENT_SEVERITIES.find((s) => s.value === v)?.legacy
