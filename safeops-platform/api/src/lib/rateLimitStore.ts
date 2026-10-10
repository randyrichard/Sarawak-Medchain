import type { PrismaClient } from '@prisma/client'
import type { Options, Store, ClientRateLimitInfo } from 'express-rate-limit'

/**
 * A rate-limit store backed by Postgres.
 *
 * The default store keeps counters in the process's memory, which does not survive the two
 * things that matter. A restart wipes every bucket, so a deploy — or an attacker who can
 * provoke a crash — hands out a fresh budget; that is not theoretical, it is how the login
 * throttle was cleared during testing, by restarting the container. And a second API
 * instance keeps its own counts, so the configured ceiling quietly becomes the ceiling
 * times the number of processes, which is the wrong direction for a control whose whole
 * job is to be an upper bound.
 *
 * Postgres rather than Redis because the database is already here — already deployed,
 * already backed up, already in the connection pool. Redis is the conventional answer and
 * is faster, but it is another service to run, secure and monitor in exchange for a counter,
 * and this product's compose file deliberately runs one API instance. If SafeChain ever runs
 * enough instances for the write rate to matter, Redis is the upgrade; the Store interface
 * is what makes that a swap rather than a rewrite.
 *
 * Cost is one statement per rate-limited request. Every module endpoint already reads the
 * database to check the session, so this adds a round trip to a request that was making one
 * anyway, against a table with a primary-key lookup and no relations.
 */
export class PrismaRateLimitStore implements Store {
  /** Set from the middleware's own options in init(), so the two cannot disagree. */
  private windowMs = 60_000
  private sweeper?: NodeJS.Timeout

  /** Distinguishes limiters that would otherwise share an IP's bucket. */
  readonly prefix: string

  /**
   * Tells express-rate-limit that these counters are shared.
   *
   * It uses this for its double-counting check. Saying `false` truthfully is also the
   * statement that makes this store worth having.
   */
  readonly localKeys = false

  constructor(private db: PrismaClient, prefix = 'global') {
    this.prefix = `${prefix}:`
  }

  init(options: Options): void {
    this.windowMs = options.windowMs

    /*
     * Finished windows are dead rows. Without a sweep the table grows by one row per unique
     * client per limiter, for ever.
     *
     * unref() so a pending sweep can never hold the process open during a shutdown, and a
     * long interval because nothing is waiting on this: a stale row is harmless, it is
     * simply reset by the next increment that touches it.
     */
    this.sweeper = setInterval(() => {
      void this.db.rateLimit
        .deleteMany({ where: { expiresAt: { lt: new Date() } } })
        .catch(() => { /* a failed sweep is not worth a log line every ten minutes */ })
    }, 10 * 60_000)
    this.sweeper.unref?.()
  }

  /**
   * Counts one hit and reports the running total.
   *
   * One statement, not a read followed by a write. A read-then-write races precisely when a
   * rate limiter is doing its job — many requests arriving at once — and the losing side of
   * that race is an attacker getting free attempts. `ON CONFLICT DO UPDATE` makes Postgres
   * take the row lock and do the arithmetic.
   *
   * The CASE is the window roll: if the stored window has already ended, this hit is the
   * first of a new one rather than the next of an expired one.
   */
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const full = this.prefix + key
    const expiresAt = new Date(Date.now() + this.windowMs)

    try {
      const rows = await this.db.$queryRaw<{ hits: number; expiresAt: Date }[]>`
        INSERT INTO "RateLimit" ("key", "hits", "expiresAt")
        VALUES (${full}, 1, ${expiresAt})
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = CASE
            WHEN "RateLimit"."expiresAt" <= NOW() THEN 1
            ELSE "RateLimit"."hits" + 1
          END,
          "expiresAt" = CASE
            WHEN "RateLimit"."expiresAt" <= NOW() THEN EXCLUDED."expiresAt"
            ELSE "RateLimit"."expiresAt"
          END
        RETURNING "hits", "expiresAt"
      `
      const row = rows[0]
      return { totalHits: row?.hits ?? 1, resetTime: row?.expiresAt ?? expiresAt }
    } catch {
      /*
       * The database is unreachable. Fail open, deliberately.
       *
       * Failing closed would turn a database blip into a total outage, and it would do so
       * for no security gain: every endpoint behind this limiter needs the same database to
       * check the session or answer the query, so a request allowed through here fails a
       * moment later anyway. The one thing this must not do is be the reason nobody can
       * report an injury.
       *
       * Returning a single hit rather than the real count means an outage temporarily
       * relaxes the ceiling. That is the accepted cost, and per-account lockout — which is
       * a durable column on User, not a counter here — still bounds password guessing.
       */
      return { totalHits: 1, resetTime: expiresAt }
    }
  }

  /** Used when a request turns out not to count (`skipSuccessfulRequests` and friends). */
  async decrement(key: string): Promise<void> {
    try {
      await this.db.$executeRaw`
        UPDATE "RateLimit"
        SET "hits" = GREATEST("hits" - 1, 0)
        WHERE "key" = ${this.prefix + key} AND "expiresAt" > NOW()
      `
    } catch { /* see increment: a counter that cannot be written is not worth an error */ }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.db.rateLimit.deleteMany({ where: { key: this.prefix + key } })
    } catch { /* as above */ }
  }

  async resetAll(): Promise<void> {
    try {
      await this.db.rateLimit.deleteMany({ where: { key: { startsWith: this.prefix } } })
    } catch { /* as above */ }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const row = await this.db.rateLimit.findUnique({ where: { key: this.prefix + key } })
      if (!row || row.expiresAt <= new Date()) return undefined
      return { totalHits: row.hits, resetTime: row.expiresAt }
    } catch {
      return undefined
    }
  }

  shutdown(): void {
    if (this.sweeper) clearInterval(this.sweeper)
  }
}
