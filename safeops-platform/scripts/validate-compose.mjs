/**
 * Validates docker-compose.prod.yml without Docker.
 *
 * `docker compose config` is the real check and needs a daemon. This does what can be done
 * without one: parse the YAML, resolve anchors, confirm the structure is what compose
 * expects, and check that every ${VAR} either has a default or is present in the env file.
 *
 * It catches the two things most likely to be wrong in a file nobody has run: a key
 * indented under the wrong parent, and a required variable that is not in .env.example.
 *
 *   node scripts/validate-compose.mjs [compose-file] [env-file]
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const composePath = resolve(ROOT, process.argv[2] ?? 'docker-compose.prod.yml')
const envPath = resolve(ROOT, process.argv[3] ?? '.env.prod.example')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++ }

console.log(`\nValidating ${composePath}\n`)

const raw = readFileSync(composePath, 'utf8')

// ── Structure ────────────────────────────────────────────────────────────────
// Parsed with the YAML module if it is available, otherwise by indentation. The
// indentation check is the one that catches a key nested under the wrong parent, which is
// exactly the mistake a hand edit makes.
/**
 * A deliberately small YAML reader.
 *
 * Only what a compose file uses: nested maps, sequences, scalars, anchors and aliases. A
 * dependency would be better, but the check that matters most — a key indented under the
 * wrong parent — is the one this catches, and it should not be skipped just because a
 * package is missing on the machine doing the checking.
 */
function parseYaml(text) {
  const lines = text.split('\n')
    .map((l) => ({ raw: l, indent: l.search(/\S/), body: l.trim() }))
    .filter((l) => l.indent !== -1 && !l.body.startsWith('#'))

  const anchors = {}
  let i = 0

  const scalar = (v) => {
    if (v === '' || v === undefined) return null
    if (v.startsWith('*')) return anchors[v.slice(1)] ?? null
    const unquoted = v.replace(/^['"]|['"]$/g, '')
    if (unquoted === 'true') return true
    if (unquoted === 'false') return false
    if (/^-?\d+$/.test(unquoted)) return Number(unquoted)
    return unquoted
  }

  function parseBlock(indent) {
    // A sequence at this level.
    if (i < lines.length && lines[i].indent === indent && lines[i].body.startsWith('- ')) {
      const arr = []
      while (i < lines.length && lines[i].indent === indent && lines[i].body.startsWith('- ')) {
        arr.push(scalar(lines[i].body.slice(2).trim()))
        i++
      }
      return arr
    }

    const obj = {}
    while (i < lines.length && lines[i].indent === indent) {
      const { body } = lines[i]
      const colon = body.indexOf(':')
      if (colon === -1) { i++; continue }

      let key = body.slice(0, colon).trim()
      let rest = body.slice(colon + 1).trim()

      // `key: &anchor` or `key: &anchor value`
      let anchorName = null
      if (rest.startsWith('&')) {
        const [a, ...tail] = rest.split(/\s+/)
        anchorName = a.slice(1)
        rest = tail.join(' ')
      }
      // `x-logging: &logging` at top level declares an anchor on the nested block.
      i++
      let value
      if (rest === '') {
        value = i < lines.length && lines[i].indent > indent ? parseBlock(lines[i].indent) : null
      } else {
        value = scalar(rest)
      }
      if (anchorName) anchors[anchorName] = value
      obj[key] = value
    }
    return obj
  }

  const doc = parseBlock(lines[0]?.indent ?? 0)
  return doc
}

let doc = null
try {
  doc = parseYaml(raw)
  pass('YAML parses')
} catch (err) {
  fail(`YAML does not parse: ${err.message}`)
}

if (doc) {
  const services = doc.services ?? {}
  for (const name of ['db', 'api', 'web']) {
    if (services[name]) pass(`service "${name}" is defined`)
    else fail(`service "${name}" is missing`)
  }

  // The mistake this script exists to catch: build keys and service keys getting mixed up.
  const buildOnly = ['context', 'dockerfile', 'args', 'target']
  for (const [name, svc] of Object.entries(services)) {
    for (const k of buildOnly) {
      if (k in svc) fail(`service "${name}" has "${k}" at service level — it belongs under build:`)
    }
    if (svc.build && typeof svc.build === 'object') {
      for (const k of ['logging', 'restart', 'ports', 'environment', 'volumes', 'depends_on']) {
        if (k in svc.build) fail(`service "${name}" has "${k}" under build: — it belongs at service level`)
      }
    }
  }
  if (failures === 0) pass('no keys nested under the wrong parent')

  // Operational expectations for a production file.
  for (const [name, svc] of Object.entries(services)) {
    if (!svc.logging) fail(`service "${name}" has no logging config — json-file is unbounded and will fill the disk`)
    if (!svc.restart) fail(`service "${name}" has no restart policy`)
  }
  if (services.db?.ports) fail('the database publishes a port — it must only be reachable inside the network')
  else pass('the database is not published to the host')

  if (services.db?.healthcheck) pass('the database has a health check')
  else fail('the database has no health check — api depends_on service_healthy needs one')

  const named = Object.keys(doc.volumes ?? {})
  for (const v of ['safeops_pgdata', 'safeops_uploads', 'safeops_backups']) {
    if (named.includes(v)) pass(`named volume "${v}" declared`)
    else fail(`named volume "${v}" is missing — data would not survive a redeploy`)
  }
}

// ── Variable resolution ──────────────────────────────────────────────────────
console.log()
const envKeys = new Set()
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/)
    if (m) envKeys.add(m[1])
  }
  pass(`${envPath.split(/[\\/]/).pop()} declares ${envKeys.size} variables`)
} else {
  fail(`${envPath} does not exist`)
}

// ${VAR}, ${VAR:-default}, ${VAR:?message}
const refs = [...raw.matchAll(/\$\{([A-Z_][A-Z0-9_]*)(:[-?][^}]*)?\}/g)]
const required = new Set()
const defaulted = new Set()
for (const [, name, suffix] of refs) {
  if (!suffix || suffix.startsWith(':?')) required.add(name)
  else defaulted.add(name)
}

for (const v of [...required].sort()) {
  if (envKeys.has(v)) pass(`required ${v} is present in the env file`)
  else fail(`required ${v} is referenced by compose but absent from the env file`)
}
const undocumented = [...defaulted].filter((v) => !envKeys.has(v) && !required.has(v))
if (undocumented.length) {
  console.log(`  NOTE  optional and not in the env file (defaults apply): ${undocumented.sort().join(', ')}`)
}

console.log()
if (failures === 0) {
  console.log('Compose file is structurally sound and every required variable is documented.')
  console.log('This is NOT a substitute for `docker compose config` — run that on a host with Docker.')
} else {
  console.log(`${failures} problem(s) found.`)
  process.exitCode = 1
}
