/**
 * Checks whether a list endpoint returns everything the workspace holds.
 *
 * A list that silently stops at its page size is worse than one that fails: the user has
 * no way to tell that a record exists. This compares what the endpoint returns against
 * what the database actually contains.
 *
 *   BASE=http://localhost:4001 tsx scripts/truncation-probe.ts
 */
const BASE = process.env.BASE ?? 'http://localhost:4001'
const COMPANY = 'big'

const res = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.safeops.app', password: 'SafeOpsPlatform2026' }),
})
if (!res.ok) throw new Error(`login failed: ${res.status}`)
const { accessToken } = await res.json()
const auth = { Authorization: `Bearer ${accessToken}` }

const get = async (path: string) => {
  const r = await fetch(`${BASE}${path}`, { headers: auth })
  return { status: r.status, body: await r.json() }
}

console.log('\nendpoint                     asked  returned  total  truncated')
console.log('─'.repeat(64))

for (const [name, path] of [
  ['incidents', `/incidents?companyId=${COMPANY}&pageSize=100`],
  ['incidents (max+1)', `/incidents?companyId=${COMPANY}&pageSize=101`],
  ['actions', `/incidents/actions/list?companyId=${COMPANY}&pageSize=100`],
  ['permits', `/permits?companyId=${COMPANY}&pageSize=100`],
  ['assets', `/assets?companyId=${COMPANY}&pageSize=100`],
  ['audits', `/audits?companyId=${COMPANY}&pageSize=100`],
] as const) {
  const { status, body } = await get(path)
  if (status !== 200) {
    console.log(`${name.padEnd(28)} → HTTP ${status} ${JSON.stringify(body).slice(0, 60)}`)
    continue
  }
  const rows = body.rows?.length ?? (Array.isArray(body) ? body.length : 0)
  const total = body.total ?? '?'
  const truncated = typeof total === 'number' && rows < total
  console.log(
    `${name.padEnd(28)} ${String(100).padStart(5)} ${String(rows).padStart(9)} ${String(total).padStart(6)}` +
    `   ${truncated ? `YES — ${total - rows} unreachable` : 'no'}`,
  )
}
console.log('─'.repeat(64))
