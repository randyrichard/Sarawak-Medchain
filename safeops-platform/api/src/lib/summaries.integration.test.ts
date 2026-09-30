import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ReportService } from './reportService.js'
import { IncidentSummaryService } from './incidentSummary.js'
import { renderReportPdf } from './reportPdf.js'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Caller } from '../domain/caller.js'

/**
 * The three summaries, against a REAL PostgreSQL database.
 *
 * Written from the records, so what is tested is that each sentence and figure matches the
 * rows behind it, that scope narrows what is counted, and that the incident summary shows
 * nobody more than the incident page itself would.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const reports = new ReportService(db)
const summaries = new IncidentSummaryService(db)

const COMPANY = 'sum-itest-co'
const SITE_A = 'sum-itest-site-a'
const SITE_B = 'sum-itest-site-b'

const as = (role: Caller['roles'][number]['role'], userId = `sum-${role}`, siteIds: string[] = []): Caller => ({
  userId, name: `ITest ${role}`, roles: [{ companyId: COMPANY, role, siteIds }],
})
const hse = as('hse_manager')
const officer = as('safety_officer')
const reporterEmp = as('employee', 'sum-emp-reporter')
const otherEmp = as('employee', 'sum-emp-other')
const outsider: Caller = { userId: 'sum-out', name: 'Out', roles: [{ companyId: 'elsewhere', role: 'admin', siteIds: [] }] }

const DAY = 86_400_000
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY)

let incidentId = ''
let anonymousId = ''

d('Summaries — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Summary ITest Co' } })
    for (const id of [SITE_A, SITE_B]) {
      await db.site.upsert({
        where: { id }, update: {},
        create: { id, companyId: COMPANY, name: `Site ${id.slice(-1).toUpperCase()}`, short: id.slice(-1), city: 'Miri' },
      })
    }

    const inc = await db.incident.create({
      data: {
        number: 'INC-S1', companyId: COMPANY, siteId: SITE_A, title: 'Dropped spanner from scaffold',
        type: 'injury', severity: 'Minor', location: 'Pipe rack 3', department: 'Maintenance',
        reporter: 'Rina Lau', reporterId: 'sum-emp-reporter', occurredAt: daysFromNow(-1),
        description: 'A spanner fell 4 m and grazed a rigger.', immediateActions: 'Area barricaded.',
        rootCause: 'Tools not tethered at height', leadInvestigator: 'Azlan Mahmud',
      },
    })
    incidentId = inc.id
    await db.incidentPerson.create({
      data: { incidentId: inc.id, role: 'injured', name: 'Ali Hassan', company: 'Kenyalang Scaffolding',
        injuryType: 'Abrasion', bodyPart: 'Forearm', treatment: 'First aid', daysLost: 0, addedBy: 'x' },
    })

    const anon = await db.incident.create({
      data: {
        number: 'INC-S2', companyId: COMPANY, siteId: SITE_B, title: 'Guard removed on conveyor',
        type: 'unsafe_condition', severity: 'near_miss', location: 'Line 2', reporter: 'Secret Person',
        reporterId: 'sum-emp-other', anonymous: true, occurredAt: daysFromNow(-3),
      },
    })
    anonymousId = anon.id

    const action = (code: string, over: object) => db.correctiveAction.create({
      data: { code, companyId: COMPANY, siteId: SITE_A, title: `Action ${code}`, owner: 'Kumar Raj', createdBy: 'itest', dueDate: daysFromNow(5), ...over },
    })
    await action('CA-S1', { incidentId: inc.id, dueDate: daysFromNow(-10) }) // Maintenance, 10 days late
    await action('CA-S2', { incidentId: inc.id, dueDate: daysFromNow(3), owner: 'Faizal Omar' }) // Maintenance, due soon
    await action('CA-S3', { dueDate: daysFromNow(-2), owner: 'Faizal Omar' }) // no department, late
    await action('CA-S4', { siteId: SITE_B, dueDate: daysFromNow(20) }) // other site
    await action('CA-S5', { status: 'completed', completedAt: daysFromNow(-1) }) // closed this week

    /*
     * Held earlier *today in the site's time zone* - the "today" report is cut in site
     * time. This was "an hour ago", which in the first hour after Kuching midnight
     * (16:00-17:00 UTC) is yesterday there, so the test failed every day in that window.
     * Kuching is UTC+8 all year; half the time since its midnight, at most an hour.
     */
    const sinceKuchingMidnight = (Date.now() + 8 * 3600_000) % 86_400_000
    await db.toolboxMeeting.create({
      data: { companyId: COMPANY, siteId: SITE_A, number: 'TBM-S1',
        heldAt: new Date(Date.now() - Math.min(3600_000, sinceKuchingMidnight / 2)),
        ledBy: 'Azlan', topic: 'Tool tethering', headcount: 210, recordedBy: 'x', recordedById: 'x' },
    })
  })

  afterAll(async () => {
    await db.reportRun.deleteMany({ where: { companyId: COMPANY } })
    await db.reportSchedule.deleteMany({ where: { companyId: COMPANY } })
    await db.membership.deleteMany({ where: { companyId: COMPANY } })
    await db.user.deleteMany({ where: { email: { endsWith: '@sum-itest.local' } } })
    await db.toolboxMeeting.deleteMany({ where: { companyId: COMPANY } })
    await db.correctiveAction.deleteMany({ where: { companyId: COMPANY } })
    await db.incidentPerson.deleteMany({ where: { incident: { companyId: COMPANY } } })
    await db.incident.deleteMany({ where: { companyId: COMPANY } })
    await db.site.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.$disconnect()
  })

  describe('weekly corrective actions', () => {
    it('lists every open action by department, overdue first, and says so in words', async () => {
      const r = await reports.preview(hse, COMPANY, 'weekly_actions')
      expect(r.summary).toEqual([
        { label: 'Open actions', value: '4' },
        { label: 'Overdue', value: '2' },
        { label: 'Due next 7 days', value: '1' },
        { label: 'Closed last 7 days', value: '1' },
      ])
      // Maintenance holds an overdue action, so it leads; the unnamed bucket is last.
      expect(r.rows.map((x) => [x.department, x.code])).toEqual([
        ['Maintenance', 'CA-S1'], ['Maintenance', 'CA-S2'],
        ['No department recorded', 'CA-S3'], ['No department recorded', 'CA-S4'],
      ])
      expect(r.rows[0].state).toBe('Overdue 10 days')
      const summary = r.sections?.find((s) => s.title === 'Summary')?.note ?? ''
      expect(summary).toContain('4 corrective actions are open across 2 departments.')
      expect(summary).toContain('2 are overdue; the oldest, CA-S1 "Action CA-S1", owned by Kumar Raj, is 10 days late.')
      const owners = r.sections?.find((s) => s.title === 'Owners with overdue actions')
      expect(owners?.rows?.map((x) => x.owner).sort()).toEqual(['Faizal Omar', 'Kumar Raj'])
    })

    it('narrows to a site when asked', async () => {
      const r = await reports.preview(hse, COMPANY, 'weekly_actions', { siteId: SITE_B })
      expect(r.rows.map((x) => x.code)).toEqual(['CA-S4'])
    })

    it('is refused to roles that cannot run reports', async () => {
      await expect(reports.preview(otherEmp, COMPANY, 'weekly_actions')).rejects.toThrow()
    })
  })

  describe('site activity', () => {
    it('counts the last seven days, including the briefing and the incidents', async () => {
      const r = await reports.preview(officer, COMPANY, 'site_activity', { period: 'week' })
      expect(r.rows.map((x) => x.number).sort()).toEqual(['INC-S1', 'INC-S2'])
      expect(r.summary.find((s) => s.label === 'Toolbox briefed')?.value).toBe('210')
      const note = r.sections?.find((s) => s.title === 'Summary')?.note ?? ''
      expect(note).toContain('In the last 7 days 2 incidents were reported (1 near miss, 1 injury).')
      expect(note).toContain('1 toolbox meeting briefed 210 people.')
      expect(r.periodLabel).toMatch(/ to /)
    })

    it('covers only today when asked for the day', async () => {
      const r = await reports.preview(officer, COMPANY, 'site_activity', { period: 'day' })
      expect(r.title).toBe('Site activity - today')
      // Both incidents happened on earlier days.
      expect(r.rows).toHaveLength(0)
      expect(r.summary.find((s) => s.label === 'Toolbox briefed')?.value).toBe('210')
    })
  })

  describe('the monthly report counts injuries the way the board does', () => {
    it('counts a new-scale injury and lost-time case, not only the legacy types', async () => {
      // Reported since the type/severity split: type says what, severity says how bad.
      await db.incident.create({
        data: {
          number: 'INC-S3', companyId: COMPANY, siteId: SITE_A, title: 'Hand caught in pinch point',
          type: 'injury', severity: 'lost_time_injury', location: 'Workshop', reporter: 'x',
          occurredAt: new Date('2026-02-10T02:00:00.000Z'),
        },
      })
      await db.incident.create({
        data: {
          number: 'INC-S4', companyId: COMPANY, siteId: SITE_A, title: 'Forklift near miss',
          type: 'vehicle', severity: 'near_miss', location: 'Yard', reporter: 'x',
          occurredAt: new Date('2026-02-11T02:00:00.000Z'),
        },
      })
      const r = await reports.preview(hse, COMPANY, 'monthly_summary', { year: 2026, month: 2 })
      const figure = (label: string) => r.summary.find((s) => s.label === label)?.value
      expect(figure('Injuries')).toBe('1')
      expect(figure('Lost time')).toBe('1')
      expect(figure('Near misses')).toBe('1')
    })
  })

  describe('what a PDF leaves on the server', () => {
    const UPLOADS = resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads')
    const pdfsOnDisk = () => (existsSync(UPLOADS) ? readdirSync(UPLOADS).filter((f) => f.endsWith('.pdf')) : [])

    it('keeps no copy of an on-screen download', async () => {
      const before = pdfsOnDisk().length
      // The report "Download PDF" button and the incident summary's, exactly as their routes do it.
      const report = await reports.renderPdf(hse, COMPANY, 'weekly_actions')
      const incident = await renderReportPdf(await summaries.build(hse, incidentId))
      expect(report.pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-')
      expect(incident.bytes.subarray(0, 5).toString()).toBe('%PDF-')
      expect(pdfsOnDisk().length).toBe(before)
    })

    it('still keeps the file of a report run, which History downloads later', async () => {
      const user = await db.user.create({
        data: { email: `run-${Date.now()}@sum-itest.local`, name: 'Recipient', passwordHash: 'x', status: 'active' },
      })
      await db.membership.create({ data: { userId: user.id, companyId: COMPANY, role: 'hse_manager' } })
      const schedule = await reports.createSchedule(hse, COMPANY, {
        name: 'Friday SAIL', reportType: 'weekly_actions', frequency: 'weekly', dayOfWeek: 5,
        timeOfDay: '08:00', timezone: 'Asia/Kuching', recipientUserIds: [user.id],
      })
      await reports.runNow(hse, schedule.id)
      const run = await db.reportRun.findFirstOrThrow({ where: { scheduleId: schedule.id } })
      expect(run.storedName).toBeTruthy()
      expect(existsSync(join(UPLOADS, run.storedName!))).toBe(true)
    })
  })

  describe('the incident summary', () => {
    it('writes the incident up from its record', async () => {
      const r = await summaries.build(hse, incidentId)
      expect(r.title).toBe('Incident summary — INC-S1')
      const note = r.sections?.find((s) => s.title === 'Summary')?.note ?? ''
      expect(note).toContain('INC-S1, an Injury incident of Minor severity, occurred at Pipe rack 3, Site A on ')
      expect(note).toContain('1 person was recorded as involved, 1 injured.')
      expect(note).toContain('The root cause is recorded as: Tools not tethered at height.')
      expect(note).toContain('2 corrective actions raised, 0 completed, 1 overdue.')
      const people = r.sections?.find((s) => s.title === 'People involved')
      expect(people?.rows?.[0]).toMatchObject({ name: 'Ali Hassan', injury: 'Abrasion', body: 'Forearm' })
      expect(r.sections?.find((s) => s.title === 'Investigation')?.rows?.find((x) => x.k === 'Lead investigator')?.v).toBe('Azlan Mahmud')
    })

    it('says what is missing rather than leaving a gap', async () => {
      const r = await summaries.build(hse, anonymousId)
      expect(r.sections?.find((s) => s.title === 'What happened')?.note).toBe('Not yet recorded.')
      expect(r.sections?.find((s) => s.title === 'Summary')?.note).toContain('No root cause has been recorded yet.')
    })

    it('shows nobody more than the incident page would', async () => {
      // The employee who reported it may read it; another employee may not.
      await expect(summaries.build(reporterEmp, incidentId)).resolves.toBeTruthy()
      await expect(summaries.build(otherEmp, incidentId)).rejects.toMatchObject({ status: 403 })
      await expect(summaries.build(outsider, incidentId)).rejects.toMatchObject({ status: 404 })
    })

    it('keeps an anonymous reporter anonymous below HSE manager', async () => {
      const low = await summaries.build(officer, anonymousId)
      expect(JSON.stringify(low)).not.toContain('Secret Person')
      expect(low.sections?.find((s) => s.title === 'Summary')?.note).toContain('reported by an anonymous reporter')

      const high = await summaries.build(hse, anonymousId)
      expect(high.rows.find((x) => x.k === 'Reported')?.v).toContain('Secret Person (filed anonymously)')
    })
  })
})
