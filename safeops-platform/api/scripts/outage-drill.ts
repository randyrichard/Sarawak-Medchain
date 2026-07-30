/**
 * Confirms how the API behaves while the database is unreachable, and that it recovers
 * without intervention when the database returns.
 *
 * Run it, then stop and start PostgreSQL while it watches. It samples liveness, readiness
 * and a real data endpoint every second and prints the transitions — the useful output is
 * the shape of the recovery, not any single sample.
 *
 *   tsx scripts/outage-drill.ts [seconds] [baseUrl]
 */
export {}

const SECONDS = Number(process.argv[2] ?? 60)
const BASE = process.argv[3] ?? 'http://localhost:4000'

const login = async () => {
  try {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hse@demo.safeops.app', password: 'SafeOpsPlatform2026' }),
    })
    return r.ok ? ((await r.json()) as { accessToken: string }).accessToken : null
  } catch {
    return null
  }
}

let token = await login()
const status = async (path: string, auth = false) => {
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: auth && token ? { Authorization: `Bearer ${token}` } : {},
    })
    return r.status
  } catch {
    return 0 // connection refused — the process itself is gone
  }
}

console.log(`\nWatching ${BASE} for ${SECONDS}s. Stop and start PostgreSQL now.\n`)
console.log('  t   /health  /ready  /incidents   note')
console.log('─'.repeat(58))

let last = ''
for (let t = 0; t < SECONDS; t++) {
  const [health, ready, data] = await Promise.all([
    status('/health'),
    status('/health/ready'),
    status('/incidents?companyId=big&pageSize=1', true),
  ])

  // A 401 after an outage means the token was minted before it; get a fresh one.
  if (data === 401) token = await login()

  const line = `${health}|${ready}|${data}`
  const note =
    health === 0 ? 'API PROCESS DOWN'
      : ready === 503 && data >= 500 ? 'database unreachable — API alive, degrading correctly'
      : ready === 503 ? 'database unreachable'
      : data === 200 ? 'healthy'
      : `data endpoint ${data}`

  // Only print transitions, so a long watch stays readable.
  if (line !== last) {
    console.log(
      `${String(t).padStart(3)}s ${String(health).padStart(7)} ${String(ready).padStart(7)}` +
      ` ${String(data).padStart(10)}   ${note}`,
    )
    last = line
  }
  await new Promise((r) => setTimeout(r, 1000))
}
console.log('─'.repeat(58))
