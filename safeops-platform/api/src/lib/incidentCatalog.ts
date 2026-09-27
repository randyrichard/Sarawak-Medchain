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

/**
 * How the reports count injuries, lost time and near misses - the same rule the incident
 * board applies, in one place.
 *
 * The monthly report counted by type alone, against the pre-split scale ('first_aid',
 * 'lti' ...). Every incident reported since the split carries type 'injury' and says how
 * bad it was in severity, so a month of new lost-time injuries reported "Injuries 0, Lost
 * time 0" while the board beside it counted them. The legacy types still count, because
 * rows reported under the old scale still happened.
 */
const LEGACY_INJURY_TYPES = ['first_aid', 'mtc', 'rwc', 'lti', 'fatality']
const INJURY_SEVERITIES: string[] = ['medical_treatment', 'restricted_work', 'lost_time_injury', 'fatality', 'catastrophic']
type Counted = { type: string; severity: string }

export const isInjury = (i: Counted) =>
  i.type === 'injury' || LEGACY_INJURY_TYPES.includes(i.type) || INJURY_SEVERITIES.includes(i.severity)
export const isLostTime = (i: Counted) =>
  (LOST_TIME_SEVERITIES as string[]).includes(i.severity) || i.type === 'lti' || i.type === 'fatality'
export const isNearMiss = (i: Counted) => i.severity === 'near_miss' || i.type === 'near_miss'

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

/**
 * How a stage reads in a document. Reports printed "rca" and "closed" - the column values -
 * in the table a customer hands to their client, where the web app has always said "Root
 * Cause Analysis" and "Closed". Same words as web/src/api/incidents.ts.
 */
const STAGE_LABEL: Record<string, string> = {
  reported: 'Reported',
  assessment: 'Initial Assessment',
  investigation: 'Investigation',
  rca: 'Root Cause Analysis',
  actions: 'Corrective Actions',
  review: 'Manager Review',
  verification: 'Verification',
  closed: 'Closed',
  draft: 'Draft',
}

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage.replace(/_/g, ' ')
}

/**
 * Labels as a document prints them.
 *
 * The catalogue marks superseded values "(legacy)" so the product can steer new reports
 * away from them. That note is for the people configuring SafeOps, not for a client
 * reading an incident summary - "Critical (legacy)" on a customer's document reads as a
 * defect in the document. A value the catalogue does not know is shown in words rather
 * than as its code ("unsafe_condition" -> "Unsafe condition").
 */
export const humanize = (v: string) => {
  const t = v.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const dropLegacy = (label: string) => label.replace(/\s*\(legacy\)$/i, '')
export const typeName = (v: string) => dropLegacy((TYPE_LABEL as Record<string, string>)[v] ?? humanize(v))
export const severityName = (v: string) => dropLegacy((SEVERITY_LABEL as Record<string, string>)[v] ?? humanize(v))

/**
 * A date as a document prints it: "30 Sept 2026". Tables printed ISO dates ("2026-09-30")
 * beneath a header reading "27 Sept 2026, 17:04" - two formats on one page. Due dates are
 * stored as UTC midnight, so they format in UTC; an instant passes its site's zone.
 */
export const docDate = (d: Date, timeZone = 'UTC') =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(d)
