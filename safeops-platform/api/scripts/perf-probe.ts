/**
 * Measures real endpoint latency and counts the SQL a request actually issues.
 *
 * Runs against the live API with a real session, so the numbers include auth, Prisma and
 * PostgreSQL — not a service call in isolation. Query counts come from Prisma's own event
 * stream, which is the only way to see an N+1 rather than infer one.
 *
 *   tsx scripts/perf-probe.ts [baseUrl]
 */
import { PrismaClient } from '@prisma/client'

const BASE = process.argv[2] ?? 'http://localhost:4000'
const EMAIL = 'admin@demo.safeops.app'
const PASSWORD = 'SafeOpsPlatform2026'
const COMPANY = 'big'

const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
let queries = 0
db.$on('query' as never, () => { queries++ })

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { accessToken: string }).accessToken
}

const ENDPOINTS: { name: string; path: string }[] = [
  { name: 'incidents.list', path: `/incidents?companyId=${COMPANY}&pageSize=100` },
  { name: 'incidents.stats', path: `/incidents/stats?companyId=${COMPANY}` },
  { name: 'actions.list', path: `/incidents/actions/list?companyId=${COMPANY}&pageSize=100` },
  { name: 'permits.list', path: `/permits?companyId=${COMPANY}&pageSize=100` },
  { name: 'permits.expiring', path: `/permits/expiring?companyId=${COMPANY}` },
  { name: 'assets.list', path: `/assets?companyId=${COMPANY}` },
  { name: 'assets.stats', path: `/assets/stats?companyId=${COMPANY}` },
  { name: 'audits.list', path: `/audits?companyId=${COMPANY}` },
  { name: 'audits.stats', path: `/audits/stats?companyId=${COMPANY}` },
  { name: 'training.matrix', path: `/training/matrix?companyId=${COMPANY}` },
  { name: 'training.stats', path: `/training/stats?companyId=${COMPANY}` },
  { name: 'training.certificates', path: `/training/certificates?companyId=${COMPANY}` },
  { name: 'activity.timeline', path: `/activity?companyId=${COMPANY}` },
  { name: 'notifications.list', path: `/notifications?companyId=${COMPANY}` },
  { name: 'admin.health', path: `/admin/health?companyId=${COMPANY}` },
  { name: 'org.sites', path: `/org/sites?companyId=${COMPANY}` },
]

const token = await login()
const auth = { Authorization: `Bearer ${token}` }

console.log('\nendpoint                    p50    p95   max   sql   rows/bytes  status')
console.log('─'.repeat(76))

const slow: string[] = []
for (const e of ENDPOINTS) {
  const times: number[] = []
  let status = 0
  let bytes = 0
  let sqlForOne = 0

  // Warm-up, excluded: the first call pays for connection setup and plan caching.
  await fetch(`${BASE}${e.path}`, { headers: auth })

  for (let i = 0; i < 10; i++) {
    if (i === 0) queries = 0
    const t0 = performance.now()
    const res = await fetch(`${BASE}${e.path}`, { headers: auth })
    const body = await res.text()
    times.push(performance.now() - t0)
    if (i === 0) {
      // Prisma events are async; give them a tick to land before reading the counter.
      await new Promise((r) => setTimeout(r, 60))
      sqlForOne = queries
    }
    status = res.status
    bytes = body.length
  }

  times.sort((a, b) => a - b)
  const p50 = times[Math.floor(times.length * 0.5)]
  const p95 = times[Math.floor(times.length * 0.95)]
  const max = times[times.length - 1]

  console.log(
    `${e.name.padEnd(26)} ${p50.toFixed(0).padStart(4)}ms ${p95.toFixed(0).padStart(4)}ms` +
    ` ${max.toFixed(0).padStart(4)}ms ${String(sqlForOne).padStart(4)} ${String(bytes).padStart(9)}b   ${status}`,
  )
  if (p95 > 400) slow.push(`${e.name} p95 ${p95.toFixed(0)}ms`)
  if (status >= 400) slow.push(`${e.name} returned ${status}`)
}

console.log('─'.repeat(76))
console.log(slow.length === 0 ? 'No endpoint over 400ms p95, no failures.' : `ATTENTION: ${slow.join(' · ')}`)
console.log(`heap used: ${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB\n`)

await db.$disconnect()
