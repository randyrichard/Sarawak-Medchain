/**
 * When a schedule is next owed, in the timezone somebody actually works in.
 *
 * Kept separate from the service so it can be tested without a database. Every bug this
 * module can have is a date bug, and date bugs are invisible until a customer says the
 * Monday report arrived on Sunday.
 *
 * The rule: the schedule names a local wall-clock moment ("Monday 08:00 in Asia/Kuching")
 * and this converts that to the instant it happens. Storing the instant instead would be
 * wrong the moment a zone changes its offset.
 */
export type Frequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduleShape {
  frequency: Frequency
  /** ISO weekday, 1 = Monday. Only read for the weekly frequency. */
  dayOfWeek: number
  /** HH:mm, local to `timezone`. */
  timeOfDay: string
  timezone: string
}

/** Parses HH:mm, refusing anything that is not a real time of day. */
export function parseTimeOfDay(v: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

/** Whether the runtime recognises the zone. An unknown zone must not silently become UTC. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * The offset of a zone at a given instant, in minutes.
 *
 * Derived by asking Intl what the wall clock reads there and comparing. Doing it this way
 * rather than with a fixed +08:00 means a zone that observes daylight saving stays correct
 * without a timezone database of our own.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>

  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

/** The wall-clock calendar fields a zone is showing at an instant. */
export function localParts(instant: Date, timeZone: string) {
  const shifted = new Date(instant.getTime() + offsetMinutes(instant, timeZone) * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    /** ISO weekday, 1 = Monday. */
    weekday: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(),
  }
}

/**
 * The instant at which a given local wall-clock time occurs in a zone.
 *
 * Applied twice: the offset itself depends on the instant, so the first pass gives an
 * approximate instant and the second corrects it. That second pass is what keeps a
 * schedule right across a daylight-saving boundary.
 */
function instantForLocal(
  y: number, mo: number, d: number, h: number, mi: number, timeZone: string,
): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0)
  let guess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000)
  guess = new Date(naive - offsetMinutes(guess, timeZone) * 60_000)
  return guess
}

/**
 * The next instant this schedule is owed, strictly after `after`.
 *
 * Strictly after, so a run does not immediately re-arm itself at the same moment and fire
 * twice. Returns null when the schedule cannot be understood, which the caller treats as a
 * configuration error rather than "due now".
 */
export function nextRunAt(s: ScheduleShape, after: Date): Date | null {
  const time = parseTimeOfDay(s.timeOfDay)
  if (!time || !isValidTimezone(s.timezone)) return null

  const start = localParts(after, s.timezone)

  // Walk forward day by day from the local date of `after`. Bounded at 400 so a
  // misconfiguration cannot spin: the longest legitimate gap is a monthly schedule.
  for (let i = 0; i <= 400; i++) {
    const probe = new Date(Date.UTC(start.year, start.month - 1, start.day + i))
    const y = probe.getUTCFullYear()
    const mo = probe.getUTCMonth() + 1
    const d = probe.getUTCDate()
    const weekday = probe.getUTCDay() === 0 ? 7 : probe.getUTCDay()

    if (s.frequency === 'weekly' && weekday !== s.dayOfWeek) continue
    // Monthly runs on the same day-of-month as dayOfWeek is not meaningful, so it runs on
    // the 1st: a monthly safety report is about the month, not about a weekday.
    if (s.frequency === 'monthly' && d !== 1) continue

    const candidate = instantForLocal(y, mo, d, time.hour, time.minute, s.timezone)
    if (candidate.getTime() > after.getTime()) return candidate
  }
  return null
}

/**
 * A stable identifier for the slot a schedule is firing for.
 *
 * The unique key that makes execution idempotent. Built from the local calendar date and
 * time, so the same Monday 08:00 produces the same string however many times the sweep
 * runs, and a different one next week.
 */
export function dueSlotKey(s: ScheduleShape, due: Date): string {
  const p = localParts(due, s.timezone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}@${s.timezone}`
}

/** A human sentence for the schedule, for the list and the dialog. */
export function describeSchedule(s: ScheduleShape): string {
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const at = `${s.timeOfDay} ${s.timezone}`
  if (s.frequency === 'daily') return `Every day at ${at}`
  if (s.frequency === 'monthly') return `On the 1st of each month at ${at}`
  return `Every ${days[s.dayOfWeek] ?? 'Monday'} at ${at}`
}
