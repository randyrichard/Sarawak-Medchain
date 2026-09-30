import { randomUUID } from 'node:crypto'
import type { PrismaClient, Role, VisitorEventKind, VisitorStatus } from '@prisma/client'
import { membershipOf, type Caller } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'

/**
 * Visitor management.
 *
 * The register exists to answer one question at 3am with the alarm sounding: who is inside
 * the fence. Approvals, acknowledgements, badges and the blacklist are the machinery that
 * keeps that answer true, and every one of them is enforced here rather than on the screen
 * - a blacklist checked only by the client is not a blacklist.
 */
export class VisitorError extends DomainError {
  constructor(code: string, message: string, status = 400) {
    super(code, message, status)
    this.name = 'VisitorError'
  }
}

/** Who may create and amend a visit. Reception is normally an admin or safety officer. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

/**
 * Who may work the gate.
 *
 * Deliberately wider than WRITE_ROLES on the supervisor side and no wider elsewhere:
 * checking somebody in is a clerical act performed at a desk, but denying entry and
 * blacklisting are not.
 */
const GATE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

/** Who may add to or lift the blacklist. Refusing somebody entry is a management act. */
const BLACKLIST_ROLES: Role[] = ['admin', 'hse_manager']

/**
 * The site rules every visitor completes before they can pass the gate.
 *
 * Held as a list rather than five scattered checks so the gate, the screen and the API all
 * refer to the same set, and adding one is a single edit.
 */
export const ACKNOWLEDGEMENTS = [
  { key: 'inductionAt', label: 'Site induction' },
  { key: 'ndaAt', label: 'Non-disclosure agreement' },
  { key: 'safetyBriefingAt', label: 'Safety briefing' },
  { key: 'emergencyProcedureAt', label: 'Emergency procedure' },
  { key: 'siteRulesAt', label: 'Site rules' },
] as const

export type AcknowledgementKey = (typeof ACKNOWLEDGEMENTS)[number]['key']

export const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  draft: 'Draft',
  pre_registered: 'Pre-registered',
  waiting: 'Waiting at reception',
  checked_in: 'Checked in',
  on_site: 'On site',
  checked_out: 'Checked out',
  expired: 'Expired',
  denied: 'Denied',
  blacklisted: 'Blacklisted',
  cancelled: 'Cancelled',
}

/** Statuses that mean the person is physically inside the fence. */
export const ON_SITE_STATUSES: VisitorStatus[] = ['checked_in', 'on_site']

/** Statuses from which nothing further happens. A visit here is finished. */
const SETTLED: VisitorStatus[] = ['checked_out', 'expired', 'denied', 'blacklisted', 'cancelled']

function startOfToday(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Blacklist matching is done on a normalised value so spacing and case cannot dodge it. */
export const normalise = (v: string | null | undefined) =>
  (v ?? '').replace(/[\s-]/g, '').toUpperCase()

export interface BlacklistHit {
  id: string
  field: 'idNumber' | 'phone' | 'visitorCompany' | 'vehicleNumber'
  reason: string
  expiresAt: Date | null
}

export interface VisitorFacts {
  status: VisitorStatus
  expectedDeparture: Date
  checkedInAt: Date | null
  inductionAt: Date | null
  ndaAt: Date | null
  safetyBriefingAt: Date | null
  emergencyProcedureAt: Date | null
  siteRulesAt: Date | null
  approvedAt: Date | null
  hostEmployeeId: string | null
}

/**
 * Everything that must be true before a visitor can pass the gate, as sentences.
 *
 * A pure function of the facts with no database access, so the screen showing what is
 * outstanding and the server refusing the check-in can never disagree. The blacklist is
 * not here: it needs a query, and it is a refusal rather than a checklist item.
 */
export function checkInBlockers(v: VisitorFacts): string[] {
  const out: string[] = []
  if (SETTLED.includes(v.status)) {
    out.push(`This visit is ${VISITOR_STATUS_LABEL[v.status].toLowerCase()} and cannot be checked in.`)
    return out
  }
  if (v.status === 'draft') out.push('The visit has not been pre-registered.')
  if (v.hostEmployeeId && !v.approvedAt) out.push('The host has not approved this visit.')

  for (const a of ACKNOWLEDGEMENTS) {
    if (!v[a.key]) out.push(`${a.label} has not been acknowledged.`)
  }
  return out
}

/**
 * Whether a visitor who is inside has outstanding time.
 *
 * Derived on read, never stored. A stored "overdue" flag needs a job to stay true, and any
 * window where that job had not run would report an unaccounted person as accounted for -
 * which is the one thing this register exists to get right.
 */
export function overdueBy(v: { status: VisitorStatus; expectedDeparture: Date }, now = new Date()) {
  if (!ON_SITE_STATUSES.includes(v.status)) return null
  const ms = now.getTime() - v.expectedDeparture.getTime()
  return ms > 0 ? Math.floor(ms / 60_000) : null
}

/** Minutes are what is stored; hours are what people say. */
function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export class VisitorService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, VisitorError)
  }


  private require(caller: Caller, companyId: string, roles: Role[], doing: string) {
    const m = this.membership(caller, companyId)
    if (!roles.includes(m.role)) {
      throw new VisitorError('forbidden', `Your role does not permit ${doing}.`, 403)
    }
    return m
  }

  private async log(
    caller: Caller, companyId: string, action: string, target: string,
    ctx: { ip?: string; device?: string } = {},
  ) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId, actor: caller.name, actorRole: m?.role ?? '',
        action, module: 'visitors', target,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
  }

  /**
   * Write one line of a visit's history.
   *
   * Takes a transaction client so the event and the change that caused it commit together.
   * A history written afterwards loses entries whenever the second write fails, and this
   * is the record read back after an evacuation.
   */
  private event(
    tx: Pick<PrismaClient, 'visitorEvent'>,
    visitorId: string, kind: VisitorEventKind, summary: string,
    opts: { detail?: string; actor: string; actorRole?: string },
  ) {
    return tx.visitorEvent.create({
      data: {
        visitorId, kind, summary,
        detail: opts.detail ?? null,
        actor: opts.actor, actorRole: opts.actorRole ?? '',
      },
    })
  }

  private async visitFor(caller: Caller, id: string) {
    const v = await this.db.visitor.findUnique({ where: { id } })
    if (!v) throw new VisitorError('not_found', 'Visitor not found.', 404)
    this.membership(caller, v.companyId)
    return v
  }

  // ── Blacklist ──────────────────────────────────────────────────────────────

  /**
   * Whether these details are refused entry.
   *
   * Matched on normalised values so "ABC 1234" and "abc-1234" are the same vehicle. Expired
   * entries are ignored here rather than deleted: the record of having been refused is
   * worth keeping even after the ban lapses.
   */
  async blacklistHit(companyId: string, details: {
    idNumber?: string | null
    phone?: string | null
    visitorCompany?: string | null
    vehicleNumber?: string | null
  }): Promise<BlacklistHit | null> {
    const rows = await this.db.visitorBlacklist.findMany({
      where: {
        companyId,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    })

    const fields: BlacklistHit['field'][] = ['idNumber', 'phone', 'visitorCompany', 'vehicleNumber']
    for (const row of rows) {
      for (const field of fields) {
        const banned = normalise(row[field])
        const given = normalise(details[field])
        if (banned && given && banned === given) {
          return { id: row.id, field, reason: row.reason, expiresAt: row.expiresAt }
        }
      }
    }
    return null
  }

  async listBlacklist(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const rows = await this.db.visitorBlacklist.findMany({
      where: { companyId },
      orderBy: { addedAt: 'desc' },
    })
    const now = new Date()
    return rows.map((r) => ({
      ...r,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      addedAt: r.addedAt.toISOString(),
      liftedAt: r.liftedAt?.toISOString() ?? null,
      /** Derived: active and not lapsed. A lapsed row is history, not a ban. */
      inForce: r.active && (!r.expiresAt || r.expiresAt > now),
      permanent: !r.expiresAt,
    }))
  }

  async addToBlacklist(caller: Caller, companyId: string, input: {
    idNumber?: string
    phone?: string
    visitorCompany?: string
    vehicleNumber?: string
    reason: string
    expiresAt?: string | null
  }, ctx: { ip?: string; device?: string } = {}) {
    this.require(caller, companyId, BLACKLIST_ROLES, 'blacklisting a visitor')

    if (!input.reason?.trim()) {
      throw new VisitorError('validation', 'Say why this person or vehicle is refused entry.')
    }
    const has = [input.idNumber, input.phone, input.visitorCompany, input.vehicleNumber]
      .some((v) => v?.trim())
    if (!has) {
      throw new VisitorError('validation', 'Give at least one of ID number, phone, company or vehicle to match on.')
    }

    let expiresAt: Date | null = null
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt)
      if (Number.isNaN(expiresAt.getTime())) {
        throw new VisitorError('validation', 'That expiry date is not valid.')
      }
      if (expiresAt <= new Date()) {
        throw new VisitorError('validation', 'An expiry in the past would take effect and lapse in the same moment.')
      }
    }

    const row = await this.db.visitorBlacklist.create({
      data: {
        companyId,
        idNumber: input.idNumber?.trim() || null,
        phone: input.phone?.trim() || null,
        visitorCompany: input.visitorCompany?.trim() || null,
        vehicleNumber: input.vehicleNumber?.trim() || null,
        reason: input.reason.trim(),
        expiresAt,
        addedBy: caller.name,
      },
    })

    await this.log(caller, companyId, 'Added to visitor blacklist',
      [row.idNumber, row.phone, row.visitorCompany, row.vehicleNumber].filter(Boolean).join(', '), ctx)
    return row
  }

  async liftBlacklist(caller: Caller, id: string, ctx: { ip?: string; device?: string } = {}) {
    const row = await this.db.visitorBlacklist.findUnique({ where: { id } })
    if (!row) throw new VisitorError('not_found', 'That blacklist entry no longer exists.', 404)
    this.require(caller, row.companyId, BLACKLIST_ROLES, 'lifting a blacklist entry')
    if (!row.active) throw new VisitorError('validation', 'That entry has already been lifted.')

    const updated = await this.db.visitorBlacklist.update({
      where: { id },
      // Lifted, not deleted: the record of having been refused outlives the ban.
      data: { active: false, liftedBy: caller.name, liftedAt: new Date() },
    })
    await this.log(caller, row.companyId, 'Lifted visitor blacklist entry', row.reason, ctx)
    return updated
  }

  // ── Register ───────────────────────────────────────────────────────────────

  async create(caller: Caller, input: {
    companyId: string
    siteId: string
    name: string
    idNumber: string
    nationality?: string
    visitorCompany?: string
    phone?: string
    email?: string
    vehicleNumber?: string
    hostEmployeeId?: string
    departmentId?: string
    purpose?: string
    expectedArrival: string
    expectedDeparture: string
    notes?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const m = this.require(caller, input.companyId, WRITE_ROLES, 'registering visitors')

    if (!input.name?.trim()) throw new VisitorError('validation', 'A visitor name is required.')
    if (!input.idNumber?.trim()) {
      throw new VisitorError('validation', 'An IC or passport number is required.')
    }

    const arrival = new Date(input.expectedArrival)
    const departure = new Date(input.expectedDeparture)
    if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) {
      throw new VisitorError('validation', 'Those visit times are not valid.')
    }
    if (departure <= arrival) {
      throw new VisitorError('validation', 'The visit must end after it starts.')
    }

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new VisitorError('validation', 'Unknown site for this workspace.')

    // The host is named from the workforce register rather than typed, so the approval can
    // actually reach somebody and the record survives them leaving.
    let hostName = ''
    if (input.hostEmployeeId) {
      const host = await this.db.employee.findUnique({
        where: { id: input.hostEmployeeId },
        select: { id: true, name: true, companyId: true, active: true },
      })
      if (!host || host.companyId !== input.companyId) {
        throw new VisitorError('validation', 'That host is not in this workspace.')
      }
      if (!host.active) throw new VisitorError('validation', `${host.name} is no longer active.`)
      hostName = host.name
    }

    /*
     * The blacklist is checked here as well as at the gate. Catching it at pre-registration
     * is what stops somebody driving two hours to be turned away, and the attempt is
     * recorded either way.
     */
    const hit = await this.blacklistHit(input.companyId, input)

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'visitor' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'visitor', next: 5001 },
        select: { next: true },
      })

      const v = await tx.visitor.create({
        data: {
          code: `VIS-${counter.next}`,
          passKey: randomUUID(),
          companyId: input.companyId,
          siteId: input.siteId,
          name: input.name.trim(),
          idNumber: input.idNumber.trim(),
          nationality: input.nationality?.trim() ?? '',
          visitorCompany: input.visitorCompany?.trim() ?? '',
          phone: input.phone?.trim() ?? '',
          email: input.email?.trim() ?? '',
          vehicleNumber: input.vehicleNumber?.trim() ?? '',
          hostEmployeeId: input.hostEmployeeId ?? null,
          hostNameAtBooking: hostName,
          departmentId: input.departmentId ?? null,
          purpose: input.purpose?.trim() ?? '',
          expectedArrival: arrival,
          expectedDeparture: departure,
          notes: input.notes?.trim() || null,
          emergencyContactName: input.emergencyContactName?.trim() ?? '',
          emergencyContactPhone: input.emergencyContactPhone?.trim() ?? '',
          // A blacklisted visitor is recorded, not silently dropped. The attempt is the
          // thing security needs to see.
          status: hit ? 'blacklisted' : 'pre_registered',
          deniedReason: hit ? hit.reason : null,
          createdBy: caller.name,
        },
      })

      await this.event(tx, v.id, 'created', `Pre-registered as ${v.code}.`, {
        detail: [input.visitorCompany?.trim(), hostName ? `host ${hostName}` : null]
          .filter(Boolean).join(', ') || undefined,
        actor: caller.name, actorRole: m.role,
      })

      if (hit) {
        await this.event(tx, v.id, 'blacklisted',
          'Refused: these details are on the blacklist.',
          { detail: hit.reason, actor: caller.name, actorRole: m.role })
      }
      return v
    })

    await this.log(caller, input.companyId,
      hit ? 'Blacklisted visitor attempted registration' : 'Visitor pre-registered',
      `${created.code} ${created.name}`, ctx)

    if (hit) {
      await this.notify(input.companyId, 'Blacklisted visitor turned away',
        `${created.name} (${created.idNumber}) matched a blacklist entry: ${hit.reason}.`,
        `/visitors?open=${created.id}`)
    }

    return this.view(created)
  }


  // -- Host approval ---------------------------------------------------------

  /**
   * The host approves or refuses the visit.
   *
   * The host themself may decide, and so may a manager: a visit must not be stuck because
   * the person named is on leave. Who actually decided is recorded either way, which is
   * the part that matters when the question is asked later.
   */
  async decide(caller: Caller, id: string, approve: boolean, note?: string,
    ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.membership(caller, v.companyId)

    const isHost = !!v.hostEmployeeId && await this.callerIsHost(caller, v.hostEmployeeId)
    if (!isHost && !WRITE_ROLES.includes(m.role)) {
      throw new VisitorError('forbidden', 'Only the named host or a manager can decide this visit.', 403)
    }
    /*
     * A refusal has to be reversible. Hosts refuse by mistake, and visits get reinstated
     * after a phone call; without this the only way back is a fresh registration and five
     * acknowledgements re-taken at the desk, which is how a register stops matching who is
     * actually at reception. Blacklisted and cancelled are not reversible here - those are
     * lifted and re-registered deliberately.
     */
    if (SETTLED.includes(v.status) && v.status !== 'denied') {
      throw new VisitorError('validation',
        `This visit is ${VISITOR_STATUS_LABEL[v.status].toLowerCase()} and cannot be decided.`)
    }
    if (!approve && !note?.trim()) {
      throw new VisitorError('validation', 'Say why the visit is refused.')
    }

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: approve
          ? {
              approvedBy: caller.name, approvedAt: new Date(),
              rejectedBy: null, rejectedAt: null,
              decisionNote: note?.trim() || null,
              // Reinstating a refused visit puts it back where it was, and clears the
              // reason, so nothing downstream still reads it as denied.
              ...(v.status === 'denied' ? { status: 'pre_registered' as const, deniedReason: null } : {}),
              version: { increment: 1 },
            }
          : {
              rejectedBy: caller.name, rejectedAt: new Date(),
              approvedBy: null, approvedAt: null,
              decisionNote: note?.trim() || null,
              status: 'denied', deniedReason: note?.trim() ?? null,
              version: { increment: 1 },
            },
      })
      await this.event(tx, id, approve ? 'approved' : 'rejected',
        approve
          ? `${v.status === 'denied' ? 'Reinstated' : 'Approved'} by ${caller.name}${isHost ? ' (host)' : ''}.`
          : `Refused by ${caller.name}${isHost ? ' (host)' : ''}.`,
        { detail: note?.trim() || undefined, actor: caller.name, actorRole: m.role })
      return row
    })

    await this.log(caller, v.companyId, approve ? 'Visitor approved' : 'Visitor refused',
      `${v.code} ${v.name}`, ctx)

    if (!approve) {
      await this.notify(v.companyId, `Visitor refused: ${v.name}`,
        `${v.code} was refused by ${caller.name}. ${note?.trim() ?? ''}`.trim(),
        `/visitors?open=${v.id}`)
    }
    return this.view(updated)
  }

  /**
   * Whether this caller is the employee named as host.
   *
   * Matched on name, because Employee carries no user id - the workforce register and the
   * login accounts are separate tables with no join between them. That is a weak link and
   * it is why a manager can also decide: the host path is a convenience, and the authority
   * to approve does not rest on it alone. Whoever actually decided is recorded either way.
   */
  private async callerIsHost(caller: Caller, hostEmployeeId: string) {
    const host = await this.db.employee.findUnique({
      where: { id: hostEmployeeId },
      select: { name: true },
    })
    return !!host && host.name === caller.name
  }

  // -- Site rules ------------------------------------------------------------

  /**
   * Record one acknowledgement.
   *
   * A timestamp per item rather than a single "briefed" flag, because after an evacuation
   * the question is which briefing they had and when - and a flag cannot answer it.
   */
  async acknowledge(caller: Caller, id: string, key: AcknowledgementKey,
    ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, GATE_ROLES, 'recording visitor acknowledgements')

    const item = ACKNOWLEDGEMENTS.find((a) => a.key === key)
    if (!item) throw new VisitorError('validation', 'Unknown acknowledgement.')
    if (SETTLED.includes(v.status)) {
      throw new VisitorError('validation', 'This visit is closed.')
    }
    if (v[key]) return v   // Already done. Re-recording it would move the timestamp.

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: { [key]: new Date(), version: { increment: 1 } },
      })
      await this.event(tx, id, 'acknowledgement', `${item.label} acknowledged.`, {
        actor: caller.name, actorRole: m.role,
      })
      return row
    })
    await this.log(caller, v.companyId, `Visitor acknowledgement: ${item.label}`,
      `${v.code} ${v.name}`, ctx)
    return this.view(updated)
  }

  // -- The gate --------------------------------------------------------------

  /** What still stands between this visit and the gate, blacklist included. */
  async gateStatus(caller: Caller, id: string) {
    const v = await this.visitFor(caller, id)
    const blockers = checkInBlockers(v)
    const hit = await this.blacklistHit(v.companyId, v)
    if (hit) blockers.unshift(`Refused entry: ${hit.reason}`)
    return {
      status: v.status,
      blockers,
      acknowledgements: ACKNOWLEDGEMENTS.map((a) => ({
        key: a.key, label: a.label, at: v[a.key]?.toISOString() ?? null,
      })),
    }
  }

  async checkIn(caller: Caller, id: string, input: {
    badgeNumber?: string
    vehicleNumber?: string
  } = {}, ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, GATE_ROLES, 'checking visitors in')

    if (v.checkedInAt) {
      // The register cannot show two arrivals for one visit; the count of who is inside
      // depends on it.
      throw new VisitorError('validation', `${v.name} is already checked in.`)
    }

    /*
     * Re-checked at the gate, not trusted from pre-registration. Somebody can be added to
     * the blacklist between booking a visit and turning up for it, and the gate is the last
     * point at which that matters.
     */
    const hit = await this.blacklistHit(v.companyId, {
      ...v,
      vehicleNumber: input.vehicleNumber ?? v.vehicleNumber,
    })
    if (hit) {
      await this.db.$transaction(async (tx) => {
        await tx.visitor.update({
          where: { id },
          data: { status: 'blacklisted', deniedReason: hit.reason, version: { increment: 1 } },
        })
        await this.event(tx, id, 'blacklisted', 'Turned away at the gate: blacklisted.', {
          detail: hit.reason, actor: caller.name, actorRole: m.role,
        })
      })
      await this.log(caller, v.companyId, 'Blacklisted visitor turned away at the gate',
        `${v.code} ${v.name}`, ctx)
      await this.notify(v.companyId, `Blacklisted visitor at the gate: ${v.name}`,
        `${v.code} was turned away. ${hit.reason}`, `/visitors?open=${v.id}`)
      throw new VisitorError('validation', `Entry refused: ${hit.reason}`)
    }

    const blockers = checkInBlockers(v)
    if (blockers.length > 0) throw new VisitorError('validation', blockers[0])

    // A badge out with somebody else cannot be handed over twice; the badge is how the
    // sweep team knows who they have accounted for.
    if (input.badgeNumber?.trim()) {
      await this.assertBadgeFree(v.companyId, v.siteId, input.badgeNumber.trim(), id)
    }

    const now = new Date()
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: {
          status: 'on_site',
          checkedInAt: now,
          badgeNumber: input.badgeNumber?.trim() || v.badgeNumber,
          badgeIssuedAt: input.badgeNumber?.trim() ? now : v.badgeIssuedAt,
          vehicleNumber: input.vehicleNumber?.trim() ?? v.vehicleNumber,
          version: { increment: 1 },
        },
      })
      /*
       * The badge line is written first and the check-in second, so a history read newest
       * first shows the headline on top with its detail beneath it. Within one transaction
       * the two share a timestamp and are separated only by insertion order.
       */
      if (input.badgeNumber?.trim()) {
        await this.event(tx, id, 'badge_issued', `Badge ${input.badgeNumber.trim()} issued.`, {
          actor: caller.name, actorRole: m.role,
        })
      }
      await this.event(tx, id, 'checked_in', `Checked in by ${caller.name}.`, {
        detail: [
          input.badgeNumber?.trim() ? `badge ${input.badgeNumber.trim()}` : null,
          (input.vehicleNumber ?? v.vehicleNumber) ? `vehicle ${input.vehicleNumber ?? v.vehicleNumber}` : null,
        ].filter(Boolean).join(', ') || undefined,
        actor: caller.name, actorRole: m.role,
      })
      return row
    })

    await this.log(caller, v.companyId, 'Visitor checked in', `${v.code} ${v.name}`, ctx)
    await this.notify(v.companyId, `Visitor arrived: ${v.name}`,
      `${v.code} checked in at ${v.siteId}. Host: ${v.hostNameAtBooking || 'not named'}.`,
      `/visitors?open=${v.id}`)
    return this.view(updated)
  }

  async checkOut(caller: Caller, id: string, input: { badgeReturned?: boolean } = {},
    ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, GATE_ROLES, 'checking visitors out')

    if (!v.checkedInAt) {
      // Otherwise a visit that never happened reads as a completed one.
      throw new VisitorError('validation', `${v.name} has not been checked in.`)
    }
    if (v.checkedOutAt) throw new VisitorError('validation', `${v.name} is already checked out.`)

    const now = new Date()
    const minutes = Math.max(0, Math.round((now.getTime() - v.checkedInAt.getTime()) / 60_000))
    const returned = input.badgeReturned ?? !!v.badgeNumber

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: {
          status: 'checked_out',
          checkedOutAt: now,
          badgeReturnedAt: returned && v.badgeNumber ? now : v.badgeReturnedAt,
          version: { increment: 1 },
        },
      })
      // Badge first, check-out second: same reason as check-in.
      if (v.badgeNumber) {
        await this.event(tx, id,
          returned ? 'badge_returned' : 'note_added',
          returned
            ? `Badge ${v.badgeNumber} returned.`
            : `Badge ${v.badgeNumber} NOT returned.`,
          { actor: caller.name, actorRole: m.role })
      }
      await this.event(tx, id, 'checked_out',
        `Checked out by ${caller.name} after ${formatDuration(minutes)}.`, {
          actor: caller.name, actorRole: m.role,
        })
      return row
    })

    await this.log(caller, v.companyId, 'Visitor checked out', `${v.code} ${v.name}`, ctx)

    if (v.badgeNumber && !returned) {
      await this.notify(v.companyId, `Badge not returned: ${v.badgeNumber}`,
        `${v.name} (${v.code}) left without returning badge ${v.badgeNumber}.`,
        `/visitors?open=${v.id}`)
    }
    return this.view(updated)
  }

  /** A badge already out with somebody else cannot be issued again. */
  private async assertBadgeFree(companyId: string, siteId: string, badgeNumber: string, exceptId: string) {
    const clash = await this.db.visitor.findFirst({
      where: {
        companyId, siteId, badgeNumber,
        status: { in: ON_SITE_STATUSES },
        id: { not: exceptId },
      },
      select: { code: true, name: true },
    })
    if (clash) {
      throw new VisitorError('validation',
        `Badge ${badgeNumber} is already with ${clash.name} (${clash.code}).`)
    }
  }

  async setBadge(caller: Caller, id: string, badgeNumber: string | null,
    ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, GATE_ROLES, 'issuing visitor badges')

    const next = badgeNumber?.trim() || null
    if (next) await this.assertBadgeFree(v.companyId, v.siteId, next, id)

    const now = new Date()
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: {
          badgeNumber: next,
          badgeIssuedAt: next ? now : null,
          badgeReturnedAt: next ? null : now,
          version: { increment: 1 },
        },
      })
      await this.event(tx, id, next ? 'badge_issued' : 'badge_returned',
        next ? `Badge ${next} issued.` : `Badge ${v.badgeNumber ?? ''} returned.`.trim(),
        { actor: caller.name, actorRole: m.role })
      return row
    })
    await this.log(caller, v.companyId, next ? 'Visitor badge issued' : 'Visitor badge returned',
      `${v.code} ${v.name}`, ctx)
    return this.view(updated)
  }

  async setVehicle(caller: Caller, id: string, vehicleNumber: string | null,
    ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, GATE_ROLES, 'recording visitor vehicles')

    const next = vehicleNumber?.trim() ?? ''
    // A vehicle can be blacklisted on its own - the driver may be fine and the truck not.
    if (next) {
      const hit = await this.blacklistHit(v.companyId, { vehicleNumber: next })
      if (hit) throw new VisitorError('validation', `That vehicle is refused entry: ${hit.reason}`)
    }

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: { vehicleNumber: next, version: { increment: 1 } },
      })
      await this.event(tx, id, next ? 'vehicle_added' : 'vehicle_removed',
        next ? `Vehicle ${next} recorded.` : `Vehicle ${v.vehicleNumber} removed.`,
        { actor: caller.name, actorRole: m.role })
      return row
    })
    await this.log(caller, v.companyId, next ? 'Visitor vehicle recorded' : 'Visitor vehicle removed',
      `${v.code} ${v.name}`, ctx)
    return this.view(updated)
  }

  async addNote(caller: Caller, id: string, note: string, ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, GATE_ROLES, 'adding visitor notes')
    if (!note?.trim()) throw new VisitorError('validation', 'Write something first.')

    await this.db.$transaction(async (tx) => {
      await this.event(tx, id, 'note_added', note.trim(), {
        actor: caller.name, actorRole: m.role,
      })
    })
    await this.log(caller, v.companyId, 'Visitor note added', `${v.code} ${v.name}`, ctx)
    return this.get(caller, id)
  }

  async cancel(caller: Caller, id: string, reason: string, ctx: { ip?: string; device?: string } = {}) {
    const v = await this.visitFor(caller, id)
    const m = this.require(caller, v.companyId, WRITE_ROLES, 'cancelling visits')
    if (v.checkedInAt && !v.checkedOutAt) {
      throw new VisitorError('validation',
        `${v.name} is on site. Check them out rather than cancelling the visit.`)
    }
    if (SETTLED.includes(v.status)) {
      throw new VisitorError('validation', 'This visit is already closed.')
    }

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.visitor.update({
        where: { id },
        data: { status: 'cancelled', version: { increment: 1 } },
      })
      await this.event(tx, id, 'status_change', 'Visit cancelled.', {
        detail: reason?.trim() || undefined, actor: caller.name, actorRole: m.role,
      })
      return row
    })
    await this.log(caller, v.companyId, 'Visit cancelled', `${v.code} ${v.name}`, ctx)
    return this.view(updated)
  }

  // -- Reads -----------------------------------------------------------------

  async get(caller: Caller, id: string) {
    const v = await this.visitFor(caller, id)
    return this.view(v)
  }

  /** By the pass QR payload. Read-only; every mutation still needs a session. */
  async byPassKey(caller: Caller, passKey: string) {
    const v = await this.db.visitor.findUnique({ where: { passKey } })
    if (!v) throw new VisitorError('not_found', 'That pass is not recognised.', 404)
    this.membership(caller, v.companyId)
    return this.view(v)
  }

  /**
   * The shape every read and every mutation returns.
   *
   * Mutations return this rather than the raw row: the derived fields - status label, time
   * on site, what is still outstanding - are what the caller renders, and a mutation that
   * answers with a bare database row makes the typed client a lie. It also lets a screen
   * act on the response without a second round trip.
   */
  private view(v: {
    id: string; code: string; companyId: string; siteId: string; name: string
    idNumber: string; nationality: string; visitorCompany: string; phone: string
    email: string; vehicleNumber: string; hostEmployeeId: string | null
    hostNameAtBooking: string; departmentId: string | null; purpose: string
    expectedArrival: Date; expectedDeparture: Date; checkedInAt: Date | null
    checkedOutAt: Date | null; status: VisitorStatus; badgeNumber: string | null
    badgeIssuedAt: Date | null; badgeReturnedAt: Date | null; passKey: string
    notes: string | null; emergencyContactName: string; emergencyContactPhone: string
    inductionAt: Date | null; ndaAt: Date | null; safetyBriefingAt: Date | null
    emergencyProcedureAt: Date | null; siteRulesAt: Date | null
    approvedBy: string | null; approvedAt: Date | null; rejectedBy: string | null
    rejectedAt: Date | null; decisionNote: string | null; deniedReason: string | null
    createdBy: string; createdAt: Date; version: number
  }) {
    const onSite = ON_SITE_STATUSES.includes(v.status)
    const minutes = v.checkedInAt
      ? Math.round(((v.checkedOutAt ?? new Date()).getTime() - v.checkedInAt.getTime()) / 60_000)
      : null
    return {
      ...v,
      expectedArrival: v.expectedArrival.toISOString(),
      expectedDeparture: v.expectedDeparture.toISOString(),
      checkedInAt: v.checkedInAt?.toISOString() ?? null,
      checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
      badgeIssuedAt: v.badgeIssuedAt?.toISOString() ?? null,
      badgeReturnedAt: v.badgeReturnedAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
      statusLabel: VISITOR_STATUS_LABEL[v.status],
      onSite,
      /** Minutes on site: live while they are in, final once they are out. */
      durationMinutes: minutes,
      durationLabel: minutes === null ? null : formatDuration(minutes),
      overdueMinutes: overdueBy(v),
      acknowledgements: ACKNOWLEDGEMENTS.map((a) => ({
        key: a.key, label: a.label, at: v[a.key]?.toISOString() ?? null,
      })),
      outstanding: checkInBlockers(v),
    }
  }

  async list(caller: Caller, companyId: string, filters: {
    status?: VisitorStatus | 'all' | 'on_site' | 'today' | 'overdue'
    siteId?: string
    q?: string
    page?: number
    pageSize?: number
  } = {}) {
    this.membership(caller, companyId)
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50))

    const today = startOfToday()
    const tomorrow = new Date(today.getTime() + 86400_000)

    const where: Record<string, unknown> = { companyId }
    if (filters.siteId) where.siteId = filters.siteId
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'on_site') where.status = { in: ON_SITE_STATUSES }
      else if (filters.status === 'today') where.expectedArrival = { gte: today, lt: tomorrow }
      else if (filters.status === 'overdue') {
        // Computed in the query rather than filtered in memory, so paging stays honest.
        where.status = { in: ON_SITE_STATUSES }
        where.expectedDeparture = { lt: new Date() }
      } else where.status = filters.status
    }
    if (filters.q?.trim()) {
      const like = { contains: filters.q.trim(), mode: 'insensitive' as const }
      where.OR = [
        { code: like }, { name: like }, { idNumber: like }, { visitorCompany: like },
        { vehicleNumber: like }, { badgeNumber: like }, { phone: like }, { email: like },
        { hostNameAtBooking: like },
      ]
    }

    const [rows, total] = await Promise.all([
      this.db.visitor.findMany({
        where,
        orderBy: [{ expectedArrival: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.visitor.count({ where }),
    ])
    return { rows: rows.map((r) => this.view(r)), total, page, pageSize }
  }

  async timeline(caller: Caller, id: string) {
    const v = await this.visitFor(caller, id)
    const rows = await this.db.visitorEvent.findMany({
      where: { visitorId: v.id },
      // Two events written in the same transaction share a timestamp, so `at` alone is a
      // tie and Postgres is free to return them either way round - a history that reads
      // "badge returned" before "checked out". The id breaks the tie in insertion order.
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id, kind: r.kind, summary: r.summary, detail: r.detail,
      actor: r.actor, actorRole: r.actorRole, at: r.at.toISOString(),
    }))
  }

  /**
   * The emergency board.
   *
   * Every number counted in Postgres against one scope, in one transaction, so two tiles
   * cannot disagree at the moment somebody is deciding whether the muster is complete.
   */
  async dashboard(caller: Caller, companyId: string, siteId?: string | null) {
    this.membership(caller, companyId)
    const now = new Date()
    const today = startOfToday()
    const tomorrow = new Date(today.getTime() + 86400_000)

    const scope = { companyId, ...(siteId ? { siteId } : {}) }

    const [onSite, expectedToday, overdue, checkedInToday, deniedToday, blacklistedToday, onSiteRows] =
      await this.db.$transaction([
        this.db.visitor.count({ where: { ...scope, status: { in: ON_SITE_STATUSES } } }),
        this.db.visitor.count({
          where: { ...scope, expectedArrival: { gte: today, lt: tomorrow } },
        }),
        this.db.visitor.count({
          where: { ...scope, status: { in: ON_SITE_STATUSES }, expectedDeparture: { lt: now } },
        }),
        this.db.visitor.count({ where: { ...scope, checkedInAt: { gte: today, lt: tomorrow } } }),
        this.db.visitor.count({
          where: { ...scope, status: 'denied', rejectedAt: { gte: today, lt: tomorrow } },
        }),
        this.db.visitor.count({
          where: { ...scope, status: 'blacklisted', createdAt: { gte: today, lt: tomorrow } },
        }),
        // The people inside, for the vehicle count and the company breakdown. Bounded: a
        // site with more than this many visitors inside has a different problem.
        this.db.visitor.findMany({
          where: { ...scope, status: { in: ON_SITE_STATUSES } },
          select: {
            id: true, code: true, name: true, visitorCompany: true, vehicleNumber: true,
            badgeNumber: true, hostNameAtBooking: true, checkedInAt: true,
            expectedDeparture: true, status: true,
          },
          orderBy: { checkedInAt: 'asc' },
          take: 1000,
        }),
      ])

    const byCompany = new Map<string, number>()
    for (const r of onSiteRows) {
      const key = r.visitorCompany.trim() || 'Not stated'
      byCompany.set(key, (byCompany.get(key) ?? 0) + 1)
    }

    return {
      onSite,
      expectedToday,
      overdue,
      checkedInToday,
      deniedToday,
      blacklistedToday,
      /** Distinct vehicles inside, not visitors with a vehicle: four people share a van. */
      vehiclesOnSite: new Set(
        onSiteRows.map((r) => normalise(r.vehicleNumber)).filter(Boolean),
      ).size,
      badgesOut: onSiteRows.filter((r) => r.badgeNumber).length,
      byCompany: [...byCompany.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      /** The muster list. Ordered by arrival, which is how a roll call is read. */
      onSiteList: onSiteRows.map((r) => ({
        id: r.id, code: r.code, name: r.name,
        visitorCompany: r.visitorCompany, vehicleNumber: r.vehicleNumber,
        badgeNumber: r.badgeNumber, host: r.hostNameAtBooking,
        checkedInAt: r.checkedInAt?.toISOString() ?? null,
        overdueMinutes: overdueBy(r, now),
      })),
    }
  }

  /** A notification for reception, security and the safety team. */
  private async notify(companyId: string, title: string, detail: string, href: string) {
    await this.db.notification.create({
      data: { companyId, kind: 'system', title, detail, href },
    })
  }
}
