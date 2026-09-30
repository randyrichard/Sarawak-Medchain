/**
 * The people named on a permit.
 *
 * This is the join between the permit module and the two workforce registers, and it is
 * the point of the whole thing: before this existed a permit carried a worker *count* and
 * a free-text contractor name, so an unfit person could be written onto a hot work permit
 * and nothing would notice.
 *
 * Four rules are enforced at assignment rather than advised, because assignment is the
 * last moment before someone is standing in a vessel:
 *
 *  1. A worker whose medical has expired (or was never recorded) cannot be named.
 *  2. A worker from a suspended contractor cannot be named.
 *  3. A contractor worker whose site induction has lapsed cannot be named.
 *  4. For permit types that demand a competency, someone without valid evidence of it
 *     cannot be named — a confined space entrant without confined space training is the
 *     textbook fatality.
 *
 * A closed or archived permit accepts no changes at all.
 */
import type { PrismaClient, PermitAttendeeRole, PermitType } from '@prisma/client'
import { PermitError } from './permitService.js'
import type { Caller } from '../domain/caller.js'

/** Roles on a permit that put someone in the work. Standby stays outside by definition. */
const INSIDE_ROLES: PermitAttendeeRole[] = ['worker', 'receiver', 'supervisor', 'gas_tester']

/**
 * Competency each permit type requires of the people doing the work.
 *
 * Matched against the contractor's competency evidence and against the employee's
 * certificates by course name. Types absent from this map require no specific ticket
 * beyond a valid medical and induction.
 */
export const REQUIRED_COMPETENCY: Partial<Record<PermitType, string>> = {
  confined_space: 'Confined Space Entry',
  working_at_height: 'Working at Height',
  hot_work: 'Hot Work',
  electrical_isolation: 'Electrical',
  loto: 'Electrical',
  lifting_operation: 'Rigging',
  radiography: 'Radiography',
}

/** A permit in one of these states is a record, not a plan, and cannot be edited. */
const SETTLED: string[] = ['closed', 'archived', 'rejected']

export interface AttendeeView {
  id: string
  role: PermitAttendeeRole
  name: string
  kind: 'employee' | 'contractor'
  personId: string
  reference: string
  /** Null when they are not inside; set on entry to a confined space. */
  enteredAt: Date | null
  exitedAt: Date | null
  inside: boolean
  /** Signed the toolbox talk. Null until they have. */
  toolboxAckAt: Date | null
}

export class PermitPeopleService {
  constructor(private db: PrismaClient) {}

  private async permitFor(caller: Caller, permitId: string) {
    const permit = await this.db.permit.findUnique({
      where: { id: permitId },
      include: { contractorCompany: { select: { id: true, name: true, status: true } } },
    })
    if (!permit) throw new PermitError('not_found', 'Permit not found.', 404)
    const m = caller.roles.find((r) => r.companyId === permit.companyId)
    if (!m) throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
    return { permit, membership: m }
  }

  private assertEditable(status: string) {
    if (SETTLED.includes(status)) {
      throw new PermitError('validation', 'This permit is closed. Raise a new one for further work.')
    }
  }

  /** Today at UTC midnight — the boundary date-only fitness values are measured against. */
  private today(): Date {
    const n = new Date()
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
  }

  /**
   * The fitness check.
   *
   * Returns the reason this person may not be named, or null when they may. Kept as one
   * function returning a sentence rather than a boolean, because "not permitted" without
   * a reason is useless to the issuer standing at the permit desk.
   */
  async blockReason(
    permitType: PermitType,
    person: { kind: 'employee'; id: string } | { kind: 'contractor'; id: string },
  ): Promise<string | null> {
    const today = this.today()
    const required = REQUIRED_COMPETENCY[permitType]

    if (person.kind === 'employee') {
      const e = await this.db.employee.findUnique({
        where: { id: person.id },
        include: { certificates: { select: { courseName: true, expiryDate: true } } },
      })
      if (!e) return 'That employee is not on the register.'
      if (!e.active) return `${e.name} has left the company.`
      if (!e.medicalExpiry) return `${e.name} has no medical on file.`
      if (e.medicalExpiry < today) return `${e.name}'s medical expired on ${e.medicalExpiry.toISOString().slice(0, 10)}.`

      if (required) {
        const holds = e.certificates.some((c) =>
          c.courseName.toLowerCase().includes(required.toLowerCase())
          && (!c.expiryDate || c.expiryDate >= today))
        if (!holds) return `${e.name} holds no valid ${required} certificate.`
      }
      return null
    }

    const w = await this.db.contractorWorker.findUnique({
      where: { id: person.id },
      include: {
        contractorCompany: { select: { name: true, status: true } },
        certificates: { select: { name: true, expiryDate: true } },
      },
    })
    if (!w) return 'That contractor worker is not registered.'
    if (!w.active) return `${w.name} has been deregistered.`
    if (w.contractorCompany.status === 'suspended') {
      return `${w.contractorCompany.name} is suspended and may not be assigned work.`
    }
    if (!w.medicalExpiry) return `${w.name} has no medical on file.`
    if (w.medicalExpiry < today) return `${w.name}'s medical expired on ${w.medicalExpiry.toISOString().slice(0, 10)}.`
    if (!w.inductionExpiry) return `${w.name} has no site induction on file.`
    if (w.inductionExpiry < today) return `${w.name}'s site induction expired on ${w.inductionExpiry.toISOString().slice(0, 10)}.`

    if (required) {
      const holds = w.certificates.some((c) =>
        c.name.toLowerCase().includes(required.toLowerCase())
        && (!c.expiryDate || c.expiryDate >= today))
      if (!holds) return `${w.name} holds no valid ${required} competency.`
    }
    return null
  }

  /**
   * Everyone who could be named on this permit, each with the reason they cannot be if
   * they cannot.
   *
   * The blocked people are returned rather than filtered out on purpose. An issuer who
   * cannot find someone in the list assumes the system is broken and writes their name on
   * the paper copy; an issuer who sees "medical expired 3 days ago" goes and fixes it.
   */
  async eligible(caller: Caller, permitId: string) {
    const { permit, membership } = await this.permitFor(caller, permitId)
    const siteScope = membership.siteIds.length > 0 ? { siteId: { in: membership.siteIds } } : {}

    const [employees, workers, taken] = await Promise.all([
      this.db.employee.findMany({
        where: { companyId: permit.companyId, active: true, ...siteScope },
        select: { id: true, name: true, employeeNo: true, position: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.db.contractorWorker.findMany({
        where: { companyId: permit.companyId, active: true, ...siteScope },
        select: {
          id: true, name: true, workerNo: true, position: true,
          contractorCompany: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.db.permitAttendee.findMany({
        where: { permitId },
        select: { employeeId: true, contractorWorkerId: true },
      }),
    ])

    const named = new Set([
      ...taken.map((t) => t.employeeId).filter(Boolean),
      ...taken.map((t) => t.contractorWorkerId).filter(Boolean),
    ])

    const rows = await Promise.all([
      ...employees.map(async (e) => ({
        kind: 'employee' as const,
        id: e.id,
        name: e.name,
        reference: e.employeeNo,
        detail: e.position || 'Employee',
        alreadyNamed: named.has(e.id),
        blockedReason: await this.blockReason(permit.type, { kind: 'employee', id: e.id }),
      })),
      ...workers.map(async (w) => ({
        kind: 'contractor' as const,
        id: w.id,
        name: w.name,
        reference: w.workerNo,
        detail: [w.contractorCompany.name, w.position].filter(Boolean).join(' · '),
        alreadyNamed: named.has(w.id),
        blockedReason: await this.blockReason(permit.type, { kind: 'contractor', id: w.id }),
      })),
    ])

    // Assignable first, then blocked, each alphabetical — the issuer is usually looking
    // for someone they expect to be available.
    return rows.sort((a, b) => {
      const rank = (r: typeof a) => (r.alreadyNamed ? 2 : r.blockedReason ? 1 : 0)
      return rank(a) - rank(b) || a.name.localeCompare(b.name)
    })
  }

  async list(caller: Caller, permitId: string): Promise<AttendeeView[]> {
    await this.permitFor(caller, permitId)
    const rows = await this.db.permitAttendee.findMany({
      where: { permitId },
      orderBy: [{ role: 'asc' }, { addedAt: 'asc' }],
      include: {
        employee: { select: { id: true, name: true, employeeNo: true } },
        contractorWorker: { select: { id: true, name: true, workerNo: true } },
      },
    })
    return rows.map((r) => this.toView(r))
  }

  private toView(r: {
    id: string
    role: PermitAttendeeRole
    nameAtAssignment: string
    enteredAt: Date | null
    exitedAt: Date | null
    toolboxAckAt: Date | null
    employee: { id: string; name: string; employeeNo: string } | null
    contractorWorker: { id: string; name: string; workerNo: string } | null
  }): AttendeeView {
    const emp = r.employee
    return {
      id: r.id,
      role: r.role,
      // The live name where the person still exists, the snapshot otherwise, so a closed
      // permit still reads correctly after someone leaves the register.
      name: emp?.name ?? r.contractorWorker?.name ?? r.nameAtAssignment,
      kind: emp ? 'employee' : 'contractor',
      personId: emp?.id ?? r.contractorWorker?.id ?? '',
      reference: emp?.employeeNo ?? r.contractorWorker?.workerNo ?? '',
      enteredAt: r.enteredAt,
      exitedAt: r.exitedAt,
      inside: !!r.enteredAt && !r.exitedAt,
      toolboxAckAt: r.toolboxAckAt,
    }
  }

  async add(caller: Caller, permitId: string, input: {
    employeeId?: string
    contractorWorkerId?: string
    role?: PermitAttendeeRole
  }): Promise<AttendeeView> {
    const { permit } = await this.permitFor(caller, permitId)
    this.assertEditable(permit.status)

    const hasEmployee = !!input.employeeId
    const hasWorker = !!input.contractorWorkerId
    if (hasEmployee === hasWorker) {
      throw new PermitError('validation', 'Name either an employee or a contractor worker, not both.')
    }

    const person = hasEmployee
      ? { kind: 'employee' as const, id: input.employeeId! }
      : { kind: 'contractor' as const, id: input.contractorWorkerId! }

    // The person must belong to this workspace. Without this a permit could name someone
    // from another tenant by guessing an id.
    const scoped = person.kind === 'employee'
      ? await this.db.employee.findFirst({ where: { id: person.id, companyId: permit.companyId }, select: { name: true } })
      : await this.db.contractorWorker.findFirst({ where: { id: person.id, companyId: permit.companyId }, select: { name: true } })
    if (!scoped) throw new PermitError('validation', 'That person is not in this workspace.')

    const blocked = await this.blockReason(permit.type, person)
    if (blocked) throw new PermitError('validation', blocked)

    const already = await this.db.permitAttendee.findFirst({
      where: {
        permitId,
        ...(hasEmployee ? { employeeId: input.employeeId } : { contractorWorkerId: input.contractorWorkerId }),
      },
      select: { id: true },
    })
    if (already) throw new PermitError('validation', `${scoped.name} is already named on this permit.`)

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.permitAttendee.create({
        data: {
          permitId,
          employeeId: input.employeeId ?? null,
          contractorWorkerId: input.contractorWorkerId ?? null,
          role: input.role ?? 'worker',
          nameAtAssignment: scoped.name,
          addedBy: caller.name,
        },
        include: {
          employee: { select: { id: true, name: true, employeeNo: true } },
          contractorWorker: { select: { id: true, name: true, workerNo: true } },
        },
      })
      await tx.permitEvent.create({
        data: {
          permitId,
          action: 'Person added',
          actor: caller.name,
          detail: `${scoped.name} as ${row.role.replace(/_/g, ' ')}`,
        },
      })
      // The worker count is what the old screens render; keep it truthful rather than
      // leaving two numbers that disagree.
      await tx.permit.update({
        where: { id: permitId },
        data: { workerCount: await tx.permitAttendee.count({ where: { permitId } }) },
      })
      return row
    })

    return this.toView(created)
  }

  async remove(caller: Caller, attendeeId: string): Promise<void> {
    const row = await this.db.permitAttendee.findUnique({
      where: { id: attendeeId },
      include: { permit: { select: { id: true, companyId: true, status: true } } },
    })
    if (!row) throw new PermitError('not_found', 'That person is not on this permit.', 404)
    const m = caller.roles.find((r) => r.companyId === row.permit.companyId)
    if (!m) throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)
    this.assertEditable(row.permit.status)

    if (row.enteredAt && !row.exitedAt) {
      throw new PermitError('validation', 'This person is signed in to the work area. Sign them out first.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.permitAttendee.delete({ where: { id: attendeeId } })
      await tx.permitEvent.create({
        data: {
          permitId: row.permit.id,
          action: 'Person removed',
          actor: caller.name,
          detail: row.nameAtAssignment,
        },
      })
      await tx.permit.update({
        where: { id: row.permit.id },
        data: { workerCount: await tx.permitAttendee.count({ where: { permitId: row.permit.id } }) },
      })
    })
  }

  /**
   * Entry and exit for the work area.
   *
   * This is what makes "who is inside the vessel right now" answerable. Only allowed
   * while the permit is genuinely live: signing into a suspended permit is precisely the
   * thing a suspension is meant to stop.
   */
  async setInside(caller: Caller, attendeeId: string, inside: boolean): Promise<AttendeeView> {
    const row = await this.db.permitAttendee.findUnique({
      where: { id: attendeeId },
      include: { permit: { select: { id: true, companyId: true, status: true, validTo: true } } },
    })
    if (!row) throw new PermitError('not_found', 'That person is not on this permit.', 404)
    const m = caller.roles.find((r) => r.companyId === row.permit.companyId)
    if (!m) throw new PermitError('forbidden', 'You do not have access to this workspace.', 403)

    if (inside) {
      if (row.permit.status !== 'active') {
        throw new PermitError('validation', 'Work can only be entered against an active permit.')
      }
      if (row.permit.validTo < new Date()) {
        throw new PermitError('validation', 'This permit has expired. Extend it before anyone enters.')
      }
      if (!INSIDE_ROLES.includes(row.role)) {
        throw new PermitError('validation', 'A standby attendant stays outside the work area.')
      }
      if (row.enteredAt && !row.exitedAt) {
        throw new PermitError('validation', 'That person is already signed in.')
      }
    } else if (!row.enteredAt || row.exitedAt) {
      throw new PermitError('validation', 'That person is not signed in.')
    }

    const updated = await this.db.$transaction(async (tx) => {
      const r = await tx.permitAttendee.update({
        where: { id: attendeeId },
        // Signing back in after an exit starts a fresh entry rather than reopening the
        // old one, so the timestamps always describe the current occupancy.
        data: inside ? { enteredAt: new Date(), exitedAt: null } : { exitedAt: new Date() },
        include: {
          employee: { select: { id: true, name: true, employeeNo: true } },
          contractorWorker: { select: { id: true, name: true, workerNo: true } },
        },
      })
      await tx.permitEvent.create({
        data: {
          permitId: row.permit.id,
          action: inside ? 'Signed in to work area' : 'Signed out of work area',
          actor: caller.name,
          detail: r.nameAtAssignment,
        },
      })
      return r
    })

    return this.toView(updated)
  }
}
