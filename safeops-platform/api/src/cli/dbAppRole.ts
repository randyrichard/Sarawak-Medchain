import { PrismaClient } from '@prisma/client'
import { env } from '../env.js'
import { ensureAppRole } from '../lib/dbRole.js'

/**
 * Entrypoint step: sets up the restricted login after migrations. See lib/dbRole.ts.
 * Connects with DATABASE_URL - the schema owner - which is the only account allowed to.
 */
async function main() {
  if (!env.APP_DB_PASSWORD) {
    console.warn('[safeops-api] APP_DB_PASSWORD not set: the service will connect as the schema owner and row-level security will not apply.')
    return
  }
  const owner = new PrismaClient({ datasourceUrl: env.DATABASE_URL })
  try {
    await ensureAppRole(owner, env.APP_DB_PASSWORD)
    console.log('[safeops-api] restricted database login ready (safeops_app)')
  } finally {
    await owner.$disconnect()
  }
}

main().catch((e) => {
  console.error('[safeops-api] could not set up the restricted database login:', e instanceof Error ? e.message : e)
  process.exit(1)
})
