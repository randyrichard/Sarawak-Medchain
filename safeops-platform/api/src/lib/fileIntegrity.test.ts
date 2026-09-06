import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256File, verifyFile } from './fileIntegrity.js'

/**
 * The point of these is the *verdicts*, not the hashing.
 *
 * Node's SHA-256 does not need testing. What needs testing is that this never reports a file
 * as verified when it is not — including the case that gave the feature its shape: a file
 * with no recorded digest is UNVERIFIABLE, and must never be quietly counted as fine.
 */
let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'safeops-integrity-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

const write = async (name: string, body: string) => {
  const path = join(dir, name)
  await writeFile(path, body)
  return path
}

const sha = (body: string) => createHash('sha256').update(body).digest('hex')

describe('sha256File', () => {
  it('matches a digest of the same bytes', async () => {
    const path = await write('a.txt', 'incident photo bytes')
    expect(await sha256File(path)).toBe(sha('incident photo bytes'))
  })

  it('changes when a single byte changes', async () => {
    const a = await write('b1.txt', 'gas test: 20.9% O2')
    const b = await write('b2.txt', 'gas test: 20.8% O2')
    expect(await sha256File(a)).not.toBe(await sha256File(b))
  })

  it('hashes an empty file rather than failing on it', async () => {
    // A zero-byte upload is a real outcome of a truncated transfer, and it has to be
    // representable — otherwise the check throws on exactly the case worth catching.
    const path = await write('empty.txt', '')
    expect(await sha256File(path)).toBe(sha(''))
  })

  it('handles a file larger than one read buffer', async () => {
    // Streaming, not readFile — this is the case that would break a naive implementation
    // by hashing only the first chunk.
    const big = 'x'.repeat(2 * 1024 * 1024)
    const path = await write('big.bin', big)
    expect(await sha256File(path)).toBe(sha(big))
  })

  it('rejects rather than resolving when the file is not there', async () => {
    await expect(sha256File(join(dir, 'nope.txt'))).rejects.toThrow()
  })
})

describe('verifyFile', () => {
  it('reports a file that still matches as ok', async () => {
    const body = 'permit signature scan'
    const path = await write('ok.txt', body)
    expect(await verifyFile(path, sha(body))).toEqual({ status: 'ok', checksum: sha(body) })
  })

  it('reports an altered file as a mismatch, with both digests', async () => {
    const original = 'original evidence'
    const path = await write('tampered.txt', original)
    const recorded = sha(original)
    await appendFile(path, ' — edited later')

    const verdict = await verifyFile(path, recorded)
    expect(verdict.status).toBe('mismatch')
    if (verdict.status === 'mismatch') {
      expect(verdict.expected).toBe(recorded)
      expect(verdict.actual).not.toBe(recorded)
    }
  })

  it('reports a file that is no longer on disk as missing', async () => {
    expect(await verifyFile(join(dir, 'gone.txt'), sha('anything'))).toEqual({ status: 'missing' })
  })

  it('reports a file with no recorded digest as unverifiable, NOT as ok', async () => {
    // The whole feature turns on this. Everything uploaded before checksums existed has a
    // null digest, and calling that "verified" would be precisely the false assurance the
    // check is meant to prevent.
    const path = await write('legacy.txt', 'uploaded before checksums existed')
    expect(await verifyFile(path, null)).toEqual({ status: 'unverifiable' })
  })

  it('prefers "missing" over "unverifiable" when the file is gone as well', async () => {
    // Absent bytes are the more serious fact, and reporting the softer one would bury it.
    expect(await verifyFile(join(dir, 'gone-too.txt'), null)).toEqual({ status: 'missing' })
  })

  it('does not throw for the ordinary failures', async () => {
    // A caller sweeping ten thousand files must not have to wrap each one.
    await expect(verifyFile(join(dir, 'absent.txt'), sha('x'))).resolves.toBeTruthy()
    await expect(verifyFile(await write('present.txt', 'y'), 'not-a-real-digest')).resolves.toBeTruthy()
  })
})
