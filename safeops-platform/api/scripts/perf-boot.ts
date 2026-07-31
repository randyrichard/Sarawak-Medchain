/**
 * Boot and operation timings.
 *
 * Cold boot is measured by starting a process and watching for the line it prints when it
 * is listening; warm boot by doing it again with the module cache and the page cache
 * already hot. Everything else is measured against a running instance.
 *
 * Write operations are timed on the real endpoints, so the numbers include validation, the
 * counter transaction and the audit trail write — which is what a user waits for.
 *
 *   tsx scripts/perf-boot.ts [baseUrl]
 */
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const BASE = process.argv[2] ?? 'http://localhost:4000'
const COMPANY = 'big'
const SITE = 'kch'

const row = (label: string, ms: number, note = '') =>
  console.log(`  ${label.padEnd(30)} ${ms.toFixed(0).padStart(6)} ms   ${note}`)

/**
 * Starts an API on a spare port and returns how long until it actually serves.
 *
 * Readiness is established by polling rather than by watching for a log line: the child's
 * stdout does not reliably reach this process through the Windows shim, and "answers a
 * request" is the more honest definition of booted anyway.
 */
async function bootOnce(port: number): Promise<number> {
  const t0 = performance.now()
  // node directly, with tsx as a loader. Spawning the .bin shim would mean shell: true,
  // which Node 24 refuses for .cmd files, and a shell would time the shell as well.
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/server.ts'],
    { env: { ...process.env, PORT: String(port) }, stdio: 'ignore', windowsHide: true },
  )

  try {
    for (let i = 0; i < 600; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`)
        if (r.ok) {
          await r.arrayBuffer()
          return performance.now() - t0
        }
      } catch { /* not listening yet */ }
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`the API on :${port} did not serve within 60s`)
  } finally {
    child.kill()
  }
}

console.log('\n─── Boot ───')
// Cold: this process has not run tsx in this session, so the transform cache is unwarmed.
const cold = await bootOnce(4101)
row('cold boot', cold, 'tsx transform + Prisma client load + listen')
await new Promise((r) => setTimeout(r, 1500))
const warm = await bootOnce(4102)
row('warm boot', warm, 'caches hot')

// ── Against the running instance ─────────────────────────────────────────────
const t0 = performance.now()
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'officer@demo.safeops.app', password: 'SafeOpsPlatform2026' }),
})
const loginMs = performance.now() - t0
if (!loginRes.ok) {
  console.error(`\nlogin failed: ${loginRes.status} — restart the API to clear the login throttle`)
  process.exit(1)
}
const { accessToken } = (await loginRes.json()) as { accessToken: string }
const h = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

console.log('\n─── Authentication ───')
row('login (Argon2id verify)', loginMs, 'deliberately slow by design')

const time = async (fn: () => Promise<Response>) => {
  const s = performance.now()
  const r = await fn()
  await r.arrayBuffer()
  return { ms: performance.now() - s, status: r.status }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

console.log('\n─── Dashboard (the nine calls one page load makes) ───')
const dashPaths = [
  `/incidents?companyId=${COMPANY}&pageSize=100`,
  `/incidents/stats?companyId=${COMPANY}`,
  `/incidents/actions/list?companyId=${COMPANY}&pageSize=100`,
  `/permits/expiring?companyId=${COMPANY}`,
  `/assets/stats?companyId=${COMPANY}`,
  `/audits/stats?companyId=${COMPANY}`,
  `/training/stats?companyId=${COMPANY}`,
  `/activity?companyId=${COMPANY}`,
  `/notifications?companyId=${COMPANY}`,
]
const dashStart = performance.now()
await Promise.all(dashPaths.map((p) => fetch(`${BASE}${p}`, { headers: h }).then((r) => r.arrayBuffer())))
row('dashboard, all 9 in parallel', performance.now() - dashStart, 'what the user actually waits for')

for (const p of dashPaths) {
  const runs: number[] = []
  for (let i = 0; i < 5; i++) runs.push((await time(() => fetch(`${BASE}${p}`, { headers: h }))).ms)
  row(`  ${p.split('?')[0]}`, median(runs), 'median of 5')
}

console.log('\n─── Writes ───')
const incidentTimes: number[] = []
for (let i = 0; i < 5; i++) {
  const { ms, status } = await time(() => fetch(`${BASE}/incidents`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      companyId: COMPANY, siteId: SITE, title: `Perf probe incident ${Date.now()}-${i}`,
      type: 'near_miss', severity: 'Minor', location: 'Perf bay',
      occurredAt: new Date().toISOString(), description: 'Created by the performance probe.',
    }),
  }))
  if (status !== 201 && status !== 200) console.log(`    (create returned ${status})`)
  incidentTimes.push(ms)
}
row('incident creation', median(incidentTimes), 'includes counter txn + timeline write')

const permitTimes: number[] = []
for (let i = 0; i < 5; i++) {
  const from = new Date(Date.now() + 3600_000)
  const { ms } = await time(() => fetch(`${BASE}/permits`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      companyId: COMPANY, siteId: SITE, type: 'working_at_height',
      title: `Perf probe permit ${Date.now()}-${i}`, location: 'Perf tower', applicant: 'Perf Probe',
      validFrom: from.toISOString(), validTo: new Date(from.getTime() + 4 * 3600_000).toISOString(),
    }),
  }))
  permitTimes.push(ms)
}
row('permit creation', median(permitTimes), 'includes the full control checklist')

console.log('\n─── Heaviest reads ───')
for (const [name, path] of [
  ['training matrix', `/training/matrix?companyId=${COMPANY}`],
  ['certificate register', `/training/certificates?companyId=${COMPANY}`],
  ['asset register', `/assets?companyId=${COMPANY}`],
  ['admin health', `/admin/health?companyId=${COMPANY}`],
] as const) {
  const runs: number[] = []
  for (let i = 0; i < 5; i++) runs.push((await time(() => fetch(`${BASE}${path}`, { headers: h }))).ms)
  row(name, median(runs), 'median of 5')
}

console.log()
