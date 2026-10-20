import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore, type OutboxStore } from '@/lib/fieldOutbox/store'
import { enqueue as enqueueOp } from '@/lib/fieldOutbox/queue'
import {
  drain, enqueue, isStale, migrateLegacyQueue, needsAttention, pending, readOutbox,
  recordFailure, remove, shouldRetry, STALE_AFTER_MS, unblock, type IncidentSender,
  type QueuedReport,
} from './outbox'
import type { NewIncidentInput } from '@/api/incidents'

/*
 * The outbox holds incident reports that were filed but have not reached the server.
 *
 * What is worth testing here is not "does an array round-trip" but the rules that decide
 * whether a report is retried, the photographs that used to be dropped on the way into
 * storage, and the one guarantee the whole thing rests on: the same idempotency key is
 * presented on every attempt. If that key ever changed between retries, the server's
 * uniqueness check would be defeated and a queued injury would be filed twice.
 *
 * The storage is IndexedDB in a browser and a Map here, which is the reason the store is an
 * interface: these rules are tested without a database.
 */

// localStorage does not exist in the node test environment, and the migration reads it.
const local = new Map<string, string>()
let store: OutboxStore
beforeEach(() => {
  local.clear()
  store = memoryStore()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => void local.set(k, v),
    removeItem: (k: string) => void local.delete(k),
  })
})

const USER = 'user-1'
const LEGACY_KEY = 'safeops.outbox.incidents.user-1'

const report = (title: string): NewIncidentInput => ({
  title, type: 'injury', severity: 'Minor', companyId: 'co', siteId: 'site',
  department: '', location: 'Workshop', occurredAt: '2026-09-06T02:00:00.000Z',
  reporter: 'Supervisor', peopleInvolved: [], witnesses: [], immediateActions: '',
  description: '', attachments: [], signature: '',
} as NewIncidentInput)

const photo = (name: string, bytes = 'not really a jpeg') => ({
  name, type: 'image/jpeg', blob: new Blob([bytes], { type: 'image/jpeg' }),
})

const err = (code: string, message = 'boom') => Object.assign(new Error(message), { code })

/** A sender that files everything and accepts every photo. */
const happy = (): IncidentSender & { created: NewIncidentInput[]; uploaded: string[] } => {
  const created: NewIncidentInput[] = []
  const uploaded: string[] = []
  return {
    created,
    uploaded,
    create: async (input) => { created.push(input); return { id: `inc-${created.length}` } },
    upload: async (_id, file) => { uploaded.push(file.name) },
  }
}

describe('outbox storage', () => {
  it('keeps a queued report across reads', async () => {
    await enqueue(USER, report('Hand laceration'), 'ref-1', [], store)
    expect((await readOutbox(USER, store)).map((r) => r.payload.title)).toEqual(['Hand laceration'])
  })

  it('keeps the bytes of a photograph, not just its name', async () => {
    /*
     * The whole reason this queue left localStorage. docs/MOBILE.md records the failure: a
     * worker photographed a scene, the report was saved with no signal, and only the
     * filename was kept — so the app said the photos were on record when they were not.
     */
    await enqueue(USER, report('Scene'), 'ref-1', [photo('scene.jpg', 'real bytes')], store)

    const [held] = await readOutbox(USER, store)
    expect(held.files?.[0].name).toBe('scene.jpg')
    expect(await held.files![0].blob.text()).toBe('real bytes')
  })

  it('keeps each user’s queue separate', async () => {
    // A shared site phone: signing out must not hand the next person someone else's report.
    await enqueue(USER, report('Mine'), 'ref-1', [], store)
    await enqueue('user-2', report('Theirs'), 'ref-2', [], store)
    expect(await readOutbox(USER, store)).toHaveLength(1)
    expect((await readOutbox('user-2', store))[0].payload.title).toBe('Theirs')
  })
})

describe('sharing a store with the permit queue', () => {
  /*
   * One IndexedDB store holds everything a user recorded in the field. Keeping the two
   * queues apart is not tidiness: `sendPermitOp` has no case for a report, so an unscoped
   * permit drain would return without sending one, throw nothing, and delete it as
   * delivered. An injury report removed by the permit queue.
   */
  const gasTest = async () => {
    await enqueueOp({
      userId: USER, kind: 'gas-test', label: 'PTW-0001: gas test', payload: { permitId: 'p1' },
    }, store)
  }

  it('does not read a permit record as a report', async () => {
    await gasTest()
    await enqueue(USER, report('Hand laceration'), 'ref-1', [], store)

    expect((await readOutbox(USER, store)).map((r) => r.clientRef)).toEqual(['ref-1'])
  })

  it('does not send one, and leaves it in the queue for the drain that owns it', async () => {
    await gasTest()
    const io = happy()

    const result = await drain(USER, io, store)

    expect(io.created).toHaveLength(0)
    expect(result).toEqual({ sent: 0, failed: 0, remaining: 0 })
    // Still there, untouched, for the permit queue to send.
    expect((await store.all(USER)).map((o) => o.kind)).toEqual(['gas-test'])
  })
})

describe('migrating the localStorage queue', () => {
  /*
   * Somebody may have an injury report sitting in the old key at the moment the app is
   * upgraded. Losing it to the upgrade would be worse than never having queued it.
   */
  const legacy = (over: Record<string, unknown> = {}) => ({
    clientRef: 'old-ref', input: report('Trapped finger'),
    // Queued minutes ago, not days: an entry older than the 48-hour window is one the queue
    // stops retrying by itself, which would hide whether the migration worked.
    queuedAt: new Date(Date.now() - 60_000).toISOString(),
    attempts: 2, lastError: 'Could not reach the server',
    ...over,
  })

  it('moves a report left in localStorage into the store, and clears the old key', async () => {
    local.set(LEGACY_KEY, JSON.stringify([legacy({ queuedAt: '2026-09-06T02:05:00.000Z' })]))

    const held = await readOutbox(USER, store)

    expect(held).toHaveLength(1)
    expect(held[0]).toMatchObject({
      clientRef: 'old-ref',
      userId: USER,
      attempts: 2,
      lastError: 'Could not reach the server',
      // The time the reporter pressed Submit, kept — not the time of the upgrade. It is
      // what the 48-hour "needs a person" window is measured from.
      queuedAt: '2026-09-06T02:05:00.000Z',
    })
    expect(held[0].payload.title).toBe('Trapped finger')
    // Only once it is somewhere else.
    expect(local.get(LEGACY_KEY)).toBeUndefined()
  })

  it('keeps a migrated report’s key, so the server still recognises the replay', async () => {
    local.set(LEGACY_KEY, JSON.stringify([legacy({ clientRef: 'ref-from-before' })]))
    const io = happy()

    await drain(USER, io, store)

    expect(io.created[0].clientRef).toBe('ref-from-before')
  })

  it('carries the blocked flag over, so a refused report is not retried by the upgrade', async () => {
    local.set(LEGACY_KEY, JSON.stringify([legacy({ blocked: true })]))
    const io = happy()

    await drain(USER, io, store)

    expect(io.created).toHaveLength(0)
    expect((await readOutbox(USER, store))[0].blocked).toBe(true)
  })

  it('migrates once, not on every read', async () => {
    local.set(LEGACY_KEY, JSON.stringify([legacy()]))
    await readOutbox(USER, store)
    // The entry is removed as it sends; a second migration would resurrect it from a key
    // that should by then be gone.
    await remove('old-ref', store)

    expect(await readOutbox(USER, store)).toEqual([])
  })

  it('survives corrupt storage rather than throwing', async () => {
    // This runs during start-up. Throwing here would take the app down at launch, which is
    // a far worse outcome than losing one malformed entry.
    local.set(LEGACY_KEY, 'not json{{')
    expect(await readOutbox(USER, store)).toEqual([])
  })

  it('moves the good entries and drops only the malformed one', async () => {
    local.set(LEGACY_KEY, JSON.stringify([{ nonsense: true }, legacy({ clientRef: 'ref-ok' })]))
    expect((await readOutbox(USER, store)).map((r) => r.clientRef)).toEqual(['ref-ok'])
  })

  it('leaves the old key alone if the store will not take the entries', async () => {
    // A failed copy must not be the thing that deletes the only surviving record of an
    // injury: the key stays, and the next load tries again.
    local.set(LEGACY_KEY, JSON.stringify([legacy()]))
    const broken: OutboxStore = {
      all: async () => [],
      put: async () => { throw new Error('QuotaExceededError') },
      remove: async () => undefined,
    }

    await migrateLegacyQueue(USER, broken)

    expect(local.get(LEGACY_KEY)).toBeTruthy()
  })

  it('does nothing when there was never an old queue', async () => {
    await enqueue(USER, report('New world'), 'ref-1', [], store)
    expect((await readOutbox(USER, store)).map((r) => r.clientRef)).toEqual(['ref-1'])
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
    await enqueue(USER, report('Slip on stair'), 'ref-1', [], store)
    const io = happy()

    const result = await drain(USER, io, store)

    expect(io.created).toHaveLength(1)
    expect(result).toMatchObject({ sent: 1, failed: 0, remaining: 0 })
    expect(await readOutbox(USER, store)).toEqual([])
  })

  it('uploads the photographs the phone kept, once the report exists', async () => {
    // The point of the whole change: the text and the evidence both arrive.
    await enqueue(USER, report('Scene'), 'ref-1', [photo('a.jpg'), photo('b.jpg')], store)
    const io = happy()

    await drain(USER, io, store)

    expect(io.created).toHaveLength(1)
    expect(io.uploaded).toEqual(['a.jpg', 'b.jpg'])
    expect(await readOutbox(USER, store)).toEqual([])
  })

  it('uploads each photo as the file it is, not as bytes with no name', async () => {
    await enqueue(USER, report('Scene'), 'ref-1', [photo('flange.jpg', 'xyz')], store)
    const seen: File[] = []
    await drain(USER, { ...happy(), upload: async (_id, f) => void seen.push(f) }, store)

    expect(seen[0].name).toBe('flange.jpg')
    expect(seen[0].type).toBe('image/jpeg')
    expect(await seen[0].text()).toBe('xyz')
  })

  it('keeps the report queued when a photo cannot be uploaded', async () => {
    await enqueue(USER, report('Scene'), 'ref-1', [photo('a.jpg')], store)
    const io = { ...happy(), upload: async () => { throw err('network') } }

    const result = await drain(USER, io, store)

    expect(result).toMatchObject({ sent: 0, failed: 1, remaining: 1 })
    const [held] = await readOutbox(USER, store)
    expect(held.attempts).toBe(1)
    expect(held.blocked).toBeFalsy()
  })

  it('does not upload a photo twice when a later one failed', async () => {
    /*
     * An upload has no idempotency key of its own. A three-photo report that lost signal on
     * the third would otherwise attach the first two again on every attempt, and the report
     * would collect duplicates each time the phone found a bar of signal.
     */
    await enqueue(USER, report('Scene'), 'ref-1', [photo('a.jpg'), photo('b.jpg')], store)
    const uploaded: string[] = []
    let failOnB = true
    const io: IncidentSender = {
      create: async () => ({ id: 'inc-1' }),
      upload: async (_id, f) => {
        if (f.name === 'b.jpg' && failOnB) {
          failOnB = false
          throw err('network')
        }
        uploaded.push(f.name)
      },
    }

    await drain(USER, io, store)
    expect(uploaded).toEqual(['a.jpg'])
    // Only the one that did not land is still held.
    expect((await readOutbox(USER, store))[0].files?.map((f) => f.name)).toEqual(['b.jpg'])

    await drain(USER, io, store)
    expect(uploaded).toEqual(['a.jpg', 'b.jpg'])
    expect(await readOutbox(USER, store)).toEqual([])
  })

  it('forgets a photo as soon as it lands, not only when a later one fails', async () => {
    // A tab closed mid-drain must not attach everything again on the next one.
    await enqueue(USER, report('Scene'), 'ref-1', [photo('a.jpg'), photo('b.jpg')], store)
    const seen: string[][] = []
    await drain(USER, {
      create: async () => ({ id: 'inc-1' }),
      upload: async (_id, f) => {
        if (f.name === 'b.jpg') {
          seen.push((await readOutbox(USER, store))[0].files!.map((x) => x.name))
        }
      },
    }, store)

    // By the time the second upload is attempted, the first is no longer queued.
    expect(seen).toEqual([['b.jpg']])
  })

  it('does not upload the same photo twice when two drains overlap', async () => {
    /*
     * Found at runtime, not here: a near miss filed offline with one photograph landed as
     * two attachments 155 ms apart. A hook mounted twice — which React does on purpose in
     * development — ran two drains, and `create` deduplicated by key while the upload, which
     * has no key, did not.
     */
    await enqueue(USER, report('Scene'), 'ref-1', [photo('a.jpg')], store)
    const io = happy()

    const [first, second] = await Promise.all([drain(USER, io, store), drain(USER, io, store)])

    expect(io.uploaded).toEqual(['a.jpg'])
    expect(io.created).toHaveLength(1)
    // The second caller is handed the drain already running: what it wanted was the queue
    // attempted, and it was.
    expect(second).toEqual(first)
  })

  it('lets a later drain run once the first has finished', async () => {
    // The guard above must not be a lock that outlives its drain, or the first failure would
    // stop the queue being attempted ever again.
    await enqueue(USER, report('One'), 'ref-1', [], store)
    await drain(USER, { create: async () => { throw err('network') }, upload: async () => undefined }, store)

    const io = happy()
    await drain(USER, io, store)
    expect(io.created).toHaveLength(1)
  })

  it('presents the SAME idempotency key on every attempt', async () => {
    // The guarantee the server's uniqueness check depends on. A key regenerated per attempt
    // would file the injury once per retry.
    await enqueue(USER, report('Dropped load'), 'ref-stable', [], store)
    const seen: string[] = []
    const io: IncidentSender = {
      create: async (_i, ref) => { seen.push(ref); throw err('network') },
      upload: async () => undefined,
    }

    await drain(USER, io, store)
    await drain(USER, io, store)
    await drain(USER, io, store)

    expect(seen).toEqual(['ref-stable', 'ref-stable', 'ref-stable'])
  })

  it('sends the key with the payload too, so the server sees it on the report', async () => {
    await enqueue(USER, report('Dropped load'), 'ref-stable', [], store)
    const io = happy()
    await drain(USER, io, store)
    expect(io.created[0].clientRef).toBe('ref-stable')
  })

  it('keeps a report that failed on the network, to try again later', async () => {
    await enqueue(USER, report('Fire in store'), 'ref-1', [], store)
    await drain(USER, {
      create: async () => { throw err('network', 'Could not reach the server') },
      upload: async () => undefined,
    }, store)

    const [item] = await readOutbox(USER, store)
    expect(item.attempts).toBe(1)
    expect(item.blocked).toBeFalsy()
    expect(item.lastError).toBe('Could not reach the server')
  })

  it('stops retrying a report the server refused, but does not throw it away', async () => {
    await enqueue(USER, report('Bad payload'), 'ref-1', [], store)
    const create = vi.fn(async (): Promise<{ id: string }> => {
      throw err('validation', 'Unknown site for this workspace.')
    })
    const io: IncidentSender = { create, upload: async () => undefined }

    await drain(USER, io, store)
    expect((await readOutbox(USER, store))[0].blocked).toBe(true)

    await drain(USER, io, store)
    // Not attempted a second time — but still present, because somebody filed it.
    expect(create).toHaveBeenCalledTimes(1)
    expect(await readOutbox(USER, store)).toHaveLength(1)
  })

  it('can be told to try a blocked report again', async () => {
    await enqueue(USER, report('Retry me'), 'ref-1', [], store)
    await drain(USER, {
      create: async () => { throw err('validation') },
      upload: async () => undefined,
    }, store)
    await unblock(USER, 'ref-1', store)

    const io = happy()
    await drain(USER, io, store)
    expect(io.created).toHaveLength(1)
    expect(await readOutbox(USER, store)).toEqual([])
  })

  it('sends oldest first', async () => {
    await enqueue(USER, report('First'), 'ref-1', [], store)
    await new Promise((r) => setTimeout(r, 2))
    await enqueue(USER, report('Second'), 'ref-2', [], store)

    const io = happy()
    await drain(USER, io, store)
    expect(io.created.map((i) => i.title)).toEqual(['First', 'Second'])
  })

  it('one failure does not block the reports behind it', async () => {
    /*
     * The difference from the permit queue, and it is deliberate. Permit records are a
     * sequence on one permit, so that drain stops at the first dead network. These are
     * separate reports of separate events: the next injury still gets its attempt.
     */
    await enqueue(USER, report('Fails'), 'ref-1', [], store)
    await new Promise((r) => setTimeout(r, 2))
    await enqueue(USER, report('Succeeds'), 'ref-2', [], store)
    const io: IncidentSender = {
      create: async (_i, ref) => {
        if (ref === 'ref-1') throw err('network')
        return { id: 'inc-2' }
      },
      upload: async () => undefined,
    }

    const result = await drain(USER, io, store)

    expect(result).toMatchObject({ sent: 1, failed: 1 })
    expect((await readOutbox(USER, store)).map((r) => r.clientRef)).toEqual(['ref-1'])
  })

  it('stops retrying a report that has been stuck for two days', async () => {
    await enqueue(USER, report('Ancient'), 'ref-1', [], store)
    const io = happy()
    const later = Date.now() + STALE_AFTER_MS + 1000

    const result = await drain(USER, io, store, later)

    expect(io.created).toHaveLength(0)
    expect(result.failed).toBe(1)
    // Still there. It represents a real report and a person has to decide what happens.
    expect(await readOutbox(USER, store)).toHaveLength(1)
  })
})

describe('classification for the UI', () => {
  const at = (iso: string, over: Partial<QueuedReport> = {}): QueuedReport => ({
    clientRef: 'r', userId: USER, kind: 'incident', label: 'x', payload: report('x'),
    queuedAt: iso, attempts: 0, ...over,
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
  it('removes only the report asked for', async () => {
    await enqueue(USER, report('Keep'), 'ref-1', [], store)
    await enqueue(USER, report('Drop'), 'ref-2', [], store)
    await remove('ref-2', store)
    expect((await readOutbox(USER, store)).map((r) => r.clientRef)).toEqual(['ref-1'])
  })

  it('counts attempts across failures', async () => {
    await enqueue(USER, report('x'), 'ref-1', [], store)
    await recordFailure(USER, 'ref-1', 'one', false, store)
    await recordFailure(USER, 'ref-1', 'two', false, store)
    expect((await readOutbox(USER, store))[0]).toMatchObject({ attempts: 2, lastError: 'two' })
  })
})
