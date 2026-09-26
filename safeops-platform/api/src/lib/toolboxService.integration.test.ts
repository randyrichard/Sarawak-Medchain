import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ToolboxService, ToolboxError, type ToolboxInput } from './toolboxService.js'
import { ReportService } from './reportService.js'
import type { Caller } from './incidentService.js'

/**
 * The daily site toolbox meeting, against a REAL PostgreSQL database.
 *
 * What matters here is what a site safety officer and an auditor rely on: a 350-person
 * meeting can be recorded as a headcount per firm, the register answers "which sites held
 * one today" in each site's own timezone, the people who may not see or change it cannot,
 * and the monthly report counts what was recorded.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new ToolboxService(db)

const COMPANY = 'tbm-itest-co'
const SITE_A = 'tbm-itest-site-a' // Asia/Kuching, UTC+8
const SITE_B = 'tbm-itest-site-b' // Asia/Kuching
const SITE_UK = 'tbm-itest-site-uk' // Europe/London - a different calendar day at 00:30 UTC

const as = (role: Caller['roles'][number]['role'], siteIds: string[] = []): Caller => ({
  userId: `tbm-${role}`, name: `ITest ${role}`, roles: [{ companyId: COMPANY, role, siteIds }],
})
const admin = as('admin')
const hse = as('hse_manager')
const officer = as('safety_officer')
const supervisorA = as('supervisor', [SITE_A])
const ceo = as('ceo')
const employee = as('employee')
const outsider: Caller = { userId: 'tbm-out', name: 'Outsider', roles: [{ companyId: 'elsewhere', role: 'admin', siteIds: [] }] }

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

const meeting = (over: Partial<ToolboxInput> = {}): ToolboxInput => ({
  siteId: SITE_A,
  heldAt: minutesAgo(30),
  ledBy: 'Azlan Mahmud',
  topic: 'Working at height on the pipe rack',
  hazards: 'Dropped objects; harness inspection before use',
  groups: [
    { organisation: 'Tbm ITest Co', count: 120 },
    { organisation: 'Kenyalang Scaffolding', count: 180 },
    { organisation: 'Borneo Blasting', count: 50 },
  ],
  ...over,
})

const code = async (p: Promise<unknown>) => {
  const e = await p.catch((err) => err)
  expect(e).toBeInstanceOf(ToolboxError)
  return (e as ToolboxError).code
}

d('ToolboxService — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'Tbm ITest Co' } })
    for (const [id, tz] of [[SITE_A, 'Asia/Kuching'], [SITE_B, 'Asia/Kuching'], [SITE_UK, 'Europe/London']]) {
      await db.site.upsert({
        where: { id }, update: { timezone: tz },
        create: { id, companyId: COMPANY, name: `Site ${id.slice(-2)}`, short: id.slice(-2).toUpperCase(), city: 'Bintulu', timezone: tz },
      })
    }
  })

  afterAll(async () => {
    await db.toolboxMeeting.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.reportRun.deleteMany({ where: { companyId: COMPANY } })
    await db.site.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.toolboxMeeting.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
  })

  describe('recording a meeting', () => {
    it('records a 350-person meeting as a headcount per firm, numbered, and audited', async () => {
      const m = await svc.create(officer, COMPANY, meeting())
      expect(m.number).toMatch(/^TBM-\d+$/)
      expect(m.headcount).toBe(350)
      expect(m.groups.map((g) => [g.organisation, g.count])).toEqual([
        ['Kenyalang Scaffolding', 180], ['Tbm ITest Co', 120], ['Borneo Blasting', 50],
      ])
      expect(m.recordedBy).toBe('ITest safety_officer')

      const audit = await db.adminAuditEntry.findMany({ where: { companyId: COMPANY, module: 'toolbox' } })
      expect(audit.map((a) => a.action)).toEqual(['toolbox_recorded'])
    })

    it('numbers meetings in sequence', async () => {
      const a = await svc.create(officer, COMPANY, meeting())
      const b = await svc.create(officer, COMPANY, meeting({ siteId: SITE_B }))
      expect(Number(b.number.slice(4))).toBe(Number(a.number.slice(4)) + 1)
    })

    it('merges the same firm entered twice rather than refusing it', async () => {
      const m = await svc.create(officer, COMPANY, meeting({
        groups: [{ organisation: 'Kenyalang Scaffolding', count: 100 }, { organisation: ' kenyalang scaffolding ', count: 20 }],
      }))
      expect(m.groups).toHaveLength(1)
      expect(m.headcount).toBe(120)
    })

    it('refuses a meeting that is incomplete, impossible, or in the future', async () => {
      expect(await code(svc.create(officer, COMPANY, meeting({ topic: '  ' })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ ledBy: '' })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ groups: [] })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ groups: [{ organisation: 'X', count: 0 }] })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ groups: [{ organisation: 'X', count: 2.5 }] })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ groups: [{ organisation: '', count: 10 }] })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ heldAt: new Date(Date.now() + 3 * 3600_000).toISOString() })))).toBe('validation')
      expect(await code(svc.create(officer, COMPANY, meeting({ siteId: 'not-a-site' })))).toBe('validation')
      expect(await db.toolboxMeeting.count({ where: { companyId: COMPANY } })).toBe(0)
    })
  })

  describe('who may do what', () => {
    it('lets the people who run the briefing record it', async () => {
      for (const who of [admin, hse, officer, supervisorA]) {
        await expect(svc.create(who, COMPANY, meeting())).resolves.toBeTruthy()
      }
    })

    it('lets the executive read the register but not write to it', async () => {
      await svc.create(officer, COMPANY, meeting())
      expect((await svc.list(ceo, { companyId: COMPANY, page: 1, pageSize: 25 })).total).toBe(1)
      expect(await code(svc.create(ceo, COMPANY, meeting()))).toBe('forbidden')
    })

    it('keeps the register from employees and other tenants', async () => {
      const m = await svc.create(officer, COMPANY, meeting())
      expect(await code(svc.list(employee, { companyId: COMPANY, page: 1, pageSize: 25 }))).toBe('forbidden')
      expect(await code(svc.get(employee, COMPANY, m.id))).toBe('forbidden')
      expect(await code(svc.today(employee, COMPANY))).toBe('forbidden')
      expect(await code(svc.list(outsider, { companyId: COMPANY, page: 1, pageSize: 25 }))).toBe('forbidden')
      expect(await code(svc.get(outsider, COMPANY, m.id))).toBe('forbidden')
    })

    it('holds a site-restricted supervisor to their own sites', async () => {
      const other = await svc.create(officer, COMPANY, meeting({ siteId: SITE_B }))
      await svc.create(officer, COMPANY, meeting({ siteId: SITE_A }))

      expect(await code(svc.create(supervisorA, COMPANY, meeting({ siteId: SITE_B })))).toBe('forbidden')
      const seen = await svc.list(supervisorA, { companyId: COMPANY, page: 1, pageSize: 25 })
      expect(seen.rows.map((r) => r.siteId)).toEqual([SITE_A])
      // Filtering to a site they are not on shows nothing, rather than widening the scope.
      expect((await svc.list(supervisorA, { companyId: COMPANY, page: 1, pageSize: 25, siteId: SITE_B })).total).toBe(0)
      expect(await code(svc.get(supervisorA, COMPANY, other.id))).toBe('not_found')
      expect((await svc.today(supervisorA, COMPANY)).sites.map((s) => s.siteId)).toEqual([SITE_A])
    })

    it('reserves deleting a record to managers, and audits it', async () => {
      const m = await svc.create(officer, COMPANY, meeting())
      expect(await code(svc.remove(officer, COMPANY, m.id))).toBe('forbidden')
      expect(await code(svc.remove(supervisorA, COMPANY, m.id))).toBe('forbidden')
      await svc.remove(hse, COMPANY, m.id)
      expect(await db.toolboxMeeting.count({ where: { id: m.id } })).toBe(0)
      expect(await db.toolboxAttendanceGroup.count({ where: { meetingId: m.id } })).toBe(0)
      const actions = (await db.adminAuditEntry.findMany({ where: { companyId: COMPANY, module: 'toolbox' } })).map((a) => a.action)
      expect(actions).toContain('toolbox_deleted')
    })
  })

  describe('correcting a record', () => {
    it('replaces the attendance rather than adding to it', async () => {
      const m = await svc.create(officer, COMPANY, meeting())
      const fixed = await svc.update(officer, COMPANY, m.id, meeting({
        groups: [{ organisation: 'Kenyalang Scaffolding', count: 175 }],
      }))
      expect(fixed.headcount).toBe(175)
      expect(fixed.groups).toHaveLength(1)
      expect(await db.toolboxAttendanceGroup.count({ where: { meetingId: m.id } })).toBe(1)
      expect(fixed.number).toBe(m.number)
    })
  })

  describe('the register', () => {
    it('filters by date and finds by topic, leader or number', async () => {
      const old = await svc.create(officer, COMPANY, meeting({ heldAt: '2026-03-02T00:00:00.000Z', topic: 'Confined space rescue' }))
      await svc.create(officer, COMPANY, meeting())
      const march = await svc.list(officer, { companyId: COMPANY, page: 1, pageSize: 25, from: '2026-03-01', to: '2026-03-31' })
      expect(march.rows.map((r) => r.id)).toEqual([old.id])
      expect((await svc.list(officer, { companyId: COMPANY, page: 1, pageSize: 25, q: 'confined' })).total).toBe(1)
      expect((await svc.list(officer, { companyId: COMPANY, page: 1, pageSize: 25, q: old.number })).total).toBe(1)
      expect((await svc.list(officer, { companyId: COMPANY, page: 1, pageSize: 25, q: 'azlan' })).total).toBe(2)
    })

    it('offers the workspace, its contractors and firms already used as organisations', async () => {
      await svc.create(officer, COMPANY, meeting())
      const orgs = await svc.organisations(officer, COMPANY)
      expect(orgs[0]).toBe('Tbm ITest Co')
      expect(orgs).toEqual(expect.arrayContaining(['Kenyalang Scaffolding', 'Borneo Blasting']))
      expect(new Set(orgs.map((o) => o.toLowerCase())).size).toBe(orgs.length)
    })
  })

  describe('which sites held one today', () => {
    it('answers per site, in each site\'s own calendar day', async () => {
      // 00:30 UTC on 10 June is 08:30 on the 10th in Kuching and 01:30 on the 10th in London.
      const now = new Date('2026-06-10T00:30:00.000Z')
      // 07:30 Kuching on the 10th = 23:30 UTC on the 9th. Today for Kuching, not "yesterday".
      await db.toolboxMeeting.create({
        data: {
          companyId: COMPANY, siteId: SITE_A, number: 'TBM-T1', heldAt: new Date('2026-06-09T23:30:00.000Z'),
          ledBy: 'A', topic: 'Kuching morning', headcount: 90, recordedBy: 'x', recordedById: 'x',
        },
      })
      // 23:00 London on the 9th = 22:00 UTC on the 9th: yesterday in London.
      await db.toolboxMeeting.create({
        data: {
          companyId: COMPANY, siteId: SITE_UK, number: 'TBM-T2', heldAt: new Date('2026-06-09T22:00:00.000Z'),
          ledBy: 'B', topic: 'London late shift', headcount: 12, recordedBy: 'x', recordedById: 'x',
        },
      })

      const today = await svc.today(officer, COMPANY, now)
      const by = Object.fromEntries(today.sites.map((s) => [s.siteId, s]))
      expect(by[SITE_A]).toMatchObject({ held: true, headcount: 90, date: '2026-06-10' })
      expect(by[SITE_B]).toMatchObject({ held: false, headcount: 0 })
      expect(by[SITE_UK]).toMatchObject({ held: false, date: '2026-06-10' })
      expect(today).toMatchObject({ held: 1, total: 3, headcount: 90 })
    })
  })

  describe('the monthly report', () => {
    it('counts the meetings held and the people briefed', async () => {
      await svc.create(officer, COMPANY, meeting({ heldAt: '2026-05-05T00:00:00.000Z' }))
      await svc.create(officer, COMPANY, meeting({ heldAt: '2026-05-06T00:00:00.000Z', siteId: SITE_B, groups: [{ organisation: 'X', count: 50 }] }))
      await svc.create(officer, COMPANY, meeting({ heldAt: '2026-06-02T00:00:00.000Z' })) // next month

      const reports = new ReportService(db)
      const r = await reports.preview(hse, COMPANY, 'monthly_summary', { year: 2026, month: 5 })
      const section = r.sections?.find((s) => s.title === '8. Toolbox meetings')
      expect(section?.stats).toEqual([
        { label: 'Meetings held', value: '2' },
        { label: 'Total attendance', value: '400' },
        { label: 'Average attendance', value: '200' },
      ])
      expect(section?.note).toContain('Held on 2 of')
    })
  })
})
