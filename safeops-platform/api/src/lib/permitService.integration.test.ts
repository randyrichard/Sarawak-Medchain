import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PermitError, PermitService } from './permitService.js'
import { GAS_TEST_REQUIRED, ISOLATION_REQUIRED } from './permitCatalog.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * A permit's rules are the product: refusing an approval while a control is unconfirmed,
 * stopping work when the atmosphere fails, and refusing to close over a live isolation.
 * Every one of them is exercised here against real SQL, because the things that break in
 * production are the ones a mock cannot model — transactional numbering under
 * concurrency, tenant scoping expressed as a WHERE clause, and cascade deletes.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new PermitService(db)

const COMPANY = 'ptw-itest-co'
const SITE = 'ptw-itest-site'
const SITE_B = 'ptw-itest-site-b'
/** A second tenant. Every isolation check needs somewhere to be isolated *from*. */
const OTHER = 'ptw-itest-other-co'
const OTHER_SITE = 'ptw-itest-other-site'

const manager: Caller = {
  userId: 'ptw-mgr', name: 'PTW Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const officer: Caller = {
  userId: 'ptw-so', name: 'PTW Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE] }],
}
const supervisor: Caller = {
  userId: 'ptw-sup', name: 'PTW Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE] }],
}
const employee: Caller = {
  userId: 'ptw-emp', name: 'PTW Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
/** Deliberately an admin — of somewhere else. Seniority must not cross a tenant boundary. */
const outsider: Caller = {
  userId: 'ptw-out', name: 'PTW Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

const HOUR = 3600_000
const iso = (ms: number) => new Date(ms).toISOString()

const newPermit = (over: Partial<Parameters<typeof svc.create>[1]> = {}) => ({
  companyId: COMPANY,
  siteId: SITE,
  type: 'working_at_height' as const,
  title: 'Replace corroded handrail',
  description: 'Rope access handrail replacement.',
  department: 'Maintenance',
  location: 'Process tower, Level 12',
  applicant: 'Kumar Raj',
  workerCount: 3,
  validFrom: iso(Date.now()),
  validTo: iso(Date.now() + 6 * HOUR),
  ...over,
})

/** Confirms every required control so approval can be tested on its own terms. */
async function confirmAllControls(caller: Caller, permitId: string) {
  const p = await svc.get(caller, permitId)
  for (const c of p.controls.filter((x) => x.required)) {
    await svc.confirmControl(caller, permitId, c.id, true)
  }
}

const PASSING_GAS = { oxygenPct: 20.9, lelPct: 0, h2sPpm: 0, coPpm: 2 }
const FAILING_GAS = { oxygenPct: 17.2, lelPct: 24, h2sPpm: 15, coPpm: 5 }

/** Drives a permit to `active`, satisfying whatever its type requires on the way. */
/**
 * Satisfies the activation gate: a permit cannot go active with nobody named on it and
 * no toolbox talk held. Added when that gate was introduced — these tests are about what
 * happens *after* a permit is live, so they need a live permit rather than a reason to
 * assert the gate, which has its own suite.
 */
async function satisfyActivationGate(permitId: string) {
  const worker = await db.employee.create({
    data: {
      companyId: COMPANY, siteId: SITE,
      employeeNo: `EMP-PTW-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Gate Worker', medicalExpiry: new Date(Date.now() + 200 * 86400_000),
    },
  })
  const attendee = await db.permitAttendee.create({
    data: { permitId, employeeId: worker.id, nameAtAssignment: worker.name, addedBy: 'ITest' },
  })
  await db.permit.update({ where: { id: permitId }, data: { toolboxAt: new Date(), toolboxBy: 'ITest' } })
  await db.permitAttendee.update({ where: { id: attendee.id }, data: { toolboxAckAt: new Date() } })
}

async function makeActive(over: Parameters<typeof newPermit>[0] = {}) {
  const p = await svc.create(officer, newPermit(over))
  await confirmAllControls(officer, p.id)
  if (GAS_TEST_REQUIRED.includes(p.type)) await svc.addGasTest(officer, p.id, PASSING_GAS)
  if (ISOLATION_REQUIRED.includes(p.type)) {
    await svc.addIsolation(officer, p.id, { description: 'Source isolated', tagId: 'LOTO-A' })
  }
  await svc.submit(employee, p.id)
  await svc.approve(officer, p.id, 'Controls verified.')
  await satisfyActivationGate(p.id)
  return svc.activate(officer, p.id)
}

d('PermitService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'PTW ITest Co'], [OTHER, 'PTW Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE, COMPANY], [SITE_B, COMPANY], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {}, create: { id, companyId, name: `Site ${id}` },
      })
    }
  })

  afterAll(async () => {
    // Cascades take permits and all their children with the company.
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  // ── Numbering ──────────────────────────────────────────────────────────────

  it('allocates unique PTW numbers under concurrent creation', async () => {
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) => svc.create(manager, newPermit({ title: `Concurrent ${i}` }))),
    )
    const codes = created.map((c) => c.code)
    expect(new Set(codes).size).toBe(10)
    expect(codes.every((c) => /^PTW-\d+$/.test(c))).toBe(true)
  })

  it('numbers permits per tenant, so two companies can hold the same reference', async () => {
    const otherMgr: Caller = {
      userId: 'ptw-other-mgr', name: 'Other Mgr',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    const mine = await svc.create(manager, newPermit({ title: 'Tenant A' }))
    const theirs = await svc.create(otherMgr, newPermit({
      title: 'Tenant B', companyId: OTHER, siteId: OTHER_SITE,
    }))

    expect(theirs.code).toBe('PTW-4401') // its own sequence, not a continuation of ours
    expect(mine.companyId).not.toBe(theirs.companyId)
    // Scoped to the two test tenants. Counting PTW-4401 across every company would also
    // pick up unrelated workspaces, which is the opposite of what per-tenant means.
    const both = await db.permit.count({
      where: { code: 'PTW-4401', companyId: { in: [COMPANY, OTHER] } },
    })
    expect(both).toBe(2)
  })

  // ── Validity window ────────────────────────────────────────────────────────

  it('enforces the per-type maximum validity', async () => {
    // Confined space 8h, hot work 12h, electrical isolation 24h.
    await expect(svc.create(manager, newPermit({
      type: 'confined_space', validTo: iso(Date.now() + 9 * HOUR),
    }))).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.create(manager, newPermit({
      type: 'hot_work', validTo: iso(Date.now() + 13 * HOUR),
    }))).rejects.toMatchObject({ code: 'validation' })

    const ok8 = await svc.create(manager, newPermit({
      type: 'confined_space', validTo: iso(Date.now() + 8 * HOUR),
    }))
    expect(ok8.code).toMatch(/^PTW-/)

    const ok24 = await svc.create(manager, newPermit({
      type: 'electrical_isolation', validTo: iso(Date.now() + 24 * HOUR),
    }))
    expect(ok24.code).toMatch(/^PTW-/)

    await expect(svc.create(manager, newPermit({
      type: 'electrical_isolation', validTo: iso(Date.now() + 25 * HOUR),
    }))).rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses a window that ends before it starts', async () => {
    await expect(svc.create(manager, newPermit({
      validFrom: iso(Date.now() + 4 * HOUR), validTo: iso(Date.now() + HOUR),
    }))).rejects.toMatchObject({ code: 'validation' })
  })

  it('stamps the checklist for the type at creation', async () => {
    const hot = await svc.create(manager, newPermit({ type: 'hot_work' }))
    expect(hot.controls).toHaveLength(7)
    expect(hot.controls.filter((c) => c.required)).toHaveLength(5)
    // Position ordering is stable, so the list does not reshuffle between reads.
    expect(hot.controls.map((c) => c.position)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(hot.outstandingControls).toBe(5)
  })

  // ── Approval gates ─────────────────────────────────────────────────────────

  it('refuses approval while any required control is unconfirmed', async () => {
    const p = await svc.create(officer, newPermit())
    await svc.submit(officer, p.id)

    await expect(svc.approve(officer, p.id, 'Looks fine.'))
      .rejects.toMatchObject({ code: 'validation' })

    // Confirming only the optional ones must not unlock it either.
    const full = await svc.get(officer, p.id)
    for (const c of full.controls.filter((x) => !x.required)) {
      await svc.confirmControl(officer, p.id, c.id, true)
    }
    await expect(svc.approve(officer, p.id, 'Looks fine.'))
      .rejects.toMatchObject({ code: 'validation' })

    await confirmAllControls(officer, p.id)
    const issued = await svc.approve(officer, p.id, 'Controls verified on site.')
    expect(issued.status).toBe('approved')
    expect(issued.approver).toBe(officer.name)
  })

  it('requires a gas test before issue for hot work, confined space and line breaking', async () => {
    for (const type of ['hot_work', 'confined_space', 'line_breaking'] as const) {
      const p = await svc.create(officer, newPermit({
        type, validTo: iso(Date.now() + 6 * HOUR),
      }))
      await confirmAllControls(officer, p.id)
      // Isolation-requiring types need one recorded before the gas test gate is reached.
      await svc.addIsolation(officer, p.id, { description: 'Source isolated', tagId: 'LOTO-1' })
      await svc.submit(officer, p.id)

      await expect(svc.approve(officer, p.id, ''))
        .rejects.toMatchObject({ code: 'validation' })

      await svc.addGasTest(officer, p.id, PASSING_GAS)
      /*
       * Issued by the manager, not the officer who submitted it. Hot work and confined
       * space now require a separate issuing authority - the officer signed as applicant
       * at submit, so they cannot also issue. This test is about the gas gate; using two
       * people keeps it about that.
       */
      const issued = await svc.approve(manager, p.id, '')
      expect(issued.status).toBe('approved')
    }
  })

  it('does not demand a gas test for a type that has no atmospheric hazard', async () => {
    const p = await svc.create(officer, newPermit({ type: 'lifting_operation' }))
    await confirmAllControls(officer, p.id)
    await svc.submit(officer, p.id)
    const issued = await svc.approve(officer, p.id, '')
    expect(issued.status).toBe('approved')
    expect(issued.gasTests).toHaveLength(0)
  })

  it('refuses issue when the most recent gas test failed', async () => {
    const p = await svc.create(officer, newPermit({ type: 'hot_work' }))
    await confirmAllControls(officer, p.id)
    await svc.addGasTest(officer, p.id, PASSING_GAS)
    await svc.addGasTest(officer, p.id, FAILING_GAS) // latest reading is what counts
    await svc.submit(officer, p.id)

    await expect(svc.approve(officer, p.id, ''))
      .rejects.toMatchObject({ code: 'validation' })

    await svc.addGasTest(officer, p.id, PASSING_GAS)
    // Manager issues: hot work needs an issuer other than whoever signed as applicant.
    expect((await svc.approve(manager, p.id, '')).status).toBe('approved')
  })

  it('requires a recorded isolation for isolation-dependent types', async () => {
    const p = await svc.create(officer, newPermit({ type: 'electrical_isolation' }))
    await confirmAllControls(officer, p.id)
    await svc.submit(officer, p.id)

    await expect(svc.approve(officer, p.id, ''))
      .rejects.toMatchObject({ code: 'validation' })

    await svc.addIsolation(officer, p.id, {
      description: 'MCC panel 7 incomer isolated', tagId: 'LOTO-4460',
    })
    expect((await svc.approve(officer, p.id, '')).status).toBe('approved')
  })

  it('computes the gas verdict server-side from the limits, not from the client', async () => {
    const p = await svc.create(officer, newPermit({ type: 'hot_work' }))
    // O₂ just under the 19.5% floor — a pass here would authorise entry on a bad reading.
    await svc.addGasTest(officer, p.id, { oxygenPct: 19.4, lelPct: 0, h2sPpm: 0, coPpm: 0 })
    const after = await svc.get(officer, p.id)
    expect(after.gasTests[0].pass).toBe(false)

    await svc.addGasTest(officer, p.id, { oxygenPct: 20.9, lelPct: 9.9, h2sPpm: 9.9, coPpm: 34 })
    const boundary = await svc.get(officer, p.id)
    expect(boundary.gasTests[1].pass).toBe(true)
  })

  // ── Gas failure on live work ───────────────────────────────────────────────

  it('auto-suspends an active permit when a gas test fails', async () => {
    const active = await makeActive({ type: 'confined_space', validTo: iso(Date.now() + 6 * HOUR) })
    expect(active.status).toBe('active')

    const after = await svc.addGasTest(officer, active.id, FAILING_GAS)
    expect(after.status).toBe('suspended')
    expect(after.suspendedReason).toMatch(/atmosphere outside safe limits/i)

    // The stop is on the record, not just in the response.
    const reread = await svc.get(officer, active.id)
    expect(reread.status).toBe('suspended')
    expect(reread.timeline.some((e) => e.action === 'Gas test FAILED')).toBe(true)
    expect(reread.timeline.some((e) => e.action === 'Suspended')).toBe(true)
  })

  it('does not suspend a permit that is not yet live when a test fails', async () => {
    const p = await svc.create(officer, newPermit({ type: 'hot_work' }))
    const after = await svc.addGasTest(officer, p.id, FAILING_GAS)
    expect(after.status).toBe('draft')
  })

  // ── Closure ────────────────────────────────────────────────────────────────

  it('refuses closure while an isolation is still applied', async () => {
    const p = await svc.create(officer, newPermit({ type: 'electrical_isolation' }))
    await confirmAllControls(officer, p.id)
    const withIso = await svc.addIsolation(officer, p.id, {
      description: 'Breaker racked out', tagId: 'LOTO-9001',
    })
    await svc.submit(officer, p.id)
    await svc.approve(officer, p.id, '')
    await satisfyActivationGate(p.id)
    await svc.activate(officer, p.id)

    await expect(svc.close(officer, p.id, { handbackConfirmed: true, statement: 'Done.' }))
      .rejects.toMatchObject({ code: 'validation' })

    await svc.releaseIsolation(officer, p.id, withIso.isolations[0].id)
    const closed = await svc.close(officer, p.id, { handbackConfirmed: true, statement: 'Handed back.' })
    expect(closed.status).toBe('closed')
    expect(closed.closedBy).toBe(officer.name)
    expect(closed.signatures.some((s) => s.role === 'closer')).toBe(true)
  })

  it('requires handback confirmation to close', async () => {
    const active = await makeActive()
    await expect(svc.close(officer, active.id, { handbackConfirmed: false, statement: 'Finished.' }))
      .rejects.toMatchObject({ code: 'validation' })

    const closed = await svc.close(officer, active.id, { handbackConfirmed: true })
    expect(closed.handbackConfirmed).toBe(true)
    expect(closed.status).toBe('closed')
  })

  it('refuses to close a permit that was never open', async () => {
    const draft = await svc.create(officer, newPermit())
    await expect(svc.close(officer, draft.id, { handbackConfirmed: true }))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('releases an isolation once only', async () => {
    const p = await svc.create(officer, newPermit({ type: 'line_breaking' }))
    const withIso = await svc.addIsolation(officer, p.id, {
      description: 'Double block and bleed set', tagId: 'LOTO-7',
    })
    const isoId = withIso.isolations[0].id

    await svc.releaseIsolation(officer, p.id, isoId)
    await expect(svc.releaseIsolation(officer, p.id, isoId))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Role gates ─────────────────────────────────────────────────────────────

  it('restricts issue, rejection, suspension and closure to Safety Officer and above', async () => {
    const p = await svc.create(employee, newPermit())
    await confirmAllControls(employee, p.id)
    await svc.submit(employee, p.id)

    for (const caller of [employee, supervisor]) {
      await expect(svc.approve(caller, p.id, '')).rejects.toMatchObject({ status: 403 })
      await expect(svc.reject(caller, p.id, 'no')).rejects.toMatchObject({ status: 403 })
    }

    const issued = await svc.approve(officer, p.id, '')
    expect(issued.status).toBe('approved')

    // Starting work is not an issuing act — the crew doing the job may do it.
    await satisfyActivationGate(p.id)
    const active = await svc.activate(employee, p.id)
    expect(active.status).toBe('active')

    await expect(svc.suspend(supervisor, p.id, 'stop')).rejects.toMatchObject({ status: 403 })
    await expect(svc.close(employee, p.id, { handbackConfirmed: true }))
      .rejects.toMatchObject({ status: 403 })

    const suspended = await svc.suspend(manager, p.id, 'Weather deteriorating.')
    expect(suspended.status).toBe('suspended')
    await expect(svc.resume(employee, p.id)).rejects.toMatchObject({ status: 403 })
    expect((await svc.resume(officer, p.id)).status).toBe('active')
  })

  it('requires a reason to reject or suspend', async () => {
    const p = await svc.create(officer, newPermit())
    await confirmAllControls(officer, p.id)
    await svc.submit(officer, p.id)
    await expect(svc.reject(officer, p.id, '   ')).rejects.toMatchObject({ code: 'validation' })

    await svc.approve(officer, p.id, '')
    await satisfyActivationGate(p.id)
    await svc.activate(officer, p.id)
    await expect(svc.suspend(officer, p.id, '')).rejects.toMatchObject({ code: 'validation' })
  })

  it('enforces the lifecycle order', async () => {
    const p = await svc.create(officer, newPermit())

    // Work cannot start on an unapproved permit.
    await expect(svc.activate(officer, p.id)).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.approve(officer, p.id, '')).rejects.toMatchObject({ code: 'validation' })

    await confirmAllControls(officer, p.id)
    await svc.submit(officer, p.id)
    await expect(svc.submit(officer, p.id)).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.resume(officer, p.id)).rejects.toMatchObject({ code: 'validation' })

    await svc.approve(officer, p.id, '')
    await expect(svc.suspend(officer, p.id, 'not started yet'))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('locks the checklist once the permit is closed', async () => {
    const active = await makeActive()
    const closed = await svc.close(officer, active.id, { handbackConfirmed: true })
    await expect(svc.confirmControl(officer, closed.id, closed.controls[0].id, false))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Expiry ─────────────────────────────────────────────────────────────────

  it('reports an active permit past validTo as expired', async () => {
    const active = await makeActive()
    // Simulate the clock passing the window rather than sleeping through it.
    await db.permit.update({
      where: { id: active.id }, data: { validTo: new Date(Date.now() - 30 * 60_000) },
    })

    const expired = await svc.get(officer, active.id)
    expect(expired.status).toBe('expired')
    expect(expired.statusLabel).toBe('Expired')
    expect(expired.hoursRemaining).toBeLessThan(0)
    expect(expired.expiringSoon).toBe(false)
    // The stored state is untouched — expiry is derived, never written.
    const stored = await db.permit.findUnique({ where: { id: active.id } })
    expect(stored?.status).toBe('active')

    // ...and it is filtered as expired in SQL, not just labelled on read.
    const asExpired = await svc.list(officer, {
      companyId: COMPANY, page: 1, pageSize: 100, status: 'expired',
    })
    expect(asExpired.rows.some((r) => r.id === active.id)).toBe(true)

    const asActive = await svc.list(officer, {
      companyId: COMPANY, page: 1, pageSize: 100, status: 'active',
    })
    expect(asActive.rows.some((r) => r.id === active.id)).toBe(false)

    // The live board still shows it — expired work in progress is the thing that matters.
    const live = await svc.list(officer, {
      companyId: COMPANY, page: 1, pageSize: 100, status: 'live',
    })
    expect(live.rows.some((r) => r.id === active.id)).toBe(true)
  })

  it('flags a permit inside its final hour as expiring soon', async () => {
    const active = await makeActive()
    await db.permit.update({
      where: { id: active.id }, data: { validTo: new Date(Date.now() + 40 * 60_000) },
    })
    const soon = await svc.get(officer, active.id)
    expect(soon.expiringSoon).toBe(true)
    expect(soon.status).toBe('active')
  })

  it('refuses to start or resume work on an expired permit', async () => {
    const p = await svc.create(officer, newPermit())
    await confirmAllControls(officer, p.id)
    await svc.submit(officer, p.id)
    await svc.approve(officer, p.id, '')
    await db.permit.update({
      where: { id: p.id }, data: { validTo: new Date(Date.now() - HOUR) },
    })

    await expect(svc.activate(officer, p.id)).rejects.toMatchObject({ code: 'validation' })
    // Closing it out, however, must stay possible — otherwise expired work cannot be
    // handed back and the isolation stays on the plant.
    const closed = await svc.close(officer, p.id, { handbackConfirmed: true })
    expect(closed.status).toBe('closed')
  })

  it('lists permits about to lapse and those already lapsed', async () => {
    const warn = await makeActive({ title: 'Lapsing soon' })
    const gone = await makeActive({ title: 'Already lapsed' })
    await db.permit.update({ where: { id: warn.id }, data: { validTo: new Date(Date.now() + 20 * 60_000) } })
    await db.permit.update({ where: { id: gone.id }, data: { validTo: new Date(Date.now() - 20 * 60_000) } })

    const sweep = await svc.expiring(officer, COMPANY)
    expect(sweep.warning.some((r) => r.id === warn.id)).toBe(true)
    expect(sweep.expired.some((r) => r.id === gone.id)).toBe(true)
    expect(sweep.warning.some((r) => r.id === gone.id)).toBe(false)
    expect(sweep.warning[0]).toHaveProperty('typeLabel')
  })

  // ── Tenancy ────────────────────────────────────────────────────────────────

  it('refuses cross-tenant listing, reads and mutations', async () => {
    const mine = await makeActive({ title: 'Tenant isolation' })

    await expect(svc.list(outsider, { companyId: COMPANY, page: 1, pageSize: 10 }))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.stats(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.expiring(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })

    // A guessed id must not be enough, even for an admin of another workspace.
    await expect(svc.get(outsider, mine.id)).rejects.toMatchObject({ status: 403 })
    await expect(svc.suspend(outsider, mine.id, 'stop')).rejects.toMatchObject({ status: 403 })
    await expect(svc.close(outsider, mine.id, { handbackConfirmed: true }))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.confirmControl(outsider, mine.id, mine.controls[0].id, true))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.addGasTest(outsider, mine.id, PASSING_GAS)).rejects.toMatchObject({ status: 403 })
  })

  it('refuses a control or isolation id belonging to a different permit', async () => {
    const a = await svc.create(officer, newPermit({ type: 'electrical_isolation', title: 'Permit A' }))
    const b = await svc.create(officer, newPermit({ type: 'electrical_isolation', title: 'Permit B' }))
    const withIso = await svc.addIsolation(officer, b.id, {
      description: "B's isolation", tagId: 'LOTO-B',
    })

    // Both ids are real and the caller can reach both permits — the child still has to
    // belong to the parent, or a control is confirmable through the wrong permit.
    await expect(svc.confirmControl(officer, a.id, b.controls[0].id, true))
      .rejects.toMatchObject({ status: 404 })
    await expect(svc.releaseIsolation(officer, a.id, withIso.isolations[0].id))
      .rejects.toMatchObject({ status: 404 })

    const stillApplied = await svc.get(officer, b.id)
    expect(stillApplied.isolations[0].removedAt).toBeNull()
  })

  it('refuses a permit written against another tenant’s site', async () => {
    await expect(svc.create(manager, newPermit({ siteId: OTHER_SITE })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.create(manager, newPermit({ siteId: 'no-such-site' })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('scopes the board to one tenant', async () => {
    const otherMgr: Caller = {
      userId: 'ptw-other-mgr2', name: 'Other Mgr 2',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    await svc.create(otherMgr, newPermit({
      companyId: OTHER, siteId: OTHER_SITE, title: 'Should never appear',
    }))

    const mine = await svc.list(manager, { companyId: COMPANY, page: 1, pageSize: 100, status: 'all' })
    expect(mine.rows.every((r) => r.companyId === COMPANY)).toBe(true)
    expect(mine.rows.some((r) => r.title === 'Should never appear')).toBe(false)
  })

  it('reports a permit that does not exist as not found', async () => {
    await expect(svc.get(manager, 'no-such-permit')).rejects.toBeInstanceOf(PermitError)
    await expect(svc.get(manager, 'no-such-permit')).rejects.toMatchObject({ status: 404 })
  })

  // ── Filtering, search and ordering ─────────────────────────────────────────

  it('filters by site and type, and searches the type label as the user reads it', async () => {
    await svc.create(manager, newPermit({
      type: 'radiography', siteId: SITE_B, title: 'Weld inspection shoot', location: 'Fab bay 4',
    }))

    const bySite = await svc.list(manager, {
      companyId: COMPANY, page: 1, pageSize: 100, siteId: SITE_B, status: 'all',
    })
    expect(bySite.rows.every((r) => r.siteId === SITE_B)).toBe(true)
    expect(bySite.total).toBeGreaterThan(0)

    const byType = await svc.list(manager, {
      companyId: COMPANY, page: 1, pageSize: 100, type: 'radiography', status: 'all',
    })
    expect(byType.rows.every((r) => r.type === 'radiography')).toBe(true)

    // "Radiography" is a label, not a stored string — the search still has to find it.
    const byLabel = await svc.list(manager, {
      companyId: COMPANY, page: 1, pageSize: 100, q: 'radiograph', status: 'all',
    })
    expect(byLabel.rows.some((r) => r.type === 'radiography')).toBe(true)

    const byLocation = await svc.list(manager, {
      companyId: COMPANY, page: 1, pageSize: 100, q: 'fab bay', status: 'all',
    })
    expect(byLocation.rows.some((r) => r.location === 'Fab bay 4')).toBe(true)
  })

  it('excludes drafts and closed permits from the live board', async () => {
    const draft = await svc.create(officer, newPermit({ title: 'Never submitted' }))
    const active = await makeActive({ title: 'Live work' })
    const closed = await svc.close(
      officer,
      (await makeActive({ title: 'Finished work' })).id,
      { handbackConfirmed: true },
    )

    const live = await svc.list(officer, { companyId: COMPANY, page: 1, pageSize: 100, status: 'live' })
    const ids = live.rows.map((r) => r.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(draft.id)
    expect(ids).not.toContain(closed.id)
  })

  it('orders the board with whatever needs attention first', async () => {
    const rows = (await svc.list(officer, {
      companyId: COMPANY, page: 1, pageSize: 100, status: 'live',
    })).rows

    const rank = (r: (typeof rows)[number]) =>
      r.expiringSoon ? 0 : r.status === 'expired' ? 1 : r.status === 'active' ? 2
        : r.status === 'submitted' ? 3 : r.status === 'approved' ? 4 : 5

    for (let i = 1; i < rows.length; i++) {
      expect(rank(rows[i - 1])).toBeLessThanOrEqual(rank(rows[i]))
    }
  })

  it('paginates deterministically without overlap', async () => {
    const p1 = await svc.list(manager, { companyId: COMPANY, page: 1, pageSize: 4, status: 'all' })
    const p2 = await svc.list(manager, { companyId: COMPANY, page: 2, pageSize: 4, status: 'all' })
    const overlap = p1.rows.filter((a) => p2.rows.some((b) => b.id === a.id))
    expect(overlap).toHaveLength(0)
    expect(p1.totalPages).toBe(Math.ceil(p1.total / 4))
  })

  // ── Counters ───────────────────────────────────────────────────────────────

  it('computes board counters in the database', async () => {
    const stats = await svc.stats(manager, COMPANY)
    expect(typeof stats.activeNow).toBe('number')
    expect(stats.awaitingApproval).toBeGreaterThanOrEqual(0)
    expect(stats.byType.every((t) => t.active > 0)).toBe(true)
    expect(stats.byType.every((t) => typeof t.label === 'string')).toBe(true)

    // Every type counted as active must add up to the active total.
    const summed = stats.byType.reduce((n, t) => n + t.active, 0)
    expect(summed).toBe(stats.activeNow)
  })

  it('counts an expired permit as expired, never as active', async () => {
    const before = await svc.stats(manager, COMPANY)
    const active = await makeActive({ title: 'About to lapse for stats' })
    const mid = await svc.stats(manager, COMPANY)
    expect(mid.activeNow).toBe(before.activeNow + 1)

    await db.permit.update({
      where: { id: active.id }, data: { validTo: new Date(Date.now() - HOUR) },
    })
    const after = await svc.stats(manager, COMPANY)
    expect(after.activeNow).toBe(before.activeNow)
    expect(after.expiredOpen).toBe(before.expiredOpen + 1)
  })

  it('scopes counters to a site', async () => {
    const all = await svc.stats(manager, COMPANY)
    const siteB = await svc.stats(manager, COMPANY, SITE_B)
    expect(siteB.activeNow).toBeLessThanOrEqual(all.activeNow)
  })

  // ── Audit trail ────────────────────────────────────────────────────────────

  it('writes an append-only audit event and a signature for every step', async () => {
    const p = await svc.create(officer, newPermit({ title: 'Full trail' }))
    await confirmAllControls(officer, p.id)
    await svc.submit(employee, p.id)
    await svc.approve(officer, p.id, 'Walked the job.')
    await satisfyActivationGate(p.id)
    await svc.activate(employee, p.id)
    await svc.suspend(manager, p.id, 'Lightning within 8km.')
    await svc.resume(officer, p.id)
    const done = await svc.close(manager, p.id, { handbackConfirmed: true, statement: 'Area clear.' })

    const actions = done.timeline.map((e) => e.action)
    for (const expected of [
      'Permit created', 'Submitted for approval', 'Approved', 'Work started',
      'Suspended', 'Resumed', 'Closed',
    ]) {
      expect(actions).toContain(expected)
    }
    // Every entry is attributable, and the role that acted is on the record.
    expect(done.timeline.every((e) => !!e.actor && !!e.actorRole)).toBe(true)

    const signatures = done.signatures.map((s) => s.role)
    expect(signatures).toEqual(['applicant', 'approver', 'closer'])
    expect(done.signatures[0].name).toBe(employee.name)
    expect(done.signatures[1].statement).toBe('Walked the job.')

    // Newest first, so the drawer reads top-down.
    const times = done.timeline.map((e) => e.at.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('records who confirmed each control and clears it when unticked', async () => {
    const p = await svc.create(officer, newPermit())
    const confirmed = await svc.confirmControl(officer, p.id, p.controls[0].id, true)
    expect(confirmed.controls[0].confirmedBy).toBe(officer.name)
    expect(confirmed.controls[0].confirmedAt).toBeInstanceOf(Date)

    const cleared = await svc.confirmControl(officer, p.id, p.controls[0].id, false)
    expect(cleared.controls[0].confirmedBy).toBeNull()
    expect(cleared.controls[0].confirmedAt).toBeNull()
    expect(cleared.outstandingControls).toBe(confirmed.outstandingControls + 1)
  })

  // ── Cascades ───────────────────────────────────────────────────────────────

  it('cascades every child row when a permit is removed', async () => {
    const p = await svc.create(officer, newPermit({ type: 'confined_space' }))
    await svc.addGasTest(officer, p.id, PASSING_GAS)
    await svc.addIsolation(officer, p.id, { description: 'Feed valve locked', tagId: 'LOTO-X' })
    await confirmAllControls(officer, p.id)
    await svc.submit(officer, p.id)

    await db.permit.delete({ where: { id: p.id } })

    expect(await db.permitControl.count({ where: { permitId: p.id } })).toBe(0)
    expect(await db.isolationPoint.count({ where: { permitId: p.id } })).toBe(0)
    expect(await db.gasTest.count({ where: { permitId: p.id } })).toBe(0)
    expect(await db.permitSignature.count({ where: { permitId: p.id } })).toBe(0)
    expect(await db.permitEvent.count({ where: { permitId: p.id } })).toBe(0)
  })

  it('cascades permits when the tenant is deleted, leaving no orphans', async () => {
    const TMP = 'ptw-cascade-co'
    await db.company.create({ data: { id: TMP, name: 'Cascade Co' } })
    await db.site.create({ data: { id: 'ptw-cascade-site', companyId: TMP, name: 'S' } })
    const tmpMgr: Caller = {
      userId: 'x', name: 'Cascade Mgr',
      roles: [{ companyId: TMP, role: 'hse_manager', siteIds: [] }],
    }
    const p = await svc.create(tmpMgr, newPermit({ companyId: TMP, siteId: 'ptw-cascade-site' }))

    await db.company.delete({ where: { id: TMP } })
    await db.counter.deleteMany({ where: { companyId: TMP } })

    expect(await db.permit.count({ where: { id: p.id } })).toBe(0)
    expect(await db.permitControl.count({ where: { permitId: p.id } })).toBe(0)
  })

  it('refuses a permit referencing a company that does not exist', async () => {
    await expect(db.permit.create({
      data: {
        code: 'PTW-ghost', companyId: 'no-such-company', siteId: SITE,
        type: 'hot_work', title: 'Ghost', location: 'Nowhere', applicant: 'X',
        validFrom: new Date(), validTo: new Date(Date.now() + HOUR), createdBy: 'X',
      },
    })).rejects.toThrow()
  })
})
