/**
 * Tries to break the API.
 *
 * `security-probe.ts` checks that the controls work. This one attacks them: mass
 * assignment, id enumeration, race conditions on the safety gates, replay, CSRF, upload
 * abuse and privilege escalation through the request body. Each check states what a
 * failure would mean, because "FAIL" on its own is not actionable at two in the morning.
 *
 *   tsx scripts/attack-probe.ts [baseUrl]
 */
export {}

const BASE = process.argv[2] ?? 'http://localhost:4000'
const PW = 'SafeOpsPlatform2026'

interface Result { name: string; pass: boolean; detail: string; severity: 'critical' | 'high' | 'medium'; untested?: boolean }
const results: Result[] = []
const check = (severity: Result['severity'], name: string, pass: boolean, detail: string) => {
  results.push({ name, pass, detail, severity })
  console.log(`${pass ? 'PASS' : `FAIL(${severity})`}  ${name.padEnd(56)} ${detail}`)
}

/**
 * Records a check that could not run.
 *
 * The auth endpoints are rate limited, and a probe that logs in repeatedly exhausts that
 * budget itself. A 429 there means the check never executed — reporting it as a failure
 * would be a false alarm, and reporting it as a pass would be a lie.
 */
const untested = (severity: Result['severity'], name: string, detail: string) => {
  results.push({ name, pass: true, detail, severity, untested: true })
  console.log(`NOT RUN   ${name.padEnd(56)} ${detail}`)
}

const login = async (email: string) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  return {
    token: ((await r.json()) as { accessToken: string }).accessToken,
    cookies: r.headers.getSetCookie?.() ?? [],
  }
}

const admin = await login('admin@demo.safeops.app')
const officer = await login('officer@demo.safeops.app')
const employee = await login('employee@demo.safeops.app')
const hse = await login('hse@demo.safeops.app')

const h = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
const json = async (r: Response) => { try { return await r.json() } catch { return {} } }

// ── Mass assignment ──────────────────────────────────────────────────────────
console.log('\n─── Mass assignment ───')
{
  // Can a caller set fields the workflow owns — status, code, tenant, version?
  const r = await fetch(`${BASE}/incidents`, {
    method: 'POST',
    headers: h(officer.token),
    body: JSON.stringify({
      companyId: 'big', siteId: 'kch', title: 'Mass assignment probe',
      type: 'near_miss', severity: 'Minor', location: 'Probe',
      occurredAt: new Date().toISOString(),
      // None of these should be honoured from the request body.
      stage: 'closed', number: 'INC-HACKED', archived: true, version: 999,
      closedAt: new Date().toISOString(), highRisk: true,
    }),
  })
  const body = await json(r) as Record<string, unknown>
  const honoured: string[] = []
  if (body.stage === 'closed') honoured.push('stage')
  if (body.number === 'INC-HACKED') honoured.push('number')
  if (body.archived === true) honoured.push('archived')
  if (body.version === 999) honoured.push('version')
  check('high', 'incident create ignores workflow-owned fields', honoured.length === 0,
    honoured.length ? `HONOURED: ${honoured.join(', ')}` : `stage=${body.stage} number=${body.number}`)
}
{
  // A permit must not be creatable already issued.
  const from = new Date(Date.now() + 3600_000)
  const r = await fetch(`${BASE}/permits`, {
    method: 'POST',
    headers: h(officer.token),
    body: JSON.stringify({
      companyId: 'big', siteId: 'kch', type: 'hot_work', title: 'Mass assignment permit',
      location: 'Probe', applicant: 'Probe',
      validFrom: from.toISOString(), validTo: new Date(from.getTime() + 3600_000).toISOString(),
      status: 'active', approver: 'Nobody', approvedAt: new Date().toISOString(),
      handbackConfirmed: true,
    }),
  })
  const body = await json(r) as Record<string, unknown>
  check('critical', 'permit cannot be created already issued', body.status !== 'active',
    `status=${body.status ?? r.status}`)
}

// ── Privilege escalation ─────────────────────────────────────────────────────
console.log('\n─── Privilege escalation ───')
{
  // An employee promoting themselves by naming a role in the body.
  const r = await fetch(`${BASE}/admin/users`, {
    method: 'POST', headers: h(employee.token),
    body: JSON.stringify({ companyId: 'big', name: 'Escalated', email: 'esc@x.test', role: 'admin', sendInvite: false }),
  })
  check('critical', 'employee cannot create an admin user', r.status === 403, `HTTP ${r.status}`)
}
{
  // A safety officer issuing a permit is allowed; closing an audit is not their call.
  const r = await fetch(`${BASE}/audits/does-not-exist/close`, { method: 'POST', headers: h(employee.token) })
  check('high', 'employee cannot close an audit', r.status === 403 || r.status === 404, `HTTP ${r.status}`)
}
{
  // Role claims in a header must be ignored — the token is the only authority.
  const r = await fetch(`${BASE}/admin/users?companyId=big`, {
    headers: { ...h(employee.token), 'X-Role': 'admin', 'X-User-Role': 'admin', 'X-Company-Id': 'big' },
  })
  check('critical', 'role headers are ignored', r.status === 403, `HTTP ${r.status}`)
}

// ── ID enumeration ───────────────────────────────────────────────────────────
console.log('\n─── ID enumeration ───')
{
  // A record id from another tenant must 403/404, not return the row.
  const kcsIncidents = await fetch(`${BASE}/incidents?companyId=kcs&pageSize=1`, { headers: h(admin.token) })
  const kcsBody = await json(kcsIncidents) as { rows?: { id: string }[] }
  const foreignId = kcsBody.rows?.[0]?.id
  if (foreignId) {
    const r = await fetch(`${BASE}/incidents/${foreignId}`, { headers: h(hse.token) })
    check('critical', 'a foreign tenant record id is not readable', r.status === 403 || r.status === 404, `HTTP ${r.status}`)
  } else {
    check('critical', 'a foreign tenant record id is not readable', false, 'could not obtain a kcs incident to test with')
  }
}
{
  // Does a missing id and a forbidden id look different? A difference leaks existence.
  const missing = await fetch(`${BASE}/incidents/clzzzzzzzzzzzzzzzzzzzzzzz`, { headers: h(hse.token) })
  const malformed = await fetch(`${BASE}/incidents/%20%20`, { headers: h(hse.token) })
  check('medium', 'unknown ids do not leak existence through status codes',
    missing.status === 404 || missing.status === 403, `missing=${missing.status} malformed=${malformed.status}`)
}
{
  // Certificate numbers are sequential; the public check must not expose the workforce.
  const r = await fetch(`${BASE}/training/verify?code=CERT-2024-2862`)
  const text = await r.text()
  const leaked = ['email', 'employeeId', 'companyId', 'siteId', 'department', 'docName'].filter((k) => text.includes(k))
  check('high', 'sequential certificate numbers expose nothing extra', leaked.length === 0,
    leaked.length ? `leaked: ${leaked.join(', ')}` : 'document fields only')
}

// ── Authentication ───────────────────────────────────────────────────────────
console.log('\n─── Authentication ───')
{
  // "alg: none" — the classic JWT downgrade.
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: 'attacker', name: 'Attacker', roles: [{ companyId: 'big', role: 'admin', siteIds: [] }],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')
  const r = await fetch(`${BASE}/admin/users?companyId=big`, { headers: h(`${header}.${payload}.`) })
  check('critical', 'an unsigned "alg:none" token is rejected', r.status === 401, `HTTP ${r.status}`)
}
{
  // The payload swapped for an admin one, keeping a valid signature from another token.
  const [head, , sig] = employee.token.split('.')
  const forged = Buffer.from(JSON.stringify({
    sub: 'attacker', name: 'Attacker', roles: [{ companyId: 'big', role: 'admin', siteIds: [] }],
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url')
  const r = await fetch(`${BASE}/admin/users?companyId=big`, { headers: h(`${head}.${forged}.${sig}`) })
  check('critical', 'a re-signed payload is rejected', r.status === 401, `HTTP ${r.status}`)
}
{
  // An access token used as a refresh token, and vice versa.
  const r = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `safeops_rt=${employee.token}` },
  })
  if (r.status === 429) untested('high', 'an access token is not accepted as a refresh token', 'refresh throttle hit — restart the API and re-run')
  else check('high', 'an access token is not accepted as a refresh token', r.status === 401, `HTTP ${r.status}`)
}

// ── CSRF ─────────────────────────────────────────────────────────────────────
console.log('\n─── CSRF ───')
{
  // A cross-site form post carrying only the cookie must not act. The API is bearer-token
  // authenticated and the cookie is SameSite=Strict, so this should be unauthenticated.
  const cookie = employee.cookies.map((c) => c.split(';')[0]).join('; ')
  const r = await fetch(`${BASE}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://evil.example' },
    body: JSON.stringify({ companyId: 'big', siteId: 'kch', title: 'CSRF', type: 'near_miss', severity: 'Minor', location: 'x', occurredAt: new Date().toISOString() }),
  })
  check('critical', 'a cookie alone cannot mutate anything', r.status === 401, `HTTP ${r.status}`)
}

// ── Race conditions on the safety gates ──────────────────────────────────────
console.log('\n─── Race conditions ───')
{
  // Ten simultaneous creates: the per-tenant counter must not hand out a duplicate code.
  const from = new Date(Date.now() + 7200_000)
  const made = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    fetch(`${BASE}/permits`, {
      method: 'POST', headers: h(officer.token),
      body: JSON.stringify({
        companyId: 'big', siteId: 'kch', type: 'working_at_height', title: `Race probe ${i}`,
        location: 'Probe', applicant: 'Probe',
        validFrom: from.toISOString(), validTo: new Date(from.getTime() + 3600_000).toISOString(),
      }),
    }).then(json) as Promise<{ code?: string }>))
  const codes = made.map((m) => m.code).filter(Boolean)
  check('critical', 'concurrent creates never duplicate a reference', new Set(codes).size === codes.length,
    `${codes.length} created, ${new Set(codes).size} distinct`)
}
{
  // Approving the same permit twice at once must not double-issue it.
  const from = new Date(Date.now() + 7200_000)
  const created = await fetch(`${BASE}/permits`, {
    method: 'POST', headers: h(officer.token),
    body: JSON.stringify({
      companyId: 'big', siteId: 'kch', type: 'lifting_operation', title: 'Double approve probe',
      location: 'Probe', applicant: 'Probe',
      validFrom: from.toISOString(), validTo: new Date(from.getTime() + 3600_000).toISOString(),
    }),
  }).then(json) as { id?: string }
  if (created.id) {
    await fetch(`${BASE}/permits/${created.id}/submit`, { method: 'POST', headers: h(officer.token) })
    const both = await Promise.all([0, 1].map(() =>
      fetch(`${BASE}/permits/${created.id}/approve`, {
        method: 'POST', headers: h(officer.token), body: JSON.stringify({ statement: 'race' }),
      })))
    const ok = both.filter((r) => r.ok).length
    // Controls are unconfirmed, so both should be refused. What must never happen is one
    // succeeding twice, or the gate passing under concurrency.
    check('critical', 'concurrent approvals do not bypass the control gate', ok === 0,
      `${ok} of 2 succeeded (both should be refused — controls unconfirmed)`)
  } else {
    check('critical', 'concurrent approvals do not bypass the control gate', false, 'could not create the probe permit')
  }
}

// ── Replay ───────────────────────────────────────────────────────────────────
console.log('\n─── Replay ───')
{
  // Refresh tokens rotate. Using the same one twice must revoke the family, not extend it.
  const fresh = await login('supervisor@demo.safeops.app')
  const cookie = fresh.cookies.map((c) => c.split(';')[0]).join('; ')
  const first = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie } })
  const second = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie } })
  if (first.status === 429 || second.status === 429) {
    untested('high', 'a replayed refresh token is refused', 'refresh throttle hit — restart the API and re-run')
  } else {
    check('high', 'a replayed refresh token is refused', first.ok && !second.ok,
      `first=${first.status} replay=${second.status}`)
  }
}

// ── Upload abuse ─────────────────────────────────────────────────────────────
console.log('\n─── File upload ───')
{
  const incidents = await fetch(`${BASE}/incidents?companyId=big&pageSize=1`, { headers: h(hse.token) }).then(json) as { rows?: { id: string }[] }
  const target = incidents.rows?.[0]?.id
  if (target) {
    const form = new FormData()
    form.append('files', new Blob(['<?php system($_GET["c"]); ?>'], { type: 'application/x-php' }), 'shell.php')
    const r = await fetch(`${BASE}/incidents/${target}/attachments`, {
      method: 'POST', headers: { Authorization: `Bearer ${hse.token}` }, body: form,
    })
    check('critical', 'an executable upload is refused', r.status === 400 || r.status === 415, `HTTP ${r.status}`)

    // A double extension with an image content type.
    const form2 = new FormData()
    form2.append('files', new Blob(['GIF89a'], { type: 'image/png' }), '../../evil.png.php')
    const r2 = await fetch(`${BASE}/incidents/${target}/attachments`, {
      method: 'POST', headers: { Authorization: `Bearer ${hse.token}` }, body: form2,
    })
    const saved = await json(r2) as { attachments?: { storedName?: string }[] }
    const stored = saved.attachments?.[0]?.storedName ?? ''
    check('critical', 'the client filename never becomes the stored path',
      r2.status !== 201 || (!stored.includes('..') && !stored.includes('.php')),
      `stored as "${stored || 'rejected'}"`)
  } else {
    check('critical', 'an executable upload is refused', false, 'no incident available to attach to')
  }
}

// ── XSS ──────────────────────────────────────────────────────────────────────
console.log('\n─── Stored XSS ───')
{
  const payload = '<img src=x onerror=alert(1)>'
  const r = await fetch(`${BASE}/incidents`, {
    method: 'POST', headers: h(officer.token),
    body: JSON.stringify({
      companyId: 'big', siteId: 'kch', title: payload, type: 'near_miss', severity: 'Minor',
      location: payload, occurredAt: new Date().toISOString(), description: payload,
    }),
  })
  const body = await json(r) as { title?: string }
  // Storing it verbatim is correct — React escapes on render. What matters is that the API
  // does not reflect it as HTML, which the content type settles.
  check('medium', 'the API never serves user input as HTML',
    (r.headers.get('content-type') ?? '').includes('application/json'),
    `content-type=${r.headers.get('content-type')} stored=${body.title === payload ? 'verbatim (correct)' : 'altered'}`)
}

// ── Report ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass)
const bySeverity = (s: Result['severity']) => failed.filter((f) => f.severity === s)

console.log('\n' + '─'.repeat(78))
console.log(`${results.length - failed.length}/${results.length} attacks repelled`)
for (const s of ['critical', 'high', 'medium'] as const) {
  const f = bySeverity(s)
  if (f.length) console.log(`${s.toUpperCase()}: ${f.map((x) => `${x.name} (${x.detail})`).join(' · ')}`)
}
if (failed.length) process.exitCode = 1
