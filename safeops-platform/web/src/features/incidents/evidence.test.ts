import { describe, expect, it } from 'vitest'
import { EVIDENCE_MAX_BYTES, screenEvidence } from './evidence'

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

describe('screenEvidence', () => {
  it('keeps photos and PDFs, and says why anything else is refused', () => {
    const { ok, refused } = screenEvidence([
      file('a.jpg', 'image/jpeg'), file('b.heic', 'image/heic'), file('c.pdf', 'application/pdf'),
      file('clip.mp4', 'video/mp4'), file('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      file('huge.png', 'image/png', EVIDENCE_MAX_BYTES + 1),
    ])
    expect(ok.map((f) => f.name)).toEqual(['a.jpg', 'b.heic', 'c.pdf'])
    expect(refused).toEqual([
      'clip.mp4 is not a photo or PDF.',
      'notes.docx is not a photo or PDF.',
      'huge.png is over 10 MB.',
    ])
  })

  it('matches what the server accepts', async () => {
    // The two lists must not drift: a file screened in here and refused there is the same
    // false "attached" this module exists to stop.
    const { readFileSync } = await import('node:fs')
    const server = readFileSync('../api/src/lib/uploadSafety.ts', 'utf8')
    const types = [...server.slice(server.indexOf('ALLOWED_UPLOAD_TYPES'), server.indexOf('])', server.indexOf('ALLOWED_UPLOAD_TYPES'))).matchAll(/\['([^']+)'/g)].map((m) => m[1])
    const { EVIDENCE_TYPES } = await import('./evidence')
    expect([...EVIDENCE_TYPES].sort()).toEqual(types.sort())
  })
})
