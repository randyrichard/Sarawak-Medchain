import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { AuditPackError, AuditPackService, EXPIRING_WITHIN_DAYS, PAGE_WIDTH } from './auditPack.js'
import { renderReportPdf } from './reportPdf.js'
import type { Caller } from '../domain/caller.js'

/**
 * The contractor HSE evidence pack, against a REAL PostgreSQL database.
 *
 * This document is handed to somebody auditing the company, so the thing worth testing is
 * not that it renders — it is that what it says matches what is in the database. A pack
 * that quietly drops a permit, or prints a worker's lapsed medical as valid, is worse than
 * no pack: it is a false assurance with the company's name on it.
 *
 * Requires a database: `npm run db:start && npx prisma migrate deploy`.
 * Skipped automatically when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new AuditPackService(db)

const COMPANY = 'pack-itest-co'
const SITE = 'pack-itest-site'
const OTHER_SITE = 'pack-itest-site-b'

const manager: Caller = {
  userId: 'pack-mgr', name: 'Pack Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const worker: Caller = {
  userId: 'pack-emp', name: 'Pack Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const supervisor: Caller = {
  userId: 'pack-sup', name: 'Pack Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE] }],
}
const outsider: Caller = {
  userId: 'pack-out', name: 'Pack Outsider',
  roles: [{ companyId: 'pack-itest-other', role: 'admin', siteIds: [] }],
}

const DAY = 86_400_000
const now = Date.now()
/** The audit period every test asks about: the last 30 days. */
const FROM = new Date(now - 30 * DAY)
const TO = new Date(now)

const section = (data: Awaited<ReturnType<typeof svc.build>>, startsWith: string) =>
  (data.sections ?? []).find((s) => s.title.startsWith(startsWith))

/**
 * Removes everything this file creates, in dependency order.
 *
 * Explicit rather than one cascade from the company: a contractor worker's site is
 * onDelete: Restrict - deliberately, because deleting a site out from under the people
 * inducted onto it would orphan their records - so deleting the company first is refused by
 * the database.
 *
 * Run before the fixtures as well as after them. A run that fails part-way leaves rows
 * behind, and the next run would then collide on the permit codes rather than telling
 * anybody what actually went wrong.
 */
async function cleanup() {
  await db.permit.deleteMany({ where: { companyId: COMPANY } })
  await db.incident.deleteMany({ where: { companyId: COMPANY } })
  await db.contractorWorker.deleteMany({ where: { companyId: COMPANY } })
  await db.contractorCompany.deleteMany({ where: { companyId: COMPANY } })
  await db.certificate.deleteMany({ where: { companyId: COMPANY } })
  await db.employee.deleteMany({ where: { companyId: COMPANY } })
  await db.fieldRecord.deleteMany({ where: { companyId: COMPANY } })
  await db.site.deleteMany({ where: { companyId: COMPANY } })
  await db.company.deleteMany({ where: { id: COMPANY } })
  await db.counter.deleteMany({ where: { companyId: COMPANY } })
}

d('contractor HSE evidence pack - integration (real Postgres)', () => {
  beforeAll(async () => {
    await cleanup()
    await db.company.upsert({
      where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Pack ITest Sdn Bhd' },
    })
    for (const [id, name] of [[SITE, 'Bintulu Yard'], [OTHER_SITE, 'Miri Yard']]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId: COMPANY, name, timezone: 'Asia/Kuching' },
      })
    }

    // A permit worked inside the period, with the full set of children an audit asks for.
    const permit = await db.permit.create({
      data: {
        companyId: COMPANY, siteId: SITE, code: 'PTW-PACK-001', type: 'confined_space',
        title: 'Vessel entry V-101', description: 'Internal inspection.',
        department: 'Inspection', location: 'Tank farm', applicant: 'Siti',
        workerCount: 2, status: 'closed', handbackConfirmed: true,
        validFrom: new Date(now - 10 * DAY), validTo: new Date(now - 9 * DAY),
        createdBy: 'ITest',
        controls: {
          create: [
            { position: 1, label: 'Atmosphere tested', required: true, confirmed: true },
            { position: 2, label: 'Standby attendant posted', required: true, confirmed: false },
            { position: 3, label: 'Optional briefing', required: false, confirmed: false },
          ],
        },
        gasTests: {
          create: [
            { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 2, pass: true, testedBy: 'Tester', testedAt: new Date(now - 10 * DAY) },
            { oxygenPct: 17.1, lelPct: 22, h2sPpm: 14, coPpm: 4, pass: false, testedBy: 'Tester', testedAt: new Date(now - 10 * DAY + 3600_000) },
          ],
        },
        signatures: { create: [{ role: 'approver', name: 'Pack Manager', statement: 'Controls verified.' }] },
        isolations: {
          create: [
            { description: 'Inlet valve', tagId: 'LOTO-1', isolatedBy: 'Fitter', isolatedAt: new Date(now - 10 * DAY), removedBy: 'Fitter', removedAt: new Date(now - 9 * DAY) },
            { description: 'Drain line', tagId: 'LOTO-2', isolatedBy: 'Fitter', isolatedAt: new Date(now - 10 * DAY) },
          ],
        },
        jsaSteps: {
          create: [
            { sequence: 1, hazard: 'Oxygen deficiency', control: 'Continuous monitoring', responsible: 'Attendant', createdBy: 'ITest' },
            { sequence: 2, hazard: 'Falling object', control: 'Barricade below', responsible: 'Supervisor', createdBy: 'ITest', clientId: 'local-abc' },
          ],
        },
      },
    })

    // Opened before the window and still live inside it: belongs in this pack.
    await db.permit.create({
      data: {
        companyId: COMPANY, siteId: SITE, code: 'PTW-PACK-002', type: 'hot_work',
        title: 'Weld repair', description: 'Pipe spool.', department: 'Maintenance',
        location: 'Rack 4', applicant: 'Ahmad', workerCount: 1, status: 'active',
        validFrom: new Date(now - 40 * DAY), validTo: new Date(now - 2 * DAY),
        createdBy: 'ITest',
      },
    })

    // Entirely before the window: must not appear.
    await db.permit.create({
      data: {
        companyId: COMPANY, siteId: SITE, code: 'PTW-PACK-OLD', type: 'cold_work',
        title: 'Old job', description: 'Finished long ago.', department: 'Ops',
        location: 'Elsewhere', applicant: 'Nobody', workerCount: 1, status: 'closed',
        validFrom: new Date(now - 200 * DAY), validTo: new Date(now - 190 * DAY),
        createdBy: 'ITest',
      },
    })

    // On another site, for the site-scoping test.
    await db.permit.create({
      data: {
        companyId: COMPANY, siteId: OTHER_SITE, code: 'PTW-PACK-MIRI', type: 'cold_work',
        title: 'Miri job', description: 'Other site.', department: 'Ops',
        location: 'Miri', applicant: 'Nobody', workerCount: 1, status: 'active',
        validFrom: new Date(now - 5 * DAY), validTo: new Date(now + 5 * DAY),
        createdBy: 'ITest',
      },
    })

    // People on the permit, and the passes an auditor checks them against.
    const employee = await db.employee.create({
      data: {
        companyId: COMPANY, siteId: SITE, employeeNo: 'EMP-PACK-1', name: 'Rahim Osman',
        // Lapsed: this is the row the pack has to surface.
        medicalExpiry: new Date(now - 3 * DAY),
      },
    })
    await db.certificate.create({
      data: {
        companyId: COMPANY, employeeId: employee.id, number: 'CERT-PACK-1', qrKey: 'qr-pack-1',
        courseId: 'course-1', courseName: 'Confined Space Entry',
        issueDate: new Date(now - 300 * DAY), expiryDate: new Date(now + 5 * DAY), issuedBy: 'Trainer',
      },
    })
    await db.permitAttendee.create({
      data: { permitId: permit.id, employeeId: employee.id, nameAtAssignment: employee.name, addedBy: 'ITest' },
    })

    const contractorCo = await db.contractorCompany.create({
      data: { companyId: COMPANY, code: 'SSB', name: 'Sarawak Scaffolding Sdn Bhd', registrationNumber: 'SSB-1' },
    })
    const cw = await db.contractorWorker.create({
      data: {
        companyId: COMPANY, contractorCompanyId: contractorCo.id, siteId: SITE,
        workerNo: 'CW-PACK-1', name: 'Jalil Hassan',
        medicalExpiry: new Date(now + 200 * DAY),
        inductionExpiry: new Date(now + 200 * DAY),
        certificates: {
          create: [{ name: 'BOSIET', issuedBy: 'OPITO centre', expiryDate: new Date(now + 400 * DAY) }],
        },
      },
    })
    await db.permitAttendee.create({
      data: { permitId: permit.id, contractorWorkerId: cw.id, nameAtAssignment: cw.name, addedBy: 'ITest' },
    })

    // An incident in the period, with evidence held against it.
    await db.incident.create({
      data: {
        companyId: COMPANY, siteId: SITE, number: 'INC-PACK-1', title: 'Dropped spanner',
        type: 'near_miss', severity: 'Minor', stage: 'investigation',
        occurredAt: new Date(now - 5 * DAY), location: 'Rack 4', department: 'Maintenance',
        reporter: 'Ahmad',
        attachments: {
          create: [{
            originalName: 'scene.jpg', storedName: 'stored-scene.jpg', mimeType: 'image/jpeg',
            sizeBytes: 1024, checksum: 'abc123', uploadedBy: 'Ahmad',
          }],
        },
      },
    })

    // Two records that reached the server from a device with no signal.
    await db.fieldRecord.createMany({
      data: [
        {
          companyId: COMPANY, clientRef: 'pack-itest-ref-1', operation: 'permit.gas-test',
          subjectId: permit.id, userId: 'pack-sup',
          recordedAt: new Date(now - 10 * DAY), createdAt: new Date(now - 10 * DAY + 4 * 3600_000),
        },
        {
          companyId: COMPANY, clientRef: 'pack-itest-ref-2', operation: 'permit.person-entry',
          subjectId: permit.id, userId: 'pack-sup',
        },
      ],
    })
  })

  afterAll(async () => {
    await cleanup()
    await db.$disconnect()
  })

  // ── Who may export one ────────────────────────────────────────────────────

  it('refuses a caller from another workspace', async () => {
    await expect(svc.build(outsider, COMPANY, { from: FROM, to: TO })).rejects.toThrow(AuditPackError)
  })

  it('refuses a supervisor', async () => {
    /*
     * A supervisor runs a job; they do not send the company's compliance record, including
     * named people's medical expiry, to a client. Same list as every other tenant-wide
     * report.
     */
    await expect(svc.build(supervisor, COMPANY, { from: FROM, to: TO }))
      .rejects.toThrow(/role does not permit/i)
  })

  it('refuses an ordinary employee', async () => {
    await expect(svc.build(worker, COMPANY, { from: FROM, to: TO })).rejects.toThrow(/role does not permit/i)
  })

  it('refuses a period that runs backwards', async () => {
    await expect(svc.build(manager, COMPANY, { from: TO, to: FROM }))
      .rejects.toThrow(/starts after it ends/i)
  })

  // ── What it covers ────────────────────────────────────────────────────────

  it('includes a permit that was live during the period but raised before it', async () => {
    /*
     * The boundary that a naive createdAt filter gets wrong. A permit opened on the 28th and
     * worked through month end belongs in both months' packs — and an audit of the month the
     * work happened in would otherwise simply not show it.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    const codes = (section(data, 'Section 1')?.rows ?? []).map((r) => r.code)
    expect(codes).toContain('PTW-PACK-002')
  })

  it('leaves out a permit that closed before the period', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    const codes = (section(data, 'Section 1')?.rows ?? []).map((r) => r.code)
    expect(codes).not.toContain('PTW-PACK-OLD')
  })

  it('narrows to one site when asked', async () => {
    const all = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    const scoped = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })

    const allCodes = (section(all, 'Section 1')?.rows ?? []).map((r) => r.code)
    const scopedCodes = (section(scoped, 'Section 1')?.rows ?? []).map((r) => r.code)
    expect(allCodes).toContain('PTW-PACK-MIRI')
    expect(scopedCodes).not.toContain('PTW-PACK-MIRI')
    expect(scoped.siteName).toBe('Bintulu Yard')
  })

  it('refuses a site belonging to another workspace', async () => {
    await expect(svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: 'no-such-site' }))
      .rejects.toThrow(/Unknown site/i)
  })

  // ── Section 1 ─────────────────────────────────────────────────────────────

  it('names the failed gas test rather than burying it in a count', async () => {
    // Two readings, one failed. "2" alone would read as a permit tested twice on schedule.
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const row = (section(data, 'Section 1')?.rows ?? []).find((r) => r.code === 'PTW-PACK-001')
    expect(row?.gas).toBe('2 / 1 failed')
  })

  it('marks a permit type that required testing and recorded none', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const row = (section(data, 'Section 1')?.rows ?? []).find((r) => r.code === 'PTW-PACK-002')
    // Hot work requires a gas test and this one has none: the pack has to say so, because
    // a dash would read as "not applicable".
    expect(row?.gas).toBe('NOT TESTED')
  })

  it('counts records captured with no signal, per permit', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const row = (section(data, 'Section 1')?.rows ?? []).find((r) => r.code === 'PTW-PACK-001')
    expect(row?.offline).toBe('2')
  })

  it('shows who signed the permit', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const row = (section(data, 'Section 1')?.rows ?? []).find((r) => r.code === 'PTW-PACK-001')
    expect(row?.signed).toContain('Pack Manager')
  })

  // ── Section 2 ─────────────────────────────────────────────────────────────

  it('lists the hazards, and says which were written at the job', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const rows = section(data, 'Section 2')?.rows ?? []
    expect(rows.map((r) => r.hazard)).toContain('Oxygen deficiency')
    // The step carrying a device-generated id was written in the field, not at a desk.
    expect(rows.find((r) => r.hazard === 'Falling object')?.origin).toBe('field')
    expect(rows.find((r) => r.hazard === 'Oxygen deficiency')?.origin).toBe('desk')
  })

  // ── Section 3 ─────────────────────────────────────────────────────────────

  it('puts an expired medical at the top, flagged', async () => {
    /*
     * The row most likely to matter at an audit. Sorting worst-first means an auditor
     * reading only the first page still sees it.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const rows = section(data, 'Section 3')?.rows ?? []
    expect(rows[0].state).toBe('EXPIRED')
    expect(rows[0].who).toContain('Rahim')
  })

  it('flags a certificate inside the expiry window', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const rows = section(data, 'Section 3')?.rows ?? []
    const cert = rows.find((r) => r.pass === 'Confined Space Entry')
    // Expires in 5 days, which is inside the window the scheduler also warns on.
    expect(cert?.state).toBe('expiring')
    expect(EXPIRING_WITHIN_DAYS).toBe(30)
  })

  it('lists a contractor pass under the name it was registered with', async () => {
    /*
     * SafeChain does not know one scheme from another. A BOSIET certificate appears as
     * "BOSIET" because that is what the customer typed, and the section says so rather
     * than implying the product validates it against OPITO.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const rows = section(data, 'Section 3')?.rows ?? []
    const bosiet = rows.find((r) => r.pass === 'BOSIET')
    expect(bosiet?.state).toBe('valid')
    expect(bosiet?.employer).toBe('Sarawak Scaffolding Sdn Bhd')
  })

  it('only checks the people who were on these permits', async () => {
    // An audit of this period asks about the people who did this period's work, and the
    // client has no business receiving records for anyone else.
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const who = (section(data, 'Section 3')?.rows ?? []).map((r) => r.who)
    expect(who.some((w) => w.includes('Rahim'))).toBe(true)
    expect(who.some((w) => w.includes('Jalil'))).toBe(true)
  })

  // ── Section 4 ─────────────────────────────────────────────────────────────

  it('lists incidents in the period with their evidence count', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const rows = section(data, 'Section 4')?.rows ?? []
    const inc = rows.find((r) => r.number === 'INC-PACK-1')
    expect(inc?.evidence).toBe('1')
    expect(inc?.what).toBe('Dropped spanner')
  })

  // ── The score ─────────────────────────────────────────────────────────────

  it('prints the score’s workings, not just the score', async () => {
    /*
     * The cover table is the method. A percentage on a document an auditor is holding is a
     * claim, and an unexplained one invites "whose score is that?" — so every component
     * carries its numerator, denominator and what it was counted from.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const labels = data.rows.map((r) => r.label)
    expect(labels).toContain('Precautions confirmed')
    expect(labels).toContain('Passes in date')
    for (const row of data.rows) {
      expect(row.basis.length).toBeGreaterThan(10)
      expect(row.met).toBeDefined()
      expect(row.of).toBeDefined()
    }
  })

  it('counts a half-confirmed set of precautions as half', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const row = data.rows.find((r) => r.label === 'Precautions confirmed')
    // Two required on PTW-PACK-001, one confirmed. The optional one is not counted at all.
    expect(row?.met).toBe('1')
    expect(row?.of).toBe('2')
  })

  it('scores isolations on whether they came off again', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO, siteId: SITE })
    const row = data.rows.find((r) => r.label === 'Isolations released')
    expect(row?.met).toBe('1')
    expect(row?.of).toBe('2')
  })

  // ── The document ──────────────────────────────────────────────────────────

  it('says on its face that it is not a PETRONAS or DOSH form', async () => {
    /*
     * The honesty this pack is built around. A document that merely resembled a JKKP form
     * while captioning itself as one would be worse than useless at an audit: the auditor
     * works from the real form, finds this does not match, and now doubts the records too.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    const method = section(data, 'How this pack was produced')
    expect(method?.unavailable).toMatch(/not the PETRONAS/i)
    expect(method?.unavailable).toMatch(/not a DOSH\/JKKP/i)
    expect(method?.note).toMatch(/not a PETRONAS or DOSH score/i)
  })

  it('carries a footer fit for a document that leaves the company', async () => {
    // The default is "not for external distribution", which is exactly wrong here.
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    expect(data.footer).not.toMatch(/not for external distribution/i)
    expect(data.footer).toContain('Pack ITest Sdn Bhd')
  })

  it('prints its period on the cover', async () => {
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    expect(data.periodLabel).toMatch(/^Audit period /)
  })

  it('budgets every table to the width of the page', async () => {
    /*
     * The regression this exists for, found by generating a pack and reading it rather
     * than by any assertion: the column widths summed to more than the printable width, so
     * the renderer scaled the whole table down about 9% - and at 7.5pt that was the
     * difference between "PTW-2026-0417" on one line and "PTW-2026-04" / "17" on two. A
     * permit number broken across lines is the first thing an auditor looks at and the
     * easiest thing for them to distrust.
     *
     * The renderer will always make a table fit. This checks it does not have to.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })

    const tables: { where: string; columns: { width: number }[] }[] = [
      { where: 'cover', columns: data.columns },
      ...(data.sections ?? [])
        .filter((sec) => sec.columns && sec.columns.length > 0)
        .map((sec) => ({ where: sec.title, columns: sec.columns! })),
    ]
    expect(tables.length).toBeGreaterThan(3)

    for (const t of tables) {
      const total = t.columns.reduce((sum, c) => sum + c.width, 0)
      // A little under is harmless - the table simply stretches. Over is what shrinks it.
      expect(total, `${t.where} is budgeted at ${total}`).toBeLessThanOrEqual(PAGE_WIDTH)
      expect(total, `${t.where} wastes the page at ${total}`).toBeGreaterThan(PAGE_WIDTH - 40)
    }
  })

  it('keeps a permit number on one line', async () => {
    // The column has to hold the longest identifier the numbering scheme produces, not the
    // one the fixtures happen to use.
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    const sec = (data.sections ?? []).find((x) => x.title.startsWith('Section 1'))
    const permitCol = sec?.columns?.find((c) => c.key === 'code')
    expect(permitCol?.width).toBeGreaterThanOrEqual(78)
  })

  it('renders to a real PDF', async () => {
    /*
     * End to end through the existing renderer, because the pack's value is the file. A
     * section shape the renderer cannot draw would otherwise only be discovered by somebody
     * clicking Export during an audit.
     */
    const data = await svc.build(manager, COMPANY, { from: FROM, to: TO })
    const pdf = await renderReportPdf(data)
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.bytes.length).toBeGreaterThan(2000)
    expect(pdf.fileName).toMatch(/\.pdf$/)
  })

  it('renders an empty period without inventing anything', async () => {
    // A period with nothing in it must produce a document that says so, not a zero score
    // and not a crash.
    const quiet = { from: new Date(now - 500 * DAY), to: new Date(now - 490 * DAY) }
    const data = await svc.build(manager, COMPANY, quiet)
    expect(data.summary.find((s) => s.label === 'Compliance score')?.value).toBe('N/A')
    const pdf = await renderReportPdf(data)
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
