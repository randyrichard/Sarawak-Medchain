import type { Role } from '@/api/types'
import type { Indicators, Target, TargetMetric } from '@/api/performanceApi'

/**
 * Who may record the hours the rates are divided by. Matches MAN_HOURS_ROLES on the server
 * (serverAgreement.test.ts holds the two together): the figure changes every rate on the
 * page, so it is owned by the people who sign the numbers off, not by everyone who reads them.
 */
export const canRecordManHours = (role: Role | null | undefined) => role === 'admin' || role === 'hse_manager'

/** A rate to two decimals - the precision DOSH JKKP 8 and OSHA logs are reported at. */
export function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatPercent(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${Math.round(v * 100)}%`
}

export function formatHours(v: number): string {
  return v.toLocaleString('en-MY')
}

/** "Jan 26" - short enough for twelve ticks on a phone. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/**
 * How trustworthy the denominator is, in words.
 *
 * Rates over estimated hours are still useful for comparing sites against each other, but
 * they are not what goes on a JKKP 8 return. Saying so on the page keeps an estimate from
 * being reported upwards as a measured figure.
 */
export function hoursBasis(t: Pick<Indicators, 'hours' | 'estimatedShare'>): { label: string; estimated: boolean } {
  if (t.hours === 0) return { label: 'No hours recorded or estimated', estimated: true }
  if (t.estimatedShare === 0) return { label: 'All hours recorded', estimated: false }
  if (t.estimatedShare >= 0.995) return { label: 'All hours estimated from headcount', estimated: true }
  return { label: `${Math.round(t.estimatedShare * 100)}% of hours estimated from headcount`, estimated: true }
}

/** The month keys (YYYY-MM) of one year, up to and including `latest`. */
export function monthsOfYear(year: number, latest: string): string[] {
  const out: string[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    if (key > latest) break
    out.push(key)
  }
  return out
}

/**
 * Parses a typed hours figure. Empty means "clear it" (back to the estimate); anything
 * else must be a whole number, with thousands separators allowed because that is how
 * people copy it out of a payroll report.
 */
export function parseHours(input: string): { ok: true; hours: number | null } | { ok: false; error: string } {
  const s = input.replace(/[,\s]/g, '')
  if (s === '') return { ok: true, hours: null }
  if (!/^\d+$/.test(s)) return { ok: false, error: 'Enter whole hours, e.g. 21,450' }
  const n = Number(s)
  if (n > 50_000_000) return { ok: false, error: 'That is more than 50,000,000 hours - check the figure' }
  return { ok: true, hours: n }
}

/**
 * The indicators a target can be set for, in the order the page shows them, with the unit
 * a person types the target in. On-time closure is stored as a fraction (0.9) but typed
 * and shown as a percentage (90%), the way it is talked about.
 */
export const TARGET_DEFS: { metric: TargetMetric; label: string; direction: 'max' | 'min'; unit: 'rate' | 'count' | 'ratio' | 'percent'; hint: string }[] = [
  { metric: 'frequencyRate', label: 'LTI frequency rate', direction: 'max', unit: 'rate', hint: 'Lost-time injuries per 1M hours' },
  { metric: 'severityRate', label: 'Severity rate', direction: 'max', unit: 'rate', hint: 'Days lost per 1M hours' },
  { metric: 'incidenceRate', label: 'Incidence rate', direction: 'max', unit: 'rate', hint: 'LTIs per 1,000 workers' },
  { metric: 'trir', label: 'TRIR', direction: 'max', unit: 'rate', hint: 'Recordables per 200,000 hours' },
  { metric: 'fatalities', label: 'Fatalities', direction: 'max', unit: 'count', hint: 'Usually 0' },
  { metric: 'overdueActions', label: 'Overdue actions', direction: 'max', unit: 'count', hint: 'Open past their due date' },
  { metric: 'nearMissRatio', label: 'Near-miss ratio', direction: 'min', unit: 'ratio', hint: 'Near misses per recordable injury' },
  { metric: 'onTimeClosure', label: 'Actions closed on time', direction: 'min', unit: 'percent', hint: 'Share closed by the due date' },
]

const defOf = (metric: TargetMetric) => TARGET_DEFS.find((d) => d.metric === metric)!

/**
 * Whether a figure meets its target. Null when there is no target, or no figure to judge -
 * an unknown rate is neither on nor off target.
 */
export function targetStatus(value: number | null | undefined, target: Target | undefined): 'met' | 'missed' | null {
  if (!target || value === null || value === undefined) return null
  const met = target.direction === 'max' ? value <= target.value : value >= target.value
  return met ? 'met' : 'missed'
}

/** "≤ 0.50", "≥ 90%", "≥ 10:1", "≤ 0". */
export function formatTarget(t: Pick<Target, 'metric' | 'value' | 'direction'>): string {
  const sign = t.direction === 'max' ? '≤' : '≥'
  const unit = defOf(t.metric).unit
  const v = unit === 'percent' ? `${Math.round(t.value * 1000) / 10}%`
    : unit === 'ratio' ? `${t.value}:1`
    : unit === 'rate' ? formatRate(t.value)
    : String(t.value)
  return `${sign} ${v}`
}

/** The target as it is typed in the form: 90 for 90%, 0.5 for a rate. */
export function targetInput(t: Target | undefined): string {
  if (!t) return ''
  return defOf(t.metric).unit === 'percent' ? String(Math.round(t.value * 1000) / 10) : String(t.value)
}

/** Parses a typed target into the stored value. Empty clears it. */
export function parseTarget(metric: TargetMetric, input: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const s = input.trim().replace(/%$/, '').replace(/:1$/, '').trim()
  if (s === '') return { ok: true, value: null }
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'Enter a number of 0 or more' }
  const n = Number(s)
  const unit = defOf(metric).unit
  if (unit === 'percent') {
    if (n > 100) return { ok: false, error: 'A percentage is 100 or less' }
    return { ok: true, value: Math.round(n * 10) / 1000 }
  }
  if (unit === 'count' && !Number.isInteger(n)) return { ok: false, error: 'Enter a whole number' }
  if (n > 1_000_000) return { ok: false, error: 'That target is too large' }
  return { ok: true, value: n }
}

/**
 * Month keys as short, merged ranges: ["2026-01","2026-02","2026-03","2026-05"] reads
 * "Jan–Mar 26, May 26". A list of six separate months is harder to act on than one range.
 */
export function monthRanges(keys: string[]): string {
  const sorted = [...keys].sort()
  const idx = (k: string) => { const [y, m] = k.split('-').map(Number); return y * 12 + (m - 1) }
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    let j = i
    while (j + 1 < sorted.length && idx(sorted[j + 1]) === idx(sorted[j]) + 1) j++
    const sameYear = sorted[i].slice(0, 4) === sorted[j].slice(0, 4)
    const first = sameYear ? monthLabel(sorted[i]).split(' ')[0] : monthLabel(sorted[i])
    out.push(i === j ? monthLabel(sorted[i]) : `${first}–${monthLabel(sorted[j])}`)
    i = j
  }
  return out.join(', ')
}
