import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ActivityError, ActivityService } from './activityService.js'
import type { Caller } from './incidentService.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The feed stores nothing: it is the modules' own append-only trails merged. That makes
 * it exactly the kind of thing a mock cannot check — the question is whether six real
 * queries join, scope and sort correctly, and whether a row belonging to another tenant
 * or another site can reach the list.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new ActivityService(db)

const COMPANY = 'act-itest-co'
const SITE_A = 'act-itest-site-a'
const SITE_B = 'act-itest-site-b'
const OTHER = 'act-itest-other-co'
const OTHER_SITE = 'act-itest-other-site'

const manager: Caller = {
  userId: 'act-mgr', name: 'ACT Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'act-out', name: 'ACT Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

d('ActivityService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'ACT ITest Co'], [OTHER, 'ACT Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE_A, COMPANY], [SITE_B, COMPANY], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {}, create: { id, companyId, name: `Site ${id}` },
      })
    }

    // One real record per source, so the merge has something from each to find.
    const incident = await db.incident.create({
      data: {
        number: 'INC-9001', companyId: COMPANY, siteId: SITE_A, title: 'Feed incident',
        type: 'near_miss', severity: 'Minor', location: 'Bay 1',
        reporter: 'Reporter A', occurredAt: new Date(),
      },
    })
    await db.incidentEvent.create({
      data: { incidentId: incident.id, action: 'Incident reported', actor: 'Reporter A' },
    })

    await db.correctiveAction.create({
      data: {
        code: 'CA-9001', companyId: COMPANY, siteId: SITE_A, title: 'Feed action',
        owner: 'Owner A', dueDate: new Date(), createdBy: 'Creator A',
      },
    })

    const permit = await db.permit.create({
      data: {
        code: 'PTW-9001', companyId: COMPANY, siteId: SITE_A, type: 'hot_work',
        title: 'Feed permit', location: 'Bay 1', applicant: 'Applicant A',
        validFrom: new Date(), validTo: new Date(Date.now() + 3600_000), createdBy: 'Creator A',
      },
    })
    await db.permitEvent.create({
      data: { permitId: permit.id, action: 'Approved', actor: 'Issuer A' },
    })

    const audit = await db.audit.create({
      data: {
        code: 'AUD-9001', companyId: COMPANY, siteId: SITE_B, title: 'Feed audit',
        type: 'internal', leadAuditor: 'Auditor B', templateId: 'tpl-5s',
        scheduledFor: new Date(), createdBy: 'Creator B',
      },
    })
    await db.auditEvent.create({
      data: { auditId: audit.id, action: 'Audit created', actor: 'Auditor B' },
    })

    const employee = await db.employee.create({
      data: {
        id: 'act-emp', employeeNo: 'EMP-ACT-1', companyId: COMPANY, siteId: SITE_B, name: 'Certified Person',
        department: 'Maintenance',
      },
    })
    await db.certificate.create({
      data: {
        number: 'CERT-ACT-1', qrKey: 'CERT-ACT-1', employeeId: employee.id, companyId: COMPANY,
        courseId: 'trn-101', courseName: 'Safety Induction',
        issueDate: new Date(), issuedBy: 'Trainer B',
      },
    })

    const asset = await db.asset.create({
      data: {
        id: 'act-asset', code: 'AST-9001', qrKey: 'AST-9001', companyId: COMPANY, siteId: SITE_A,
        name: 'Feed asset', category: 'ladder', serialNumber: 'S1', owner: 'Owner A',
        frequency: 'monthly', nextDueDate: new Date(), createdBy: 'Creator A',
      },
    })
    await db.inspection.create({
      data: {
        code: 'INS-9001', assetId: asset.id, companyId: COMPANY, siteId: SITE_A,
        scheduledFor: new Date(), assignedTo: 'Inspector A', status: 'completed',
        completedAt: new Date(), completedBy: 'Inspector A', outcome: 'failed',
      },
    })

    // The other tenant gets its own incident, which must never appear.
    const foreign = await db.incident.create({
      data: {
        number: 'INC-9999', companyId: OTHER, siteId: OTHER_SITE, title: 'Foreign incident',
        type: 'near_miss', severity: 'Minor', location: 'Elsewhere',
        reporter: 'Foreign Reporter', occurredAt: new Date(),
      },
    })
    await db.incidentEvent.create({
      data: { incidentId: foreign.id, action: 'Incident reported', actor: 'Foreign Reporter' },
    })
  })

  afterAll(async () => {
    await db.correctiveAction.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  it('merges every module’s trail into one feed', async () => {
    const feed = await svc.list(manager, COMPANY)
    const kinds = new Set(feed.map((f) => f.kind))

    expect(kinds.has('incident_reported')).toBe(true)
    expect(kinds.has('action_assigned')).toBe(true)
    expect(kinds.has('permit_issued')).toBe(true)
    expect(kinds.has('audit_created')).toBe(true)
    expect(kinds.has('training_completed')).toBe(true)
    expect(kinds.has('inspection_completed')).toBe(true)

    // Each entry says who did what to which record.
    const incident = feed.find((f) => f.target.includes('INC-9001'))!
    expect(incident.actor).toBe('Reporter A')
    expect(incident.text).toBe('reported')
  })

  it('orders newest first and bounds the feed', async () => {
    const feed = await svc.list(manager, COMPANY)
    const times = feed.map((f) => f.at.getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    expect(feed.length).toBeLessThanOrEqual(40)
    // Ids are prefixed per source, so two rows from different tables cannot collide.
    expect(new Set(feed.map((f) => f.id)).size).toBe(feed.length)
  })

  it('scopes to a site, including the sources whose site is indirect', async () => {
    const a = await svc.list(manager, COMPANY, SITE_A)
    expect(a.every((f) => f.siteId === SITE_A)).toBe(true)
    expect(a.some((f) => f.target.includes('INC-9001'))).toBe(true)
    // The certificate belongs to SITE_B through its holder, not through a column the
    // query could filter on, so it must be excluded here.
    expect(a.some((f) => f.kind === 'training_completed')).toBe(false)

    const b = await svc.list(manager, COMPANY, SITE_B)
    expect(b.every((f) => f.siteId === SITE_B)).toBe(true)
    expect(b.some((f) => f.kind === 'training_completed')).toBe(true)
    expect(b.some((f) => f.kind === 'audit_created')).toBe(true)
  })

  it('reports where a corrective action has got to rather than repeating it', async () => {
    const action = await db.correctiveAction.findFirstOrThrow({ where: { code: 'CA-9001' } })

    const before = await svc.list(manager, COMPANY)
    expect(before.find((f) => f.target.includes('CA-9001'))?.kind).toBe('action_assigned')

    await db.correctiveAction.update({
      where: { id: action.id },
      data: { status: 'verified', verifiedBy: 'Verifier A' },
    })

    const after = await svc.list(manager, COMPANY)
    const entries = after.filter((f) => f.target.includes('CA-9001'))
    // One entry, updated — not a second one alongside the first.
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('action_completed')
    expect(entries[0].actor).toBe('Verifier A')
  })

  it('never leaks another tenant’s activity', async () => {
    const feed = await svc.list(manager, COMPANY)
    expect(feed.some((f) => f.target.includes('INC-9999'))).toBe(false)
    expect(JSON.stringify(feed)).not.toContain('Foreign')

    await expect(svc.list(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.list(outsider, COMPANY)).rejects.toBeInstanceOf(ActivityError)
  })

  it('excludes archived incidents', async () => {
    const inc = await db.incident.findFirstOrThrow({ where: { number: 'INC-9001' } })
    await db.incident.update({ where: { id: inc.id }, data: { archived: true } })

    const feed = await svc.list(manager, COMPANY)
    expect(feed.some((f) => f.target.includes('INC-9001'))).toBe(false)

    await db.incident.update({ where: { id: inc.id }, data: { archived: false } })
  })

  it('returns an empty feed for a workspace with no activity', async () => {
    const TMP = 'act-empty-co'
    await db.company.upsert({ where: { id: TMP }, update: {}, create: { id: TMP, name: 'Empty' } })
    const tmp: Caller = {
      userId: 'x', name: 'Tmp', roles: [{ companyId: TMP, role: 'admin', siteIds: [] }],
    }
    expect(await svc.list(tmp, TMP)).toEqual([])
    await db.company.delete({ where: { id: TMP } })
  })
})
