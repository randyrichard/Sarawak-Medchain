/**
 * A realistic large tenant, for load testing: five years of a 30-site operator.
 *
 * Every test so far ran on the demo dataset - 16 incidents. This builds what a mid-sized
 * Malaysian operator would have after five years on SafeChain, on top of the demo company
 * ("big"), so the heavy screens can be measured against data of the size customers bring:
 *
 *   30 sites, ~14,000 workers  37,500 incidents (5% recordable, ~1% lost time)
 *   45,000 corrective actions  60,000 permits    50,000 visitors
 *   37,500 toolbox meetings    24 months of man-hours per site
 *
 * Deterministic (fixed seed), so two runs build the same tenant and timings compare.
 * Refused in production. Run after `npm run seed && npm run demo`:
 *
 *   DATABASE_URL=... npx tsx scripts/load-volume.ts
 */
import { PrismaClient } from '@prisma/client'

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to load test data into a production database.')
  process.exit(1)
}

const db = new PrismaClient()
const CO = 'big'
const YEARS = 5
const SITES = 30
const DAY = 86_400_000
const NOW = Date.now()

let seed = 20261004
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
const daysAgo = (max: number) => new Date(NOW - Math.floor(rnd() * max * DAY) - Math.floor(rnd() * DAY))

async function inBatches<T>(label: string, total: number, make: (i: number) => T, write: (rows: T[]) => Promise<unknown>) {
  const started = Date.now()
  for (let i = 0; i < total; i += 2000) {
    const rows = Array.from({ length: Math.min(2000, total - i) }, (_, k) => make(i + k))
    await write(rows)
  }
  console.log(`  ${label.padEnd(20)} ${total.toLocaleString().padStart(8)}  (${((Date.now() - started) / 1000).toFixed(1)}s)`)
}

async function main() {
  const existing = await db.site.findMany({ where: { companyId: CO }, select: { id: true } })
  const extra = Math.max(0, SITES - existing.length)
  await db.site.createMany({
    data: Array.from({ length: extra }, (_, i) => ({
      id: `load-site-${i + 1}`, companyId: CO, name: `Load Site ${String(i + 1).padStart(2, '0')}`, short: `LS${i + 1}`,
      headcount: 150 + Math.floor(rnd() * 450),
    })),
    skipDuplicates: true,
  })
  const sites = (await db.site.findMany({ where: { companyId: CO }, select: { id: true, headcount: true } }))
  console.log(`\nLoad tenant "${CO}": ${sites.length} sites, ${sites.reduce((s, x) => s + x.headcount, 0).toLocaleString()} workers\n`)

  const span = YEARS * 365
  // Mostly near misses and minor events; a realistic tail of recordables and lost time.
  const kinds = [
    ...Array(70).fill(['near_miss', 'near_miss', 0]), ...Array(20).fill(['first_aid', 'Minor', 1]),
    ...Array(5).fill(['property_damage', 'Moderate', 2]), ...Array(3).fill(['mtc', 'medical_treatment', 3]),
    ['rwc', 'restricted_work', 4], ['lti', 'lost_time_injury', 5],
  ] as [string, string, number][]

  const incidentIds: string[] = []
  await inBatches('incidents', 37_500, (i) => {
    const [type, severity, rank] = pick(kinds)
    const id = `load-inc-${i}`
    incidentIds.push(id)
    const at = daysAgo(span)
    return {
      id, number: `LOAD-INC-${i}`, companyId: CO, siteId: pick(sites).id, title: `Load incident ${i}`,
      type, severity, severityRank: rank, location: 'Area', occurredAt: at, reportedAt: at, reporter: 'Load Test',
      stage: NOW - at.getTime() > 60 * DAY ? 'closed' : pick(['reported', 'investigation', 'actions', 'closed']),
    }
  }, (rows) => db.incident.createMany({ data: rows as never, skipDuplicates: true }))

  // Days lost on the lost-time injuries, so the severity rate has something to add up.
  const ltis = await db.incident.findMany({ where: { companyId: CO, type: 'lti', id: { startsWith: 'load-' } }, select: { id: true } })
  await inBatches('injured persons', ltis.length, (i) => ({
    incidentId: ltis[i].id, role: 'injured', name: `Worker ${i}`, daysLost: 1 + Math.floor(rnd() * 20), addedBy: 'load',
  }), (rows) => db.incidentPerson.createMany({ data: rows as never }))

  await inBatches('corrective actions', 45_000, (i) => {
    const created = daysAgo(span)
    const due = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate() + 7 + Math.floor(rnd() * 30)))
    const open = NOW - created.getTime() < 45 * DAY && rnd() < 0.6
    const done = open ? null : new Date(Math.min(NOW, due.getTime() + (rnd() < 0.8 ? -1 : 1) * Math.floor(rnd() * 10) * DAY))
    return {
      code: `LOAD-CA-${i}`, companyId: CO, siteId: pick(sites).id, title: `Load action ${i}`, owner: 'Owner',
      incidentId: rnd() < 0.7 ? pick(incidentIds) : null, dueDate: due, priority: pick(['Low', 'Medium', 'High']),
      status: open ? pick(['open', 'in_progress']) : 'completed', completedAt: done, createdBy: 'load', createdAt: created,
    }
  }, (rows) => db.correctiveAction.createMany({ data: rows as never, skipDuplicates: true }))

  await inBatches('permits', 60_000, (i) => {
    const from = daysAgo(span)
    return {
      code: `LOAD-PTW-${i}`, companyId: CO, siteId: pick(sites).id, type: pick(['hot_work', 'confined_space', 'working_at_height', 'electrical_isolation', 'lifting_operation']),
      title: `Load permit ${i}`, location: 'Area', applicant: 'Applicant', validFrom: from,
      validTo: new Date(from.getTime() + (4 + Math.floor(rnd() * 8)) * 3600_000),
      status: NOW - from.getTime() < 12 * 3600_000 ? 'active' : 'closed', closedAt: NOW - from.getTime() < 12 * 3600_000 ? null : new Date(from.getTime() + 10 * 3600_000),
      createdBy: 'load',
    }
  }, (rows) => db.permit.createMany({ data: rows as never, skipDuplicates: true }))

  await inBatches('visitors', 50_000, (i) => {
    const at = daysAgo(span)
    return {
      code: `LOAD-VIS-${i}`, companyId: CO, siteId: pick(sites).id, name: `Visitor ${i}`, idNumber: `LV${i}`, passKey: `load-pass-${i}`,
      hostNameAtBooking: 'Host', createdBy: 'load', expectedArrival: at, expectedDeparture: new Date(at.getTime() + 8 * 3600_000),
      status: 'checked_out', checkedInAt: at, checkedOutAt: new Date(at.getTime() + 6 * 3600_000),
    }
  }, (rows) => db.visitor.createMany({ data: rows as never, skipDuplicates: true }))

  await inBatches('toolbox meetings', 37_500, (i) => ({
    companyId: CO, siteId: pick(sites).id, number: `LOAD-TBM-${i}`, heldAt: daysAgo(span), ledBy: 'Supervisor',
    topic: 'Daily brief', headcount: 10 + Math.floor(rnd() * 60), recordedBy: 'load', recordedById: 'load',
  }), (rows) => db.toolboxMeeting.createMany({ data: rows as never, skipDuplicates: true }))

  const now = new Date()
  await inBatches('man-hours (24 mo)', sites.length * 24, (i) => {
    const s = sites[Math.floor(i / 24)], back = i % 24
    return {
      companyId: CO, siteId: s.id, month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back - 1, 1)),
      hours: Math.round(s.headcount * (180 + rnd() * 30)), updatedBy: 'load',
    }
  }, (rows) => db.siteManHours.createMany({ data: rows as never, skipDuplicates: true }))

  await db.$executeRawUnsafe('ANALYZE')
  console.log('\nDone. Tables analysed.\n')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
