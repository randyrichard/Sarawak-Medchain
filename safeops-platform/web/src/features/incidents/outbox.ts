import type { NewIncidentInput } from '@/api/incidents'

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
 * Storage is localStorage rather than IndexedDB deliberately. The whole payload is JSON —
 * attachments in the create call are metadata only (name, kind, size), never file bytes — so
 * a queued report is a couple of kilobytes, and localStorage is synchronous, which means a
 * queued item cannot be lost to a tab closing mid-write.
 */

/** Key is per user, so signing out on a shared site phone cannot expose someone else's queue. */
const KEY_PREFIX = 'safeops.outbox.incidents.'

/**
 * Older than this and we stop retrying on our own and ask a human.
 *
 * A report that has been failing for two days is not waiting for signal, it is waiting for
 * somebody to look at it — the session expired, the site was deleted, the payload is refused.
 * Retrying it silently forever would let the reporter believe it was filed.
 */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export interface QueuedReport {
  /** Idempotency key. Generated once and reused for every attempt — that is the point. */
  clientRef: string
  input: NewIncidentInput
  /** When the reporter pressed Submit, not when it was sent. */
  queuedAt: string
  attempts: number
  lastError?: string
  /**
   * The server looked at this report and refused it, so no amount of signal will help.
   *
   * Kept in the queue rather than deleted - it is still a report somebody filed, and
   * throwing it away silently is the one outcome worse than not sending it - but skipped by
   * the automatic drain, so a rejected payload is not re-sent every time the network
   * flickers. The UI shows these as needing a person.
   */
  blocked?: boolean
}

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`

export function readOutbox(userId: string): QueuedReport[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Anything malformed is dropped rather than thrown: a corrupt entry must not take the
    // whole queue — or the sign-in that reads it — down with it.
    return parsed.filter((r): r is QueuedReport =>
      !!r && typeof r === 'object'
      && typeof (r as QueuedReport).clientRef === 'string'
      && !!(r as QueuedReport).input)
  } catch {
    return []
  }
}

function write(userId: string, items: QueuedReport[]) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(items))
  } catch {
    // Quota exhausted or storage blocked (private mode, a locked-down device). Nothing
    // useful to do here, and throwing would lose the report the caller is holding.
  }
}

/** Adds a report to the queue. Returns the key the caller must reuse on every retry. */
export function enqueue(userId: string, input: NewIncidentInput, clientRef: string): QueuedReport {
  const item: QueuedReport = { clientRef, input, queuedAt: new Date().toISOString(), attempts: 0 }
  write(userId, [...readOutbox(userId), item])
  return item
}

export function remove(userId: string, clientRef: string) {
  write(userId, readOutbox(userId).filter((r) => r.clientRef !== clientRef))
}

export function recordFailure(userId: string, clientRef: string, message: string, blocked = false) {
  write(userId, readOutbox(userId).map((r) =>
    r.clientRef === clientRef
      ? { ...r, attempts: r.attempts + 1, lastError: message, blocked: blocked || r.blocked }
      : r))
}

/** Clears the blocked flag so a report can be tried again after somebody has looked at it. */
export function unblock(userId: string, clientRef: string) {
  write(userId, readOutbox(userId).map((r) =>
    r.clientRef === clientRef ? { ...r, blocked: false } : r))
}

/** Reports still waiting on the network, as opposed to waiting on a person. */
export const pending = (items: QueuedReport[], now = Date.now()) =>
  items.filter((r) => !r.blocked && !isStale(r, now))

/** Reports that will not move without somebody looking at them. */
export const needsAttention = (items: QueuedReport[], now = Date.now()) =>
  items.filter((r) => r.blocked || isStale(r, now))

export const isStale = (r: QueuedReport, now = Date.now()) =>
  now - new Date(r.queuedAt).getTime() > STALE_AFTER_MS

/**
 * Is this failure worth retrying?
 *
 * Only transport failures are. A 400 means the server looked at the report and refused it,
 * and it will refuse it identically in an hour — retrying that on a timer just hides a
 * report that needs a person. A 401 is the interesting middle case: it is kept, because the
 * session can come back, and the reporter should not lose a filed report to an expired
 * token.
 */
export function shouldRetry(code: string | undefined): boolean {
  return code === 'network' || code === 'unauthenticated' || code === 'request_failed'
}

export interface DrainResult {
  sent: number
  failed: number
  remaining: number
}

/**
 * Attempts every queued report once, oldest first.
 *
 * `send` is injected rather than imported so this is testable without a browser or an API,
 * which is the only way the retry rules above get tested at all.
 *
 * Sequential on purpose. These are writes, the queue is short, and a phone that has just
 * regained signal is the worst moment to open six connections at once.
 */
export async function drain(
  userId: string,
  send: (input: NewIncidentInput, clientRef: string) => Promise<unknown>,
  now = Date.now(),
): Promise<DrainResult> {
  const queue = readOutbox(userId)
  let sent = 0
  let failed = 0

  for (const item of queue) {
    // Already refused, or old enough that retrying is no longer an honest answer. Left
    // alone; both are surfaced to the user rather than retried behind their back.
    if (item.blocked || isStale(item, now)) {
      failed += 1
      continue
    }
    try {
      await send(item.input, item.clientRef)
      remove(userId, item.clientRef)
      sent += 1
    } catch (e) {
      const code = (e as { code?: string }).code
      const message = e instanceof Error ? e.message : 'Unknown error'
      // A transport failure keeps its place in the queue and will be tried again. A refusal
      // is marked blocked, so the drain stops re-sending a payload the server rejected.
      recordFailure(userId, item.clientRef, message, !shouldRetry(code))
      failed += 1
    }
  }

  return { sent, failed, remaining: readOutbox(userId).length }
}
