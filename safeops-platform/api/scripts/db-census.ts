/**
 * Counts every table, and fingerprints the rows.
 *
 * Used to prove that a migration, a backup or a restore changed nothing it should not
 * have. A row count alone would miss a column silently emptied, so each table also gets
 * a hash over its ordered contents — if a single field changes anywhere, the digest moves.
 *
 *   tsx scripts/db-census.ts              print the census
 *   tsx scripts/db-census.ts --json       machine-readable, for diffing two runs
 */
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** Every model that holds tenant or platform data. */
const MODELS = [
  'user', 'membership', 'refreshToken', 'loginAttempt',
  'company', 'site', 'department', 'team', 'employee',
  'incident', 'incidentEvent', 'incidentComment', 'incidentAttachment',
  'correctiveAction', 'capaNote', 'counter',
  'permit', 'permitControl', 'isolationPoint', 'gasTest', 'permitSignature', 'permitEvent',
  'asset', 'assetDocument', 'inspection',
  'auditTemplate', 'audit', 'auditFinding', 'auditEvent',
  'complianceObligation', 'complianceDocument', 'documentVersion',
  'trainingCourse', 'trainingSession', 'sessionEnrolment', 'certificate',
  'roleDefinition', 'adminAuditEntry', 'apiKey', 'webhook', 'connectorConfig',
  'securityPolicy', 'orgSettings', 'orgConfigItem', 'retentionPolicy', 'backup',
  'notification', 'notificationRead',
] as const

/**
 * Fields excluded from the fingerprint.
 *
 * `updatedAt` moves whenever a row is touched even if nothing meaningful changed, and a
 * restore legitimately rewrites it. Including it would make every comparison fail for a
 * reason nobody cares about.
 */
const VOLATILE = new Set(['updatedAt'])

const stable = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !VOLATILE.has(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, stable(val)]),
    )
  }
  return v
}

const census: Record<string, { rows: number; digest: string }> = {}

for (const model of MODELS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (db as any)[model]
  if (!delegate?.findMany) {
    census[model] = { rows: -1, digest: 'MODEL NOT FOUND' }
    continue
  }
  let rows: unknown[]
  try {
    rows = await delegate.findMany()
  } catch {
    // The generated client knows every model in the current schema, but a database at an
    // earlier migration does not yet have all their tables. That is the normal state
    // during an upgrade test, not an error.
    census[model] = { rows: -1, digest: 'TABLE ABSENT' }
    continue
  }
  // Sorted by their serialised form so ordering differences between runs never matter.
  const serialised = rows.map((r) => JSON.stringify(stable(r))).sort()
  census[model] = {
    rows: rows.length,
    digest: createHash('sha256').update(serialised.join('\n')).digest('hex').slice(0, 16),
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(census, null, 1))
} else {
  const total = Object.values(census).reduce((s, c) => s + Math.max(0, c.rows), 0)
  for (const [model, c] of Object.entries(census)) {
    if (c.rows !== 0) console.log(`${model.padEnd(24)} ${String(c.rows).padStart(6)}  ${c.digest}`)
  }
  console.log(`${'TOTAL'.padEnd(24)} ${String(total).padStart(6)}`)
}

await db.$disconnect()
