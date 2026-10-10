import type { Prisma, PrismaClient, PermitStatus, PermitType, Role } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module. It is defined next to
// the first service that needed it; importing the type keeps one definition rather than a
// second that can silently drift.
import { type Caller, membershipOf } from '../domain/caller.js'
import {
  GAS_LIMITS, GAS_TEST_REQUIRED, ISOLATION_REQUIRED, PERMIT_CONTROLS, PERMIT_MAX_HOURS,
  SEPARATE_APPROVER_REQUIRED,
  PERMIT_STATUS_LABEL, PERMIT_TYPES, PERMIT_TYPE_LABEL, gasTestPasses, activationBlockers,
} from './permitCatalog.js'
import { equipmentBlockers } from './equipmentService.js'
import { DomainError } from '../domain/errors.js'
import { localMidnight, startOfLocalDay, startOfLocalMonth, todayDate } from '../domain/businessDay.js'

/**
 * Issuing authority: who may approve, reject, suspend, resume and close a permit.
 *
 * Note that `ceo` is absent, and that is deliberate rather than an oversight. Issuing a
 * permit is a competence-based act performed on site — the issuer walks the job and
 * verifies the precautions — so it belongs to the safety line, not to seniority.
 */
const ISSUER_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

/**
 * Who may perform the safety steps on a live permit: naming or removing the people on it,
 * recording a gas test, and placing or releasing a lock-out/tag-out isolation.
 *
 * The issuing authority plus the supervisor who runs the job on the floor. These steps had
 * no role check at all, only membership - so any employee, and the read-only executive,
 * could release an isolation on a live job or take a named entrant off a confined space
 * permit. Each of those is a decision about whether it is safe for someone to be in the
 * work, and it belongs to the people accountable for that.
 */
export const FIELD_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

/** Refuses a member whose role is not one of FIELD_ROLES. */
export function requireFieldRole(role: Role, doing: string) {
  if (!FIELD_ROLES.includes(role)) {
    throw new PermitError(
      'forbidden',
      `Only a Supervisor, Safety Officer, HSE Manager or Admin can ${doing}.`,
      403,
    )
  }
}

export class PermitError extends DomainError {}

/** Status as the board reports it — the stored states plus derived `expired`. */
export type EffectivePermitStatus = PermitStatus | 'expired'

/**
 * Waiting for a signature: submitted, or anywhere in the approval chain.
 *
 * The chain stages were missing from the live board, so a permit dropped off it the moment
 * its first reviewer signed - and off "Awaiting approval" too, which matched `submitted`
 * alone. The HSE reviewer and the area authority who had to sign it next could only find
 * it under All.
 */
export const AWAITING_APPROVAL: PermitStatus[] = ['submitted', 'supervisor_review', 'hse_review', 'area_authority']

/** The live states. `draft` is not one: an unsubmitted request authorises nothing. */
const LIVE_STORED: PermitStatus[] = [...AWAITING_APPROVAL, 'approved', 'active', 'suspended']

/** Refusal for approving or reviewing a permit whose working window has already ended. */
export const WINDOW_PASSED =
  'This permit\'s working window has already ended, so it can no longer be approved. Send it back to the applicant for new dates.'

const permitInclude = {
  controls: { orderBy: { position: 'asc' } },
  isolations: { orderBy: { id: 'asc' } },
  gasTests: { orderBy: { testedAt: 'asc' } },
  signatures: { orderBy: { signedAt: 'asc' } },
  timeline: { orderBy: { at: 'desc' } },
} satisfies Prisma.PermitInclude

type PermitRow = Prisma.PermitGetPayload<{ include: typeof permitInclude }>

// `status` is replaced rather than intersected: an intersection would keep the stored
// enum from PermitRow and narrow `expired` straight back out again.
export type PermitView = Omit<PermitRow, 'status'> & {
  status: EffectivePermitStatus
  /** Hours until validTo. Negative once overdue. */
  hoursRemaining: number
  /** Active and inside the final hour — the operational alarm state. */
  expiringSoon: boolean
  /** Required controls still unconfirmed. */
  outstandingControls: number
  typeLabel: string
  statusLabel: string
}

export interface PermitFilters {
  companyId: string
  page: number
  pageSize: number
  q?: string
  siteId?: string
  type?: PermitType
  status?: EffectivePermitStatus | 'all' | 'live' | 'awaiting' | 'expiring'
}

export interface NewPermitInput {
  companyId: string
  siteId: string
  type: PermitType
  title: string
  description?: string
  department?: string
  location: string
  applicant: string
  contractor?: string
  workerCount: number
  validFrom: string
  validTo: string
}

export class PermitService {
  constructor(private db: PrismaClient) {}

  // ── Authorisation ──────────────────────────────────────────────────────────

  /**
   * The caller's membership in a company, looked up rather than trusted. Passing a
   * different companyId cannot widen access because the answer comes from the verified
   * session, not from the request.
   */
  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, PermitError)
  }


  private requireIssuer(caller: Caller, companyId: string) {
    const m = this.membership(caller, companyId)
    if (!ISSUER_ROLES.includes(m.role)) {
      throw new PermitError(
        'forbidden',
        'Only a Safety Officer, HSE Manager or Admin can issue or close permits.',
        403,
      )
    }
    return m
  }

  /**
   * Loads a permit and proves the caller belongs to its tenant.
   *
   * Every mutation routes through here. A permit id is the only thing an attacker needs
   * to guess, so the tenant check has to hang off the row that was actually loaded — not
   * off a companyId supplied alongside it.
   */
  private async load(caller: Caller, id: string) {
    const permit = await this.db.permit.findUnique({ where: { id }, include: permitInclude })
    if (!permit) throw new PermitError('not_found', 'Permit not found.', 404)
    const m = this.membership(caller, permit.companyId)
    return { permit, membership: m }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  /**
   * An approved or active permit past its window is expired, not live. Derived on every
   * read so the board is correct the instant the clock passes `validTo`, with no job to
   * fall behind. See the note on the PermitStatus enum.
   */
  private effectiveStatus(p: { status: PermitStatus; validTo: Date }, now = Date.now()): EffectivePermitStatus {
    if ((p.status === 'active' || p.status === 'approved') && p.validTo.getTime() < now) {
      return 'expired'
    }
    return p.status
  }

  private toView(p: PermitRow, now = Date.now()): PermitView {
    const status = this.effectiveStatus(p, now)
    const hoursRemaining = (p.validTo.getTime() - now) / 3600_000
    return {
      ...p,
      status,
      hoursRemaining,
      expiringSoon: status === 'active' && hoursRemaining > 0 && hoursRemaining <= 1,
      outstandingControls: p.controls.filter((c) => c.required && !c.confirmed).length,
      typeLabel: PERMIT_TYPE_LABEL[p.type],
      statusLabel: PERMIT_STATUS_LABEL[status] ?? status,
    }
  }

  /** Board order: whatever demands attention soonest comes first. */
  private rank(v: PermitView): number {
    if (v.expiringSoon) return 0
    if (v.status === 'expired') return 1
    if (v.status === 'active') return 2
    if ((AWAITING_APPROVAL as string[]).includes(v.status)) return 3
    if (v.status === 'approved') return 4
    return 5
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * Translates a status filter into SQL.
   *
   * `expired` and the effective forms of `active`/`approved` are time predicates, not
   * column matches — filtering on the stored column alone would list work whose permit
   * lapsed an hour ago as still in progress.
   */
  private statusWhere(status: PermitFilters['status'], now: Date): Prisma.PermitWhereInput {
    switch (status) {
      case undefined:
      case 'all':
        return {}
      case 'live':
        // Every expired permit is a stored active/approved row, so this covers it too.
        return { status: { in: LIVE_STORED } }
      case 'awaiting':
        return { status: { in: AWAITING_APPROVAL } }
      case 'expiring':
        // Home's "Expiring in 7 days": work in progress whose window closes within the week.
        return { status: 'active', validTo: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } }
      case 'expired':
        return { status: { in: ['active', 'approved'] }, validTo: { lt: now } }
      case 'active':
      case 'approved':
        return { status, validTo: { gte: now } }
      default:
        return { status }
    }
  }

  async list(caller: Caller, f: PermitFilters) {
    this.membership(caller, f.companyId)
    const now = new Date()

    // The board's free-text search covers the permit type as the user reads it, so a
    // search for "confined space" has to reach the enum behind that label.
    const q = f.q?.trim()
    const matchedTypes = q
      ? PERMIT_TYPES.filter((t) => PERMIT_TYPE_LABEL[t].toLowerCase().includes(q.toLowerCase()))
      : []

    const where: Prisma.PermitWhereInput = {
      companyId: f.companyId,
      ...(f.siteId ? { siteId: f.siteId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...this.statusWhere(f.status, now),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { location: { contains: q, mode: 'insensitive' } },
              { applicant: { contains: q, mode: 'insensitive' } },
              { contractor: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
              ...(matchedTypes.length > 0 ? [{ type: { in: matchedTypes } }] : []),
            ],
          }
        : {}),
    }

    const [total, rows] = await this.db.$transaction([
      this.db.permit.count({ where }),
      this.db.permit.findMany({
        where,
        include: permitInclude,
        // Soonest to lapse first, so a page boundary keeps the urgent end of the board.
        // `code` breaks ties, without which two permits sharing a validTo can swap places
        // between reads and the list flickers on the 30-second refresh.
        orderBy: [{ validTo: 'asc' }, { code: 'asc' }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ])

    // Urgency ranking depends on derived status, which SQL cannot order by. Applied to
    // the page after mapping; the query order above already puts the urgent end in it.
    const views = rows
      .map((r) => this.toView(r, now.getTime()))
      .sort((a, b) => this.rank(a) - this.rank(b) || a.hoursRemaining - b.hoursRemaining)

    return {
      rows: views,
      page: f.page,
      pageSize: f.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    }
  }

  async get(caller: Caller, id: string): Promise<PermitView> {
    const { permit } = await this.load(caller, id)
    return this.toView(permit)
  }

  /** Board counters, computed in the database rather than by loading every row. */
  async stats(caller: Caller, companyId: string, siteId?: string | null) {
    this.membership(caller, companyId)
    const now = new Date()
    const in2h = new Date(now.getTime() + 2 * 3600_000)
    // "Closed this month" is the local calendar month; it was the last 30 days, so on the
    // 3rd it was mostly last month's closures under this month's name.
    const local = todayDate(now)
    const monthStart = startOfLocalMonth(local.getUTCFullYear(), local.getUTCMonth())

    const base: Prisma.PermitWhereInput = { companyId, ...(siteId ? { siteId } : {}) }

    // The permit office's day, locally (APP_TIMEZONE): validFrom/validTo are moments, so
    // "starting today" runs local midnight to local midnight. At UTC midnight a permit
    // starting at 07:00 was counted as yesterday's.
    const startOfDay = startOfLocalDay(now)
    const endOfDay = new Date(localMidnight(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1).getTime() - 1)

    const [
      activeNow, awaitingApproval, expiringWithin2h, expiredOpen, closedThisMonth, byType,
      awaitingReview, suspended, startingToday, expiringToday, insideConfinedSpace,
    ] =
      await this.db.$transaction([
        this.db.permit.count({ where: { ...base, status: 'active', validTo: { gte: now } } }),
        this.db.permit.count({ where: { ...base, status: 'submitted' } }),
        this.db.permit.count({
          where: { ...base, status: 'active', validTo: { gt: now, lte: in2h } },
        }),
        this.db.permit.count({
          where: { ...base, status: { in: ['active', 'approved'] }, validTo: { lt: now } },
        }),
        this.db.permit.count({ where: { ...base, status: 'closed', closedAt: { gte: monthStart } } }),
        this.db.permit.groupBy({
          by: ['type'],
          where: { ...base, status: 'active', validTo: { gte: now } },
          _count: { _all: true },
          orderBy: undefined,
        }),
        // Anywhere in the approval chain, not just at submission: a permit parked with
        // HSE is as stalled as one nobody has looked at.
        this.db.permit.count({
          where: { ...base, status: { in: AWAITING_APPROVAL } },
        }),
        this.db.permit.count({ where: { ...base, status: 'suspended' } }),
        this.db.permit.count({
          where: { ...base, validFrom: { gte: startOfDay, lte: endOfDay } },
        }),
        this.db.permit.count({
          where: { ...base, status: 'active', validTo: { gte: startOfDay, lte: endOfDay } },
        }),
        // People signed in to a confined space right now. The question asked first in an
        // evacuation, and the reason entry and exit are timestamped rather than counted.
        this.db.permitAttendee.count({
          where: {
            enteredAt: { not: null }, exitedAt: null,
            permit: { ...base, type: 'confined_space', status: 'active' },
          },
        }),
      ])

    // Prisma's groupBy result type is conditional on the _count shape; narrow locally.
    const counts = new Map(
      (byType as unknown as { type: PermitType; _count?: { _all: number } }[])
        .map((r) => [r.type, r._count?._all ?? 0] as const),
    )

    return {
      activeNow,
      awaitingApproval,
      awaitingReview,
      suspended,
      startingToday,
      expiringToday,
      insideConfinedSpace,
      expiringWithin2h,
      expiredOpen,
      closedThisMonth,
      // Catalogue order, not whatever the group-by returned, so the strip is stable.
      byType: PERMIT_TYPES
        .map((type) => ({ type, label: PERMIT_TYPE_LABEL[type], active: counts.get(type) ?? 0 }))
        .filter((t) => t.active > 0),
    }
  }

  /**
   * Permits about to lapse or already lapsed with work open.
   *
   * A permit's whole value is the time bound, so the crew has to hear about it before it
   * runs out, not after. Callers use this to raise the warning; it is a pure read, and
   * safe to poll.
   */
  async expiring(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const now = new Date()
    const in1h = new Date(now.getTime() + 3600_000)

    const rows = await this.db.permit.findMany({
      where: {
        companyId,
        status: { in: ['active', 'approved'] },
        validTo: { lt: in1h },
      },
      orderBy: [{ validTo: 'asc' }],
      take: 200,
      select: {
        id: true, code: true, type: true, location: true, applicant: true, validTo: true,
      },
    })

    const shape = (r: (typeof rows)[number]) => ({
      ...r,
      validTo: r.validTo.toISOString(),
      typeLabel: PERMIT_TYPE_LABEL[r.type],
    })

    return {
      warning: rows.filter((r) => r.validTo.getTime() > now.getTime()).map(shape),
      expired: rows.filter((r) => r.validTo.getTime() <= now.getTime()).map(shape),
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Creates a draft. Any member may request a permit — requesting is not authorising,
   * and a crew that cannot raise the request works without one instead.
   */
  async create(caller: Caller, input: NewPermitInput): Promise<PermitView> {
    const m = this.membership(caller, input.companyId)

    if (!input.title?.trim()) throw new PermitError('validation', 'A work description is required.')
    if (!input.location?.trim()) throw new PermitError('validation', 'A location is required.')

    const from = new Date(input.validFrom)
    const to = new Date(input.validTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new PermitError('validation', 'A valid permit window is required.')
    }
    const hours = (to.getTime() - from.getTime()) / 3600_000
    if (hours <= 0) throw new PermitError('validation', 'The permit must end after it starts.')
    const max = PERMIT_MAX_HOURS[input.type]
    if (hours > max) {
      throw new PermitError(
        'validation',
        `A ${PERMIT_TYPE_LABEL[input.type]} permit cannot exceed ${max} hours.`,
      )
    }

    // The site must belong to the caller's company. Without this a permit can be written
    // against another tenant's site and shows up on their board.
    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new PermitError('validation', 'Unknown site for this workspace.')

    const id = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'permit' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'permit', next: 4401 },
        select: { next: true },
      })

      const permit = await tx.permit.create({
        data: {
          code: `PTW-${counter.next}`,
          companyId: input.companyId,
          siteId: input.siteId,
          type: input.type,
          title: input.title.trim(),
          description: input.description?.trim() ?? '',
          department: input.department?.trim() ?? '',
          location: input.location.trim(),
          applicant: input.applicant?.trim() || caller.name,
          contractor: input.contractor?.trim() || null,
          workerCount: input.workerCount,
          validFrom: from,
          validTo: to,
          createdBy: caller.name,
          // The checklist is stamped from the catalogue at creation. Copying it rather
          // than pointing at it means a permit issued today still reads back with the
          // precautions that were actually confirmed, even after the catalogue changes.
          controls: {
            create: PERMIT_CONTROLS[input.type].map((c, i) => ({
              position: i,
              label: c.label,
              required: c.required,
            })),
          },
          timeline: {
            create: { action: 'Permit created', actor: caller.name, actorRole: m.role },
          },
        },
        select: { id: true },
      })
      return permit.id
    })

    return this.get(caller, id)
  }

  /** The applicant signs the precautions and hands the permit to an issuing authority. */
  async submit(caller: Caller, id: string): Promise<PermitView> {
    const { permit, membership } = await this.load(caller, id)
    if (permit.status !== 'draft') {
      throw new PermitError('validation', 'Only a draft permit can be submitted.')
    }

    await this.db.$transaction([
      this.db.permit.update({
        where: { id },
        data: {
          status: 'submitted',
          version: { increment: 1 },
          signatures: {
            create: {
              role: 'applicant',
              name: caller.name,
              statement: 'I have read and understood the precautions and will comply with them.',
            },
          },
        },
      }),
      this.db.permitEvent.create({
        data: { permitId: id, action: 'Submitted for approval', actor: caller.name, actorRole: membership.role },
      }),
    ])

    return this.get(caller, id)
  }

  /**
   * Issue.
   *
   * Refused until every required control is confirmed, plus a passing gas test and
   * recorded isolations where the type demands them. These checks are the permit: an
   * approval that can skip them authorises exactly the work nobody verified.
   */
  async approve(caller: Caller, id: string, statement: string): Promise<PermitView> {
    const { permit } = await this.load(caller, id)
    const m = this.requireIssuer(caller, permit.companyId)

    if (permit.status !== 'submitted') {
      throw new PermitError('validation', 'Only a submitted permit can be approved.')
    }
    // An approval is a signed statement that the work may go ahead in this window. Once
    // the window has passed it authorises nothing, and the permit would show as expired
    // the moment it was signed.
    if (permit.validTo.getTime() < Date.now()) {
      throw new PermitError('validation', WINDOW_PASSED)
    }

    const outstanding = permit.controls.filter((c) => c.required && !c.confirmed)
    if (outstanding.length > 0) {
      throw new PermitError('validation', `${outstanding.length} required control(s) are not yet confirmed.`)
    }
    if (GAS_TEST_REQUIRED.includes(permit.type)) {
      const latest = permit.gasTests[permit.gasTests.length - 1]
      if (!latest) {
        throw new PermitError('validation', 'A gas test is required before this permit can be issued.')
      }
      if (!latest.pass) {
        throw new PermitError('validation', 'The most recent gas test failed. Re-test before issuing.')
      }
    }
    if (ISOLATION_REQUIRED.includes(permit.type) && permit.isolations.length === 0) {
      throw new PermitError('validation', 'At least one isolation point must be recorded for this permit type.')
    }

    /*
     * Separation of duties, on the types where self-approval is indefensible.
     *
     * Compared by name, because that is the only identity this module has: the applicant
     * field, the signatures and the event log all record `caller.name`, and there is no
     * user id on any of them. Matching the existing model rather than adding a second,
     * half-populated notion of identity - and a rename would break it, which is why the
     * comparison is against both the applicant field and the signature that was actually
     * captured at submission.
     *
     * Two people sharing a name would be blocked from issuing each other's permits. That
     * is the wrong answer, but it is the safe wrong answer: a false refusal costs somebody
     * a phone call, a false approval authorises unverified hot work.
     */
    if (SEPARATE_APPROVER_REQUIRED.includes(permit.type)) {
      const applicantSignature = permit.signatures.find((s) => s.role === 'applicant')
      const sameName = (a?: string | null, b?: string | null) =>
        !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

      if (sameName(caller.name, permit.applicant) || sameName(caller.name, applicantSignature?.name)) {
        throw new PermitError(
          'validation',
          `A ${PERMIT_TYPE_LABEL[permit.type] ?? permit.type} permit must be issued by somebody `
          + 'other than the person who applied for it. Ask another authorised issuer to review '
          + 'the controls and approve it.',
        )
      }
    }

    const text = statement?.trim() || 'Controls verified on site. Permit issued.'

    await this.db.$transaction([
      this.db.permit.update({
        where: { id },
        data: {
          status: 'approved',
          approver: caller.name,
          approvedAt: new Date(),
          version: { increment: 1 },
          signatures: { create: { role: 'approver', name: caller.name, statement: text } },
        },
      }),
      this.db.permitEvent.create({
        data: {
          permitId: id,
          action: 'Approved',
          detail: statement?.trim() || null,
          actor: caller.name,
          actorRole: m.role,
        },
      }),
    ])

    return this.get(caller, id)
  }

  async reject(caller: Caller, id: string, reason: string): Promise<PermitView> {
    const { permit } = await this.load(caller, id)
    const m = this.requireIssuer(caller, permit.companyId)

    if (!reason?.trim()) {
      throw new PermitError('validation', 'A reason is required so the applicant can correct it.')
    }
    if (permit.status !== 'submitted') {
      throw new PermitError('validation', 'Only a submitted permit can be rejected.')
    }

    await this.db.$transaction([
      this.db.permit.update({
        where: { id },
        data: { status: 'rejected', rejectionReason: reason.trim(), version: { increment: 1 } },
      }),
      this.db.permitEvent.create({
        data: { permitId: id, action: 'Rejected', detail: reason.trim(), actor: caller.name, actorRole: m.role },
      }),
    ])

    return this.get(caller, id)
  }

  /** Work start. Separate from approval because issue and start are distinct events. */
  async activate(caller: Caller, id: string): Promise<PermitView> {
    const { permit, membership } = await this.load(caller, id)

    if (this.effectiveStatus(permit) === 'expired') {
      throw new PermitError('validation', 'This permit has expired. Request a new one.')
    }
    if (permit.status !== 'approved') {
      throw new PermitError('validation', 'The permit must be approved before work starts.')
    }

    /*
     * The activation gate.
     *
     * Re-checked here rather than trusted from the screen, because this is the moment the
     * work actually begins. A toolbox talk nobody attended and PPE nobody confirmed are
     * the two findings that turn up after the event, so both are refusals.
     *
     * Equipment is re-checked here too, and it is the one that can change on its own: a
     * gas detector whose certificate lapses between approval and start-of-work was fit
     * when the permit was signed and is not fit now.
     */
    const [attendees, unacknowledged, equipment] = await Promise.all([
      this.db.permitAttendee.count({ where: { permitId: id } }),
      this.db.permitAttendee.count({ where: { permitId: id, toolboxAckAt: null } }),
      equipmentBlockers(this.db, id),
    ])
    const blockers = activationBlockers({
      status: permit.status,
      toolboxAt: permit.toolboxAt,
      requiredPpe: permit.requiredPpe,
      ppeAcknowledgedAt: permit.ppeAcknowledgedAt,
      attendees,
      unacknowledged,
      equipment,
    })
    if (blockers.length > 0) {
      throw new PermitError('validation', blockers[0])
    }

    await this.db.$transaction([
      this.db.permit.update({ where: { id }, data: { status: 'active', version: { increment: 1 } } }),
      this.db.permitEvent.create({
        data: { permitId: id, action: 'Work started', actor: caller.name, actorRole: membership.role },
      }),
    ])

    return this.get(caller, id)
  }

  async suspend(caller: Caller, id: string, reason: string): Promise<PermitView> {
    const { permit } = await this.load(caller, id)
    const m = this.requireIssuer(caller, permit.companyId)

    if (!reason?.trim()) {
      throw new PermitError('validation', 'State why the permit is being suspended.')
    }
    if (permit.status !== 'active') {
      throw new PermitError('validation', 'Only an active permit can be suspended.')
    }

    await this.db.$transaction([
      this.db.permit.update({
        where: { id },
        data: { status: 'suspended', suspendedReason: reason.trim(), version: { increment: 1 } },
      }),
      this.db.permitEvent.create({
        data: { permitId: id, action: 'Suspended', detail: reason.trim(), actor: caller.name, actorRole: m.role },
      }),
    ])

    return this.get(caller, id)
  }

  async resume(caller: Caller, id: string): Promise<PermitView> {
    const { permit } = await this.load(caller, id)
    const m = this.requireIssuer(caller, permit.companyId)

    if (permit.status !== 'suspended') {
      throw new PermitError('validation', 'Only a suspended permit can be resumed.')
    }
    if (this.effectiveStatus(permit) === 'expired') {
      throw new PermitError('validation', 'This permit has expired. Request a new one.')
    }

    await this.db.$transaction([
      this.db.permit.update({
        where: { id },
        data: { status: 'active', suspendedReason: null, version: { increment: 1 } },
      }),
      this.db.permitEvent.create({
        data: { permitId: id, action: 'Resumed', actor: caller.name, actorRole: m.role },
      }),
    ])

    return this.get(caller, id)
  }

  /**
   * Close. Handback is mandatory and every isolation must be released first.
   *
   * Closing with a lock still hanging is how equipment gets re-energised on someone, so
   * the check is a refusal rather than a warning.
   */
  async close(
    caller: Caller,
    id: string,
    input: { handbackConfirmed: boolean; statement?: string },
  ): Promise<PermitView> {
    const { permit } = await this.load(caller, id)
    const m = this.requireIssuer(caller, permit.companyId)

    const effective = this.effectiveStatus(permit)
    if (!['active', 'suspended', 'approved', 'expired'].includes(effective)) {
      throw new PermitError('validation', 'This permit is not open.')
    }
    if (!input.handbackConfirmed) {
      throw new PermitError('validation', 'Confirm the site has been handed back before closing.')
    }
    const live = permit.isolations.filter((i) => !i.removedAt)
    if (live.length > 0) {
      throw new PermitError(
        'validation',
        `${live.length} isolation(s) are still applied. Release them before closing.`,
      )
    }

    const text = input.statement?.trim() || 'Site handed back, area clear.'

    await this.db.$transaction([
      this.db.permit.update({
        where: { id },
        data: {
          status: 'closed',
          closedBy: caller.name,
          closedAt: new Date(),
          handbackConfirmed: true,
          version: { increment: 1 },
          signatures: { create: { role: 'closer', name: caller.name, statement: text } },
        },
      }),
      this.db.permitEvent.create({
        data: {
          permitId: id,
          action: 'Closed',
          detail: input.statement?.trim() || null,
          actor: caller.name,
          actorRole: m.role,
        },
      }),
    ])

    return this.get(caller, id)
  }

  // ── Precautions, atmosphere and isolations ─────────────────────────────────

  async confirmControl(
    caller: Caller,
    permitId: string,
    controlId: string,
    confirmed: boolean,
  ): Promise<PermitView> {
    const { permit } = await this.load(caller, permitId)
    if (['closed', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is no longer open.')
    }

    // Matched within the permit, not by id alone: a control id from another tenant's
    // permit must not be confirmable just because the caller can reach this one.
    const control = permit.controls.find((c) => c.id === controlId)
    if (!control) throw new PermitError('not_found', 'Control not found.', 404)

    await this.db.permitControl.update({
      where: { id: control.id },
      data: {
        confirmed,
        confirmedBy: confirmed ? caller.name : null,
        confirmedAt: confirmed ? new Date() : null,
      },
    })

    return this.get(caller, permitId)
  }

  /**
   * Records an atmospheric test.
   *
   * A failure on live work is an immediate stop condition, so the permit suspends itself
   * rather than waiting for someone to notice the reading and act on it.
   */
  async addGasTest(
    caller: Caller,
    permitId: string,
    reading: { oxygenPct: number; lelPct: number; h2sPpm: number; coPpm: number; note?: string },
  ): Promise<PermitView> {
    const { permit, membership } = await this.load(caller, permitId)
    /*
     * Or the person this permit names as its gas tester. Testing the atmosphere is a
     * competence, not a rank: the authorised tester is often a technician on the employee
     * role, and they are exactly who should be writing the reading down.
     */
    if (!FIELD_ROLES.includes(membership.role)) {
      const namedTester = await this.db.permitAttendee.findFirst({
        where: { permitId, role: 'gas_tester', employee: { userId: caller.userId } },
        select: { id: true },
      })
      if (!namedTester) requireFieldRole(membership.role, 'record a gas test unless named on the permit as its gas tester')
    }
    const pass = gasTestPasses(reading)
    // Plain "O2"/"H2S" rather than subscripts — this line is persisted on the audit
    // trail, and see the note in permitCatalog.ts about cluster encoding.
    const detail =
      `O2 ${reading.oxygenPct}% · LEL ${reading.lelPct}% · ` +
      `H2S ${reading.h2sPpm}ppm · CO ${reading.coPpm}ppm`

    await this.db.$transaction(async (tx) => {
      await tx.gasTest.create({
        data: { permitId, ...reading, note: reading.note ?? null, testedBy: caller.name, pass },
      })
      await tx.permitEvent.create({
        data: {
          permitId,
          action: pass ? 'Gas test passed' : 'Gas test FAILED',
          detail,
          actor: caller.name,
          actorRole: membership.role,
        },
      })

      if (!pass && permit.status === 'active') {
        await tx.permit.update({
          where: { id: permitId },
          data: {
            status: 'suspended',
            suspendedReason: 'Gas test failed — atmosphere outside safe limits.',
            version: { increment: 1 },
          },
        })
        await tx.permitEvent.create({
          data: {
            permitId,
            action: 'Suspended',
            detail: 'Gas test failed — atmosphere outside safe limits.',
            actor: caller.name,
            actorRole: membership.role,
          },
        })
      }
    })

    return this.get(caller, permitId)
  }

  async addIsolation(
    caller: Caller,
    permitId: string,
    input: { description: string; tagId: string },
  ): Promise<PermitView> {
    const { permit, membership } = await this.load(caller, permitId)
    requireFieldRole(membership.role, 'place an isolation')
    if (['closed', 'rejected'].includes(permit.status)) {
      throw new PermitError('validation', 'This permit is no longer open.')
    }
    if (!input.description?.trim()) {
      throw new PermitError('validation', 'Describe what is isolated.')
    }
    if (!input.tagId?.trim()) {
      throw new PermitError('validation', 'A lock/tag identifier is required.')
    }

    const description = input.description.trim()
    const tagId = input.tagId.trim()

    await this.db.$transaction([
      this.db.isolationPoint.create({
        data: { permitId, description, tagId, isolatedBy: caller.name, isolatedAt: new Date() },
      }),
      this.db.permitEvent.create({
        data: {
          permitId,
          action: 'Isolation applied',
          detail: `${tagId} — ${description}`,
          actor: caller.name,
          actorRole: membership.role,
        },
      }),
    ])

    return this.get(caller, permitId)
  }

  async releaseIsolation(caller: Caller, permitId: string, isolationId: string): Promise<PermitView> {
    const { permit, membership } = await this.load(caller, permitId)
    requireFieldRole(membership.role, 'release an isolation')

    // Scoped to the permit for the same reason as confirmControl.
    const iso = permit.isolations.find((i) => i.id === isolationId)
    if (!iso) throw new PermitError('not_found', 'Isolation point not found.', 404)
    if (iso.removedAt) throw new PermitError('validation', 'This isolation has already been released.')

    await this.db.$transaction([
      this.db.isolationPoint.update({
        where: { id: iso.id },
        data: { removedBy: caller.name, removedAt: new Date() },
      }),
      this.db.permitEvent.create({
        data: {
          permitId,
          action: 'Isolation released',
          detail: iso.tagId,
          actor: caller.name,
          actorRole: membership.role,
        },
      }),
    ])

    return this.get(caller, permitId)
  }

  // ── Extensions ─────────────────────────────────────────────────────────────

  async listExtensions(caller: Caller, permitId: string) {
    await this.load(caller, permitId)
    return this.db.permitExtension.findMany({
      where: { permitId },
      orderBy: { requestedAt: 'desc' },
    })
  }

  /**
   * Ask for more time.
   *
   * Recorded as a request rather than applied directly, because "the job overran and
   * somebody quietly moved the end time" is exactly the pattern a permit exists to stop.
   * The window is still bounded by the type's maximum measured from the original start:
   * an eight-hour confined space entry cannot become a thirty-hour one by extending it
   * four times.
   */
  async requestExtension(caller: Caller, permitId: string, newValidTo: string, reason: string) {
    const { permit, membership } = await this.load(caller, permitId)

    const effective = this.effectiveStatus(permit)
    if (!['active', 'approved', 'expired'].includes(effective)) {
      throw new PermitError('validation', `A ${effective} permit cannot be extended.`)
    }

    const next = new Date(newValidTo)
    if (Number.isNaN(next.getTime())) throw new PermitError('validation', 'That is not a valid date and time.')
    if (next <= permit.validTo) {
      throw new PermitError('validation', 'An extension has to move the end time later than it is now.')
    }

    const maxHours = PERMIT_MAX_HOURS[permit.type]
    const totalHours = (next.getTime() - permit.validFrom.getTime()) / 3600_000
    if (totalHours > maxHours) {
      throw new PermitError(
        'validation',
        `A ${PERMIT_TYPE_LABEL[permit.type]} permit cannot run more than ${maxHours} hours in total. Raise a new permit.`,
      )
    }

    const pending = await this.db.permitExtension.findFirst({
      where: { permitId, approvedAt: null, rejectedReason: null },
      select: { id: true },
    })
    if (pending) throw new PermitError('validation', 'An extension request is already awaiting approval.')

    const [created] = await this.db.$transaction([
      this.db.permitExtension.create({
        data: {
          permitId,
          previousValidTo: permit.validTo,
          newValidTo: next,
          reason: reason.trim(),
          requestedBy: caller.name,
        },
      }),
      this.db.permitEvent.create({
        data: {
          permitId,
          action: 'Extension requested',
          detail: `until ${next.toISOString().slice(0, 16).replace('T', ' ')} — ${reason.trim()}`,
          actor: caller.name,
          actorRole: membership.role,
        },
      }),
    ])
    return created
  }

  /** Approving an extension is what actually moves the permit's end time. */
  async approveExtension(caller: Caller, extensionId: string) {
    const ext = await this.db.permitExtension.findUnique({
      where: { id: extensionId },
      include: { permit: { select: { id: true, companyId: true, code: true, validTo: true } } },
    })
    if (!ext) throw new PermitError('not_found', 'Extension request not found.', 404)
    // Same authority that issues a permit extends one — it is the same decision.
    const m = this.requireIssuer(caller, ext.permit.companyId)
    if (ext.approvedAt) throw new PermitError('validation', 'That extension has already been approved.')
    if (ext.requestedBy === caller.name) {
      throw new PermitError('validation', 'An extension must be approved by someone other than the requester.')
    }

    await this.db.$transaction([
      this.db.permitExtension.update({
        where: { id: extensionId },
        data: { approvedBy: caller.name, approvedAt: new Date() },
      }),
      this.db.permit.update({
        where: { id: ext.permit.id },
        // An extension revives an expired permit: the work is authorised again, so the
        // status has to say so rather than leaving it reading expired.
        data: { validTo: ext.newValidTo, status: 'active', version: { increment: 1 } },
      }),
      this.db.permitEvent.create({
        data: {
          permitId: ext.permit.id,
          action: 'Extension approved',
          detail: `now valid until ${ext.newValidTo.toISOString().slice(0, 16).replace('T', ' ')}`,
          actor: caller.name,
          actorRole: m.role,
        },
      }),
    ])

    return this.get(caller, ext.permit.id)
  }
}

export { GAS_LIMITS }
