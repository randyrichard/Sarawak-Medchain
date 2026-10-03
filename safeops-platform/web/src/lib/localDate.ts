/**
 * The person's own calendar date, as "YYYY-MM-DD".
 *
 * `new Date().toISOString().slice(0, 10)` is the date in UTC, which in Malaysia is still
 * yesterday until 08:00: the calendars highlighted yesterday as "today", a calibration
 * recorded at 07:30 defaulted to yesterday's date, and the dashboard's "last 7 days" ended
 * yesterday. Use this for *today* and for any moment shown as a date. A stored date-only
 * value (a due date, an expiry) is already at UTC midnight and is read with the slice as
 * before - converting that one would shift it by a day west of UTC.
 */
export function localISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
