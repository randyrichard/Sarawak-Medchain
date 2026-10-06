import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { IncidentService, IncidentError } from './incidentService.js'
import { type Caller } from '../domain/caller.js'

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

  it("does not confirm that another tenant's incident exists", async () => {
    /*
     * 404, not 403.
     *
     * Answering "forbidden" for a real id belonging to somebody else while an invented id
     * answers "not found" tells a caller which ids are real - an enumeration oracle, and
     * inconsistent with the organisation console, which has always answered 404 here.
     */
    const mine = await svc.create(manager, newIncident('Not yours') as never)

    const real = svc.get(outsider, mine.id).catch((e) => e.status)
    const invented = svc.get(outsider, 'cmnonexistent000000000000').catch((e) => e.status)

    expect(await real).toBe(404)
    // Indistinguishable from an id that never existed, which is the point.
    expect(await invented).toBe(404)
  })

  it('still tells a member of the workspace that a record is out of their scope', async () => {
    // Inside a workspace they belong to, 403 is useful rather than leaky: they already
    // know the workspace exists.
    const hidden = await svc.create(manager, newIncident('Someone else reported this') as never)
    await expect(svc.get(employee, hidden.id)).rejects.toMatchObject({ status: 403 })
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

  it('will not close an investigation that has nothing in it', async () => {
    // Found by driving the lifecycle in a browser: every stage moved with nothing filled in,
    // so an incident went Reported → Closed with no root cause and no corrective action.
    const inc = await svc.create(officer, newIncident('Empty investigation'))
    await svc.advance(manager, inc.id, { to: 'assessment', riskRating: 'Medium', potentialSeverity: 'Minor' })
    await expect(svc.advance(manager, inc.id, { to: 'investigation' })).rejects.toThrow(/investigator/)
    await svc.advance(manager, inc.id, { to: 'investigation', investigator: 'Amirul Hassan' })
    await expect(svc.advance(manager, inc.id, { to: 'rca', findings: 'short' })).rejects.toThrow(/20 characters/)
    await svc.advance(manager, inc.id, { to: 'rca', findings: 'Coupling split under pressure; never inspected.' })
    await expect(svc.advance(manager, inc.id, { to: 'actions' })).rejects.toThrow(/contributing cause/)
    await svc.saveRca(manager, inc.id, {
      causes: [{ id: 'c1', category: 'Equipment', description: 'Couplings not inspected' }],
      fiveWhys: { problem: 'Slip on oil', whys: ['Coupling split'], rootStatement: 'Couplings are outside the inspection programme.' },
    })
    await svc.advance(manager, inc.id, { to: 'actions' })
    await expect(svc.advance(manager, inc.id, { to: 'review' })).rejects.toThrow(/at least one corrective action/)

    const action = await svc.addAction(manager, inc.id, {
      title: 'Add couplings to the checklist', owner: employee.name, dueDate: new Date(Date.now() + 86400000).toISOString(),
    })
    await expect(svc.advance(manager, inc.id, { to: 'review' })).rejects.toThrow(/not completed/)
    await svc.updateAction(employee, action.id, { status: 'completed', evidenceNote: 'Checklist rev 4 issued.' })
    await svc.advance(manager, inc.id, { to: 'review' })
    await expect(svc.advance(manager, inc.id, { to: 'verification' })).rejects.toThrow(/review note/)
    await svc.advance(manager, inc.id, { to: 'verification', note: 'Root cause and action agreed.' })
    await expect(svc.advance(manager, inc.id, { to: 'closed', note: 'Done.' })).rejects.toThrow(/still need verifying/)
    await svc.updateAction(manager, action.id, { status: 'verified' })
    await expect(svc.advance(manager, inc.id, { to: 'closed' })).rejects.toThrow(/closing note/)
    const closed = await svc.advance(manager, inc.id, { to: 'closed', note: 'Verified on site.' })
    expect(closed.stage).toBe('closed')
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

  /**
   * Reopening a settled action. A verification can be wrong, and the alternative — raising
   * a duplicate — loses the first attempt's history and double-counts the work.
   */
  describe('reopening a settled action', () => {
    async function verifiedAction() {
      const inc = await svc.create(officer, newIncident('Reopen case'))
      const action = await svc.addAction(manager, inc.id, {
        title: 'Fit interlock', owner: employee.name,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      })
      await svc.updateAction(employee, action.id, {
        status: 'completed', evidenceNote: 'Interlock fitted.',
      })
      return svc.updateAction(manager, action.id, { status: 'verified' })
    }

    it('clears the sign-off so it cannot read as verified while open', async () => {
      const v = await verifiedAction()
      expect(v.verifiedBy).toBeTruthy()

      const reopened = await svc.updateAction(manager, v.id, { status: 'in_progress' })
      expect(reopened.status).toBe('in_progress')
      expect(reopened.verifiedBy).toBeNull()
      expect(reopened.verifiedAt).toBeNull()
      expect(reopened.completedAt).toBeNull()
    })

    it('is refused to the owner — it undoes a manager sign-off', async () => {
      const v = await verifiedAction()
      await expect(svc.updateAction(employee, v.id, { status: 'in_progress' }))
        .rejects.toMatchObject({ status: 403 })
    })

    it('can be re-verified after the work is redone', async () => {
      const v = await verifiedAction()
      await svc.updateAction(manager, v.id, { status: 'in_progress' })
      await svc.updateAction(employee, v.id, {
        status: 'completed', evidenceNote: 'Interlock refitted and function-tested.',
      })
      const again = await svc.updateAction(manager, v.id, { status: 'verified' })
      expect(again.status).toBe('verified')
      expect(again.verifiedBy).toBe(manager.name)
    })

    it('reopens a cancelled action too', async () => {
      const inc = await svc.create(officer, newIncident('Cancelled reopen'))
      const action = await svc.addAction(manager, inc.id, {
        title: 'Replace sign', owner: employee.name,
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      })
      await svc.updateAction(manager, action.id, { status: 'cancelled' })
      const reopened = await svc.updateAction(manager, action.id, { status: 'open' })
      expect(reopened.status).toBe('open')
    })
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


  it('saves and locks a root cause analysis', async () => {
    const inc = await svc.create(officer, newIncident('RCA flow'))
    const saved = await svc.saveRca(manager, inc.id, {
      causes: [{ id: 'c1', category: 'Unsafe Condition', description: 'Guard removed for cleaning.' }],
      fiveWhys: { problem: 'Guard missing', whys: ['Removed', 'Not refitted'], rootStatement: 'No refit check in the cleaning SOP.' },
    })
    expect((saved.rcaCauses as unknown[]).length).toBe(1)

    const approved = await svc.approveRca(manager, inc.id)
    expect(approved.rcaApprovedBy).toBe(manager.name)

    // Approval locks it — the analysis underpins the corrective actions.
    await expect(svc.saveRca(manager, inc.id, {
      causes: [], fiveWhys: { problem: 'x', whys: [], rootStatement: 'y' },
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses to approve an empty analysis', async () => {
    const inc = await svc.create(officer, newIncident('Empty RCA'))
    await expect(svc.approveRca(manager, inc.id)).rejects.toMatchObject({ code: 'validation' })

    await svc.saveRca(manager, inc.id, {
      causes: [{ id: 'c1', category: 'X', description: 'Something' }],
      fiveWhys: { problem: 'p', whys: [], rootStatement: '' },
    })
    // Causes present but no root statement — still not approvable.
    await expect(svc.approveRca(manager, inc.id)).rejects.toMatchObject({ code: 'validation' })
  })

  it('blocks an employee from writing an RCA', async () => {
    const inc = await svc.create(employee, newIncident('RCA rbac'))
    await expect(svc.saveRca(employee, inc.id, {
      causes: [], fiveWhys: { problem: '', whys: [], rootStatement: '' },
    })).rejects.toMatchObject({ status: 403 })
  })

  it('archives an incident without deleting it, and hides it from lists', async () => {
    const inc = await svc.create(officer, newIncident('To archive'))
    const before = await svc.list(manager, { companyId: COMPANY, page: 1, pageSize: 100 })
    await svc.archive(manager, inc.id)
    const after = await svc.list(manager, { companyId: COMPANY, page: 1, pageSize: 100 })

    expect(after.total).toBe(before.total - 1)
    // Soft delete: the row and its trail survive.
    expect(await db.incident.count({ where: { id: inc.id } })).toBe(1)
    expect(await db.incidentEvent.count({ where: { incidentId: inc.id } })).toBeGreaterThan(0)
  })

  it('records notes against a corrective action', async () => {
    const inc = await svc.create(officer, newIncident('CAPA notes'))
    const a = await svc.addAction(manager, inc.id, {
      title: 'Refit guard', owner: employee.name,
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    })
    await svc.addActionNote(manager, a.id, 'Parts ordered.', ['ITest Employee'])
    await svc.addActionNote(employee, a.id, 'Fitted this morning.')

    const full = await svc.getAction(manager, a.id)
    expect(full.notes).toHaveLength(2)
    expect(full.notes[0].author).toBe(manager.name)
    expect(full.notes[0].mentions).toContain('ITest Employee')
  })

  it('produces action analytics grouped by status, priority and source', async () => {
    const stats = await svc.actionAnalytics(manager, COMPANY)
    expect(Array.isArray(stats.byStatus)).toBe(true)
    expect(stats.byStatus.every((r) => typeof r.count === 'number')).toBe(true)
    expect(typeof stats.overdue).toBe('number')
    const summed = stats.byStatus.reduce((n, r) => n + r.count, 0)
    const bySource = stats.bySource.reduce((n, r) => n + r.count, 0)
    // Every action appears exactly once in each grouping.
    expect(summed).toBe(bySource)
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

  /**
   * Found by walking the incident lifecycle in a browser: after every stage change the
   * corrective actions vanished from the case. The rows were untouched — the mutators
   * returned the bare updated row, with no relations, and the detail screen renders
   * exactly what it is handed. Indistinguishable from data loss to the person watching.
   */
  it('returns the full case, not a bare row, after every mutation', async () => {
    const inc = await svc.create(officer, newIncident('Relation-preservation check'))
    await svc.addAction(officer, inc.id, {
      title: 'Action that must survive a stage change',
      owner: 'ITest Officer',
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      priority: 'High',
    })
    await svc.addComment(officer, inc.id, 'A comment that must survive too.')

    const withRelations = await svc.get(officer, inc.id)
    expect(withRelations.actions).toHaveLength(1)
    expect(withRelations.comments).toHaveLength(1)

    const advanced = await svc.advance(manager, inc.id, {
      to: 'assessment', riskRating: 'Medium', potentialSeverity: 'Minor',
    })
    expect(advanced.stage).toBe('assessment')
    expect(advanced.actions).toHaveLength(1)
    expect(advanced.comments).toHaveLength(1)
    expect(advanced.events.length).toBeGreaterThan(0)

    const saved = await svc.saveRca(
      manager, inc.id,
      {
        causes: [{ id: 'c1', category: 'Procedure Failure', description: 'No standard.' }],
        fiveWhys: { problem: 'p', whys: ['w'], rootStatement: 'Systemic gap.' },
      },
    )
    expect(saved.actions).toHaveLength(1)

    const approved = await svc.approveRca(manager, inc.id)
    expect(approved.rcaApprovedBy).toBeTruthy()
    expect(approved.actions).toHaveLength(1)
    expect(approved.comments).toHaveLength(1)
  })

  /**
   * The register's status chips.
   *
   * Three of these were accepted by the UI but not by the server, so the request failed
   * validation and the list rendered empty — indistinguishable from "nothing matches".
   * These tests pin each chip to the rows it must select.
   */
  describe('status filters', () => {
    const STATUS_SITE = 'itest-status-site'
    let ids: Record<string, string> = {}

    beforeAll(async () => {
      await db.site.upsert({
        where: { id: STATUS_SITE },
        update: {},
        create: { id: STATUS_SITE, companyId: COMPANY, name: 'ITest Status Site' },
      })

      // One incident parked at each stage the chips care about, plus an old open one and
      // a fresh one, so every filter has both a row that matches and rows that must not.
      const make = async (key: string, stage: string, daysOld: number, highRisk = false) => {
        const inc = await svc.create(manager, {
          ...newIncident(`Status filter ${key}`),
          siteId: STATUS_SITE,
        } as never)
        await db.incident.update({
          where: { id: inc.id },
          data: {
            stage: stage as never,
            highRisk,
            reportedAt: new Date(Date.now() - daysOld * 86400_000),
          },
        })
        ids[key] = inc.id
      }

      await make('investigation', 'investigation', 1)
      await make('rca', 'rca', 2)
      await make('review', 'review', 3)
      await make('verification', 'verification', 4)
      await make('fresh', 'reported', 1)
      await make('stale', 'assessment', 40)
      await make('closedOld', 'closed', 60)
      await make('risky', 'reported', 1, true)
    })

    const listIds = async (status: string) => {
      const res = await svc.list(manager, {
        companyId: COMPANY, siteId: STATUS_SITE, page: 1, pageSize: 100, status: status as never,
      })
      return res.rows.map((r) => r.id)
    }

    it('investigating covers the evidence-gathering stages only', async () => {
      const got = await listIds('investigating')
      expect(got).toContain(ids.investigation)
      expect(got).toContain(ids.rca)
      expect(got).not.toContain(ids.review)
      expect(got).not.toContain(ids.fresh)
      expect(got).toHaveLength(2)
    })

    it('awaiting_review covers the sign-off stages only', async () => {
      const got = await listIds('awaiting_review')
      expect(got).toContain(ids.review)
      expect(got).toContain(ids.verification)
      expect(got).not.toContain(ids.investigation)
      expect(got).toHaveLength(2)
    })

    it('overdue selects open incidents past the threshold and excludes closed ones', async () => {
      const got = await listIds('overdue')
      expect(got).toContain(ids.stale)
      // Old but closed — closing an incident settles it, however long it took.
      expect(got).not.toContain(ids.closedOld)
      expect(got).not.toContain(ids.fresh)
      expect(got).toHaveLength(1)
    })

    it('high_risk excludes closed incidents', async () => {
      const got = await listIds('high_risk')
      expect(got).toContain(ids.risky)
      expect(got).not.toContain(ids.fresh)
    })

    it('hides archived incidents everywhere except the archived chip', async () => {
      const inc = await svc.create(manager, {
        ...newIncident('To be archived'), siteId: STATUS_SITE,
      } as never)
      await svc.archive(manager, inc.id)

      for (const status of ['all', 'open', 'investigating', 'awaiting_review', 'overdue', 'closed']) {
        expect(await listIds(status)).not.toContain(inc.id)
      }
      // ...and is reachable when asked for by name, so the audit trail does not point at
      // a row nobody can open.
      expect(await listIds('archived')).toContain(inc.id)
    })

    it('open and closed partition the register', async () => {
      const [open, closed, all] = await Promise.all([
        listIds('open'), listIds('closed'), listIds('all'),
      ])
      expect(open).not.toContain(ids.closedOld)
      expect(closed).toEqual([ids.closedOld])
      expect(open.length + closed.length).toBe(all.length)
    })
  })
})
