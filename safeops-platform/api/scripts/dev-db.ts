import EmbeddedPostgres from 'embedded-postgres'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Local PostgreSQL for development and testing.
 *
 * Runs the official PostgreSQL binaries as an ordinary user process, so a real database
 * is available without Docker or administrator rights. Production uses the Postgres
 * service defined in ../docker-compose.yml — same engine, same wire protocol, same
 * Prisma schema, so behaviour validated here holds there.
 *
 *   npm run db:start     # start (and initialise on first run)
 *   npm run db:stop      # stop
 */
const DATA_DIR = resolve(process.cwd(), '.pgdata')
const PORT = 5433
const USER = 'safeops'
const PASSWORD = 'safeops'

mkdirSync(DATA_DIR, { recursive: true })

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
})

const action = process.argv[2] ?? 'start'

async function start() {
  try {
    await pg.initialise()
    console.log('[dev-db] cluster initialised')
  } catch {
    console.log('[dev-db] cluster already initialised, reusing')
  }

  await pg.start()
  console.log(`[dev-db] postgres listening on localhost:${PORT}`)

  try {
    await pg.createDatabase('safeops')
    console.log('[dev-db] database "safeops" created')
  } catch {
    console.log('[dev-db] database "safeops" already exists')
  }

  console.log(`[dev-db] DATABASE_URL=postgresql://${USER}:${PASSWORD}@localhost:${PORT}/safeops?schema=public`)
}

async function stop() {
  await pg.stop()
  console.log('[dev-db] stopped')
}

if (action === 'stop') {
  await stop()
} else {
  await start()
}
