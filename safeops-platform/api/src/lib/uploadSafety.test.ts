import { describe, it, expect } from 'vitest'
import { attachmentDisposition, matchesSignature } from './uploadSafety.js'

/**
 * The checks every upload route relies on. See uploadSafety.ts for why each exists.
 */
describe('matchesSignature', () => {
  const b = (hex: string) => Buffer.from(hex.replace(/ /g, ''), 'hex')

  it('recognises each accepted type by its leading bytes', () => {
    expect(matchesSignature('image/jpeg', b('ffd8ffe0 0010'))).toBe(true)
    expect(matchesSignature('image/png', b('89504e47 0d0a1a0a 0000'))).toBe(true)
    expect(matchesSignature('image/webp', Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe(true)
    expect(matchesSignature('image/heic', Buffer.from('\x00\x00\x00\x18ftypheic', 'latin1'))).toBe(true)
    expect(matchesSignature('application/pdf', Buffer.from('%PDF-1.7\n'))).toBe(true)
  })

  it('accepts a PDF whose header is preceded by junk, as scanners produce', () => {
    expect(matchesSignature('application/pdf', Buffer.concat([Buffer.alloc(200, 0x20), Buffer.from('%PDF-1.4')]))).toBe(true)
  })

  it('refuses an executable, a script or a page declared as an accepted type', () => {
    for (const bytes of [Buffer.from('MZ\x90\x00', 'latin1'), Buffer.from('<html><script>'), Buffer.from('#!/bin/sh')]) {
      for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']) {
        expect(matchesSignature(type, bytes), type).toBe(false)
      }
    }
  })

  it('refuses a genuine file declared as a different accepted type', () => {
    expect(matchesSignature('image/jpeg', b('89504e47 0d0a1a0a'))).toBe(false)
  })

  it('refuses an empty file and an unknown type', () => {
    expect(matchesSignature('image/png', Buffer.alloc(0))).toBe(false)
    expect(matchesSignature('text/html', Buffer.from('%PDF-'))).toBe(false)
  })
})

describe('attachmentDisposition', () => {
  it('keeps a name that already agrees with its type', () => {
    expect(attachmentDisposition('Gas test.pdf', 'application/pdf'))
      .toBe(`attachment; filename="Gas test.pdf"; filename*=UTF-8''Gas%20test.pdf`)
    expect(attachmentDisposition('IMG_0001.JPEG', 'image/jpeg')).toContain('filename="IMG_0001.JPEG"')
  })

  it('appends the real extension when the name claims another', () => {
    expect(attachmentDisposition('Invoice.exe', 'application/pdf')).toContain('filename="Invoice.exe.pdf"')
    expect(attachmentDisposition('photo.html', 'image/png')).toContain('filename="photo.html.png"')
    expect(attachmentDisposition('no-extension', 'image/png')).toContain('filename="no-extension.png"')
  })

  it('cannot address a path or break out of the header', () => {
    const h = attachmentDisposition('../../etc/pa"ss\r\nX-Evil: 1.pdf', 'application/pdf')
    expect(h).not.toMatch(/[\r\n]/)
    expect(h).not.toContain('/')
    expect(h.match(/filename="([^"]*)"/)?.[1]).toBe('.._.._etc_passX-Evil: 1.pdf')
  })

  it('carries a non-ASCII name intact in the UTF-8 form and a safe stand-in in the plain one', () => {
    const h = attachmentDisposition('Laporan keselamatan – 安全.pdf', 'application/pdf')
    expect(h).toContain('filename="Laporan keselamatan _ __.pdf"')
    expect(decodeURIComponent(h.split("UTF-8''")[1])).toBe('Laporan keselamatan – 安全.pdf')
  })

  it('escapes the characters RFC 5987 does not allow bare', () => {
    expect(attachmentDisposition("O'Brien (copy).pdf", 'application/pdf')).toContain("UTF-8''O%27Brien%20%28copy%29.pdf")
  })

  it('never produces an empty name', () => {
    expect(attachmentDisposition('""', 'image/png')).toContain('filename="file.png"')
  })
})

describe('settleUploadTypes', () => {
  it('corrects a genuine file declared as another accepted type, and refuses one that is none of them', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { settleUploadTypes } = await import('./uploadSafety.js')
    const dir = mkdtempSync(join(tmpdir(), 'uploads-'))
    writeFileSync(join(dir, 'a'), Buffer.from('89504e470d0a1a0a00', 'hex'))
    writeFileSync(join(dir, 'b'), Buffer.from('MZ\x90\x00', 'latin1'))

    const screenshot = { filename: 'a', mimetype: 'image/jpeg', originalname: 'shot.jpg' }
    expect(await settleUploadTypes(dir, [screenshot])).toBeNull()
    expect(screenshot.mimetype).toBe('image/png')

    const exe = { filename: 'b', mimetype: 'application/pdf', originalname: 'Permit.pdf' }
    expect(await settleUploadTypes(dir, [screenshot, exe])).toBe(exe)
  })
})
