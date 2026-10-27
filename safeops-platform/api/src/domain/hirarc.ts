/**
 * Risk assessment as the DOSH Guidelines for Hazard Identification, Risk Assessment and
 * Risk Control (HIRARC, 2008) set it out.
 *
 * Risk is likelihood times severity, each rated 1 to 5, and the product falls in one of
 * three bands: 15-25 high, 5-12 medium, 1-4 low. A high risk needs immediate action, a
 * medium one a planned approach, and for both the actions and their date for completion are
 * recorded; a low risk may be acceptable as it is. The scale descriptions are the
 * guideline's own, lightly copy-edited. Pure: no database, no clock, so the rules are tested
 * on their own (hirarc.test.ts).
 */

export interface RatingStep {
  value: number
  label: string
  description: string
}

/** Table 1 of the guideline, most likely first, as the form lays it out. */
export const LIKELIHOOD: RatingStep[] = [
  { value: 5, label: 'Most Likely', description: 'The most likely result of the hazard or event being realised.' },
  { value: 4, label: 'Possible', description: 'Has a good chance of occurring and is not unusual.' },
  { value: 3, label: 'Conceivable', description: 'Might occur at some time in the future.' },
  { value: 2, label: 'Remote', description: 'Has not been known to occur after many years.' },
  { value: 1, label: 'Inconceivable', description: 'Is practically impossible and has never occurred.' },
]

/** Table 2 of the guideline. */
export const SEVERITY: RatingStep[] = [
  { value: 5, label: 'Catastrophic', description: 'Numerous fatalities, irrecoverable property damage and loss of productivity.' },
  { value: 4, label: 'Fatal', description: 'Approximately one fatality; major property damage if the hazard is realised.' },
  { value: 3, label: 'Serious', description: 'Non-fatal injury, permanent disability.' },
  { value: 2, label: 'Minor', description: 'Disabling but not permanent injury.' },
  { value: 1, label: 'Negligible', description: 'Minor abrasions, bruises, cuts: a first-aid type injury.' },
]

export type RiskLevel = 'low' | 'medium' | 'high'

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' }

/** What each band asks for, from the guideline's risk table. */
export const RISK_ACTION: Record<RiskLevel, string> = {
  high: 'Act now to control the hazard, following the hierarchy of control. Record the actions and their date for completion.',
  medium: 'Plan how to control the hazard, with temporary measures if they are needed. Record the actions and their date for completion.',
  low: 'May be acceptable as it is. If it can be resolved quickly and efficiently, put the control in place and record it.',
}

export const riskScore = (likelihood: number, severity: number) => likelihood * severity

/** 15-25 high, 5-12 medium, 1-4 low. No product of two ratings falls between the bands. */
export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return 'high'
  if (score >= 5) return 'medium'
  return 'low'
}

const isRating = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5

export const LIMITS = { activity: 200, hazard: 300, effect: 300, controls: 2000, person: 120, reason: 500 } as const

/** How long after an assessment its review falls due when nobody says otherwise. */
export const DEFAULT_REVIEW_MONTHS = 12
/** A review further out than this is a typing slip (2062 for 2026), not a plan. */
export const MAX_REVIEW_YEARS = 5

export interface HirarcFields {
  activity: string
  hazard: string
  effect: string
  existingControls: string
  likelihood: number
  severity: number
  additionalControls: string
  owner: string
  /** "YYYY-MM-DD" or null. */
  controlsDue: string | null
  residualLikelihood: number | null
  residualSeverity: number | null
  assessedBy: string
  /** "YYYY-MM-DD". */
  assessedOn: string
  /** "YYYY-MM-DD". */
  reviewDue: string
}

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

/** "YYYY-MM-DD" plus whole months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10)
}

/**
 * Why a row cannot be saved, in words, or null.
 *
 * `today` is the business day ("YYYY-MM-DD"), passed in so the rule stays pure. Nothing here
 * insists that a medium or high risk has its further controls yet: a hazard is often written
 * down before anyone has decided what to do about it, and refusing it would keep it off the
 * register. The register says what each row still needs instead (hirarcAttention).
 */
export function hirarcProblem(f: HirarcFields, today: string): string | null {
  if (!f.activity.trim()) return 'Name the work activity.'
  if (!f.hazard.trim()) return 'Name the hazard.'
  if (!f.effect.trim()) return 'Say what the hazard can cause.'
  if (f.activity.length > LIMITS.activity) return `The work activity is at most ${LIMITS.activity} characters.`
  if (f.hazard.length > LIMITS.hazard) return `The hazard is at most ${LIMITS.hazard} characters.`
  if (f.effect.length > LIMITS.effect) return `What it can cause is at most ${LIMITS.effect} characters.`
  if (f.existingControls.length > LIMITS.controls || f.additionalControls.length > LIMITS.controls) {
    return `Controls are at most ${LIMITS.controls} characters.`
  }
  if (f.owner.length > LIMITS.person || f.assessedBy.length > LIMITS.person) return `A name is at most ${LIMITS.person} characters.`
  if (!f.assessedBy.trim()) return 'Say who carried out the assessment.'

  if (!isRating(f.likelihood)) return 'Likelihood is rated 1 to 5.'
  if (!isRating(f.severity)) return 'Severity is rated 1 to 5.'

  const residual = [f.residualLikelihood, f.residualSeverity]
  if (residual.some((v) => v !== null)) {
    if (residual.some((v) => v === null)) return 'Rate both likelihood and severity once the controls are in place, or neither.'
    if (!isRating(f.residualLikelihood) || !isRating(f.residualSeverity)) return 'Likelihood and severity are rated 1 to 5.'
    if (!f.additionalControls.trim()) return 'Say what the recommended controls are before rating the risk once they are in place.'
    if (riskScore(f.residualLikelihood, f.residualSeverity) > riskScore(f.likelihood, f.severity)) {
      return 'The risk once the recommended controls are in place cannot be higher than the risk now.'
    }
  }

  for (const [label, day] of [['Assessment date', f.assessedOn], ['Review date', f.reviewDue]] as const) {
    if (!isDay(day)) return `${label} is not a date.`
  }
  if (f.assessedOn > today) return 'The assessment date is in the future.'
  if (f.reviewDue <= f.assessedOn) return 'The review date must be after the assessment.'
  if (f.reviewDue > addMonths(f.assessedOn, MAX_REVIEW_YEARS * 12)) {
    return `A review more than ${MAX_REVIEW_YEARS} years after the assessment is not a review. Choose a nearer date.`
  }
  if (f.controlsDue !== null) {
    if (!isDay(f.controlsDue)) return 'The date for completion is not a date.'
    if (!f.additionalControls.trim()) return 'Say what the recommended controls are, as well as when they are due.'
    if (f.controlsDue < f.assessedOn) return 'The date for completion is before the assessment.'
  }
  return null
}

/** Where a row's recommended controls stand, from the corrective actions raised for them. */
export type ControlsState = 'none' | 'planned' | 'in_progress' | 'done'

export interface ActionState {
  status: 'open' | 'in_progress' | 'completed' | 'verified' | 'cancelled'
}

export function controlsState(additionalControls: string, actions: ActionState[]): ControlsState {
  if (!additionalControls.trim()) return 'none'
  const live = actions.filter((a) => a.status !== 'cancelled')
  if (live.length === 0) return 'planned'
  return live.every((a) => a.status === 'completed' || a.status === 'verified') ? 'done' : 'in_progress'
}

export interface Attention {
  level: RiskLevel
  residualLevel: RiskLevel | null
  controls: ControlsState
  /** A medium or high risk with no further controls written down. */
  needsControls: boolean
  /** Further controls with no date for completion, for a medium or high risk. */
  needsDate: boolean
  controlsOverdue: boolean
  reviewOverdue: boolean
}

/** What the register says a row still needs. `today` is "YYYY-MM-DD". */
export function hirarcAttention(row: {
  riskScore: number
  residualScore: number | null
  additionalControls: string
  controlsDue: string | null
  reviewDue: string
  archived: boolean
}, actions: ActionState[], today: string): Attention {
  const level = riskLevel(row.riskScore)
  const controls = controlsState(row.additionalControls, actions)
  const live = !row.archived
  return {
    level,
    residualLevel: row.residualScore === null ? null : riskLevel(row.residualScore),
    controls,
    needsControls: live && level !== 'low' && controls === 'none',
    needsDate: live && level !== 'low' && controls !== 'none' && controls !== 'done' && row.controlsDue === null,
    controlsOverdue: live && row.controlsDue !== null && row.controlsDue < today && (controls === 'planned' || controls === 'in_progress'),
    reviewOverdue: live && row.reviewDue < today,
  }
}
