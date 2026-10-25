/**
 * Whether DOSH must be told about an incident, how soon, and on which form.
 *
 * The Occupational Safety and Health (Notification of Accident, Dangerous Occurrence,
 * Occupational Poisoning and Occupational Disease) Regulations 2004 - NADOPOD:
 *
 * - A death, a serious bodily injury (First Schedule) or a dangerous occurrence (Second
 *   Schedule) is notified to the nearest DOSH office immediately, by the quickest means
 *   available, and in writing on JKKP 6 within seven days.
 * - An accident that keeps the person from their normal work for more than four calendar
 *   days is reported on JKKP 6 within seven days.
 * - Occupational poisoning or an occupational disease (Third Schedule) is reported on
 *   JKKP 7 within seven days.
 *
 * Published guidance disagrees on whether JKKP 6's seven are working or calendar days, so
 * this counts calendar days, the earlier of the two readings. A deadline met early is met.
 *
 * The decision is a person's, and it is recorded with their name. A dangerous occurrence
 * can be a near miss with nobody hurt - a scaffold coming down - and a serious bodily
 * injury is a legal list, not a severity rating, so nothing here decides on its own. What
 * the record says (a fatality, someone off for five days) only ever asks the question.
 *
 * Pure functions with no database access, the same shape as the stage gate: the card
 * showing the deadline and the server refusing a bad record cannot disagree.
 */

import { dateOf } from './businessDay.js'

export const DOSH_CATEGORIES = [
  'death',
  'serious_bodily_injury',
  'over_four_days',
  'dangerous_occurrence',
  'occupational_poisoning',
  'occupational_disease',
  'not_notifiable',
] as const

export type DoshCategory = (typeof DOSH_CATEGORIES)[number]
export type DoshForm = 'JKKP 6' | 'JKKP 7'

export interface DoshRule {
  /** DOSH must be told at all. */
  notifiable: boolean
  /** Told at once by the quickest means (telephone, e-mail, in person), before the form. */
  immediate: boolean
  form: DoshForm | null
  /** Calendar days the written report is due within. */
  days: number
}

export const DOSH_RULES: Record<DoshCategory, DoshRule> = {
  death: { notifiable: true, immediate: true, form: 'JKKP 6', days: 7 },
  serious_bodily_injury: { notifiable: true, immediate: true, form: 'JKKP 6', days: 7 },
  dangerous_occurrence: { notifiable: true, immediate: true, form: 'JKKP 6', days: 7 },
  over_four_days: { notifiable: true, immediate: false, form: 'JKKP 6', days: 7 },
  occupational_poisoning: { notifiable: true, immediate: false, form: 'JKKP 7', days: 7 },
  occupational_disease: { notifiable: true, immediate: false, form: 'JKKP 7', days: 7 },
  not_notifiable: { notifiable: false, immediate: false, form: null, days: 0 },
}

export const DOSH_LABEL: Record<DoshCategory, string> = {
  death: 'Death',
  serious_bodily_injury: 'Serious bodily injury (First Schedule)',
  over_four_days: 'Off normal work for more than 4 days',
  dangerous_occurrence: 'Dangerous occurrence (Second Schedule)',
  occupational_poisoning: 'Occupational poisoning',
  occupational_disease: 'Occupational disease',
  not_notifiable: 'Not notifiable to DOSH',
}

/** Categories where the record has to say which schedule item it was. */
export const NEEDS_DETAIL: DoshCategory[] = ['serious_bodily_injury', 'dangerous_occurrence']

/** Categories whose seven days run from the diagnosis rather than the day of the event. */
export const CLOCK_FROM_DIAGNOSIS: DoshCategory[] = ['occupational_poisoning', 'occupational_disease']

const DAY = 86_400_000

// ── The question, asked from what the record already says ──────────────────────

export interface DoshFacts {
  type: string
  severity: string
  /** People recorded as injured, with the days they were off work where known. */
  injured: { daysLost: number | null }[]
}

export interface DoshSuggestion {
  /** A category the record points to, for the form to start on. Null when it cannot say. */
  category: DoshCategory | null
  /** True when somebody has to decide: the record points at something DOSH may need. */
  flagged: boolean
  /** Why, in words for the person deciding. */
  reason: string
}

const DEATH_SEVERITIES = ['fatality', 'catastrophic']
const TREATED_SEVERITIES = ['medical_treatment', 'restricted_work', 'Serious', 'Critical']
/** Events that can be a dangerous occurrence whether or not anybody was hurt. */
const OCCURRENCE_TYPES = ['fire', 'chemical_spill', 'equipment_failure', 'property_damage']

export function suggestDosh(f: DoshFacts): DoshSuggestion {
  if (DEATH_SEVERITIES.includes(f.severity) || f.type === 'fatality') {
    return {
      category: 'death', flagged: true,
      reason: 'The record says someone died. DOSH must be told at once, then on JKKP 6 within 7 days.',
    }
  }
  if (f.type === 'occupational_illness') {
    return {
      category: null, flagged: true,
      reason: 'Recorded as an occupational illness. If a doctor has diagnosed occupational poisoning or a disease on the Third Schedule, report it on JKKP 7 within 7 days of learning of the diagnosis.',
    }
  }
  const longest = Math.max(0, ...f.injured.map((p) => p.daysLost ?? 0))
  if (longest > 4) {
    return {
      category: 'over_four_days', flagged: true,
      reason: `An injured person was off work for ${longest} days - more than four. Report it on JKKP 6 within 7 days, unless the injury is on the First Schedule, which means telling DOSH at once.`,
    }
  }
  if (f.severity === 'lost_time_injury' || f.type === 'lti') {
    return {
      category: null, flagged: true,
      reason: 'A lost-time injury. If the person is kept from their normal work for more than four calendar days, or the injury is on the First Schedule, DOSH must be told.',
    }
  }
  if (TREATED_SEVERITIES.includes(f.severity) || f.type === 'mtc' || f.type === 'rwc') {
    return {
      category: null, flagged: true,
      reason: 'An injury that needed treatment. Check the First Schedule: a fracture, an amputation, loss of sight or hearing, or loss of consciousness is a serious bodily injury, and DOSH must be told at once.',
    }
  }
  if (OCCURRENCE_TYPES.includes(f.type) || f.severity === 'environmental_major') {
    return {
      category: null, flagged: true,
      reason: 'A fire, a release or a failure of plant can be a dangerous occurrence on the Second Schedule even when nobody is hurt - for example a scaffold over 5 metres collapsing. If it is, DOSH must be told at once.',
    }
  }
  return {
    category: null, flagged: false,
    reason: 'Nothing on the record points to a notifiable event. If this was a dangerous occurrence, record it here.',
  }
}

// ── Where the notification stands ─────────────────────────────────────────────

export interface DoshRecord {
  category: DoshCategory | null
  occurredAt: Date
  clockFrom: Date | null
  informedAt: Date | null
  submittedAt: Date | null
}

/**
 * - `decide`: the record points at something notifiable and nobody has decided yet.
 * - `unflagged`: nothing points at it and nobody has decided. No duty is shown as owed.
 * - `not_required`: a person recorded that DOSH need not be told, and why.
 * - `due` / `overdue`: notifiable, and the written report has not been sent.
 * - `submitted`: the written report is recorded as sent.
 */
export type DoshState = 'decide' | 'unflagged' | 'not_required' | 'due' | 'overdue' | 'submitted'

export interface DoshStatus {
  state: DoshState
  form: DoshForm | null
  /** Told at once is required for this category. */
  immediate: boolean
  /** Required at once, and not yet recorded as done. */
  immediateOutstanding: boolean
  /**
   * The last day the written report is due on, as "YYYY-MM-DD" in the site's zone. Given
   * while undecided too, for JKKP 6: the seven days run whether or not anybody decides.
   */
  dueDate: string | null
  /** Whole days from today to the due date; negative once it has passed. */
  daysLeft: number | null
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export function doshStatus(r: DoshRecord, flagged: boolean, now: Date, tz: string): DoshStatus {
  const rule = r.category ? DOSH_RULES[r.category] : null
  const today = dateOf(now, tz).getTime()
  const deadline = (days: number) => {
    const from = r.clockFrom ?? r.occurredAt
    const due = dateOf(from, tz).getTime() + days * DAY
    return { dueDate: ymd(new Date(due)), daysLeft: Math.round((due - today) / DAY) }
  }

  if (!rule) {
    if (!flagged) {
      return { state: 'unflagged', form: null, immediate: false, immediateOutstanding: false, dueDate: null, daysLeft: null }
    }
    return { state: 'decide', form: null, immediate: false, immediateOutstanding: false, ...deadline(7) }
  }
  if (!rule.notifiable) {
    return { state: 'not_required', form: null, immediate: false, immediateOutstanding: false, dueDate: null, daysLeft: null }
  }
  const immediateOutstanding = rule.immediate && !r.informedAt
  if (r.submittedAt) {
    return { state: 'submitted', form: rule.form, immediate: rule.immediate, immediateOutstanding, dueDate: deadline(rule.days).dueDate, daysLeft: null }
  }
  const d = deadline(rule.days)
  return {
    state: d.daysLeft < 0 ? 'overdue' : 'due',
    form: rule.form, immediate: rule.immediate, immediateOutstanding, ...d,
  }
}

// ── What a saved record must contain ──────────────────────────────────────────

export interface DoshInput {
  category: DoshCategory
  detail?: string | null
  notRequiredReason?: string | null
  clockFrom?: Date | null
  informedAt?: Date | null
  informedHow?: string | null
  office?: string | null
  submittedAt?: Date | null
  reference?: string | null
}

/** Slack for a phone whose clock runs a little fast. */
const CLOCK_SKEW_MS = 5 * 60_000

/**
 * Why a DOSH record would be refused, in words for the person entering it, or null.
 *
 * A "not notifiable" with no reason is refused for the same reason a stage gate refuses an
 * empty closing note: the register has to show that the question was asked and answered,
 * not skipped. A date in the future, or before the event happened, is a typing slip.
 */
export function doshProblem(input: DoshInput, ctx: { occurredAt: Date; now: Date }): string | null {
  const rule = DOSH_RULES[input.category]
  if (!rule) return 'Choose why DOSH must, or need not, be told.'
  if (input.category === 'not_notifiable' && (input.notRequiredReason?.trim().length ?? 0) < 10) {
    return 'Say why DOSH need not be told. The record should show the question was answered, not skipped.'
  }
  if (NEEDS_DETAIL.includes(input.category) && !input.detail?.trim()) {
    return input.category === 'serious_bodily_injury'
      ? 'Say which First Schedule injury it was, for example a fracture or loss of consciousness.'
      : 'Say which dangerous occurrence it was, for example the collapse of a scaffold.'
  }
  if (!rule.notifiable && (input.informedAt || input.submittedAt || input.reference?.trim())) {
    return 'A notification to DOSH cannot be recorded for an incident marked not notifiable.'
  }
  const earliest = ctx.occurredAt.getTime() - DAY
  const latest = ctx.now.getTime() + CLOCK_SKEW_MS
  const dates: [string, Date | null | undefined][] = [
    ['The date DOSH was told', input.informedAt],
    ['The date the form was sent', input.submittedAt],
    ['The date of diagnosis', input.clockFrom],
  ]
  for (const [what, d] of dates) {
    if (!d) continue
    if (Number.isNaN(d.getTime())) return `${what} is not a valid date.`
    if (d.getTime() > latest) return `${what} is in the future.`
    if (d.getTime() < earliest) return `${what} is before the incident happened.`
  }
  if (input.clockFrom && !CLOCK_FROM_DIAGNOSIS.includes(input.category)) {
    return 'A diagnosis date only applies to occupational poisoning or disease.'
  }
  return null
}
