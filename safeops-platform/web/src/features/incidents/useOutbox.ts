import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import type { NewIncidentInput } from '@/api/incidents'
import { useAuth } from '@/features/auth/AuthContext'
import { useActor } from './lib'
import { drain, needsAttention, pending, readOutbox, type QueuedReport } from './outbox'

/**
 * Sends queued reports when there is a network, and tells the UI what is still waiting.
 *
 * Three triggers, and each exists for a case the others miss:
 *
 *   - mount, because the usual sequence is that the phone was closed with a report queued
 *     and is opened again somewhere with signal;
 *   - the browser's `online` event, for the app left open in a pocket as someone walks back
 *     into coverage;
 *   - a slow interval, because `online` is not trustworthy. It fires when an interface comes
 *     up, which on a site means joining a wifi network that has no route out. A phone can sit
 *     "online" for an hour with nothing reachable, and a report should not have to wait for a
 *     reload to notice the connection came back.
 */
const RETRY_INTERVAL_MS = 2 * 60 * 1000

export interface OutboxState {
  queue: QueuedReport[]
  /** Waiting on a network. */
  waiting: number
  /** Waiting on a person: refused by the server, or stuck long enough to need a look. */
  stuck: number
  draining: boolean
  /** Force an attempt now — what a "Try now" button calls. */
  flush: () => Promise<void>
}

export function useOutbox(): OutboxState {
  const { user } = useAuth()
  const actor = useActor()
  const [queue, setQueue] = useState<QueuedReport[]>([])
  const [draining, setDraining] = useState(false)

  const userId = user?.id ?? null

  /*
   * `actor` is a fresh object on every render - useActor builds a literal - and reading the
   * queue produces a fresh array. Both of those fed the retry loop below, and together they
   * span a genuine infinite loop: unstable actor changed `flush`'s identity, that re-ran the
   * effect, the effect drained, the drain set state, the state caused a render, and round
   * again. Measured before the fix: 2,004 send attempts for one queued report in four
   * seconds, every one of them a POST at a real server.
   *
   * So nothing that changes per render is allowed to be an effect dependency. The current
   * actor lives in a ref the effect reads at call time, and `setQueue` only fires when the
   * queue has actually changed.
   */
  const actorRef = useRef(actor)
  actorRef.current = actor

  const refresh = useCallback(() => {
    if (!userId) {
      setQueue((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const next = readOutbox(userId)
    setQueue((prev) => (sameQueue(prev, next) ? prev : next))
  }, [userId])

  const flush = useCallback(async () => {
    if (!userId || readOutbox(userId).length === 0) return

    setDraining(true)
    try {
      await drain(userId, (input: NewIncidentInput, clientRef: string) =>
        // The key travels with the payload rather than being regenerated, which is what
        // lets the server recognise a replay instead of filing the injury twice.
        api.createIncident({ ...input, clientRef }, actorRef.current))
    } finally {
      setDraining(false)
      refresh()
    }
  }, [userId, refresh])

  // Read by the effect so its own identity never has to change.
  const flushRef = useRef(flush)
  flushRef.current = flush

  useEffect(() => {
    refresh()
    if (!userId) return

    // Guards a single attempt at a time. Two overlapping drains would send a report twice —
    // survivable, because of the idempotency key, but that key is meant to be the backstop
    // rather than the mechanism.
    let running = false
    let cancelled = false

    const attempt = async () => {
      if (running || cancelled || !navigator.onLine) return
      running = true
      try {
        await flushRef.current()
      } finally {
        running = false
      }
    }

    void attempt()

    const onOnline = () => void attempt()
    // Another tab may have sent them; this keeps the count honest rather than showing a
    // queue that is already empty.
    const onStorage = () => refresh()

    window.addEventListener('online', onOnline)
    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(() => void attempt(), RETRY_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('storage', onStorage)
      window.clearInterval(timer)
    }
  }, [userId, refresh])

  return {
    queue,
    waiting: pending(queue).length,
    stuck: needsAttention(queue).length,
    draining,
    flush,
  }
}

/**
 * Would re-rendering with this queue tell the user anything new?
 *
 * Compares the fields the UI actually reads. Identity is not usable here: every read of the
 * queue parses fresh objects out of storage, so `prev !== next` is always true and using it
 * would reinstate the render loop this exists to prevent.
 */
function sameQueue(a: QueuedReport[], b: QueuedReport[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) =>
    x.clientRef === b[i].clientRef
    && x.attempts === b[i].attempts
    && !!x.blocked === !!b[i].blocked)
}
