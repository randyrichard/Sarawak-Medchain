import { describe, it, expect } from 'vitest'
import {
  toCsv, buildReadme, safeEntryName, uniqueEntryName, type TenantExport,
} from './tenantExport.js'

/**
 * The CSV layer of the data export.
 *
 * No database needed: this is the part that decides whether the file a customer opens years
 * from now is readable, honest, and safe to double-click.
 */

/** The BOM is the first character of every non-trivial file; strip it to read the rest. */
const body = (csv: string) => csv.replace(/^﻿/, '')
const rows = (csv: string) => body(csv).trimEnd().split('\r\n')

describe('toCsv — shape', () => {
  it('writes a header from the keys and one line per row', () => {
    const csv = toCsv([
      { id: 'a', title: 'Slip on ramp' },
      { id: 'b', title: 'Near miss at press' },
    ])
    expect(rows(csv)).toEqual([
      'id,title',
      'a,Slip on ramp',
      'b,Near miss at press',
    ])
  })

  it('starts with a UTF-8 BOM so Excel does not mangle non-ASCII names', () => {
    // Without it, Windows Excel reads the system code page and every Malay or Chinese name
    // in the workforce register comes back as mojibake.
    const csv = toCsv([{ name: 'Nurul Aisyah binti Zulkifli' }])
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('returns just a BOM for an empty table rather than an empty file', () => {
    // A zero-byte file reads as a broken export; a BOM-only file opens as an empty sheet.
    expect(toCsv([])).toBe('﻿')
  })

  it('uses the union of keys, not the first row', () => {
    /*
     * A nullable JSON column is absent from one row and present in the next. Taking the
     * header from row zero would drop the column entirely and, worse, shift every later
     * value one place left.
     */
    const csv = toCsv([
      { id: 'a', rcaFishbone: null },
      { id: 'a2', rcaFishbone: null, closeNote: 'Verified on site' },
    ])
    expect(rows(csv)[0]).toBe('id,rcaFishbone,closeNote')
    expect(rows(csv)[1]).toBe('a,,')
  })
})

describe('toCsv — escaping', () => {
  it('quotes values containing a comma, a quote or a newline', () => {
    const csv = toCsv([{ a: 'one,two', b: 'he said "no"', c: 'line one\nline two' }])
    expect(rows(csv)[1]).toBe('"one,two","he said ""no""","line one\nline two"')
  })

  it('quotes values with edge whitespace a reader would silently trim', () => {
    expect(rows(toCsv([{ a: ' padded ' }]))[1]).toBe('" padded "')
  })

  it('renders dates as ISO 8601, not a locale format', () => {
    const csv = toCsv([{ occurredAt: new Date('2026-03-14T02:30:00.000Z') }])
    expect(rows(csv)[1]).toBe('2026-03-14T02:30:00.000Z')
  })

  it('renders null and undefined as empty, not as the words', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0, d: false }])
    // 0 and false are values and must survive; only absence is blank.
    expect(rows(csv)[1]).toBe(',,0,false')
  })

  it('joins array columns and serialises JSON columns', () => {
    const csv = toCsv([{ requiredPpe: ['harness', 'face shield'], rcaFiveWhys: { problem: 'x' } }])
    expect(rows(csv)[1]).toBe('harness; face shield,"{""problem"":""x""}"')
  })
})

describe('toCsv — formula injection', () => {
  /*
   * The threat is specific and real in this product. An incident description is free text
   * typed by whoever reported it, which includes every employee. An administrator later
   * exports and opens the file. Without this guard the lowest-privilege user in the system
   * gets code running on the highest-privilege user's machine.
   */
  const dangerous = ['=', '+', '-', '@', '\t', '\r']

  it.each(dangerous)('neutralises a cell starting with %j', (lead) => {
    const csv = toCsv([{ description: `${lead}cmd|'/c calc'!A1` }])
    const cell = rows(csv)[1]
    // The apostrophe makes Excel and LibreOffice treat the rest as literal text.
    expect(cell.startsWith("'") || cell.startsWith('"\'')).toBe(true)
  })

  it('keeps the original text intact after the guard', () => {
    // The customer owns this data. Defusing it must not corrupt it.
    const csv = toCsv([{ note: '=SUM(A1:A2)' }])
    expect(rows(csv)[1]).toContain('=SUM(A1:A2)')
  })

  it('leaves ordinary values alone', () => {
    const csv = toCsv([{ a: 'Slip on ramp', b: '42', c: 'PTW-4402' }])
    expect(rows(csv)[1]).toBe('Slip on ramp,42,PTW-4402')
  })

  it('does not mistake a negative number for a formula lead in a way that loses it', () => {
    // "-5" trips the guard because a cell can start "-2+3"; the value must still be readable.
    expect(rows(toCsv([{ delta: -5 }]))[1]).toContain('-5')
  })
})

describe('safeEntryName', () => {
  it('keeps the name the operator recognises', () => {
    expect(safeEntryName('Burn to left forearm.jpg', 'a1b2c3.jpg')).toBe('Burn to left forearm.jpg')
  })

  it('takes the extension from the stored name, not the client one', () => {
    /*
     * The find that prompted this. The upload routes validate the type and write a
     * server-chosen `<uuid>.png`, so `evil.png.php` is stored as a png and can never be
     * served as PHP. Putting the client extension back into the archive would undo that the
     * moment somebody extracts it into a directory that serves PHP.
     */
    expect(safeEntryName('evil.png.php', 'd41d8cd9.png')).toBe('evil.png')
  })

  it('refuses to climb out of its folder', () => {
    expect(safeEntryName('../../../etc/passwd', 'x.txt')).not.toContain('..')
    expect(safeEntryName('../../../etc/passwd', 'x.txt')).not.toContain('/')
  })

  it('strips a NUL truncation attempt', () => {
    expect(safeEntryName('report\x00.exe', 'x.pdf')).toBe('report.pdf')
  })

  it('does not produce a hidden file', () => {
    expect(safeEntryName('.bashrc', 'x.txt').startsWith('.')).toBe(false)
  })

  it('falls back to the stored name when nothing usable survives', () => {
    expect(safeEntryName('', 'a1b2c3.pdf')).toBe('a1b2c3.pdf')
    expect(safeEntryName('///', 'a1b2c3.pdf')).toBe('___.pdf')
  })

  it('leaves an ordinary dotted filename alone', () => {
    // The rule strips extensions the server did not vouch for. It must not eat the dots in
    // a legitimate name that already ends correctly.
    expect(safeEntryName('gas-log.2026.03.pdf', 'x.pdf')).toBe('gas-log.2026.03.pdf')
  })

  it('always ends in the extension the server vouched for', () => {
    // The security property, stated directly. The stem is cosmetic; this is not.
    for (const client of ['evil.png.php', 'x.exe', 'no-extension', '.htaccess', '']) {
      expect(safeEntryName(client, 'abc.png').toLowerCase().endsWith('.png')).toBe(true)
    }
  })

  it('caps a very long name', () => {
    const long = `${'a'.repeat(400)}.jpg`
    expect(safeEntryName(long, 'x.jpg').length).toBeLessThanOrEqual(104)
  })
})

describe('uniqueEntryName', () => {
  it('leaves the first of a name alone', () => {
    const taken = new Set<string>()
    expect(uniqueEntryName('files/IMG_0421.jpg', taken)).toBe('files/IMG_0421.jpg')
  })

  it('numbers a collision before the extension so it still opens', () => {
    /*
     * Two incidents each with a photo the phone called IMG_0421.jpg. A zip may hold duplicate
     * names, but extraction silently overwrites - so evidence would vanish between the
     * download and the disk.
     */
    const taken = new Set<string>()
    const a = uniqueEntryName('files/IMG_0421.jpg', taken)
    const b = uniqueEntryName('files/IMG_0421.jpg', taken)
    const c = uniqueEntryName('files/IMG_0421.jpg', taken)
    expect([a, b, c]).toEqual([
      'files/IMG_0421.jpg', 'files/IMG_0421 (2).jpg', 'files/IMG_0421 (3).jpg',
    ])
  })

  it('handles a name with no extension', () => {
    const taken = new Set<string>()
    uniqueEntryName('files/scan', taken)
    expect(uniqueEntryName('files/scan', taken)).toBe('files/scan (2)')
  })

  it('does not mistake a dot in the folder for an extension', () => {
    const taken = new Set<string>()
    uniqueEntryName('incident-evidence/report', taken)
    expect(uniqueEntryName('incident-evidence/report', taken)).toBe('incident-evidence/report (2)')
  })
})

describe('buildReadme', () => {
  const snapshot = (over: Partial<TenantExport> = {}): TenantExport => ({
    companyId: 'sarawak-pilot',
    companyName: 'Sarawak Pilot Energy',
    takenAt: new Date('2026-08-28T01:00:00.000Z'),
    tables: [
      { name: 'incidents', rows: [{ id: 'a' }, { id: 'b' }] },
      { name: 'permit-controls', rows: [{ id: 'c' }] },
    ],
    files: [{ storedName: 'x1', originalName: 'burn.jpg', folder: 'incident-evidence' }],
    ...over,
  })

  it('names the organisation and when it was taken', () => {
    const text = buildReadme(snapshot())
    expect(text).toContain('Sarawak Pilot Energy')
    expect(text).toContain('2026-08-28T01:00:00.000Z')
  })

  it('lists every table with its row count', () => {
    const text = buildReadme(snapshot())
    expect(text).toMatch(/incidents\.csv\s+2 rows/)
    expect(text).toMatch(/permit-controls\.csv\s+1 rows/)
  })

  it('totals rows and files so a truncated archive is detectable', () => {
    // Somebody opening this in five years needs a way to tell it is complete.
    expect(buildReadme(snapshot())).toContain('2 tables, 3 rows, 1 files')
  })

  it('warns that the workforce register carries health data', () => {
    /*
     * Fitness expiry and medical restrictions are sensitive personal data under the
     * Malaysian PDPA, and the archive has no access control of its own once downloaded.
     * Saying so is the difference between handing someone their data and handing them a
     * liability they did not know they were holding.
     */
    const text = buildReadme(snapshot())
    expect(text).toContain('sensitive personal data')
    expect(text).toContain('Personal Data Protection Act')
  })

  it('states that credentials are deliberately absent', () => {
    const text = buildReadme(snapshot())
    expect(text).toContain('Passwords')
    expect(text).toMatch(/API keys/i)
  })

  it('explains how children join to parents', () => {
    // The whole point of the export is that permits arrive with their controls attached.
    const text = buildReadme(snapshot())
    expect(text).toContain('permit-controls.permitId')
    expect(text).toContain('incident-timeline.incidentId')
  })
})
