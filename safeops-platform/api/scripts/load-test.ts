/**
 * Production load test.
 *
 * Simulates N users each doing what a person actually does — open the dashboard, read a
 * register, occasionally write something — rather than hammering one endpoint, because a
 * single-endpoint benchmark measures that endpoint and tells you nothing about the
 * connection pool, which is what actually runs out first.
 *
 *   tsx scripts/load-test.ts 100 30          100 virtual users, 30 seconds
 *   tsx scripts/load-test.ts 500 30
 *   tsx scripts/load-test.ts 1000 30
 *
 * Reports latency percentiles, error breakdown, database connections and the API process's
 * own memory, sampled throughout.
 */
import { PrismaClient } from '@prisma/client'

const USERS = Number(process.argv[2] ?? 100)
const SECONDS = Number(process.argv[3] ?? 30)
const BASE = process.argv[4] ?? 'http://localhost:4000'
const COMPANY = 'big'

const db = new PrismaClient()

// One session, shared by every virtual user. Logging in a thousand times would measure
// Argon2 — which is deliberately slow — instead of the application.
const auth = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'hse@demo.safeops.app', password: 'SafeOpsPlatform2026' }),
})
if (!auth.ok) throw new Error(`login failed: ${auth.status} — restart the API to clear the login throttle`)
const token = ((await auth.json()) as { accessToken: string }).accessToken
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

/** What one person does in a session, weighted towards reading. */
const JOURNEY: { name: string; path: string }[] = [
  { name: 'dashboard.incidents', path: `/incidents?companyId=${COMPANY}&pageSize=100` },
  { name: 'dashboard.stats', path: `/incidents/stats?companyId=${COMPANY}` },
  { name: 'dashboard.actions', path: `/incidents/actions/list?companyId=${COMPANY}&pageSize=100` },
  { name: 'dashboard.permits', path: `/permits/expiring?companyId=${COMPANY}` },
  { name: 'dashboard.assets', path: `/assets/stats?companyId=${COMPANY}` },
  { name: 'dashboard.audits', path: `/audits/stats?companyId=${COMPANY}` },
  { name: 'dashboard.training', path: `/training/stats?companyId=${COMPANY}` },
  { name: 'dashboard.activity', path: `/activity?companyId=${COMPANY}` },
  { name: 'dashboard.notifications', path: `/notifications?companyId=${COMPANY}` },
  { name: 'register.permits', path: `/permits?companyId=${COMPANY}&pageSize=100` },
  { name: 'register.assets', path: `/assets?companyId=${COMPANY}` },
  { name: 'register.audits', path: `/audits?companyId=${COMPANY}` },
  { name: 'register.training', path: `/training/matrix?companyId=${COMPANY}` },
]

const latencies: number[] = []
const byStatus = new Map<number, number>()
const byEndpoint = new Map<string, number[]>()
let inFlight = 0
let peakInFlight = 0
let stop = false

const hit = async (name: string, path: string) => {
  inFlight++
  peakInFlight = Math.max(peakInFlight, inFlight)
  const t0 = performance.now()
  try {
    const r = await fetch(`${BASE}${path}`, { headers })
    await r.arrayBuffer() // drain, so the timing includes the whole response
    const ms = performance.now() - t0
    latencies.push(ms)
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
    const arr = byEndpoint.get(name) ?? []
    arr.push(ms)
    byEndpoint.set(name, arr)
  } catch {
    byStatus.set(0, (byStatus.get(0) ?? 0) + 1)
  } finally {
    inFlight--
  }
}

/** One virtual user: walk the journey, pause like a person, repeat. */
const virtualUser = async (id: number) => {
  // Stagger the start so a thousand users do not arrive on the same millisecond.
  await new Promise((r) => setTimeout(r, (id % 100) * 20))
  while (!stop) {
    for (const step of JOURNEY) {
      if (stop) return
      await hit(step.name, step.path)
    }
    // Think time. A person opens a screen and then reads it — they do not reload the
    // dashboard twice a second. Without this the test measures how fast a loop can issue
    // HTTP requests, which is a fact about the loop.
    await new Promise((r) => setTimeout(r, 20_000 + Math.random() * 40_000))
  }
}

const samples: { conns: number; rssMB: number }[] = []
const sampler = setInterval(() => {
  void (async () => {
    try {
      const rows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database()
      `
      samples.push({ conns: Number(rows[0]?.count ?? 0), rssMB: Math.round(process.memoryUsage().rss / 1048576) })
    } catch { /* the sampler must never take the test down */ }
  })()
}, 2000)

console.log(`\n${USERS} virtual users · ${SECONDS}s · ${BASE}\n`)
const started = Date.now()
const users = Array.from({ length: USERS }, (_, i) => virtualUser(i))
await new Promise((r) => setTimeout(r, SECONDS * 1000))
stop = true
await Promise.allSettled(users)
clearInterval(sampler)
const elapsed = (Date.now() - started) / 1000

const pct = (p: number) => {
  if (latencies.length === 0) return 0
  const sorted = [...latencies].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

const ok = [...byStatus.entries()].filter(([s]) => s >= 200 && s < 300).reduce((n, [, c]) => n + c, 0)
const throttled = byStatus.get(429) ?? 0
const errors = [...byStatus.entries()].filter(([s]) => s === 0 || s >= 500).reduce((n, [, c]) => n + c, 0)

console.log('─'.repeat(70))
console.log(`requests        : ${latencies.length + (byStatus.get(0) ?? 0)}  in ${elapsed.toFixed(1)}s  (${Math.round(latencies.length / elapsed)}/s)`)
console.log(`successful      : ${ok}`)
console.log(`throttled (429) : ${throttled}`)
console.log(`errors (5xx/net): ${errors}`)
console.log(`status spread   : ${[...byStatus.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}×${n}`).join('  ')}`)
console.log(`peak in-flight  : ${peakInFlight}`)
console.log()
console.log(`latency  p50 ${pct(0.5).toFixed(0)}ms   p90 ${pct(0.9).toFixed(0)}ms   p95 ${pct(0.95).toFixed(0)}ms   p99 ${pct(0.99).toFixed(0)}ms   max ${Math.max(...latencies, 0).toFixed(0)}ms`)

const conns = samples.map((s) => s.conns)
if (conns.length) {
  console.log(`db connections  : min ${Math.min(...conns)}  max ${Math.max(...conns)}  last ${conns[conns.length - 1]}`)
}

console.log('\nslowest endpoints (p95):')
const ranked = [...byEndpoint.entries()]
  .map(([name, ms]) => {
    const s = [...ms].sort((a, b) => a - b)
    return { name, p95: s[Math.floor(s.length * 0.95)] ?? 0, n: ms.length }
  })
  .sort((a, b) => b.p95 - a.p95)
for (const e of ranked.slice(0, 5)) {
  console.log(`  ${e.name.padEnd(26)} ${e.p95.toFixed(0).padStart(6)}ms   (${e.n} calls)`)
}

await db.$disconnect()
