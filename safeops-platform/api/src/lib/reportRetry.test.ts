import { describe, it, expect } from 'vitest'
import {
  canResumePending, decideRetry, idempotencyKeyFor,
  MAX_ATTEMPTS, BACKOFF_MINUTES, STALE_PENDING_MINUTES,
} from './reportRetry.js'

/**
 * The retry policy.
 *
 * Pure decisions, so they can be asserted without a database, a provider or a clock. The
 * cases that matter are not the happy ones - they are the two ways this can be got wrong:
 * retrying something that will never succeed, and retrying something that may already have
 * been delivered.
 */
const NOW = new Date('2026-08-11T08:00:00Z')

describe('decideRetry', () => {
  it('retries a transient failure and backs off', () => {
    const d = decideRetry({ code: 'provider_unavailable', attempts: 1, providerIdempotent: true, now: NOW })
    expect(d.retry).toBe(true)
    expect(d.nextAttemptAt).toEqual(new Date(NOW.getTime() + BACKOFF_MINUTES[0] * 60_000))
    expect(d.explanation).toMatch(/Attempt 1 of 3/)
  })

  it('lengthens the wait on the second retry', () => {
    const first = decideRetry({ code: 'network_error', attempts: 1, providerIdempotent: true, now: NOW })
    const second = decideRetry({ code: 'network_error', attempts: 2, providerIdempotent: true, now: NOW })
    expect(second.nextAttemptAt!.getTime()).toBeGreaterThan(first.nextAttemptAt!.getTime())
    expect(second.nextAttemptAt).toEqual(new Date(NOW.getTime() + BACKOFF_MINUTES[1] * 60_000))
  })

  it('never retries a rejected API key', () => {
    /*
     * The single most important case. A wrong key fails identically every time, so retrying
     * it delays the only thing that fixes it - somebody noticing the configuration is
     * wrong - while filling the history with attempts.
     */
    const d = decideRetry({ code: 'auth_failed', attempts: 1, providerIdempotent: true, now: NOW })
    expect(d.retry).toBe(false)
    expect(d.nextAttemptAt).toBeNull()
    expect(d.explanation).toMatch(/will not resolve on its own/)
  })

  it('never retries a rejected message', () => {
    const d = decideRetry({ code: 'rejected', attempts: 1, providerIdempotent: true, now: NOW })
    expect(d.retry).toBe(false)
  })

  it('does not retry a code nobody has classified', () => {
    // Conservative by construction: an unknown failure stops and gets looked at.
    const d = decideRetry({ code: 'unknown_error', attempts: 1, providerIdempotent: true, now: NOW })
    expect(d.retry).toBe(false)
  })

  it('stops at the attempt limit', () => {
    const d = decideRetry({
      code: 'provider_unavailable', attempts: MAX_ATTEMPTS, providerIdempotent: true, now: NOW,
    })
    expect(d.retry).toBe(false)
    expect(d.explanation).toMatch(/Gave up after 3 attempts/)
  })

  it('will not repeat an ambiguous failure to a provider that cannot de-duplicate', () => {
    /*
     * The message may already be queued at the relay. Sending again could put two copies of
     * a safety report in twelve inboxes, and SMTP offers no way to ask first.
     */
    const d = decideRetry({ code: 'network_error', attempts: 1, providerIdempotent: false, now: NOW })
    expect(d.retry).toBe(false)
    expect(d.explanation).toMatch(/cannot confirm whether the message was already accepted/)
    expect(d.explanation).toMatch(/Download the report/)
  })

  it('does repeat the same failure when the provider de-duplicates', () => {
    const d = decideRetry({ code: 'network_error', attempts: 1, providerIdempotent: true, now: NOW })
    expect(d.retry).toBe(true)
  })

  it('retries rate limiting', () => {
    expect(decideRetry({ code: 'rate_limited', attempts: 1, providerIdempotent: false, now: NOW }).retry)
      .toBe(true)
  })
})

describe('canResumePending', () => {
  it('resumes when the send had not started', () => {
    // attempts is written before the provider is called, so zero means nothing went out.
    const r = canResumePending({ attempts: 0, providerIdempotent: false })
    expect(r.resume).toBe(true)
  })

  it('resumes an interrupted send when the provider de-duplicates', () => {
    expect(canResumePending({ attempts: 1, providerIdempotent: true }).resume).toBe(true)
  })

  it('refuses to resend an interrupted send over SMTP, and says why', () => {
    const r = canResumePending({ attempts: 1, providerIdempotent: false })
    expect(r.resume).toBe(false)
    expect(r.reason).toMatch(/cannot confirm whether it was already accepted/)
    expect(r.reason).toMatch(/available to download/)
  })

  it('stops at the attempt limit even for an idempotent provider', () => {
    const r = canResumePending({ attempts: MAX_ATTEMPTS, providerIdempotent: false })
    expect(r.resume).toBe(false)
    expect(r.reason).toMatch(/Gave up/)
  })
})

describe('idempotencyKeyFor', () => {
  it('is stable for a run and different between runs', () => {
    expect(idempotencyKeyFor('run-a')).toBe(idempotencyKeyFor('run-a'))
    expect(idempotencyKeyFor('run-a')).not.toBe(idempotencyKeyFor('run-b'))
    expect(idempotencyKeyFor('run-a')).toContain('run-a')
  })
})

describe('policy bounds', () => {
  it('keeps the budget small enough to notice an outage', () => {
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(5)
    expect(BACKOFF_MINUTES.length).toBe(MAX_ATTEMPTS - 1)
  })

  it('waits long enough that a slow send is not mistaken for a crash', () => {
    // A generate-and-send takes seconds; ten minutes cannot race a delivery in flight.
    expect(STALE_PENDING_MINUTES).toBeGreaterThanOrEqual(5)
  })
})
