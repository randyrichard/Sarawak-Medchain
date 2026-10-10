import { Prisma } from '@prisma/client'
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
 *
 * `columns` is the register's declared shape. Passing it does two things a row-derived
 * header cannot:
 *
 * An empty register still gets a header. Without it, a workspace that has never logged a
 * visitor exported `visitors.csv` as three bytes of BOM and nothing else — a file that opens
 * blank, where the customer cannot tell "we never used this" from "the export is broken".
 * Twenty-two of thirty-nine registers came out that way for a small tenant.
 *
 * And the column order stops depending on data. Derived from the first row, the order came
 * from whatever Prisma happened to return; declared, it is the schema's order every time, so
 * two exports of the same workspace diff cleanly.
 */
export function toCsv(rows: Record<string, unknown>[], columns: string[] = []): string {
  const seen = new Set<string>()
  const cols: string[] = []
  const add = (key: string) => {
    if (!seen.has(key)) {
      seen.add(key)
      cols.push(key)
    }
  }

  for (const c of columns) add(c)
  /*
   * Then anything the rows carry that the declaration did not. Belt and braces: a column
   * missing from the header does not just lose itself, it shifts every value after it one
   * place left, and that is the kind of corruption nobody notices until they rely on it.
   */
  for (const row of rows) for (const key of Object.keys(row)) add(key)

  // Nothing declared and nothing to infer from — a genuinely shapeless table.
  if (cols.length === 0) return '﻿'

  const lines = [cols.map(cell).join(',')]
  for (const row of rows) {
    lines.push(cols.map((c) => cell(row[c])).join(','))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

// ─── Register shapes ─────────────────────────────────────────────────────────

/**
 * The column names of a Prisma model, in schema order.
 *
 * Read from the generated datamodel rather than written out by hand. Thirty-nine registers
 * with hand-maintained column lists would be thirty-nine lists to forget when a field is
 * added, and the failure is silent: the export keeps working and quietly stops carrying the
 * new column.
 *
 * Scalars and enums only. Relation fields are navigation, not data — `findMany` without a
 * `select` does not return them, so including them would produce a header with columns that
 * are always empty.
 */
const columnCache = new Map<string, string[]>()

export function columnsOf(model: string): string[] {
  const hit = columnCache.get(model)
  if (hit) return hit

  const found = Prisma.dmmf.datamodel.models.find((m) => m.name === model)
  const cols = found
    ? found.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name)
    : []

  columnCache.set(model, cols)
  return cols
}

/** The manifest is assembled here rather than read from a table, so it declares its own. */
export const MANIFEST_COLUMNS = [
  'archivePath', 'storedName', 'originalName', 'belongsTo', 'present',
] as const

// ─── Shape ───────────────────────────────────────────────────────────────────

export interface ExportTable {
  /** Becomes `<name>.csv` in the archive. */
  name: string
  rows: Record<string, unknown>[]
  /** The register's declared shape, so an unused one still exports a header. */
  columns: string[]
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
  const viaMeeting = { meeting: { companyId } }
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
    toolboxMeetings, toolboxGroups,
    reportRuns, adminAudit, fieldEvidence,
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

    db.toolboxMeeting.findMany({ where: own }),
    db.toolboxAttendanceGroup.findMany({ where: viaMeeting }),

    db.reportRun.findMany({ where: own }),
    db.adminAuditEntry.findMany({ where: own }),
    db.fieldEvidence.findMany({ where: own }),
  ])

  /*
   * Filename, Prisma model, rows. The model is what gives an unused register its header —
   * see `columnsOf`. Keeping it beside the rows means the two cannot drift apart, which they
   * would immediately if the column lists lived in a separate map.
   */
  const table = (name: string, model: string, rows: unknown[]): ExportTable =>
    ({ name, rows: rows as Record<string, unknown>[], columns: columnsOf(model) })

  const tables: ExportTable[] = [
    table('sites', 'Site', sites),

    table('incidents', 'Incident', incidents),
    table('incident-timeline', 'IncidentEvent', incidentEvents),
    table('incident-comments', 'IncidentComment', incidentComments),
    table('incident-attachments', 'IncidentAttachment', incidentAttachments),
    table('incident-equipment', 'IncidentEquipment', incidentEquipment),
    table('incident-people', 'IncidentPerson', incidentPeople),
    table('incident-links', 'IncidentLink', incidentLinks),
    table('corrective-actions', 'CorrectiveAction', actions),

    table('permits', 'Permit', permits),
    table('permit-controls', 'PermitControl', permitControls),
    table('permit-isolations', 'IsolationPoint', permitIsolations),
    table('permit-gas-tests', 'GasTest', permitGasTests),
    table('permit-signatures', 'PermitSignature', permitSignatures),
    table('permit-timeline', 'PermitEvent', permitEvents),
    table('permit-attendees', 'PermitAttendee', permitAttendees),
    table('permit-jsa-steps', 'PermitJsaStep', permitJsaSteps),
    table('permit-equipment', 'PermitEquipment', permitEquipment),
    table('permit-extensions', 'PermitExtension', permitExtensions),
    table('permit-attachments', 'PermitAttachment', permitAttachments),

    table('assets', 'Asset', assets),
    table('asset-documents', 'AssetDocument', assetDocuments),
    table('calibrations', 'Calibration', calibrations),
    table('inspections', 'Inspection', inspections),
    table('field-evidence', 'FieldEvidence', fieldEvidence),

    table('audits', 'Audit', audits),
    table('compliance-obligations', 'ComplianceObligation', obligations),
    table('compliance-documents', 'ComplianceDocument', complianceDocuments),

    table('employees', 'Employee', employees),
    table('ppe-issues', 'PpeIssue', ppeIssues),
    table('training-courses', 'TrainingCourse', courses),
    table('training-sessions', 'TrainingSession', sessions),
    table('certificates', 'Certificate', certificates),

    table('contractor-companies', 'ContractorCompany', contractorCompanies),
    table('contractor-workers', 'ContractorWorker', contractorWorkers),

    table('visitors', 'Visitor', visitors),
    table('visitor-documents', 'VisitorDocument', visitorDocuments),
    table('visitor-blacklist', 'VisitorBlacklist', visitorBlacklist),

    table('toolbox-meetings', 'ToolboxMeeting', toolboxMeetings),
    table('toolbox-attendance', 'ToolboxAttendanceGroup', toolboxGroups),

    table('report-runs', 'ReportRun', reportRuns),
    table('admin-audit-trail', 'AdminAuditEntry', adminAudit),
  ]

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
  pushFiles(fieldEvidence, 'field-evidence')
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

  return `SafeChain data export
${'='.repeat(60)}

Organisation : ${snapshot.companyName}
Workspace id : ${snapshot.companyId}
Taken        : ${stamp}
Contents     : ${snapshot.tables.length} tables, ${totalRows} rows, ${snapshot.files.length} files

This is a complete copy of your organisation's data. It is yours. You do not
need SafeChain, an account, or a licence to read any of it.


WHAT IS IN HERE
${'-'.repeat(60)}

tables/     One CSV per register. Open them in Excel, LibreOffice, Numbers, or
            load them into any database. They are UTF-8 with a byte-order mark,
            comma separated, with CRLF line endings.

            A register you never used is still here, as a file containing only
            its column headings. That is not an error - it is how this export
            says "nothing was recorded here", as distinct from a file that is
            missing because something went wrong. The row counts below tell you
            which is which.

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

  inspections.id          <- field-evidence.inspectionId
  audits.id               <- field-evidence.auditId   (auditItemId: the checklist item)
  corrective-actions.id   <- field-evidence.actionId  (actions with no incident)

  Each field-evidence row has exactly one of the three. The files are in
  field-evidence/; the checksum column is the SHA-256 recorded on upload.

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
