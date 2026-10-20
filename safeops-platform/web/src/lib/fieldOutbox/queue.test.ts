import { describe, it, expect, vi } from 'vitest'
import { memoryStore, type QueuedOp } from './store'
import {
  STALE_AFTER_MS, drain, enqueue, needsAttention, pending, read, recordFailure, shouldRetry,
  unblock,
} from './queue'

/**
 * The queue holding work the field did before the server could be told.
 *
 * These rules decide whether a record of a confined-space gas test is retried quietly or
 * put in front of a human, so they are tested against a store in memory rather than
 * IndexedDB — which is the reason the store is an interface at all.
 */
const USER = 'user-1'
const OTHER = 'user-2'

const op = (over: Partial<QueuedOp> = {}): QueuedOp => ({
  clientRef: 'ref-aaaaaaaa',
  userId: USER,
  kind: 'gas-test',
  label: 'PTW-0001: gas test',
  payload: { permitId: 'p1' },
  queuedAt: new Date().toISOString(),
  attempts: 0,
  ...over,
})

const err = (code: string, message = 'failed') => Object.assign(new Error(message), { code })

describe('shouldRetry', () => {
  it('retries transport failures', () => {
    expect(shouldRetry('network')).toBe(true)
    expect(shouldRetry('request_failed')).toBe(true)
  })

  it('retries an expired session, because it can come back', () => {
    // A supervisor should not lose a recorded gas test to a token that timed out while the
    // phone was in a pocket.
    expect(shouldRetry('unauthenticated')).toBe(true)
  })

  it('does not retry a refusal', () => {
    // The server looked at the record and said no; it will say no identically in an hour,
    // and retrying on a timer would hide something that needs a person.
    expect(shouldRetry('validation')).toBe(false)
    expect(shouldRetry('forbidden')).toBe(false)
    expect(shouldRetry('not_found')).toBe(false)
    expect(shouldRetry(undefined)).toBe(false)
  })
})

describe('the queue', () => {
  it('keeps each user’s records apart', async () => {
    // Site phones are shared between a shift. One person's queue must never be drained
    // under the next person's session.
    const store = memoryStore()
    await enqueue({ userId: USER, kind: 'gas-test', label: 'a', payload: {} }, store)
    await enqueue({ userId: OTHER, kind: 'gas-test', label: 'b', payload: {} }, store)

    expect(await read(USER, store)).toHaveLength(1)
    expect((await read(USER, store))[0].label).toBe('a')
  })

  it('reuses the key it was given, so the server can recognise a replay', async () => {
    const store = memoryStore()
    const queued = await enqueue(
      { userId: USER, kind: 'suspend', label: 's', payload: {}, clientRef: 'fixed-key-123' },
      store,
    )
    expect(queued.clientRef).toBe('fixed-key-123')
  })

  it('generates a key when none was supplied', async () => {
    const store = memoryStore()
    const queued = await enqueue({ userId: USER, kind: 'suspend', label: 's', payload: {} }, store)
    expect(queued.clientRef.length).toBeGreaterThan(8)
  })

  it('separates what waits on a network from what waits on a person', () => {
    const fresh = op({ clientRef: 'a' })
    const refused = op({ clientRef: 'b', blocked: true })
    const old = op({ clientRef: 'c', queuedAt: new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString() })

    const all = [fresh, refused, old]
    expect(pending(all).map((o) => o.clientRef)).toEqual(['a'])
    expect(needsAttention(all).map((o) => o.clientRef)).toEqual(['b', 'c'])
  })
})

describe('drain', () => {
  it('sends oldest first and removes what landed', async () => {
    /*
     * Order matters here in a way it does not for incident reports: these are a sequence on
     * one permit — gas test, then toolbox, then entry — and a timeline assembled out of
     * order reads as a different sequence of events.
     */
    const store = memoryStore()
    await enqueue({ userId: USER, kind: 'gas-test', label: '1', payload: { n: 1 }, clientRef: 'k1' }, store)
    await new Promise((r) => setTimeout(r, 2))
    await enqueue({ userId: USER, kind: 'toolbox', label: '2', payload: { n: 2 }, clientRef: 'k2' }, store)

    const sentOrder: string[] = []
    const result = await drain(USER, async (o) => { sentOrder.push(o.clientRef) }, store)

    expect(sentOrder).toEqual(['k1', 'k2'])
    expect(result).toEqual({ sent: 2, failed: 0, remaining: 0 })
    expect(await read(USER, store)).toHaveLength(0)
  })

  it('keeps a record that failed on the network, and counts the attempt', async () => {
    const store = memoryStore()
    await enqueue({ userId: USER, kind: 'gas-test', label: '1', payload: {}, clientRef: 'k1' }, store)

    const result = await drain(USER, async () => { throw err('network') }, store)

    expect(result.sent).toBe(0)
    const [held] = await read(USER, store)
    expect(held.attempts).toBe(1)
    expect(held.blocked).toBeFalsy()
    expect(held.lastError).toBe('failed')
  })

  it('blocks a record the server refused, instead of retrying it forever', async () => {
    const store = memoryStore()
    await enqueue({ userId: USER, kind: 'person-entry', label: '1', payload: {}, clientRef: 'k1' }, store)

    await drain(USER, async () => { throw err('validation', 'This permit has been suspended.') }, store)

    const [held] = await read(USER, store)
    expect(held.blocked).toBe(true)
    // Kept, not deleted: it is still something somebody recorded, and throwing it away
    // silently is the one outcome worse than not sending it.
    expect(held.label).toBe('1')
    expect(held.lastError).toBe('This permit has been suspended.')
  })

  it('stops at a dead network rather than failing the rest of the chain', async () => {
    /*
     * The records behind a transport failure are not independent of it: the server refuses
     * an acknowledgement for a toolbox talk it has not been told about yet. Marching on
     * through a dead network would mark the whole chain failed and start a 48-hour clock on
     * records whose only problem was the order they were tried in.
     */
    const store = memoryStore()
    for (const k of ['k1', 'k2', 'k3']) {
      await enqueue({ userId: USER, kind: 'toolbox', label: k, payload: {}, clientRef: k }, store)
      await new Promise((r) => setTimeout(r, 2))
    }

    const send = vi.fn(async () => { throw err('network') })
    await drain(USER, send, store)

    expect(send).toHaveBeenCalledTimes(1)
    const held = await read(USER, store)
    expect(held.map((o) => o.attempts)).toEqual([1, 0, 0])
  })

  it('carries on past a refusal, so one bad record does not hold up the queue', async () => {
    const store = memoryStore()
    for (const k of ['bad', 'good']) {
      await enqueue({ userId: USER, kind: 'toolbox', label: k, payload: {}, clientRef: k }, store)
      await new Promise((r) => setTimeout(r, 2))
    }

    const send = vi.fn(async (o: QueuedOp) => {
      if (o.clientRef === 'bad') throw err('validation')
    })
    const result = await drain(USER, send, store)

    expect(send).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(1)
    expect((await read(USER, store)).map((o) => o.clientRef)).toEqual(['bad'])
  })

  it('does not retry what it has already blocked', async () => {
    const store = memoryStore()
    await enqueue({ userId: USER, kind: 'toolbox', label: '1', payload: {}, clientRef: 'k1' }, store)
    await recordFailure(USER, 'k1', 'refused', true, store)

    const send = vi.fn(async () => undefined)
    const result = await drain(USER, send, store)

    expect(send).not.toHaveBeenCalled()
    expect(result.failed).toBe(1)
  })

  it('tries a blocked record again once somebody has unblocked it', async () => {
    const store = memoryStore()
    await enqueue({ userId: USER, kind: 'toolbox', label: '1', payload: {}, clientRef: 'k1' }, store)
    await recordFailure(USER, 'k1', 'refused', true, store)
    await unblock(USER, 'k1', store)

    const result = await drain(USER, async () => undefined, store)
    expect(result.sent).toBe(1)
  })

  it('stops retrying a record old enough to need a person', async () => {
    // Two days of failure is not a network problem any more, and retrying it silently
    // forever would let the person who recorded it believe it was filed.
    const store = memoryStore()
    await store.put(op({
      clientRef: 'k1',
      queuedAt: new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString(),
    }))

    const send = vi.fn(async () => undefined)
    await drain(USER, send, store)

    expect(send).not.toHaveBeenCalled()
    expect(await read(USER, store)).toHaveLength(1)
  })

  it('keeps the bytes of a photograph, not just its name', async () => {
    /*
     * The reason this store is IndexedDB. docs/MOBILE.md records the previous failure: a
     * worker photographed a scene, the report was saved offline, and only the filename was
     * kept — so the app said the photos were on record when they were not.
     */
    const store = memoryStore()
    const blob = new Blob(['not really a jpeg'], { type: 'image/jpeg' })
    await enqueue({
      userId: USER,
      kind: 'attachment',
      label: 'PTW-0001: photo',
      payload: { permitId: 'p1' },
      files: [{ name: 'flange.jpg', type: 'image/jpeg', blob }],
    }, store)

    const [held] = await read(USER, store)
    expect(held.files?.[0].name).toBe('flange.jpg')
    expect(await held.files![0].blob.text()).toBe('not really a jpeg')
  })
})
