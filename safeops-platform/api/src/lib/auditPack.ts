import type { Prisma, PrismaClient, Role } from '@prisma/client'
import { membershipOf, type Caller } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'
import { isValidTimezone } from '../domain/localTime.js'
import { GAS_TEST_REQUIRED } from './permitCatalog.js'
import type { ReportData, ReportSection } from './reportService.js'

/*
 * The evidence pack handed to a client's HSE auditor.
 *
 * A contractor audit is not a dashboard. Somebody sits at a table with a folder and asks:
 * show me the permits for March, show me the gas tests on that confined space, show me the
 * man who signed, show me his medical. Until now the answer was a person taking screenshots
 * of six screens, which is slow, incomplete, and impossible to check afterwards.
 *
 * What this is not, stated plainly because the distinction matters commercially.
 *
 * This is SafeChain's own evidence pack. It is NOT the PETRONAS Contractor HSE Guidelines
 * audit form, and it is NOT a DOSH/JKKP inspection form. Those are specific documents with
 * specific layouts, and this product does not hold them. A pack that captioned itself as a
 * JKKP form while merely resembling one would be worse than useless at an audit: the auditor
 * works from the real form, finds this does not match it, and now doubts the records too.
 * So the pack is titled as what it is, carries its own method on its face, and organises the
 * evidence in the order an auditor asks for it. Mapping these sections onto the official
 * forms needs those forms in hand, and is a separate piece of work.
 *
 * Everything here is read from records the field actually made. Nothing is estimated, and
 * where this deployment does not hold something, the section says so rather than leaving a
 * reader to assume a blank means zero.
 */

export class AuditPackError extends DomainError {}

/*
 * What a permit has to carry for this pack, declared once.
 *
 * Lifted out of the query so the section builders below can be typed against the rows they
 * actually receive (`PermitRow`). Written inline, their parameters could only have been
 * `any`, and a pack that silently prints `undefined` into a column an auditor is reading is
 * the one failure mode this file cannot have.
 */
const PERMIT_INCLUDE = {
  site: { select: { name: true } },
  controls: { select: { required: true, confirmed: true } },
  gasTests: { orderBy: { testedAt: 'asc' } },
  signatures: { orderBy: { signedAt: 'asc' } },
  isolations: true,
  jsaSteps: { orderBy: { sequence: 'asc' } },
  attachments: {
    select: {
      id: true, kind: true, originalName: true, mimeType: true, checksum: true, createdAt: true,
    },
  },
  attendees: {
    select: {
      nameAtAssignment: true, role: true, enteredAt: true, exitedAt: true,
      employee: { select: { id: true, name: true, employeeNo: true, medicalExpiry: true } },
      contractorWorker: {
        select: {
          id: true, name: true, medicalExpiry: true, inductionExpiry: true,
          contractorCompany: { select: { name: true } },
          certificates: { select: { name: true, expiryDate: true, issuedBy: true } },
        },
      },
    },
  },
} satisfies Prisma.PermitInclude

type PermitRow = Prisma.PermitGetPayload<{ include: typeof PERMIT_INCLUDE }>

const INCIDENT_SELECT = {
  id: true, number: true, title: true, type: true, severity: true, stage: true,
  occurredAt: true, location: true, closedAt: true,
  site: { select: { name: true } },
  attachments: { select: { id: true, originalName: true, mimeType: true, checksum: true } },
} satisfies Prisma.IncidentSelect

type IncidentRow = Prisma.IncidentGetPayload<{ select: typeof INCIDENT_SELECT }>

/**
 * Who may export one.
 *
 * The same list that may read any tenant-wide report, and for the same reason: this is the
 * whole safety picture for a site, including named people's medical expiry. A supervisor
 * runs a job; they do not send the company's compliance record to a client.
 */
const PACK_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'ceo']

/**
 * How close to expiry counts as "expiring" on this pack.
 *
 * 30 days, to match the window the scheduler already warns contractors on
 * (CONTRACTOR_EXPIRY_DAYS in scheduler.ts). A pack that used a different window from the
 * alerts would show a worker as fine on the day the system emailed about him.
 */
export const EXPIRING_WITHIN_DAYS = 30

/**
 * The most rows any one section will print.
 *
 * A year of permits on a busy site is tens of thousands of rows, and a PDF nobody can open
 * is not evidence. Each section says when it has been capped and what the full count was,
 * so a reader is never left thinking the cap is the total — and narrowing the date range is
 * the documented way to get the rest.
 */
export const MAX_ROWS = 400

/*
 * The printable width of an A4 page at this margin, in points.
 *
 * Every table below is budgeted to this. The renderer scales a column set to fit, which
 * sounds forgiving and is not: a set that overflows is shrunk proportionally, and at 7.5pt
 * a 9% shrink is the difference between "PTW-2026-0417" sitting on one line and breaking
 * after "PTW-2026-04". A permit number split across two lines is the first thing an auditor
 * sees and the easiest thing to mistrust. Keep each table's widths summing to about this.
 */
export const PAGE_WIDTH = 523

export interface AuditPackOptions {
  siteId?: string | null
  from: Date
  to: Date
}

/** The compliance score's workings, kept so the document can print them. */
export interface ScoreComponent {
  label: string
  /** What was achieved. */
  met: number
  /** What was required. A component with nothing required is not scored. */
  of: number
  /** Why this is in the score at all. */
  basis: string
}

export class AuditPackService {
  constructor(private db: PrismaClient) {}

  private require(caller: Caller, companyId: string) {
    const m = membershipOf(caller, companyId, AuditPackError)
    if (!PACK_ROLES.includes(m.role)) {
      throw new AuditPackError(
        'forbidden',
        'Your role does not permit exporting an audit pack.',
        403,
      )
    }
    return m
  }

  /**
   * Builds the pack.
   *
   * Returns ReportData, which the existing renderer turns into a PDF
   * (reportPdf.renderReportPdf). Deliberately not a second renderer: that engine already
   * handles page breaks, repeated table headers, the workspace's timezone and the
   * transliteration a WinAnsi PDF needs, and a parallel implementation would drift from it
   * on exactly those details.
   */
  async build(
    caller: Caller,
    companyId: string,
    opts: AuditPackOptions,
  ): Promise<ReportData> {
    this.require(caller, companyId)

    if (!(opts.from instanceof Date) || Number.isNaN(opts.from.getTime())
      || !(opts.to instanceof Date) || Number.isNaN(opts.to.getTime())) {
      throw new AuditPackError('validation', 'The audit period is not a valid date range.')
    }
    if (opts.from.getTime() > opts.to.getTime()) {
      throw new AuditPackError('validation', 'The audit period starts after it ends.')
    }

    const company = await this.db.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    })
    if (!company) throw new AuditPackError('not_found', 'Workspace not found.', 404)

    const site = opts.siteId
      ? await this.db.site.findFirst({
          where: { id: opts.siteId, companyId },
          select: { id: true, name: true },
        })
      : null
    if (opts.siteId && !site) {
      throw new AuditPackError('not_found', 'Unknown site for this workspace.', 404)
    }

    /*
     * The site's own zone, exactly as the scheduled reports cut their periods
     * (ReportService.periodTimezone). A pack cut in UTC would date a 07:00 gas test in
     * Kuching to the previous day, which on a document about when a space was last tested
     * is not a cosmetic difference.
     */
    const tz = await this.timezoneFor(companyId, site?.id ?? null)
    const fmt = dateTimeFormatter(tz)
    const fmtDay = dayFormatter(tz)
    const scope = { companyId, ...(site ? { siteId: site.id } : {}) }
    const window = { gte: opts.from, lte: opts.to }

    // ── The records the whole pack is built from ────────────────────────────
    //
    // Permits are the spine: every other section is either about them or read alongside
    // them. Fetched once, with the children each section needs, rather than per section.
    const permits = await this.db.permit.findMany({
      where: {
        ...scope,
        // Anything live during the window, not merely raised inside it. A permit opened on
        // the 28th and worked through month end belongs in both months' packs; filtering on
        // createdAt alone would drop it from the one where the work happened.
        validFrom: { lte: opts.to },
        validTo: { gte: opts.from },
      },
      orderBy: { validFrom: 'asc' },
      include: PERMIT_INCLUDE,
    })

    const permitIds = permits.map((p) => p.id)

    /*
     * Which of these records reached us from a phone that had no signal.
     *
     * This is the offline capture ledger (FieldRecord), and it is worth an auditor's
     * attention: it is the difference between "written down at the job" and "typed in
     * afterwards". The join is by permit, not by row — the ledger records which permit a
     * record landed on, not which gas test — so the pack reports offline capture per permit
     * and says so. Claiming a per-reading tag the data cannot support would be the kind of
     * precision an auditor is right to distrust.
     */
    const fieldRecords = permitIds.length > 0
      ? await this.db.fieldRecord.findMany({
          where: { companyId, subjectId: { in: permitIds } },
          select: { subjectId: true, operation: true, recordedAt: true, createdAt: true },
        })
      : []

    const offlineByPermit = new Map<string, { count: number; worstLagMs: number }>()
    for (const r of fieldRecords) {
      if (!r.subjectId) continue
      const current = offlineByPermit.get(r.subjectId) ?? { count: 0, worstLagMs: 0 }
      current.count += 1
      // Only a record that claimed a field time has a lag worth printing; one without is a
      // write made with a connection that merely carried an idempotency key.
      if (r.recordedAt) {
        current.worstLagMs = Math.max(current.worstLagMs, r.createdAt.getTime() - r.recordedAt.getTime())
      }
      offlineByPermit.set(r.subjectId, current)
    }

    const incidents = await this.db.incident.findMany({
      where: { ...scope, occurredAt: window },
      orderBy: { occurredAt: 'asc' },
      select: INCIDENT_SELECT,
    })

    // ── The sections ────────────────────────────────────────────────────────
    const permitSection = this.permitSection(permits, offlineByPermit, fmt)
    const jsaSection = this.jsaSection(permits)
    const competency = await this.competencySection(companyId, permits, opts.to, fmtDay)
    const incidentSection = this.incidentSection(incidents, fmt)

    // ── The score ───────────────────────────────────────────────────────────
    const components = this.scoreComponents(permits, competency.workerRows)
    const score = overallScore(components)

    const periodLabel = `Audit period ${fmtDay(opts.from)} to ${fmtDay(opts.to)}`

    return {
      type: 'audit_pack',
      title: 'Contractor HSE evidence pack',
      companyName: company.name,
      siteName: site?.name ?? null,
      generatedAt: new Date(),
      timezone: tz,
      periodStart: opts.from,
      periodEnd: opts.to,
      periodLabel,
      /*
       * This document is meant to leave the company — that is its whole purpose — so the
       * default "not for external distribution" footer would be exactly wrong.
       */
      footer: `HSE evidence pack prepared by ${company.name} using SafeChain - records as held at generation`,
      summary: [
        { label: 'Permits in period', value: String(permits.length) },
        { label: 'Live at period end', value: String(permits.filter((p) => isLive(p.status)).length) },
        { label: 'Gas tests', value: String(permits.reduce((n, p) => n + p.gasTests.length, 0)) },
        { label: 'Passes expired', value: String(competency.expired) },
        { label: 'Compliance score', value: score === null ? 'N/A' : `${score}%` },
      ],
      /*
       * The cover's own table is the score's workings.
       *
       * A single percentage on the front of a document an auditor is holding is a claim,
       * and an unexplained one invites the question "whose score is that?". Printing the
       * numerator, the denominator and the basis of every component means the reader can
       * check the arithmetic instead of trusting it — and can see immediately which
       * component dragged it down.
       */
      columns: [
        { key: 'label', label: 'Score component', width: 150 },
        { key: 'met', label: 'Met', width: 55 },
        { key: 'of', label: 'Required', width: 65 },
        { key: 'pct', label: 'Result', width: 55 },
        { key: 'basis', label: 'Counted from', width: 190 },
      ],
      rows: components.map((c) => ({
        label: c.label,
        met: String(c.met),
        of: String(c.of),
        pct: c.of === 0 ? 'n/a' : `${Math.round((c.met / c.of) * 100)}%`,
        basis: c.basis,
      })),
      emptyMessage:
        'No permits, incidents or competency records fall in this period, so there is nothing to score.',
      sections: [
        {
          title: 'How this pack was produced',
          note:
            'Every figure is read from records entered by the people doing the work. Nothing is '
            + 'estimated. The compliance score above is computed by SafeChain from the components '
            + 'listed on this page and is not a PETRONAS or DOSH score; a component with nothing '
            + 'required is left out of the average rather than counted as a pass.',
          unavailable:
            'This is SafeChain\'s own evidence pack. It is not the PETRONAS Contractor HSE '
            + 'Guidelines audit form and not a DOSH/JKKP inspection form, and it does not claim to '
            + 'be either. It organises the underlying records in the order an audit asks for them.',
        },
        permitSection,
        jsaSection,
        competency.section,
        incidentSection,
        {
          title: 'Auditor notes',
          note: 'For findings raised during this audit, and the name of the person raising them.',
          writeIn: 6,
        },
      ],
    }
  }

  /**
   * Records that a pack left the building.
   *
   * Separate from build() on purpose: the figures are also read by the screen that offers
   * the export, and logging an audit entry every time a dashboard refreshes would bury the
   * exports that matter among hundreds of page loads. Only the PDF route calls this.
   */
  async logExport(
    caller: Caller,
    companyId: string,
    periodLabel: string,
    ctx: { ip?: string; device?: string } = {},
  ) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId,
        actor: caller.name,
        actorRole: m?.role ?? '',
        action: 'Exported contractor HSE evidence pack',
        module: 'reports',
        target: periodLabel,
        ip: ctx.ip ?? '',
        device: ctx.device ?? '',
      },
    })
  }

  /**
   * The zone this pack's dates are printed in.
   *
   * The site's own when the pack is scoped to one, otherwise the workspace's earliest site,
   * which is the closest thing to a head office the schema records. The fallback is the
   * column's own default rather than UTC: every site row carries a zone, so reaching the
   * fallback at all means the workspace has no sites.
   */
  private async timezoneFor(companyId: string, siteId: string | null): Promise<string> {
    const site = await this.db.site.findFirst({
      where: siteId ? { id: siteId, companyId } : { companyId },
      orderBy: siteId ? undefined : { id: 'asc' },
      select: { timezone: true },
    })
    return site?.timezone && isValidTimezone(site.timezone) ? site.timezone : 'Asia/Kuching'
  }

  // ── Section 1: permits and gas tests ──────────────────────────────────────

  private permitSection(
    permits: PermitRow[],
    offline: Map<string, { count: number; worstLagMs: number }>,
    fmt: (d: Date) => string,
  ): ReportSection {
    const gasTests = permits.flatMap((p) => p.gasTests.map((g) => ({ permit: p, test: g })))
    const failed = gasTests.filter((g) => !g.test.pass)
    const needingGas = permits.filter((p) => GAS_TEST_REQUIRED.includes(p.type))
    const withoutGas = needingGas.filter((p) => p.gasTests.length === 0)

    const rows = permits.slice(0, MAX_ROWS).map((p) => {
      const off = offline.get(p.id)
      return {
        code: p.code,
        type: p.type.replace(/_/g, ' '),
        site: p.site?.name ?? '',
        window: compactWindow(p.validFrom, p.validTo, fmt),
        status: p.status,
        signed: p.signatures.length === 0
          ? 'none'
          : p.signatures.map((s) => `${s.role}: ${s.name}`).join('\n'),
        // "4 / 1 failed" rather than a bare count: an auditor is looking for the failure,
        // and a permit that was tested four times because three readings were bad is a
        // different story from one tested four times on schedule.
        gas: p.gasTests.length === 0
          // "NOT TESTED" rather than "NONE RECORDED": the longer wording broke across
          // three lines in the column, which read as damage rather than as a finding.
          ? (GAS_TEST_REQUIRED.includes(p.type) ? 'NOT TESTED' : '-')
          : failedCount(p) === 0
            ? String(p.gasTests.length)
            : `${p.gasTests.length} / ${failedCount(p)} failed`,
        offline: off ? `${off.count}` : '-',
      }
    })

    return {
      title: 'Section 1 - Permits to work, and the atmosphere tested under them',
      note:
        'Permits live at any point in the period, with who signed each one. The gas column '
        + 'shows the number of readings taken; a permit type that requires testing and has none '
        + 'is marked. "Offline" is the number of records on that permit captured with no signal '
        + 'and synced later - the ledger records which permit each belongs to, not which '
        + 'individual reading, so this is a per-permit count.',
      stats: [
        { label: 'Permits', value: String(permits.length) },
        { label: 'Gas tests', value: String(gasTests.length) },
        { label: 'Gas tests failed', value: String(failed.length) },
        { label: 'Testing required, none recorded', value: String(withoutGas.length) },
        { label: 'Closed with handback', value: String(permits.filter((p) => p.handbackConfirmed).length) },
      ],
      // Sums to PAGE_WIDTH. The permit number gets the room it needs to stay on one line.
      columns: [
        { key: 'code', label: 'Permit', width: 80 },
        { key: 'type', label: 'Type', width: 74 },
        { key: 'site', label: 'Site', width: 66 },
        { key: 'window', label: 'Valid', width: 96 },
        { key: 'status', label: 'Status', width: 46 },
        { key: 'signed', label: 'Signed by', width: 87 },
        { key: 'gas', label: 'Gas', width: 46 },
        /*
         * "Off" rather than "Offline": the full header wrapped to "OFFLI / NE". Width 28
         * rather than the 22 the values need, because the header is what sets the minimum -
         * it is drawn uppercase and bold, so "OFF" is wider than the "3" beneath it.
         */
        { key: 'offline', label: 'Off', width: 28 },
      ],
      rows,
    }
  }

  // ── Section 2: JSA ────────────────────────────────────────────────────────

  private jsaSection(permits: PermitRow[]): ReportSection {
    const steps = permits.flatMap((p) => p.jsaSteps.map((s) => ({ permit: p, step: s })))

    if (steps.length === 0) {
      return {
        title: 'Section 2 - Job safety analysis and hazard assessment',
        unavailable:
          'No job safety analysis steps were recorded against the permits in this period. '
          + 'This is a gap in the record, not a statement that the work carried no hazard.',
      }
    }

    const rows = steps.slice(0, MAX_ROWS).map(({ permit, step }) => ({
      code: permit.code,
      seq: String(step.sequence),
      hazard: step.hazard,
      control: step.control,
      responsible: step.responsible || '-',
      residual: step.residualRisk || '-',
      // A step whose id was generated on a device is one written at the job rather than at
      // a desk, which is exactly the provenance an auditor is asking about.
      origin: step.clientId ? 'field' : 'desk',
    }))

    return {
      title: 'Section 2 - Job safety analysis and hazard assessment',
      note:
        'Each hazard identified for the work, with the control applied and the person '
        + 'responsible. "Origin" says where the step was written: "field" means it was entered '
        + 'at the job on a device with no signal and synced afterwards.',
      stats: [
        { label: 'Hazards assessed', value: String(steps.length) },
        { label: 'Permits with a JSA', value: String(new Set(steps.map((s) => s.permit.id)).size) },
        { label: 'Permits without one', value: String(permits.filter((p) => p.jsaSteps.length === 0).length) },
        { label: 'Written at the job', value: String(steps.filter((s) => s.step.clientId).length) },
      ],
      columns: [
        { key: 'code', label: 'Permit', width: 76 },
        { key: 'seq', label: '#', width: 18 },
        { key: 'hazard', label: 'Hazard', width: 126 },
        { key: 'control', label: 'Control', width: 131 },
        { key: 'responsible', label: 'Responsible', width: 70 },
        // Wide enough for 'RESIDUAL' and 'ORIGIN' as headers, not just for their values.
        { key: 'residual', label: 'Residual', width: 54 },
        { key: 'origin', label: 'Origin', width: 48 },
      ],
      rows,
    }
  }

  // ── Section 3: competency and passes ──────────────────────────────────────

  private async competencySection(
    companyId: string,
    permits: PermitRow[],
    asAt: Date,
    fmtDay: (d: Date) => string,
  ) {
    /*
     * Scoped to the people who were actually on these permits, not to the whole register.
     *
     * An audit of March's work asks about the people who did March's work. Listing every
     * worker on the books would bury the dozen that matter and would also hand the client
     * personal data about people who were never on their site.
     */
    const employeeIds = new Set<string>()
    const contractorIds = new Set<string>()
    for (const p of permits) {
      for (const a of p.attendees) {
        if (a.employee) employeeIds.add(a.employee.id)
        if (a.contractorWorker) contractorIds.add(a.contractorWorker.id)
      }
    }

    const certificates = employeeIds.size > 0
      ? await this.db.certificate.findMany({
          where: { companyId, employeeId: { in: [...employeeIds] } },
          orderBy: { expiryDate: 'asc' },
          select: {
            courseName: true, number: true, issueDate: true, expiryDate: true,
            employee: { select: { id: true, name: true, employeeNo: true, medicalExpiry: true } },
          },
        })
      : []

    type WorkerRow = {
      who: string
      employer: string
      pass: string
      expires: string
      state: PassState
    }
    const rows: WorkerRow[] = []

    const stateOf = (expiry: Date | null | undefined): PassState => {
      if (!expiry) return 'no expiry recorded'
      const days = Math.floor((expiry.getTime() - asAt.getTime()) / 86_400_000)
      if (days < 0) return 'EXPIRED'
      if (days <= EXPIRING_WITHIN_DAYS) return 'expiring'
      return 'valid'
    }

    // Own employees: their training certificates, and the medical that bars them from a job.
    for (const c of certificates) {
      rows.push({
        who: `${c.employee.name} (${c.employee.employeeNo})`,
        employer: 'Own employee',
        pass: c.courseName,
        expires: c.expiryDate ? fmtDay(c.expiryDate) : 'no expiry',
        state: stateOf(c.expiryDate),
      })
    }
    const seenMedical = new Set<string>()
    for (const p of permits) {
      for (const a of p.attendees) {
        if (!a.employee || seenMedical.has(a.employee.id)) continue
        seenMedical.add(a.employee.id)
        rows.push({
          who: a.employee.name,
          employer: 'Own employee',
          pass: 'Medical fitness to work',
          expires: a.employee.medicalExpiry ? fmtDay(a.employee.medicalExpiry) : 'not recorded',
          state: stateOf(a.employee.medicalExpiry),
        })
      }
    }

    // Contractor workers: medical, induction, and whatever certificates were registered.
    const seenContractor = new Set<string>()
    for (const p of permits) {
      for (const a of p.attendees) {
        const w = a.contractorWorker
        if (!w || seenContractor.has(w.id)) continue
        seenContractor.add(w.id)
        const employer = w.contractorCompany?.name ?? 'Contractor'
        rows.push({
          who: w.name, employer, pass: 'Medical fitness to work',
          expires: w.medicalExpiry ? fmtDay(w.medicalExpiry) : 'not recorded',
          state: stateOf(w.medicalExpiry),
        })
        rows.push({
          who: w.name, employer, pass: 'Site induction',
          expires: w.inductionExpiry ? fmtDay(w.inductionExpiry) : 'not recorded',
          state: stateOf(w.inductionExpiry),
        })
        for (const c of w.certificates) {
          rows.push({
            who: w.name, employer, pass: c.name,
            expires: c.expiryDate ? fmtDay(c.expiryDate) : 'no expiry',
            state: stateOf(c.expiryDate),
          })
        }
      }
    }

    // Worst first: an auditor reading one page should see the expired ones on it.
    const order: Record<PassState, number> = {
      EXPIRED: 0, expiring: 1, 'no expiry recorded': 2, valid: 3,
    }
    rows.sort((a, b) => order[a.state] - order[b.state] || a.who.localeCompare(b.who))

    const expired = rows.filter((r) => r.state === 'EXPIRED').length
    const expiring = rows.filter((r) => r.state === 'expiring').length

    const section: ReportSection = rows.length === 0
      ? {
          title: 'Section 3 - Worker competency and safety passes',
          unavailable:
            'No people were named on the permits in this period, so there are no competency '
            + 'records to show. A permit worked by people who were never named on it is itself '
            + 'a finding.',
        }
      : {
          title: 'Section 3 - Worker competency and safety passes',
          note:
            'Every pass held by the people named on the permits above, worst first. "Expiring" '
            + `means within ${EXPIRING_WITHIN_DAYS} days of the end of the audit period. Passes `
            + 'are listed under the names they were registered with - SafeChain records what a '
            + 'customer enters and does not itself know one scheme from another, so a BOSIET or '
            + 'OGSP certificate appears here under that name only if it was registered that way.',
          stats: [
            { label: 'Passes checked', value: String(rows.length) },
            { label: 'Expired', value: String(expired) },
            { label: 'Expiring', value: String(expiring) },
            { label: 'No expiry recorded', value: String(rows.filter((r) => r.state === 'no expiry recorded').length) },
          ],
          columns: [
            { key: 'who', label: 'Worker', width: 122 },
            { key: 'employer', label: 'Employer', width: 106 },
            { key: 'pass', label: 'Pass or certificate', width: 150 },
            { key: 'expires', label: 'Expires', width: 78 },
            { key: 'state', label: 'Status', width: 67 },
          ],
          rows: rows.slice(0, MAX_ROWS),
        }

    return { section, expired, expiring, workerRows: rows }
  }

  // ── Section 4: incidents and evidence ─────────────────────────────────────

  private incidentSection(incidents: IncidentRow[], fmt: (d: Date) => string): ReportSection {
    if (incidents.length === 0) {
      return {
        title: 'Section 4 - Incidents and photographic evidence',
        note: 'No incidents were reported on this scope during the audit period.',
      }
    }

    const photos = incidents.flatMap((i) => i.attachments)

    return {
      title: 'Section 4 - Incidents and photographic evidence',
      note:
        'Incidents that occurred in the period. The evidence column counts the files held '
        + 'against each one; the files themselves accompany this pack rather than being embedded, '
        + 'so a pack covering a busy month stays a document somebody can open and email. Each '
        + 'file carries a checksum taken when it was stored, which is what lets a copy be '
        + 'checked against the record.',
      stats: [
        { label: 'Incidents', value: String(incidents.length) },
        { label: 'Still open', value: String(incidents.filter((i) => !i.closedAt).length) },
        { label: 'Evidence files', value: String(photos.length) },
      ],
      columns: [
        { key: 'number', label: 'Ref', width: 84 },
        { key: 'when', label: 'Occurred', width: 88 },
        { key: 'type', label: 'Type', width: 70 },
        { key: 'severity', label: 'Severity', width: 58 },
        { key: 'what', label: 'What happened', width: 127 },
        { key: 'stage', label: 'Stage', width: 58 },
        { key: 'evidence', label: 'Files', width: 38 },
      ],
      rows: incidents.slice(0, MAX_ROWS).map((i) => ({
        number: i.number,
        when: fmt(i.occurredAt),
        type: i.type.replace(/_/g, ' '),
        severity: i.severity.replace(/_/g, ' '),
        what: i.title,
        stage: i.closedAt ? 'closed' : i.stage,
        evidence: String(i.attachments.length),
      })),
    }
  }

  // ── The score ─────────────────────────────────────────────────────────────

  /**
   * The components the score is averaged from.
   *
   * Chosen so that each one is a thing the company either did or did not do, countable from
   * records rather than judged. Nothing here is weighted: a weighting would be an opinion
   * about which failure matters more, and this document is not the place to assert one.
   */
  private scoreComponents(
    permits: PermitRow[],
    workerRows: { state: PassState }[],
  ): ScoreComponent[] {
    const requiringGas = permits.filter((p) => GAS_TEST_REQUIRED.includes(p.type))
    const closed = permits.filter((p) => p.status === 'closed')

    const controlsRequired = permits.reduce(
      (n, p) => n + p.controls.filter((c) => c.required).length, 0,
    )
    const controlsConfirmed = permits.reduce(
      (n, p) => n + p.controls.filter((c) => c.required && c.confirmed).length, 0,
    )

    const passesChecked = workerRows.length
    const passesValid = workerRows.filter((r) => r.state === 'valid' || r.state === 'expiring').length

    return [
      {
        label: 'Precautions confirmed',
        met: controlsConfirmed,
        of: controlsRequired,
        basis: 'Required controls ticked on the permits in this period',
      },
      {
        label: 'Atmosphere tested',
        met: requiringGas.filter((p) => p.gasTests.length > 0).length,
        of: requiringGas.length,
        basis: 'Permit types that require gas testing, with at least one reading',
      },
      {
        label: 'Permits signed off',
        met: permits.filter((p) => p.signatures.length > 0).length,
        of: permits.length,
        basis: 'Permits carrying at least one signature',
      },
      {
        label: 'Closed with handback',
        met: closed.filter((p) => p.handbackConfirmed).length,
        of: closed.length,
        basis: 'Permits closed in this period, with the site confirmed handed back',
      },
      {
        label: 'Isolations released',
        met: permits.reduce((n, p) => n + p.isolations.filter((i) => i.removedAt).length, 0),
        of: permits.reduce((n, p) => n + p.isolations.length, 0),
        basis: 'Isolations applied under these permits, later released',
      },
      {
        label: 'Passes in date',
        met: passesValid,
        of: passesChecked,
        basis: 'Passes held by people named on these permits, not expired',
      },
    ]
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type PassState = 'EXPIRED' | 'expiring' | 'valid' | 'no expiry recorded'

/**
 * The average of the components that applied.
 *
 * A component with nothing required is left out rather than counted as 100%. A site that
 * ran no confined-space work did not score full marks on gas testing; it was not asked the
 * question, and inflating a score with questions nobody asked is how a compliance figure
 * becomes meaningless. Null when nothing at all applied, printed as "N/A".
 */
export function overallScore(components: ScoreComponent[]): number | null {
  const applicable = components.filter((c) => c.of > 0)
  if (applicable.length === 0) return null
  const total = applicable.reduce((sum, c) => sum + c.met / c.of, 0)
  return Math.round((total / applicable.length) * 100)
}

const isLive = (status: string) => ['active', 'suspended', 'approved'].includes(status)

const failedCount = (p: PermitRow) => p.gasTests.filter((g) => !g.pass).length

/**
 * A permit's validity window, short enough to sit in its column.
 *
 * The full form printed the year twice - "09 Oct 2026, 02:02 to 10 Oct 2026, 02:02" - which
 * wrapped and told the reader nothing the first date had not. The times stay: a permit valid
 * for one shift and one valid for three days are different documents, and that is the field
 * which says which.
 */
function compactWindow(from: Date, to: Date, fmt: (d: Date) => string): string {
  const a = fmt(from)
  const b = fmt(to)
  // "09 Oct 2026, 06:00" -> ["09 Oct 2026", "06:00"]
  const [fromDay, fromTime] = a.split(', ')
  const [toDay, toTime] = b.split(', ')
  if (fromDay === toDay) return `${fromDay} ${fromTime}-${toTime}`
  return `${fromDay} ${fromTime} to ${toDay} ${toTime}`
}

const dateTimeFormatter = (tz: string) => (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).format(d)

const dayFormatter = (tz: string) => (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: tz,
  }).format(d)
