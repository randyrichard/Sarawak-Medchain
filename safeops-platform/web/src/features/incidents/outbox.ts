import type { NewIncidentInput } from '@/api/incidents'
import {
  drain as drainQueue, enqueue as enqueueOp, type DrainResult, type OutboxStore,
  type QueuedFile, type QueuedOp,
} from '@/lib/fieldOutbox/queue'
import { defaultStore, queueFor } from '@/lib/fieldOutbox/store'

/*
 * Reports that were filed but have not reached the server yet.
 *
 * The situation this exists for: a supervisor finishes a report standing in a yard with one
 * bar of signal, taps Submit, and the request fails. Before this, the draft survived in
 * localStorage and the screen said "try again" — which is useless advice when the problem is
 * that there is nothing to try against, and which puts the burden of remembering on the one
 * person who is busiest. An unreported injury is not a UI problem; under OSHA 1994 the
 * employer has a notification duty, and the clock does not wait for signal.
 *
 * So the report is accepted, kept, and sent when the network comes back.
 *
 * This file is now an adapter over src/lib/fieldOutbox, which holds the storage and the
 * retry rules the permit queue also uses. The queue was localStorage, and the reason it is
 * not any more is photographs: localStorage holds strings, so a report queued offline kept
 * its text and dropped its evidence, and the screen said the photos were saved when only
 * their filenames were. IndexedDB stores Blobs — and the 5 MB origin quota, which one 4 MB
 * site photo would have exhausted while taking the queued reports down with it, stops being
 * the limit.
 *
 * What stays here is what is specific to an incident: how a report is replayed against the
 * API, and the move of any queue an older build left behind in localStorage.
 */

export type {
  DrainResult, OutboxStore, QueuedFile, QueuedOp,
} from '@/lib/fieldOutbox/queue'
export {
  isStale, needsAttention, pending, recordFailure, remove, shouldRetry,
  STALE_AFTER_MS, unblock,
} from '@/lib/fieldOutbox/queue'
/** False when the queue only survives while the tab is open, which the reporter is told. */
export { isPersistent } from '@/lib/fieldOutbox/store'

/** The only `kind` this queue holds: a report, with its photographs. */
export const INCIDENT_KIND = 'incident'

/**
 * The store, seen as only this queue.
 *
 * One store holds everything a user queued, permit records included, and this queue must see
 * none of it: a gas test handed to `create` is not a report, and — the serious direction —
 * `sendPermitOp` has no case for a report, so an unscoped permit drain would take one as
 * delivered and delete it. Each feature sees the kinds it owns.
 */
const ownQueue = (store: OutboxStore) => queueFor([INCIDENT_KIND], store)

/** A filed report waiting for a network. */
export type QueuedReport = QueuedOp<NewIncidentInput>

/**
 * What a drain needs in order to replay a report. Injected so the rules can be tested
 * without an API, and so this module does not pull in the client.
 */
export interface IncidentSender {
  /**
   * Files the report. A replay under the same clientRef returns the report already filed
   * rather than filing a second one — the server enforces that with a unique index on
   * (companyId, clientRef).
   */
  create: (input: NewIncidentInput, clientRef: string) => Promise<{ id: string }>
  /** Uploads one photograph or document to a report that now exists. */
  upload: (incidentId: string, file: File) => Promise<unknown>
}

/**
 * Adds a report, with the bytes of its evidence, to the queue.
 *
 * The clientRef is the caller's: it was generated before the first attempt and travels with
 * the report on every attempt after it, which is what stops a replay filing the same injury
 * twice.
 *
 * Can reject — a device with no storage at all, or a full one. The caller must then not tell
 * the reporter the report was saved, because it was not.
 */
export async function enqueue(
  userId: string,
  input: NewIncidentInput,
  clientRef: string,
  files: QueuedFile[] = [],
  store: OutboxStore = defaultStore,
): Promise<QueuedReport> {
  await migrateLegacyQueue(userId, store)
  return enqueueOp<NewIncidentInput>({
    userId,
    kind: INCIDENT_KIND,
    label: input.title,
    payload: input,
    files,
    clientRef,
  }, store)
}

/** Every report this user has queued, oldest first. Permit records are not reports. */
export async function readOutbox(
  userId: string,
  store: OutboxStore = defaultStore,
): Promise<QueuedReport[]> {
  await migrateLegacyQueue(userId, store)
  return (await ownQueue(store).all(userId)) as QueuedReport[]
}

/**
 * Attempts every queued report once, oldest first.
 *
 * `independent` is the one place this queue and the permit queue differ, and it is
 * deliberate. A permit's records are a sequence — the server refuses an acknowledgement for
 * a toolbox talk it has not been told about yet — so that drain stops at the first dead
 * network. Reports are separate events, often by separate people: one failing is no reason
 * to leave the next injury unsent.
 */
export async function drain(
  userId: string,
  io: IncidentSender,
  store: OutboxStore = defaultStore,
  now = Date.now(),
): Promise<DrainResult> {
  await migrateLegacyQueue(userId, store)
  const queue = ownQueue(store)
  return drainQueue(userId, (op) => sendReport(op as QueuedReport, io, queue), queue, now, {
    independent: true,
    scope: INCIDENT_KIND,
  })
}

/**
 * Replays one report: the text, then the photographs it was queued with.
 *
 * The report lands first because evidence belongs to an incident and there is nothing to
 * attach it to until then. If the upload half fails, the entry stays in the queue and the
 * whole thing is tried again — and a second `create` under the same key returns the report
 * already filed, so that retry costs a round trip rather than a duplicate injury.
 *
 * A photo is dropped from the entry as soon as it lands, not only when a later one fails. An
 * upload has no idempotency key of its own — `create` has one, and the server answers a
 * replay with the report already filed, but nothing recognises the same photograph twice —
 * so the queue is what has to remember. Without this, a report with three photos that lost
 * signal on the third would attach the first two again on every attempt, and a tab closed
 * mid-drain would attach everything again on the next one.
 */
async function sendReport(op: QueuedReport, io: IncidentSender, store: OutboxStore) {
  const incident = await io.create({ ...op.payload, clientRef: op.clientRef }, op.clientRef)

  /*
   * An upload that fails is not caught here. It goes up with its code intact so the queue's
   * own rules decide what happens next: a dead network keeps the entry and tries again
   * later, and a file the server refuses outright — a photo whose bytes do not match its
   * type, say — blocks the entry and puts it in front of a person. The report itself is
   * filed either way, which is the part that matters most; a refused photograph nobody is
   * told about would not be.
   */
  const queued = op.files ?? []
  for (let i = 0; i < queued.length; i += 1) {
    const f = queued[i]
    await io.upload(incident.id, new File([f.blob], f.name, { type: f.type }))
    await store.put({ ...op, files: queued.slice(i + 1) })
  }
  return incident
}

/*
 * A queue left behind by the localStorage build.
 *
 * Somebody may have an injury report sitting in `safeops.outbox.incidents.<userId>` right
 * now. Upgrading the app must not be the thing that loses it, so the old key is read once
 * per user, its entries are moved into the store, and only then is it cleared. Nothing is
 * deleted that has not been written somewhere else first.
 *
 * Idempotent on purpose: an entry keeps its own clientRef, which is the store's key, so a
 * migration interrupted halfway and run again overwrites rather than duplicates.
 */
const LEGACY_KEY_PREFIX = 'safeops.outbox.incidents.'

/** Per store, so the browser migrates once a session and each test starts clean. */
const migrated = new WeakMap<OutboxStore, Map<string, Promise<void>>>()

export function migrateLegacyQueue(
  userId: string,
  store: OutboxStore = defaultStore,
): Promise<void> {
  let perUser = migrated.get(store)
  if (!perUser) migrated.set(store, (perUser = new Map()))
  const running = perUser.get(userId)
  if (running) return running
  // Swallowed rather than rethrown: a migration that cannot run must not stop the report
  // the caller is holding from being queued now. The old key is left for the next attempt.
  const job = moveLegacyQueue(userId, store).catch(() => undefined)
  perUser.set(userId, job)
  return job
}

async function moveLegacyQueue(userId: string, store: OutboxStore): Promise<void> {
  const key = `${LEGACY_KEY_PREFIX}${userId}`
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    // Storage blocked altogether (private mode, a locked-down device). Nothing to move.
    return
  }
  if (!raw) return

  // Copy first. If the store will not take them the old key is left exactly as it was, so
  // the next load tries again — losing a report to a failed write is the one outcome worse
  // than leaving it in the wrong place.
  for (const op of parseLegacy(userId, raw)) await store.put(op)

  try {
    localStorage.removeItem(key)
  } catch { /* nothing useful to do; the entries are in the store either way */ }
}

interface LegacyReport {
  clientRef: string
  input: NewIncidentInput
  queuedAt?: string
  attempts?: number
  lastError?: string
  blocked?: boolean
}

/**
 * Reads the old array, tolerantly.
 *
 * This runs during start-up, and the old reader was deliberately forgiving for the same
 * reason: a corrupt entry must not take the whole queue — or the sign-in that reads it —
 * down with it. A malformed row is dropped and the rows around it are still moved.
 */
function parseLegacy(userId: string, raw: string): QueuedOp[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter((r): r is LegacyReport =>
      !!r && typeof r === 'object'
      && typeof (r as LegacyReport).clientRef === 'string'
      && !!(r as LegacyReport).input)
    .map((r) => ({
      clientRef: r.clientRef,
      userId,
      kind: INCIDENT_KIND,
      // The old entries carried no label; the title is what the reporter would recognise.
      label: r.input.title ?? 'Incident report',
      payload: r.input,
      // A localStorage entry never had files. That was the hole.
      files: [],
      queuedAt: r.queuedAt ?? new Date().toISOString(),
      attempts: r.attempts ?? 0,
      lastError: r.lastError,
      blocked: r.blocked,
    }))
}
