import type { PrismaClient } from '@prisma/client'

/**
 * Runs `fn` on at most one API instance at a time, across every replica.
 *
 * The scheduler and the webhook queue run inside the API process, so a second replica
 * runs them too. Without this, both would read the same due reminders and pending
 * deliveries: a reminder raised twice, a webhook - which its receiver cannot tell is a
 * duplicate - sent twice.
 *
 * A Postgres advisory lock decides who goes. It is taken inside a transaction
 * (`pg_try_advisory_xact_lock`), so it is released when that transaction ends - on
 * success, on error, and when the connection dies with the process. An instance that
 * crashes mid-pass can never leave the lock held. `try` rather than wait: an instance
 * that finds the lock taken skips this pass; the holder is already doing the work.
 *
 * The transaction only holds the lock. `fn` runs its queries through the normal client on
 * other pooled connections, so a pass is not one long transaction and its writes commit as
 * they go, exactly as they did before.
 */
export async function withLeaderLock<T>(
  db: PrismaClient,
  key: bigint,
  fn: () => Promise<T>,
  /**
   * Longest a pass may hold the lock. Past this Prisma ends the holding transaction, which
   * releases the lock while `fn` may still be running; it must comfortably exceed any real
   * pass, and is only there so a pass that hangs forever cannot hold the lock forever.
   */
  holdMs = 30 * 60_000,
): Promise<{ ran: true; value: T } | { ran: false }> {
  return db.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${key}) AS locked
      `
      if (!row?.locked) return { ran: false as const }
      return { ran: true as const, value: await fn() }
    },
    { timeout: holdMs, maxWait: 10_000 },
  )
}

/**
 * Lock keys. Fixed, distinct 64-bit numbers - an advisory lock is identified by its key
 * alone, so anything else in the database taking the same number would contend with it.
 */
export const LOCK_SCHEDULER_SWEEP = 0x5AFE0_0001n
export const LOCK_WEBHOOK_DELIVERY = 0x5AFE0_0002n
