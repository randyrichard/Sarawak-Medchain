/**
 * Checks that a database is whole — after a restore, before trusting it.
 *
 * `pg_restore` exiting zero means the file was readable, not that the result is a database
 * anybody should serve customers from. A dump taken mid-write, a restore that ran out of
 * disk, or the wrong file entirely all produce something that starts and answers queries;
 * what they do not produce is a *consistent* set of rows. This is the difference between
 * "the command succeeded" and "my customer's incident register is actually here".
 *
 * Strictly read-only. It opens a transaction for nothing, writes nothing, and can be run
 * against production whenever somebody wants reassurance.
 *
 *   node dist/cli/verifyRestore.js
 *   npm run db:verify
 *
 * Exit code 0 means the structure is sound. Non-zero means do not put customers on it.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** Tables whose emptiness or absence would mean the restore did not bring the product. */
const CORE = ['Company', 'Site', 'User', 'Membership'] as const

interface Orphan { label: string; sql: string }

/*
 * Rows whose tenant or parent no longer exists.
 *
 * A partial restore is the dangerous case, because it looks fine: the schema is there and
 * queries answer. These are the joins that a torn restore breaks first, and every one of
 * them is a foreign key the application relies on being true.
 */
const ORPHAN_CHECKS: Orphan[] = [
  {
    label: 'sites whose company is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Site" s LEFT JOIN "Company" c ON c.id = s."companyId" WHERE c.id IS NULL',
  },
  {
    label: 'memberships whose company is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Membership" m LEFT JOIN "Company" c ON c.id = m."companyId" WHERE c.id IS NULL',
  },
  {
    label: 'memberships whose user is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Membership" m LEFT JOIN "User" u ON u.id = m."userId" WHERE u.id IS NULL',
  },
  {
    label: 'incidents whose company is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Incident" i LEFT JOIN "Company" c ON c.id = i."companyId" WHERE c.id IS NULL',
  },
  {
    label: 'incidents whose site is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Incident" i LEFT JOIN "Site" s ON s.id = i."siteId" WHERE s.id IS NULL',
  },
  {
    label: 'corrective actions whose company is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "CorrectiveAction" a LEFT JOIN "Company" c ON c.id = a."companyId" WHERE c.id IS NULL',
  },
  {
    label: 'permits whose company is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Permit" p LEFT JOIN "Company" c ON c.id = p."companyId" WHERE c.id IS NULL',
  },
  {
    label: 'invitations whose user is missing',
    sql: 'SELECT COUNT(*)::int AS n FROM "Invitation" i LEFT JOIN "User" u ON u.id = i."userId" WHERE u.id IS NULL',
  },
]

async function count(sql: string): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ n: number }[]>(sql)
  return Number(rows[0]?.n ?? 0)
}

async function main() {
  const problems: string[] = []

  // ── Can we even reach it ───────────────────────────────────────────────────
  try {
    await db.$queryRaw`SELECT 1`
  } catch (e) {
    console.error(`Cannot reach the database: ${e instanceof Error ? e.message : e}`)
    process.exitCode = 1
    return
  }

  // ── Schema state ───────────────────────────────────────────────────────────
  /*
   * Read from Prisma's own ledger rather than `migrate status`, because that command needs
   * the migrations directory and this has to be runnable against a restored database from
   * anywhere. A failed or rolled-back migration is the clearest sign that the restore
   * landed on a schema nobody should serve from.
   */
  let applied = 0
  try {
    applied = await count('SELECT COUNT(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')
    /*
     * Only migrations that are unfinished AND not rolled back.
     *
     * A row carrying `rolled_back_at` is a failure somebody already dealt with - it is what
     * `prisma migrate resolve --rolled-back` leaves behind, and a retried migration keeps
     * the abandoned row beside the successful one for good. Prisma itself ignores those and
     * reports the database up to date. Counting them as problems made this tool cry wolf on
     * a perfectly healthy database, which is worse than not having it: the one time it
     * matters, somebody halts a legitimate restore over a scar from a year ago.
     *
     * What is genuinely wrong is a migration that started and neither finished nor was
     * rolled back: interrupted, still holding whatever half-state it reached.
     */
    const stuck = await count('SELECT COUNT(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL')
    if (stuck > 0) {
      problems.push(`${stuck} migration(s) started and never finished — the schema is mid-change`)
    }
  } catch {
    problems.push('no _prisma_migrations table — this database has never been migrated')
  }

  console.log(`migrations applied: ${applied}`)

  // ── Core tables ────────────────────────────────────────────────────────────
  const counts: Record<string, number> = {}
  for (const table of CORE) {
    try {
      counts[table] = await count(`SELECT COUNT(*)::int AS n FROM "${table}"`)
    } catch {
      problems.push(`table "${table}" is missing`)
    }
  }
  console.log('core rows:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '))

  // A restored database with companies but no users is one nobody can sign in to.
  if ((counts.Company ?? 0) > 0 && (counts.User ?? 0) === 0) {
    problems.push('companies exist but there are no users — nobody could sign in to this')
  }

  // ── Referential integrity ──────────────────────────────────────────────────
  for (const check of ORPHAN_CHECKS) {
    try {
      const n = await count(check.sql)
      if (n > 0) problems.push(`${n} ${check.label}`)
    } catch (e) {
      problems.push(`could not check ${check.label}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // ── Per-tenant summary ─────────────────────────────────────────────────────
  /*
   * Printed so a human can recognise their own deployment. Structural checks pass happily
   * on a restore of the wrong backup; only somebody who knows the customers can see that
   * a company is missing or a year of incidents is not there.
   */
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; name: string; sites: number; users: number; incidents: number }[]>(`
      SELECT c.id, c.name,
             (SELECT COUNT(*)::int FROM "Site" s WHERE s."companyId" = c.id)       AS sites,
             (SELECT COUNT(*)::int FROM "Membership" m WHERE m."companyId" = c.id) AS users,
             (SELECT COUNT(*)::int FROM "Incident" i WHERE i."companyId" = c.id)   AS incidents
      FROM "Company" c ORDER BY c.name
    `)
    if (rows.length) {
      console.log('\ntenants:')
      for (const r of rows) {
        console.log(`  ${r.name} (${r.id}): ${r.sites} site(s), ${r.users} user(s), ${r.incidents} incident(s)`)
      }
      console.log('\nCheck this list against what you expect. A structurally sound restore of')
      console.log('the wrong backup looks exactly like a correct one from here.')
    }
  } catch { /* covered by the core-table check above */ }

  // ── Verdict ────────────────────────────────────────────────────────────────
  if (problems.length) {
    console.error('\nPROBLEMS FOUND:')
    for (const p of problems) console.error(`  - ${p}`)
    console.error('\nDo not put customers on this database until these are explained.')
    process.exitCode = 1
    return
  }
  console.log('\nStructure is sound: schema migrated, core tables present, no orphaned rows.')
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
