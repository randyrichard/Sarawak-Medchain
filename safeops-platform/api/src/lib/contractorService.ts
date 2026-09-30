/**
 * Contractors: the firms working on a tenant's sites, and the people they send.
 *
 * Contractors are where most industrial fatalities happen and where the tenant's control
 * is weakest — the people on site are not on the payroll, their training was done
 * somewhere else, and nobody in the client organisation knows their names. Three dates
 * carry almost all the risk:
 *
 *  - The firm's **insurance**. An uninsured contractor on site is the tenant's liability.
 *  - The worker's **medical**, the same fitness bar an employee has to clear.
 *  - The worker's **site induction**, which lapses far more often than anything else
 *    because it is annual and nobody schedules it.
 *
 * All three are stored, derived into a status on read, filtered, counted and swept by
 * the reminder engine. `onSite` exists so "who is on site right now" is a query rather
 * than a paper book in a gate cabin — the question asked first in an evacuation.
 */
import { Prisma, type PrismaClient, type Role } from '@prisma/client'
import { membershipOf, type Caller } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'

export class ContractorError extends DomainError {}

/** Roles that may change the register. Mirrors the workforce register. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager']

/**
 * Roles that may work the gate. Wider than write access on purpose: checking people in
 * and out is a supervisor's job at the start of a shift, and a gate that only an admin
 * can operate is a gate nobody uses — which leaves the evacuation list wrong.
 */
const GATE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

/** Compliance buckets, matching the chips on the register. */
export const COMPLIANCE_FILTERS = ['all', 'valid', 'expiring', 'expired', 'missing'] as const
export type ComplianceFilter = (typeof COMPLIANCE_FILTERS)[number]

/** Inside this window a date reads as "expiring" — the first reminder band. */
export const EXPIRY_WARN_DAYS = 30

export const WORKER_SORTS = ['name', 'workerNo', 'medicalExpiry', 'inductionExpiry'] as const
export type WorkerSort = (typeof WORKER_SORTS)[number]

export const CONTRACTOR_SORTS = ['name', 'code', 'insuranceExpiry'] as const
export type ContractorSort = (typeof CONTRACTOR_SORTS)[number]

const MAX_PAGE_SIZE = 100

export type ExpiryStatus = 'valid' | 'expiring' | 'expired' | 'missing'

function startOfToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((at - startOfToday().getTime()) / 86400_000)
}

/** Derived on read, never stored: a pure function of the date and today. */
export function expiryStatus(d: Date | null): ExpiryStatus {
  if (!d) return 'missing'
  const days = daysUntil(d)!
  if (days < 0) return 'expired'
  if (days <= EXPIRY_WARN_DAYS) return 'expiring'
  return 'valid'
}

/** Translates a compliance bucket into a date range for the given column. */
function expiryWhere(bucket: ComplianceFilter | undefined, today: Date, warnAt: Date) {
  switch (bucket) {
    case 'expired': return { lt: today }
    case 'expiring': return { gte: today, lte: warnAt }
    case 'valid': return { gt: warnAt }
    case 'missing': return null
    default: return undefined
  }
}

export interface ListWorkerParams {
  companyId: string
  page: number
  pageSize: number
  q?: string
  siteId?: string
  contractorCompanyId?: string
  status?: 'active' | 'inactive' | 'all'
  medical?: ComplianceFilter
  induction?: ComplianceFilter
  onSite?: boolean
  sort?: WorkerSort
  dir?: 'asc' | 'desc'
}

export class ContractorService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, ContractorError)
  }


  private requireRole(caller: Caller, companyId: string, allowed: Role[], doing: string) {
    const m = this.membership(caller, companyId)
    if (!allowed.includes(m.role)) {
      throw new ContractorError('forbidden', `Your role does not permit ${doing}.`, 403)
    }
    return m
  }

  /** Site restriction, applied as SQL so restricted rows never leave the database. */
  private siteWhere(caller: Caller, companyId: string): Prisma.ContractorWorkerWhereInput {
    const m = this.membership(caller, companyId)
    return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
  }

  /** Audit trail. Every mutation, on the same table the rest of the platform uses. */
  private async log(
    caller: Caller, companyId: string, action: string, target: string,
    ctx: { ip?: string; device?: string } = {},
    values?: { oldValue?: string; newValue?: string },
  ) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId,
        actor: caller.name,
        actorRole: m?.role ?? '',
        action,
        module: 'contractors',
        target,
        ip: ctx.ip ?? '',
        device: ctx.device ?? '',
        oldValue: values?.oldValue ?? null,
        newValue: values?.newValue ?? null,
      },
    })
  }

  // ── Contractor companies ───────────────────────────────────────────────────

  async listCompanies(caller: Caller, companyId: string, opts: {
    q?: string
    status?: 'active' | 'suspended' | 'all'
    insurance?: ComplianceFilter
    sort?: ContractorSort
    dir?: 'asc' | 'desc'
  } = {}) {
    this.membership(caller, companyId)
    const today = startOfToday()
    const warnAt = new Date(today.getTime() + EXPIRY_WARN_DAYS * 86400_000)
    const range = expiryWhere(opts.insurance, today, warnAt)

    const where: Prisma.ContractorCompanyWhereInput = {
      companyId,
      ...(opts.status && opts.status !== 'all' ? { status: opts.status } : {}),
      ...(opts.insurance === 'missing' ? { insuranceExpiry: null } : range ? { insuranceExpiry: range } : {}),
      ...(opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: 'insensitive' } },
              { code: { contains: opts.q, mode: 'insensitive' } },
              { registrationNumber: { contains: opts.q, mode: 'insensitive' } },
              { contactPerson: { contains: opts.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const rows = await this.db.contractorCompany.findMany({
      where,
      orderBy: { [opts.sort ?? 'name']: opts.dir ?? 'asc' },
      include: {
        _count: { select: { workers: true } },
        workers: { where: { onSite: true, active: true }, select: { id: true } },
      },
    })

    return rows.map((r) => this.toCompanyView(r))
  }

  private toCompanyView(
    r: Prisma.ContractorCompanyGetPayload<{
      include: { _count: { select: { workers: true } }; workers: { select: { id: true } } }
    }>,
  ) {
    return {
      id: r.id,
      companyId: r.companyId,
      code: r.code,
      name: r.name,
      registrationNumber: r.registrationNumber,
      contactPerson: r.contactPerson,
      phone: r.phone,
      email: r.email,
      address: r.address,
      insuranceExpiry: r.insuranceExpiry,
      insuranceStatus: expiryStatus(r.insuranceExpiry),
      daysToInsuranceExpiry: daysUntil(r.insuranceExpiry),
      status: r.status,
      workerCount: r._count.workers,
      onSiteCount: r.workers.length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  async getCompany(caller: Caller, id: string) {
    const row = await this.db.contractorCompany.findUnique({
      where: { id },
      include: {
        _count: { select: { workers: true } },
        workers: { where: { onSite: true, active: true }, select: { id: true } },
      },
    })
    if (!row) throw new ContractorError('not_found', 'Contractor not found.', 404)
    this.membership(caller, row.companyId)
    return this.toCompanyView(row)
  }

  async createCompany(caller: Caller, companyId: string, input: {
    name: string
    registrationNumber?: string
    contactPerson?: string
    phone?: string
    email?: string
    address?: string
    insuranceExpiry?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    this.requireRole(caller, companyId, WRITE_ROLES, 'adding contractors')

    const name = input.name?.trim()
    if (!name) throw new ContractorError('validation', 'A contractor name is required.')

    if (input.registrationNumber?.trim()) {
      const clash = await this.db.contractorCompany.findFirst({
        where: { companyId, registrationNumber: input.registrationNumber.trim() },
        select: { code: true, name: true },
      })
      if (clash) {
        throw new ContractorError('validation', `That registration number is already recorded for ${clash.name} (${clash.code}).`)
      }
    }

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId, kind: 'contractor' } },
        update: { next: { increment: 1 } },
        create: { companyId, kind: 'contractor', next: 101 },
        select: { next: true },
      })
      return tx.contractorCompany.create({
        data: {
          companyId,
          code: `CON-${counter.next}`,
          name,
          registrationNumber: input.registrationNumber?.trim() ?? '',
          contactPerson: input.contactPerson?.trim() ?? '',
          phone: input.phone?.trim() ?? '',
          email: input.email?.trim() || null,
          address: input.address?.trim() ?? '',
          insuranceExpiry: input.insuranceExpiry ? new Date(input.insuranceExpiry) : null,
        },
        include: {
          _count: { select: { workers: true } },
          workers: { where: { onSite: true, active: true }, select: { id: true } },
        },
      })
    })

    await this.log(caller, companyId, 'Added contractor', `${created.code} ${created.name}`, ctx)
    return this.toCompanyView(created)
  }

  async updateCompany(caller: Caller, id: string, patch: {
    name?: string
    registrationNumber?: string
    contactPerson?: string
    phone?: string
    email?: string | null
    address?: string
    insuranceExpiry?: string | null
    status?: 'active' | 'suspended'
  }, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.contractorCompany.findUnique({ where: { id } })
    if (!existing) throw new ContractorError('not_found', 'Contractor not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'editing contractors')

    if (patch.name !== undefined && !patch.name.trim()) {
      throw new ContractorError('validation', 'A contractor name is required.')
    }

    const updated = await this.db.contractorCompany.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.registrationNumber !== undefined ? { registrationNumber: patch.registrationNumber.trim() } : {}),
        ...(patch.contactPerson !== undefined ? { contactPerson: patch.contactPerson.trim() } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}),
        ...(patch.email !== undefined ? { email: patch.email?.trim() || null } : {}),
        ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
        ...(patch.insuranceExpiry !== undefined
          ? { insuranceExpiry: patch.insuranceExpiry ? new Date(patch.insuranceExpiry) : null }
          : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      },
      include: {
        _count: { select: { workers: true } },
        workers: { where: { onSite: true, active: true }, select: { id: true } },
      },
    })

    // Suspension and insurance are the two changes an auditor will ask about, so both
    // keep a before-and-after rather than only noting that an edit happened.
    const insuranceChanged = patch.insuranceExpiry !== undefined
      && String(existing.insuranceExpiry ?? '') !== String(updated.insuranceExpiry ?? '')
    const statusChanged = patch.status !== undefined && patch.status !== existing.status

    await this.log(
      caller, existing.companyId,
      statusChanged ? (patch.status === 'suspended' ? 'Suspended contractor' : 'Reinstated contractor') : 'Edited contractor',
      `${existing.code} ${existing.name}`, ctx,
      insuranceChanged
        ? {
            oldValue: existing.insuranceExpiry?.toISOString().slice(0, 10) ?? 'none',
            newValue: updated.insuranceExpiry?.toISOString().slice(0, 10) ?? 'none',
          }
        : statusChanged ? { oldValue: existing.status, newValue: updated.status } : undefined,
    )
    return this.toCompanyView(updated)
  }

  /**
   * Removal, for a firm recorded in error.
   *
   * Refused once workers have been registered against them, because deleting the firm
   * would cascade away the record of who was on site and what they were qualified for.
   * Suspension is the answer for a contractor who is no longer engaged.
   */
  async removeCompany(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.contractorCompany.findUnique({
      where: { id },
      include: { _count: { select: { workers: true } } },
    })
    if (!existing) throw new ContractorError('not_found', 'Contractor not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'deleting contractors')

    if (existing._count.workers > 0) {
      throw new ContractorError(
        'validation',
        'This contractor has workers registered. Suspend them instead so the site history is kept.',
      )
    }

    await this.db.contractorCompany.delete({ where: { id } })
    await this.log(caller, existing.companyId, 'Deleted contractor', `${existing.code} ${existing.name}`, ctx)
  }

  // ── Workers ────────────────────────────────────────────────────────────────

  async listWorkers(caller: Caller, p: ListWorkerParams) {
    this.membership(caller, p.companyId)
    const pageSize = Math.min(p.pageSize, MAX_PAGE_SIZE)
    const today = startOfToday()
    const warnAt = new Date(today.getTime() + EXPIRY_WARN_DAYS * 86400_000)

    const medicalRange = expiryWhere(p.medical, today, warnAt)
    const inductionRange = expiryWhere(p.induction, today, warnAt)

    const where: Prisma.ContractorWorkerWhereInput = {
      companyId: p.companyId,
      ...this.siteWhere(caller, p.companyId),
      ...(p.siteId ? { siteId: p.siteId } : {}),
      ...(p.contractorCompanyId ? { contractorCompanyId: p.contractorCompanyId } : {}),
      ...(p.status === 'active' ? { active: true } : {}),
      ...(p.status === 'inactive' ? { active: false } : {}),
      ...(p.onSite !== undefined ? { onSite: p.onSite } : {}),
      ...(p.medical === 'missing' ? { medicalExpiry: null } : medicalRange ? { medicalExpiry: medicalRange } : {}),
      ...(p.induction === 'missing' ? { inductionExpiry: null } : inductionRange ? { inductionExpiry: inductionRange } : {}),
      ...(p.q
        ? {
            OR: [
              { name: { contains: p.q, mode: 'insensitive' } },
              { workerNo: { contains: p.q, mode: 'insensitive' } },
              { icPassport: { contains: p.q, mode: 'insensitive' } },
              { position: { contains: p.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, rows] = await this.db.$transaction([
      this.db.contractorWorker.count({ where }),
      this.db.contractorWorker.findMany({
        where,
        orderBy: { [p.sort ?? 'name']: p.dir ?? 'asc' },
        skip: (p.page - 1) * pageSize,
        take: pageSize,
        include: {
          contractorCompany: { select: { id: true, code: true, name: true, status: true } },
          _count: { select: { certificates: true } },
        },
      }),
    ])

    return { total, page: p.page, pageSize, rows: rows.map((r) => this.toWorkerView(r)) }
  }

  private toWorkerView(
    r: Prisma.ContractorWorkerGetPayload<{
      include: {
        contractorCompany: { select: { id: true; code: true; name: true; status: true } }
        _count: { select: { certificates: true } }
      }
    }>,
  ) {
    return {
      id: r.id,
      companyId: r.companyId,
      workerNo: r.workerNo,
      name: r.name,
      icPassport: r.icPassport,
      position: r.position,
      siteId: r.siteId,
      contractorCompanyId: r.contractorCompanyId,
      contractorName: r.contractorCompany.name,
      contractorCode: r.contractorCompany.code,
      contractorSuspended: r.contractorCompany.status === 'suspended',
      medicalExpiry: r.medicalExpiry,
      medicalStatus: expiryStatus(r.medicalExpiry),
      daysToMedicalExpiry: daysUntil(r.medicalExpiry),
      inductionExpiry: r.inductionExpiry,
      inductionStatus: expiryStatus(r.inductionExpiry),
      daysToInductionExpiry: daysUntil(r.inductionExpiry),
      emergencyName: r.emergencyName,
      emergencyPhone: r.emergencyPhone,
      emergencyRelation: r.emergencyRelation,
      onSite: r.onSite,
      checkedInAt: r.checkedInAt,
      active: r.active,
      certificateCount: r._count.certificates,
      /**
       * Whether this person may currently be let through the gate. Derived rather than
       * stored so it can never be stale: it is the answer to the only question the gate
       * actually asks.
       */
      clearedForSite:
        r.active
        && r.contractorCompany.status !== 'suspended'
        && expiryStatus(r.medicalExpiry) !== 'expired'
        && expiryStatus(r.medicalExpiry) !== 'missing'
        && expiryStatus(r.inductionExpiry) !== 'expired'
        && expiryStatus(r.inductionExpiry) !== 'missing',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  async getWorker(caller: Caller, id: string) {
    const row = await this.db.contractorWorker.findUnique({
      where: { id },
      include: {
        contractorCompany: { select: { id: true, code: true, name: true, status: true } },
        certificates: { orderBy: { expiryDate: 'asc' } },
        _count: { select: { certificates: true } },
      },
    })
    if (!row) throw new ContractorError('not_found', 'Worker not found.', 404)

    const m = this.membership(caller, row.companyId)
    if (m.siteIds.length > 0 && !m.siteIds.includes(row.siteId)) {
      throw new ContractorError('forbidden', 'This worker is at a site you cannot see.', 403)
    }

    return {
      ...this.toWorkerView(row),
      certificates: row.certificates.map((c) => ({
        ...c,
        status: expiryStatus(c.expiryDate),
        daysToExpiry: daysUntil(c.expiryDate),
      })),
    }
  }

  async createWorker(caller: Caller, companyId: string, input: {
    contractorCompanyId: string
    siteId: string
    name: string
    icPassport?: string
    position?: string
    medicalExpiry?: string
    inductionExpiry?: string
    emergencyName?: string
    emergencyPhone?: string
    emergencyRelation?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    this.requireRole(caller, companyId, WRITE_ROLES, 'registering contractor workers')

    const name = input.name?.trim()
    if (!name) throw new ContractorError('validation', 'A worker name is required.')

    const contractor = await this.db.contractorCompany.findFirst({
      where: { id: input.contractorCompanyId, companyId },
    })
    if (!contractor) throw new ContractorError('validation', 'That contractor does not belong to this workspace.')

    const site = await this.db.site.findFirst({ where: { id: input.siteId, companyId } })
    if (!site) throw new ContractorError('validation', 'That site does not belong to this workspace.')

    if (input.icPassport?.trim()) {
      const clash = await this.db.contractorWorker.findFirst({
        where: { companyId, icPassport: input.icPassport.trim(), active: true },
        select: { workerNo: true, name: true },
      })
      if (clash) {
        throw new ContractorError('validation', `That IC/passport is already registered to ${clash.name} (${clash.workerNo}).`)
      }
    }

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId, kind: 'contractor_worker' } },
        update: { next: { increment: 1 } },
        create: { companyId, kind: 'contractor_worker', next: 1001 },
        select: { next: true },
      })
      return tx.contractorWorker.create({
        data: {
          companyId,
          contractorCompanyId: input.contractorCompanyId,
          siteId: input.siteId,
          workerNo: `CW-${counter.next}`,
          name,
          icPassport: input.icPassport?.trim() ?? '',
          position: input.position?.trim() ?? '',
          medicalExpiry: input.medicalExpiry ? new Date(input.medicalExpiry) : null,
          inductionExpiry: input.inductionExpiry ? new Date(input.inductionExpiry) : null,
          emergencyName: input.emergencyName?.trim() ?? '',
          emergencyPhone: input.emergencyPhone?.trim() ?? '',
          emergencyRelation: input.emergencyRelation?.trim() ?? '',
        },
        include: {
          contractorCompany: { select: { id: true, code: true, name: true, status: true } },
          _count: { select: { certificates: true } },
        },
      })
    })

    await this.log(caller, companyId, 'Registered contractor worker', `${created.workerNo} ${created.name}`, ctx)
    return this.toWorkerView(created)
  }

  async updateWorker(caller: Caller, id: string, patch: {
    contractorCompanyId?: string
    siteId?: string
    name?: string
    icPassport?: string
    position?: string
    medicalExpiry?: string | null
    inductionExpiry?: string | null
    emergencyName?: string
    emergencyPhone?: string
    emergencyRelation?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.contractorWorker.findUnique({ where: { id } })
    if (!existing) throw new ContractorError('not_found', 'Worker not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'editing contractor workers')

    if (patch.name !== undefined && !patch.name.trim()) {
      throw new ContractorError('validation', 'A worker name is required.')
    }
    if (patch.siteId) {
      const site = await this.db.site.findFirst({ where: { id: patch.siteId, companyId: existing.companyId } })
      if (!site) throw new ContractorError('validation', 'That site does not belong to this workspace.')
    }
    if (patch.contractorCompanyId) {
      const c = await this.db.contractorCompany.findFirst({
        where: { id: patch.contractorCompanyId, companyId: existing.companyId },
      })
      if (!c) throw new ContractorError('validation', 'That contractor does not belong to this workspace.')
    }

    const updated = await this.db.contractorWorker.update({
      where: { id },
      data: {
        ...(patch.contractorCompanyId !== undefined ? { contractorCompanyId: patch.contractorCompanyId } : {}),
        ...(patch.siteId !== undefined ? { siteId: patch.siteId } : {}),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.icPassport !== undefined ? { icPassport: patch.icPassport.trim() } : {}),
        ...(patch.position !== undefined ? { position: patch.position.trim() } : {}),
        ...(patch.medicalExpiry !== undefined
          ? { medicalExpiry: patch.medicalExpiry ? new Date(patch.medicalExpiry) : null } : {}),
        ...(patch.inductionExpiry !== undefined
          ? { inductionExpiry: patch.inductionExpiry ? new Date(patch.inductionExpiry) : null } : {}),
        ...(patch.emergencyName !== undefined ? { emergencyName: patch.emergencyName.trim() } : {}),
        ...(patch.emergencyPhone !== undefined ? { emergencyPhone: patch.emergencyPhone.trim() } : {}),
        ...(patch.emergencyRelation !== undefined ? { emergencyRelation: patch.emergencyRelation.trim() } : {}),
      },
      include: {
        contractorCompany: { select: { id: true, code: true, name: true, status: true } },
        _count: { select: { certificates: true } },
      },
    })

    const dateChanged = (a: Date | null, b: Date | null) => String(a ?? '') !== String(b ?? '')
    const compliance =
      (patch.medicalExpiry !== undefined && dateChanged(existing.medicalExpiry, updated.medicalExpiry))
      || (patch.inductionExpiry !== undefined && dateChanged(existing.inductionExpiry, updated.inductionExpiry))

    await this.log(
      caller, existing.companyId, 'Edited contractor worker', `${existing.workerNo} ${existing.name}`, ctx,
      compliance
        ? {
            oldValue: `medical ${existing.medicalExpiry?.toISOString().slice(0, 10) ?? 'none'} / induction ${existing.inductionExpiry?.toISOString().slice(0, 10) ?? 'none'}`,
            newValue: `medical ${updated.medicalExpiry?.toISOString().slice(0, 10) ?? 'none'} / induction ${updated.inductionExpiry?.toISOString().slice(0, 10) ?? 'none'}`,
          }
        : undefined,
    )
    return this.toWorkerView(updated)
  }

  async setWorkerActive(caller: Caller, id: string, active: boolean, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.contractorWorker.findUnique({ where: { id } })
    if (!existing) throw new ContractorError('not_found', 'Worker not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'changing worker status')

    const updated = await this.db.contractorWorker.update({
      where: { id },
      // Deregistering someone also takes them off site: leaving them checked in would
      // leave a name on the evacuation list for a person who has gone home for good.
      data: { active, ...(active ? {} : { onSite: false, checkedInAt: null }) },
      include: {
        contractorCompany: { select: { id: true, code: true, name: true, status: true } },
        _count: { select: { certificates: true } },
      },
    })
    await this.log(
      caller, existing.companyId, active ? 'Reinstated contractor worker' : 'Deregistered contractor worker',
      `${existing.workerNo} ${existing.name}`, ctx,
    )
    return this.toWorkerView(updated)
  }

  async removeWorker(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.contractorWorker.findUnique({
      where: { id },
      include: { _count: { select: { certificates: true } } },
    })
    if (!existing) throw new ContractorError('not_found', 'Worker not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'deleting contractor workers')

    if (existing._count.certificates > 0) {
      throw new ContractorError(
        'validation',
        'This worker has competency records. Deregister them instead so the site history is kept.',
      )
    }

    await this.db.contractorWorker.delete({ where: { id } })
    await this.log(caller, existing.companyId, 'Deleted contractor worker', `${existing.workerNo} ${existing.name}`, ctx)
  }

  // ── Gate ───────────────────────────────────────────────────────────────────

  /**
   * Check in.
   *
   * The compliance gate is enforced here rather than advised, because this is the only
   * moment the system can actually stop someone walking onto a live site with a lapsed
   * medical. Refusing at the gate is the entire point of holding the dates.
   */
  async checkIn(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const worker = await this.db.contractorWorker.findUnique({
      where: { id },
      include: {
        contractorCompany: { select: { id: true, code: true, name: true, status: true } },
        _count: { select: { certificates: true } },
      },
    })
    if (!worker) throw new ContractorError('not_found', 'Worker not found.', 404)
    this.requireRole(caller, worker.companyId, GATE_ROLES, 'checking workers on site')

    const view = this.toWorkerView(worker)
    if (!worker.active) throw new ContractorError('validation', 'This worker is deregistered.')
    if (worker.contractorCompany.status === 'suspended') {
      throw new ContractorError('validation', `${worker.contractorCompany.name} is suspended and may not work on site.`)
    }
    if (view.medicalStatus === 'expired' || view.medicalStatus === 'missing') {
      throw new ContractorError('validation', 'Medical is expired or not recorded. This worker cannot be admitted.')
    }
    if (view.inductionStatus === 'expired' || view.inductionStatus === 'missing') {
      throw new ContractorError('validation', 'Site induction is expired or not recorded. This worker cannot be admitted.')
    }
    if (worker.onSite) throw new ContractorError('validation', 'This worker is already checked in.')

    const updated = await this.db.contractorWorker.update({
      where: { id },
      data: { onSite: true, checkedInAt: new Date() },
      include: {
        contractorCompany: { select: { id: true, code: true, name: true, status: true } },
        _count: { select: { certificates: true } },
      },
    })
    await this.log(caller, worker.companyId, 'Checked in contractor worker', `${worker.workerNo} ${worker.name}`, ctx)
    return this.toWorkerView(updated)
  }

  /** Check out. Never refused — someone already inside must always be able to leave. */
  async checkOut(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const worker = await this.db.contractorWorker.findUnique({ where: { id } })
    if (!worker) throw new ContractorError('not_found', 'Worker not found.', 404)
    this.requireRole(caller, worker.companyId, GATE_ROLES, 'checking workers off site')
    if (!worker.onSite) throw new ContractorError('validation', 'This worker is not checked in.')

    const updated = await this.db.contractorWorker.update({
      where: { id },
      data: { onSite: false, checkedInAt: null },
      include: {
        contractorCompany: { select: { id: true, code: true, name: true, status: true } },
        _count: { select: { certificates: true } },
      },
    })
    await this.log(caller, worker.companyId, 'Checked out contractor worker', `${worker.workerNo} ${worker.name}`, ctx)
    return this.toWorkerView(updated)
  }

  // ── Competency evidence ────────────────────────────────────────────────────

  async addCertificate(caller: Caller, workerId: string, input: {
    name: string; issuedBy?: string; issueDate?: string; expiryDate?: string; reference?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const worker = await this.db.contractorWorker.findUnique({ where: { id: workerId } })
    if (!worker) throw new ContractorError('not_found', 'Worker not found.', 404)
    this.requireRole(caller, worker.companyId, WRITE_ROLES, 'recording competencies')

    if (!input.name?.trim()) throw new ContractorError('validation', 'Say which competency this is.')

    const created = await this.db.contractorCertificate.create({
      data: {
        workerId,
        name: input.name.trim(),
        issuedBy: input.issuedBy?.trim() ?? '',
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        reference: input.reference?.trim() || null,
      },
    })
    await this.log(
      caller, worker.companyId, 'Recorded contractor competency',
      `${worker.workerNo} ${worker.name}: ${created.name}`, ctx,
    )
    return { ...created, status: expiryStatus(created.expiryDate), daysToExpiry: daysUntil(created.expiryDate) }
  }

  async removeCertificate(caller: Caller, certificateId: string, ctx: { ip?: string; device?: string } = {}) {
    const cert = await this.db.contractorCertificate.findUnique({
      where: { id: certificateId },
      include: { worker: { select: { companyId: true, workerNo: true, name: true } } },
    })
    if (!cert) throw new ContractorError('not_found', 'Competency record not found.', 404)
    this.requireRole(caller, cert.worker.companyId, WRITE_ROLES, 'removing competencies')

    await this.db.contractorCertificate.delete({ where: { id: certificateId } })
    await this.log(
      caller, cert.worker.companyId, 'Removed contractor competency',
      `${cert.worker.workerNo} ${cert.worker.name}: ${cert.name}`, ctx,
    )
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  /** The register's counters, computed in the database rather than by loading rows. */
  async stats(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const workerScope = { companyId, ...this.siteWhere(caller, companyId) }
    const today = startOfToday()
    const warnAt = new Date(today.getTime() + EXPIRY_WARN_DAYS * 86400_000)

    const [
      contractorCompanies, activeContractors, suspendedContractors,
      activeWorkers, onSite,
      medicalExpired, inductionExpired, insuranceExpired, insuranceExpiring,
    ] = await this.db.$transaction([
      this.db.contractorCompany.count({ where: { companyId } }),
      this.db.contractorCompany.count({ where: { companyId, status: 'active' } }),
      this.db.contractorCompany.count({ where: { companyId, status: 'suspended' } }),
      this.db.contractorWorker.count({ where: { ...workerScope, active: true } }),
      this.db.contractorWorker.count({ where: { ...workerScope, active: true, onSite: true } }),
      this.db.contractorWorker.count({ where: { ...workerScope, active: true, medicalExpiry: { lt: today } } }),
      this.db.contractorWorker.count({ where: { ...workerScope, active: true, inductionExpiry: { lt: today } } }),
      this.db.contractorCompany.count({ where: { companyId, insuranceExpiry: { lt: today } } }),
      this.db.contractorCompany.count({ where: { companyId, insuranceExpiry: { gte: today, lte: warnAt } } }),
    ])

    return {
      contractorCompanies,
      activeContractors,
      suspendedContractors,
      activeWorkers,
      onSite,
      medicalExpired,
      inductionExpired,
      insuranceExpired,
      insuranceExpiring,
    }
  }
}
