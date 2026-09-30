import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { AuditError, AuditService } from './auditService.js'
import { AUDIT_TEMPLATES, SEVERITY_DUE_DAYS } from './auditCatalog.js'
import type { Caller } from '../domain/caller.js'

/**
 * Integration tests — these run against a REAL PostgreSQL database, not a fake.
 *
 * The rule that makes this module worth having is the closure gate: an audit cannot be
 * closed while any finding's corrective action is still open. Everything else — scoring
 * that excludes N/A, severity-driven due dates, checklist validation against the server's
 * own template — exists to make that gate mean something. All of it is exercised here
 * against real SQL, because transactional counters, cascade behaviour and tenant scoping
 * are exactly what a mocked suite cannot show you.
 *
 * Requires a database: `npm run db:start && npm run prisma:migrate`.
 * Skipped automatically when DATABASE_URL is absent so CI without a DB stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const svc = new AuditService(db)

const COMPANY = 'aud-itest-co'
const SITE = 'aud-itest-site'
const SITE_B = 'aud-itest-site-b'
const OTHER = 'aud-itest-other-co'
const OTHER_SITE = 'aud-itest-other-site'

const manager: Caller = {
  userId: 'aud-mgr', name: 'AUD Manager',
  roles: [{ companyId: COMPANY, role: 'hse_manager', siteIds: [] }],
}
const officer: Caller = {
  userId: 'aud-so', name: 'AUD Officer',
  roles: [{ companyId: COMPANY, role: 'safety_officer', siteIds: [SITE] }],
}
const supervisor: Caller = {
  userId: 'aud-sup', name: 'AUD Supervisor',
  roles: [{ companyId: COMPANY, role: 'supervisor', siteIds: [SITE] }],
}
const employee: Caller = {
  userId: 'aud-emp', name: 'AUD Employee',
  roles: [{ companyId: COMPANY, role: 'employee', siteIds: [] }],
}
const outsider: Caller = {
  userId: 'aud-out', name: 'AUD Outsider',
  roles: [{ companyId: OTHER, role: 'admin', siteIds: [] }],
}

const DAY = 86400_000
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

/** The 5S template — one section, six items, the smallest real checklist. */
const FIVE_S = AUDIT_TEMPLATES.find((t) => t.id === 'tpl-5s')!
const ITEMS = FIVE_S.sections[0].items

const newAudit = (over: Partial<Parameters<typeof svc.createAudit>[1]> = {}) => ({
  companyId: COMPANY,
  siteId: SITE,
  title: '5S quality walk — Senari warehouse',
  type: 'quality' as const,
  department: 'Warehouse',
  leadAuditor: 'AUD Officer',
  team: ['AUD Employee'],
  templateId: 'tpl-5s',
  scheduledFor: dateOnly(new Date(Date.now() + 3 * DAY)),
  durationDays: 1,
  priority: 'Medium' as const,
  ...over,
})

/** A complete all-pass answer set built from the server's own template. */
const passAnswers = () =>
  ITEMS.map((i) => ({
    itemId: i.id,
    section: FIVE_S.sections[0].title,
    text: i.text,
    result: 'pass' as const,
  }))

/** Drives an audit to `completed`, optionally failing the first item. */
async function completeWith(
  over: Parameters<typeof newAudit>[0] = {},
  fail?: { severity: 'Critical' | 'Major' | 'Minor' | 'Observation'; owner?: string },
) {
  const audit = await svc.createAudit(manager, newAudit(over))
  await svc.startAudit(officer, audit.id)
  const answers = passAnswers()
  if (fail) answers[0] = { ...answers[0], result: 'fail' as never }
  const result = await svc.completeAudit(officer, audit.id, {
    answers,
    fails: fail
      ? {
          [ITEMS[0].id]: {
            severity: fail.severity,
            description: 'Aisle blocked by stacked pallets.',
            owner: fail.owner ?? 'AUD Employee',
          },
        }
      : {},
    signature: 'AUD Officer',
  })
  return result
}

d('AuditService — integration (real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[COMPANY, 'AUD ITest Co'], [OTHER, 'AUD Other Co']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId] of [[SITE, COMPANY], [SITE_B, COMPANY], [OTHER_SITE, OTHER]]) {
      await db.site.upsert({
        where: { id }, update: {}, create: { id, companyId, name: `Site ${id}` },
      })
    }
  })

  afterAll(async () => {
    await db.correctiveAction.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.company.deleteMany({ where: { id: { in: [COMPANY, OTHER] } } })
    await db.counter.deleteMany({ where: { companyId: { in: [COMPANY, OTHER] } } })
    await db.$disconnect()
  })

  // ── Templates ──────────────────────────────────────────────────────────────

  it('lists the built-in templates plus the workspace’s own', async () => {
    const before = await svc.listTemplates(manager, COMPANY)
    expect(before.length).toBe(AUDIT_TEMPLATES.length)
    expect(before.every((t) => !t.custom)).toBe(true)

    const made = await svc.createTemplate(manager, COMPANY, 'Night shift walk', [
      'Lighting adequate', 'Exits clear', 'Lone worker check-in logged',
    ])
    expect(made.custom).toBe(true)
    expect(made.sections[0].items).toHaveLength(3)

    const after = await svc.listTemplates(manager, COMPANY)
    expect(after.length).toBe(AUDIT_TEMPLATES.length + 1)
  })

  it('refuses a template that is too thin to be an audit, and a non-reviewer author', async () => {
    await expect(svc.createTemplate(manager, COMPANY, 'Too short', ['One', 'Two']))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createTemplate(manager, COMPANY, '  ', ['a', 'b', 'c']))
      .rejects.toMatchObject({ code: 'validation' })
    for (const caller of [officer, supervisor, employee]) {
      await expect(svc.createTemplate(caller, COMPANY, 'Not allowed', ['a', 'b', 'c']))
        .rejects.toMatchObject({ status: 403 })
    }
  })

  it('refuses an audit built on another tenant’s custom template', async () => {
    const otherMgr: Caller = {
      userId: 'aud-other-mgr', name: 'Other Mgr',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    const theirs = await svc.createTemplate(otherMgr, OTHER, 'Their checklist', ['a', 'b', 'c'])

    // A real template id — just not this workspace's. Scoring one tenant's audit against
    // another's checklist is the failure being prevented.
    await expect(svc.createAudit(manager, newAudit({ templateId: theirs.id })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  // ── Planning ───────────────────────────────────────────────────────────────

  it('plans an audit with a per-tenant reference and an opening trail entry', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'First planned audit' }))
    expect(audit.code).toMatch(/^AUD-\d+$/)
    expect(audit.status).toBe('planned')
    expect(audit.templateName).toBe(FIVE_S.name)
    expect(audit.findings).toHaveLength(0)
    expect(audit.timeline.map((e) => e.action)).toContain('Audit created')
  })

  it('allocates unique audit numbers under concurrent planning', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) => svc.createAudit(manager, newAudit({ title: `Concurrent ${i}` }))),
    )
    expect(new Set(created.map((a) => a.code)).size).toBe(8)
  })

  it('numbers audits per tenant', async () => {
    const otherMgr: Caller = {
      userId: 'aud-other-mgr2', name: 'Other Mgr 2',
      roles: [{ companyId: OTHER, role: 'hse_manager', siteIds: [] }],
    }
    const theirs = await svc.createAudit(otherMgr, newAudit({
      companyId: OTHER, siteId: OTHER_SITE, title: 'Tenant B audit',
    }))
    expect(theirs.code).toBe('AUD-3010')
  })

  it('requires a reviewer role to plan, and rejects incomplete or foreign input', async () => {
    for (const caller of [officer, supervisor, employee]) {
      await expect(svc.createAudit(caller, newAudit())).rejects.toMatchObject({ status: 403 })
    }
    await expect(svc.createAudit(manager, newAudit({ title: '  ' })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAudit(manager, newAudit({ leadAuditor: '' })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAudit(manager, newAudit({ scheduledFor: 'not-a-date' })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAudit(manager, newAudit({ siteId: OTHER_SITE })))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.createAudit(manager, newAudit({ templateId: 'tpl-nope' })))
      .rejects.toMatchObject({ code: 'validation' })
  })

  it('flags a planned audit past its date as overdue without storing that state', async () => {
    const audit = await svc.createAudit(manager, newAudit({
      title: 'Overdue plan', scheduledFor: dateOnly(new Date(Date.now() - 4 * DAY)),
    }))
    const { audit: view } = await svc.getAuditDetail(manager, audit.id)
    expect(view.overdue).toBe(true)
    expect(view.daysToStart).toBe(-4)
    expect((await db.audit.findUniqueOrThrow({ where: { id: audit.id } })).status).toBe('planned')
  })

  // ── Running ────────────────────────────────────────────────────────────────

  it('lets the audit team start and complete, but not a bystander', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'Team gate' }))

    // Neither lead auditor, nor named team, nor a reviewer.
    await expect(svc.startAudit(supervisor, audit.id)).rejects.toMatchObject({ status: 403 })

    // The lead auditor may.
    const started = await svc.startAudit(officer, audit.id)
    expect(started.status).toBe('in_progress')
    expect(started.startedAt).not.toBeNull()

    // And a named team member may complete it.
    const done = await svc.completeAudit(employee, audit.id, {
      answers: passAnswers(), fails: {}, signature: 'AUD Employee',
    })
    expect(done.audit.status).toBe('completed')
  })

  it('enforces the lifecycle order', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'Lifecycle' }))

    await expect(svc.completeAudit(officer, audit.id, {
      answers: passAnswers(), fails: {}, signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })
    await expect(svc.closeAudit(manager, audit.id)).rejects.toMatchObject({ code: 'validation' })

    await svc.startAudit(officer, audit.id)
    await expect(svc.startAudit(officer, audit.id)).rejects.toMatchObject({ code: 'validation' })
  })

  // ── Scoring ────────────────────────────────────────────────────────────────

  it('scores only applicable items, excluding N/A from the denominator', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'Scoring' }))
    await svc.startAudit(officer, audit.id)

    // 6 items: 3 pass, 1 fail, 2 N/A → 3 of 4 applicable = 75%.
    const answers = passAnswers()
    answers[0] = { ...answers[0], result: 'fail' as never }
    answers[4] = { ...answers[4], result: 'na' as never }
    answers[5] = { ...answers[5], result: 'na' as never }

    const { audit: done } = await svc.completeAudit(officer, audit.id, {
      answers,
      fails: {
        [ITEMS[0].id]: { severity: 'Minor', description: 'Clutter in aisle.', owner: 'AUD Employee' },
      },
      signature: 'AUD Officer',
    })
    expect(done.score).toBe(75)
  })

  it('scores an entirely non-applicable checklist as 100 rather than dividing by zero', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'All NA' }))
    await svc.startAudit(officer, audit.id)
    const { audit: done } = await svc.completeAudit(officer, audit.id, {
      answers: passAnswers().map((a) => ({ ...a, result: 'na' as const })),
      fails: {},
      signature: 'AUD Officer',
    })
    expect(done.score).toBe(100)
  })

  it('refuses an incomplete, invented or repeated checklist', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'Checklist validation' }))
    await svc.startAudit(officer, audit.id)
    const full = passAnswers()

    await expect(svc.completeAudit(officer, audit.id, {
      answers: full.slice(0, 3), fails: {}, signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeAudit(officer, audit.id, {
      answers: full.map((a, i) => ({ ...a, itemId: `invented-${i}` })), fails: {}, signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    // Right length, but one item answered six times.
    await expect(svc.completeAudit(officer, audit.id, {
      answers: full.map(() => ({ ...full[0] })), fails: {}, signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    // Rejected submissions must not half-complete the record.
    expect((await db.audit.findUniqueOrThrow({ where: { id: audit.id } })).status).toBe('in_progress')
  })

  it('requires a description, owner and signature before a failure is accepted', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'Fail requirements' }))
    await svc.startAudit(officer, audit.id)
    const answers = passAnswers()
    answers[0] = { ...answers[0], result: 'fail' as never }

    // No finding supplied at all.
    await expect(svc.completeAudit(officer, audit.id, { answers, fails: {}, signature: 'X' }))
      .rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeAudit(officer, audit.id, {
      answers,
      fails: { [ITEMS[0].id]: { severity: 'Minor', description: '   ', owner: 'AUD Employee' } },
      signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeAudit(officer, audit.id, {
      answers,
      fails: { [ITEMS[0].id]: { severity: 'Minor', description: 'Real defect.', owner: '' } },
      signature: 'X',
    })).rejects.toMatchObject({ code: 'validation' })

    await expect(svc.completeAudit(officer, audit.id, {
      answers,
      fails: { [ITEMS[0].id]: { severity: 'Minor', description: 'Real defect.', owner: 'AUD Employee' } },
      signature: '  ',
    })).rejects.toMatchObject({ code: 'validation' })

    expect(await db.auditFinding.count({ where: { auditId: audit.id } })).toBe(0)
  })

  it('stores the section and text from the server template, not the client’s', async () => {
    const audit = await svc.createAudit(manager, newAudit({ title: 'Label integrity' }))
    await svc.startAudit(officer, audit.id)
    await svc.completeAudit(officer, audit.id, {
      answers: passAnswers().map((a) => ({ ...a, section: 'Made up', text: 'Everything is fine' })),
      fails: {},
      signature: 'AUD Officer',
    })

    const stored = await db.audit.findUniqueOrThrow({ where: { id: audit.id } })
    const texts = (stored.answers as { text: string; section: string }[])
    expect(texts.some((t) => t.text === 'Everything is fine')).toBe(false)
    expect(texts[0].section).toBe(FIVE_S.sections[0].title)
  })

  // ── Findings and their actions ─────────────────────────────────────────────

  it('raises a corrective action for every finding, with severity driving the date', async () => {
    for (const severity of ['Critical', 'Major', 'Minor', 'Observation'] as const) {
      const { audit, findings } = await completeWith({ title: `Severity ${severity}` }, { severity })

      expect(findings).toHaveLength(1)
      const f = findings[0]
      expect(f.code).toMatch(/^F-\d+$/)
      expect(f.severity).toBe(severity)
      expect(f.category).toBe(FIVE_S.sections[0].title)
      expect(f.status).toBe('Open')

      const action = await db.correctiveAction.findFirstOrThrow({ where: { id: f.actionId } })
      expect(action.source).toBe('audit')
      expect(action.owner).toBe('AUD Employee')
      expect(dateOnly(action.dueDate))
        .toBe(dateOnly(new Date(Date.now() + SEVERITY_DUE_DAYS[severity] * DAY)))
      // Critical and Major escalate; Minor and Observation do not.
      expect(action.priority).toBe(
        severity === 'Critical' || severity === 'Major' ? 'High'
          : severity === 'Minor' ? 'Medium' : 'Low',
      )
      expect(audit.openFindings).toBe(1)
    }
  })

  it('tracks a finding’s status from its action as the action progresses', async () => {
    const { findings } = await completeWith({ title: 'Finding status' }, { severity: 'Major' })
    const actionId = findings[0].actionId

    const statuses: [string, string][] = [
      ['in_progress', 'Action In Progress'],
      ['completed', 'Awaiting Verification'],
      ['verified', 'Closed'],
    ]
    for (const [dbStatus, expected] of statuses) {
      await db.correctiveAction.update({ where: { id: actionId }, data: { status: dbStatus as never } })
      const all = await svc.listFindings(manager, COMPANY)
      expect(all.find((f) => f.actionId === actionId)?.status).toBe(expected)
    }
  })

  it('marks a finding action overdue once its due date passes', async () => {
    const { findings } = await completeWith({ title: 'Overdue action' }, { severity: 'Critical' })
    await db.correctiveAction.update({
      where: { id: findings[0].actionId },
      data: { dueDate: new Date(Date.now() - 3 * DAY) },
    })
    const all = await svc.listFindings(manager, COMPANY)
    const mine = all.find((f) => f.id === findings[0].id)
    expect(mine?.actionOverdue).toBe(true)

    // A settled action is never "overdue" — it is done.
    await db.correctiveAction.update({
      where: { id: findings[0].actionId }, data: { status: 'verified' },
    })
    const after = await svc.listFindings(manager, COMPANY)
    expect(after.find((f) => f.id === findings[0].id)?.actionOverdue).toBe(false)
  })

  it('orders the findings register open-first, then by severity', async () => {
    const rows = await svc.listFindings(manager, COMPANY)
    const SEV = { Critical: 0, Major: 1, Minor: 2, Observation: 3 }
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]
      const b = rows[i]
      const openA = a.status === 'Closed' ? 1 : 0
      const openB = b.status === 'Closed' ? 1 : 0
      expect(openA).toBeLessThanOrEqual(openB)
      if (openA === openB) expect(SEV[a.severity]).toBeLessThanOrEqual(SEV[b.severity])
    }
  })

  it('filters findings by severity', async () => {
    const critical = await svc.listFindings(manager, COMPANY, 'Critical')
    expect(critical.every((f) => f.severity === 'Critical')).toBe(true)
    expect(critical.length).toBeGreaterThan(0)
  })

  // ── Closure gate ───────────────────────────────────────────────────────────

  it('refuses to close an audit while any finding action is unverified', async () => {
    const { audit, findings } = await completeWith({ title: 'Closure gate' }, { severity: 'Major' })

    await expect(svc.closeAudit(manager, audit.id)).rejects.toMatchObject({ code: 'validation' })

    // Completing the action is not closing it — verification is a separate act.
    await db.correctiveAction.update({
      where: { id: findings[0].actionId }, data: { status: 'completed' },
    })
    await expect(svc.closeAudit(manager, audit.id)).rejects.toMatchObject({ code: 'validation' })

    await db.correctiveAction.update({
      where: { id: findings[0].actionId }, data: { status: 'verified' },
    })
    const closed = await svc.closeAudit(manager, audit.id)
    expect(closed.status).toBe('closed')
    expect(closed.closedAt).not.toBeNull()
    expect(closed.timeline.map((e) => e.action)).toContain('Audit closed')
  })

  it('accepts a cancelled action as settled for closure', async () => {
    const { audit, findings } = await completeWith({ title: 'Cancelled settles' }, { severity: 'Minor' })
    await db.correctiveAction.update({
      where: { id: findings[0].actionId }, data: { status: 'cancelled' },
    })
    expect((await svc.closeAudit(manager, audit.id)).status).toBe('closed')
  })

  it('closes a clean audit immediately and requires a reviewer to do it', async () => {
    const { audit } = await completeWith({ title: 'Clean audit' })
    expect(audit.score).toBe(100)
    expect(audit.findings).toHaveLength(0)

    for (const caller of [officer, supervisor, employee]) {
      await expect(svc.closeAudit(caller, audit.id)).rejects.toMatchObject({ status: 403 })
    }
    expect((await svc.closeAudit(manager, audit.id)).status).toBe('closed')
  })

  // ── Obligations ────────────────────────────────────────────────────────────

  it('derives obligation status from the renewal date', async () => {
    const mk = (days: number, requirement: string) =>
      db.complianceObligation.create({
        data: {
          companyId: COMPANY, siteId: SITE, regulation: 'OSHA 1994',
          requirement, responsible: 'AUD Manager',
          nextDue: new Date(Date.now() + days * DAY),
        },
      })
    await mk(-5, 'Lapsed licence')
    await mk(10, 'Renewal due soon')
    await mk(200, 'Comfortable')

    const rows = await svc.listObligations(manager, COMPANY)
    const by = (r: string) => rows.find((o) => o.requirement === r)!
    expect(by('Lapsed licence').status).toBe('Overdue')
    expect(by('Renewal due soon').status).toBe('Expiring Soon')
    expect(by('Comfortable').status).toBe('Compliant')
    // Soonest first — the register is a queue.
    expect(rows[0].daysToDue).toBeLessThanOrEqual(rows[rows.length - 1].daysToDue)
  })

  it('renews an obligation and tracks the expiry only when there was one', async () => {
    const withExpiry = await db.complianceObligation.create({
      data: {
        companyId: COMPANY, siteId: SITE, regulation: 'FMA 1967', requirement: 'PMT certificate',
        responsible: 'AUD Manager', nextDue: new Date(Date.now() - DAY),
        expiryDate: new Date(Date.now() - DAY),
      },
    })
    const without = await db.complianceObligation.create({
      data: {
        companyId: COMPANY, siteId: SITE, regulation: 'EQA 1974', requirement: 'Waste manifest review',
        responsible: 'AUD Manager', nextDue: new Date(Date.now() - DAY),
      },
    })

    const next = dateOnly(new Date(Date.now() + 365 * DAY))
    const a = await svc.renewObligation(manager, withExpiry.id, next, 'Renewed at DOSH counter.')
    expect(dateOnly(a.nextDue)).toBe(next)
    expect(a.expiryDate && dateOnly(a.expiryDate)).toBe(next)
    expect(a.status).toBe('Compliant')
    expect(a.notes).toBe('Renewed at DOSH counter.')
    expect(a.lastRenewedAt).not.toBeNull()

    // One with no expiry must not acquire one it never had.
    const b = await svc.renewObligation(manager, without.id, next)
    expect(b.expiryDate).toBeNull()
  })

  it('requires a reviewer and a real date to renew', async () => {
    const o = await db.complianceObligation.findFirstOrThrow({ where: { companyId: COMPANY } })
    await expect(svc.renewObligation(officer, o.id, dateOnly(new Date())))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.renewObligation(manager, o.id, '  '))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.renewObligation(manager, o.id, 'not-a-date'))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.renewObligation(manager, 'no-such-obligation', dateOnly(new Date())))
      .rejects.toMatchObject({ status: 404 })
  })

  // ── Controlled documents ───────────────────────────────────────────────────

  it('uploads a document into pending approval and records the first version', async () => {
    const doc = await svc.addDocumentVersion(officer, null, {
      companyId: COMPANY, siteId: SITE, name: 'HIRARC Procedure', kind: 'sop',
      sizeKb: 840, note: 'Initial upload',
    })
    expect(doc.version).toBe('1.0')
    expect(doc.status).toBe('PendingApproval')
    expect(doc.owner).toBe('AUD Officer')
    expect(doc.versions).toHaveLength(1)
  })

  it('bumps the version and drops approval when a document is superseded', async () => {
    const doc = await svc.addDocumentVersion(officer, null, {
      companyId: COMPANY, name: 'Permit-to-Work Procedure', kind: 'sop', sizeKb: 1220,
    })
    const approved = await svc.approveDocument(manager, doc.id)
    expect(approved.status).toBe('Approved')
    expect(approved.approvedBy).toBe('AUD Manager')

    const v2 = await svc.addDocumentVersion(officer, doc.id, {
      companyId: COMPANY, sizeKb: 1300, note: 'Sign-back step added',
    })
    // A controlled document that keeps its approval through an edit is not controlled.
    expect(v2.version).toBe('1.1')
    expect(v2.status).toBe('PendingApproval')
    expect(v2.approvedBy).toBeNull()
    expect(v2.approvedAt).toBeNull()
    expect(v2.versions).toHaveLength(2)
    // History is append-only, newest first.
    expect(v2.versions[0].version).toBe('1.1')
    expect(v2.versions[1].version).toBe('1.0')
  })

  it('gates document management and approval by role', async () => {
    await expect(svc.addDocumentVersion(employee, null, {
      companyId: COMPANY, name: 'Not allowed', kind: 'policy',
    })).rejects.toMatchObject({ status: 403 })

    const doc = await svc.addDocumentVersion(officer, null, {
      companyId: COMPANY, name: 'Approval gate', kind: 'policy',
    })
    // The uploader cannot approve their own document.
    await expect(svc.approveDocument(officer, doc.id)).rejects.toMatchObject({ status: 403 })
    expect((await svc.approveDocument(manager, doc.id)).status).toBe('Approved')
    // And it cannot be approved twice.
    await expect(svc.approveDocument(manager, doc.id)).rejects.toMatchObject({ code: 'validation' })
  })

  it('rejects a document with no name, no kind, or a foreign site', async () => {
    await expect(svc.addDocumentVersion(officer, null, { companyId: COMPANY, kind: 'policy' }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.addDocumentVersion(officer, null, { companyId: COMPANY, name: 'No kind' }))
      .rejects.toMatchObject({ code: 'validation' })
    await expect(svc.addDocumentVersion(officer, null, {
      companyId: COMPANY, name: 'Foreign site', kind: 'policy', siteId: OTHER_SITE,
    })).rejects.toMatchObject({ code: 'validation' })
  })

  it('lists documents with anything awaiting a signature first', async () => {
    const rows = await svc.listDocuments(manager, COMPANY)
    const firstApproved = rows.findIndex((d) => d.status !== 'PendingApproval')
    const lastPending = rows.map((d) => d.status).lastIndexOf('PendingApproval')
    if (firstApproved !== -1 && lastPending !== -1) {
      expect(lastPending).toBeLessThan(firstApproved)
    }

    const sops = await svc.listDocuments(manager, COMPANY, undefined, 'sop')
    expect(sops.every((d) => d.kind === 'sop')).toBe(true)
    const found = await svc.listDocuments(manager, COMPANY, 'hirarc')
    expect(found.some((d) => d.name.includes('HIRARC'))).toBe(true)
  })

  // ── Tenancy ────────────────────────────────────────────────────────────────

  it('refuses cross-tenant listing, reads and mutations', async () => {
    const { audit } = await completeWith({ title: 'Tenant isolation' }, { severity: 'Major' })

    await expect(svc.listAudits(outsider, { companyId: COMPANY, page: 1, pageSize: 10 }))
      .rejects.toMatchObject({ status: 403 })
    await expect(svc.auditStats(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listFindings(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listObligations(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listDocuments(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })
    await expect(svc.listTemplates(outsider, COMPANY)).rejects.toMatchObject({ status: 403 })

    // A guessed id must not be enough, even for an admin of another workspace.
    await expect(svc.getAuditDetail(outsider, audit.id)).rejects.toMatchObject({ status: 403 })
    await expect(svc.closeAudit(outsider, audit.id)).rejects.toMatchObject({ status: 403 })
    await expect(svc.startAudit(outsider, audit.id)).rejects.toMatchObject({ status: 403 })
  })

  it('scopes the register to one tenant', async () => {
    const rows = await svc.listAudits(manager, { companyId: COMPANY, page: 1, pageSize: 200 })
    expect(rows.rows.every((r) => r.companyId === COMPANY)).toBe(true)
    expect(rows.rows.some((r) => r.title === 'Tenant B audit')).toBe(false)
  })

  it('reports an audit that does not exist as not found', async () => {
    await expect(svc.getAuditDetail(manager, 'no-such-audit')).rejects.toBeInstanceOf(AuditError)
    await expect(svc.getAuditDetail(manager, 'no-such-audit')).rejects.toMatchObject({ status: 404 })
  })

  // ── Listing ────────────────────────────────────────────────────────────────

  it('filters by site, status and type, and searches team members', async () => {
    await svc.createAudit(manager, newAudit({
      title: 'Site B DOSH walk', siteId: SITE_B, type: 'dosh', templateId: 'tpl-dosh',
      team: ['Rashid Karim'],
    }))

    const bySite = await svc.listAudits(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, siteId: SITE_B,
    })
    expect(bySite.rows.every((r) => r.siteId === SITE_B)).toBe(true)

    const byType = await svc.listAudits(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, type: 'dosh',
    })
    expect(byType.rows.every((r) => r.type === 'dosh')).toBe(true)

    const byStatus = await svc.listAudits(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, status: 'closed',
    })
    expect(byStatus.rows.every((r) => r.status === 'closed')).toBe(true)

    // Team is an array column — the search has to reach into it.
    const byTeam = await svc.listAudits(manager, {
      companyId: COMPANY, page: 1, pageSize: 200, q: 'Rashid Karim',
    })
    expect(byTeam.rows.some((r) => r.team.includes('Rashid Karim'))).toBe(true)
  })

  it('orders the register with work in progress first', async () => {
    const { rows } = await svc.listAudits(manager, { companyId: COMPANY, page: 1, pageSize: 200 })
    const rank = (x: (typeof rows)[number]) =>
      x.status === 'in_progress' ? 0 : x.status === 'planned' ? 1 : x.status === 'completed' ? 2 : 3
    for (let i = 1; i < rows.length; i++) {
      expect(rank(rows[i - 1])).toBeLessThanOrEqual(rank(rows[i]))
    }
  })

  it('paginates deterministically without overlap', async () => {
    const p1 = await svc.listAudits(manager, { companyId: COMPANY, page: 1, pageSize: 4 })
    const p2 = await svc.listAudits(manager, { companyId: COMPANY, page: 2, pageSize: 4 })
    expect(p1.rows.filter((a) => p2.rows.some((b) => b.id === a.id))).toHaveLength(0)
    expect(p1.totalPages).toBe(Math.ceil(p1.total / 4))
  })

  // ── Counters ───────────────────────────────────────────────────────────────

  it('computes programme statistics in the database', async () => {
    const stats = await svc.auditStats(manager, COMPANY)

    expect(stats.completedAudits).toBeGreaterThan(0)
    expect(stats.openFindings).toBeGreaterThanOrEqual(0)
    expect(stats.criticalFindings).toBeLessThanOrEqual(stats.openFindings)
    expect(stats.overdueFindingActions).toBeLessThanOrEqual(stats.openFindings)
    expect(stats.compliancePct).toBeGreaterThanOrEqual(0)
    expect(stats.compliancePct).toBeLessThanOrEqual(100)
    expect(stats.avgScore).not.toBeNull()
    expect(stats.readiness).toBeGreaterThanOrEqual(0)
    expect(stats.readiness).toBeLessThanOrEqual(100)
    expect(stats.monthlyTrend).toHaveLength(6)
    expect(stats.findingsByCategory.length).toBeGreaterThan(0)
    // Every open finding is attributed to exactly one site and one department.
    const bySite = stats.bySiteOpenFindings.reduce((n, r) => n + r.value, 0)
    const byDept = stats.byDeptOpenFindings.reduce((n, r) => n + r.value, 0)
    expect(bySite).toBe(stats.openFindings)
    expect(byDept).toBe(stats.openFindings)
  })

  // ── Cascades ───────────────────────────────────────────────────────────────

  it('cascades findings and trail when an audit is removed', async () => {
    const { audit, findings } = await completeWith({ title: 'Cascade check' }, { severity: 'Minor' })
    const actionId = findings[0].actionId

    await db.audit.delete({ where: { id: audit.id } })

    expect(await db.auditFinding.count({ where: { auditId: audit.id } })).toBe(0)
    expect(await db.auditEvent.count({ where: { auditId: audit.id } })).toBe(0)
    // The corrective action survives: outstanding work does not disappear because the
    // audit record was removed.
    expect(await db.correctiveAction.count({ where: { id: actionId } })).toBe(1)
  })

  it('cascades audits, obligations and documents when the tenant is deleted', async () => {
    const TMP = 'aud-cascade-co'
    await db.company.create({ data: { id: TMP, name: 'Cascade Co' } })
    await db.site.create({ data: { id: 'aud-cascade-site', companyId: TMP, name: 'S' } })
    const tmpMgr: Caller = {
      userId: 'x', name: 'Cascade Mgr',
      roles: [{ companyId: TMP, role: 'hse_manager', siteIds: [] }],
    }
    const a = await svc.createAudit(tmpMgr, newAudit({
      companyId: TMP, siteId: 'aud-cascade-site', title: 'Orphan check',
    }))
    const doc = await svc.addDocumentVersion(tmpMgr, null, {
      companyId: TMP, name: 'Doc', kind: 'policy',
    })
    const ob = await db.complianceObligation.create({
      data: {
        companyId: TMP, regulation: 'R', requirement: 'Req', responsible: 'X',
        nextDue: new Date(),
      },
    })

    await db.company.delete({ where: { id: TMP } })
    await db.counter.deleteMany({ where: { companyId: TMP } })

    expect(await db.audit.count({ where: { id: a.id } })).toBe(0)
    expect(await db.complianceDocument.count({ where: { id: doc.id } })).toBe(0)
    expect(await db.complianceObligation.count({ where: { id: ob.id } })).toBe(0)
    expect(await db.documentVersion.count({ where: { documentId: doc.id } })).toBe(0)
  })

  it('refuses an audit referencing a company that does not exist', async () => {
    await expect(db.audit.create({
      data: {
        code: 'AUD-ghost', companyId: 'no-such-company', siteId: SITE,
        title: 'Ghost', type: 'internal', leadAuditor: 'X', templateId: 'tpl-5s',
        scheduledFor: new Date(), createdBy: 'X',
      },
    })).rejects.toThrow()
  })
})
