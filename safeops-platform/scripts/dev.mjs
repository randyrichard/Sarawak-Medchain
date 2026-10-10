#!/usr/bin/env node
/**
 * SafeChain development orchestrator.
 *
 * One command brings up the whole stack in dependency order: database, schema, seed,
 * API, web. Each step is verified before the next begins, because the failure mode this
 * replaces is a half-started stack that looks fine until a verification step quietly
 * reads stale data.
 *
 *   npm run dev          start everything
 *   npm run dev:check    health-check a running stack
 *   npm run dev:stop     stop the database
 *
 * Production uses the Postgres service in docker-compose.yml. This script exists because
 * Docker requires administrator rights and WSL, which are not available on every dev
 * machine; the engine, wire protocol and schema are identical either way.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import http from 'node:http'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const API = resolve(ROOT, 'api')
const WEB = resolve(ROOT, 'web')

const DB_PORT = 5433
const API_PORT = 4000
const WEB_PORT = 5181
const DATA_DIR = resolve(API, '.pgdata')

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
}

const step = (n, total, msg) => console.log(`${c.cyan(`[${n}/${total}]`)} ${msg}`)
const ok = (msg) => console.log(`      ${c.green('✓')} ${msg}`)
const warn = (msg) => console.log(`      ${c.yellow('!')} ${msg}`)

/** Fails loudly with actionable context rather than a stack trace. */
function fail(what, detail, remedy) {
  console.error(`\n${c.red('✗ ' + what)}`)
  if (detail) console.error(c.dim('  ' + String(detail).split('\n').slice(0, 6).join('\n  ')))
  if (remedy) console.error(`\n  ${c.bold('Try:')} ${remedy}`)
  process.exit(1)
}

const probe = (host, port) =>
  new Promise((res) => {
    // Settle exactly once and destroy exactly once. Resolving from several handlers
    // double-closes the handle, which trips a libuv assertion on Windows and takes the
    // process down with exit 127 instead of the status we were trying to report.
    let settled = false
    const s = net.createConnection({ host, port })
    const done = (value) => {
      if (settled) return
      settled = true
      s.removeAllListeners()
      s.destroy()
      res(value)
    }
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
    s.setTimeout(700, () => done(false))
    s.unref()
  })

/**
 * Probes both stacks. `localhost` resolves to ::1 before 127.0.0.1 on Windows, and Vite
 * binds only to localhost, so an IPv4-only check reports a healthy server as down.
 */
const portOpen = async (port) =>
  (await probe('127.0.0.1', port)) || (await probe('::1', port))


/**
 * Minimal GET with `agent: false`. Node's fetch keeps pooled keep-alive sockets that
 * outlive process.exit() on Windows and abort the process before it reports a status.
 */
function getJson(url, timeoutMs = 2000) {
  return new Promise((res, rej) => {
    const req = http.get(url, { agent: false }, (r) => {
      let data = ''
      r.on('data', (d) => { data += d })
      r.on('end', () => {
        let body = null
        try { body = JSON.parse(data) } catch { /* non-JSON */ }
        res({ status: r.statusCode, body })
      })
    })
    req.setTimeout(timeoutMs, () => { req.destroy(); rej(new Error('timeout')) })
    req.on('error', rej)
  })
}

async function waitForPort(port, label, timeoutMs = 90_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await portOpen(port)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

async function waitForHttp(url, label, timeoutMs = 90_000) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < timeoutMs) {
    try {
      const { status, body } = await getJson(url)
      if (status === 200) return body ?? {}
      last = `HTTP ${status}`
    } catch (e) {
      last = e.message
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  fail(`${label} did not become healthy`, last, `check the ${label} output above`)
}

/** Runs a command to completion, surfacing its output only when it fails. */
function run(cmd, args, cwd, label) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd, shell: true, env: process.env })
    let out = ''
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    p.on('close', (code) => res({ code, out }))
    p.on('error', (e) => res({ code: 1, out: e.message }))
  }).then(({ code, out }) => {
    if (code !== 0) fail(`${label} failed`, out, `cd ${cwd} && ${cmd} ${args.join(' ')}`)
    return out
  })
}

const children = []
/** Long-running service with prefixed, interleaved output. */
function service(cmd, args, cwd, label, colour) {
  const p = spawn(cmd, args, { cwd, shell: true, env: process.env })
  const tag = colour(`[${label}]`)
  const pipe = (stream, isErr) => {
    stream.on('data', (d) => {
      String(d).split('\n').filter((l) => l.trim()).forEach((l) => {
        console.log(`${tag} ${isErr ? c.red(l) : l}`)
      })
    })
  }
  pipe(p.stdout, false)
  pipe(p.stderr, true)
  p.on('exit', (code) => {
    if (code !== 0 && code !== null && !shuttingDown) {
      console.error(`\n${c.red(`✗ ${label} exited with code ${code}`)}`)
    }
  })
  children.push({ p, label })
  return p
}

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${c.dim(`${signal} — stopping services…`)}`)
  for (const { p } of children) {
    try { p.kill() } catch { /* already gone */ }
  }
  // The database keeps its volume; it is stopped explicitly so the next start is clean.
  try { await stopDb() } catch { /* best effort */ }
  process.exit(0)
}

async function startDb() {
  const require = createRequire(resolve(API, 'package.json'))
  let EmbeddedPostgres
  try {
    EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres')
  } catch (e) {
    fail('embedded-postgres is not installed', e.message, 'npm install --prefix api')
  }
  mkdirSync(DATA_DIR, { recursive: true })
  // PG_VERSION marks an initialised cluster. Calling initialise() again still works, but
  // initdb writes "directory exists but is not empty" to stderr, and a spurious error on
  // the normal restart path teaches people to ignore real ones.
  const alreadyInitialised = existsSync(resolve(DATA_DIR, 'PG_VERSION'))
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'safeops',
    password: 'safeops',
    port: DB_PORT,
    persistent: true, // the volume survives restarts — verification state is preserved
    // initdb inherits the host locale, so on a Windows machine the cluster lands on
    // WIN1252 while the Postgres in docker-compose.yml is UTF8. That divergence is
    // invisible until something stores a character Latin-1 has no room for — a subscript,
    // a degree sign, a name outside the Western European set — and then dev rejects text
    // production accepts. Pinning the encoding here keeps the two the same.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  })
  if (!alreadyInitialised) {
    try { await pg.initialise() } catch { /* raced with another start */ }
  }
  await pg.start()
  try { await pg.createDatabase('safeops') } catch { /* already exists */ }
  return pg
}

async function stopDb() {
  const require = createRequire(resolve(API, 'package.json'))
  const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres')
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR, user: 'safeops', password: 'safeops', port: DB_PORT, persistent: true,
  })
  await pg.stop()
}

async function healthCheck() {
  const results = []
  results.push({ name: 'PostgreSQL :' + DB_PORT, ok: await portOpen(DB_PORT) })

  let api = false, db = false
  try {
    const { status, body } = await getJson(`http://127.0.0.1:${API_PORT}/health/ready`)
    api = status === 200
    db = body?.status === 'ready'
  } catch { /* down */ }
  results.push({ name: 'API :' + API_PORT, ok: api })
  results.push({ name: 'API → database', ok: db })
  results.push({ name: 'Web :' + WEB_PORT, ok: await portOpen(WEB_PORT) })

  console.log()
  for (const r of results) {
    console.log(`  ${r.ok ? c.green('✓') : c.red('✗')} ${r.name}`)
  }
  return results.every((r) => r.ok)
}

async function main() {
  const mode = process.argv[2] ?? 'start'

  if (mode === 'check') {
    process.exitCode = (await healthCheck()) ? 0 : 1
    return
  }
  if (mode === 'stop') {
    await stopDb()
    console.log(c.green('✓ database stopped (volume preserved)'))
    return
  }

  const TOTAL = 6
  console.log(c.bold('\nSafeChain development environment\n'))

  // Preflight — missing dependencies are the most common fresh-clone failure.
  step(1, TOTAL, 'Checking prerequisites')
  for (const [dir, name] of [[API, 'api'], [WEB, 'web']]) {
    if (!existsSync(resolve(dir, 'node_modules'))) {
      fail(`dependencies missing in ${name}/`, null, `npm install --prefix ${name}`)
    }
  }
  if (!existsSync(resolve(API, '.env'))) {
    fail('api/.env is missing', null,
      'cp api/.env.example api/.env && npm run keygen --prefix api  (paste both keys into api/.env)')
  }
  const envText = await import('node:fs').then((fs) => fs.readFileSync(resolve(API, '.env'), 'utf8'))
  if (!/JWT_PRIVATE_KEY_B64=.+/.test(envText)) {
    fail('JWT keys are not set in api/.env', null,
      'npm run keygen --prefix api  (paste both values into api/.env)')
  }
  ok('dependencies and configuration present')

  step(2, TOTAL, `Starting PostgreSQL on :${DB_PORT}`)
  if (await portOpen(DB_PORT)) {
    warn(`something already listening on :${DB_PORT} — reusing it`)
  } else {
    await startDb()
    if (!(await waitForPort(DB_PORT, 'PostgreSQL', 60_000))) {
      fail('PostgreSQL did not start', null, 'delete api/.pgdata and retry')
    }
  }
  ok('database accepting connections (volume: api/.pgdata)')

  step(3, TOTAL, 'Applying migrations')
  await run('npx', ['prisma', 'migrate', 'deploy'], API, 'prisma migrate deploy')
  ok('schema up to date')

  step(4, TOTAL, 'Seeding reference data')
  // The seed upserts, so repeated runs are safe and existing rows are preserved.
  await run('npm', ['run', 'seed'], API, 'seed')
  ok('companies, sites and demo users present')

  step(5, TOTAL, `Starting API on :${API_PORT}`)
  service('npm', ['run', 'dev'], API, 'api', c.cyan)
  const ready = await waitForHttp(`http://127.0.0.1:${API_PORT}/health/ready`, 'API')
  if (ready.status !== 'ready') {
    fail('API started but cannot reach the database', JSON.stringify(ready), 'check DATABASE_URL in api/.env')
  }
  ok('API healthy and connected to the database')

  step(6, TOTAL, `Starting web on :${WEB_PORT}`)
  service('npm', ['run', 'dev'], WEB, 'web', c.yellow)
  if (!(await waitForPort(WEB_PORT, 'web', 90_000))) {
    fail('web dev server did not start', null, 'npm run dev --prefix web')
  }
  ok('web dev server running')

  console.log(`\n${c.green(c.bold('SafeChain is up.'))}`)
  console.log(`  web  ${c.bold(`http://localhost:${WEB_PORT}`)}`)
  console.log(`  api  http://localhost:${API_PORT}/health/ready`)
  console.log(c.dim('  sign in: hse@demo.safeops.app / SafeOpsPlatform2026'))
  console.log(c.dim('  Ctrl+C stops everything; the database volume is preserved.\n'))
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

main().catch((e) => fail('startup failed', e?.stack ?? e, 'see the error above'))
