import type { AssetCategory, InspectionFrequency, PrismaClient, Role } from '@prisma/client'
import { type Caller, membershipOf } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'
import { EmployeeService } from './employeeService.js'
import { ContractorService } from './contractorService.js'
import { InspectionService } from './inspectionService.js'
import { ASSET_CATEGORIES, CATEGORY_LABEL } from './inspectionCatalog.js'
import { headerKey, MAX_IMPORT_ROWS, parseCsv, parseDay, parseYesNo } from './csvParse.js'

/**
 * Loading a company's existing registers from a spreadsheet: employees, contractors and
 * their workers, and equipment.
 *
 * A workspace starts empty, and the company already has these lists - in Excel, in a payroll
 * export, in a contractor's induction sheet. Typed in one at a time, three hundred workers
 * and a hundred and fifty assets is a week nobody spends, so the pilot never gets its data.
 *
 * Every row goes through the register's own create - the same validation, the same numbering,
 * the same audit entry and, for an asset, the same first inspection - so an imported record is
 * indistinguishable from one entered by hand. Two passes: a preview that writes nothing and
 * says, row by row, what would be added, what is already there and what needs fixing; then
 * the import, which adds the rows the preview said it would.
 *
 * Nothing is ever overwritten. A row that matches an existing record - by employee number or
 * e-mail, by registration number, by IC or passport, by serial number - is skipped and named,
 * so running the same file twice adds nothing the second time. Changing a record that exists
 * is done on the record, where the change is seen.
 */
export class ImportError extends DomainError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status)
    this.name = 'ImportError'
  }
}

export const IMPORT_KINDS = ['employees', 'contractors', 'contractor_workers', 'assets'] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]

/** Who may import: creating employees and contractors already needs one of these. */
const IMPORT_ROLES: Role[] = ['admin', 'hse_manager']

export interface ImportColumn {
  key: string
  header: string
  required: boolean
  help: string
  example: string
  /** Other headers the same column turns up under in exported spreadsheets. */
  aliases?: string[]
}

export const IMPORT_LABEL: Record<ImportKind, string> = {
  employees: 'Employees',
  contractors: 'Contractors',
  contractor_workers: 'Contractor Workers',
  assets: 'Equipment',
}

const DATE_HELP = 'DD/MM/YYYY or YYYY-MM-DD.'

export const IMPORT_COLUMNS: Record<ImportKind, ImportColumn[]> = {
  employees: [
    { key: 'name', header: 'Name', required: true, help: 'Full name.', example: 'Grace Lim', aliases: ['Full Name', 'Employee Name'] },
    { key: 'site', header: 'Site', required: true, help: 'The site name or short code, as in SafeChain.', example: 'Bintulu' },
    { key: 'employeeNo', header: 'Employee No', required: false, help: 'Your own staff number. Kept, and used to recognise the person if the file is imported again.', example: 'P10234', aliases: ['Staff No', 'Staff ID', 'Employee ID', 'Emp No'] },
    { key: 'position', header: 'Position', required: false, help: 'Job title.', example: 'Rigger', aliases: ['Job Title', 'Designation'] },
    { key: 'department', header: 'Department', required: false, help: 'As your organisation names it.', example: 'Maintenance' },
    { key: 'email', header: 'Email', required: false, help: 'Work e-mail. Also recognises the person on a second import.', example: 'grace.lim@company.com', aliases: ['E-mail', 'Email Address'] },
    { key: 'phone', header: 'Phone', required: false, help: 'Mobile number.', example: '012-345 6789', aliases: ['Mobile', 'Phone No'] },
    { key: 'hireDate', header: 'Hire Date', required: false, help: DATE_HELP, example: '02/03/2021', aliases: ['Date Joined', 'Join Date', 'Start Date'] },
    { key: 'medicalExpiry', header: 'Medical Expiry', required: false, help: `When their fitness-to-work medical expires. ${DATE_HELP}`, example: '30/06/2027' },
  ],
  contractors: [
    { key: 'name', header: 'Name', required: true, help: 'The contractor company.', example: 'Kenyalang Scaffolding Sdn Bhd', aliases: ['Company', 'Company Name', 'Contractor'] },
    { key: 'registrationNumber', header: 'Registration No', required: false, help: 'SSM number. Recognises the company if the file is imported again.', example: '201901012345', aliases: ['SSM No', 'Reg No', 'Registration Number'] },
    { key: 'contactPerson', header: 'Contact Person', required: false, help: '', example: 'Ahmad Zaki', aliases: ['Contact'] },
    { key: 'phone', header: 'Phone', required: false, help: '', example: '082-123 456' },
    { key: 'email', header: 'Email', required: false, help: '', example: 'hse@kenyalang-scaffold.com.my', aliases: ['E-mail'] },
    { key: 'address', header: 'Address', required: false, help: '', example: 'Lot 12, Jalan Datuk Abang Abdul Rahim, Kuching' },
    { key: 'insuranceExpiry', header: 'Insurance Expiry', required: false, help: DATE_HELP, example: '31/12/2026' },
  ],
  contractor_workers: [
    { key: 'name', header: 'Name', required: true, help: 'Full name.', example: 'Rashid Karim', aliases: ['Worker Name', 'Full Name'] },
    { key: 'contractor', header: 'Contractor', required: true, help: 'The contractor company: its name, SSM number or SafeChain code. Import contractors first.', example: 'Kenyalang Scaffolding Sdn Bhd', aliases: ['Company'] },
    { key: 'site', header: 'Site', required: true, help: 'The site name or short code, as in SafeChain.', example: 'Bintulu' },
    { key: 'icPassport', header: 'IC/Passport No', required: false, help: 'Recognises the worker if the file is imported again.', example: '880101-13-5678', aliases: ['IC No', 'Passport No', 'IC', 'Passport', 'IC Passport'] },
    { key: 'position', header: 'Position', required: false, help: '', example: 'Scaffolder', aliases: ['Trade', 'Job Title'] },
    { key: 'medicalExpiry', header: 'Medical Expiry', required: false, help: DATE_HELP, example: '30/06/2027' },
    { key: 'inductionExpiry', header: 'Induction Expiry', required: false, help: `When their site safety induction expires. ${DATE_HELP}`, example: '31/12/2026' },
    { key: 'emergencyName', header: 'Emergency Contact', required: false, help: '', example: 'Siti Karim' },
    { key: 'emergencyPhone', header: 'Emergency Phone', required: false, help: '', example: '013-456 7890' },
    { key: 'emergencyRelation', header: 'Relationship', required: false, help: '', example: 'Wife', aliases: ['Emergency Relationship'] },
  ],
  assets: [
    { key: 'name', header: 'Name', required: true, help: 'What it is, as people on site call it.', example: 'Forklift 3', aliases: ['Asset Name', 'Equipment'] },
    { key: 'category', header: 'Category', required: true, help: `One of: ${ASSET_CATEGORIES.filter((c) => c !== 'custom').map((c) => CATEGORY_LABEL[c]).join(', ')}. Anything else is kept as its own category.`, example: 'Forklift', aliases: ['Type', 'Asset Type'] },
    { key: 'serialNumber', header: 'Serial No', required: true, help: 'Recognises the item if the file is imported again.', example: 'FL-2019-0042', aliases: ['Serial Number', 'Serial', 'Tag No'] },
    { key: 'site', header: 'Site', required: true, help: 'The site name or short code, as in SafeChain.', example: 'Bintulu' },
    { key: 'owner', header: 'Owner', required: true, help: 'Who is responsible for it.', example: 'Grace Lim', aliases: ['Responsible Person', 'Custodian'] },
    { key: 'frequency', header: 'Inspection Frequency', required: true, help: 'Daily, Weekly, Monthly, Quarterly or Annual.', example: 'Monthly', aliases: ['Frequency', 'Inspection'] },
    { key: 'manufacturer', header: 'Manufacturer', required: false, help: '', example: 'Toyota', aliases: ['Make'] },
    { key: 'model', header: 'Model', required: false, help: '', example: '8FBE20' },
    { key: 'department', header: 'Department', required: false, help: '', example: 'Warehouse' },
    { key: 'location', header: 'Location', required: false, help: '', example: 'Bay 4' },
    { key: 'purchaseDate', header: 'Purchase Date', required: false, help: DATE_HELP, example: '15/08/2019' },
    { key: 'commissionDate', header: 'Commission Date', required: false, help: DATE_HELP, example: '01/09/2019' },
    { key: 'warrantyUntil', header: 'Warranty Until', required: false, help: DATE_HELP, example: '31/08/2024' },
    { key: 'critical', header: 'Safety Critical', required: false, help: 'Yes if its failure would hurt someone directly.', example: 'Yes', aliases: ['Critical'] },
    { key: 'requiresCalibration', header: 'Needs Calibration', required: false, help: 'Yes for instruments that must be calibrated.', example: 'No', aliases: ['Calibration'] },
    { key: 'notes', header: 'Notes', required: false, help: '', example: '' },
  ],
}

export type RowAction = 'add' | 'skip' | 'fix'

export interface ImportRow {
  /** The line in the file, header included, as a spreadsheet numbers it. */
  line: number
  action: RowAction
  /** Who or what the row is, for the person reading the preview. */
  label: string
  message: string | null
  /** After an import: the reference the new record was given. */
  ref?: string
}

export interface ImportPlan {
  kind: ImportKind
  total: number
  add: number
  skip: number
  fix: number
  /** Headers the file has that the import does not use. Ignored, and said so. */
  ignoredColumns: string[]
  rows: ImportRow[]
}

const FREQUENCY_ALIASES: Record<string, InspectionFrequency> = {
  daily: 'daily', weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', every3months: 'quarterly',
  annual: 'annual', annually: 'annual', yearly: 'annual', every12months: 'annual',
}

type Cells = Record<string, string>

export class DataImportService {
  private employees: EmployeeService
  private contractors: ContractorService
  private inspections: InspectionService

  constructor(private db: PrismaClient) {
    this.employees = new EmployeeService(db)
    this.contractors = new ContractorService(db)
    this.inspections = new InspectionService(db)
  }

  private require(caller: Caller, companyId: string) {
    const m = membershipOf(caller, companyId, ImportError)
    if (!IMPORT_ROLES.includes(m.role)) {
      throw new ImportError('forbidden', 'Importing registers is for an Admin or HSE Manager.', 403)
    }
    return m
  }

  /** The file as rows keyed by column, with the columns it names that are not used. */
  private read(kind: ImportKind, csv: string) {
    const table = parseCsv(csv)
    if (table.length < 2) throw new ImportError('validation', 'The file has no rows under its header.')
    if (table.length - 1 > MAX_IMPORT_ROWS) {
      throw new ImportError('validation', `A file can hold up to ${MAX_IMPORT_ROWS} rows. Split it and import each part.`)
    }
    const columns = IMPORT_COLUMNS[kind]
    const byHeader = new Map<string, string>()
    for (const c of columns) for (const h of [c.header, ...(c.aliases ?? [])]) byHeader.set(headerKey(h), c.key)

    const header = table[0]
    const keys = header.map((h) => byHeader.get(headerKey(h)) ?? null)
    const missing = columns.filter((c) => c.required && !keys.includes(c.key))
    if (missing.length > 0) {
      throw new ImportError('validation',
        `The file has no ${missing.map((c) => `"${c.header}"`).join(', ')} column. Download the template to see the columns.`)
    }
    const ignoredColumns = header.filter((h, i) => h && keys[i] === null)
    const rows = table.slice(1).map((cells, i) => {
      const row: Cells = {}
      keys.forEach((k, j) => { if (k && cells[j] !== undefined && row[k] === undefined) row[k] = cells[j] })
      return { line: i + 2, cells: row }
    })
    return { rows, ignoredColumns }
  }

  private async siteLookup(companyId: string) {
    const sites = await this.db.site.findMany({ where: { companyId }, select: { id: true, name: true, short: true, code: true } })
    const find = (raw: string) => {
      const k = raw.trim().toLowerCase()
      return sites.find((s) => [s.id, s.name, s.short, s.code].some((v) => v && v.toLowerCase() === k)) ?? null
    }
    const names = sites.map((s) => s.name).join(', ')
    return { find, names }
  }

  /** Dates, checked; a problem in words, or the input. */
  private dates(cells: Cells, keys: string[], out: Record<string, string | undefined>): string | null {
    for (const k of keys) {
      const raw = cells[k]?.trim()
      if (!raw) continue
      const d = parseDay(raw)
      if (!d) {
        const col = Object.values(IMPORT_COLUMNS).flat().find((c) => c.key === k)
        return `${col?.header ?? k} "${raw}" is not a date. Write it as DD/MM/YYYY or YYYY-MM-DD.`
      }
      out[k] = d
    }
    return null
  }

  // ── Each register's rows, prepared ─────────────────────────────────────────

  private async prepareEmployees(companyId: string, rows: { line: number; cells: Cells }[]) {
    const sites = await this.siteLookup(companyId)
    const existing = await this.db.employee.findMany({ where: { companyId }, select: { employeeNo: true, email: true, name: true, active: true, siteId: true } })
    const byNo = new Map(existing.map((e) => [e.employeeNo.toLowerCase(), e]))
    const byEmail = new Map(existing.filter((e) => e.active && e.email).map((e) => [e.email!.toLowerCase(), e]))
    // A row with neither number nor e-mail can only be recognised by name, at its site.
    const byName = new Map(existing.filter((e) => e.active).map((e) => [`${e.siteId}:${e.name.toLowerCase()}`, e]))
    const seen = new Map<string, number>()

    return rows.map(({ line, cells }) => {
      const name = cells.name?.trim() ?? ''
      const plan = (p: Omit<ImportRow, 'line' | 'label'>) => ({ line, label: name || `Row ${line}`, ...p })
      if (!name) return plan({ action: 'fix', message: 'No name.' })
      const site = sites.find(cells.site ?? '')
      if (!site) return plan({ action: 'fix', message: `No site called "${cells.site ?? ''}". Sites: ${sites.names}.` })
      const employeeNo = cells.employeeNo?.trim() || undefined
      const email = cells.email?.trim() || undefined
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return plan({ action: 'fix', message: `"${email}" is not an e-mail address.` })
      const nameKey = `${site.id}:${name.toLowerCase()}`
      const keys = employeeNo || email
        ? [employeeNo && `no:${employeeNo.toLowerCase()}`, email && `email:${email.toLowerCase()}`].filter(Boolean) as string[]
        : [`name:${nameKey}`]
      for (const key of keys) {
        const first = seen.get(key)
        if (first) {
          return plan({ action: 'fix', message: key.startsWith('name:')
            ? `Repeats line ${first} of this file. If they are two people, give each an Employee No.`
            : `Repeats line ${first} of this file.` })
        }
        seen.set(key, line)
      }
      const match = (employeeNo && byNo.get(employeeNo.toLowerCase())) || (email && byEmail.get(email.toLowerCase()))
      if (match) {
        return plan({ action: 'skip', message: `Already in the register as ${match.name} (${match.employeeNo})${match.active ? '' : ', marked as left'}.` })
      }
      const namesake = !employeeNo && !email ? byName.get(nameKey) : undefined
      if (namesake) {
        return plan({ action: 'skip', message: `Already in the register at this site as ${namesake.employeeNo}. If this is someone else of the same name, give them an Employee No.` })
      }
      // The register's own rules for a supplied number, said in the preview rather than at import.
      if (employeeNo && employeeNo.length > 40) return plan({ action: 'fix', message: 'Employee No is at most 40 characters.' })
      if (employeeNo && /^emp-\d+$/i.test(employeeNo)) {
        return plan({ action: 'fix', message: `${employeeNo} is a SafeChain-issued number. Leave Employee No empty to have one issued.` })
      }
      const extra: Record<string, string | undefined> = {}
      const bad = this.dates(cells, ['hireDate', 'medicalExpiry'], extra)
      if (bad) return plan({ action: 'fix', message: bad })
      return {
        ...plan({ action: 'add', message: null }),
        input: {
          name, siteId: site.id, employeeNo, email,
          position: cells.position, department: cells.department, phone: cells.phone,
          hireDate: extra.hireDate, medicalExpiry: extra.medicalExpiry,
        },
      }
    })
  }

  private async prepareContractors(companyId: string, rows: { line: number; cells: Cells }[]) {
    const existing = await this.db.contractorCompany.findMany({ where: { companyId }, select: { code: true, name: true, registrationNumber: true } })
    const byReg = new Map(existing.filter((c) => c.registrationNumber).map((c) => [c.registrationNumber.toLowerCase(), c]))
    const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]))
    const seen = new Map<string, number>()

    return rows.map(({ line, cells }) => {
      const name = cells.name?.trim() ?? ''
      const plan = (p: Omit<ImportRow, 'line' | 'label'>) => ({ line, label: name || `Row ${line}`, ...p })
      if (!name) return plan({ action: 'fix', message: 'No company name.' })
      const reg = cells.registrationNumber?.trim() || undefined
      const key = reg ? `reg:${reg.toLowerCase()}` : `name:${name.toLowerCase()}`
      const first = seen.get(key)
      if (first) return plan({ action: 'fix', message: `Repeats line ${first} of this file.` })
      seen.set(key, line)
      const match = (reg && byReg.get(reg.toLowerCase())) || byName.get(name.toLowerCase())
      if (match) return plan({ action: 'skip', message: `Already registered as ${match.name} (${match.code}).` })
      const extra: Record<string, string | undefined> = {}
      const bad = this.dates(cells, ['insuranceExpiry'], extra)
      if (bad) return plan({ action: 'fix', message: bad })
      return {
        ...plan({ action: 'add', message: null }),
        input: {
          name, registrationNumber: reg, contactPerson: cells.contactPerson, phone: cells.phone,
          email: cells.email, address: cells.address, insuranceExpiry: extra.insuranceExpiry,
        },
      }
    })
  }

  private async prepareWorkers(companyId: string, rows: { line: number; cells: Cells }[]) {
    const sites = await this.siteLookup(companyId)
    const companies = await this.db.contractorCompany.findMany({ where: { companyId }, select: { id: true, code: true, name: true, registrationNumber: true } })
    const contractorFor = (raw: string) => {
      const k = raw.trim().toLowerCase()
      return companies.find((c) => [c.code, c.name, c.registrationNumber].some((v) => v && v.toLowerCase() === k)) ?? null
    }
    const existing = await this.db.contractorWorker.findMany({
      where: { companyId, active: true },
      select: { icPassport: true, name: true, workerNo: true, contractorCompanyId: true },
    })
    const byIc = new Map(existing.filter((w) => w.icPassport).map((w) => [w.icPassport.toLowerCase(), w]))
    // Without an IC or passport, a worker can only be recognised by name, under their contractor.
    const byName = new Map(existing.map((w) => [`${w.contractorCompanyId}:${w.name.toLowerCase()}`, w]))
    const seen = new Map<string, number>()

    return rows.map(({ line, cells }) => {
      const name = cells.name?.trim() ?? ''
      const plan = (p: Omit<ImportRow, 'line' | 'label'>) => ({ line, label: name || `Row ${line}`, ...p })
      if (!name) return plan({ action: 'fix', message: 'No name.' })
      const contractor = contractorFor(cells.contractor ?? '')
      if (!contractor) {
        return plan({ action: 'fix', message: `No contractor called "${cells.contractor ?? ''}". Import the contractor first, or use its name as it is in SafeChain.` })
      }
      const site = sites.find(cells.site ?? '')
      if (!site) return plan({ action: 'fix', message: `No site called "${cells.site ?? ''}". Sites: ${sites.names}.` })
      const ic = cells.icPassport?.trim() || undefined
      const nameKey = `${contractor.id}:${name.toLowerCase()}`
      const key = ic ? `ic:${ic.toLowerCase()}` : `name:${nameKey}`
      const first = seen.get(key)
      if (first) {
        return plan({ action: 'fix', message: ic
          ? `Repeats line ${first} of this file.`
          : `Repeats line ${first} of this file. If they are two people, give each their IC or passport number.` })
      }
      seen.set(key, line)
      const match = ic ? byIc.get(ic.toLowerCase()) : byName.get(nameKey)
      if (match) {
        return plan({ action: 'skip', message: ic
          ? `Already registered as ${match.name} (${match.workerNo}).`
          : `Already registered with ${contractor.name} as ${match.workerNo}. If this is someone else of the same name, give their IC or passport number.` })
      }
      const extra: Record<string, string | undefined> = {}
      const bad = this.dates(cells, ['medicalExpiry', 'inductionExpiry'], extra)
      if (bad) return plan({ action: 'fix', message: bad })
      return {
        ...plan({ action: 'add', message: ic ? null : 'No IC or passport number: recognised by name alone if the file is imported again.' }),
        input: {
          name, contractorCompanyId: contractor.id, siteId: site.id, icPassport: ic, position: cells.position,
          medicalExpiry: extra.medicalExpiry, inductionExpiry: extra.inductionExpiry,
          emergencyName: cells.emergencyName, emergencyPhone: cells.emergencyPhone, emergencyRelation: cells.emergencyRelation,
        },
      }
    })
  }

  private async prepareAssets(companyId: string, rows: { line: number; cells: Cells }[]) {
    const sites = await this.siteLookup(companyId)
    const existing = await this.db.asset.findMany({ where: { companyId }, select: { serialNumber: true, code: true, name: true } })
    const bySerial = new Map(existing.map((a) => [a.serialNumber.toLowerCase(), a]))
    const categoryOf = (raw: string): { category: AssetCategory; custom?: string } => {
      const k = headerKey(raw)
      const hit = ASSET_CATEGORIES.find((c) => c !== 'custom' && (headerKey(c) === k || headerKey(CATEGORY_LABEL[c]) === k))
      return hit ? { category: hit } : { category: 'custom', custom: raw.trim() }
    }
    const seen = new Map<string, number>()

    return rows.map(({ line, cells }) => {
      const name = cells.name?.trim() ?? ''
      const plan = (p: Omit<ImportRow, 'line' | 'label'>) => ({ line, label: name || `Row ${line}`, ...p })
      const missing = (['name', 'category', 'serialNumber', 'owner', 'frequency'] as const).filter((k) => !cells[k]?.trim())
      if (missing.length > 0) {
        const headers = missing.map((k) => IMPORT_COLUMNS.assets.find((c) => c.key === k)!.header)
        return plan({ action: 'fix', message: `Missing ${headers.join(', ')}.` })
      }
      const serial = cells.serialNumber.trim()
      const first = seen.get(serial.toLowerCase())
      if (first) return plan({ action: 'fix', message: `Repeats line ${first} of this file.` })
      seen.set(serial.toLowerCase(), line)
      const match = bySerial.get(serial.toLowerCase())
      if (match) return plan({ action: 'skip', message: `Already registered as ${match.name} (${match.code}).` })
      const site = sites.find(cells.site ?? '')
      if (!site) return plan({ action: 'fix', message: `No site called "${cells.site ?? ''}". Sites: ${sites.names}.` })
      const frequency = FREQUENCY_ALIASES[headerKey(cells.frequency)]
      if (!frequency) return plan({ action: 'fix', message: `Inspection Frequency "${cells.frequency}" should be Daily, Weekly, Monthly, Quarterly or Annual.` })
      const flags: Record<string, boolean | undefined> = {}
      for (const k of ['critical', 'requiresCalibration'] as const) {
        const v = parseYesNo(cells[k] ?? '')
        if (v === null) {
          const header = IMPORT_COLUMNS.assets.find((c) => c.key === k)!.header
          return plan({ action: 'fix', message: `${header} "${cells[k]}" should be Yes or No.` })
        }
        flags[k] = v
      }
      const extra: Record<string, string | undefined> = {}
      const bad = this.dates(cells, ['purchaseDate', 'commissionDate', 'warrantyUntil'], extra)
      if (bad) return plan({ action: 'fix', message: bad })
      const cat = categoryOf(cells.category)
      return {
        ...plan({ action: 'add', message: cat.custom ? `Kept as its own category, "${cat.custom}".` : null }),
        input: {
          companyId, siteId: site.id, name, category: cat.category, customCategory: cat.custom,
          serialNumber: serial, owner: cells.owner.trim(), frequency,
          manufacturer: cells.manufacturer, model: cells.model, department: cells.department, location: cells.location,
          purchaseDate: extra.purchaseDate, commissionDate: extra.commissionDate, warrantyUntil: extra.warrantyUntil,
          critical: flags.critical, requiresCalibration: flags.requiresCalibration, notes: cells.notes,
        },
      }
    })
  }

  private prepare(companyId: string, kind: ImportKind, rows: { line: number; cells: Cells }[]) {
    switch (kind) {
      case 'employees': return this.prepareEmployees(companyId, rows)
      case 'contractors': return this.prepareContractors(companyId, rows)
      case 'contractor_workers': return this.prepareWorkers(companyId, rows)
      case 'assets': return this.prepareAssets(companyId, rows)
    }
  }

  private summarise(kind: ImportKind, rows: ImportRow[], ignoredColumns: string[]): ImportPlan {
    return {
      kind, total: rows.length, ignoredColumns, rows,
      add: rows.filter((r) => r.action === 'add').length,
      skip: rows.filter((r) => r.action === 'skip').length,
      fix: rows.filter((r) => r.action === 'fix').length,
    }
  }

  /** What importing the file would do, row by row. Writes nothing. */
  async preview(caller: Caller, companyId: string, kind: ImportKind, csv: string): Promise<ImportPlan> {
    this.require(caller, companyId)
    const { rows, ignoredColumns } = this.read(kind, csv)
    const prepared = await this.prepare(companyId, kind, rows)
    return this.summarise(kind, prepared.map(({ line, label, action, message }) => ({ line, label, action, message })), ignoredColumns)
  }

  /**
   * Add the rows the preview would add. Rows to fix are left out, and said so; a row the
   * register refuses at the last moment - another person added the same worker a second ago -
   * is reported as one to fix rather than stopping the rest.
   */
  async run(caller: Caller, companyId: string, kind: ImportKind, csv: string, ctx: { ip?: string; device?: string } = {}): Promise<ImportPlan> {
    const m = this.require(caller, companyId)
    const { rows, ignoredColumns } = this.read(kind, csv)
    const prepared = await this.prepare(companyId, kind, rows) as (ImportRow & { input?: unknown })[]
    const results: ImportRow[] = []
    for (const row of prepared) {
      const { input, ...result } = row
      if (row.action !== 'add' || !input) { results.push(result); continue }
      try {
        const ref = await this.create(caller, companyId, kind, input, ctx)
        results.push({ ...result, ref })
      } catch (e) {
        if (e instanceof DomainError) {
          results.push({ ...result, action: 'fix', message: e.message })
        } else if ((e as { code?: string }).code === 'P2002') {
          // The database's own uniqueness, caught between this file's check and the write:
          // someone added the same number a moment ago. One row, not the whole import.
          results.push({ ...result, action: 'fix', message: 'Added by someone else while this file was importing. Import the file again to see it skipped.' })
        } else {
          throw e
        }
      }
    }
    const plan = this.summarise(kind, results, ignoredColumns)
    await this.db.adminAuditEntry.create({
      data: {
        companyId, actor: caller.name, actorRole: m.role, action: `Imported ${IMPORT_LABEL[kind].toLowerCase()}`,
        module: 'admin', target: `${plan.add} added, ${plan.skip} already there, ${plan.fix} left to fix`,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
    return plan
  }

  private async create(caller: Caller, companyId: string, kind: ImportKind, input: unknown, ctx: { ip?: string; device?: string }): Promise<string> {
    switch (kind) {
      case 'employees':
        return (await this.employees.create(caller, companyId, input as Parameters<EmployeeService['create']>[2], ctx)).employeeNo
      case 'contractors':
        return (await this.contractors.createCompany(caller, companyId, input as Parameters<ContractorService['createCompany']>[2], ctx)).code
      case 'contractor_workers':
        return (await this.contractors.createWorker(caller, companyId, input as Parameters<ContractorService['createWorker']>[2], ctx)).workerNo
      case 'assets': {
        return (await this.inspections.createAsset(caller, input as Parameters<InspectionService['createAsset']>[1])).code
      }
    }
  }
}

/** The empty file to fill in: the headers, and one example row a person can overwrite. */
export function templateCsv(kind: ImportKind): string {
  const cols = IMPORT_COLUMNS[kind]
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [cols.map((c) => cell(c.header)).join(','), cols.map((c) => cell(c.example)).join(',')].join('\r\n') + '\r\n'
}
