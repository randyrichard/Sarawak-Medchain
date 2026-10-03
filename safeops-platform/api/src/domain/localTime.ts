/**
 * Time-zone arithmetic with no dependencies: the wall clock a zone shows at an instant, and the
 * instant a zone shows a given wall clock. Moved here unchanged from lib/reportSchedule.ts, which
 * has scheduled reports on it across time zones since they shipped, so that domain code (the
 * business day in businessDay.ts) can use it without reaching into a service. reportSchedule
 * re-exports it, so its callers are unchanged.
 */

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
export function instantForLocal(
  y: number, mo: number, d: number, h: number, mi: number, timeZone: string,
): Date {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0)
  let guess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000)
  guess = new Date(naive - offsetMinutes(guess, timeZone) * 60_000)
  return guess
}
