/**
 * Fails the build if a credential reached the shipped bundle.
 *
 * The demo dataset used to compile into production: six accounts with a plaintext password,
 * readable with view-source on a page sold to safety-compliance buyers. The fix is a
 * build-time fold, and the only way to know a fold actually happened is to look at the
 * artefact - a unit test of the condition would keep passing while the string shipped.
 *
 * Run after `npm run build`:
 *   npm run verify:bundle
 *
 * Exit 0 means nothing forbidden is present. Exit 1 names what leaked and where.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'

/**
 * Things that must never ship.
 *
 * Deliberately narrow. Fictional names and company names still appear inside the mock
 * backend's generator functions, and removing those means build-time aliasing the whole
 * mock tree - a change to the API facade that dozens of files import. They are synthetic
 * content that grants nothing, so they are a known residue rather than a failure. What is
 * listed here is the part that is genuinely dangerous: anything usable as a credential.
 */
const FORBIDDEN = [
  { needle: 'SafeOpsPlatform2026', why: 'the demo password' },
  { needle: 'ceo@demo.safeops.app', why: 'a demo account address from the sign-in shortcuts' },
  { needle: 'admin@demo.safeops.app', why: 'the demo administrator address' },
]

/**
 * A password field carrying something that could actually be a password.
 *
 * Deliberately strict about the value. A loose pattern matched `password: ` in a UI label
 * and ran greedily into the minified code after it, so the first run of this script failed
 * on its own false positive. A credential has no spaces, brackets or punctuation from the
 * surrounding syntax, so the character class is what does the discriminating.
 */
const PASSWORD_FIELD = /password\s*:\s*["'][A-Za-z0-9!@#$%^&*()_+=-]{8,}["']/g

/**
 * Real credential formats, as opposed to SafeOps' own demo password above.
 *
 * The browser is given exactly one setting (the API's address) and talks to nothing but
 * the SafeOps API, so no key of any kind has a reason to be in this bundle. These are the
 * shapes a key takes when somebody adds a VITE_ variable "just for now", or pastes one into
 * a component to try something: the bundle is public the moment it is deployed, and
 * anything in it belongs to whoever opens the developer tools.
 *
 * Each pattern needs the key's body, not just its name, so the Reports page explaining
 * "set RESEND_API_KEY" in its help text is not a finding.
 */
const KEY_PATTERNS = [
  { re: /sk_(live|test)_[A-Za-z0-9]{16,}/g, why: 'an API secret key (sk_live_/sk_test_)' },
  { re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/g, why: 'a Resend API key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, why: 'an AWS access key id' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, why: 'a Google API key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, why: 'a GitHub token' },
  { re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, why: 'a Slack token' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, why: 'a private key' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, why: 'a signed JWT' },
  { re: /\bpostgres(?:ql)?:\/\/[^\s"'`:]+:[^\s"'`@]+@/g, why: 'a database URL with a password' },
  { re: /\bwhsec_[A-Za-z0-9+/=]{16,}/g, why: 'a webhook signing secret' },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.(js|css|html)$/.test(entry.name)) out.push(p)
  }
  return out
}

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ directory. Run "npm run build" first.`)
  process.exit(1)
}

const files = walk(DIST)
const problems = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const { needle, why } of FORBIDDEN) {
    if (text.includes(needle)) problems.push(`${file}: contains ${why} ("${needle}")`)
  }
  for (const { re, why } of KEY_PATTERNS) {
    for (const match of text.match(re) ?? []) {
      // Never print the whole secret into a CI log - that would be a second leak.
      problems.push(`${file}: contains ${why} (${match.slice(0, 8)}…)`)
    }
  }
  for (const match of text.match(PASSWORD_FIELD) ?? []) {
    // A bundler may emit `password:""` for an empty default; only values are a problem.
    if (!/["']\s*["']/.test(match)) problems.push(`${file}: password literal ${match.slice(0, 60)}`)
  }
}

console.log(`scanned ${files.length} built file(s) in ${DIST}/`)

if (problems.length) {
  console.error('\nFORBIDDEN CONTENT IN THE PRODUCTION BUNDLE:')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nThis ships to every customer. Do not release it.')
  process.exit(1)
}

console.log('No credentials in the bundle.')
