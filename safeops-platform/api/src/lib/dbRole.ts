import type { PrismaClient } from '@prisma/client'
import { APP_DB_ROLE } from '../env.js'

/**
 * Creates or updates the restricted login the service runs as, and grants it what it needs.
 *
 * Run by the entrypoint after migrations, as the account that owns the schema. Idempotent:
 * every deploy re-runs it, which is also what grants the login any table a migration has
 * just added.
 *
 * What `safeops_app` may do: read and write rows, and use the id sequences. What it may not:
 * create, alter or drop anything; bypass row-level security; read the migrations table;
 * act as a superuser - so nothing it runs can reach `COPY ... TO PROGRAM` or another
 * database on the server.
 */
export async function ensureAppRole(owner: PrismaClient, password: string): Promise<void> {
  // ALTER ROLE takes no bind parameters, so the password is validated by env.ts to a
  // character set that needs no quoting, and checked again here before it is interpolated.
  if (!/^[A-Za-z0-9_\-.~+=]{16,128}$/.test(password)) throw new Error('APP_DB_PASSWORD has an unsupported format.')
  const exists = await owner.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ${APP_DB_ROLE}`
  const verb = exists[0].n > 0 ? 'ALTER' : 'CREATE'
  await owner.$executeRawUnsafe(
    `${verb} ROLE ${APP_DB_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
  )
  const dbName = (await owner.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`)[0].db
  for (const sql of [
    `GRANT CONNECT ON DATABASE "${dbName.replace(/"/g, '""')}" TO ${APP_DB_ROLE}`,
    `GRANT USAGE ON SCHEMA public TO ${APP_DB_ROLE}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_ROLE}`,
    `REVOKE ALL ON TABLE "_prisma_migrations" FROM ${APP_DB_ROLE}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_ROLE}`,
  ]) {
    await owner.$executeRawUnsafe(sql)
  }
}
