import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PermitService } from './permitService.js'
import { PermitReviewService } from './permitReview.js'
import { PermitPeopleService } from './permitPeople.js'
import { EmployeeService } from './employeeService.js'
import type { Caller } from '../domain/caller.js'

/**
 * Integration tests against a REAL PostgreSQL database.
 *
 * The approval chain is the control: three people sign a transfer of authority, in order,
 * each checking what the previous one could not. So most of what is tested is that the
 * order cannot be broken and the activation gate cannot be talked past.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const permits = new PermitService(db)
const review = new PermitReviewService(db)
const people = new PermitPeopleService(db)
const employees = new EmployeeService(db)

const COMPANY = 'ptwrev-itest-co'
const SITE = 'ptwrev-itest-site'

const role = (r: string, id: string): Caller => ({
  userId: `ptwrev-${id}`, name: `ITest ${id}`,
  roles: [{ companyId: COMPANY, role: r as never, siteIds: [] }],
})

const admin = role('admin', 'Admin')
const hse = role('hse_manager', 'HSE')
const officer = role('safety_officer', 'Officer')
const supervisor = role('supervisor', 'Supervisor')
const employee = role('employee', 'Employee')
const ceo = role('ceo', 'Ceo')

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

d('Permit review chain — integration (real Postgres)', () => {
  beforeAll(async () => {
    await db.company.upsert({ where: { id: COMPANY }, update: {}, create: { id: COMPANY, name: 'PTW Review Co' } })
    await db.site.upsert({
      where: { id: SITE }, update: {},
      create: { id: SITE, companyId: COMPANY, name: 'Review Site', short: 'RVW', city: 'Bintulu' },
    })
  })

  afterAll(async () => {
    await db.permit.deleteMany({ where: { companyId: COMPANY } })
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
    await db.company.deleteMany({ where: { id: COMPANY } })
    await db.counter.deleteMany({ where: { companyId: COMPANY } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.permit.deleteMany({ where: { companyId: COMPANY } })
    await db.employee.deleteMany({ where: { companyId: COMPANY } })
    await db.adminAuditEntry.deleteMany({ where: { companyId: COMPANY } })
  })

  /** A submitted cold-work permit — no gas test or isolation required, so the chain is the subject. */
  async function submitted() {
    const p = await permits.create(admin, {
      companyId: COMPANY, siteId: SITE, type: 'cold_work',
      title: 'Paint the handrail', location: 'Jetty 2',
      validFrom: hoursFromNow(1), validTo: hoursFromNow(6),
    } as never)
    await permits.submit(admin, p.id)
    return p
  }

  // ── Order ────────────────────────────────────────────────────────────────

  it('walks submitted → supervisor → HSE → area authority → approved', async () => {
    const p = await submitted()

    expect((await review.advance(admin, p.id, 'Entering review.')).status).toBe('supervisor_review')
    expect((await review.advance(supervisor, p.id, 'Method and crew are right.')).status).toBe('hse_review')
    expect((await review.advance(hse, p.id, 'Controls adequate.')).status).toBe('area_authority')
    expect((await review.advance(ceo, p.id, 'Plant is free.')).status).toBe('approved')
  })

  it('cannot skip a stage, because advance takes no target', async () => {
    const p = await submitted()
    await review.advance(admin, p.id, 'Entering review.')

    // The only way forward is one stage at a time; there is no call that names `approved`.
    const after = await review.status(admin, p.id)
    expect(after.status).toBe('supervisor_review')
    expect(after.chain.find((c) => c.stage === 'hse_review')?.state).toBe('pending')
    expect(after.chain.find((c) => c.stage === 'area_authority')?.state).toBe('pending')
  })

  it('refuses the area authority stage to someone who is not one', async () => {
    const p = await submitted()
    await review.advance(admin, p.id, 'Enter.')
    await review.advance(supervisor, p.id, 'Supervisor ok.')
    await review.advance(hse, p.id, 'HSE ok.')

    // A safety officer may sign HSE review but not the area authority stage.
    await expect(review.advance(officer, p.id, 'Trying.')).rejects.toMatchObject({ status: 403 })
    await expect(review.advance(supervisor, p.id, 'Trying.')).rejects.toMatchObject({ status: 403 })
    await expect(review.advance(employee, p.id, 'Trying.')).rejects.toMatchObject({ status: 403 })
  })

  it('refuses supervisor review to an employee', async () => {
    const p = await submitted()
    await review.advance(admin, p.id, 'Enter.')
    await expect(review.advance(employee, p.id, 'Trying.')).rejects.toMatchObject({ status: 403 })
  })

  it('refuses to advance a permit that is not in the chain', async () => {
    const p = await permits.create(admin, {
      companyId: COMPANY, siteId: SITE, type: 'cold_work',
      title: 'Draft only', location: 'Shed',
      validFrom: hoursFromNow(1), validTo: hoursFromNow(4),
    } as never)
    await expect(review.advance(admin, p.id, 'Trying.')).rejects.toThrow(/not awaiting review/i)
  })

  it('requires a statement of what was checked', async () => {
    const p = await submitted()
    await expect(review.advance(admin, p.id, '   ')).rejects.toThrow(/what you checked/i)
  })

  // ── Return ───────────────────────────────────────────────────────────────

  it('sends a permit back to draft and voids the signatures so the chain restarts', async () => {
    const p = await submitted()
    await review.advance(admin, p.id, 'Enter.')
    await review.advance(supervisor, p.id, 'Supervisor ok.')

    const back = await review.returnToApplicant(hse, p.id, 'Method statement is missing the lift plan.')
    expect(back.status).toBe('draft')

    // A fix nobody re-reviewed is a fix nobody checked, so the earlier sign-off is gone.
    const sigs = await db.permitSignature.count({ where: { permitId: p.id, role: 'approver' } })
    expect(sigs).toBe(0)
  })

  // ── Audit ────────────────────────────────────────────────────────────────

  it('writes both a timeline entry and a tenant audit entry for every transition', async () => {
    const p = await submitted()
    await review.advance(admin, p.id, 'Enter.', { ip: '203.0.113.9', device: 'Chrome' })
    await review.advance(supervisor, p.id, 'Supervisor ok.')

    const timeline = await db.permitEvent.findMany({ where: { permitId: p.id }, orderBy: { at: 'asc' } })
    expect(timeline.map((t) => t.action)).toContain('Supervisor review signed')

    const audit = await db.adminAuditEntry.findMany({
      where: { companyId: COMPANY, module: 'permits' }, orderBy: { at: 'asc' },
    })
    expect(audit.map((a) => a.action)).toContain('Supervisor review signed')
    expect(audit[0].ip).toBe('203.0.113.9')
    expect(audit.every((a) => a.target === p.code)).toBe(true)
  })

  // ── The activation gate ──────────────────────────────────────────────────

  describe('activation gate', () => {
    async function approved() {
      const p = await submitted()
      await review.advance(admin, p.id, 'Enter.')
      await review.advance(supervisor, p.id, 'ok')
      await review.advance(hse, p.id, 'ok')
      await review.advance(ceo, p.id, 'ok')
      return p
    }

    async function namedPerson(permitId: string) {
      const e = await employees.create(admin, COMPANY, {
        name: `Worker ${Math.random().toString(36).slice(2, 7)}`, siteId: SITE,
        medicalExpiry: inDays(200),
      } as never)
      return people.add(admin, permitId, { employeeId: e.id })
    }

    it('refuses activation with nobody named', async () => {
      const p = await approved()
      await expect(permits.activate(admin, p.id)).rejects.toThrow(/Nobody is named/i)
    })

    it('refuses activation without a toolbox talk', async () => {
      const p = await approved()
      await namedPerson(p.id)
      await expect(permits.activate(admin, p.id)).rejects.toThrow(/toolbox talk has not been recorded/i)
    })

    it('refuses activation until everyone named has acknowledged the toolbox talk', async () => {
      const p = await approved()
      const a = await namedPerson(p.id)
      await namedPerson(p.id)
      await review.recordToolbox(admin, p.id, {})

      await expect(permits.activate(admin, p.id)).rejects.toThrow(/have not acknowledged/i)
      await review.acknowledgeToolbox(admin, a.id)
      // Still one outstanding.
      await expect(permits.activate(admin, p.id)).rejects.toThrow(/have not acknowledged/i)
    })

    it('refuses activation until mandatory PPE is acknowledged, and voids it if the list changes', async () => {
      const p = await approved()
      const a = await namedPerson(p.id)
      await review.recordToolbox(admin, p.id, {})
      await review.acknowledgeToolbox(admin, a.id)

      await review.setRequiredPpe(admin, p.id, ['Helmet', 'Harness'])
      await expect(permits.activate(admin, p.id)).rejects.toThrow(/PPE has not been acknowledged/i)

      await review.acknowledgePpe(admin, p.id)
      await expect(permits.activate(admin, p.id)).resolves.toMatchObject({ status: 'active' })

      // Changing the list after the fact means what was signed for is no longer required.
      const after = await review.setRequiredPpe(admin, p.id, ['Helmet', 'Harness', 'SCBA'])
      expect(after.activationBlockers.some((b) => /PPE/.test(b))).toBe(true)
    })

    it('activates once the whole gate is satisfied', async () => {
      const p = await approved()
      const a = await namedPerson(p.id)
      await review.recordToolbox(admin, p.id, { supervisor: 'Site Supervisor' })
      await review.acknowledgeToolbox(admin, a.id)

      const status = await review.status(admin, p.id)
      expect(status.activationBlockers).toEqual([])

      const live = await permits.activate(admin, p.id)
      expect(live.status).toBe('active')
    })

    it('refuses a toolbox talk recorded in the future', async () => {
      const p = await approved()
      await expect(review.recordToolbox(admin, p.id, { heldAt: hoursFromNow(3) }))
        .rejects.toThrow(/before it has happened/i)
    })
  })

  // ── JSA ──────────────────────────────────────────────────────────────────

  describe('job safety analysis', () => {
    it('requires a control for every hazard and bumps the permit version', async () => {
      const p = await submitted()
      const before = (await permits.get(admin, p.id)).version

      await expect(review.addJsaStep(admin, p.id, { hazard: 'Falling object', control: '' } as never))
        .rejects.toThrow(/not an analysis/i)
      await expect(review.addJsaStep(admin, p.id, { hazard: '', control: 'Netting' } as never))
        .rejects.toThrow(/Name the hazard/i)

      const step = await review.addJsaStep(admin, p.id, {
        hazard: 'Falling object', risk: 'High', control: 'Debris netting and exclusion zone',
        responsible: 'Site Supervisor', residualRisk: 'Low',
      })
      expect(step.sequence).toBe(1)
      // An approver who signed version 3 did not sign version 4.
      expect((await permits.get(admin, p.id)).version).toBeGreaterThan(before)
    })

    it('numbers steps in order and supports edit and removal', async () => {
      const p = await submitted()
      await review.addJsaStep(admin, p.id, { hazard: 'First', control: 'A' })
      const second = await review.addJsaStep(admin, p.id, { hazard: 'Second', control: 'B' })
      expect(second.sequence).toBe(2)

      const edited = await review.updateJsaStep(admin, second.id, { residualRisk: 'Medium' })
      expect(edited.residualRisk).toBe('Medium')

      await review.removeJsaStep(admin, second.id)
      expect(await review.listJsa(admin, p.id)).toHaveLength(1)
    })

    it('refuses any JSA change once the permit is closed', async () => {
      const p = await submitted()
      const step = await review.addJsaStep(admin, p.id, { hazard: 'H', control: 'C' })
      await db.permit.update({ where: { id: p.id }, data: { status: 'closed' } })

      await expect(review.addJsaStep(admin, p.id, { hazard: 'X', control: 'Y' })).rejects.toThrow(/closed/i)
      await expect(review.updateJsaStep(admin, step.id, { hazard: 'Z' })).rejects.toThrow(/closed/i)
      await expect(review.removeJsaStep(admin, step.id)).rejects.toThrow(/closed/i)
    })
  })
})
