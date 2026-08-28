import type { PrismaClient } from '@prisma/client'

/**
 * Everything one customer owns, in a form they can read without us.
 *
 * This exists to answer a question every prospect asks a one-person company: "what happens
 * to our records if you disappear?" A promise to help them migrate is not an answer, because
 * the promise stops working in exactly the scenario being asked about. A button they press
 * themselves is.
 *
 * Two rules govern everything below.
 *
 * **Tenant scoping is absolute.** Every query is filtered to one companyId, and child tables
 * that have no companyId of their own are filtered through their parent's relation rather
 * than by id list — a `where: { in: [...ids] }` built from a previous query is only as
 * correct as that query was, and this is the one place where a scoping mistake hands one
 * customer another customer's medical records.
 *
 * **Completeness is the point.** The in-app restore point captures parent rows only; the
 * restore drill in docs/BACKUP.md measured it dropping 20 of 38 permit controls and 11 of 32
 * incident timeline entries. A permit exported without the controls that were signed off, or
 * without its signatures, is not a permit — it would be worthless in a DOSH investigation.
 * So the children are here, and so are the uploaded files, which live on a volume and are in
 * no database dump at all.
 */

// ─── CSV ─────────────────────────────────────────────────────────────────────

/**
 * Cells Excel could execute.
 *
 * A description field is free text typed by whoever reported the incident — which in this
 * product includes every employee. `=cmd|'/c calc'!A1` in that field becomes a live formula
 * the moment an administrator opens the export, so the export would turn the lowest-privilege
 * user in the system into code running on the highest-privilege user's machine.
 *
 * Prefixing with an apostrophe is the standard mitigation: Excel and LibreOffice both treat
 * the rest as literal text and do not display the apostrophe itself.
 */
const RISKY_LEAD = /^[=+\-@\t\r]/

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''

  let text: string
  if (value instanceof Date) text = value.toISOString()
  else if (Array.isArray(value)) text = value.map((v) => (v === null ? '' : String(v))).join('; ')
  else if (typeof value === 'object') text = JSON.stringify(value)
  else text = String(value)

  if (RISKY_LEAD.test(text)) text = `'${text}`

  // Quote when the value contains a delimiter, a quote, a newline, or edge whitespace that
  // a reader would otherwise silently trim.
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * Rows to CSV, with a UTF-8 BOM.
 *
 * The BOM is not decoration. Without it Excel on Windows reads the file as the system code
 * page, and every Malay or Chinese name in the workforce register comes back mojibake — on
 * the one artefact whose entire purpose is being readable somewhere else.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '﻿'

  // Union rather than the first row's keys: a nullable JSON column can be absent from one
  // row and present in the next, and a header short by a column silently shifts the data.
  const columns: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }

  const lines = [columns.map(cell).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => cell(row[c])).join(','))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

// ─── Shape ───────────────────────────────────────────────────────────────────

export interface ExportTable {
  /** Becomes `<name>.csv` in the archive. */
  name: string
  rows: Record<string, unknown>[]
}

export interface ExportFile {
  /** The name on disk in UPLOAD_DIR — a server-generated id, never a client filename. */
  storedName: string
  /** What the operator's device called it. Used for the name inside the archive. */
  originalName: string
  /** Subfolder in the archive, so a photo can be traced back to what it is evidence for. */
  folder: string
}

export interface TenantExport {
  companyId: string
  companyName: string
  takenAt: Date
  tables: ExportTable[]
  files: ExportFile[]
}

// ─── Collection ──────────────────────────────────────────────────────────────

/**
 * Reads one tenant's data.
 *
 * Everything runs inside a single `$transaction`, so the archive is a point in time rather
 * than a smear across one. Without it a permit written while the export ran could arrive
 * with no controls attached, which is the precise failure this export exists to avoid.
 */
export async function collectTenantExport(
  db: PrismaClient,
  companyId: string,
): Promise<TenantExport> {
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { id: true, name: true },
  })

  /** Child tables reach their tenant through the parent they hang off. */
  const viaIncident = { incident: { companyId } }
  const viaPermit = { permit: { companyId } }
  const viaAsset = { asset: { companyId } }
  const viaVisitor = { visitor: { companyId } }
  const own = { companyId }

  const [
    sites, incidents, incidentEvents, incidentComments, incidentAttachments,
    incidentEquipment, incidentPeople, incidentLinks, actions,
    permits, permitControls, permitIsolations, permitGasTests, permitSignatures,
    permitEvents, permitAttendees, permitJsaSteps, permitEquipment, permitExtensions,
    permitAttachments,
    assets, assetDocuments, calibrations, inspections,
    audits, obligations, complianceDocuments,
    employees, ppeIssues, courses, sessions, certificates,
    contractorCompanies, contractorWorkers,
    visitors, visitorDocuments, visitorBlacklist,
    reportRuns, adminAudit,
  ] = await db.$transaction([
    db.site.findMany({ where: own }),
    db.incident.findMany({ where: own }),
    db.incidentEvent.findMany({ where: viaIncident }),
    db.incidentComment.findMany({ where: viaIncident }),
    db.incidentAttachment.findMany({ where: viaIncident }),
    db.incidentEquipment.findMany({ where: viaIncident }),
    db.incidentPerson.findMany({ where: viaIncident }),
    db.incidentLink.findMany({ where: viaIncident }),
    db.correctiveAction.findMany({ where: own }),

    db.permit.findMany({ where: own }),
    db.permitControl.findMany({ where: viaPermit }),
    db.isolationPoint.findMany({ where: viaPermit }),
    db.gasTest.findMany({ where: viaPermit }),
    db.permitSignature.findMany({ where: viaPermit }),
    db.permitEvent.findMany({ where: viaPermit }),
    db.permitAttendee.findMany({ where: viaPermit }),
    db.permitJsaStep.findMany({ where: viaPermit }),
    db.permitEquipment.findMany({ where: viaPermit }),
    db.permitExtension.findMany({ where: viaPermit }),
    db.permitAttachment.findMany({ where: viaPermit }),

    db.asset.findMany({ where: own }),
    db.assetDocument.findMany({ where: viaAsset }),
    db.calibration.findMany({ where: viaAsset }),
    db.inspection.findMany({ where: own }),

    db.audit.findMany({ where: own }),
    db.complianceObligation.findMany({ where: own }),
    db.complianceDocument.findMany({ where: own }),

    db.employee.findMany({ where: own }),
    db.ppeIssue.findMany({ where: own }),
    db.trainingCourse.findMany({ where: own }),
    db.trainingSession.findMany({ where: own }),
    db.certificate.findMany({ where: own }),

    db.contractorCompany.findMany({ where: own }),
    db.contractorWorker.findMany({ where: own }),

    db.visitor.findMany({ where: own }),
    db.visitorDocument.findMany({ where: viaVisitor }),
    db.visitorBlacklist.findMany({ where: own }),

    db.reportRun.findMany({ where: own }),
    db.adminAuditEntry.findMany({ where: own }),
  ])

  const tables: ExportTable[] = [
    { name: 'sites', rows: sites },

    { name: 'incidents', rows: incidents },
    { name: 'incident-timeline', rows: incidentEvents },
    { name: 'incident-comments', rows: incidentComments },
    { name: 'incident-attachments', rows: incidentAttachments },
    { name: 'incident-equipment', rows: incidentEquipment },
    { name: 'incident-people', rows: incidentPeople },
    { name: 'incident-links', rows: incidentLinks },
    { name: 'corrective-actions', rows: actions },

    { name: 'permits', rows: permits },
    { name: 'permit-controls', rows: permitControls },
    { name: 'permit-isolations', rows: permitIsolations },
    { name: 'permit-gas-tests', rows: permitGasTests },
    { name: 'permit-signatures', rows: permitSignatures },
    { name: 'permit-timeline', rows: permitEvents },
    { name: 'permit-attendees', rows: permitAttendees },
    { name: 'permit-jsa-steps', rows: permitJsaSteps },
    { name: 'permit-equipment', rows: permitEquipment },
    { name: 'permit-extensions', rows: permitExtensions },
    { name: 'permit-attachments', rows: permitAttachments },

    { name: 'assets', rows: assets },
    { name: 'asset-documents', rows: assetDocuments },
    { name: 'calibrations', rows: calibrations },
    { name: 'inspections', rows: inspections },

    { name: 'audits', rows: audits },
    { name: 'compliance-obligations', rows: obligations },
    { name: 'compliance-documents', rows: complianceDocuments },

    { name: 'employees', rows: employees },
    { name: 'ppe-issues', rows: ppeIssues },
    { name: 'training-courses', rows: courses },
    { name: 'training-sessions', rows: sessions },
    { name: 'certificates', rows: certificates },

    { name: 'contractor-companies', rows: contractorCompanies },
    { name: 'contractor-workers', rows: contractorWorkers },

    { name: 'visitors', rows: visitors },
    { name: 'visitor-documents', rows: visitorDocuments },
    { name: 'visitor-blacklist', rows: visitorBlacklist },

    { name: 'report-runs', rows: reportRuns },
    { name: 'admin-audit-trail', rows: adminAudit },
  ] as ExportTable[]

  /*
   * The uploaded evidence.
   *
   * These rows carry a storedName; the bytes are on a volume. A database dump contains the
   * rows and none of the files, so an export that shipped only the tables would list
   * photographs that do not exist — a record claiming evidence it cannot produce is worse
   * than one that never claimed it.
   */
  const files: ExportFile[] = []
  const pushFiles = (
    rows: { storedName: string | null; originalName?: string | null; name?: string | null }[],
    folder: string,
  ) => {
    for (const r of rows) {
      if (!r.storedName) continue
      files.push({
        storedName: r.storedName,
        originalName: r.originalName || r.name || r.storedName,
        folder,
      })
    }
  }

  pushFiles(incidentAttachments, 'incident-evidence')
  pushFiles(permitAttachments, 'permit-documents')
  pushFiles(assetDocuments, 'asset-documents')
  pushFiles(visitorDocuments, 'visitor-documents')
  pushFiles(calibrations, 'calibration-certificates')
  pushFiles(reportRuns, 'generated-reports')

  return { companyId: company.id, companyName: company.name, takenAt: new Date(), tables, files }
}

// ─── Archive entry names ─────────────────────────────────────────────────────

/**
 * A filename safe to write inside an archive.
 *
 * `originalName` is whatever the uploading device called the file. Everywhere else in this
 * codebase it is display-only and never touches a path — the upload routes say so explicitly
 * — and here it becomes an entry name, so it has to be sanitised at the point of use. A name
 * of `../../../etc/passwd` inside a zip is an attack on whoever extracts it, not on us.
 *
 * The extension comes from `storedName`, not from the client. The upload routes validate the
 * type and write a server-chosen name like `<uuid>.png`, so a file uploaded as `evil.png.php`
 * is stored as `.png` and can never be served as anything else. Carrying the client extension
 * into the archive would hand that double extension back — inert while it sits in a downloads
 * folder, live the moment somebody extracts the archive somewhere that serves PHP. There is
 * one such file in the development database already, which is how this was noticed.
 */
export function safeEntryName(originalName: string, storedName: string): string {
  const scrub = (s: string) => s
    .replace(/[/\\]/g, '_')             // no directory traversal, no accidental nesting
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')    // control chars, including a NUL truncation
    .replace(/\.{2,}/g, '.')            // no ".." anywhere, not merely at the front
    .replace(/^\.+/, '')                // no leading dot: no hidden files
    .trim()

  /*
   * The extension keeps its own dot, and only the characters after it are scrubbed. Running
   * the whole thing through `scrub` stripped the leading dot and produced "reportpdf" — the
   * tests caught it, which is the entire reason this is a separate function rather than four
   * lines inside the route.
   */
  const dot = storedName.lastIndexOf('.')
  const extension = dot > 0 ? `.${scrub(storedName.slice(dot + 1))}` : ''
  const alreadyRight = (s: string) => !!extension && s.toLowerCase().endsWith(extension.toLowerCase())

  let name = scrub(originalName)
    || scrub(dot > 0 ? storedName.slice(0, dot) : storedName)
    || 'file'

  /*
   * Shed trailing extensions the server did not vouch for. `evil.png.php` stored as a png
   * becomes `evil.png`; `report.2026.pdf` stored as a pdf already ends correctly and is left
   * alone, so ordinary dotted filenames survive intact.
   */
  while (extension && !alreadyRight(name)) {
    const d = name.lastIndexOf('.')
    if (d <= 0) break
    name = name.slice(0, d)
  }

  if (name.length > 100) {
    name = alreadyRight(name) ? `${name.slice(0, 100 - extension.length)}${extension}` : name.slice(0, 100)
  }
  return alreadyRight(name) ? name : `${name}${extension}`
}

/**
 * Makes an entry name unique within the archive.
 *
 * Two incidents can each have a photograph the phone called `IMG_0421.jpg`. A zip may contain
 * duplicate names, but extracting one silently overwrites the other, so evidence would go
 * missing between download and disk. The suffix goes before the extension so the file still
 * opens by double-click.
 */
export function uniqueEntryName(entry: string, taken: Set<string>): string {
  if (!taken.has(entry)) {
    taken.add(entry)
    return entry
  }
  const slash = entry.lastIndexOf('/')
  const dot = entry.lastIndexOf('.')
  const [stem, ext] = dot > slash + 1 ? [entry.slice(0, dot), entry.slice(dot)] : [entry, '']

  let n = 2
  while (taken.has(`${stem} (${n})${ext}`)) n += 1
  const unique = `${stem} (${n})${ext}`
  taken.add(unique)
  return unique
}

// ─── Readme ──────────────────────────────────────────────────────────────────

/**
 * A plain-text guide inside the archive.
 *
 * Whoever opens this may be doing it years from now, possibly because we no longer exist, and
 * quite possibly because a regulator asked for records. It has to explain itself with no
 * access to us and no access to the product.
 */
export function buildReadme(snapshot: TenantExport): string {
  const stamp = snapshot.takenAt.toISOString()
  const tableLines = snapshot.tables
    .map((t) => `  ${`${t.name}.csv`.padEnd(32)} ${String(t.rows.length).padStart(6)} rows`)
    .join('\n')

  const totalRows = snapshot.tables.reduce((n, t) => n + t.rows.length, 0)

  return `SafeOps data export
${'='.repeat(60)}

Organisation : ${snapshot.companyName}
Workspace id : ${snapshot.companyId}
Taken        : ${stamp}
Contents     : ${snapshot.tables.length} tables, ${totalRows} rows, ${snapshot.files.length} files

This is a complete copy of your organisation's data. It is yours. You do not
need SafeOps, an account, or a licence to read any of it.


WHAT IS IN HERE
${'-'.repeat(60)}

tables/     One CSV per register. Open them in Excel, LibreOffice, Numbers, or
            load them into any database. They are UTF-8 with a byte-order mark,
            comma separated, with CRLF line endings.

files/      Every document and photograph uploaded to the workspace, sorted
            into folders by what it belongs to. The matching row in the CSVs
            carries the same "storedName", which is how a file is traced back
            to the incident or permit it is evidence for.

readme.txt  This file.


THE TABLES
${'-'.repeat(60)}

${tableLines}


HOW THE RECORDS FIT TOGETHER
${'-'.repeat(60)}

Every table has an "id" column. Child tables point at their parent by id:

  incidents.id            <- incident-timeline.incidentId
                          <- incident-comments.incidentId
                          <- incident-attachments.incidentId
                          <- corrective-actions.incidentId

  permits.id              <- permit-controls.permitId
                          <- permit-signatures.permitId
                          <- permit-gas-tests.permitId
                          <- permit-isolations.permitId
                          <- permit-timeline.permitId

  assets.id               <- inspections.assetId
                          <- calibrations.assetId

  employees.id            <- certificates.employeeId

A permit is only complete when read together with its controls and its
signatures. Those are separate files here because they are separate records,
not because they are optional.


A NOTE ON PERSONAL DATA
${'-'.repeat(60)}

The employees table contains health information - fitness expiry dates and
medical restrictions. Under the Malaysian Personal Data Protection Act that is
sensitive personal data. This archive has no access control of its own once it
leaves the application, so store it accordingly.


WHAT IS DELIBERATELY NOT IN HERE
${'-'.repeat(60)}

  - Passwords. They are stored only as one-way hashes and are not exportable.
  - API keys and webhook signing secrets, for the same reason a password is not
    included: exporting a live credential into a file that gets emailed around
    is how a credential leaks.
  - Saved in-app restore points, which are snapshots of the same data above.
`
}
