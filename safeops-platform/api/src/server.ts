import { createApp } from './app.js'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'
import { Scheduler } from './lib/scheduler.js'

/**
 * Says at boot whether this deployment can send mail.
 *
 * It could not, for weeks, and nothing said so. The product handled it correctly - links
 * were handed to administrators instead of being emailed, reports recorded as not sent -
 * but the operator's only way to find out was to open the Reports screen and read a field.
 * A password left as `APP_PASSWORD` deserves a line in the log the morning it is deployed,
 * not a discovery through a customer who never received an invitation.
 *
 * A warning rather than a refusal to start, for the reason in credentials.ts: mail being
 * off is a workable state, and taking the API down over it would be a poor trade.
 */
if (env.mail.problem) {
  // eslint-disable-next-line no-console
  console.warn(`[safeops-api] mail is NOT working: ${env.mail.problem}`)
  // eslint-disable-next-line no-console
  console.warn('[safeops-api] run "node dist/cli/verifyMail.js" once fixed to confirm it.')
} else if (env.mail.transport) {
  // eslint-disable-next-line no-console
  console.log(`[safeops-api] mail via ${env.mail.transport} as ${env.mail.from}`)
} else {
  // eslint-disable-next-line no-console
  console.log('[safeops-api] no mail transport configured; links are handed over in-app')
}

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
    // eslint-disable-next-line no-console
    console.log('[safeops-api] drained cleanly')
    process.exit(0)
  })

  /*
   * Drop idle keep-alive sockets immediately.
   *
   * `server.close()` stops accepting new connections but waits for existing ones, and an
   * idle keep-alive socket is an existing one. Every browser sitting on the dashboard holds
   * one open between polls, so with even a single tab open the callback above never fired:
   * the process waited out the failsafe and exited 1.
   *
   * That is what this deployment actually did - measured, not assumed. `docker stop` took
   * 11 seconds and the container reported exit code 1 on an ordinary restart. Earlier
   * testing showed a clean one-second stop only because nothing was connected to it.
   *
   * Two things made that worse than untidy. Docker's default stop grace is 10 seconds, so
   * the old failsafe was racing SIGKILL and losing on a slower host - in-flight requests
   * cut mid-write instead of drained. And a non-zero exit on a routine deploy is
   * indistinguishable from a crash to anything watching, which is how a real crash ends up
   * ignored.
   *
   * `closeIdleConnections()` drops only sockets with no request in flight, so anything
   * actually being served still completes.
   */
  server.closeIdleConnections()

  /*
   * Then a bounded grace for requests that were already mid-flight, after which they are
   * cut. Five seconds sits well inside Docker's ten, so the process decides its own exit
   * rather than being killed; a request still going at that point would not have survived
   * SIGKILL either.
   */
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.log('[safeops-api] forcing remaining connections closed')
    server.closeAllConnections()
  }, 5_000).unref()

  // Last resort, if even that leaves the event loop alive.
  setTimeout(() => process.exit(1), 8_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
