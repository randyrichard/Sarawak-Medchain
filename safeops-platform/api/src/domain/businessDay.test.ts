import { describe, expect, it } from 'vitest'
import { dateOf, endOfLocalDate, endOfLocalDateString, startOfLocalDateString, localDaysBetween, localMidnight, localMonthKey, startOfLocalDay, startOfLocalMonth, todayDate } from './businessDay.js'

const K = 'Asia/Kuching' // UTC+8, no daylight saving
const iso = (d: Date) => d.toISOString()

describe('business day - Malaysia', () => {
  it('rolls the date over at local midnight, not at 08:00', () => {
    // 07:30 on 5 March in Kuching is 23:30 UTC on 4 March. The old UTC day said the 4th.
    const early = new Date('2026-03-04T23:30:00Z')
    expect(iso(todayDate(early, K))).toBe('2026-03-05T00:00:00.000Z')
    // 23:30 on 5 March local is 15:30 UTC the same day.
    expect(iso(todayDate(new Date('2026-03-05T15:30:00Z'), K))).toBe('2026-03-05T00:00:00.000Z')
    // 00:00 on 6 March local.
    expect(iso(todayDate(new Date('2026-03-05T16:00:00Z'), K))).toBe('2026-03-06T00:00:00.000Z')
  })

  it('puts local midnight at 16:00 UTC the day before', () => {
    expect(iso(localMidnight(2026, 2, 5, K))).toBe('2026-03-04T16:00:00.000Z')
    expect(iso(startOfLocalDay(new Date('2026-03-04T23:30:00Z'), K))).toBe('2026-03-04T16:00:00.000Z')
  })

  it('starts a month at local midnight on the 1st, overflowing into the next year', () => {
    expect(iso(startOfLocalMonth(2026, 2, K))).toBe('2026-02-28T16:00:00.000Z')
    expect(iso(startOfLocalMonth(2026, 12, K))).toBe('2026-12-31T16:00:00.000Z')
    expect(iso(startOfLocalMonth(2026, -1, K))).toBe('2025-11-30T16:00:00.000Z')
  })

  it('counts an incident at 02:00 on the 1st in that month', () => {
    const t = new Date('2026-02-28T18:00:00Z') // 02:00 on 1 March local
    expect(localMonthKey(t, K)).toBe('2026-03')
    expect(t >= startOfLocalMonth(2026, 2, K)).toBe(true)
  })

  it('treats anything on the due date, locally, as on time', () => {
    const due = new Date('2026-03-05T00:00:00Z') // date-only "5 March"
    expect(iso(endOfLocalDate(due, K))).toBe('2026-03-05T15:59:59.999Z')
    expect(new Date('2026-03-05T15:30:00Z') <= endOfLocalDate(due, K)).toBe(true) // 23:30 local on the 5th
    expect(new Date('2026-03-05T16:30:00Z') <= endOfLocalDate(due, K)).toBe(false) // 00:30 local on the 6th
  })

  it('reads a date-only value back as the same date', () => {
    expect(iso(dateOf(new Date('2026-03-05T00:00:00Z'), K))).toBe('2026-03-05T00:00:00.000Z')
  })

  it('counts local calendar days between two moments', () => {
    // 23:00 on the 4th to 01:00 on the 5th, locally: one day apart, though only 2 hours.
    expect(localDaysBetween(new Date('2026-03-04T15:00:00Z'), new Date('2026-03-04T17:00:00Z'), K)).toBe(1)
  })
})

describe('typed date filters', () => {
  it('reads "1 to 31 March" as local midnight to local midnight, not 08:00 to 08:00', () => {
    expect(iso(startOfLocalDateString('2026-03-01', K))).toBe('2026-02-28T16:00:00.000Z')
    expect(iso(endOfLocalDateString('2026-03-31', K))).toBe('2026-03-31T15:59:59.999Z')
  })
})

describe('business day - a zone with daylight saving', () => {
  const L = 'Europe/London'
  it('finds midnight on both sides of a clock change', () => {
    expect(iso(localMidnight(2026, 2, 29, L))).toBe('2026-03-29T00:00:00.000Z') // GMT, clocks go forward at 01:00
    expect(iso(localMidnight(2026, 2, 30, L))).toBe('2026-03-29T23:00:00.000Z') // BST
    expect(iso(localMidnight(2026, 9, 25, L))).toBe('2026-10-24T23:00:00.000Z') // BST; clocks go back at 02:00
    expect(iso(localMidnight(2026, 9, 26, L))).toBe('2026-10-26T00:00:00.000Z') // GMT again
    expect(iso(todayDate(new Date('2026-07-01T23:30:00Z'), L))).toBe('2026-07-02T00:00:00.000Z')
  })
})
