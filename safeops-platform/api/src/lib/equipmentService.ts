/**
 * Equipment fitness, calibration, and the permit gate.
 *
 * The register already knew what equipment exists and when it was last inspected. What it
 * could not answer is the only question that matters at a permit desk: *may this specific
 * item be used on this job, right now*. A gas detector whose calibration lapsed last month
 * still reads numbers — they are simply not numbers anyone should trust, and nothing in
 * the system stopped someone taking it into a vessel.
 *
 * Fitness is derived, never stored. `inspection_due` and `calibration_due` are functions
 * of a date and today; a stored copy needs a job to keep it true, and any window where
 * that job had not run would report an overdue instrument as fit for use.
 */
import { type AssetEventKind, type AssetStatus, type PrismaClient, type Role, type AssetCategory } from '@prisma/client'
import type { Caller } from './incidentService.js'

export class EquipmentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

/** Roles that may record calibration or book equipment onto a permit. */
const WRITE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

/**
 * Categories whose readings are relied upon, so a lapsed certificate makes them unusable
 * rather than merely overdue. Setting `requiresCalibration` on the asset overrides this;
 * the list is the sensible default at creation.
 */
export const CALIBRATED_CATEGORIES: AssetCategory[] = [
  'gas_detector', 'pressure_gauge', 'electrical_tool',
]

/** Inside this window a date reads as "due" rather than merely valid. */
export const DUE_WARN_DAYS = 14

/** Said in full on the timeline, because "fail" alone reads as a system error. */
const MAINTENANCE_STATUS_TEXT: Record<string, string> = {
  open: 'reopened',
  in_progress: 'started',
  completed: 'completed',
  cancelled: 'cancelled',
}

/** Written off or scrapped. Counted in no tile: neither available nor a problem to fix. */
const OUT_OF_REGISTER: AssetStatus[] = ['retired', 'disposed']

const CALIBRATION_RESULT_TEXT: Record<string, string> = {
  pass: 'Passed',
  pass_with_adjustment: 'Passed after adjustment',
  fail: 'Failed',
}

export type FitnessCode =
  | 'ok' | 'out_of_service' | 'under_maintenance' | 'retired' | 'disposed'
  | 'inspection_overdue' | 'calibration_missing' | 'calibration_expired'

export interface EquipmentFitness {
  fit: boolean
  code: FitnessCode
  /** A sentence for the permit desk. Never just a boolean. */
  reason: string | null
  inspectionDue: Date | null
  daysToInspection: number | null
  calibrationRequired: boolean
  calibrationExpiry: Date | null
  daysToCalibration: number | null
  certificateNumber: string | null
}

function startOfToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((at - startOfToday().getTime()) / 86400_000)
}

/** The shape fitness needs. Kept narrow so callers can select only these columns. */
export interface FitnessInput {
  code: string
  name: string
  status: string
  nextDueDate: Date
  requiresCalibration: boolean
  category: AssetCategory
  calibrations: { expiresAt: Date; certificateNumber: string; result: string }[]
}

/**
 * Whether this item may be used, and why not if it may not.
 *
 * Pure and exported so the permit gate, the register and the reminder sweep all reach the
 * same verdict — three implementations of "is this gas detector usable" is three answers.
 */
export function assessFitness(a: FitnessInput): EquipmentFitness {
  const today = startOfToday()
  // Most recent certificate wins; a recalibration supersedes its predecessor.
  const current = [...a.calibrations].sort((x, y) => y.expiresAt.getTime() - x.expiresAt.getTime())[0] ?? null
  const needsCal = a.requiresCalibration || CALIBRATED_CATEGORIES.includes(a.category)

  const base = {
    inspectionDue: a.nextDueDate,
    daysToInspection: daysUntil(a.nextDueDate),
    calibrationRequired: needsCal,
    calibrationExpiry: current?.expiresAt ?? null,
    daysToCalibration: daysUntil(current?.expiresAt ?? null),
    certificateNumber: current?.certificateNumber ?? null,
  }

  // Ordered by how fundamental the objection is. Telling someone to book a calibration
  // for an item that has been scrapped wastes their morning.
  if (a.status === 'disposed') {
    return { ...base, fit: false, code: 'disposed', reason: `${a.code} has been disposed of.` }
  }
  if (a.status === 'retired') {
    return { ...base, fit: false, code: 'retired', reason: `${a.code} is retired from service.` }
  }
  if (a.status === 'out_of_service') {
    return { ...base, fit: false, code: 'out_of_service', reason: `${a.code} is out of service.` }
  }
  if (a.status === 'under_maintenance') {
    return { ...base, fit: false, code: 'under_maintenance', reason: `${a.code} is under maintenance.` }
  }
  if (a.nextDueDate < today) {
    return {
      ...base, fit: false, code: 'inspection_overdue',
      reason: `${a.code} inspection was due ${a.nextDueDate.toISOString().slice(0, 10)}.`,
    }
  }
  if (needsCal) {
    if (!current) {
      return {
        ...base, fit: false, code: 'calibration_missing',
        reason: `${a.code} has no calibration certificate on file.`,
      }
    }
    if (current.expiresAt < today) {
      return {
        ...base, fit: false, code: 'calibration_expired',
        reason: `${a.code} calibration expired ${current.expiresAt.toISOString().slice(0, 10)}.`,
      }
    }
  }
  return { ...base, fit: true, code: 'ok', reason: null }
}

/**
 * The equipment half of the permit activation gate, as a free function.
 *
 * Standalone so the permit service and the review service can call it without holding an
 * EquipmentService, and so there is exactly one definition of "is the equipment on this
 * permit fit". Returns a sentence per unfit item: the issuer must be told which item and
 * why, not merely that something is wrong.
 */
export async function equipmentBlockers(db: PrismaClient, permitId: string): Promise<string[]> {
  const rows = await db.permitEquipment.findMany({
    where: { permitId },
    include: { asset: { include: { calibrations: { orderBy: { expiresAt: 'desc' }, take: 5 } } } },
  })
  return rows
    .map((r) => assessFitness(r.asset))
    .filter((f) => !f.fit)
    .map((f) => f.reason!)
}

export class EquipmentService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new EquipmentError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  private requireRole(caller: Caller, companyId: string, doing: string) {
    const m = this.membership(caller, companyId)
    if (!WRITE_ROLES.includes(m.role)) {
      throw new EquipmentError('forbidden', `Your role does not permit ${doing}.`, 403)
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
        action, module: 'equipment', target,
        ip: ctx.ip ?? '', device: ctx.device ?? '',
      },
    })
  }

  private async assetFor(caller: Caller, assetId: string) {
    const asset = await this.db.asset.findUnique({
      where: { id: assetId },
      include: { calibrations: { orderBy: { expiresAt: 'desc' } } },
    })
    if (!asset) throw new EquipmentError('not_found', 'Equipment not found.', 404)
    this.membership(caller, asset.companyId)
    return asset
  }

  // ── Calibration ────────────────────────────────────────────────────────────

  async listCalibrations(caller: Caller, assetId: string) {
    const asset = await this.assetFor(caller, assetId)
    return asset.calibrations.map((c) => ({
      ...c,
      expired: c.expiresAt < startOfToday(),
      daysToExpiry: daysUntil(c.expiresAt),
    }))
  }

  async recordCalibration(caller: Caller, assetId: string, input: {
    calibratedAt: string
    expiresAt: string
    certificateNumber: string
    vendor?: string
    result?: 'pass' | 'pass_with_adjustment' | 'fail'
    remarks?: string
  }, ctx: { ip?: string; device?: string } = {}) {
    const asset = await this.assetFor(caller, assetId)
    const m = this.requireRole(caller, asset.companyId, 'recording calibration')

    if (!input.certificateNumber?.trim()) {
      throw new EquipmentError('validation', 'A certificate number is required.')
    }
    const at = new Date(input.calibratedAt)
    const until = new Date(input.expiresAt)
    if (Number.isNaN(at.getTime()) || Number.isNaN(until.getTime())) {
      throw new EquipmentError('validation', 'Those dates are not valid.')
    }
    if (until <= at) {
      throw new EquipmentError('validation', 'A certificate cannot expire before it was issued.')
    }
    if (at.getTime() > Date.now() + 86400_000) {
      throw new EquipmentError('validation', 'A calibration cannot be recorded before it has happened.')
    }

    const result = input.result ?? 'pass'

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.calibration.create({
        data: {
          assetId,
          calibratedAt: at,
          expiresAt: until,
          certificateNumber: input.certificateNumber.trim(),
          vendor: input.vendor?.trim() ?? '',
          result,
          remarks: input.remarks?.trim() || null,
          recordedBy: caller.name,
        },
      })
      // A failed calibration is a finding, not a record: the instrument is not fit and
      // leaving it in service would let the gate pass it on the certificate's dates.
      if (result === 'fail') {
        await tx.asset.update({
          where: { id: assetId },
          data: { status: 'out_of_service', version: { increment: 1 } },
        })
        await this.event(tx, assetId, 'status_change', 'Taken out of service: calibration failed.', {
          actor: caller.name, actorRole: m.role, refType: 'calibration', refId: row.id,
        })
      }
      await this.event(tx, assetId, 'calibration',
        `Calibrated, certificate ${row.certificateNumber}, valid to ${row.expiresAt.toISOString().slice(0, 10)}.`,
        {
          detail: [CALIBRATION_RESULT_TEXT[result], input.vendor?.trim(), input.remarks?.trim()]
            .filter(Boolean).join(' - ') || undefined,
          actor: caller.name, actorRole: m.role, refType: 'calibration', refId: row.id,
        })
      return row
    })

    await this.log(
      caller, asset.companyId,
      result === 'fail' ? 'Calibration failed — equipment taken out of service' : 'Calibration recorded',
      `${asset.code} ${asset.name}: ${created.certificateNumber}`, ctx,
    )
    return { ...created, expired: created.expiresAt < startOfToday(), daysToExpiry: daysUntil(created.expiresAt) }
  }

  // ── Fitness ────────────────────────────────────────────────────────────────

  /** One item's verdict, for the register and the equipment profile. */
  async fitness(caller: Caller, assetId: string): Promise<EquipmentFitness> {
    const asset = await this.assetFor(caller, assetId)
    return assessFitness(asset)
  }

  /**
   * Equipment that could be booked onto a permit, each with its verdict.
   *
   * Unfit items are returned rather than filtered out, for the same reason the permit's
   * people picker returns blocked workers: an issuer who cannot find the gas detector
   * assumes the system is wrong and takes it anyway.
   */
  async selectableFor(caller: Caller, permitId: string) {
    const permit = await this.db.permit.findUnique({
      where: { id: permitId },
      select: { id: true, companyId: true, siteId: true },
    })
    if (!permit) throw new EquipmentError('not_found', 'Permit not found.', 404)
    const m = this.membership(caller, permit.companyId)
    const siteScope = m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}

    const [assets, booked] = await Promise.all([
      this.db.asset.findMany({
        where: { companyId: permit.companyId, ...siteScope, status: { notIn: ['disposed', 'retired'] } },
        include: { calibrations: { orderBy: { expiresAt: 'desc' }, take: 5 } },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      this.db.permitEquipment.findMany({ where: { permitId }, select: { assetId: true } }),
    ])
    const already = new Set(booked.map((b) => b.assetId))

    return assets
      .map((a) => {
        const f = assessFitness(a)
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category,
          serialNumber: a.serialNumber,
          location: a.location,
          critical: a.critical,
          alreadyBooked: already.has(a.id),
          fit: f.fit,
          blockedReason: f.reason,
          calibrationExpiry: f.calibrationExpiry,
          inspectionDue: f.inspectionDue,
        }
      })
      .sort((x, y) => {
        const rank = (r: typeof x) => (r.alreadyBooked ? 2 : r.fit ? 0 : 1)
        return rank(x) - rank(y) || x.name.localeCompare(y.name)
      })
  }

  // ── Permit link ────────────────────────────────────────────────────────────

  async listForPermit(caller: Caller, permitId: string) {
    const permit = await this.db.permit.findUnique({
      where: { id: permitId },
      select: { companyId: true },
    })
    if (!permit) throw new EquipmentError('not_found', 'Permit not found.', 404)
    this.membership(caller, permit.companyId)

    const rows = await this.db.permitEquipment.findMany({
      where: { permitId },
      include: { asset: { include: { calibrations: { orderBy: { expiresAt: 'desc' }, take: 5 } } } },
      orderBy: { addedAt: 'asc' },
    })

    return rows.map((r) => {
      const f = assessFitness(r.asset)
      return {
        id: r.id,
        assetId: r.asset.id,
        code: r.asset.code,
        name: r.asset.name,
        category: r.asset.category,
        serialNumber: r.asset.serialNumber,
        critical: r.asset.critical,
        purpose: r.purpose,
        addedBy: r.addedBy,
        addedAt: r.addedAt,
        fit: f.fit,
        blockedReason: f.reason,
        calibrationExpiry: f.calibrationExpiry,
        certificateNumber: f.certificateNumber,
        inspectionDue: f.inspectionDue,
      }
    })
  }

  async addToPermit(caller: Caller, permitId: string, assetId: string, purpose: string | undefined, ctx: { ip?: string; device?: string } = {}) {
    const permit = await this.db.permit.findUnique({
      where: { id: permitId },
      select: { id: true, companyId: true, code: true, status: true },
    })
    if (!permit) throw new EquipmentError('not_found', 'Permit not found.', 404)
    const m = this.requireRole(caller, permit.companyId, 'booking equipment onto a permit')

    if (['closed', 'archived', 'rejected'].includes(permit.status)) {
      throw new EquipmentError('validation', 'This permit is closed.')
    }

    const asset = await this.db.asset.findFirst({
      where: { id: assetId, companyId: permit.companyId },
      include: { calibrations: { orderBy: { expiresAt: 'desc' }, take: 5 } },
    })
    if (!asset) throw new EquipmentError('validation', 'That equipment is not in this workspace.')

    // Booking unfit equipment is refused here as well as at activation. Letting it on and
    // failing later means the issuer discovers the problem with a crew already waiting.
    const f = assessFitness(asset)
    if (!f.fit) throw new EquipmentError('validation', f.reason!)

    const exists = await this.db.permitEquipment.findFirst({
      where: { permitId, assetId }, select: { id: true },
    })
    if (exists) throw new EquipmentError('validation', `${asset.code} is already on this permit.`)

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.permitEquipment.create({
        data: { permitId, assetId, purpose: purpose?.trim() ?? '', addedBy: caller.name },
      })
      await tx.permitEvent.create({
        data: {
          permitId,
          action: 'Equipment booked',
          detail: `${asset.code} ${asset.name}${purpose?.trim() ? ` — ${purpose.trim()}` : ''}`,
          actor: caller.name,
        },
      })
      // Both sides. The permit needs to show what was booked; the asset needs to show
      // where it has been, which is the question asked after it fails.
      await this.event(tx, assetId, 'permit', `Booked onto permit ${permit.code}.`, {
        detail: purpose?.trim() || undefined,
        actor: caller.name, actorRole: m.role, refType: 'permit', refId: permit.id,
      })
      return row
    })

    await this.log(caller, permit.companyId, 'Equipment booked onto permit', `${permit.code}: ${asset.code}`, ctx)
    return created
  }

  async removeFromPermit(caller: Caller, linkId: string, ctx: { ip?: string; device?: string } = {}) {
    const row = await this.db.permitEquipment.findUnique({
      where: { id: linkId },
      include: {
        permit: { select: { id: true, companyId: true, code: true, status: true } },
        asset: { select: { code: true, name: true } },
      },
    })
    if (!row) throw new EquipmentError('not_found', 'That equipment is not on this permit.', 404)
    this.requireRole(caller, row.permit.companyId, 'removing equipment from a permit')
    if (['closed', 'archived'].includes(row.permit.status)) {
      throw new EquipmentError('validation', 'This permit is closed.')
    }

    await this.db.$transaction(async (tx) => {
      await tx.permitEquipment.delete({ where: { id: linkId } })
      await tx.permitEvent.create({
        data: {
          permitId: row.permit.id,
          action: 'Equipment removed',
          detail: `${row.asset.code} ${row.asset.name}`,
          actor: caller.name,
        },
      })
    })

    await this.log(
      caller, row.permit.companyId, 'Equipment removed from permit',
      `${row.permit.code}: ${row.asset.code}`, ctx,
    )
  }

  /**
   * The permit activation gate for equipment.
   *
   * Called by the permit service before work starts. Returns a sentence per unfit item —
   * the whole point is that the issuer is told *which* item and *why*, not that something
   * unspecified is wrong.
   */

  // -- Timeline ---------------------------------------------------------------

  /**
   * Write one line of an asset's history.
   *
   * Takes a transaction client so the event and the row that caused it commit together.
   * A timeline written afterwards is a timeline that loses entries whenever the second
   * write fails, and this is the record an investigator reads after someone is hurt.
   */
  private event(
    tx: Pick<PrismaClient, 'assetEvent'>,
    assetId: string, kind: AssetEventKind, summary: string,
    opts: { detail?: string; actor: string; actorRole?: string; refType?: string; refId?: string },
  ) {
    return tx.assetEvent.create({
      data: {
        assetId, kind, summary,
        detail: opts.detail ?? null,
        actor: opts.actor, actorRole: opts.actorRole ?? '',
        refType: opts.refType ?? null, refId: opts.refId ?? null,
      },
    })
  }

  /** The whole history of one item, newest first. */
  async timeline(caller: Caller, assetId: string) {
    const asset = await this.assetFor(caller, assetId)
    const rows = await this.db.assetEvent.findMany({
      where: { assetId: asset.id },
      orderBy: { at: 'desc' },
      take: 200,
    })
    return rows.map((r) => ({
      id: r.id, kind: r.kind, summary: r.summary, detail: r.detail,
      actor: r.actor, actorRole: r.actorRole, at: r.at.toISOString(),
      refType: r.refType, refId: r.refId,
    }))
  }

  // -- Maintenance ------------------------------------------------------------

  async listWorkOrders(caller: Caller, assetId: string) {
    const asset = await this.assetFor(caller, assetId)
    const rows = await this.db.workOrder.findMany({
      where: { assetId: asset.id },
      orderBy: { raisedAt: 'desc' },
    })
    return rows.map((w) => this.workOrderView(w))
  }

  private workOrderView(w: {
    id: string; code: string; assetId: string; kind: string; priority: string
    description: string; assignedTo: string; dueAt: Date | null; startedAt: Date | null
    finishedAt: Date | null; downtimeMinutes: number; costSen: number; partsUsed: string
    status: string; raisedBy: string; raisedAt: Date; closedBy: string | null; closingNote: string | null
  }) {
    const open = w.status === 'open' || w.status === 'in_progress'
    return {
      ...w,
      dueAt: w.dueAt?.toISOString() ?? null,
      startedAt: w.startedAt?.toISOString() ?? null,
      finishedAt: w.finishedAt?.toISOString() ?? null,
      raisedAt: w.raisedAt.toISOString(),
      /** Derived, never stored: a stored flag needs a job and goes stale overnight. */
      overdue: open && !!w.dueAt && w.dueAt < startOfToday(),
      cost: w.costSen / 100,
    }
  }

  async raiseWorkOrder(caller: Caller, assetId: string, input: {
    kind: 'preventive' | 'corrective' | 'emergency'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    description: string
    assignedTo?: string
    dueAt?: string
    takeOutOfService?: boolean
  }, ctx: { ip?: string; device?: string } = {}) {
    const asset = await this.assetFor(caller, assetId)
    const m = this.requireRole(caller, asset.companyId, 'raising a work order')

    if (!input.description?.trim()) {
      throw new EquipmentError('validation', 'Describe what needs doing.')
    }
    let dueAt: Date | null = null
    if (input.dueAt) {
      dueAt = new Date(input.dueAt)
      if (Number.isNaN(dueAt.getTime())) throw new EquipmentError('validation', 'That due date is not valid.')
    }

    /*
     * Emergency work takes the item out of service without being asked, because the
     * alternative is an emergency work order raised at 2am on a machine that is still
     * showing as available to the next shift's permit desk.
     */
    const takeOut = input.takeOutOfService ?? input.kind === 'emergency'

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: asset.companyId, kind: 'workorder' } },
        update: { next: { increment: 1 } },
        create: { companyId: asset.companyId, kind: 'workorder', next: 3001 },
        select: { next: true },
      })
      const wo = await tx.workOrder.create({
        data: {
          code: `WO-${counter.next}`,
          assetId: asset.id,
          kind: input.kind,
          priority: input.priority ?? (input.kind === 'emergency' ? 'critical' : 'medium'),
          description: input.description.trim(),
          assignedTo: input.assignedTo?.trim() ?? '',
          dueAt,
          raisedBy: caller.name,
        },
      })
      if (takeOut && asset.status !== 'out_of_service') {
        await tx.asset.update({
          where: { id: asset.id },
          data: { status: 'under_maintenance', version: { increment: 1 } },
        })
        await this.event(tx, asset.id, 'status_change', 'Taken out of service for maintenance.', {
          actor: caller.name, actorRole: m.role, refType: 'workOrder', refId: wo.id,
        })
      }
      await this.event(tx, asset.id, 'maintenance', `${wo.code} raised: ${wo.description}`, {
        detail: `${input.kind} work, ${wo.priority} priority`,
        actor: caller.name, actorRole: m.role, refType: 'workOrder', refId: wo.id,
      })
      return wo
    })

    await this.log(caller, asset.companyId, 'Work order raised',
      `${asset.code} ${asset.name}: ${created.code}`, ctx)
    return this.workOrderView(created)
  }

  async updateWorkOrder(caller: Caller, workOrderId: string, input: {
    status?: 'open' | 'in_progress' | 'completed' | 'cancelled'
    assignedTo?: string
    priority?: 'low' | 'medium' | 'high' | 'critical'
    downtimeMinutes?: number
    cost?: number
    partsUsed?: string
    closingNote?: string
    returnToService?: boolean
  }, ctx: { ip?: string; device?: string } = {}) {
    const wo = await this.db.workOrder.findUnique({
      where: { id: workOrderId },
      include: { asset: true },
    })
    if (!wo) throw new EquipmentError('not_found', 'Work order not found.', 404)
    const m = this.requireRole(caller, wo.asset.companyId, 'updating a work order')

    if (wo.status === 'completed' || wo.status === 'cancelled') {
      // Same rule as a completed inspection: the record of what was done is evidence.
      throw new EquipmentError('validation', `${wo.code} is already ${wo.status} and cannot be edited.`)
    }
    if (input.downtimeMinutes !== undefined && input.downtimeMinutes < 0) {
      throw new EquipmentError('validation', 'Downtime cannot be negative.')
    }
    if (input.cost !== undefined && input.cost < 0) {
      throw new EquipmentError('validation', 'Cost cannot be negative.')
    }

    const next = input.status ?? wo.status
    const finishing = next === 'completed' || next === 'cancelled'
    if (next === 'completed' && !input.closingNote?.trim()) {
      throw new EquipmentError('validation', 'Say what was done before closing the work order.')
    }

    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.workOrder.update({
        where: { id: wo.id },
        data: {
          status: next,
          assignedTo: input.assignedTo?.trim() ?? undefined,
          priority: input.priority ?? undefined,
          downtimeMinutes: input.downtimeMinutes ?? undefined,
          costSen: input.cost === undefined ? undefined : Math.round(input.cost * 100),
          partsUsed: input.partsUsed?.trim() ?? undefined,
          closingNote: input.closingNote?.trim() ?? undefined,
          startedAt: next === 'in_progress' && !wo.startedAt ? new Date() : undefined,
          finishedAt: finishing ? new Date() : undefined,
          closedBy: finishing ? caller.name : undefined,
        },
      })

      /*
       * Returning to service is a decision, not a consequence of closing the job. A work
       * order can be completed and the item still be unfit - the part was ordered, not
       * fitted - so the caller says so explicitly and it is recorded as its own event.
       */
      if (finishing && input.returnToService && wo.asset.status === 'under_maintenance') {
        await tx.asset.update({
          where: { id: wo.assetId },
          data: { status: 'in_service', version: { increment: 1 } },
        })
        await this.event(tx, wo.assetId, 'status_change', 'Returned to service after maintenance.', {
          actor: caller.name, actorRole: m.role, refType: 'workOrder', refId: wo.id,
        })
      }

      await this.event(tx, wo.assetId, 'maintenance',
        `${wo.code} ${MAINTENANCE_STATUS_TEXT[next] ?? next}.`,
        {
          detail: input.closingNote?.trim() || undefined,
          actor: caller.name, actorRole: m.role, refType: 'workOrder', refId: wo.id,
        })
      return row
    })

    await this.log(caller, wo.asset.companyId, `Work order ${next}`,
      `${wo.asset.code} ${wo.asset.name}: ${wo.code}`, ctx)
    return this.workOrderView(updated)
  }

  // -- Incident link ----------------------------------------------------------

  async listForIncident(caller: Caller, incidentId: string) {
    const incident = await this.db.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, companyId: true },
    })
    if (!incident) throw new EquipmentError('not_found', 'Incident not found.', 404)
    this.membership(caller, incident.companyId)

    const rows = await this.db.incidentEquipment.findMany({
      where: { incidentId: incident.id },
      include: { asset: { include: { calibrations: { orderBy: { expiresAt: 'desc' }, take: 5 } } } },
      orderBy: { addedAt: 'asc' },
    })
    return rows.map((r) => {
      const f = assessFitness(r.asset)
      return {
        id: r.id, assetId: r.assetId, code: r.asset.code, name: r.asset.name,
        category: r.asset.category, serialNumber: r.asset.serialNumber,
        critical: r.asset.critical, status: r.asset.status,
        involvement: r.involvement, addedBy: r.addedBy, addedAt: r.addedAt.toISOString(),
        fit: f.fit, blockedReason: f.reason,
      }
    })
  }

  async linkToIncident(caller: Caller, incidentId: string, assetId: string, involvement: string | undefined,
    ctx: { ip?: string; device?: string } = {}) {
    const incident = await this.db.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, companyId: true, number: true, stage: true },
    })
    if (!incident) throw new EquipmentError('not_found', 'Incident not found.', 404)
    const m = this.requireRole(caller, incident.companyId, 'linking equipment to an incident')

    const asset = await this.db.asset.findUnique({ where: { id: assetId } })
    if (!asset) throw new EquipmentError('not_found', 'Equipment not found.', 404)
    if (asset.companyId !== incident.companyId) {
      throw new EquipmentError('validation', 'That equipment is not in this workspace.')
    }

    const existing = await this.db.incidentEquipment.findFirst({
      where: { incidentId: incident.id, assetId },
      select: { id: true },
    })
    if (existing) throw new EquipmentError('validation', `${asset.code} is already on this incident.`)

    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.incidentEquipment.create({
        data: {
          incidentId: incident.id, assetId,
          involvement: involvement?.trim() ?? '',
          addedBy: caller.name,
        },
      })
      // Written to the asset's timeline, not only the incident's: the question worth
      // answering later is "what has gone wrong with this item", and that is asked
      // from the equipment side.
      await this.event(tx, assetId, 'incident', `Involved in incident ${incident.number}.`, {
        detail: involvement?.trim() || undefined,
        actor: caller.name, actorRole: m.role, refType: 'incident', refId: incident.id,
      })
      return row
    })

    await this.log(caller, incident.companyId, 'Equipment linked to incident',
      `${incident.number}: ${asset.code} ${asset.name}`, ctx)
    return { id: created.id }
  }

  async unlinkFromIncident(caller: Caller, linkId: string, ctx: { ip?: string; device?: string } = {}) {
    const link = await this.db.incidentEquipment.findUnique({
      where: { id: linkId },
      include: { asset: true, incident: { select: { id: true, number: true, companyId: true } } },
    })
    if (!link) throw new EquipmentError('not_found', 'That link no longer exists.', 404)
    const m = this.requireRole(caller, link.incident.companyId, 'removing equipment from an incident')

    await this.db.$transaction(async (tx) => {
      await tx.incidentEquipment.delete({ where: { id: linkId } })
      await this.event(tx, link.assetId, 'incident',
        `Removed from incident ${link.incident.number}.`,
        { actor: caller.name, actorRole: m.role, refType: 'incident', refId: link.incident.id })
    })

    await this.log(caller, link.incident.companyId, 'Equipment unlinked from incident',
      `${link.incident.number}: ${link.asset.code}`, ctx)
  }

  /** Incidents this item has been involved in. Shown on the equipment profile. */
  async incidentsFor(caller: Caller, assetId: string) {
    const asset = await this.assetFor(caller, assetId)
    const rows = await this.db.incidentEquipment.findMany({
      where: { assetId: asset.id },
      include: {
        incident: {
          select: { id: true, number: true, title: true, severity: true, stage: true, occurredAt: true },
        },
      },
      orderBy: { addedAt: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      involvement: r.involvement,
      incidentId: r.incident.id,
      number: r.incident.number,
      title: r.incident.title,
      severity: r.incident.severity,
      stage: r.incident.stage,
      occurredAt: r.incident.occurredAt.toISOString(),
    }))
  }


  // -- Dashboard --------------------------------------------------------------

  /**
   * The equipment board.
   *
   * Every number is counted in Postgres against the same scope, in one transaction, so the
   * tiles cannot disagree with each other or with the register they link to. The two "due"
   * counts are date comparisons rather than stored statuses, for the reason given on
   * AssetStatus: a stored due flag needs a job to stay true, and any window where that job
   * has not run reports an overdue gas detector as fit for use.
   */
  async dashboard(caller: Caller, companyId: string, siteId?: string | null) {
    this.membership(caller, companyId)

    const today = startOfToday()
    const tomorrow = new Date(today.getTime() + 86400_000)
    const soon = new Date(today.getTime() + DUE_WARN_DAYS * 86400_000)

    const scope = { companyId, ...(siteId ? { siteId } : {}) }
    // Disposed and retired equipment is out of the register's numbers entirely: counting a
    // scrapped item as "available" or as "out of service" are both wrong.
    const live = { ...scope, status: { notIn: OUT_OF_REGISTER } }

    const [
      total, critical, outOfService, underMaintenance,
      inspectionDueToday, inspectionOverdue,
      breakdown,
    ] = await this.db.$transaction([
      this.db.asset.count({ where: live }),
      this.db.asset.count({ where: { ...live, critical: true } }),
      this.db.asset.count({ where: { ...scope, status: 'out_of_service' } }),
      this.db.asset.count({ where: { ...scope, status: 'under_maintenance' } }),
      this.db.asset.count({ where: { ...live, nextDueDate: { gte: today, lt: tomorrow } } }),
      this.db.asset.count({ where: { ...live, nextDueDate: { lt: today } } }),
      // Two columns for every live asset, tallied below. groupBy would push the counting
      // into Postgres, but the register is small and this keeps both breakdowns on exactly
      // the same rows as the tiles above - they are read in the same transaction.
      this.db.asset.findMany({ where: live, select: { category: true, siteId: true } }),
    ])

    const tally = (pick: (r: { category: string; siteId: string }) => string) => {
      const m = new Map<string, number>()
      for (const r of breakdown) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1)
      return [...m.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
    }

    const [calibrationDue, calibrationExpired, maintenanceOpen, maintenanceOverdue] = await Promise.all([
      this.countCalibrations(scope, today, soon),
      this.countCalibrations(scope, null, today),
      this.db.workOrder.count({
        where: { asset: scope, status: { in: ['open', 'in_progress'] } },
      }),
      this.db.workOrder.count({
        where: { asset: scope, status: { in: ['open', 'in_progress'] }, dueAt: { lt: today } },
      }),
    ])

    const [recentInspections, recentMaintenance, sites] = await Promise.all([
      this.db.inspection.findMany({
        where: { ...scope, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true, code: true, outcome: true, completedAt: true, completedBy: true,
          asset: { select: { code: true, name: true } },
        },
      }),
      this.db.workOrder.findMany({
        where: { asset: scope },
        orderBy: { raisedAt: 'desc' },
        take: 5,
        select: {
          id: true, code: true, kind: true, status: true, raisedAt: true, description: true,
          asset: { select: { code: true, name: true } },
        },
      }),
      this.db.site.findMany({ where: { companyId }, select: { id: true, name: true } }),
    ])

    const siteName = new Map(sites.map((s) => [s.id, s.name]))

    return {
      total,
      critical,
      outOfService,
      underMaintenance,
      inspectionDueToday,
      inspectionOverdue,
      calibrationDue,
      calibrationExpired,
      maintenanceOpen,
      maintenanceOverdue,
      /** Available = in service and nothing overdue. The number an issuer can actually use. */
      available: Math.max(0, total - outOfService - underMaintenance - inspectionOverdue),
      byCategory: tally((r) => r.category),
      bySite: tally((r) => siteName.get(r.siteId) ?? r.siteId),
      recentInspections: recentInspections.map((i) => ({
        id: i.id, code: i.code, outcome: i.outcome,
        at: i.completedAt?.toISOString() ?? null, by: i.completedBy,
        assetCode: i.asset.code, assetName: i.asset.name,
      })),
      recentMaintenance: recentMaintenance.map((w) => ({
        id: w.id, code: w.code, kind: w.kind, status: w.status,
        at: w.raisedAt.toISOString(), description: w.description,
        assetCode: w.asset.code, assetName: w.asset.name,
      })),
    }
  }

  /**
   * Assets whose newest certificate expires inside a window.
   *
   * Newest, not any: an instrument with a lapsed 2024 certificate and a current 2026 one is
   * calibrated. Counting rows in Calibration would report it as overdue forever.
   */
  private async countCalibrations(
    scope: { companyId: string; siteId?: string },
    from: Date | null, to: Date,
  ) {
    const assets = await this.db.asset.findMany({
      where: {
        ...scope,
        status: { notIn: OUT_OF_REGISTER },
        OR: [
          { requiresCalibration: true },
          { category: { in: CALIBRATED_CATEGORIES } },
        ],
      },
      select: { id: true, calibrations: { orderBy: { expiresAt: 'desc' }, take: 1 } },
    })
    return assets.filter((a) => {
      const latest = a.calibrations[0]
      // No certificate at all counts as expired, never as "due soon" - it is already unfit.
      if (!latest) return from === null
      if (from === null) return latest.expiresAt < to
      return latest.expiresAt >= from && latest.expiresAt < to
    }).length
  }

  activationBlockers(permitId: string): Promise<string[]> {
    return equipmentBlockers(this.db, permitId)
  }
}
