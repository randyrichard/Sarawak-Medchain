import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { signAccessToken } from '../lib/tokens.js'
import { todayDate } from '../domain/businessDay.js'
import { addMonths } from '../domain/hirarc.js'

/**
 * The HIRARC register over real HTTP, as the restricted login.
 *
 * The subject is what an HSE manager and a DOSH officer rely on: that the risk is the
 * guideline's likelihood times severity and lands in the right band, that the matrix counts
 * every live row, that recommended controls become corrective actions tracked back to the
 * row, that a stale edit cannot overwrite a colleague's, and that each role and site sees
 * only what it should.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const CO = 'hira-itest-co'
const OTHER = 'hira-itest-other'
const BTU = 'hira-itest-btu'
const MRI = 'hira-itest-mri'
const OTHER_SITE = 'hira-itest-other-site'
const TODAY = todayDate().toISOString().slice(0, 10)

let server: Server
let base = ''

const tokenFor = (role: string, companyId = CO, siteIds: string[] = []) => signAccessToken({
  sub: `hira-${role}-${companyId}-${siteIds.join('.')}`, email: `${role}@hira-itest.example`, name: `Hira ${role}`,
  roles: [{ companyId, role: role as never, siteIds }], mustChangePassword: false,
}).token

const call = (path: string, init: RequestInit & { token?: string } = {}) => fetch(`${base}/risk-assessments${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${init.token ?? tokenFor('hse_manager')}`, ...(init.headers ?? {}) },
})
const post = (path: string, body: unknown, token?: string) => call(path, { method: 'POST', body: JSON.stringify(body), token })
const json = async (res: Response): Promise<any> => res.json()

const hazard = (over: Record<string, unknown> = {}) => ({
  companyId: CO, siteId: BTU, activity: 'Loading at Bay 4', hazard: 'Reversing forklift', effect: 'Struck-by injury, crushing',
  existingControls: 'Reversing alarm', likelihood: 4, severity: 4, ...over,
})

async function purge() {
  for (const companyId of [CO, OTHER]) {
    await db.notification.deleteMany({ where: { companyId } })
    await db.correctiveAction.deleteMany({ where: { companyId } })
    await db.riskAssessment.deleteMany({ where: { companyId } })
    await db.adminAuditEntry.deleteMany({ where: { companyId } })
    await db.counter.deleteMany({ where: { companyId } })
  }
}

d('HIRARC register (real HTTP, real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'Hira ITest'], [OTHER, 'Hira ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, companyId, name, short] of [[BTU, CO, 'Bintulu Yard', 'BTU'], [MRI, CO, 'Miri Base', 'MRI'], [OTHER_SITE, OTHER, 'Elsewhere', 'ELS']]) {
      await db.site.upsert({ where: { id }, update: {}, create: { id, companyId, name, short, city: name, headcount: 40 } })
    }
    await purge()
    const app = createApp()
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', r) })
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(async () => {
    await new Promise((r) => server?.close(r))
    await purge()
    await db.site.deleteMany({ where: { id: { in: [BTU, MRI, OTHER_SITE] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  it('records a hazard with its risk, banded as the guideline bands it, and a review a year out', async () => {
    const res = await post('', hazard())
    expect(res.status).toBe(201)
    const v = await json(res)
    expect(v).toMatchObject({
      code: 'HZ-1001', riskScore: 16, level: 'high', needsControls: true, controls: 'none',
      assessedBy: 'Hira hse_manager', assessedOn: TODAY, reviewDue: addMonths(TODAY, 12), siteName: 'Bintulu Yard',
    })
    const audit = await db.adminAuditEntry.findFirstOrThrow({ where: { companyId: CO, action: 'Risk assessed' } })
    expect(audit.target).toBe('HZ-1001 · Reversing forklift · High (16)')
  })

  it('says what is wrong in words, and the database refuses a score that is not likelihood times severity', async () => {
    let res = await post('', hazard({ additionalControls: 'Banksman', residualLikelihood: 5, residualSeverity: 5 }))
    expect(res.status).toBe(400)
    expect((await json(res)).message).toBe('The risk once the recommended controls are in place cannot be higher than the risk now.')
    res = await post('', hazard({ likelihood: 7 }))
    expect((await json(res)).message).toBe('Likelihood is rated 1 to 5.')
    res = await post('', hazard({ siteId: OTHER_SITE }))
    expect((await json(res)).message).toBe('Choose a site in this workspace.')

    await expect(db.riskAssessment.create({
      data: {
        companyId: CO, siteId: BTU, code: 'HZ-BAD', activity: 'a', hazard: 'h', effect: 'e', likelihood: 4, severity: 4, riskScore: 9,
        assessedBy: 'x', assessedOn: new Date(), reviewDue: new Date(), createdBy: 'x',
      },
    })).rejects.toThrow(/RiskAssessment_rating_check/)
  })

  it('counts every live row in the matrix, and filters the register by band, cell and words', async () => {
    await post('', hazard({ activity: 'Hot work', hazard: 'Sparks near solvent store', effect: 'Fire, burns', likelihood: 3, severity: 5 }))
    await post('', hazard({ activity: 'Office', hazard: 'Trailing cable', effect: 'Trip, bruise', likelihood: 2, severity: 2, siteId: MRI }))

    const all = await json(await call(`?companyId=${CO}`))
    expect(all.total).toBe(3)
    expect(all.counts).toMatchObject({ high: 2, medium: 0, low: 1, needsControls: 2 })
    expect(all.matrix.now[3][3]).toBe(1) // likelihood 4, severity 4
    expect(all.matrix.now[2][4]).toBe(1) // likelihood 3, severity 5
    expect(all.rows.map((r: { riskScore: number }) => r.riskScore)).toEqual([16, 15, 4])

    expect((await json(await call(`?companyId=${CO}&level=low`))).rows.map((r: { hazard: string }) => r.hazard)).toEqual(['Trailing cable'])
    expect((await json(await call(`?companyId=${CO}&likelihood=3&severity=5`))).rows.map((r: { code: string }) => r.code)).toEqual(['HZ-1002'])
    expect((await json(await call(`?companyId=${CO}&q=solvent`))).total).toBe(1)
    expect((await json(await call(`?companyId=${CO}&siteId=${MRI}`))).total).toBe(1)
    expect((await json(await call(`?companyId=${CO}&level=high&attention=needs_controls`))).total).toBe(2)
  })

  it('refuses an edit made from a stale copy, rather than overwriting a colleague', async () => {
    const created = await json(await post('', hazard({ hazard: 'Dropped load', effect: 'Head injury', likelihood: 3, severity: 4 })))
    const edit = (version: number) => call(`/${created.id}`, {
      method: 'PUT', body: JSON.stringify({ ...hazard({ hazard: 'Dropped load', effect: 'Head injury', likelihood: 2, severity: 4 }), version }),
    })
    let res = await edit(created.version)
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ riskScore: 8, level: 'medium', version: created.version + 1 })
    res = await edit(created.version)
    expect(res.status).toBe(409)
    expect((await json(res)).message).toMatch(/Someone else changed this risk assessment/)
  })

  it('raises the recommended controls as a corrective action, linked back to the row and tracked there', async () => {
    const due = addMonths(TODAY, 1)
    const created = await json(await post('', hazard({ hazard: 'Unguarded conveyor nip point', effect: 'Amputation', likelihood: 3, severity: 5 })))
    let res = await post(`/${created.id}/actions`, {})
    expect(res.status).toBe(400)
    expect((await json(res)).message).toMatch(/Write down the recommended controls first/)

    const withControls = await json(await call(`/${created.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...hazard({ hazard: 'Unguarded conveyor nip point', effect: 'Amputation', likelihood: 3, severity: 5 }),
        additionalControls: 'Fixed guard over the tail pulley; lock-out before clearing', owner: 'Ali Hassan', controlsDue: due,
        residualLikelihood: 1, residualSeverity: 5, version: created.version,
      }),
    }))
    expect(withControls).toMatchObject({ residualScore: 5, residualLevel: 'medium', controls: 'planned', needsDate: false })

    res = await post(`/${created.id}/actions`, {})
    expect(res.status).toBe(201)
    const action = await json(res)
    expect(action).toMatchObject({ source: 'risk_assessment', riskAssessmentId: created.id, priority: 'High', owner: 'Ali Hassan', siteId: BTU })
    expect(action.dueDate.slice(0, 10)).toBe(due)
    expect(action.detail).toMatch(new RegExp(`^From ${created.code}, Loading at Bay 4: Unguarded conveyor nip point`))
    expect(await db.notification.count({ where: { companyId: CO, href: `/actions?open=${action.id}` } })).toBe(1)

    const after = await json(await call(`/${created.id}`))
    expect(after.controls).toBe('in_progress')
    expect(after.actions).toEqual([expect.objectContaining({ code: action.code, status: 'open', owner: 'Ali Hassan' })])
  })

  it('archives a row with the reason, out of the matrix, and restores it', async () => {
    const created = await json(await post('', hazard({ activity: 'Old paint line', hazard: 'Solvent vapour', effect: 'Dizziness', likelihood: 2, severity: 3 })))
    let res = await post(`/${created.id}/archive`, { reason: '' })
    expect((await json(res)).message).toBe('Say why this assessment no longer applies.')
    res = await post(`/${created.id}/archive`, { reason: 'Paint line decommissioned in October.' })
    expect((await json(res)).archivedReason).toBe('Paint line decommissioned in October.')

    const live = await json(await call(`?companyId=${CO}`))
    expect(live.rows.some((r: { id: string }) => r.id === created.id)).toBe(false)
    expect(live.matrix.now[1][2]).toBe(0)
    expect((await json(await call(`?companyId=${CO}&archived=true`))).rows.map((r: { id: string }) => r.id)).toEqual([created.id])

    res = await post(`/${created.id}/restore`, {})
    expect((await json(res)).archivedAt).toBeNull()
  })

  it('counts controls past their date as overdue until every action raised for them is done', async () => {
    const created = await json(await post('', hazard({
      activity: 'Racking', hazard: 'Fall from mezzanine', effect: 'Fracture', likelihood: 3, severity: 4,
      additionalControls: 'Guardrails on the mezzanine edge', owner: 'Ali Hassan', assessedOn: '2026-01-05', controlsDue: '2026-02-01',
    })))
    expect(created.controlsOverdue).toBe(true)
    const overdue = async () => json(await call(`?companyId=${CO}&attention=controls_overdue`))
    let list = await overdue()
    expect(list.rows.map((r: { id: string }) => r.id)).toEqual([created.id])
    expect(list.counts.controlsOverdue).toBe(1)

    const action = await json(await post(`/${created.id}/actions`, { dueDate: '2026-12-01' }))
    expect((await overdue()).counts.controlsOverdue).toBe(1) // raised, still open
    await db.correctiveAction.update({ where: { id: action.id }, data: { status: 'verified' } })
    list = await overdue()
    expect(list).toMatchObject({ total: 0, counts: { controlsOverdue: 0 } })
    expect((await json(await call(`/${created.id}`))).controls).toBe('done')
  })

  it('flags a review that has fallen due', async () => {
    const created = await json(await post('', hazard({ activity: 'Tank entry', hazard: 'Oxygen deficiency', effect: 'Asphyxiation', likelihood: 2, severity: 5 })))
    await db.riskAssessment.update({ where: { id: created.id }, data: { assessedOn: new Date('2024-01-10'), reviewDue: new Date('2025-01-10') } })
    const overdue = await json(await call(`?companyId=${CO}&attention=review_overdue`))
    expect(overdue.rows.map((r: { id: string }) => r.id)).toEqual([created.id])
    expect(overdue.rows[0].reviewOverdue).toBe(true)
    expect(overdue.counts.reviewOverdue).toBe(1)
  })

  it('lets a supervisor read and not write, keeps employees and other workspaces out, and holds to assigned sites', async () => {
    const supervisor = tokenFor('supervisor')
    expect((await call(`?companyId=${CO}`, { token: supervisor })).status).toBe(200)
    expect((await call(`?companyId=${CO}`, { token: supervisor }).then(json)).canEdit).toBe(false)
    let res = await post('', hazard(), supervisor)
    expect(res.status).toBe(403)

    expect((await call(`?companyId=${CO}`, { token: tokenFor('employee') })).status).toBe(403)

    const row = (await json(await call(`?companyId=${CO}`))).rows[0]
    expect((await call(`/${row.id}`, { token: tokenFor('admin', OTHER) })).status).toBe(404)

    const miriOnly = tokenFor('safety_officer', CO, [MRI])
    const theirs = await json(await call(`?companyId=${CO}`, { token: miriOnly }))
    expect(theirs.rows.every((r: { siteId: string }) => r.siteId === MRI)).toBe(true)
    expect((await call(`/${row.id}`, { token: miriOnly })).status).toBe(404)
    res = await post('', hazard({ siteId: BTU }), miriOnly)
    expect(res.status).toBe(403)
  })

  it('exports the register in the DOSH form\'s columns, with nothing Excel would run as a formula', async () => {
    await post('', hazard({ activity: 'Cold store', hazard: '=HYPERLINK("http://x","click")', effect: 'Frostbite', likelihood: 2, severity: 2 }))
    const res = await call(`/export.csv?companyId=${CO}`)
    expect(res.headers.get('content-type')).toMatch(/text\/csv/)
    const text = await res.text()
    const lines = text.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines[0]).toBe('No,Site,Work Activity,Hazard,Which Can Cause,Existing Controls,Likelihood,Severity,Risk,Risk Level,Recommended Controls,PIC,Due Date,Residual Likelihood,Residual Severity,Residual Risk,Assessed By,Assessed On,Next Review')
    const forklift = lines.find((l) => l.startsWith('HZ-1001,'))!
    expect(forklift).toContain('Bintulu Yard,Loading at Bay 4,Reversing forklift,"Struck-by injury, crushing",Reversing alarm,4 Possible,4 Fatal,16,High')
    const [y, m, dd] = TODAY.split('-')
    expect(forklift).toContain(`${dd}/${m}/${y}`)
    expect(lines.find((l) => l.includes('HYPERLINK'))).toContain(`"'=HYPERLINK(""http://x"",""click"")"`)
  })

  it('takes a date field someone cleared as its default, not as a malformed request', async () => {
    const res = await post('', hazard({ hazard: 'Slippery ramp', effect: 'Sprain', likelihood: 2, severity: 2, assessedOn: '', reviewDue: '', controlsDue: '' }))
    expect(res.status).toBe(201)
    expect(await json(res)).toMatchObject({ assessedOn: TODAY, reviewDue: addMonths(TODAY, 12), controlsDue: null })
  })
})
