/**
 * The one CSV writer in the browser.
 *
 * There were three, byte-identical and all wrong in the same way: they escaped quotes and
 * stopped there. Quoting is not a defence against formula injection — a spreadsheet strips
 * the CSV quotes on import and *then* evaluates the cell, so `"=cmd|'/c calc'!A1"` arrives
 * as a live formula either way.
 *
 * That matters here more than in most products because of who can write the fields. The
 * `device` column of the login-history export is the raw `User-Agent` header, recorded on
 * every attempt including a failed one — so somebody with no account at all, who merely
 * knows one employee's email address, can put a payload into a file an administrator later
 * opens. Corrective-action titles reach a second export the same way, writable by any
 * employee. The victim is always the person with the most access.
 *
 * The API has had this guard since the workspace export shipped (`api/src/lib/tenantExport`);
 * this is the same rule, applied on the side that was still missing it.
 */

/**
 * Leading characters a spreadsheet reads as the start of a formula.
 *
 * `-` is included deliberately even though it is also how a negative number starts: a cell
 * of `-1+1` is arithmetic to Excel, and the apostrophe costs a legitimate `-5` nothing but
 * an invisible prefix that the spreadsheet strips on display. Tab and carriage return are
 * here because they are silently trimmed before the evaluation, so `\t=HYPERLINK(...)`
 * bypasses a naive check on `=` alone.
 */
const RISKY_LEAD = /^[=+\-@\t\r]/

/**
 * One cell, neutralised and quoted.
 *
 * The apostrophe is the standard mitigation: Excel, LibreOffice and Numbers all treat the
 * remainder as literal text and none of them display the apostrophe itself, so the value
 * the customer reads is the value that was stored. It defuses the cell without corrupting
 * the data — which matters, because these exports are the customer's own records.
 *
 * Every cell is quoted, not only the ones that need it. That is what the three exporters
 * this replaces already did, and keeping it means the fix changes which cells are dangerous
 * without changing what any existing file looks like.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = String(value ?? '')
  if (RISKY_LEAD.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * A complete CSV document: one header line, then one line per row, CRLF throughout.
 *
 * Returns a string rather than triggering a download, so the callers keep their own
 * filenames and the whole thing stays testable without a DOM.
 */
export function csvDocument(
  header: string[],
  rows: (string | number | null | undefined)[][],
): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}
