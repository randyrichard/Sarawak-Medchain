import { describe, it, expect } from 'vitest'
import {
  CLOCK_SKEW_MS, FieldRecordError, MAX_BACKDATE_MS, isReplay, recordedAtOf,
} from './fieldRecord.js'

/**
 * The rules that decide what time a record made offline is filed under.
 *
 * Worth testing properly rather than by inspection, because the failure is silent and the
 * record is evidence. A gas test filed at the wrong time does not look broken — it looks
 * like a test that happened at a time it did not, which is the only kind of error a
 * confined-space audit cannot catch for us.
 */
const NOW = new Date('2026-10-20T14:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const ahead = (ms: number) => new Date(NOW.getTime() + ms)

describe('recordedAtOf', () => {
  it('uses the server clock when the device claimed no time', () => {
    // Every write made with a connection looks like this, and must behave exactly as it
    // did before offline capture existed.
    expect(recordedAtOf(undefined, NOW)).toEqual(NOW)
    expect(recordedAtOf({}, NOW)).toEqual(NOW)
    expect(recordedAtOf({ clientRef: 'abcdefghij' }, NOW)).toEqual(NOW)
  })

  it('files a queued record at the time the field made it', () => {
    const at = ago(5 * 60 * 60 * 1000) // five hours in a pocket with no signal
    expect(recordedAtOf({ recordedAt: at.toISOString() }, NOW)).toEqual(at)
  })

  it('refuses a time that is not a date', () => {
    expect(() => recordedAtOf({ recordedAt: 'yesterday' }, NOW)).toThrow(FieldRecordError)
  })

  it('refuses a record dated in the future beyond clock skew', () => {
    expect(() => recordedAtOf({ recordedAt: ahead(CLOCK_SKEW_MS + 60_000).toISOString() }, NOW))
      .toThrow(/future/i)
  })

  it('tolerates a slightly fast phone, but never files ahead of now', () => {
    /*
     * A few minutes either way is a phone clock, not a mistake, so the record is accepted.
     * It is still clamped to now: a timeline with an event in the future reads as corrupt
     * and sorts wrongly, and nothing is gained by preserving three minutes of drift.
     */
    const result = recordedAtOf({ recordedAt: ahead(3 * 60 * 1000).toISOString() }, NOW)
    expect(result).toEqual(NOW)
  })

  it('refuses a record older than the queue would ever hold', () => {
    // The browser stops retrying after 48 hours and asks a human, so anything a week old
    // is being replayed from somewhere else and must not silently become history.
    expect(() => recordedAtOf({ recordedAt: ago(MAX_BACKDATE_MS + 60_000).toISOString() }, NOW))
      .toThrow(/more than a week old/i)
  })

  it('refuses a record dated before the thing it is attached to', () => {
    // A phone a month slow would otherwise write a gas test into a period when the permit
    // had not been raised, and the trail would read as a test against nothing.
    const permitRaised = ago(60 * 60 * 1000)
    expect(() => recordedAtOf(
      { recordedAt: ago(5 * 60 * 60 * 1000).toISOString() },
      NOW,
      { earliest: permitRaised },
    )).toThrow(/before the permit/i)
  })

  it('accepts a record made after the permit was raised', () => {
    const permitRaised = ago(8 * 60 * 60 * 1000)
    const at = ago(2 * 60 * 60 * 1000)
    expect(recordedAtOf({ recordedAt: at.toISOString() }, NOW, { earliest: permitRaised }))
      .toEqual(at)
  })

  it('refuses rather than silently correcting', () => {
    /*
     * The tempting alternative is to clamp a bad time to now and carry on. That would put a
     * reading nobody took at a time nobody tested on a permit somebody later relies on. A
     * 400 is the right answer: the queue stops retrying and puts it in front of a person,
     * who can see the device's clock is wrong.
     */
    let code = ''
    try {
      recordedAtOf({ recordedAt: ahead(60 * 60 * 1000).toISOString() }, NOW)
    } catch (e) {
      code = (e as FieldRecordError).code
      expect((e as FieldRecordError).status).toBe(400)
    }
    expect(code).toBe('validation')
  })
})

describe('isReplay', () => {
  it('recognises a duplicate field record by model', () => {
    expect(isReplay({ code: 'P2002', meta: { modelName: 'FieldRecord' } })).toBe(true)
  })

  it('recognises one reported by column, as older clients do', () => {
    expect(isReplay({ code: 'P2002', meta: { target: ['companyId', 'clientRef'] } })).toBe(true)
  })

  it('does not swallow a unique violation somewhere else in the same transaction', () => {
    // This is the whole reason the check is narrow. A duplicate permit code colliding
    // inside the same transaction is a real error, and treating it as "already done" would
    // report a write that never happened as successful.
    expect(isReplay({ code: 'P2002', meta: { modelName: 'Permit', target: ['code'] } })).toBe(false)
  })

  it('is false for anything that is not a unique violation', () => {
    expect(isReplay({ code: 'P2025' })).toBe(false)
    expect(isReplay(new Error('connection lost'))).toBe(false)
    expect(isReplay(undefined)).toBe(false)
  })
})
