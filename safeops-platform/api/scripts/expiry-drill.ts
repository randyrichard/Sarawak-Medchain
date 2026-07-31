/**
 * Verifies that a naturally expired access token is refused, and that the refresh cookie
 * mints a working replacement.
 *
 * Distinct from the tampered-token checks in attack-probe: this is the ordinary case every
 * user hits every fifteen minutes, and a mistake here logs the whole customer out or —
 * worse — keeps a revoked session alive.
 *
 * Runs its own API with a one-minute token lifetime, because waiting fifteen is not a test
 * anyone will run twice.
 *
 *   tsx scripts/expiry-drill.ts
 */
import { spawn } from 'node:child_process'

const PORT = 4103
const BASE = `http://127.0.0.1:${PORT}`

let failures = 0
const check = (name: string, pass: boolean, detail: string) => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(48)} ${detail}`)
}

console.log('\nStarting an API with a 1-minute access token lifetime…')
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'src/server.ts'],
  {
    env: { ...process.env, PORT: String(PORT), ACCESS_TOKEN_TTL_MIN: '1', SCHEDULER_ENABLED: 'false' },
    stdio: 'ignore',
    windowsHide: true,
  },
)

const ready = async () => {
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

try {
  if (!await ready()) throw new Error('the probe API never became ready')
  console.log('ready\n')

  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hse@demo.safeops.app', password: 'SafeOpsPlatform2026' }),
  })
  if (!login.ok) throw new Error(`login failed: ${login.status}`)
  const { accessToken } = (await login.json()) as { accessToken: string }
  const cookies = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

  const call = (token: string) =>
    fetch(`${BASE}/incidents?companyId=big&pageSize=1`, { headers: { Authorization: `Bearer ${token}` } })

  check('a fresh token works', (await call(accessToken)).status === 200, 'HTTP 200')

  // The token's own exp claim, read without verifying — just to report the wait honestly.
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as { exp: number }
  const waitMs = (claims.exp * 1000) - Date.now() + 3000
  console.log(`\nwaiting ${Math.ceil(waitMs / 1000)}s for the token to expire…`)
  await new Promise((r) => setTimeout(r, waitMs))

  const expired = await call(accessToken)
  check('an expired token is refused', expired.status === 401, `HTTP ${expired.status}`)

  const body = await expired.json().catch(() => ({})) as { error?: string }
  check('the refusal is distinguishable from a permission error', body.error === 'unauthenticated',
    `error=${body.error}`)

  // The refresh cookie outlives the access token — that is the whole point of the split.
  const refreshed = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
  })
  check('the refresh cookie still works after expiry', refreshed.ok, `HTTP ${refreshed.status}`)

  if (refreshed.ok) {
    const { accessToken: fresh } = (await refreshed.json()) as { accessToken: string }
    check('the replacement token works', (await call(fresh)).status === 200, 'HTTP 200')
    check('the replacement differs from the expired one', fresh !== accessToken, 'rotated')
  }
} finally {
  child.kill()
}

console.log()
if (failures === 0) console.log('Session expiry and recovery behave correctly.')
else { console.log(`${failures} check(s) failed.`); process.exitCode = 1 }
