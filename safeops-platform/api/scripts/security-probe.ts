/**
 * Exercises the access controls against a running API with real sessions.
 *
 * Integration tests already cover the service layer. This checks the same properties
 * through HTTP, where the middleware, the route validation and the service all take part
 * — which is the only place a gap between them would show.
 *
 *   tsx scripts/security-probe.ts [baseUrl]
 */
export {}

const BASE = process.argv[2] ?? 'http://localhost:4000'
const PASSWORD = 'SafeOpsPlatform2026'

const login = async (email: string): Promise<string> => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  return ((await r.json()) as { accessToken: string }).accessToken
}

const results: { name: string; pass: boolean; detail: string }[] = []
const check = (name: string, pass: boolean, detail: string) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${detail}`)
}

// hse@ belongs only to "big"; ceo@ belongs to both "big" and "kcs".
const hse = await login('hse@demo.safeops.app')
const officer = await login('officer@demo.safeops.app')
const employee = await login('employee@demo.safeops.app')
const as = (t: string) => ({ Authorization: `Bearer ${t}` })

const get = async (path: string, token?: string) => {
  const r = await fetch(`${BASE}${path}`, { headers: token ? as(token) : {} })
  const body = await r.text()
  return { status: r.status, body }
}

console.log('\n─── Authentication ───')
check(
  'no token is rejected',
  (await get('/incidents?companyId=big')).status === 401,
  'GET /incidents without Authorization',
)
check(
  'a forged token is rejected',
  (await get('/incidents?companyId=big', 'not.a.real.token')).status === 401,
  'GET /incidents with a made-up bearer',
)
{
  // A token signed with the right shape but a different key must not verify.
  const tampered = hse.slice(0, -6) + 'AAAAAA'
  check(
    'a tampered signature is rejected',
    (await get('/incidents?companyId=big', tampered)).status === 401,
    'last six characters of the signature altered',
  )
}

console.log('\n─── Tenant isolation ───')
for (const [name, path] of [
  ['incidents', '/incidents?companyId=kcs'],
  ['actions', '/incidents/actions/list?companyId=kcs'],
  ['permits', '/permits?companyId=kcs'],
  ['assets', '/assets?companyId=kcs'],
  ['audits', '/audits?companyId=kcs'],
  ['training certificates', '/training/certificates?companyId=kcs'],
  ['notifications', '/notifications?companyId=kcs'],
  ['activity', '/activity?companyId=kcs'],
  ['org sites', '/org/sites?companyId=kcs'],
  ['admin users', '/admin/users?companyId=kcs'],
] as const) {
  const r = await get(path, hse)
  // 403 is the intended answer. A 200 carrying rows would be a cross-tenant read.
  const leaked = r.status === 200 && /"id"/.test(r.body)
  check(`${name}: a "big" session cannot read "kcs"`, !leaked, `HTTP ${r.status}`)
}

console.log('\n─── Role enforcement ───')
{
  // An employee must not be able to create a user or read the admin console.
  const r = await fetch(`${BASE}/admin/users?companyId=big`, {
    method: 'POST',
    headers: { ...as(employee), 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: 'big', name: 'Injected', email: 'injected@x.com', role: 'admin', sendInvite: false }),
  })
  check('an employee cannot create a user', r.status === 403 || r.status === 404, `HTTP ${r.status}`)
}
{
  const r = await get('/admin/audit?companyId=big', officer)
  check('a safety officer cannot read the admin audit log', r.status === 403, `HTTP ${r.status}`)
}
{
  // Role comes from the signed token, so a body claiming otherwise changes nothing.
  const r = await fetch(`${BASE}/admin/users?companyId=big`, {
    method: 'POST',
    headers: { ...as(employee), 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId: 'big', role: 'admin', name: 'X', email: 'x@y.com', sendInvite: false, actorRole: 'admin' }),
  })
  check('a client-supplied role in the body is ignored', r.status === 403 || r.status === 404, `HTTP ${r.status}`)
}

console.log('\n─── Public surface ───')
{
  const r = await get('/training/verify?code=CERT-2024-2862')
  const leaks = ['email', 'siteId', 'department', 'employeeId', 'companyId', 'docName']
    .filter((k) => r.body.includes(k))
  check('certificate check leaks nothing beyond the document', leaks.length === 0,
    leaks.length ? `leaked: ${leaks.join(', ')}` : 'number, holder, course, dates, issuer, status only')
}
{
  const r = await get('/health')
  check('health needs no session', r.status === 200, `HTTP ${r.status}`)
}

console.log('\n─── Input bounds ───')
{
  const r = await get('/incidents?companyId=big&pageSize=100000', hse)
  check('an oversized pageSize is refused', r.status === 400, `HTTP ${r.status}`)
}
{
  // A classic injection string must be treated as data, not SQL.
  const r = await get(`/incidents?companyId=big&q=${encodeURIComponent("'; DROP TABLE \"Incident\"; --")}`, hse)
  const stillThere = (await get('/incidents?companyId=big', hse)).status === 200
  check('an injection string is treated as a search term', r.status === 200 && stillThere, `HTTP ${r.status}, table intact`)
}
{
  const r = await fetch(`${BASE}/incidents`, {
    method: 'POST',
    headers: { ...as(hse), 'Content-Type': 'application/json' },
    body: 'x'.repeat(200_000),
  })
  check('an oversized body is refused', r.status === 413 || r.status === 400, `HTTP ${r.status}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log(`FAILURES: ${failed.map((f) => f.name).join(' · ')}`)
  process.exitCode = 1
}
