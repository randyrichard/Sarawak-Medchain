/*
 * The rules for work waiting to reach the server: what is retried, what is shown to a
 * person, and in what order it is sent.
 *
 * These rules began in the incident outbox and now serve it too: features/incidents/outbox.ts
 * is a thin adapter over this file, so a permit gas test and an injury report cannot come to
 * disagree about how long "stuck" takes or which failures are worth retrying.
 *
 * The one place they differ is the order a drain gives up in, which is what `independent`
 * below is for.
 *
 * Nothing here touches IndexedDB. Everything goes through the OutboxStore interface, which
 * is what makes the decisions below testable: these rules decide whether a record of a
 * confined-space gas test is retried on a timer or put in front of a human, and that
 * deserves tests that run in CI without a database.
 */
import { defaultStore, type OutboxStore, type QueuedFile, type QueuedOp } from './store'

export type { QueuedOp, QueuedFile, OutboxStore } from './store'

/**
 * Older than this and we stop retrying on our own and ask a human.
 *
 * Something that has been failing for two days is not waiting for signal, it is waiting for
 * somebody to look at it — the session expired, the permit was closed by someone else, the
 * payload is refused. Retrying it silently forever would let the person who recorded it
 * believe it was filed.
 */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

/**
 * Is this failure worth retrying?
 *
 * Only transport failures are. A 400 means the server looked at the record and refused it,
 * and it will refuse it identically in an hour — retrying that on a timer just hides
 * something that needs a person. A 401 is the interesting middle case: it is kept, because
 * the session can come back, and a supervisor should not lose a recorded gas test to an
 * expired token.
 *
 * A 409 is the one worth naming. It is how the server reports that the permit moved under
 * the record — closed, suspended, superseded — and no retry resolves that either, so it
 * goes to a person with the permit's current state in front of them.
 */
export function shouldRetry(code: string | undefined): boolean {
  return code === 'network' || code === 'unauthenticated' || code === 'request_failed'
}

export const isStale = (op: QueuedOp, now = Date.now()) =>
  now - new Date(op.queuedAt).getTime() > STALE_AFTER_MS

/** Waiting on a network. */
export const pending = (ops: QueuedOp[], now = Date.now()) =>
  ops.filter((o) => !o.blocked && !isStale(o, now))

/** Waiting on a person: refused by the server, or stuck long enough to need a look. */
export const needsAttention = (ops: QueuedOp[], now = Date.now()) =>
  ops.filter((o) => o.blocked || isStale(o, now))

/** A short, stable key the server uses to recognise a replay. */
export const newClientRef = () =>
  // randomUUID needs a secure context, which a plain-http staging host is not.
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export interface EnqueueInput<P> {
  userId: string
  kind: string
  label: string
  payload: P
  files?: QueuedFile[]
  clientRef?: string
}

/** Records something the field did. Returns the entry, whose clientRef every retry reuses. */
export async function enqueue<P>(
  input: EnqueueInput<P>,
  store: OutboxStore = defaultStore,
): Promise<QueuedOp<P>> {
  const op: QueuedOp<P> = {
    clientRef: input.clientRef ?? newClientRef(),
    userId: input.userId,
    kind: input.kind,
    label: input.label,
    payload: input.payload,
    files: input.files,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  }
  await store.put(op as QueuedOp)
  return op
}

export const read = (userId: string, store: OutboxStore = defaultStore) => store.all(userId)

export const remove = (clientRef: string, store: OutboxStore = defaultStore) =>
  store.remove(clientRef)

async function patch(
  userId: string,
  clientRef: string,
  change: (op: QueuedOp) => QueuedOp,
  store: OutboxStore,
) {
  const op = (await store.all(userId)).find((o) => o.clientRef === clientRef)
  if (op) await store.put(change(op))
}

export const recordFailure = (
  userId: string, clientRef: string, message: string, blocked = false,
  store: OutboxStore = defaultStore,
) => patch(userId, clientRef, (op) => ({
  ...op,
  attempts: op.attempts + 1,
  lastError: message,
  blocked: blocked || op.blocked,
}), store)

/** Clears the blocked flag so a record can be tried again after somebody has looked at it. */
export const unblock = (userId: string, clientRef: string, store: OutboxStore = defaultStore) =>
  patch(userId, clientRef, (op) => ({ ...op, blocked: false }), store)

export interface DrainResult {
  sent: number
  failed: number
  remaining: number
}

export interface DrainOptions {
  /**
   * Are these records independent of one another?
   *
   * Permit records are not, which is the default: they are a sequence on one permit, so the
   * drain stops at the first transport failure (see the note where it does). Incident
   * reports are — each is a separate report of a separate event, and one of them failing is
   * no reason to leave the next injury unsent — so the incident outbox passes true and
   * every entry gets its attempt.
   */
  independent?: boolean
  /**
   * Which queue this is, for the one-drain-at-a-time guard below.
   *
   * One user has more than one queue — a permit's records and their incident reports — and
   * each has its own sender. Without this they would share the guard, and whichever asked
   * second would be handed the other one's drain and never send anything at all.
   */
  scope?: string
}

/**
 * One drain per user per queue at a time, for the whole tab.
 *
 * Each caller guards itself against overlapping with itself, and that was not enough: a hook
 * mounted twice — which React does on purpose in development — holds two separate guards, so
 * two drains read the same queue and send every record in it twice. The idempotency key
 * covers most of that (the server answers the second copy with the first one's result), but
 * it does not cover a file upload, which has no key of its own. Found by filing a near miss
 * offline with one photograph and watching two attachments land 155 ms apart.
 *
 * A second caller is handed the drain already running rather than a second one, because what
 * it wanted was for the queue to be attempted, and it is.
 */
const inFlight = new Map<string, Promise<DrainResult>>()

/**
 * Attempts every queued record once, oldest first.
 *
 * `send` is injected rather than imported so the rules above are testable without a browser
 * or an API, and so the dispatch from `kind` to an endpoint stays with the feature that owns
 * those endpoints.
 *
 * Sequential on purpose, and more strictly here than for incidents. These records are
 * ordered events on one permit — a gas test, then a toolbox talk, then entry — and sending
 * them concurrently would let them land out of order in a timeline somebody later reads as
 * the sequence of what happened. A phone that has just regained signal is also the worst
 * moment to open six connections at once.
 */
export function drain(
  userId: string,
  send: (op: QueuedOp) => Promise<unknown>,
  store: OutboxStore = defaultStore,
  now = Date.now(),
  opts: DrainOptions = {},
): Promise<DrainResult> {
  const key = `${opts.scope ?? ''}\u0000${userId}`
  const running = inFlight.get(key)
  if (running) return running
  const attempt = drainOnce(userId, send, store, now, opts)
    .finally(() => inFlight.delete(key))
  inFlight.set(key, attempt)
  return attempt
}

async function drainOnce(
  userId: string,
  send: (op: QueuedOp) => Promise<unknown>,
  store: OutboxStore,
  now: number,
  { independent = false }: DrainOptions,
): Promise<DrainResult> {
  const queue = await store.all(userId)
  let sent = 0
  let failed = 0

  for (const op of queue) {
    // Already refused, or old enough that retrying is no longer an honest answer. Left
    // alone; both are surfaced to the user rather than retried behind their back.
    if (op.blocked || isStale(op, now)) {
      failed += 1
      continue
    }
    try {
      await send(op)
      await store.remove(op.clientRef)
      sent += 1
    } catch (e) {
      const code = (e as { code?: string }).code
      const message = e instanceof Error ? e.message : 'Unknown error'
      await recordFailure(userId, op.clientRef, message, !shouldRetry(code), store)
      failed += 1
      /*
       * Stop at the first transport failure rather than working through the rest.
       *
       * Unless the caller says its records are independent of each other — which the
       * incident outbox does, because each entry is a separate report of a separate event.
       * Permit records are not independent: they are a sequence on one permit, and the
       * server rejects a record that arrives before the one it depends on — a toolbox
       * acknowledgement for a talk it has not been told about yet. Continuing past a dead
       * network would mark the whole chain failed, and on a 48-hour timer some of those
       * become "needs a person" for no reason beyond the order they were tried in.
       *
       * A refusal is different: that entry is now blocked and will be skipped next time, so
       * the queue behind it should get its turn either way.
       */
      if (!independent && shouldRetry(code)) break
    }
  }

  return { sent, failed, remaining: (await store.all(userId)).length }
}
