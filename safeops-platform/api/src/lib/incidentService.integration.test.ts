import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IncidentService, IncidentError, type Caller } from './incidentService.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * They exist because the unit suite uses an in-memory double that cannot exercise the
 * things most likely to break in production: transactional counter allocation under
 * concurrency, row-level scoping expressed as SQL, and cascade deletes.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new IncidentService(db)

const COMPANY = 'itest-co'
const SITE = 'itest-site'

const manager: Caller = {
  userId: 'itest-mgr', name: 'ITest Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const officer: Caller = {
  userId: 'itest-so', name: 'ITest Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE] }],
}
const employee: Caller = {
  userId: 'itest-emp', name: 'ITest Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'itest-out', name: 'ITest Outsider',
  roles: [{ companyId: 'some-other-co', role: 'admin', siteIds: [] }],
}

const newIncident = (title: string) => ({
  companyId: COMPANY, siteId: SITE, title,
  type: 'unsafe_condition', severity: 'Minor',
  location: 'Integration bay', occurredAt: new Date().toISOString(),
})

d('IncidentService — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'ITest Co' } })
    await db.site.upsert({ where: { id: SITE }, update: {}, create: { id: SITE, companyId: COMPANY, name: 'ITest Site' } })
  })

  afterAll(async () => {
    // Cascades remove incidents, events, comments, attachments and actions with the company.
    await db.correctiveAction.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  it('allocates unique reference numbers under concurrent creation', async () => {
    // The real risk the in-memory double cannot model: two requests racing the counter.
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) => svc.create(manager, newIncident(`Concurrent ${i}`))),
    )
    const numbers = created.map((c) => c.number)
    expect(new Set(numbers).size).toBe(10)
  })

  it('scopes rows in SQL: an employee sees only what they reported', async () => {
    await svc.create(manager, newIncident('Manager visible only'))
    const mine = await svc.create(employee, newIncident('Employee own report'))

    const asEmployee = await svc.list(employee, { companyId: COMPANY, page: 1, pageSize: 100 })
    expect(asEmployee.rows.every((r) => r.reporterId === employee.userId)).toBe(true)
    expect(asEmployee.rows.some((r) => r.id === mine.id)).toBe(true)

    const asManager = await svc.list(manager, { companyId: COMPANY, page: 1, pageSize: 100 })
    expect(asManager.total).toBeGreaterThan(asEmployee.total)
  })

  it('refuses a direct fetch of an incident outside the caller scope', async () => {
    const hidden = await svc.create(manager, newIncident('Not for the employee'))
    await expect(svc.get(employee, hidden.id)).rejects.toBeInstanceOf(IncidentError)
  })

  it('refuses cross-tenant access', async () => {
    await expect(svc.list(outsider, { companyId: COMPANY, page: 1, pageSize: 10 }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('paginates deterministically without overlap', async () => {
    const p1 = await svc.list(manager, { companyId: COMPANY, page: 1, pageSize: 3 })
    const p2 = await svc.list(manager, { companyId: COMPANY, page: 2, pageSize: 3 })
    const overlap = p1.rows.filter((a) => p2.rows.some((b) => b.id === a.id))
    expect(overlap).toHaveLength(0)
    expect(p1.totalPages).toBe(Math.ceil(p1.total / 3))
  })

  it('enforces ordered stage transitions', async () => {
    const inc = await svc.create(officer, newIncident('Stage order'))
    await expect(svc.advance(manager, inc.id, { to: 'investigation' }))
      .rejects.toMatchObject({ code: 'validation' })
    const moved = await svc.advance(manager, inc.id, { to: 'assessment' })
    expect(moved.stage).toBe('assessment')
    await expect(svc.advance(manager, inc.id, { to: 'reported' }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects a stale write with 409 rather than overwriting', async () => {
    const inc = await svc.create(officer, newIncident('Concurrency'))
    await svc.advance(manager, inc.id, { to: 'assessment', expectedVersion: inc.version })
    await expect(svc.advance(manager, inc.id, { to: 'investigation', expectedVersion: inc.version }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('blocks an employee from progressing an investigation', async () => {
    const inc = await svc.create(employee, newIncident('Employee cannot advance'))
    await expect(svc.advance(employee, inc.id, { to: 'assessment' }))
      .rejects.toMatchObject({ status: 403 })
  })

  it('requires evidence before an action can be completed, and a manager to verify it', async () => {
    const inc = await svc.create(officer, newIncident('CAPA rules'))
    const action = await svc.addAction(manager, inc.id, {
      title: 'Fit guard', owner: employee.name, dueDate: new Date(Date.now() + 86400000).toISOString(),
    })

    await expect(svc.updateAction(employee, action.id, { status: 'completed' }))
      .rejects.toMatchObject({ code: 'validation' })

    const done = await svc.updateAction(employee, action.id, {
      status: 'completed', evidenceNote: 'Guard fitted and photographed.',
    })
    expect(done.status).toBe('completed')

    // Segregation of duties: the owner must not sign off their own work.
    await expect(svc.updateAction(employee, action.id, { status: 'verified' }))
      .rejects.toMatchObject({ status: 403 })

    const verified = await svc.updateAction(manager, action.id, { status: 'verified' })
    expect(verified.verifiedBy).toBe(manager.name)
  })

  it('writes an append-only audit event for every mutation', async () => {
    const inc = await svc.create(officer, newIncident('Audit trail'))
    await svc.addComment(manager, inc.id, 'Reviewed on site.')
    await svc.advance(manager, inc.id, { to: 'assessment' })

    const full = await svc.get(manager, inc.id)
    const actions = full.events.map((e) => e.action)
    expect(actions).toContain('Incident reported')
    expect(actions).toContain('Comment added')
    expect(actions.some((a) => a.includes('assessment'))).toBe(true)
    expect(full.events.every((e) => !!e.actor)).toBe(true)
  })

  it('cascades child rows when an incident is removed', async () => {
    const inc = await svc.create(manager, newIncident('Cascade check'))
    await svc.addComment(manager, inc.id, 'Will be cascaded.')
    await db.incident.delete({ where: { id: inc.id } })

    expect(await db.incidentComment.count({ where: { incidentId: inc.id } })).toBe(0)
    expect(await db.incidentEvent.count({ where: { incidentId: inc.id } })).toBe(0)
  })


  it('raises an action with no parent investigation (audit/inspection origin)', async () => {
    const a = await svc.createStandaloneAction(manager, {
      companyId: COMPANY, siteId: SITE,
      title: 'Replace worn sling — audit finding',
      owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      source: 'audit',
    })
    expect(a.incidentId).toBeNull()
    expect(a.source).toBe('audit')
    expect(a.code).toMatch(/^CA-\d+$/)
  })

  it('lists incident-derived and standalone actions as one register', async () => {
    const inc = await svc.create(officer, newIncident('Register union'))
    await svc.addAction(manager, inc.id, {
      title: 'From investigation', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    })
    await svc.createStandaloneAction(manager, {
      companyId: COMPANY, siteId: SITE, title: 'From inspection', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(), source: 'inspection',
    })

    const all = await svc.listActions(manager, COMPANY, { page: 1, pageSize: 100 })
    const sources = new Set(all.rows.map((r) => r.source))
    expect(sources.has('incident')).toBe(true)
    expect(sources.has('inspection')).toBe(true)

    const onlyInspection = await svc.listActions(manager, COMPANY, { page: 1, pageSize: 100, source: 'inspection' })
    expect(onlyInspection.rows.every((r) => r.source === 'inspection')).toBe(true)
    expect(onlyInspection.total).toBeLessThan(all.total)
  })

  it('updating a standalone action does not attempt an incident audit event', async () => {
    const a = await svc.createStandaloneAction(manager, {
      companyId: COMPANY, siteId: SITE, title: 'Standalone update', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(), source: 'manual',
    })
    const done = await svc.updateAction(employee, a.id, {
      status: 'completed', evidenceNote: 'Done and photographed.',
    })
    expect(done.status).toBe('completed')
    expect(done.incidentId).toBeNull()
  })

  it('requires a manage role to raise a standalone action', async () => {
    await expect(svc.createStandaloneAction(employee, {
      companyId: COMPANY, siteId: SITE, title: 'Not allowed', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    })).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a standalone action for a site outside the workspace', async () => {
    await expect(svc.createStandaloneAction(manager, {
      companyId: COMPANY, siteId: 'no-such-site', title: 'Bad site', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    })).rejects.toMatchObject({ code: 'validation' })
  })


  it('cascades standalone actions when the tenant is deleted (no orphans)', async () => {
    // Regression: CorrectiveAction.companyId was a bare string, so an action with no
    // parent incident survived company deletion and later collided on its CA number.
    const TMP = 'itest-cascade-co'
    await db.company.create({ data: { id: TMP, name: 'Cascade Co' } })
    await db.site.create({ data: { id: 'itest-cascade-site', companyId: TMP, name: 'S' } })
    const tmpMgr: Caller = {
      userId: 'x', name: 'Cascade Mgr',
      roles: [{ companyId: TMP, role: 'hse_manager', siteIds: [] }],
    }
    const a = await svc.createStandaloneAction(tmpMgr, {
      companyId: TMP, siteId: 'itest-cascade-site', title: 'Orphan check',
      owner: 'Someone', dueDate: new Date(Date.now() + 86400000).toISOString(), source: 'manual',
    })
    expect(a.incidentId).toBeNull()

    await db.company.delete({ where: { id: TMP } })
    await db.counter.deleteMany({ where: { companyId: TMP } })

    expect(await db.correctiveAction.count({ where: { id: a.id } })).toBe(0)
  })

  it('refuses an action referencing a company that does not exist', async () => {
    await expect(db.correctiveAction.create({
      data: {
        code: 'CA-ghost', companyId: 'no-such-company', siteId: SITE,
        title: 'Ghost', owner: 'X', dueDate: new Date(), createdBy: 'X',
      },
    })).rejects.toThrow()
  })

  it('computes dashboard statistics in the database', async () => {
    const stats = await svc.stats(manager, COMPANY)
    expect(stats.total).toBeGreaterThan(0)
    expect(stats.open + stats.closed).toBe(stats.total)
  })

  it('counts open, overdue and awaiting-verification actions for the dashboard', async () => {
    const inc = await svc.create(officer, newIncident('Dashboard CAPA counters'))
    // One overdue, one due later, one already completed and awaiting verification.
    await svc.addAction(manager, inc.id, {
      title: 'Overdue item', owner: employee.name,
      dueDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    })
    await svc.addAction(manager, inc.id, {
      title: 'Future item', owner: employee.name,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    const third = await svc.addAction(manager, inc.id, {
      title: 'Done item', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    })
    await svc.updateAction(employee, third.id, { status: 'completed', evidenceNote: 'Fitted.' })

    const stats = await svc.stats(manager, COMPANY)
    expect(stats.openActions).toBeGreaterThanOrEqual(2)
    expect(stats.overdueActions).toBeGreaterThanOrEqual(1)
    expect(stats.awaitingVerification).toBeGreaterThanOrEqual(1)
    // Overdue is a subset of open, never larger.
    expect(stats.overdueActions).toBeLessThanOrEqual(stats.openActions)
  })

  it('scopes dashboard action counters to the caller', async () => {
    // An employee's dashboard must count only the actions they own.
    const asEmployee = await svc.stats(employee, COMPANY)
    const asManager = await svc.stats(manager, COMPANY)
    expect(asEmployee.openActions).toBeLessThanOrEqual(asManager.openActions)
  })
})
