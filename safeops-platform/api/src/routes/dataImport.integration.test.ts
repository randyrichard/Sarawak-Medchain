import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { createApp } from '../app.js'
import { signAccessToken } from '../lib/tokens.js'

/**
 * Importing a company's registers from CSV, over real HTTP, as the restricted login.
 *
 * The subject is what a person relies on when they load three hundred rows they cannot check
 * one by one: that the preview writes nothing and says what will happen to each row, that the
 * import does exactly that, that a second run of the same file adds nothing, and that a file
 * as Excel saves it - byte-order mark, CRLF, semicolons, a comma inside a name - reads as the
 * person sees it in Excel.
 *
 * Requires a database. Skipped when DATABASE_URL is absent so CI without one stays green.
 */
const hasDb = !!process.env.DATABASE_URL
const d = hasDb ? describe : describe.skip

const db = new PrismaClient()
const CO = 'import-itest-co'
const OTHER = 'import-itest-other'
const BTU = 'import-itest-btu'
const MRI = 'import-itest-mri'

let server: Server
let base = ''

const tokenFor = (role: string, companyId = CO) => signAccessToken({
  sub: `import-${role}-${companyId}`, email: `${role}@import-itest.example`, name: `Import ${role}`,
  roles: [{ companyId, role: role as never, siteIds: [] }], mustChangePassword: false,
}).token

const send = (path: string, csv: string, role = 'hse_manager', contentType = 'text/csv') => fetch(`${base}/imports${path}`, {
  method: 'POST', body: csv,
  headers: { 'Content-Type': contentType, Authorization: `Bearer ${tokenFor(role)}` },
})
const preview = (kind: string, csv: string, role?: string) => send(`/${kind}/preview?companyId=${CO}`, csv, role)
const run = (kind: string, csv: string, role?: string) => send(`/${kind}?companyId=${CO}`, csv, role)
const json = async (res: Response): Promise<any> => res.json()
const actions = (plan: { rows: { line: number; action: string }[] }) => plan.rows.map((r) => `${r.line}:${r.action}`)

async function purge() {
  for (const companyId of [CO, OTHER]) {
    await db.riskAssessment.deleteMany({ where: { companyId } })
    await db.assetEvent.deleteMany({ where: { asset: { companyId } } })
    await db.inspection.deleteMany({ where: { companyId } })
    await db.asset.deleteMany({ where: { companyId } })
    await db.contractorWorker.deleteMany({ where: { companyId } })
    await db.contractorCompany.deleteMany({ where: { companyId } })
    await db.employee.deleteMany({ where: { companyId } })
    await db.notification.deleteMany({ where: { companyId } })
    await db.adminAuditEntry.deleteMany({ where: { companyId } })
    await db.counter.deleteMany({ where: { companyId } })
  }
}

d('CSV import (real HTTP, real Postgres)', () => {
  beforeAll(async () => {
    for (const [id, name] of [[CO, 'Import ITest'], [OTHER, 'Import ITest Other']]) {
      await db.company.upsert({ where: { id }, update: {}, create: { id, name } })
    }
    for (const [id, name, short] of [[BTU, 'Bintulu Yard', 'BTU'], [MRI, 'Miri Base', 'MRI']]) {
      await db.site.upsert({ where: { id }, update: {}, create: { id, companyId: CO, name, short, city: name, headcount: 40 } })
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
    await db.site.deleteMany({ where: { id: { in: [BTU, MRI] } } })
    await db.company.deleteMany({ where: { id: { in: [CO, OTHER] } } })
    await db.$disconnect()
  })

  it('lists every column, and hands out a template Excel opens as UTF-8', async () => {
    const auth = { Authorization: `Bearer ${tokenFor('hse_manager')}` }
    const catalog = await json(await fetch(`${base}/imports/catalog`, { headers: auth }))
    expect(catalog.kinds.map((k: { kind: string }) => k.kind)).toEqual(['employees', 'contractors', 'contractor_workers', 'assets', 'risk_assessments'])
    expect(catalog.maxRows).toBe(2000)

    const res = await fetch(`${base}/imports/assets/template.csv`, { headers: auth })
    expect(res.headers.get('content-type')).toMatch(/text\/csv/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    // TextDecoder consumes the mark it has just been shown; what follows is the header.
    expect(new TextDecoder().decode(bytes)).toMatch(/^Name,Category,Serial No,Site,Owner,Inspection Frequency/)
  })

  const employees = [
    'Employee No,Name,Site,Position,Email,Hire Date,Medical Expiry,Shoe Size',
    'P1001,"Lim, Grace",Bintulu Yard,Rigger,grace@import-itest.example,02/03/2021,30/06/2027,8',
    'P1002,Ali Hassan,MRI,Welder,,2021-04-01,,9',
    'P1003,Nobody Here,Kuching,Clerk,,,,',
    'P1001,Same Number,BTU,,,,,',
    'P1004,Bad Date,BTU,,,31/02/2021,,',
    'EMP-1001,Reserved Number,BTU,,,,,',
    ',Rosli Ahmad,BTU,Driver,,,,',
  ].join('\r\n')

  it('previews row by row, and writes nothing', async () => {
    const res = await preview('employees', employees)
    expect(res.status).toBe(200)
    const plan = await json(res)
    expect(actions(plan)).toEqual(['2:add', '3:add', '4:fix', '5:fix', '6:fix', '7:fix', '8:add'])
    expect(plan).toMatchObject({ total: 7, add: 3, skip: 0, fix: 4, ignoredColumns: ['Shoe Size'] })
    const msg = (line: number) => plan.rows.find((r: { line: number }) => r.line === line).message
    expect(msg(4)).toMatch(/No site called "Kuching"\. Sites: .*Bintulu Yard/)
    expect(msg(5)).toBe('Repeats line 2 of this file.')
    expect(msg(6)).toMatch(/Hire Date "31\/02\/2021" is not a date/)
    expect(msg(7)).toMatch(/SafeChain-issued number/)
    expect(plan.rows[0].label).toBe('Lim, Grace')
    expect(await db.employee.count({ where: { companyId: CO } })).toBe(0)
  })

  it('imports what the preview said, keeps the company\'s own numbers, and adds nothing the second time', async () => {
    const plan = await json(await run('employees', employees))
    expect(actions(plan)).toEqual(['2:add', '3:add', '4:fix', '5:fix', '6:fix', '7:fix', '8:add'])
    expect(plan.rows.filter((r: { ref?: string }) => r.ref).map((r: { ref: string }) => r.ref)).toEqual(['P1001', 'P1002', 'EMP-1001'])

    const grace = await db.employee.findFirstOrThrow({ where: { companyId: CO, employeeNo: 'P1001' } })
    expect(grace).toMatchObject({ name: 'Lim, Grace', siteId: BTU, position: 'Rigger', email: 'grace@import-itest.example' })
    expect(grace.hireDate?.toISOString().slice(0, 10)).toBe('2021-03-02')
    expect(grace.medicalExpiry?.toISOString().slice(0, 10)).toBe('2027-06-30')
    expect((await db.employee.findFirstOrThrow({ where: { companyId: CO, employeeNo: 'P1002' } })).siteId).toBe(MRI)

    // Line 7's number is now the one SafeChain issued to Rosli: matched, named, and left alone.
    const again = await json(await run('employees', employees))
    expect(actions(again)).toEqual(['2:skip', '3:skip', '4:fix', '5:fix', '6:fix', '7:skip', '8:skip'])
    const msg = (line: number) => again.rows.find((r: { line: number }) => r.line === line).message
    expect(msg(7)).toBe('Already in the register as Rosli Ahmad (EMP-1001).')
    expect(msg(8)).toMatch(/Already in the register at this site as EMP-1001/)
    expect(await db.employee.count({ where: { companyId: CO } })).toBe(3)

    const audit = await db.adminAuditEntry.findMany({ where: { companyId: CO, action: 'Imported employees' }, orderBy: { at: 'asc' } })
    expect(audit.map((a) => a.target)).toEqual(['3 added, 0 already there, 4 left to fix', '0 added, 4 already there, 3 left to fix'])
  })

  it('reads a semicolon file with a byte-order mark, and refuses workers whose contractor is not there yet', async () => {
    const contractors = '\uFEFFCompany;SSM No;Contact;Insurance Expiry\r\nKenyalang Scaffolding Sdn Bhd;201901012345;Ahmad Zaki;31/12/2026\r\n"Borneo Lifting; Rigging";;;\r\n'
    const plan = await json(await run('contractors', contractors))
    expect(actions(plan)).toEqual(['2:add', '3:add'])
    const kenyalang = await db.contractorCompany.findFirstOrThrow({ where: { companyId: CO, registrationNumber: '201901012345' } })
    expect(kenyalang).toMatchObject({ name: 'Kenyalang Scaffolding Sdn Bhd', contactPerson: 'Ahmad Zaki' })
    expect(kenyalang.insuranceExpiry?.toISOString().slice(0, 10)).toBe('2026-12-31')
    expect(await db.contractorCompany.count({ where: { companyId: CO, name: 'Borneo Lifting; Rigging' } })).toBe(1)
    expect((await json(await run('contractors', contractors))).skip).toBe(2)

    const workers = [
      'Name,Contractor,Site,IC/Passport No,Position,Induction Expiry',
      `Rashid Karim,201901012345,BTU,880101-13-5678,Scaffolder,31/12/2026`,
      `Wong Mei Ling,${kenyalang.code},Miri Base,A12345678,Rigger,`,
      'Jack Unknown,Acme Cranes,BTU,900202-13-1111,,',
      'Tan Ah Kow,Borneo Lifting; Rigging,BTU,,,',
    ].join('\n')
    const workerPlan = await json(await run('contractor_workers', workers))
    expect(actions(workerPlan)).toEqual(['2:add', '3:add', '4:fix', '5:add'])
    expect(workerPlan.rows[2].message).toMatch(/No contractor called "Acme Cranes"\. Import the contractor first/)
    expect(workerPlan.rows[3].message).toMatch(/No IC or passport number/)
    const rashid = await db.contractorWorker.findFirstOrThrow({ where: { companyId: CO, icPassport: '880101-13-5678' } })
    expect(rashid).toMatchObject({ contractorCompanyId: kenyalang.id, siteId: BTU, position: 'Scaffolder' })

    expect(actions(await json(await run('contractor_workers', workers)))).toEqual(['2:skip', '3:skip', '4:fix', '5:skip'])
    expect(await db.contractorWorker.count({ where: { companyId: CO } })).toBe(3)
  })

  it('registers equipment with its first inspection, keeping a category it does not know as its own', async () => {
    const assets = [
      'Asset Name,Type,Serial Number,Site,Custodian,Frequency,Safety Critical,Purchase Date',
      'Forklift 3,Forklift,FL-2019-0042,BTU,Grace Lim,Monthly,Yes,15/08/2019',
      'Gas Detector 7,Gas Detector,GD-77,MRI,Ali Hassan,quarterly,no,',
      'Tower Light 2,Lighting Tower,TL-02,BTU,Rosli Ahmad,Annually,,',
      'Hoist 1,Chain Hoist,CH-01,BTU,Grace Lim,Fortnightly,,',
      'Hoist 2,Chain Hoist,CH-02,BTU,Grace Lim,Weekly,Maybe,',
      'Forklift 3 again,Forklift,fl-2019-0042,BTU,Grace Lim,Monthly,,',
    ].join('\n')
    const plan = await json(await run('assets', assets))
    expect(actions(plan)).toEqual(['2:add', '3:add', '4:add', '5:fix', '6:fix', '7:fix'])
    expect(plan.rows[2].message).toBe('Kept as its own category, "Lighting Tower".')
    expect(plan.rows[3].message).toMatch(/Inspection Frequency "Fortnightly" should be/)
    expect(plan.rows[4].message).toMatch(/Safety Critical "Maybe" should be Yes or No/)
    expect(plan.rows[5].message).toBe('Repeats line 2 of this file.')

    const forklift = await db.asset.findFirstOrThrow({ where: { companyId: CO, serialNumber: 'FL-2019-0042' } })
    expect(forklift).toMatchObject({ category: 'forklift', frequency: 'monthly', critical: true, owner: 'Grace Lim', siteId: BTU })
    expect(await db.inspection.count({ where: { assetId: forklift.id } })).toBe(1)
    const tower = await db.asset.findFirstOrThrow({ where: { companyId: CO, serialNumber: 'TL-02' } })
    expect(tower).toMatchObject({ category: 'custom', customCategory: 'Lighting Tower', frequency: 'annual' })

    expect((await json(await run('assets', assets))).skip).toBe(3)
  })

  it('reads a HIRARC spreadsheet\'s ratings as people write them, and recognises its own export', async () => {
    const hirarc = [
      'No,Site,Work Activity,Hazard,Which Can Cause,Existing Controls,Likelihood,Severity,Risk,Recommended Controls,PIC,Due Date,Residual Likelihood,Residual Severity',
      '1,BTU,Loading at Bay 4,Reversing forklift,"Struck-by injury, crushing",Reversing alarm,4 Possible,Fatal,16,Banksman; exclusion zone,Ali Hassan,31/12/2030,2,4',
      '2,BTU,Loading at Bay 4,Pallet collapse,Crushing,,4 Remote,4,16,,,,,',
      '3,BTU,Welding,Arc flash,,,3,3,9,,,,,',
      '4,MRI,Grinding,Flying particles,Eye injury,Goggles,2,2,4,Face shield,Rosli,,3,3',
      '5,Miri Base,Office,Trailing cable,"Trip, bruise",,remote,minor,4,,,,,',
      '6,Bintulu Yard,loading at bay 4,Reversing  forklift,Crushing,,4,4,16,,,,,',
    ].join('\n')
    const plan = await json(await run('risk_assessments', hirarc))
    expect(actions(plan)).toEqual(['2:add', '3:fix', '4:fix', '5:fix', '6:add', '7:fix'])
    expect(plan.ignoredColumns).toEqual([])
    expect(plan.rows[1].message).toBe('Likelihood "4 Remote" should be 1 to 5, or one of: Most Likely, Possible, Conceivable, Remote, Inconceivable.')
    expect(plan.rows[2].message).toBe('Say what the hazard can cause.')
    expect(plan.rows[3].message).toBe('The risk once the recommended controls are in place cannot be higher than the risk now.')
    expect(plan.rows[5].message).toBe('Repeats line 2 of this file.')

    const forklift = await db.riskAssessment.findFirstOrThrow({ where: { companyId: CO, hazard: 'Reversing forklift' } })
    expect(forklift).toMatchObject({ likelihood: 4, severity: 4, riskScore: 16, residualScore: 8, owner: 'Ali Hassan', assessedBy: 'Import hse_manager' })
    expect(forklift.controlsDue?.toISOString().slice(0, 10)).toBe('2030-12-31')
    expect((await db.riskAssessment.findFirstOrThrow({ where: { companyId: CO, hazard: 'Trailing cable' } })).riskScore).toBe(4)

    // Exported, then imported again: every row is recognised by its HZ number.
    const exported = await (await fetch(`${base}/risk-assessments/export.csv?companyId=${CO}`, { headers: { Authorization: `Bearer ${tokenFor('hse_manager')}` } })).text()
    const again = await json(await run('risk_assessments', exported))
    expect(again).toMatchObject({ add: 0, skip: 2, fix: 0, ignoredColumns: [] })
  })

  it('names a missing column, and refuses a file that is not CSV text', async () => {
    let res = await preview('assets', 'Name,Site\nForklift,BTU\n')
    expect(res.status).toBe(400)
    expect((await json(res)).message).toBe('The file has no "Category", "Serial No", "Owner", "Inspection Frequency" column. Download the template to see the columns.')

    res = await preview('employees', 'Name,Site\n')
    expect((await json(res)).message).toBe('The file has no rows under its header.')

    res = await send(`/employees/preview?companyId=${CO}`, JSON.stringify({ rows: [] }), 'hse_manager', 'application/json')
    expect(res.status).toBe(400)
    expect((await json(res)).message).toBe('Send the file as CSV text.')

    res = await preview('timesheets', 'Name\nAli\n')
    expect(res.status).toBe(404)
  })

  it('caps a file at 2,000 rows, so one import cannot run for an hour', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `Person ${i},BTU`)
    const res = await preview('employees', ['Name,Site', ...rows].join('\n'))
    expect(res.status).toBe(400)
    expect((await json(res)).message).toMatch(/up to 2000 rows/)
  })

  it('is for an Admin or HSE Manager, in their own workspace', async () => {
    let res = await preview('employees', employees, 'safety_officer')
    expect(res.status).toBe(403)
    expect((await json(res)).message).toBe('Importing registers is for an Admin or HSE Manager.')

    res = await fetch(`${base}/imports/employees?companyId=${CO}`, {
      method: 'POST', body: employees,
      headers: { 'Content-Type': 'text/csv', Authorization: `Bearer ${tokenFor('admin', OTHER)}` },
    })
    expect(res.status).toBe(403)
    expect(await db.employee.count({ where: { companyId: OTHER } })).toBe(0)
  })
})
