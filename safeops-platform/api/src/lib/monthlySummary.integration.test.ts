import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ReportService } from './reportService.js'
import { IncidentService, type Caller } from './incidentService.js'

/**
 * The monthly safety summary, against a REAL PostgreSQL database.
 *
 * The two older report types answer "what is owed right now", so they have no period and
 * nothing to get wrong about one. This one covers a closed calendar month, and almost
 * every way it can be wrong is a boundary: an incident counted in the wrong month, counted
 * twice, or dropped between two reports that are each certain they are complete.
 *
 * The month is cut in the workspace's own timezone, and that is the part most likely to be
 * "simplified" later by somebody who sees Date.UTC beside it and assumes the two agree.
 * They do not. In Asia/Kuching a local month begins at 16:00 UTC the previous day, so a
 * UTC cut moves the first eight hours of every month into the previous report - and
 * nothing about the output would look wrong, which is what makes it worth a test that
 * fails loudly.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const reports = new ReportService(db)
const incidents = new IncidentService(db)

const COMPANY = 'ms-itest-co'
const SITE = 'ms-itest-site'
const SITE_B = 'ms-itest-site-b'
/** UTC+8, no daylight saving - so every offset below is arithmetic, not a guess. */
const TZ = 'Asia/Kuching'

const admin: Caller = {
  userId: 'ms-admin', name: 'ITest Admin',
  roles: [{ companyId: COMPANY, role: 'admin' as never, siteIds: [] }],
}

/**
 * Mid-October 2026, so the last complete month is unambiguously September.
 *
 * Only Date is faked. Faking every timer stalls the driver's own connection handling, and
 * a test that hangs teaches nobody anything.
 */
const NOW = new Date('2026-10-15T04:00:00.000Z')

let seq = 0
async function incidentAt(occurredAt: string, over: Record<string, unknown> = {}) {
  seq += 1
  return incidents.create(admin, {
    companyId: COMPANY, siteId: SITE, title: `Monthly itest ${seq}`,
    type: 'near_miss', severity: 'Minor', location: 'Workshop', occurredAt, ...over,
  } as never)
}

async function purge() {
  await db.correctiveAction.deleteMany({ where: { companyId: COMPANY } })
  await db.incidentEvent.deleteMany({ where: { incident: { companyId: COMPANY } } })
  await db.incident.deleteMany({ where: { companyId: COMPANY } })
  await db.notification.deleteMany({ where: { companyId: COMPANY } })
}

beforeAll(async () => {
  if (!hasDb) return
  await db.company.upsert({
    where: { id: COMPANY },
    update: {},
    create: { id: COMPANY, name: 'Monthly ITest Sdn Bhd', industry: 'Manufacturing', plan: 'premium' },
  })
  for (const [id, name] of [[SITE, 'Kuching Plant'], [SITE_B, 'Bintulu Plant']]) {
    await db.site.upsert({
      where: { id },
      update: { timezone: TZ },
      create: { id, companyId: COMPANY, name, short: name.slice(0, 6).toUpperCase(), city: '', timezone: TZ },
    })
  }
})

afterAll(async () => {
  if (!hasDb) return
  await purge()
  await db.site.deleteMany({ where: { companyId: COMPANY } })
  await db.company.deleteMany({ where: { id: COMPANY } })
  await db.$disconnect()
})

beforeEach(async () => {
  if (!hasDb) return
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await purge()
})

d('monthly safety summary', () => {
  it('covers the month that has finished, not the one in progress', async () => {
    /*
     * A summary of a running month gives two readings that disagree - one taken on the
     * 20th, one on the 3rd - and only the later one is a document anybody can file.
     */
    await incidentAt('2026-09-10T02:00:00.000Z') // September, in period
    await incidentAt('2026-10-10T02:00:00.000Z') // October, still running

    const data = await reports.preview(admin, COMPANY, 'monthly_summary')

    expect(data.title).toContain('September 2026')
    expect(data.rows).toHaveLength(1)
    expect(data.summary.find((s) => s.label === 'Incidents')?.value).toBe('1')
  })

  it('cuts the month in the site timezone, not in UTC', async () => {
    /*
     * The test this file exists for. Every instant below is within eight hours of a
     * boundary, which is exactly the window a UTC cut gets wrong:
     *
     *   15:59Z on 31 Aug = 23:59 local, 31 Aug -> August, excluded
     *   16:00Z on 31 Aug = 00:00 local,  1 Sep -> September, included
     *   15:59Z on 30 Sep = 23:59 local, 30 Sep -> September, included
     *   16:00Z on 30 Sep = 00:00 local,  1 Oct -> October, excluded
     *
     * Cut in UTC instead, the first and last would swap sides and the report would still
     * look entirely reasonable.
     */
    const justBeforeStart = await incidentAt('2026-08-31T15:59:00.000Z')
    const firstMoment = await incidentAt('2026-08-31T16:00:00.000Z')
    const lastMoment = await incidentAt('2026-09-30T15:59:00.000Z')
    const justAfterEnd = await incidentAt('2026-09-30T16:00:00.000Z')

    const data = await reports.preview(admin, COMPANY, 'monthly_summary')
    const numbers = data.rows.map((r) => r.number)

    expect(numbers).toContain(firstMoment.number)
    expect(numbers).toContain(lastMoment.number)
    expect(numbers).not.toContain(justBeforeStart.number)
    expect(numbers).not.toContain(justAfterEnd.number)
    expect(data.rows).toHaveLength(2)
  })

  it('leaves no gap and no overlap between consecutive months', async () => {
    /*
     * The half-open range stated as a property rather than as two boundary cases: the
     * instant one month ends is the instant the next begins, so an incident there belongs
     * to exactly one report. A closed range would file it in both; an off-by-one would
     * file it in neither, and nobody notices a row that is simply never reported.
     */
    const onTheSeam = await incidentAt('2026-09-30T16:00:00.000Z')

    const september = await reports.preview(admin, COMPANY, 'monthly_summary')
    vi.setSystemTime(new Date('2026-11-15T04:00:00.000Z'))
    const october = await reports.preview(admin, COMPANY, 'monthly_summary')

    const inSeptember = september.rows.some((r) => r.number === onTheSeam.number)
    const inOctober = october.rows.some((r) => r.number === onTheSeam.number)
    expect([inSeptember, inOctober]).toEqual([false, true])
  })

  it('rolls back over the new year', async () => {
    // January's report covers the previous December, which is the one month where the
    // year has to change too - and the arithmetic for it is a separate branch.
    vi.setSystemTime(new Date('2027-01-15T04:00:00.000Z'))
    const inDecember = await incidentAt('2026-12-10T02:00:00.000Z')
    await incidentAt('2027-01-05T02:00:00.000Z')

    const data = await reports.preview(admin, COMPANY, 'monthly_summary')

    expect(data.title).toContain('December 2026')
    expect(data.rows.map((r) => r.number)).toEqual([inDecember.number])
  })

  it('counts what a month cost without inventing a rate', async () => {
    /*
     * Counts, never a frequency rate. An LTIFR needs hours worked, which this product does
     * not hold, and one derived from a headcount guess is a compliance number somebody
     * would put in front of a regulator.
     */
    await incidentAt('2026-09-02T02:00:00.000Z', { type: 'lti', severity: 'Serious' })
    await incidentAt('2026-09-03T02:00:00.000Z', { type: 'mtc', severity: 'Moderate' })
    await incidentAt('2026-09-04T02:00:00.000Z', { type: 'near_miss' })
    await incidentAt('2026-09-05T02:00:00.000Z', { type: 'near_miss' })

    const data = await reports.preview(admin, COMPANY, 'monthly_summary')
    const tile = (label: string) => data.summary.find((s) => s.label === label)?.value

    expect(tile('Incidents')).toBe('4')
    expect(tile('Lost time')).toBe('1')
    // Lost time is an injury too, so the injury count includes it rather than excluding it.
    expect(tile('Injuries')).toBe('2')
    expect(tile('Near misses')).toBe('2')

    const labels = data.summary.map((s) => s.label).join(' ')
    expect(labels).not.toMatch(/LTIFR|TRIR|frequency rate|recordable/i)
  })

  it('states the period and the zone it was cut in', async () => {
    /*
     * A page read a year after it was filed has to say what it covers. The zone is named
     * because the same month means different instants in different ones, and a reader
     * reconciling this against another system needs to know which was used.
     */
    const data = await reports.preview(admin, COMPANY, 'monthly_summary')

    expect(data.periodLabel).toContain('September 2026')
    expect(data.periodLabel).toContain('30')
    expect(data.periodLabel).toContain(TZ)
    expect(data.periodStart?.toISOString()).toBe('2026-08-31T16:00:00.000Z')
    expect(data.periodEnd.toISOString()).toBe('2026-09-30T16:00:00.000Z')
  })

  it('reports one site without the other', async () => {
    // Same tenant, different sites. A site-scoped report that quietly widened would put
    // another plant's incidents in a manager's month-end pack.
    const here = await incidentAt('2026-09-08T02:00:00.000Z')
    await incidentAt('2026-09-09T02:00:00.000Z', { siteId: SITE_B })

    const data = await reports.preview(admin, COMPANY, 'monthly_summary', { siteId: SITE })

    expect(data.rows.map((r) => r.number)).toEqual([here.number])
    expect(data.siteName).toBe('Kuching Plant')
  })

  it('says a quiet month was quiet, rather than failing', async () => {
    /*
     * An empty month is a legitimate answer and must not read as an error - but it must
     * not read as praise either. Nothing recorded is either a genuinely quiet month or one
     * where nobody filed anything, and the report cannot tell which.
     */
    const data = await reports.preview(admin, COMPANY, 'monthly_summary')

    expect(data.rows).toHaveLength(0)
    expect(data.emptyMessage).toMatch(/no incidents were recorded/i)
    expect(data.emptyMessage).not.toMatch(/well done|good|congratul|safe month/i)
  })

  it('counts actions raised and closed within the same month', async () => {
    const parent = await incidentAt('2026-09-06T02:00:00.000Z')
    await incidents.addAction(admin, parent.id, {
      title: 'Fit a guard', owner: 'ITest Owner', dueDate: '2026-09-20',
    } as never)

    const data = await reports.preview(admin, COMPANY, 'monthly_summary')

    // Raised in September, not yet closed - so the tile reads "0 of 1" rather than
    // implying the month finished what it started.
    expect(data.summary.find((s) => s.label === 'Actions closed')?.value).toBe('0 of 1')
  })
})

d('project scope and month selection', () => {
  it('reports only the sites in the named project', async () => {
    /*
     * The whole point of the hierarchy. SITE is in the project, SITE_B is not, so a report
     * for the project must not carry SITE_B's incidents under the project's name.
     */
    const project = await db.project.create({
      data: { companyId: COMPANY, name: `Proj ${Date.now()}`, status: 'active' },
    })
    await db.site.update({ where: { id: SITE }, data: { projectId: project.id } })

    const inProject = await incidentAt('2026-09-04T02:00:00.000Z')
    await incidentAt('2026-09-05T02:00:00.000Z', { siteId: SITE_B })

    const data = await reports.preview(admin, COMPANY, 'monthly_summary',
      { projectId: project.id })

    expect(data.rows.map((r) => r.number)).toEqual([inProject.number])
    expect(data.projectName).toBe(project.name)

    await db.site.update({ where: { id: SITE }, data: { projectId: null } })
    await db.project.delete({ where: { id: project.id } })
  })

  it('reports nothing rather than everything for a project with no sites', async () => {
    /*
     * The dangerous default. Dropping an empty site filter would widen the report to the
     * whole company and print another job's incidents under this project's heading - which
     * reads as perfectly normal output.
     */
    const empty = await db.project.create({
      data: { companyId: COMPANY, name: `Empty ${Date.now()}`, status: 'planned' },
    })
    await incidentAt('2026-09-06T02:00:00.000Z')

    const data = await reports.preview(admin, COMPANY, 'monthly_summary',
      { projectId: empty.id })

    expect(data.rows).toHaveLength(0)
    await db.project.delete({ where: { id: empty.id } })
  })

  it('refuses a project belonging to another company', async () => {
    // Indistinguishable from one that does not exist, so the endpoint cannot be used to
    // find out which project ids are real elsewhere on the deployment.
    const other = await db.company.upsert({
      where: { id: 'ms-itest-other' }, update: {},
      create: { id: 'ms-itest-other', name: 'Other', industry: 'x', plan: 'standard' },
    })
    const theirs = await db.project.create({
      data: { companyId: other.id, name: `Theirs ${Date.now()}`, status: 'active' },
    })

    await expect(reports.preview(admin, COMPANY, 'monthly_summary', { projectId: theirs.id }))
      .rejects.toThrow(/Unknown project/i)

    await db.project.delete({ where: { id: theirs.id } })
    await db.company.delete({ where: { id: other.id } })
  })

  it('reports a month somebody names, not only the last one', async () => {
    // For the manager who missed a month, or is assembling a year of them.
    const july = await incidentAt('2026-07-10T02:00:00.000Z')
    await incidentAt('2026-09-10T02:00:00.000Z')

    const data = await reports.preview(admin, COMPANY, 'monthly_summary',
      { month: 7, year: 2026 })

    expect(data.title).toContain('July 2026')
    expect(data.rows.map((r) => r.number)).toEqual([july.number])
  })

  it('refuses a month that is not a month', async () => {
    // Clamping would produce a document with the wrong period printed on its face.
    await expect(reports.preview(admin, COMPANY, 'monthly_summary', { month: 13, year: 2026 }))
      .rejects.toThrow(/between 1 and 12/i)
    await expect(reports.preview(admin, COMPANY, 'monthly_summary', { month: 6, year: 1200 }))
      .rejects.toThrow(/out of range/i)
  })
})

d('the report as a document', () => {
  it('carries the management sections in order', async () => {
    const data = await reports.preview(admin, COMPANY, 'monthly_summary')
    const titles = (data.sections ?? []).map((x) => x.title)

    expect(titles[0]).toMatch(/executive summary/i)
    expect(titles.join(' ')).toMatch(/incident summary/i)
    expect(titles.join(' ')).toMatch(/corrective action/i)
    expect(titles.join(' ')).toMatch(/permit to work/i)
    expect(titles.join(' ')).toMatch(/site performance/i)
    // The last section is space for the manager to sign off in.
    expect(titles[titles.length - 1]).toMatch(/management comments/i)
    expect(data.sections?.[data.sections.length - 1].writeIn).toBeGreaterThan(0)
  })

  it('says safety observations are not recorded rather than reporting zero', async () => {
    /*
     * The honesty rule, as a test. SafeOps has no proactive observation module, and
     * "0 safety observations" would be a claim about the month rather than about the
     * product - a figure a manager could repeat to a regulator.
     */
    const data = await reports.preview(admin, COMPANY, 'monthly_summary')
    const section = (data.sections ?? []).find((x) => /safety observations/i.test(x.title))

    expect(section).toBeTruthy()
    expect(section?.unavailable).toMatch(/does not currently record/i)
    expect(section?.stats).toBeUndefined()
  })

  it('never publishes a frequency rate', async () => {
    // An LTIFR or TRIR needs hours worked, which this product does not hold.
    await incidentAt('2026-09-02T02:00:00.000Z', { type: 'lti', severity: 'Serious' })
    const data = await reports.preview(admin, COMPANY, 'monthly_summary')

    const everything = JSON.stringify(data)
    expect(everything).not.toMatch(/LTIFR|TRIR|frequency rate/i)
  })

  it('says N/A rather than 0% when there is nothing to divide by', async () => {
    // A month with no actions raised has no completion rate, and "0%" would read as a
    // failure to close anything rather than as nothing to close.
    const data = await reports.preview(admin, COMPANY, 'monthly_summary')
    const actions = (data.sections ?? []).find((x) => /corrective action/i.test(x.title))

    expect(actions?.stats?.find((v) => /closed vs raised/i.test(v.label))?.value).toBe('N/A')
  })

  it('builds every section for a month with nothing in it', async () => {
    /*
     * An empty month is the first thing a new pilot customer will generate, and a report
     * that throws or renders half a document then is the worst possible first impression.
     */
    const data = await reports.preview(admin, COMPANY, 'monthly_summary',
      { month: 3, year: 2026 })

    expect(data.rows).toHaveLength(0)
    expect(data.sections).toHaveLength(13)
    expect(data.sections?.every((x) =>
      x.note || x.stats || x.rows || x.unavailable || x.writeIn)).toBe(true)
  })
})
