/**
 * The worker's container health check: healthy while jobs keep being recorded.
 *
 * The worker has no HTTP port to probe. What matters is that work is happening, and the
 * evidence is JobRun: webhook delivery every 30 seconds, the reminder pass every
 * SCHEDULER_INTERVAL_MIN. Either going stale means the scheduler is stuck, the database is
 * unreachable, or nothing holds the lock. Exits 0 when fresh, 1 otherwise - which is all Docker reads.
 *
 *   node dist/cli/workerHealth.js
 */
import { PrismaClient } from '@prisma/client'

/** Webhook delivery runs every 30 s; a few minutes of silence means it has stopped. */
const WEBHOOKS_STALE_MS = 3 * 60_000
/**
 * The reminder pass runs every SCHEDULER_INTERVAL_MIN. Checking only the newest row let a
 * pass stuck for hours pass as healthy, because the webhook timer kept writing beside it.
 * Three intervals of slack, so a long pass is not killed for being long.
 */
const intervalMin = Number(process.env.SCHEDULER_INTERVAL_MIN) || 15
const PASS_STALE_MS = 3 * intervalMin * 60_000 + 60_000

async function main(): Promise<number> {
  const db = new PrismaClient()
  try {
    const rows = await db.jobRun.findMany({
      where: { job: { in: ['webhooks', 'reminders'] } },
      select: { job: true, lastFinishedAt: true },
    })
    const age = (job: string) => {
      const at = rows.find((r) => r.job === job)?.lastFinishedAt
      return at ? Date.now() - at.getTime() : Infinity
    }
    return age('webhooks') <= WEBHOOKS_STALE_MS && age('reminders') <= PASS_STALE_MS ? 0 : 1
  } catch {
    return 1
  } finally {
    await db.$disconnect()
  }
}

main().then((code) => process.exit(code))
