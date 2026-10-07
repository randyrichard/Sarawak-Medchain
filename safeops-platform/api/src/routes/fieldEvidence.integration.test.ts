import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { hashPassword } from '../lib/password.js'
import { collectTenantExport } from '../lib/tenantExport.js'
import { env } from '../env.js'

/**
 * Field evidence over real HTTP: photos for inspections, audit answers and corrective
 * actions with no incident.
 *
 * These had nowhere to go. The inspection and audit runners counted photos and threw them
 * away, and an action raised outside an investigation could take no file at all - so one
 * marked "evidence required" could never be completed. Each test here is one promise the
 * storage makes: who may add, who may see, for how long, and that what comes back is what
 * went in.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const CO = 'fe-itest-co'
const OTHER = 'fe-itest-other'
const SITE = 'fe-itest-site'
const OTHER_SITE = 'fe-itest-other-site'
const PREFIX = 'fe-itest'
const PASSWORD = 'Field-Evidence-Itest-2026'
const UPLOAD_DIR = resolve(process.cwd(), env.UPLOAD_DIR)

let server: Server
let base = ''
const tokens: Record<string, string> = {}

// A real (tiny) JPEG: the server sniffs the bytes, so a fake would be refused.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

const api = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, init)
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` })

function form(files: { name: string; type: string; body: Buffer }[], fields: Record<string, string> = {}) {
  const f = new FormData()
  for (const x of files) f.append('files', new Blob([x.body], { type: x.type }), x.name)
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}
const upload = (who: string, path: string, files = [{ name: 'scene.jpg', type: 'image/jpeg', body: JPEG }], fields?: Record<string, string>) =>
  api(`/evidence/${path}`, { method: 'POST', headers: as(who), body: form(files, fields) })

async function purge() {
  for (const c of [CO, OTHER]) {
    await db.fieldEvidence.deleteMany({ where: { companyId: c } })
    await db.correctiveAction.deleteMany({ where: { companyId: c } })
    await db.inspection.deleteMany({ where: { companyId: c } })
    await db.asset.deleteMany({ where: { companyId: c } })
    await db.audit.deleteMany({ where: { companyId: c } })
    await db.incident.deleteMany({ where: { companyId: c } })
  }
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } })
  await db.refreshToken.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
  await db.membership.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

const PEOPLE: [key: string, name: string, role: 'safety_officer' | 'employee' | 'hse_manager' | 'admin', company: string][] = [
  ['officer', 'FE Officer', 'safety_officer', CO],
  ['inspector', 'FE Inspector', 'employee', CO],
  ['outsider', 'FE Outsider', 'employee', CO],
  ['owner', 'FE Owner', 'employee', CO],
  ['auditor', 'FE Auditor', 'employee', CO],
  ['foreign', 'FE Foreign', 'admin', OTHER],
]

let inspectionId = ''
let staleInspectionId = ''
let auditId = ''
let actionId = ''
let linkedActionId = ''

d('Field evidence (real HTTP, real Postgres)', () => {
  beforeAll(async () => {
    await purge()
    for (const [id, site] of [[CO, SITE], [OTHER, OTHER_SITE]]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name: `FE ITest ${id}` } })
      await db.site.upsert({ where: { id: site }, update: {}, create: { id: site, companyId: id, name: 'FE Yard', short: 'FEY', city: 'Miri' } })
    }
    for (const [key, name, role, company] of PEOPLE) {
      await db.user.create({
        data: {
          email: `${PREFIX}-${key}@example.test`, name, passwordHash: await hashPassword(PASSWORD),
          memberships: { create: { companyId: company, role, siteIds: [] } },
        },
      })
    }
    const asset = await db.asset.create({
      data: {
        code: 'AST-FE1', qrKey: 'AST-FE1', companyId: CO, siteId: SITE, name: 'FE ladder', category: 'ladder',
        serialNumber: 'S1', owner: 'FE Officer', frequency: 'monthly', nextDueDate: new Date(), createdBy: 'itest',
      },
    })
    const hour = 3_600_000
    inspectionId = (await db.inspection.create({
      data: {
        code: 'INS-FE1', assetId: asset.id, companyId: CO, siteId: SITE, scheduledFor: new Date(),
        assignedTo: 'FE Inspector', status: 'completed', completedAt: new Date(Date.now() - hour), completedBy: 'FE Inspector', outcome: 'passed',
      },
    })).id
    staleInspectionId = (await db.inspection.create({
      data: {
        code: 'INS-FE2', assetId: asset.id, companyId: CO, siteId: SITE, scheduledFor: new Date(),
        assignedTo: 'FE Inspector', status: 'completed', completedAt: new Date(Date.now() - 30 * hour), completedBy: 'FE Inspector', outcome: 'passed',
      },
    })).id
    auditId = (await db.audit.create({
      data: {
        code: 'AUD-FE1', companyId: CO, siteId: SITE, title: 'FE audit', type: 'internal', leadAuditor: 'FE Auditor',
        templateId: 'tpl-5s', scheduledFor: new Date(), createdBy: 'itest', status: 'completed', completedAt: new Date(),
        answers: [{ itemId: 'q1', result: 'pass' }, { itemId: 'q2', result: 'fail' }],
      },
    })).id
    actionId = (await db.correctiveAction.create({
      data: {
        code: 'CA-FE1', companyId: CO, siteId: SITE, title: 'Fix the rung', owner: 'FE Owner', dueDate: new Date(Date.now() + 86_400_000),
        createdBy: 'itest', source: 'manual', evidenceRequired: true, status: 'in_progress',
      },
    })).id
    const incident = await db.incident.create({
      data: {
        number: 'INC-FE1', companyId: CO, siteId: SITE, title: 'x', type: 'near_miss', severity: 'near_miss',
        location: 'x', reporter: 'x', occurredAt: new Date(),
      },
    })
    linkedActionId = (await db.correctiveAction.create({
      data: {
        code: 'CA-FE2', companyId: CO, siteId: SITE, incidentId: incident.id, title: 'Linked', owner: 'FE Owner',
        dueDate: new Date(), createdBy: 'itest',
      },
    })).id

    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    for (const [key] of PEOPLE) {
      const res = await api('/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${PREFIX}-${key}@example.test`, password: PASSWORD }),
      })
      tokens[key] = ((await res.json()) as { accessToken: string }).accessToken
    }
  })

  afterAll(async () => {
    await new Promise((r) => server?.close(r))
    await purge()
    await db.site.deleteMany({ where: { id: { in: [SITE, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  it('keeps an inspection photo, byte for byte, and counts it on the inspection', async () => {
    const res = await upload('inspector', `inspections/${inspectionId}`)
    expect(res.status).toBe(201)
    const { rows } = await res.json() as { rows: { id: string; name: string; uploadedBy: string }[] }
    expect(rows[0]).toMatchObject({ name: 'scene.jpg', uploadedBy: 'FE Inspector' })
    expect(JSON.stringify(rows)).not.toContain('storedName')

    const back = await api(`/evidence/file/${rows[0].id}`, { headers: as('officer') })
    expect(back.status).toBe(200)
    expect(Buffer.from(await back.arrayBuffer()).equals(JPEG)).toBe(true)

    const row = await db.fieldEvidence.findUniqueOrThrow({ where: { id: rows[0].id } })
    expect(row.checksum).toBe(createHash('sha256').update(JPEG).digest('hex'))
    expect((await db.inspection.findUniqueOrThrow({ where: { id: inspectionId } })).photoCount).toBe(1)

    const list = await (await api(`/evidence/inspections/${inspectionId}`, { headers: as('outsider') })).json() as { rows: unknown[] }
    expect(list.rows).toHaveLength(1)
  })

  it('refuses someone who did not do the work, and anyone after the 24-hour window', async () => {
    expect((await upload('outsider', `inspections/${inspectionId}`)).status).toBe(403)
    const late = await upload('inspector', `inspections/${staleInspectionId}`)
    expect(late.status).toBe(400)
    expect((await late.json() as { message: string }).message).toMatch(/24 hours/)
  })

  it('does not let another company see, add or download', async () => {
    // Not found rather than forbidden: row-level security hides another tenant's record
    // entirely, so a caller cannot even learn that the id exists.
    expect((await upload('foreign', `inspections/${inspectionId}`)).status).toBe(404)
    expect((await api(`/evidence/inspections/${inspectionId}`, { headers: as('foreign') })).status).toBe(404)
    const [row] = await db.fieldEvidence.findMany({ where: { inspectionId } })
    expect((await api(`/evidence/file/${row.id}`, { headers: as('foreign') })).status).toBe(404)
    expect((await api(`/evidence/file/${row.id}`)).status).toBe(401)
  })

  it('refuses a file that is not what its name says, and leaves nothing on disk', async () => {
    const before = existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR).length : 0
    const res = await upload('inspector', `inspections/${inspectionId}`, [{ name: 'evil.jpg', type: 'image/jpeg', body: Buffer.from('<script>alert(1)</script>') }])
    expect(res.status).toBe(400)
    expect(readdirSync(UPLOAD_DIR).length).toBe(before)
  })

  it('files an audit photo against an answered item, and only an answered one', async () => {
    const ok = await upload('auditor', `audits/${auditId}`, undefined, { itemId: 'q2' })
    expect(ok.status).toBe(201)
    expect((await ok.json() as { rows: { auditItemId: string }[] }).rows[0].auditItemId).toBe('q2')
    expect((await upload('auditor', `audits/${auditId}`, undefined, { itemId: 'invented' })).status).toBe(400)
    expect((await upload('outsider', `audits/${auditId}`)).status).toBe(403)
    const events = await db.auditEvent.findMany({ where: { auditId, action: 'Evidence uploaded' } })
    expect(events).toHaveLength(1)
  })

  it('lets a standalone action that demands evidence be completed once a photo is attached', async () => {
    const complete = () => api(`/incidents/actions/${actionId}`, {
      method: 'PATCH', headers: { ...as('owner'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', evidenceNote: 'Rung replaced' }),
    })
    // Before: refused - the rule is right - but until now there was no way to satisfy it.
    expect((await complete()).status).toBe(400)
    expect((await upload('outsider', `actions/${actionId}`)).status).toBe(403)
    expect((await upload('owner', `actions/${actionId}`)).status).toBe(201)
    expect((await complete()).status).toBe(200)
  })

  it('sends an incident action\'s evidence to the incident, where it already lives', async () => {
    const res = await upload('owner', `actions/${linkedActionId}`)
    expect(res.status).toBe(400)
    expect((await res.json() as { message: string }).message).toMatch(/on the incident/)
  })

  it('is in the tenant export, files included', async () => {
    const ex = await collectTenantExport(db, CO)
    const t = ex.tables.find((x) => x.name === 'field-evidence')
    expect(t?.rows.length).toBe(3)
    expect(ex.files.filter((f) => f.folder === 'field-evidence')).toHaveLength(3)
  })
})
