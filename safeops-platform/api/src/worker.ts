/**
 * The background worker: reminder sweeps, scheduled reports and webhook delivery, and
 * nothing else.
 *
 * The same jobs used to run inside every API process. Split out, the API scales on
 * traffic and the worker on data, the two can be deployed and restarted independently -
 * an API restart no longer interrupts a report mid-send - and a sweep's database work no
 * longer competes with requests for the API's connection pool. (Rendering a report was
 * measured and does not stall the event loop at current sizes: ~30 ms for a monthly
 * summary, streamed. CPU isolation is a side benefit, not the reason.) Same image as the API, a different command (see
 * docker-compose.prod.yml).
 *
 * More than one worker is safe - each pass takes a Postgres advisory lock (leaderLock.ts)
 * - but one is enough; a second only stands by.
 */
import { PrismaClient } from '@prisma/client'
import { env } from './env.js'
import { Scheduler } from './lib/scheduler.js'
import { INSTANCE } from './lib/jobRuns.js'
import { announceMail } from './lib/email/announce.js'
import { withConnectionLimit } from './lib/dbUrl.js'

/* eslint-disable no-console */

/** Connections this process may hold. Sweeps run one after another; a few is plenty. */
const POOL = Number(process.env.WORKER_DB_POOL_SIZE) || 5
/** How long a shutdown waits for work in flight. Keep under the container's stop grace. */
const DRAIN_MS = 25_000

announceMail('safeops-worker')

const db = new PrismaClient({
  datasources: { db: { url: withConnectionLimit(env.DATABASE_URL, POOL) } },
  log: ['warn', 'error'],
})
const scheduler = new Scheduler(db)
scheduler.start(env.SCHEDULER_INTERVAL_MIN * 60_000)
/*
 * Keeps the process alive. The scheduler's timers are unref'd so they never hold an API
 * process open on shutdown; in the API the HTTP server keeps the event loop running. The
 * worker has no server, so without this it ran one pass and exited cleanly - found by
 * running it, not by any test. Cleared on shutdown.
 */
const keepAlive = setInterval(() => {}, 60 * 60_000)
console.log(`[safeops-worker] ${INSTANCE} running jobs every ${env.SCHEDULER_INTERVAL_MIN} min (pool ${POOL}); scheduler running`)

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  console.log(`[safeops-worker] ${signal} received, finishing work in flight…`)
  clearInterval(keepAlive)
  const idle = await scheduler.drain(DRAIN_MS)
  console.log(idle
    ? '[safeops-worker] idle, stopping'
    : `[safeops-worker] work still running after ${DRAIN_MS / 1000}s; stopping anyway - the next pass recovers it`)
  await db.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
