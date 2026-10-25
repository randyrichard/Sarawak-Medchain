/**
 * Reading a CSV file the way the files people actually have are written.
 *
 * The files an import receives come out of Excel, so: a byte-order mark at the start, CRLF
 * line ends, commas inside quoted cells ("Lim, Grace"), doubled quotes for a quote, and -
 * on a laptop set to a European or some Asian locales - semicolons instead of commas. A
 * line split on commas gets every one of those wrong, silently, by shifting a value into the
 * next column. This follows RFC 4180, guesses the delimiter from the header row, and keeps
 * blank lines out of the data.
 */

export const MAX_IMPORT_ROWS = 2000

/** Delimiters tried, in order of preference when the header is ambiguous. */
const DELIMITERS = [',', ';', '\t'] as const

/** The delimiter the header row uses: whichever appears most outside quotes. */
function detectDelimiter(text: string): string {
  const firstLine: string[] = []
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    firstLine.push(quoted ? '' : ch)
  }
  let best: string = ','
  let bestCount = 0
  for (const d of DELIMITERS) {
    const n = firstLine.filter((c) => c === d).length
    if (n > bestCount) { best = d; bestCount = n }
  }
  return best
}

/** Rows of cells, with the header row first. Cells are trimmed; empty rows are dropped. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  const endCell = () => { row.push(cell.trim()); cell = '' }
  const endRow = () => {
    endCell()
    if (row.some((c) => c !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      endCell()
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else {
      cell += ch
    }
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

/** A header as a matching key: "Employee No." and "employee_no" are the same column. */
export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * A date as written in Malaysia: day first.
 *
 * YYYY-MM-DD, or DD/MM/YYYY (also with - or .), or an Excel-style "5 Jan 2026". A slash date
 * is read day first because that is the convention here; a US-style 01/31/2026 is refused
 * as an impossible month rather than guessed at. Returns "YYYY-MM-DD", or null when the
 * text is not a real date.
 */
export function parseDay(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const valid = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d))
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1900 && y <= 2200
      ? `${y}-${pad(m)}-${pad(d)}` : null
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})$/.exec(s)
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mi = months.indexOf(m[2].slice(0, 3).toLowerCase())
    return mi < 0 ? null : valid(Number(m[3]), mi + 1, Number(m[1]))
  }
  return null
}

/** Yes/no as people type it. Undefined when the cell is empty, null when it is neither. */
export function parseYesNo(raw: string): boolean | null | undefined {
  const s = raw.trim().toLowerCase()
  if (!s) return undefined
  if (['yes', 'y', 'true', '1', 'ya'].includes(s)) return true
  if (['no', 'n', 'false', '0', 'tidak'].includes(s)) return false
  return null
}
