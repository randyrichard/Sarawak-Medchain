import { request, qs } from './http'

/**
 * Importing a company's existing registers from a CSV file.
 *
 * The server reads the file and decides what each row is (api/src/lib/dataImport.ts); the
 * columns, their help and the template all come from it, so the guide on screen and the file
 * people fill in cannot drift apart.
 */

export type ImportKind = 'employees' | 'contractors' | 'contractor_workers' | 'assets'

export interface ImportColumn {
  key: string
  header: string
  required: boolean
  help: string
  example: string
  aliases?: string[]
}

export interface ImportCatalog {
  maxRows: number
  kinds: { kind: ImportKind; label: string; columns: ImportColumn[] }[]
}

export type RowAction = 'add' | 'skip' | 'fix'

export interface ImportRow {
  /** The line in the file, header included, as a spreadsheet numbers it. */
  line: number
  action: RowAction
  label: string
  message: string | null
  /** After an import: the reference the new record was given. */
  ref?: string
}

export interface ImportPlan {
  kind: ImportKind
  total: number
  add: number
  skip: number
  fix: number
  ignoredColumns: string[]
  rows: ImportRow[]
}

const send = (path: string, csv: string) => request<ImportPlan>(path, {
  method: 'POST', body: csv, headers: { 'Content-Type': 'text/csv; charset=utf-8' },
})

export const importApi = {
  catalog: () => request<ImportCatalog>('/imports/catalog'),
  /** What importing the file would do, row by row. Writes nothing. */
  preview: (companyId: string, kind: ImportKind, csv: string) => send(`/imports/${kind}/preview?${qs({ companyId })}`, csv),
  run: (companyId: string, kind: ImportKind, csv: string) => send(`/imports/${kind}?${qs({ companyId })}`, csv),
}

/** The empty file to fill in: the headers, and one example row a person can overwrite. */
export function templateCsv(columns: ImportColumn[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [columns.map((c) => cell(c.header)).join(','), columns.map((c) => cell(c.example)).join(',')].join('\r\n') + '\r\n'
}

export type FileProblem = 'spreadsheet' | 'empty'

/**
 * A chosen file's text, as the person sees it in Excel.
 *
 * Excel on Windows saves "CSV (Comma delimited)" in the PC's own code page, not UTF-8, so a
 * name with an accent or a curly apostrophe arrived as a replacement character and was
 * imported that way. A file that is not valid UTF-8 is read as Windows-1252 instead, which
 * is what that save produces in Malaysia. An .xlsx saved under a .csv name is a zip file,
 * and is turned away by its first bytes rather than imported as noise.
 */
export async function readCsvFile(file: Blob): Promise<{ text: string } | { problem: FileProblem }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length === 0) return { problem: 'empty' }
  // "PK\x03\x04" (xlsx, a zip) or the OLE header of an old .xls.
  if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) return { problem: 'spreadsheet' }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes) }
  }
}
