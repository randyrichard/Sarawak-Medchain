import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { OrgAdminService } from './orgAdminService.js'
import type { Caller } from '../domain/caller.js'

/**
 * Projects and the site hierarchy, against a REAL PostgreSQL database.
 *
 * A project is a new place to hang a tenant's data off, which makes it a new place to get
 * tenant isolation wrong. Most of what follows is therefore about the boundary rather than
 * about projects: reading another company's project, moving a site under it, and the two
 * ways an id from elsewhere can be smuggled in - as the thing being edited, and as the
 * thing being pointed at.
 *
 * The second theme is that projects arrived years after the records they group. A site
 * without a project has to keep working, a project must never be able to delete a site's
 * incidents, and nothing here may require an existing workspace to be migrated.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new OrgAdminService(db)

const CO = 'pj-itest-co'
const OTHER = 'pj-itest-other'
const SITE = 'pj-itest-site'
const SITE2 = 'pj-itest-site2'
const OTHER_SITE = 'pj-itest-other-site'

const ctx = { ip: '10.0.0.1', device: 'vitest' }

const caller = (role: string, id: string, companyId = CO): Caller => ({
  userId: `pj-${id}`, name: `PJ ${id}`,
  roles: [{ companyId, role: role as never, siteIds: [] }],
})

const admin = caller('admin', 'admin')
const hse = caller('hse_manager', 'hse')
const officer = caller('safety_officer', 'officer')
const employee = caller('employee', 'emp')
/** An administrator - of a different company. Every isolation test below is theirs. */
const outsider = caller('admin', 'outsider', OTHER)

let seq = 0
const name = (p: string) => { seq += 1; return `${p} ${Date.now().toString(36)}${seq}` }

const makeProject = (over: Record<string, unknown> = {}) =>
  svc.createProject(admin, CO, ctx, { name: name('Project'), ...over } as never)

beforeAll(async () => {
  if (!hasDb) return
  for (const [id, label] of [[CO, 'Projects ITest'], [OTHER, 'Other ITest']]) {
    await db.company.upsert({
      where: { id }, update: {},
      create: { id, name: label, industry: 'Construction', plan: 'premium' },
    })
  }
  for (const [id, companyId, label] of [
    [SITE, CO, 'Site One'], [SITE2, CO, 'Site Two'], [OTHER_SITE, OTHER, 'Other Site'],
  ]) {
    await db.site.upsert({
      where: { id }, update: { projectId: null },
      create: { id, companyId, name: label, short: 'S', city: '' },
    })
  }
})

afterAll(async () => {
  if (!hasDb) return
  await db.site.updateMany({ where: { companyId: { in: [CO, OTHER] } }, data: { projectId: null } })
  await db.project.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
  await db.adminAuditEntry.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
  await db.site.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
  await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
  await db.$disconnect()
})

beforeEach(async () => {
  if (!hasDb) return
  await db.site.updateMany({ where: { companyId: { in: [CO, OTHER] } }, data: { projectId: null } })
  await db.project.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
  await db.adminAuditEntry.deleteMany({ where: { companyId: { in: [CO, OTHER] } } })
})

d('projects', () => {
  it('creates one, and starts it as planned rather than active', async () => {
    // A project that exists is not a project that has started. Defaulting to active would
    // put a job on every dashboard the moment somebody typed its name in.
    const p = await makeProject({ code: 'PRJ-01', client: 'Petronas' })

    expect(p.companyId).toBe(CO)
    expect(p.status).toBe('planned')
    expect(p.code).toBe('PRJ-01')
    expect(p.client).toBe('Petronas')
  })

  it('edits one, and records each field that actually moved', async () => {
    const p = await makeProject({ code: 'PRJ-02' })
    await svc.updateProject(admin, CO, ctx, p.id, { status: 'active', client: 'Shell' })

    const after = await db.project.findUniqueOrThrow({ where: { id: p.id } })
    expect(after.status).toBe('active')
    expect(after.client).toBe('Shell')

    // The trail says what changed, not merely that something did.
    const trail = await db.adminAuditEntry.findMany({ where: { companyId: CO } })
    const actions = trail.map((e) => e.action)
    expect(actions).toContain('Changed project status')
    expect(actions).toContain('Changed project client')
    // The code did not move, so nothing should claim it did.
    expect(actions).not.toContain('Changed project code')
  })

  it('refuses a duplicate name, and a duplicate code', async () => {
    const p = await makeProject({ code: 'PRJ-03' })
    await expect(svc.createProject(admin, CO, ctx, { name: p.name })).rejects.toThrow(/already exists/i)
    await expect(svc.createProject(admin, CO, ctx, { name: name('Other'), code: 'PRJ-03' }))
      .rejects.toThrow(/already uses code/i)
  })

  it('lets more than one project have no code', async () => {
    /*
     * The unique index is on (companyId, code) and Postgres treats '' as a value, not as
     * absent - so without the blank check a second uncoded project would be refused by a
     * constraint violation nobody could act on.
     */
    await makeProject()
    await expect(makeProject()).resolves.toBeTruthy()
  })

  it('refuses an end date before the start date', async () => {
    await expect(makeProject({ startDate: '2026-06-01', endDate: '2026-05-01' }))
      .rejects.toThrow(/end date cannot be before/i)
  })

  it('refuses a manager who is not a member of the workspace', async () => {
    // Otherwise a project could name anybody with an account on the deployment, which is a
    // membership oracle as well as wrong.
    await expect(makeProject({ managerUserId: 'pj-not-a-member' }))
      .rejects.toThrow(/not a member/i)
  })
})

d('archiving a project', () => {
  it('cancels rather than deletes, and keeps the sites attached', async () => {
    /*
     * The property that matters most in this file. A site carries incidents, permits,
     * assets and employees; if archiving a project detached or deleted its sites, a
     * convenience link added years later would erase a safety history.
     */
    const p = await makeProject()
    await svc.assignSiteToProject(admin, CO, ctx, SITE, p.id)

    const result = await svc.archiveProject(admin, CO, ctx, p.id)

    expect(result.status).toBe('cancelled')
    expect(result.sitesRetained).toBe(1)
    const site = await db.site.findUniqueOrThrow({ where: { id: SITE } })
    expect(site.projectId).toBe(p.id)
    await expect(db.project.findUnique({ where: { id: p.id } })).resolves.toBeTruthy()
  })

  it('is safe to repeat', async () => {
    const p = await makeProject()
    await svc.archiveProject(admin, CO, ctx, p.id)
    await expect(svc.archiveProject(admin, CO, ctx, p.id)).resolves.toMatchObject({
      status: 'cancelled',
    })
  })

  it('cannot orphan a site by deleting the project row underneath it', async () => {
    /*
     * Belt and braces, at the database rather than in the service: Site.projectId is
     * ON DELETE SET NULL, so even a direct delete leaves the site - and everything hanging
     * off it - intact. A cascade here would be catastrophic and silent.
     */
    const p = await makeProject()
    await svc.assignSiteToProject(admin, CO, ctx, SITE, p.id)

    await db.project.delete({ where: { id: p.id } })

    const site = await db.site.findUnique({ where: { id: SITE } })
    expect(site).toBeTruthy()
    expect(site?.projectId).toBeNull()
  })
})

d('the project/site relationship', () => {
  it('holds several sites, and reports them', async () => {
    const p = await makeProject()
    await svc.assignSiteToProject(admin, CO, ctx, SITE, p.id)
    await svc.assignSiteToProject(admin, CO, ctx, SITE2, p.id)

    const listed = (await svc.listProjects(admin, CO)).find((x) => x.id === p.id)
    expect(listed?.siteCount).toBe(2)
    expect(listed?.sites.map((s) => s.id).sort()).toEqual([SITE, SITE2].sort())
  })

  it('detaches a site without touching the site itself', async () => {
    const p = await makeProject()
    await svc.assignSiteToProject(admin, CO, ctx, SITE, p.id)
    await svc.assignSiteToProject(admin, CO, ctx, SITE, null)

    const site = await db.site.findUniqueOrThrow({ where: { id: SITE } })
    expect(site.projectId).toBeNull()
    expect(site.name).toBe('Site One')
    expect(site.active).toBe(true)
  })

  it('leaves a site with no project perfectly usable', async () => {
    /*
     * Every site in every existing workspace is in this state, and will stay there unless
     * somebody opts in. If an unassigned site were a broken state, this feature would
     * silently require a migration of every tenant.
     */
    const site = await db.site.findUniqueOrThrow({ where: { id: SITE2 } })
    expect(site.projectId).toBeNull()
    expect(site.active).toBe(true)
  })
})

d('tenant isolation', () => {
  it('does not list the projects of another company', async () => {
    await makeProject()
    expect(await svc.listProjects(outsider, OTHER)).toHaveLength(0)
  })

  it('answers 404, not 403, for a project belonging to another company', async () => {
    /*
     * Indistinguishable from one that does not exist, deliberately. A 403 confirms the id
     * is real, which turns the endpoint into a way to enumerate other customers' projects
     * one guess at a time.
     */
    const mine = await makeProject()

    await expect(svc.updateProject(outsider, OTHER, ctx, mine.id, { name: 'Stolen' }))
      .rejects.toMatchObject({ code: 'not_found', status: 404 })
    await expect(svc.archiveProject(outsider, OTHER, ctx, mine.id))
      .rejects.toMatchObject({ code: 'not_found', status: 404 })

    // And it really was left alone.
    const after = await db.project.findUniqueOrThrow({ where: { id: mine.id } })
    expect(after.name).toBe(mine.name)
    expect(after.status).toBe('planned')
  })

  it('refuses to file a site under a project from another company', async () => {
    /*
     * The subtler direction: the site is the caller's own, so a check on the site alone
     * passes. It is the *target* that belongs to somebody else, and without a tenant check
     * on it an administrator could hang their site off a stranger's project - and with it
     * every incident that site carries.
     */
    const theirs = await svc.createProject(outsider, OTHER, ctx, { name: name('Theirs') })

    await expect(svc.assignSiteToProject(admin, CO, ctx, SITE, theirs.id))
      .rejects.toMatchObject({ code: 'not_found', status: 404 })

    const site = await db.site.findUniqueOrThrow({ where: { id: SITE } })
    expect(site.projectId).toBeNull()
  })

  it('refuses to move a site from another company into its own project', async () => {
    // The same guard from the other side: the project is mine, the site is not.
    const mine = await makeProject()
    await expect(svc.assignSiteToProject(admin, CO, ctx, OTHER_SITE, mine.id))
      .rejects.toMatchObject({ status: 404 })
  })

  it('treats an invented id the same as one from another tenant', async () => {
    for (const id of ['does-not-exist', '../../etc/passwd', '00000000-0000-0000-0000-000000000000']) {
      await expect(svc.updateProject(admin, CO, ctx, id, { name: 'x' }), id)
        .rejects.toMatchObject({ status: 404 })
    }
  })
})

d('permissions', () => {
  it('lets anybody in the workspace read the project list', async () => {
    /*
     * Deliberately wider than the site and department lists beside it. A project is the top
     * of the filter everybody works in; gating the names to administrators would leave a
     * safety officer filtering by an id they cannot resolve.
     */
    await makeProject()
    for (const who of [hse, officer, employee]) {
      expect((await svc.listProjects(who, CO)).length).toBe(1)
    }
  })

  it('lets only an administrator write one', async () => {
    const p = await makeProject()
    for (const who of [hse, officer, employee]) {
      await expect(svc.createProject(who, CO, ctx, { name: name('Nope') }))
        .rejects.toMatchObject({ code: 'forbidden', status: 403 })
      await expect(svc.updateProject(who, CO, ctx, p.id, { status: 'active' }))
        .rejects.toMatchObject({ code: 'forbidden', status: 403 })
      await expect(svc.archiveProject(who, CO, ctx, p.id))
        .rejects.toMatchObject({ code: 'forbidden', status: 403 })
      await expect(svc.assignSiteToProject(who, CO, ctx, SITE, p.id))
        .rejects.toMatchObject({ code: 'forbidden', status: 403 })
    }
  })

  it('refuses somebody with no membership at all', async () => {
    const stranger: Caller = { userId: 'pj-nobody', name: 'Nobody', roles: [] }
    await expect(svc.listProjects(stranger, CO)).rejects.toMatchObject({ status: 403 })
    await expect(svc.createProject(stranger, CO, ctx, { name: name('X') }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('writes an audit entry for every project write', async () => {
    const p = await makeProject()
    await svc.assignSiteToProject(admin, CO, ctx, SITE, p.id)
    await svc.archiveProject(admin, CO, ctx, p.id)

    const actions = (await db.adminAuditEntry.findMany({ where: { companyId: CO } }))
      .map((e) => e.action)
    expect(actions).toContain('Created project')
    expect(actions).toContain('Moved site to project')
    expect(actions).toContain('Cancelled project')
  })
})
