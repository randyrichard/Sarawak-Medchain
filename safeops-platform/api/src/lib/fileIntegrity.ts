import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

/**
 * Integrity digests for uploaded evidence.
 *
 * Every credential in this system is already hashed — passwords with Argon2id, refresh,
 * reset and invitation tokens with SHA-256. Uploaded files were the one thing stored with no
 * digest at all, and for this product they are the part where it matters most in a dispute:
 * an incident photo, a permit's gas test sheet and a calibration certificate are evidence.
 * Without a digest there is no way to answer "is this the file that was uploaded?" — not
 * after a restore, not after a disk fault, and not if somebody with access to the uploads
 * volume edits one.
 *
 * SHA-256 rather than a password hash. The threat here is alteration and corruption, not
 * somebody guessing the contents, so the slow, salted, memory-hard properties that make
 * Argon2id right for passwords are exactly wrong for a 40 MB video: this has to be fast
 * enough to run on every upload and over the whole store during a check.
 *
 * A digest is not a signature. It proves a file matches what was recorded at upload; it does
 * not prove the record itself was not changed by whoever changed the file. Detecting a
 * corrupted restore is what this is for. Chain of custody against a determined insider with
 * database access needs signing, and this is not that.
 */

/** Streams the file so a large video is not read into memory to be hashed. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)

  return new Promise<string>((resolve, reject) => {
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export type IntegrityVerdict =
  /** The bytes on disk still match what was recorded at upload. */
  | { status: 'ok'; checksum: string }
  /** The file is there and readable, and it is not the file that was uploaded. */
  | { status: 'mismatch'; expected: string; actual: string }
  /** Nothing on disk at this name. */
  | { status: 'missing' }
  /**
   * Uploaded before checksums existed, so there is nothing to compare against.
   *
   * Deliberately distinct from `ok`. Reporting an unverifiable file as verified would be a
   * lie of exactly the kind this feature exists to prevent, and every file already in the
   * store is in this state until it is re-uploaded.
   */
  | { status: 'unverifiable' }

/**
 * Compares a stored file against the digest recorded when it was uploaded.
 *
 * Never throws for the ordinary failures — a missing file and a changed file are both
 * answers, not errors, and a caller checking ten thousand files should not have to wrap
 * each one.
 */
export async function verifyFile(path: string, expected: string | null): Promise<IntegrityVerdict> {
  try {
    await stat(path)
  } catch {
    return { status: 'missing' }
  }

  if (!expected) return { status: 'unverifiable' }

  const actual = await sha256File(path)
  return actual === expected
    ? { status: 'ok', checksum: actual }
    : { status: 'mismatch', expected, actual }
}
