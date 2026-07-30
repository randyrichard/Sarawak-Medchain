/**
 * Counts the SQL each service operation issues, to find N+1 patterns.
 *
 * Calls the services directly with an instrumented Prisma client. Going through HTTP
 * would be more realistic but the queries happen in the API process, where this script
 * cannot see them — and an N+1 is invisible in a latency number until the dataset grows.
 *
 * A count that scales with the number of rows returned is the signal. A count that stays
 * flat as the dataset grows is fine, however large it is.
 *
 *   tsx scripts/query-probe.ts
 */
import { PrismaClient } from '@prisma/client'
import { IncidentService } from '../src/lib/incidentService.js'
import { PermitService } from '../src/lib/permitService.js'
import { InspectionService } from '../src/lib/inspectionService.js'
import { AuditService } from '../src/lib/auditService.js'
import { TrainingService } from '../src/lib/trainingService.js'
import { ActivityService } from '../src/lib/activityService.js'

const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
let count = 0
db.$on('query' as never, () => { count++ })

const COMPANY = 'big'
const caller = {
  userId: 'probe', name: 'Probe', email: 'probe@demo.safeops.app',
  roles: [{ companyId: COMPANY, role: 'admin' as const, siteIds: [] as string[] }],
}

const incidents = new IncidentService(db)
const permits = new PermitService(db)
const inspections = new InspectionService(db)
const audits = new AuditService(db)
const training = new TrainingService(db)
const activity = new ActivityService(db)

/** Runs an operation and reports how much SQL it took and how many rows came back. */
async function probe(name: string, fn: () => Promise<unknown>) {
  await fn() // warm-up, so connection setup is not counted
  count = 0
  const t0 = performance.now()
  const result = await fn()
  const ms = performance.now() - t0
  await new Promise((r) => setTimeout(r, 60)) // let the query events land
  const rows = Array.isArray(result)
    ? result.length
    : Array.isArray((result as { rows?: unknown[] })?.rows)
      ? (result as { rows: unknown[] }).rows.length
      : 1
  const perRow = rows > 1 ? (count / rows).toFixed(2) : '—'
  console.log(
    `${name.padEnd(30)} ${String(count).padStart(4)} queries  ${ms.toFixed(0).padStart(4)}ms` +
    `  ${String(rows).padStart(4)} rows  ${perRow.padStart(5)} q/row`,
  )
  return { count, rows }
}

console.log('\noperation                       sql        time   rows   ratio')
console.log('─'.repeat(70))

const suspects: string[] = []
const check = (name: string, r: { count: number; rows: number }) => {
  // More than one query per row returned is the shape of an N+1.
  if (r.rows > 3 && r.count > r.rows) suspects.push(`${name} (${r.count} queries for ${r.rows} rows)`)
}

check('incidents.list', await probe('incidents.list', () => incidents.list(caller, { companyId: COMPANY, page: 1, pageSize: 100 })))
check('incidents.listActions', await probe('incidents.listActions', () => incidents.listActions(caller, COMPANY, { page: 1, pageSize: 100 })))
await probe('incidents.stats', () => incidents.stats(caller, COMPANY, null))
check('permits.list', await probe('permits.list', () => permits.list(caller, { companyId: COMPANY, page: 1, pageSize: 100 })))
check('assets.list', await probe('assets.list', () => inspections.listAssets(caller, { companyId: COMPANY, page: 1, pageSize: 100 })))
await probe('assets.stats', () => inspections.assetStats(caller, COMPANY, null))
check('audits.list', await probe('audits.list', () => audits.listAudits(caller, { companyId: COMPANY, page: 1, pageSize: 100 })))
await probe('audits.stats', () => audits.auditStats(caller, COMPANY))
await probe('training.matrix', () => training.trainingMatrix(caller, COMPANY))
await probe('training.stats', () => training.trainingStats(caller, COMPANY))
check('training.certificates', await probe('training.certificates', () => training.listCertificates(caller, { companyId: COMPANY })))
await probe('activity.timeline', () => activity.list(caller, COMPANY, null))

console.log('─'.repeat(70))
console.log(suspects.length === 0 ? 'No N+1 pattern found.' : `N+1 SUSPECTS: ${suspects.join(' · ')}`)

await db.$disconnect()
