import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import {
  drain, needsAttention, pending, read, type QueuedOp,
} from '@/lib/fieldOutbox/queue'
import { queueFor } from '@/lib/fieldOutbox/store'
import { PERMIT_OP_KINDS, sendPermitOp } from './offlineOps'

/*
 * The store, seen as only this queue.
 *
 * One store holds everything a user recorded, their incident reports included, and this
 * drain has no sender for a report: it would return without sending, throw nothing, and the
 * drain would take the report as delivered and delete it. So each feature reads the kinds it
 * owns, and nothing else.
 */
const permitQueue = queueFor(PERMIT_OP_KINDS)

/**
 * Sends permit records queued in the field, and tells the UI what is still waiting.
 *
 * The same three triggers the incident outbox arrived at, and each covers a case the others
 * miss (see features/incidents/useOutbox.ts for where this was learnt):
 *
 *   - mount, because the usual sequence is a phone closed at the job and opened again
 *     somewhere with signal;
 *   - the browser's `online` event, for the app left open in a pocket on the walk back;
 *   - a slow interval, because `online` is not trustworthy. It fires when an interface comes
 *     up, which on a site means joining a plant wifi network with no route out. A phone can
 *     sit "online" for an hour with nothing reachable, and a gas test should not have to
 *     wait for a reload to notice.
 */
const RETRY_INTERVAL_MS = 2 * 60 * 1000

export interface FieldQueueState {
  queue: QueuedOp[]
  /** Waiting on a network. */
  waiting: number
  /** Waiting on a person: refused by the server, or stuck long enough to need a look. */
  stuck: number
  draining: boolean
  /** Force an attempt now — what a "Send now" button calls. */
  flush: () => Promise<void>
  /** Re-read the queue, for a component that has just added to it. */
  refresh: () => void
}

export function useFieldQueue(): FieldQueueState {
  const { user } = useAuth()
  const [queue, setQueue] = useState<QueuedOp[]>([])
  const [draining, setDraining] = useState(false)

  const userId = user?.id ?? null

  const refresh = useCallback(() => {
    if (!userId) {
      setQueue((prev) => (prev.length === 0 ? prev : []))
      return
    }
    /*
     * Reading the store is asynchronous here where the incident outbox is synchronous, so
     * the result can arrive after the component has moved on to another user. Comparing
     * before setting keeps that from both a stale render and the render loop the incident
     * outbox had to be rescued from: every read produces fresh objects, so `prev !== next`
     * is always true and using it as the test would re-render forever.
     */
    void read(userId, permitQueue).then((next) => {
      setQueue((prev) => (sameQueue(prev, next) ? prev : next))
    }).catch(() => undefined)
  }, [userId])

  const flush = useCallback(async () => {
    if (!userId) return
    setDraining(true)
    try {
      await drain(userId, sendPermitOp, permitQueue, Date.now(), { scope: 'permit' })
    } finally {
      setDraining(false)
      refresh()
    }
  }, [userId, refresh])

  // Read by the effect so the effect's own identity never has to change.
  const flushRef = useRef(flush)
  flushRef.current = flush

  useEffect(() => {
    refresh()
    if (!userId) return

    // One attempt at a time. Two overlapping drains would send a record twice — survivable,
    // because of the idempotency key, but that key is meant to be the backstop rather than
    // the mechanism.
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
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void attempt(), RETRY_INTERVAL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [userId, refresh])

  return {
    queue,
    waiting: pending(queue).length,
    stuck: needsAttention(queue).length,
    draining,
    flush,
    refresh,
  }
}

/** Would re-rendering with this queue tell the user anything new? */
function sameQueue(a: QueuedOp[], b: QueuedOp[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) =>
    x.clientRef === b[i].clientRef
    && x.attempts === b[i].attempts
    && !!x.blocked === !!b[i].blocked)
}
