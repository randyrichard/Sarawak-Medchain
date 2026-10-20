/*
 * Making a record that was taken offline land exactly once, at the time it was taken.
 *
 * Two problems, both created by the queue in the browser (web/src/lib/fieldOutbox), and
 * both of which the server has to solve because the client cannot.
 *
 * 1. The same record arrives twice. A phone that regains signal with the app open in two
 *    tabs drains the queue twice; a request interrupted mid-flight leaves the device unable
 *    to know whether it landed, so it tries again. A duplicate suspension is harmless. A
 *    duplicate gas test is a reading nobody took, and a duplicate entry record puts one man
 *    into a confined space twice in the log whose only job is to say who is in there.
 *
 * 2. The record is about a moment that has passed. A gas test taken at 09:15 and synced at
 *    14:00 is a 09:15 test. Filed at 14:00 it becomes a re-test that never happened, and the
 *    hours the space went unmonitored vanish from the record — which is the specific thing
 *    a confined-space audit is looking for.
 *
 * The device is the only witness to either, and it is also the least trustworthy thing in
 * the system: a site phone's clock is set by whoever holds it. So its timestamp is accepted
 * as a claim and validated, never taken as given.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { DomainError } from '../domain/errors.js'

/** What a queued record carries beyond its own payload. */
export interface FieldRecordMeta {
  /** Idempotency key, generated once by the device and reused on every attempt. */
  clientRef?: string
  /** When the field did it, as the device reported. ISO 8601. */
  recordedAt?: string
}

/**
 * How far ahead of the server a device's clock may be and still be believed.
 *
 * A few minutes either way is a phone clock, not a mistake — the same allowance incident
 * reporting makes for `occurredAt`. Beyond that the time is wrong rather than skewed, and
 * the server's own clock is the better answer.
 */
export const CLOCK_SKEW_MS = 10 * 60 * 1000

/**
 * How far back a queued record may claim to come from.
 *
 * The queue stops retrying on its own after 48 hours and asks a human, so anything older
 * than that has been sitting in front of somebody. Seven days is that with room for a
 * phone left in a locker over a long weekend; older than that and the record is being
 * replayed from a backup or constructed, and it should not silently become history.
 */
export const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A device's claim about when something happened, refused.
 *
 * A DomainError so the central handler answers it with 400 and its message, rather than the
 * 500 a plain Error would become — and 400 is the right answer: the queue reads it as a
 * payload no retry will fix, stops the timer, and puts the record in front of a person.
 * Which is exactly what a phone with a wrong clock needs.
 */
export class FieldRecordError extends DomainError {
  constructor(code: 'validation', message: string) {
    super(code, message, 400)
  }
}

/**
 * The time to file a queued record under.
 *
 * Returns the server's own clock when the device said nothing, which is every write made
 * with a connection — so a normal action behaves exactly as it did before offline capture
 * existed.
 *
 * `latest` is the caller's own ceiling, where one applies: a gas test cannot predate the
 * permit it is on, and an entry cannot be recorded after the permit was closed. Passing it
 * is what stops a wrong clock writing a reading into a window where the permit was not even
 * live.
 */
export function recordedAtOf(
  meta: FieldRecordMeta | undefined,
  now = new Date(),
  bounds: { earliest?: Date } = {},
): Date {
  if (!meta?.recordedAt) return now

  const at = new Date(meta.recordedAt)
  if (Number.isNaN(at.getTime())) {
    throw new FieldRecordError('validation', 'The time this was recorded is not a valid date.')
  }
  if (at.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new FieldRecordError(
      'validation',
      'This record is dated in the future. Check the clock on the device that made it.',
    )
  }
  if (at.getTime() < now.getTime() - MAX_BACKDATE_MS) {
    throw new FieldRecordError(
      'validation',
      'This record is more than a week old. It cannot be filed automatically — a supervisor has to enter it.',
    )
  }
  /*
   * Before the thing it is attached to existed. A phone whose clock is a month slow would
   * otherwise write a gas test into a period when the permit had not been raised, and the
   * trail would read as a test against nothing.
   */
  if (bounds.earliest && at.getTime() < bounds.earliest.getTime()) {
    throw new FieldRecordError(
      'validation',
      'This record is dated before the permit it belongs to. Check the clock on the device that made it.',
    )
  }
  /*
   * Never later than now, even within the tolerated skew. The skew allowance exists so a
   * slightly fast phone is not refused outright, not so the record can sit in the future:
   * a timeline with an event after the present reads as corrupt, and sorts wrongly.
   */
  return at.getTime() > now.getTime() ? now : at
}

/**
 * Has this record already been accepted?
 *
 * Called before the work, so an ordinary replay — minutes or hours later, the usual case —
 * costs one indexed lookup and does nothing else. The race where two copies arrive together
 * is caught by the unique constraint instead; see `claim` and `isReplay`.
 */
export async function alreadyAccepted(
  db: PrismaClient,
  companyId: string,
  clientRef: string | undefined,
): Promise<boolean> {
  if (!clientRef) return false
  const found = await db.fieldRecord.findFirst({
    where: { companyId, clientRef },
    select: { id: true },
  })
  return found !== null
}

/**
 * Claims the key, inside the transaction that does the work.
 *
 * In the same transaction on purpose. Claiming first and then working would lose a record
 * if the process died in between — the key taken, the gas test never written, and every
 * retry answered "already done". Working first and then claiming would duplicate it. One
 * transaction has neither failure: both the claim and the work commit, or neither does.
 *
 * No-op without a key, which is what every write made with a connection looks like.
 */
export async function claim(
  tx: Prisma.TransactionClient,
  meta: FieldRecordMeta | undefined,
  about: { companyId: string; operation: string; subjectId?: string; userId: string; recordedAt: Date },
): Promise<void> {
  if (!meta?.clientRef) return
  await tx.fieldRecord.create({
    data: {
      companyId: about.companyId,
      clientRef: meta.clientRef,
      operation: about.operation,
      subjectId: about.subjectId ?? null,
      userId: about.userId,
      // Stored only when the device actually claimed a time. Otherwise this row's own
      // createdAt is the whole truth, and a copy of it would imply a field measurement.
      recordedAt: meta.recordedAt ? about.recordedAt : null,
    },
  })
}

/**
 * Did this transaction fail because another copy of the same record got there first?
 *
 * P2002 on FieldRecord's unique key, and nothing else — a duplicate somewhere else in the
 * same transaction is a real error and must not be swallowed as a replay.
 */
export function isReplay(e: unknown): boolean {
  const err = e as { code?: string; meta?: { modelName?: string; target?: unknown } }
  if (err?.code !== 'P2002') return false
  if (err.meta?.modelName === 'FieldRecord') return true
  // Older client versions report the constraint's columns instead of the model.
  const target = err.meta?.target
  const cols = Array.isArray(target) ? target.join(',') : String(target ?? '')
  return cols.includes('clientRef')
}

/**
 * Did this fail because the row the device *named* is already there?
 *
 * The other half of the same problem, for a record that creates a row rather than changing
 * one. A JSA step written at the job carries a name the device generated (`clientId`), and
 * that name is unique per permit — so two copies of the same queued row racing each other
 * end with one of them losing on that index rather than on the idempotency key.
 *
 * Worth telling apart from any other duplicate in the same transaction, which is a real
 * error: swallowing one of those as a replay would answer a genuine conflict with somebody
 * else's row.
 */
export function isNamedRowClash(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } }
  if (err?.code !== 'P2002') return false
  const target = err.meta?.target
  const cols = Array.isArray(target) ? target.join(',') : String(target ?? '')
  return cols.includes('clientId')
}
