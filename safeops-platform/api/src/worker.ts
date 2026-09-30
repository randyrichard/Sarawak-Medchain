/**
 * The background worker: reminder sweeps, scheduled reports and webhook delivery, and
 * nothing else.
 *
 * The same jobs used to run inside every API process. Split out, the API scales on
 * traffic and the worker on data, a slow sweep no longer shares an event loop with
 * requests, and the API can be restarted without interrupting a report mid-send. Same
 * image as the API, a different command (see docker-compose.prod.yml).
 *
 * More than one worker is safe - each pass takes a Postgres advisory lock (leaderLock.ts)
 * - but one is enough; a second only stands by.
 */
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { Scheduler } from './lib/scheduler.js'
import { INSTANCE } from './lib/jobRuns.js'

const scheduler = new Scheduler(prisma)
scheduler.start(env.SCHEDULER_INTERVAL_MIN * 60_000)
// eslint-disable-next-line no-console
console.log(`[safeops-worker] ${INSTANCE} running jobs every ${env.SCHEDULER_INTERVAL_MIN} min; scheduler running`)

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[safeops-worker] ${signal} received, stopping…`)
  scheduler.stop()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
