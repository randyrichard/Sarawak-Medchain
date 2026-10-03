import type { Role } from '@/api/types'
import type { Indicators } from '@/api/performanceApi'

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
