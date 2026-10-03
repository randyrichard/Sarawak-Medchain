/**
 * The business day - "today", "this month" - in the deployment's time zone.
 *
 * Every customer works in Malaysia (UTC+8), and the API used to roll days over at UTC
 * midnight, which is 08:00 on site. Before eight in the morning that made a permit starting
 * today "yesterday's", left an action due today not yet due, and put an incident at 02:00
 * on the 1st into the previous month's injury rates.
 *
 * Two kinds of value need two kinds of boundary, and mixing them up is the bug to avoid:
 *
 * - **Calendar dates** (due dates, expiry dates, a visit's date) are stored date-only, at
 *   UTC midnight of the date they mean, so `toISOString().slice(0, 10)` reads back the same
 *   day everywhere. Compare those with {@link todayDate}: today's *local* date, in that same
 *   UTC-midnight form.
 * - **Moments** (when an incident happened, when a permit starts) are real instants. Group
 *   those with {@link startOfLocalDay} / {@link startOfLocalMonth}: the instant of local
 *   midnight, which for Malaysia is 16:00 UTC the day before.
 *
 * The zone is APP_TIMEZONE (validated in env.ts), default Asia/Kuching. Read here directly
 * rather than through env.ts so this stays importable by unit tests that load no config.
 */
import { instantForLocal, localParts } from './localTime.js'

const DEFAULT_ZONE = 'Asia/Kuching'
export const businessTimeZone = () => process.env.APP_TIMEZONE || DEFAULT_ZONE

/*
 * The offset maths is localTime.ts - the scheduler has run on it, across time zones, since
 * scheduled reports shipped - so there is one implementation of it, not two.
 */
export { localParts }

/**
 * The instant at which the local wall clock reads `y-m-d 00:00` (month 0-based, and allowed
 * to overflow either way, as Date.UTC does).
 */
export function localMidnight(year: number, monthIndex: number, day: number, tz = businessTimeZone()): Date {
  return instantForLocal(year, monthIndex + 1, day, 0, 0, tz)
}

/** Today's local date, as a date-only value (UTC midnight of that date). For comparing with stored dates. */
export function todayDate(now = new Date(), tz = businessTimeZone()): Date {
  const p = localParts(now, tz)
  return new Date(Date.UTC(p.year, p.month - 1, p.day))
}

/** The local date an instant falls on, as a date-only value. */
export const dateOf = todayDate

/** The instant of local midnight at the start of the day containing `instant`. */
export function startOfLocalDay(instant = new Date(), tz = businessTimeZone()): Date {
  const p = localParts(instant, tz)
  return localMidnight(p.year, p.month - 1, p.day, tz)
}

/** The instant of local midnight on the 1st of a month (0-based, may overflow). */
export function startOfLocalMonth(year: number, monthIndex: number, tz = businessTimeZone()): Date {
  return localMidnight(year, monthIndex, 1, tz)
}

/** The last instant of a calendar date, locally: a due date is met by anything on that day. */
export function endOfLocalDate(date: Date, tz = businessTimeZone()): Date {
  return new Date(localMidnight(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, tz).getTime() - 1)
}

/** "YYYY-MM" of the local month an instant falls in. */
export function localMonthKey(instant: Date, tz = businessTimeZone()): string {
  const p = localParts(instant, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/** Whole local calendar days between two instants (not date-only values - subtract those directly). */
export function localDaysBetween(from: Date, to: Date, tz = businessTimeZone()): number {
  return Math.round((dateOf(to, tz).getTime() - dateOf(from, tz).getTime()) / 86_400_000)
}

/** A typed "YYYY-MM-DD" (a filter's from-date) as the instant that local day starts. */
export function startOfLocalDateString(ymd: string, tz = businessTimeZone()): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return localMidnight(y, m - 1, d, tz)
}

/** A typed "YYYY-MM-DD" (a filter's to-date) as the last instant of that local day. */
export function endOfLocalDateString(ymd: string, tz = businessTimeZone()): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(localMidnight(y, m - 1, d + 1, tz).getTime() - 1)
}

/**
 * The last `count` local calendar months, oldest first, ending with the current one: each
 * with its start and end instants and a short label ("Mar"). For month-by-month trends.
 */
export function recentLocalMonths(count: number, now = new Date(), tz = businessTimeZone()) {
  const today = todayDate(now, tz)
  const y = today.getUTCFullYear(), m = today.getUTCMonth()
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1)
    const start = startOfLocalMonth(y, m + offset, tz)
    const end = startOfLocalMonth(y, m + offset + 1, tz)
    const label = new Date(Date.UTC(y, m + offset, 15)).toLocaleDateString('en-MY', { month: 'short', timeZone: 'UTC' })
    return { start, end, label }
  })
}
