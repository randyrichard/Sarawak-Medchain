import { beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ensureAppRole } from '../lib/dbRole.js'

/**
 * Makes the suite run as the restricted login, with row-level security in force.
 *
 * vitest.config.ts sets APP_DB_PASSWORD, so lib/prisma.ts - the client every route uses -
 * connects as `safeops_app` and scopes each query to the caller's companies. Every HTTP
 * test is then also a test that the right scope reaches the database: a route that forgets
 * to set one reads nothing and fails its assertions. Service-level tests that build their
 * own `new PrismaClient()` connect as the owner, which policies do not bind, exactly as
 * migrations and backups do in production.
 *
 * The login is created here, as the owner, the same way the entrypoint creates it.
 */
beforeAll(async () => {
  const password = process.env.APP_DB_PASSWORD
  if (!process.env.DATABASE_URL || !password) return
  const owner = new PrismaClient()
  try {
    await ensureAppRole(owner, password)
  } finally {
    await owner.$disconnect()
  }
})
