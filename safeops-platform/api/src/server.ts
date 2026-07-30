import { createApp } from './app.js'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { Scheduler } from './lib/scheduler.js'

const app = createApp()
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[safeops-api] listening on :${env.PORT} (${env.NODE_ENV})`)
})

/**
 * The reminder and escalation sweeps run here rather than in a separate worker: a pilot
 * is one instance, and a second process to supervise is a second thing to go wrong. If
 * the API is ever scaled out, set SCHEDULER_ENABLED=false on every instance but one.
 */
const scheduler = new Scheduler(prisma)
if (env.schedulerEnabled) {
  scheduler.start(env.SCHEDULER_INTERVAL_MIN * 60_000)
  // eslint-disable-next-line no-console
  console.log(`[safeops-api] scheduler running every ${env.SCHEDULER_INTERVAL_MIN} min`)
} else {
  // eslint-disable-next-line no-console
  console.log('[safeops-api] scheduler disabled (SCHEDULER_ENABLED=false)')
}

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[safeops-api] ${signal} received, draining…`)
  scheduler.stop()
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  // Don't hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
