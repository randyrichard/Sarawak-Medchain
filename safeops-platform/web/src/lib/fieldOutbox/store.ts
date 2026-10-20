/*
 * Storage for work recorded in the field before it has reached the server.
 *
 * IndexedDB, where the incident outbox used localStorage, and the difference is the reason
 * this file exists. localStorage holds strings: an incident queued offline kept its text and
 * had to drop its photographs, which docs/MOBILE.md records as a hole — a worker
 * photographed a scene and was told the photos were kept when only the filenames were. A
 * permit's evidence has the same shape: the gas detector's display, the isolation tag, the
 * state of a flange. IndexedDB stores Blobs, so the bytes survive the walk back to signal.
 *
 * Incident reports are now queued here too (features/incidents/outbox.ts), which is what
 * closed that hole; a queue left in localStorage by an older build is moved across on first
 * load rather than dropped.
 *
 * The quota is the other half. localStorage is about 5 MB per origin for the whole app; a
 * single site photograph is 2–4 MB. One permit's evidence would exhaust it and take every
 * other queued record down with it.
 *
 * The cost is that every read is asynchronous, which is why the queue's rules live in
 * queue.ts over the narrow interface below rather than being written against IndexedDB
 * directly: those rules decide whether an injury report is retried or shown to a human, and
 * they are testable in jsdom only if nothing in them needs a real database.
 */

/** One thing somebody did in the field that the server has not been told about yet. */
export interface QueuedOp<P = unknown> {
  /**
   * Idempotency key. Generated once when the record is made and reused on every attempt —
   * that is what lets the server tell a retry from a second gas test.
   */
  clientRef: string
  /**
   * Whose queue this is. Site phones are shared between a shift, so a drain must never send
   * one person's record under the next person's session, and signing out must not expose
   * what the last user recorded.
   */
  userId: string
  /** Which operation to replay. The dispatch table lives with the feature, not here. */
  kind: string
  /** What this record is, in the words the person who made it would use. */
  label: string
  /** The thing that was recorded, as the API wants it. JSON-serialisable. */
  payload: P
  /** Photographs and documents, kept as bytes rather than as a promise about bytes. */
  files?: QueuedFile[]
  /** When the field recorded it, not when it was sent. The time that goes on the record. */
  queuedAt: string
  attempts: number
  lastError?: string
  /**
   * The server looked at this and refused it, so no amount of signal will help.
   *
   * Kept rather than deleted — it is still something somebody recorded, and discarding that
   * silently is the one outcome worse than not sending it — but skipped by the automatic
   * drain so a rejected payload is not re-sent on every flicker of signal.
   */
  blocked?: boolean
}

export interface QueuedFile {
  name: string
  type: string
  blob: Blob
}

/**
 * The storage the queue needs, and nothing else.
 *
 * Two implementations: IndexedDB for the browser, a Map for tests. The rules in queue.ts
 * are written against this, so they can be tested without a database — and the IndexedDB
 * plumbing can be wrong without taking the retry logic's test coverage with it.
 */
export interface OutboxStore {
  /** Everything queued by one user, oldest first. */
  all(userId: string): Promise<QueuedOp[]>
  put(op: QueuedOp): Promise<void>
  remove(clientRef: string): Promise<void>
}

const DB_NAME = 'safechain-field-outbox'
const DB_VERSION = 1
const STORE = 'ops'
const BY_USER = 'byUser'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'clientRef' })
        // The queue is always read per user, never whole.
        os.createIndex(BY_USER, 'userId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refused to open'))
    /*
     * Another tab holds an older version open. Rare, and the app cannot resolve it from
     * here, so it fails rather than hanging a Submit button forever on a promise that will
     * never settle.
     */
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  }).catch((e: unknown) => {
    // Reset, so a failure caused by a transient condition (storage pressure, a private
    // window that was just granted storage) is not cached for the life of the tab.
    dbPromise = null
    throw e
  })
  dbPromise = opening
  return opening
}

const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
})

/** The real store. Available only in a browser with IndexedDB. */
export const indexedDbStore: OutboxStore = {
  async all(userId) {
    const db = await openDb()
    const idx = db.transaction(STORE, 'readonly').objectStore(STORE).index(BY_USER)
    const rows = await done(idx.getAll(userId) as IDBRequest<QueuedOp[]>)
    // Oldest first: the order the field did the work is the order the record should land in,
    // and a timeline assembled out of order reads as a different sequence of events.
    return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
  },

  async put(op) {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(op)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
    })
  },

  async remove(clientRef) {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(clientRef)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'))
    })
  },
}

/**
 * The same storage, seen as one feature's queue.
 *
 * One store holds everything a user has queued — a permit's gas tests and an injury report
 * sit in the same object store, keyed by the same user. A drain must never be handed a
 * record it has no sender for: `sendPermitOp` has no case for an incident report, so it
 * would return without sending, nothing would be thrown, and the drain would take the
 * report as delivered and delete it. An unreported injury, removed by the permit queue.
 *
 * So each feature declares the kinds it owns and sees only those. Writes pass straight
 * through, because a record is written by the feature that made it.
 */
export function queueFor(kinds: readonly string[], store: OutboxStore = defaultStore): OutboxStore {
  return {
    all: async (userId) => (await store.all(userId)).filter((op) => kinds.includes(op.kind)),
    put: (op) => store.put(op),
    remove: (clientRef) => store.remove(clientRef),
  }
}

/** In-memory store, for tests and for a browser where IndexedDB is unavailable. */
export function memoryStore(): OutboxStore {
  const rows = new Map<string, QueuedOp>()
  return {
    all: async (userId) => [...rows.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)),
    put: async (op) => { rows.set(op.clientRef, op) },
    remove: async (clientRef) => { rows.delete(clientRef) },
  }
}

/**
 * The store the app uses.
 *
 * Falls back to memory when IndexedDB is missing — a locked-down device, a private window,
 * jsdom. A memory queue is lost when the tab closes, which is worse than persistence and
 * much better than the alternative: with no store at all, every offline Submit would have
 * to be refused outright, so a supervisor with a locked-down browser could record nothing.
 * The UI says which it got, because "saved on this device" has to be true to be worth
 * printing (see `isPersistent`).
 */
export const defaultStore: OutboxStore = typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore

/** False when the queue only survives while the tab is open, which the field must be told. */
export const isPersistent = () => typeof indexedDB !== 'undefined'
