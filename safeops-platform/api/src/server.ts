import { createApp } from './app.js'
import { env } from './env.js'
import { prisma } from './lib/prisma.js'

const app = createApp()
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[safeops-api] listening on :${env.PORT} (${env.NODE_ENV})`)
})

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[safeops-api] ${signal} received, draining…`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  // Don't hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
