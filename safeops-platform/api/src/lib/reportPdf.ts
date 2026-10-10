import PDFDocument from 'pdfkit'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from './../env.js'
import type { ReportColumn, ReportData } from './reportService.js'

/**
 * Server-side PDF rendering for scheduled reports.
 *
 * The existing audit "report" builds HTML and calls window.print(), which needs a browser
 * and a person - architecturally impossible for a job that runs at 08:00 on a Monday while
 * everyone is asleep. So this is a second renderer by necessity, not by preference, and it
 * is confined to scheduled reports; the audit print-out is untouched.
 *
 * Written with pdfkit rather than headless Chrome: a report generator that needs a browser
 * binary is a deployment problem for every customer, and this is a table on a page.
 */

/** Where generated PDFs live. Same directory as every other stored file. */
const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)

/**
 * Read back the PDF a run already generated.
 *
 * Retrying a delivery must attach the bytes that were stored at generation time, never a
 * fresh render: the numbers in a safety report change by the hour, and an email whose
 * attachment disagrees with the run it claims to be is worse than no email.
 */
export function readStoredReport(storedName: string): Buffer | null {
  const path = join(UPLOAD_DIR, storedName)
  if (!existsSync(path)) return null
  return readFileSync(path)
}

const BRAND = 'SafeChain'
const BRAND_SUB = 'Safety Intelligence Platform'

const INK = '#111827'
const MUTED = '#6b7280'
const RULE = '#d1d5db'
const ACCENT = '#0f766e'
const CRITICAL = '#b91c1c'

const PAGE = { size: 'A4' as const, margin: 36 }
const CONTENT_WIDTH = 595.28 - PAGE.margin * 2

export interface RenderedReport {
  bytes: Buffer
  fileName: string
}

/**
 * Keeps a rendered report on the upload volume, for a report run's history.
 *
 * Separate from rendering on purpose. Rendering used to write every PDF to disk, so each
 * click of an on-screen "Download PDF" - an incident summary with injuries and names in it,
 * a management report - left a copy on the server that nothing referenced, nothing listed
 * and nothing ever deleted. Only a report run keeps its file, because the History tab and
 * the email retry both read it back; a download is streamed and forgotten.
 */
export function storeReportPdf(bytes: Buffer): string {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
  // A UUID on disk, the readable name only for display - the same contract as every other
  // stored file in the platform.
  const storedName = `${randomUUID()}.pdf`
  writeFileSync(join(UPLOAD_DIR, storedName), bytes)
  return storedName
}

/**
 * Everything written into the PDF, in an encoding the built-in fonts actually have.
 *
 * pdfkit's standard Helvetica is WinAnsi. A typographic ellipsis or a middle dot - both of
 * which the rest of this codebase uses freely - render as a replacement box, so a report
 * sent to a managing director arrives peppered with tofu. Substituted rather than banned
 * upstream, because the data comes from user-entered incident titles.
 */
function ascii(text: string): string {
  return text
    .replace(/…/g, '...')
    .replace(/[·•]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\r\n?/g, '\n')
    // Anything else outside WinAnsi becomes a question mark rather than a box, so a
    // Chinese or Malay name is visibly transliterated instead of silently corrupted.
    // Newlines are kept: they are how a multi-line field is laid out, and replacing them
    // printed "Team: not recorded.?Direct cause: ..." on a document sent to a client.
    .replace(/[^\n -ÿ]/g, '?')
}

/**
 * Renders the report to bytes. Writes nothing - see `storeReportPdf` for the one caller
 * that needs to keep the file.
 */
export async function renderReportPdf(data: ReportData): Promise<RenderedReport> {
  const doc = new PDFDocument({ size: PAGE.size, margin: PAGE.margin, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))

  const finished = new Promise<Buffer>((resolveBuf, reject) => {
    doc.on('end', () => resolveBuf(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  /*
   * In the workspace's own timezone. These were printed in UTC, so a report generated at
   * 9am in Kuching said "01:00 UTC" - correct, and not what anybody reading it thinks in.
   */
  const tz = data.timezone ?? 'UTC'
  const fmtDateTime = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    }).format(d)
    return tz === 'UTC' ? `${parts} UTC` : parts
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.fillColor(ACCENT).fontSize(17).font('Helvetica-Bold').text(BRAND, PAGE.margin, PAGE.margin)
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
    .text(BRAND_SUB.toUpperCase(), PAGE.margin, PAGE.margin + 20, { characterSpacing: 1.2 })

  doc.fillColor(INK).fontSize(15).font('Helvetica-Bold')
    .text(ascii(data.title), PAGE.margin, PAGE.margin + 42)

  doc.fillColor(MUTED).fontSize(9).font('Helvetica')
  /*
   * Company, then project, then site - the hierarchy the reader navigated to get here, in
   * the order they chose it. Each part appears only when it narrows something, so a
   * company-wide report still reads as one line rather than as a trail of dashes.
   */
  const scope = [data.companyName, data.projectName, data.siteName].filter(Boolean).join(' \u00b7 ')
  doc.text(ascii(scope), PAGE.margin, PAGE.margin + 62)
  /*
   * A report covering a period has to say so on its face.
   *
   * This line only ever read "As at <end>", which is right for the two types answering
   * "what is owed right now" and wrong for one covering a closed month. Printed, filed and
   * read a year later, "As at 1 Oct" gives no clue the pages behind it are September's.
   * The wording comes from the service because only that side knows which timezone the
   * period was cut on.
   */
  doc.text(
    ascii(data.periodLabel
      ? `${data.periodLabel}   Generated ${fmtDateTime(data.generatedAt)}`
      : `As at ${fmtDateTime(data.periodEnd)}   Generated ${fmtDateTime(data.generatedAt)}`),
    PAGE.margin, PAGE.margin + 75,
  )

  doc.moveTo(PAGE.margin, PAGE.margin + 92)
    .lineTo(PAGE.margin + CONTENT_WIDTH, PAGE.margin + 92)
    .strokeColor(RULE).lineWidth(1).stroke()

  // ── Summary ─────────────────────────────────────────────────────────────────
  let y = PAGE.margin + 106
  const boxW = CONTENT_WIDTH / data.summary.length
  data.summary.forEach((s, i) => {
    const x = PAGE.margin + i * boxW
    doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
      .text(ascii(s.label.toUpperCase()), x, y, { width: boxW - 8, characterSpacing: 0.6 })
    // The headline number goes red only where a non-zero value is a problem.
    /*
     * Red only where a non-zero value is a problem, which is not every count on a page.
     * "Lost time" earns it. "Near misses" explicitly does not - a month with near misses
     * in it is a month where people reported them, and colouring that like a failure
     * teaches the wrong lesson to the person whose report it is.
     */
    const alarming = /overdue|no investigator|awaiting|lost time/i.test(s.label)
      && s.value !== '0' && s.value !== '—'
    doc.fillColor(alarming ? CRITICAL : INK).fontSize(18).font('Helvetica-Bold')
      .text(ascii(s.value), x, y + 11, { width: boxW - 8 })
  })
  y += 44

  const bottom = 841.89 - PAGE.margin - 26

  /** A new page, resetting the cursor - used wherever a block will not fit below. */
  const newPage = () => { doc.addPage(); y = PAGE.margin }

  /**
   * One table, drawn wherever the cursor is.
   *
   * Extracted so the sections below are not a second table implementation that drifts from
   * this one on page breaks, column scaling or the red-value rule. The main table was the
   * only caller when it was written inline; there are now a dozen.
   */
  const drawTable = (columns: ReportColumn[], rows: Record<string, string>[]) => {
    const scale = CONTENT_WIDTH / columns.reduce((a, c) => a + c.width, 0)
    const widths = columns.map((c) => c.width * scale)
    const PAD = 5
    /*
     * Cells wrap rather than being cut. Truncating to one line printed "No department
     * rec...", "Kuching Assemb..." and even header labels like "DEPARTME..." - and a cut
     * measured a hair too wide wrapped anyway and ran into the row below. A long value is
     * capped at three lines, so one essay-length title cannot take a page.
     */
    const MAX_LINES = 3
    const cell = (text: string, w: number) => {
      const clean = ascii(text)
      const lineH = doc.currentLineHeight(true)
      if (doc.heightOfString(clean, { width: w }) <= lineH * MAX_LINES + 0.5) return clean
      let out = clean
      while (out.length > 1 && doc.heightOfString(`${out}...`, { width: w }) > lineH * MAX_LINES + 0.5) {
        out = out.slice(0, -1)
      }
      return `${out.trimEnd()}...`
    }
    const heightOf = (texts: string[]) =>
      Math.max(...texts.map((t, i) => doc.heightOfString(t, { width: widths[i] - 8 }))) + PAD * 2

    const header = () => {
      doc.fontSize(7.5).font('Helvetica-Bold')
      const labels = columns.map((c, i) => cell(c.label.toUpperCase(), widths[i] - 8))
      const h = Math.max(16, heightOf(labels))
      doc.fillColor(ACCENT).rect(PAGE.margin, y, CONTENT_WIDTH, h).fill()
      doc.fillColor('#ffffff')
      let x = PAGE.margin + 4
      labels.forEach((label, i) => {
        doc.text(label, x, y + PAD, { width: widths[i] - 8 })
        x += widths[i]
      })
      y += h
      doc.font('Helvetica').fontSize(7.5)
    }

    header()

    rows.forEach((row, n) => {
      const texts = columns.map((c, i) => cell(row[c.key] ?? '', widths[i] - 8))
      const h = Math.max(16, heightOf(texts))
      // Page breaks repeat the header, so page four is still readable on its own.
      if (y + h > bottom) {
        newPage()
        header()
      }
      if (n % 2 === 1) {
        doc.fillColor('#f9fafb').rect(PAGE.margin, y, CONTENT_WIDTH, h).fill()
      }
      let x = PAGE.margin + 4
      columns.forEach((c, i) => {
        const value = row[c.key] ?? ''
        // Days-overdue and severity read red so the eye finds them without reading.
        const hot = (c.key === 'overdue' && Number(value) > 0)
          || (c.key === 'days' && Number(value) > 30)
          || /fatal|catastroph|critical|lost time/i.test(value)
        doc.fillColor(hot ? CRITICAL : INK).text(texts[i], x, y + PAD, { width: widths[i] - 8 })
        x += widths[i]
      })
      doc.moveTo(PAGE.margin, y + h).lineTo(PAGE.margin + CONTENT_WIDTH, y + h)
        .strokeColor('#e5e7eb').lineWidth(0.5).stroke()
      y += h
    })
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  if (data.rows.length === 0) {
    doc.fillColor(MUTED).fontSize(10).font('Helvetica-Oblique')
      .text(ascii(data.emptyMessage), PAGE.margin, y + 20, { width: CONTENT_WIDTH, align: 'center' })
    y += 44
  } else {
    drawTable(data.columns, data.rows)
  }

  // ── Sections ────────────────────────────────────────────────────────────────
  //
  // Only a multi-section report has these; the two list reports end above.
  for (const section of data.sections ?? []) {
    /*
     * A heading stranded at the foot of a page with its content overleaf is the classic
     * way a generated report stops looking like a document. The space kept is what the
     * section's first block needs - all of a short section, the start of a long table - not
     * a fixed guess, which left "6. Corrective action summary" alone at the bottom of a page
     * and a report's sign-off lines alone on the last one.
     */
    doc.fontSize(8.5).font('Helvetica')
    const noteH = section.note ? doc.heightOfString(ascii(section.note), { width: CONTENT_WIDTH }) + 6 : 0
    const unavailableH = section.unavailable ? doc.heightOfString(ascii(section.unavailable), { width: CONTENT_WIDTH - 12 }) + 8 : 0
    const statsH = section.stats && section.stats.length > 0 ? 32 : 0
    const tableH = section.columns && section.rows && section.rows.length > 0 ? 16 + Math.min(section.rows.length, 3) * 16 : 0
    const writeInH = section.writeIn ? section.writeIn * 16 + 4 : 0
    const needed = 16 + 23 + noteH + unavailableH + statsH + tableH + writeInH
    if (y + needed > bottom) newPage()
    else y += 16

    doc.fillColor(INK).fontSize(10.5).font('Helvetica-Bold')
      .text(ascii(section.title), PAGE.margin, y, { width: CONTENT_WIDTH })
    y += 15
    doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y)
      .strokeColor(RULE).lineWidth(0.5).stroke()
    y += 8

    if (section.note) {
      doc.fillColor(INK).fontSize(8.5).font('Helvetica')
      const text = ascii(section.note)
      const h = doc.heightOfString(text, { width: CONTENT_WIDTH })
      if (y + h > bottom) newPage()
      doc.text(text, PAGE.margin, y, { width: CONTENT_WIDTH })
      y += h + 6
    }

    if (section.unavailable) {
      /*
       * Set apart from ordinary prose, because it is a different kind of statement: not
       * what the month was, but what this product does not know. Reading it as a figure is
       * exactly the mistake it exists to prevent.
       */
      doc.fillColor(MUTED).fontSize(8.5).font('Helvetica-Oblique')
      const text = ascii(section.unavailable)
      const h = doc.heightOfString(text, { width: CONTENT_WIDTH - 12 })
      if (y + h + 10 > bottom) newPage()
      doc.rect(PAGE.margin, y - 2, 2.5, h + 6).fillColor(RULE).fill()
      doc.fillColor(MUTED).text(text, PAGE.margin + 10, y, { width: CONTENT_WIDTH - 12 })
      y += h + 8
    }

    if (section.stats && section.stats.length > 0) {
      if (y + 34 > bottom) newPage()
      const w = CONTENT_WIDTH / section.stats.length
      section.stats.forEach((stat, i) => {
        const x = PAGE.margin + i * w
        doc.fillColor(MUTED).fontSize(7).font('Helvetica')
          .text(ascii(stat.label.toUpperCase()), x, y, { width: w - 8, characterSpacing: 0.5 })
        // Same rule as the header tiles: red only where a non-zero value is a problem.
        const alarming = /overdue|lost time/i.test(stat.label)
          && stat.value !== '0' && stat.value !== 'N/A'
        doc.fillColor(alarming ? CRITICAL : INK).fontSize(13).font('Helvetica-Bold')
          .text(ascii(stat.value), x, y + 9, { width: w - 8 })
      })
      y += 32
    }

    if (section.columns && section.rows && section.rows.length > 0) {
      if (y + 40 > bottom) newPage()
      drawTable(section.columns, section.rows)
      y += 4
    }

    if (section.writeIn) {
      // Ruled lines rather than a blank gap: a printed management report is written on,
      // and an unruled space invites a paragraph squeezed into the margin.
      const lineGap = 16
      if (y + section.writeIn * lineGap > bottom) newPage()
      for (let i = 0; i < section.writeIn; i++) {
        y += lineGap
        doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y)
          .strokeColor('#e5e7eb').lineWidth(0.5).stroke()
      }
      y += 6
    }
  }

  // ── Footer on every page ────────────────────────────────────────────────────
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const fy = 841.89 - PAGE.margin - 14
    doc.moveTo(PAGE.margin, fy - 6).lineTo(PAGE.margin + CONTENT_WIDTH, fy - 6)
      .strokeColor(RULE).lineWidth(0.5).stroke()
    doc.fillColor(MUTED).fontSize(7).font('Helvetica')
      .text(ascii(data.footer ?? `Generated automatically by ${BRAND} - ${data.companyName} - not for external distribution`),
        PAGE.margin, fy, { width: CONTENT_WIDTH * 0.75, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`,
        PAGE.margin + CONTENT_WIDTH * 0.75, fy,
        { width: CONTENT_WIDTH * 0.25, align: 'right', lineBreak: false })
  }

  doc.end()
  const bytes = await finished

  const stamp = data.generatedAt.toISOString().slice(0, 10)
  const fileName = `${data.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp}.pdf`
  return { bytes, fileName }
}
