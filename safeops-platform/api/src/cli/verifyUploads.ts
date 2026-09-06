/**
 * Checks that stored evidence is still the evidence that was uploaded.
 *
 * The database and the uploads volume are two separate things that can drift apart, and the
 * ways they do are quiet. A backup script that dumps Postgres and forgets the volume. A
 * restore that brings back yesterday's files beside today's rows. A disk returning bad bytes.
 * Somebody with shell access editing a photo. In every one of those the product carries on
 * working: the incident opens, the attachment is listed, the download starts. What is served
 * is simply no longer what was uploaded.
 *
 * This is the check that notices. Every attachment row is compared against the SHA-256
 * recorded when it was received.
 *
 *   node dist/cli/verifyUploads.js
 *   npm run files:verify
 *
 * Strictly read-only: it opens files, reads them, and writes nothing anywhere.
 *
 * Exit code 0 means every file with a recorded digest still matches it. Non-zero means at
 * least one file is missing or has changed, and both need explaining before the store is
 * treated as evidence.
 *
 * Files uploaded before checksums existed are reported as UNVERIFIABLE and do not fail the
 * run. That is deliberate and it is not a free pass: hashing them now would only record what
 * the bytes are today, which proves nothing about what was uploaded. They are counted and
 * named so the number visibly shrinks as old evidence ages out.
 */
import { resolve, join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { env } from '../env.js'
import { verifyFile, type IntegrityVerdict } from '../lib/fileIntegrity.js'

const db = new PrismaClient()
const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)

interface StoredFile {
  kind: string
  id: string
  label: string
  storedName: string
  checksum: string | null
}

async function collect(): Promise<StoredFile[]> {
  const [incident, permit, asset] = await Promise.all([
    db.incidentAttachment.findMany({
      select: { id: true, originalName: true, storedName: true, checksum: true },
    }),
    db.permitAttachment.findMany({
      select: { id: true, originalName: true, storedName: true, checksum: true },
    }),
    // Asset documents may be a record with no file attached, so the name is nullable and
    // those rows are not files to check.
    db.assetDocument.findMany({
      where: { storedName: { not: null } },
      select: { id: true, originalName: true, storedName: true, checksum: true },
    }),
  ])

  return [
    ...incident.map((r) => ({ kind: 'incident evidence', id: r.id, label: r.originalName, storedName: r.storedName, checksum: r.checksum })),
    ...permit.map((r) => ({ kind: 'permit attachment', id: r.id, label: r.originalName, storedName: r.storedName, checksum: r.checksum })),
    ...asset.map((r) => ({ kind: 'asset document', id: r.id, label: r.originalName ?? '(unnamed)', storedName: r.storedName as string, checksum: r.checksum })),
  ]
}

async function main() {
  console.log('SafeOps — evidence integrity check')
  console.log(`Uploads directory: ${UPLOAD_DIR}\n`)

  const files = await collect()
  if (files.length === 0) {
    console.log('No stored files to check.')
    return
  }

  const tally = { ok: 0, mismatch: 0, missing: 0, unverifiable: 0 }
  const problems: string[] = []
  const unverifiable: string[] = []

  for (const f of files) {
    const verdict: IntegrityVerdict = await verifyFile(join(UPLOAD_DIR, f.storedName), f.checksum)
    tally[verdict.status] += 1

    if (verdict.status === 'mismatch') {
      problems.push(
        `CHANGED   ${f.kind} ${f.id} — "${f.label}"\n`
        + `            expected ${verdict.expected}\n`
        + `            found    ${verdict.actual}`,
      )
    } else if (verdict.status === 'missing') {
      problems.push(`MISSING   ${f.kind} ${f.id} — "${f.label}" (${f.storedName})`)
    } else if (verdict.status === 'unverifiable') {
      unverifiable.push(`${f.kind} ${f.id} — "${f.label}"`)
    }
  }

  console.log(`Checked ${files.length} file${files.length === 1 ? '' : 's'}:`)
  console.log(`  verified      ${tally.ok}`)
  console.log(`  changed       ${tally.mismatch}`)
  console.log(`  missing       ${tally.missing}`)
  console.log(`  unverifiable  ${tally.unverifiable}  (uploaded before checksums were recorded)`)

  if (unverifiable.length) {
    console.log('\nUnverifiable — no digest was recorded when these were uploaded:')
    for (const u of unverifiable.slice(0, 20)) console.log(`  - ${u}`)
    if (unverifiable.length > 20) console.log(`  … and ${unverifiable.length - 20} more`)
  }

  if (problems.length) {
    console.error('\nPROBLEMS FOUND:')
    for (const p of problems) console.error(`  - ${p}`)
    console.error(
      '\nA changed or missing file is not a display problem. Treat this store as unreliable\n'
      + 'evidence until each one is explained — check the uploads volume, the last restore,\n'
      + 'and who has filesystem access.',
    )
    process.exitCode = 1
    return
  }

  console.log('\nEvery file with a recorded digest still matches it.')
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
