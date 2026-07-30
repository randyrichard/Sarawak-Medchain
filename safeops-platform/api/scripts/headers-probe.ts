/**
 * Inspects what the API actually sends on the wire: cookie flags, security headers and
 * the CORS decision. These are configuration rather than logic, which is exactly why they
 * need to be read off a running server rather than off the source.
 *
 *   tsx scripts/headers-probe.ts [baseUrl] [origin]
 */
export {}

const BASE = process.argv[2] ?? 'http://localhost:4010'
const ORIGIN = process.argv[3] ?? 'http://localhost:5181'

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
  body: JSON.stringify({ email: 'hse@demo.safeops.app', password: 'SafeOpsPlatform2026' }),
})

console.log(`\nPOST /auth/login → ${login.status}\n`)

console.log('─── Refresh cookie ───')
const setCookie = login.headers.getSetCookie?.() ?? []
if (setCookie.length === 0) console.log('  (no Set-Cookie)')
for (const c of setCookie) {
  const name = c.split('=')[0]
  const flags = c.split(';').slice(1).map((s) => s.trim())
  console.log(`  ${name}`)
  for (const want of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) {
    const has = flags.some((f) => f.toLowerCase() === want.toLowerCase())
    console.log(`    ${has ? 'yes' : 'NO '}  ${want}`)
  }
  const other = flags.filter((f) => !/^(httponly|secure|samesite|path)/i.test(f))
  if (other.length) console.log(`    other: ${other.join(', ')}`)
}

console.log('\n─── Security headers ───')
for (const h of [
  'strict-transport-security', 'x-content-type-options', 'x-frame-options',
  'content-security-policy', 'referrer-policy', 'x-powered-by',
  'cross-origin-opener-policy', 'cross-origin-resource-policy',
]) {
  const v = login.headers.get(h)
  console.log(`  ${h.padEnd(30)} ${v ?? '(absent)'}`)
}

console.log('\n─── CORS ───')
console.log(`  allowed origin  : ${login.headers.get('access-control-allow-origin') ?? '(absent)'}`)
console.log(`  credentials     : ${login.headers.get('access-control-allow-credentials') ?? '(absent)'}`)

const evil = await fetch(`${BASE}/auth/login`, {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://attacker.example',
    'Access-Control-Request-Method': 'POST',
  },
})
const evilAllows = evil.headers.get('access-control-allow-origin')
console.log(`  unknown origin  : ${evilAllows ?? '(not echoed — correct)'}`)
console.log(
  evilAllows === 'https://attacker.example'
    ? '  FAIL: an arbitrary origin was allowed'
    : '  PASS: an arbitrary origin is not allowed',
)

console.log('\n─── Rate limit headers ───')
const probe = await fetch(`${BASE}/health`)
for (const h of ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-policy']) {
  console.log(`  ${h.padEnd(22)} ${probe.headers.get(h) ?? '(absent — health is exempt)'}`)
}
console.log()
