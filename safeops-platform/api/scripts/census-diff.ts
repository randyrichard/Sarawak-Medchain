/**
 * Compares two censuses and reports what moved.
 *
 * The question an upgrade or a restore has to answer is not "did it succeed" but "is
 * anything different that should not be". A row count that dropped, or a digest that
 * changed while the count held, is data loss or data corruption respectively — and both
 * are invisible in a migration's own success message.
 *
 *   tsx scripts/census-diff.ts before.json after.json
 */
export {}

interface Entry { rows: number; digest: string }

const [, , beforePath, afterPath] = process.argv
if (!beforePath || !afterPath) {
  console.error('usage: census-diff.ts <before.json> <after.json>')
  process.exit(1)
}

const { readFileSync } = await import('node:fs')
// A shell redirect on Windows prefixes the file with a byte-order mark, which JSON.parse
// rejects. Strip it rather than constrain how the census gets captured.
const read = (p: string): Record<string, Entry> =>
  JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''))
const before = read(beforePath)
const after = read(afterPath)

const models = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()

const lost: string[] = []
const changed: string[] = []
const appeared: string[] = []

console.log('\nmodel                       before      after   verdict')
console.log('─'.repeat(64))

for (const m of models) {
  const b = before[m] ?? { rows: -1, digest: 'ABSENT' }
  const a = after[m] ?? { rows: -1, digest: 'ABSENT' }
  if (b.rows <= 0 && a.rows <= 0) continue

  let verdict: string
  if (b.rows === -1 && a.rows >= 0) {
    verdict = 'new table'
    appeared.push(m)
  } else if (a.rows < b.rows) {
    verdict = `LOST ${b.rows - a.rows} ROW(S)`
    lost.push(`${m} (-${b.rows - a.rows})`)
  } else if (a.rows > b.rows) {
    verdict = `+${a.rows - b.rows} row(s)`
  } else if (a.digest !== b.digest) {
    verdict = 'SAME COUNT, CONTENT CHANGED'
    changed.push(m)
  } else {
    verdict = 'identical'
  }

  const fmt = (n: number) => (n === -1 ? '—' : String(n))
  console.log(`${m.padEnd(26)} ${fmt(b.rows).padStart(6)} ${fmt(a.rows).padStart(10)}   ${verdict}`)
}

console.log('─'.repeat(64))
if (lost.length === 0 && changed.length === 0) {
  console.log(`No data lost, no content altered.${appeared.length ? ` New tables: ${appeared.join(', ')}.` : ''}`)
} else {
  if (lost.length) console.log(`DATA LOSS: ${lost.join(' · ')}`)
  if (changed.length) console.log(`CONTENT CHANGED: ${changed.join(' · ')}`)
  process.exitCode = 1
}
