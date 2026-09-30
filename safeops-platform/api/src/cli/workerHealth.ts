/**
 * The worker's container health check: healthy while jobs keep being recorded.
 *
 * The worker has no HTTP port to probe. What matters is that work is happening, and the
 * evidence is JobRun: webhook delivery runs every 30 seconds, so a row older than a few
 * minutes means the scheduler is stuck, the database is unreachable, or nothing holds the
 * lock. Exits 0 when fresh, 1 otherwise - which is all Docker reads.
 *
 *   node dist/cli/workerHealth.js
 */
import { PrismaClient } from '@prisma/client'

const STALE_AFTER_MS = 3 * 60_000

async function main(): Promise<number> {
  const db = new PrismaClient()
  try {
    const newest = await db.jobRun.findFirst({ orderBy: { lastFinishedAt: 'desc' }, select: { lastFinishedAt: true } })
    const age = newest?.lastFinishedAt ? Date.now() - newest.lastFinishedAt.getTime() : Infinity
    return age <= STALE_AFTER_MS ? 0 : 1
  } catch {
    return 1
  } finally {
    await db.$disconnect()
  }
}

main().then((code) => process.exit(code))
