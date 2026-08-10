import { describe, it, expect } from 'vitest'
import {
  describeSchedule, dueSlotKey, isValidTimezone, localParts, nextRunAt, parseTimeOfDay,
} from './reportSchedule.js'

/**
 * When a schedule is next owed.
 *
 * Every bug this module can have is a date bug, and date bugs are invisible until a
 * customer says the Monday report arrived on Sunday afternoon. A server in UTC and a site
 * in Kuching disagree by eight hours about when Monday morning is, which is exactly the
 * width of the mistake.
 *
 * No database needed: this is arithmetic over a zone.
 */
const KUCHING = 'Asia/Kuching'   // UTC+8, no daylight saving
const LONDON = 'Europe/London'   // UTC+0/+1, so it exercises a DST boundary

const weekly = (over: Record<string, unknown> = {}) => ({
  frequency: 'weekly' as const, dayOfWeek: 1, timeOfDay: '08:00', timezone: KUCHING, ...over,
})

describe('parseTimeOfDay', () => {
  it('accepts a real time of day', () => {
    expect(parseTimeOfDay('08:00')).toEqual({ hour: 8, minute: 0 })
    expect(parseTimeOfDay('23:59')).toEqual({ hour: 23, minute: 59 })
    expect(parseTimeOfDay('7:05')).toEqual({ hour: 7, minute: 5 })
  })

  it('refuses anything that is not one', () => {
    for (const bad of ['24:00', '08:60', '-1:00', '0800', '8', 'morning', '']) {
      expect(parseTimeOfDay(bad), bad).toBeNull()
    }
  })
})

describe('isValidTimezone', () => {
  it('recognises real zones and rejects invented ones', () => {
    expect(isValidTimezone(KUCHING)).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    // Must not silently fall back to UTC: in Sarawak that is an eight-hour error.
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})

describe('localParts', () => {
  it('reads the wall clock in the target zone, not the server zone', () => {
    // 2026-08-10T00:30Z is already 08:30 on Monday in Kuching.
    const p = localParts(new Date('2026-08-10T00:30:00Z'), KUCHING)
    expect(p).toMatchObject({ year: 2026, month: 8, day: 10, hour: 8, minute: 30, weekday: 1 })
  })

  it('rolls the date backwards when the zone is behind UTC midnight', () => {
    // Sunday 23:00 UTC is already Monday 07:00 in Kuching.
    expect(localParts(new Date('2026-08-09T23:00:00Z'), KUCHING).weekday).toBe(1)
    expect(localParts(new Date('2026-08-09T23:00:00Z'), 'UTC').weekday).toBe(7)
  })
})

describe('nextRunAt', () => {
  it('finds the next Monday 08:00 in Kuching, expressed as the right instant', () => {
    // Friday. The next Monday 08:00 in Kuching is 00:00 UTC on the Monday.
    const next = nextRunAt(weekly(), new Date('2026-08-07T10:00:00Z'))!
    expect(next.toISOString()).toBe('2026-08-10T00:00:00.000Z')
    expect(localParts(next, KUCHING)).toMatchObject({ weekday: 1, hour: 8, minute: 0 })
  })

  it('does not fire on Sunday afternoon UTC for a Monday Kuching schedule', () => {
    // The bug this whole module exists to prevent: treating 08:00 as UTC would make the
    // report due at 08:00Z Monday, which is 16:00 Monday in Kuching - or worse, a naive
    // local-time server would send it Sunday.
    const next = nextRunAt(weekly(), new Date('2026-08-09T12:00:00Z'))!
    expect(localParts(next, KUCHING).weekday).toBe(1)
    expect(next.getTime()).toBeGreaterThan(new Date('2026-08-09T12:00:00Z').getTime())
  })

  it('is strictly after the given instant, so a run cannot re-arm onto itself', () => {
    const due = nextRunAt(weekly(), new Date('2026-08-07T10:00:00Z'))!
    // Re-arming from exactly the moment it fired must give next week, not the same instant.
    const after = nextRunAt(weekly(), due)!
    expect(after.getTime()).toBeGreaterThan(due.getTime())
    expect(after.getTime() - due.getTime()).toBe(7 * 86_400_000)
  })

  it('handles every weekday', () => {
    for (let day = 1; day <= 7; day++) {
      const next = nextRunAt(weekly({ dayOfWeek: day }), new Date('2026-08-07T10:00:00Z'))!
      expect(localParts(next, KUCHING).weekday, `day ${day}`).toBe(day)
    }
  })

  it('runs daily schedules on the next day at that time', () => {
    const next = nextRunAt(
      { frequency: 'daily', dayOfWeek: 1, timeOfDay: '06:30', timezone: KUCHING },
      new Date('2026-08-07T10:00:00Z'),
    )!
    expect(localParts(next, KUCHING)).toMatchObject({ hour: 6, minute: 30 })
    expect(next.getTime()).toBeGreaterThan(new Date('2026-08-07T10:00:00Z').getTime())
  })

  it('runs monthly schedules on the first of the month', () => {
    const next = nextRunAt(
      { frequency: 'monthly', dayOfWeek: 1, timeOfDay: '08:00', timezone: KUCHING },
      new Date('2026-08-07T10:00:00Z'),
    )!
    expect(localParts(next, KUCHING)).toMatchObject({ day: 1, month: 9 })
  })

  it('stays at the right wall-clock time across a daylight-saving change', () => {
    // London moves to BST on 2026-03-29. A schedule set for 08:00 must still be 08:00
    // local afterwards, not 07:00 - which is what a fixed offset would produce.
    const before = nextRunAt(weekly({ timezone: LONDON }), new Date('2026-03-23T12:00:00Z'))!
    const after = nextRunAt(weekly({ timezone: LONDON }), new Date('2026-03-30T12:00:00Z'))!
    expect(localParts(before, LONDON).hour).toBe(8)
    expect(localParts(after, LONDON).hour).toBe(8)
  })

  it('returns null rather than guessing when the schedule cannot be understood', () => {
    expect(nextRunAt(weekly({ timeOfDay: 'lunchtime' }), new Date())).toBeNull()
    expect(nextRunAt(weekly({ timezone: 'Mars/Olympus' }), new Date())).toBeNull()
  })
})

describe('dueSlotKey', () => {
  it('is the same string for the same local slot however often it is asked', () => {
    const due = nextRunAt(weekly(), new Date('2026-08-07T10:00:00Z'))!
    expect(dueSlotKey(weekly(), due)).toBe(dueSlotKey(weekly(), due))
    expect(dueSlotKey(weekly(), due)).toBe('2026-08-10T08:00@Asia/Kuching')
  })

  it('differs week to week, so next Monday is a new slot', () => {
    const first = nextRunAt(weekly(), new Date('2026-08-07T10:00:00Z'))!
    const second = nextRunAt(weekly(), first)!
    expect(dueSlotKey(weekly(), first)).not.toBe(dueSlotKey(weekly(), second))
  })

  it('names the local slot, not the UTC instant', () => {
    // Two zones firing at the same instant are different slots, and must not collide.
    const instant = new Date('2026-08-10T00:00:00Z')
    const kuching = dueSlotKey(weekly(), instant)
    const utc = dueSlotKey(weekly({ timezone: 'UTC' }), instant)
    expect(kuching).not.toBe(utc)
  })
})

describe('describeSchedule', () => {
  it('reads as a sentence an operator would recognise', () => {
    expect(describeSchedule(weekly())).toBe('Every Monday at 08:00 Asia/Kuching')
    expect(describeSchedule(weekly({ frequency: 'daily' })))
      .toBe('Every day at 08:00 Asia/Kuching')
    expect(describeSchedule(weekly({ frequency: 'monthly' })))
      .toBe('On the 1st of each month at 08:00 Asia/Kuching')
  })
})
