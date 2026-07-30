/**
 * Creates or drops a scratch database, for verifying that migrations apply cleanly to an
 * empty server. Connects to the maintenance database, so it never touches the working one.
 *
 *   tsx scripts/scratch-db.ts create safeops_migtest
 *   tsx scripts/scratch-db.ts drop   safeops_migtest
 */
import { PrismaClient } from '@prisma/client'

const [, , action, name] = process.argv
if (!action || !name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('usage: scratch-db.ts <create|drop> <db_name>')
  process.exit(1)
}

const url = new URL(process.env.DATABASE_URL!)
url.pathname = '/postgres'
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })

// CREATE/DROP DATABASE cannot run inside a transaction, which is why this uses the
// unsafe raw escape hatch. `name` is validated against a strict allowlist above.
await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
if (action === 'create') {
  await db.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
}
console.log(`${action}d ${name}`)
await db.$disconnect()
