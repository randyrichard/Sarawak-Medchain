import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  drain, enqueue, isStale, needsAttention, pending, readOutbox, recordFailure, remove,
  shouldRetry, STALE_AFTER_MS, unblock, type QueuedReport,
} from './outbox'
import type { NewIncidentInput } from '@/api/incidents'

/*
 * The outbox holds incident reports that were filed but have not reached the server.
 *
 * What is worth testing here is not "does an array round-trip" but the rules that decide
 * whether a report is retried, and the one guarantee the whole thing rests on: the same
 * idempotency key is presented on every attempt. If that key ever changed between retries,
 * the server's uniqueness check would be defeated and a queued injury would be filed twice.
 */

// localStorage does not exist in the node test environment, so here is one that does.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

const USER = 'user-1'

const report = (title: string): NewIncidentInput => ({
  title, type: 'injury', severity: 'Minor', companyId: 'co', siteId: 'site',
  department: '', location: 'Workshop', occurredAt: '2026-09-06T02:00:00.000Z',
  reporter: 'Supervisor', peopleInvolved: [], witnesses: [], immediateActions: '',
  description: '', attachments: [], signature: '',
} as NewIncidentInput)

const err = (code: string, message = 'boom') => Object.assign(new Error(message), { code })

describe('outbox storage', () => {
  it('keeps a queued report across reads', () => {
    enqueue(USER, report('Hand laceration'), 'ref-1')
    expect(readOutbox(USER).map((r) => r.input.title)).toEqual(['Hand laceration'])
  })

  it('keeps each user’s queue separate', () => {
    // A shared site phone: signing out must not hand the next person someone else's report.
    enqueue(USER, report('Mine'), 'ref-1')
    enqueue('user-2', report('Theirs'), 'ref-2')
    expect(readOutbox(USER)).toHaveLength(1)
    expect(readOutbox('user-2')[0].input.title).toBe('Theirs')
  })

  it('survives corrupt storage rather than throwing', () => {
    // This is read during start-up. Throwing here would take the app down at launch, which
    // is a far worse outcome than losing one malformed entry.
    store.set('safeops.outbox.incidents.user-1', 'not json{{')
    expect(readOutbox(USER)).toEqual([])
  })

  it('drops malformed entries but keeps the good ones', () => {
    store.set('safeops.outbox.incidents.user-1', JSON.stringify([
      { nonsense: true },
      { clientRef: 'ref-ok', input: report('Real'), queuedAt: new Date().toISOString(), attempts: 0 },
    ]))
    expect(readOutbox(USER).map((r) => r.clientRef)).toEqual(['ref-ok'])
  })
})

describe('retry rules', () => {
  it('retries transport failures', () => {
    expect(shouldRetry('network')).toBe(true)
    expect(shouldRetry('request_failed')).toBe(true)
  })

  it('retries an expired session, because it can come back', () => {
    expect(shouldRetry('unauthenticated')).toBe(true)
  })

  it('does not retry a report the server refused', () => {
    // A 400 will be a 400 again in an hour. Retrying it on a timer hides a report that
    // needs a person to look at it.
    expect(shouldRetry('validation')).toBe(false)
    expect(shouldRetry('forbidden')).toBe(false)
    expect(shouldRetry('not_found')).toBe(false)
  })
})

describe('drain', () => {
  it('sends a queued report and removes it', async () => {
    enqueue(USER, report('Slip on stair'), 'ref-1')
    const send = vi.fn().mockResolvedValue({ id: 'inc-1' })

    const result = await drain(USER, send)

    expect(send).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ sent: 1, failed: 0, remaining: 0 })
    expect(readOutbox(USER)).toEqual([])
  })

  it('presents the SAME idempotency key on every attempt', async () => {
    // The guarantee the server's uniqueness check depends on. A key regenerated per attempt
    // would file the injury once per retry.
    enqueue(USER, report('Dropped load'), 'ref-stable')
    const seen: string[] = []
    const send = vi.fn(async (_i: NewIncidentInput, ref: string) => {
      seen.push(ref)
      throw err('network')
    })

    await drain(USER, send)
    await drain(USER, send)
    await drain(USER, send)

    expect(seen).toEqual(['ref-stable', 'ref-stable', 'ref-stable'])
  })

  it('keeps a report that failed on the network, to try again later', async () => {
    enqueue(USER, report('Fire in store'), 'ref-1')
    await drain(USER, vi.fn().mockRejectedValue(err('network', 'Could not reach the server')))

    const [item] = readOutbox(USER)
    expect(item.attempts).toBe(1)
    expect(item.blocked).toBeFalsy()
    expect(item.lastError).toBe('Could not reach the server')
  })

  it('stops retrying a report the server refused, but does not throw it away', async () => {
    enqueue(USER, report('Bad payload'), 'ref-1')
    const send = vi.fn().mockRejectedValue(err('validation', 'Unknown site for this workspace.'))

    await drain(USER, send)
    expect(readOutbox(USER)[0].blocked).toBe(true)

    await drain(USER, send)
    // Not attempted a second time — but still present, because somebody filed it.
    expect(send).toHaveBeenCalledTimes(1)
    expect(readOutbox(USER)).toHaveLength(1)
  })

  it('can be told to try a blocked report again', async () => {
    enqueue(USER, report('Retry me'), 'ref-1')
    await drain(USER, vi.fn().mockRejectedValue(err('validation')))
    unblock(USER, 'ref-1')

    const send = vi.fn().mockResolvedValue({ id: 'inc-9' })
    await drain(USER, send)
    expect(send).toHaveBeenCalledTimes(1)
    expect(readOutbox(USER)).toEqual([])
  })

  it('sends oldest first', async () => {
    enqueue(USER, report('First'), 'ref-1')
    enqueue(USER, report('Second'), 'ref-2')
    const order: string[] = []
    await drain(USER, async (i) => void order.push(i.title))
    expect(order).toEqual(['First', 'Second'])
  })

  it('one failure does not block the reports behind it', async () => {
    enqueue(USER, report('Fails'), 'ref-1')
    enqueue(USER, report('Succeeds'), 'ref-2')
    const send = vi.fn(async (_i: NewIncidentInput, ref: string) => {
      if (ref === 'ref-1') throw err('network')
      return { id: 'inc-2' }
    })

    const result = await drain(USER, send)

    expect(result).toMatchObject({ sent: 1, failed: 1 })
    expect(readOutbox(USER).map((r) => r.clientRef)).toEqual(['ref-1'])
  })

  it('stops retrying a report that has been stuck for two days', async () => {
    enqueue(USER, report('Ancient'), 'ref-1')
    const send = vi.fn()
    const later = Date.now() + STALE_AFTER_MS + 1000

    const result = await drain(USER, send, later)

    expect(send).not.toHaveBeenCalled()
    expect(result.failed).toBe(1)
    // Still there. It represents a real report and a person has to decide what happens.
    expect(readOutbox(USER)).toHaveLength(1)
  })
})

describe('classification for the UI', () => {
  const at = (iso: string, over: Partial<QueuedReport> = {}): QueuedReport => ({
    clientRef: 'r', input: report('x'), queuedAt: iso, attempts: 0, ...over,
  })

  it('separates waiting-for-signal from waiting-for-a-person', () => {
    const now = Date.parse('2026-09-06T12:00:00.000Z')
    const fresh = at('2026-09-06T11:59:00.000Z')
    const refused = at('2026-09-06T11:59:00.000Z', { blocked: true })
    const old = at('2026-09-01T00:00:00.000Z')

    expect(pending([fresh, refused, old], now)).toEqual([fresh])
    expect(needsAttention([fresh, refused, old], now)).toEqual([refused, old])
  })

  it('counts a report as stale only after the full window', () => {
    const queuedAt = '2026-09-06T00:00:00.000Z'
    const base = Date.parse(queuedAt)
    expect(isStale(at(queuedAt), base + STALE_AFTER_MS - 1)).toBe(false)
    expect(isStale(at(queuedAt), base + STALE_AFTER_MS + 1)).toBe(true)
  })
})

describe('bookkeeping', () => {
  it('removes only the report asked for', () => {
    enqueue(USER, report('Keep'), 'ref-1')
    enqueue(USER, report('Drop'), 'ref-2')
    remove(USER, 'ref-2')
    expect(readOutbox(USER).map((r) => r.clientRef)).toEqual(['ref-1'])
  })

  it('counts attempts across failures', () => {
    enqueue(USER, report('x'), 'ref-1')
    recordFailure(USER, 'ref-1', 'one')
    recordFailure(USER, 'ref-1', 'two')
    expect(readOutbox(USER)[0]).toMatchObject({ attempts: 2, lastError: 'two' })
  })
})
