/**
 * The workforce register.
 *
 * Every other module points at a person: an action has an owner, a permit has a holder
 * and a gas tester, a certificate has a holder, a toolbox talk has attendees. Until now
 * those were free-text names, which means a typo silently creates a second Grace Lim and
 * her competencies stop counting. This is the register they resolve against.
 *
 * Three things here are safety-critical rather than administrative:
 *
 *  - Medical fitness expiry. An expired medical is a legal bar on confined space entry,
 *    working at height and most hot work, so it is queried, filtered and reminded on.
 *  - Emergency contacts. The list is only useful on the worst day of the year, which is
 *    exactly when nobody has time to go looking for it.
 *  - PPE issue history. "When was that harness last replaced, and who signed for it" is
 *    an auditor's question and a coroner's question.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import type { Caller } from './incidentService.js'
import type { Role } from '@prisma/client'

export class EmployeeError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

/** Roles that may change the register. Everyone else reads it. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager']
/** Roles that may see medical detail. A medical restriction is health information. */
const MEDICAL_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

/** Bucket for the medical-expiry filter, matching the chips on the register. */
export const MEDICAL_FILTERS = ['all', 'valid', 'expiring', 'expired', 'missing'] as const
export type MedicalFilter = (typeof MEDICAL_FILTERS)[number]

/** A medical inside this window is "expiring" — enough notice to book the appointment. */
export const MEDICAL_WARN_DAYS = 60

export const EMPLOYEE_SORTS = ['name', 'employeeNo', 'position', 'medicalExpiry', 'hireDate'] as const
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number]

const MAX_PAGE_SIZE = 100

export interface ListEmployeeParams {
  companyId: string
  page: number
  pageSize: number
  q?: string
  siteId?: string
  department?: string
  status?: 'active' | 'inactive' | 'all'
  medical?: MedicalFilter
  sort?: EmployeeSort
  dir?: 'asc' | 'desc'
}

/** Today at UTC midnight — the boundary date-only values are measured against. */
function startOfToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - startOfToday().getTime()) / 86400_000)
}

/** Derived on read, never stored: it is a pure function of the date and today. */
export type MedicalStatus = 'valid' | 'expiring' | 'expired' | 'missing'

function medicalStatus(expiry: Date | null): MedicalStatus {
  if (!expiry) return 'missing'
  const days = daysUntil(expiry)!
  if (days < 0) return 'expired'
  if (days <= MEDICAL_WARN_DAYS) return 'expiring'
  return 'valid'
}

export class EmployeeService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new EmployeeError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  private requireRole(caller: Caller, companyId: string, allowed: Role[], doing: string) {
    const m = this.membership(caller, companyId)
    if (!allowed.includes(m.role)) {
      throw new EmployeeError('forbidden', `Your role does not permit ${doing}.`, 403)
    }
    return m
  }

  /**
   * Site restriction. A supervisor scoped to two sites sees the people at those sites and
   * nobody else — the same rule every other register applies, expressed as SQL so the
   * rows never leave the database.
   */
  private siteWhere(caller: Caller, companyId: string): Prisma.EmployeeWhereInput {
    const m = this.membership(caller, companyId)
    return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
  }

  /**
   * Audit trail. Written for every mutation, because the workforce register holds
   * personal and medical data and "who changed this record" is the first question asked
   * when it turns out to be wrong.
   */
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
        module: 'employees',
        target,
        ip: ctx.ip ?? '',
        device: ctx.device ?? '',
        oldValue: values?.oldValue ?? null,
        newValue: values?.newValue ?? null,
      },
    })
  }

  // ── Register ───────────────────────────────────────────────────────────────

  async list(caller: Caller, p: ListEmployeeParams) {
    this.membership(caller, p.companyId)
    const pageSize = Math.min(p.pageSize, MAX_PAGE_SIZE)

    const today = startOfToday()
    const warnAt = new Date(today.getTime() + MEDICAL_WARN_DAYS * 86400_000)

    const medicalWhere: Prisma.EmployeeWhereInput =
      p.medical === 'expired' ? { medicalExpiry: { lt: today } }
        : p.medical === 'expiring' ? { medicalExpiry: { gte: today, lte: warnAt } }
        : p.medical === 'valid' ? { medicalExpiry: { gt: warnAt } }
        : p.medical === 'missing' ? { medicalExpiry: null }
        : {}

    const where: Prisma.EmployeeWhereInput = {
      companyId: p.companyId,
      ...this.siteWhere(caller, p.companyId),
      ...(p.siteId ? { siteId: p.siteId } : {}),
      ...(p.department ? { department: p.department } : {}),
      ...(p.status === 'active' ? { active: true } : {}),
      ...(p.status === 'inactive' ? { active: false } : {}),
      ...medicalWhere,
      ...(p.q
        ? {
            OR: [
              { name: { contains: p.q, mode: 'insensitive' } },
              { employeeNo: { contains: p.q, mode: 'insensitive' } },
              { email: { contains: p.q, mode: 'insensitive' } },
              { position: { contains: p.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const sort = p.sort ?? 'name'
    const dir = p.dir ?? 'asc'

    const [total, rows] = await this.db.$transaction([
      this.db.employee.count({ where }),
      this.db.employee.findMany({
        where,
        orderBy: { [sort]: dir },
        skip: (p.page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { certificates: true, ppeIssues: true } },
        },
      }),
    ])

    const canSeeMedical = MEDICAL_ROLES.includes(this.membership(caller, p.companyId).role)

    return {
      total,
      page: p.page,
      pageSize,
      rows: rows.map((r) => this.toView(r, canSeeMedical)),
    }
  }

  /**
   * The register's counters. Computed in the database rather than by loading every row,
   * so they stay honest at ten thousand employees.
   */
  async stats(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const scope = { companyId, ...this.siteWhere(caller, companyId) }
    const today = startOfToday()
    const warnAt = new Date(today.getTime() + MEDICAL_WARN_DAYS * 86400_000)

    const [headcount, inactive, expired, expiring, noMedical, ppeOverdue] = await this.db.$transaction([
      this.db.employee.count({ where: { ...scope, active: true } }),
      this.db.employee.count({ where: { ...scope, active: false } }),
      this.db.employee.count({ where: { ...scope, active: true, medicalExpiry: { lt: today } } }),
      this.db.employee.count({ where: { ...scope, active: true, medicalExpiry: { gte: today, lte: warnAt } } }),
      this.db.employee.count({ where: { ...scope, active: true, medicalExpiry: null } }),
      this.db.ppeIssue.count({
        where: { companyId, returnedAt: null, replaceDue: { lt: today }, employee: { active: true } },
      }),
    ])

    return { headcount, inactive, medicalExpired: expired, medicalExpiring: expiring, medicalMissing: noMedical, ppeOverdue }
  }

  /** One person, with everything that hangs off them. */
  async get(caller: Caller, id: string) {
    const employee = await this.db.employee.findUnique({
      where: { id },
      include: {
        emergencyContacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
        ppeIssues: { orderBy: { issuedAt: 'desc' } },
        certificates: { orderBy: { issueDate: 'desc' } },
        enrolments: {
          orderBy: { createdAt: 'desc' },
          include: { session: { select: { id: true, code: true, courseName: true, scheduledFor: true, status: true } } },
        },
        _count: { select: { certificates: true, ppeIssues: true } },
      },
    })
    if (!employee) throw new EmployeeError('not_found', 'Employee not found.', 404)

    const m = this.membership(caller, employee.companyId)
    if (m.siteIds.length > 0 && !m.siteIds.includes(employee.siteId)) {
      throw new EmployeeError('forbidden', 'This employee is at a site you cannot see.', 403)
    }
    const canSeeMedical = MEDICAL_ROLES.includes(m.role)

    return {
      ...this.toView(employee, canSeeMedical),
      emergencyContacts: employee.emergencyContacts,
      ppeIssues: employee.ppeIssues.map((p) => ({
        ...p,
        overdue: !p.returnedAt && !!p.replaceDue && p.replaceDue < startOfToday(),
        daysToReplace: daysUntil(p.replaceDue),
      })),
      certificates: employee.certificates.map((c) => ({
        id: c.id, number: c.number, courseName: c.courseName,
        issueDate: c.issueDate, expiryDate: c.expiryDate,
        daysToExpiry: daysUntil(c.expiryDate),
      })),
      trainingHistory: employee.enrolments.map((e) => ({
        id: e.id,
        sessionId: e.sessionId,
        code: e.session.code,
        courseName: e.session.courseName,
        scheduledFor: e.session.scheduledFor,
        present: e.present,
        result: e.result,
        score: e.score,
      })),
    }
  }

  /** Shared row shape. Medical detail is stripped for roles that may not see it. */
  private toView(
    r: Prisma.EmployeeGetPayload<{ include: { _count: { select: { certificates: true; ppeIssues: true } } } }>,
    canSeeMedical: boolean,
  ) {
    return {
      id: r.id,
      employeeNo: r.employeeNo,
      companyId: r.companyId,
      siteId: r.siteId,
      name: r.name,
      position: r.position,
      department: r.department,
      departmentId: r.departmentId,
      teamId: r.teamId,
      email: r.email,
      phone: r.phone,
      active: r.active,
      hireDate: r.hireDate,
      bloodGroup: canSeeMedical ? r.bloodGroup : null,
      medicalExpiry: canSeeMedical ? r.medicalExpiry : null,
      medicalNotes: canSeeMedical ? r.medicalNotes : null,
      // The status itself is not confidential — a supervisor has to know they cannot send
      // someone into a vessel — only the underlying notes are.
      medicalStatus: medicalStatus(r.medicalExpiry),
      /*
       * Gated, because it is the same fact as `medicalExpiry` in another form.
       *
       * `daysUntil` returns an exact day count from today's UTC midnight, so a caller who
       * was refused the date on the line above could reconstruct it precisely as
       * today + N — the redaction visibly succeeding and failing in one response. The
       * coarse `medicalStatus` bucket above is what the operational justification actually
       * requires, and it stays.
       */
      daysToMedicalExpiry: canSeeMedical ? daysUntil(r.medicalExpiry) : null,
      certificateCount: r._count.certificates,
      ppeCount: r._count.ppeIssues,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async create(caller: Caller, companyId: string, input: {
    name: string
    siteId: string
    position?: string
    department?: string
    email?: string
    phone?: string
    hireDate?: string
    bloodGroup?: string
    medicalExpiry?: string
    medicalNotes?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    this.requireRole(caller, companyId, WRITE_ROLES, 'adding people to the register')

    const name = input.name?.trim()
    if (!name) throw new EmployeeError('validation', 'A name is required.')

    const site = await this.db.site.findFirst({ where: { id: input.siteId, companyId } })
    if (!site) throw new EmployeeError('validation', 'That site does not belong to this workspace.')

    if (input.email?.trim()) {
      const clash = await this.db.employee.findFirst({
        where: { companyId, email: input.email.trim(), active: true },
        select: { employeeNo: true },
      })
      if (clash) {
        throw new EmployeeError('validation', `That email already belongs to ${clash.employeeNo}.`)
      }
    }

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId, kind: 'employee' } },
        update: { next: { increment: 1 } },
        create: { companyId, kind: 'employee', next: 1001 },
        select: { next: true },
      })
      return tx.employee.create({
        data: {
          companyId,
          siteId: input.siteId,
          employeeNo: `EMP-${counter.next}`,
          name,
          position: input.position?.trim() ?? '',
          department: input.department?.trim() ?? '',
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          hireDate: input.hireDate ? new Date(input.hireDate) : null,
          bloodGroup: input.bloodGroup?.trim() || null,
          medicalExpiry: input.medicalExpiry ? new Date(input.medicalExpiry) : null,
          medicalNotes: input.medicalNotes?.trim() || null,
        },
        include: { _count: { select: { certificates: true, ppeIssues: true } } },
      })
    })

    await this.log(caller, companyId, 'Added employee', `${created.employeeNo} ${created.name}`, ctx)
    return this.toView(created, true)
  }

  async update(caller: Caller, id: string, patch: {
    name?: string
    siteId?: string
    position?: string
    department?: string
    email?: string | null
    phone?: string | null
    hireDate?: string | null
    bloodGroup?: string | null
    medicalExpiry?: string | null
    medicalNotes?: string | null
  }, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.employee.findUnique({ where: { id } })
    if (!existing) throw new EmployeeError('not_found', 'Employee not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'editing the register')

    if (patch.siteId) {
      const site = await this.db.site.findFirst({ where: { id: patch.siteId, companyId: existing.companyId } })
      if (!site) throw new EmployeeError('validation', 'That site does not belong to this workspace.')
    }
    if (patch.name !== undefined && !patch.name.trim()) {
      throw new EmployeeError('validation', 'A name is required.')
    }

    const updated = await this.db.employee.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.siteId !== undefined ? { siteId: patch.siteId } : {}),
        ...(patch.position !== undefined ? { position: patch.position.trim() } : {}),
        ...(patch.department !== undefined ? { department: patch.department.trim() } : {}),
        ...(patch.email !== undefined ? { email: patch.email?.trim() || null } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone?.trim() || null } : {}),
        ...(patch.hireDate !== undefined ? { hireDate: patch.hireDate ? new Date(patch.hireDate) : null } : {}),
        ...(patch.bloodGroup !== undefined ? { bloodGroup: patch.bloodGroup?.trim() || null } : {}),
        ...(patch.medicalExpiry !== undefined
          ? { medicalExpiry: patch.medicalExpiry ? new Date(patch.medicalExpiry) : null }
          : {}),
        ...(patch.medicalNotes !== undefined ? { medicalNotes: patch.medicalNotes?.trim() || null } : {}),
      },
      include: { _count: { select: { certificates: true, ppeIssues: true } } },
    })

    // The medical date is the one field worth recording a before-and-after for: it is what
    // an auditor asks about, and backdating it is the way to make an expiry problem vanish.
    const medicalChanged = patch.medicalExpiry !== undefined
      && String(existing.medicalExpiry ?? '') !== String(updated.medicalExpiry ?? '')

    await this.log(
      caller, existing.companyId, 'Edited employee', `${existing.employeeNo} ${existing.name}`, ctx,
      medicalChanged
        ? {
            oldValue: existing.medicalExpiry?.toISOString().slice(0, 10) ?? 'none',
            newValue: updated.medicalExpiry?.toISOString().slice(0, 10) ?? 'none',
          }
        : undefined,
    )
    return this.toView(updated, true)
  }

  /**
   * Deactivation, not deletion.
   *
   * A leaver's incidents, certificates and toolbox attendance are part of the site's
   * record and have to survive them leaving. `setActive` is how someone leaves; `remove`
   * exists only for a row created in error.
   */
  async setActive(caller: Caller, id: string, active: boolean, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.employee.findUnique({ where: { id } })
    if (!existing) throw new EmployeeError('not_found', 'Employee not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'changing employment status')

    const updated = await this.db.employee.update({
      where: { id },
      data: { active },
      include: { _count: { select: { certificates: true, ppeIssues: true } } },
    })
    await this.log(
      caller, existing.companyId, active ? 'Reactivated employee' : 'Deactivated employee',
      `${existing.employeeNo} ${existing.name}`, ctx,
    )
    return this.toView(updated, true)
  }

  /**
   * Hard delete, for a record created by mistake.
   *
   * Refused once the person has any history, because deleting them would take the
   * certificate that proves someone was trained with it. Deactivation is the answer for
   * anyone who has actually worked.
   */
  async remove(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const existing = await this.db.employee.findUnique({
      where: { id },
      include: { _count: { select: { certificates: true, enrolments: true, ppeIssues: true } } },
    })
    if (!existing) throw new EmployeeError('not_found', 'Employee not found.', 404)
    this.requireRole(caller, existing.companyId, WRITE_ROLES, 'deleting from the register')

    const { certificates, enrolments, ppeIssues } = existing._count
    if (certificates + enrolments + ppeIssues > 0) {
      throw new EmployeeError(
        'validation',
        'This person has training or PPE history. Deactivate them instead so the record is kept.',
      )
    }

    await this.db.employee.delete({ where: { id } })
    await this.log(caller, existing.companyId, 'Deleted employee', `${existing.employeeNo} ${existing.name}`, ctx)
  }

  // ── Emergency contacts ─────────────────────────────────────────────────────

  async addContact(caller: Caller, employeeId: string, input: {
    name: string; relationship?: string; phone: string; altPhone?: string; isPrimary?: boolean
  }, ctx: { ip?: string; device?: string } = {}) {
    const employee = await this.db.employee.findUnique({ where: { id: employeeId } })
    if (!employee) throw new EmployeeError('not_found', 'Employee not found.', 404)
    this.requireRole(caller, employee.companyId, WRITE_ROLES, 'editing emergency contacts')

    if (!input.name?.trim()) throw new EmployeeError('validation', 'A contact name is required.')
    if (!input.phone?.trim()) throw new EmployeeError('validation', 'A contact phone number is required.')

    const contact = await this.db.$transaction(async (tx) => {
      const existingCount = await tx.emergencyContact.count({ where: { employeeId } })
      // The first contact added is the one to ring, whatever the caller said.
      const primary = input.isPrimary ?? existingCount === 0
      if (primary) {
        await tx.emergencyContact.updateMany({ where: { employeeId }, data: { isPrimary: false } })
      }
      return tx.emergencyContact.create({
        data: {
          employeeId,
          name: input.name.trim(),
          relationship: input.relationship?.trim() ?? '',
          phone: input.phone.trim(),
          altPhone: input.altPhone?.trim() || null,
          isPrimary: primary,
        },
      })
    })

    await this.log(caller, employee.companyId, 'Added emergency contact', `${employee.employeeNo} ${employee.name}`, ctx)
    return contact
  }

  async removeContact(caller: Caller, contactId: string, ctx: { ip?: string; device?: string } = {}) {
    const contact = await this.db.emergencyContact.findUnique({
      where: { id: contactId },
      include: { employee: { select: { id: true, companyId: true, employeeNo: true, name: true } } },
    })
    if (!contact) throw new EmployeeError('not_found', 'Contact not found.', 404)
    this.requireRole(caller, contact.employee.companyId, WRITE_ROLES, 'editing emergency contacts')

    await this.db.$transaction(async (tx) => {
      await tx.emergencyContact.delete({ where: { id: contactId } })
      // Never leave a person with contacts but no primary — promote the next one.
      if (contact.isPrimary) {
        const next = await tx.emergencyContact.findFirst({
          where: { employeeId: contact.employeeId },
          orderBy: { createdAt: 'asc' },
        })
        if (next) await tx.emergencyContact.update({ where: { id: next.id }, data: { isPrimary: true } })
      }
    })

    await this.log(
      caller, contact.employee.companyId, 'Removed emergency contact',
      `${contact.employee.employeeNo} ${contact.employee.name}`, ctx,
    )
  }

  // ── PPE ────────────────────────────────────────────────────────────────────

  async issuePpe(caller: Caller, employeeId: string, input: {
    item: string; size?: string; serialNumber?: string; replaceDue?: string; notes?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const employee = await this.db.employee.findUnique({ where: { id: employeeId } })
    if (!employee) throw new EmployeeError('not_found', 'Employee not found.', 404)
    this.requireRole(caller, employee.companyId, WRITE_ROLES, 'issuing PPE')

    if (!input.item?.trim()) throw new EmployeeError('validation', 'Say which item is being issued.')
    if (!employee.active) throw new EmployeeError('validation', 'This person is not active.')

    const issue = await this.db.ppeIssue.create({
      data: {
        employeeId,
        companyId: employee.companyId,
        item: input.item.trim(),
        size: input.size?.trim() ?? '',
        serialNumber: input.serialNumber?.trim() || null,
        issuedBy: caller.name,
        replaceDue: input.replaceDue ? new Date(input.replaceDue) : null,
        notes: input.notes?.trim() || null,
      },
    })

    await this.log(
      caller, employee.companyId, 'Issued PPE',
      `${employee.employeeNo} ${employee.name}: ${issue.item}`, ctx,
    )
    return issue
  }

  async returnPpe(caller: Caller, issueId: string, ctx: { ip?: string; device?: string } = {}) {
    const issue = await this.db.ppeIssue.findUnique({
      where: { id: issueId },
      include: { employee: { select: { companyId: true, employeeNo: true, name: true } } },
    })
    if (!issue) throw new EmployeeError('not_found', 'PPE issue not found.', 404)
    this.requireRole(caller, issue.employee.companyId, WRITE_ROLES, 'recording a PPE return')
    if (issue.returnedAt) throw new EmployeeError('validation', 'That item is already recorded as returned.')

    const updated = await this.db.ppeIssue.update({
      where: { id: issueId },
      data: { returnedAt: new Date() },
    })
    await this.log(
      caller, issue.employee.companyId, 'Recorded PPE return',
      `${issue.employee.employeeNo} ${issue.employee.name}: ${issue.item}`, ctx,
    )
    return updated
  }

  /** Distinct departments in the workspace, for the register's filter. */
  async departments(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const rows = await this.db.employee.findMany({
      where: { companyId, ...this.siteWhere(caller, companyId), department: { not: '' } },
      select: { department: true },
      distinct: ['department'],
      orderBy: { department: 'asc' },
    })
    return rows.map((r) => r.department)
  }
}
