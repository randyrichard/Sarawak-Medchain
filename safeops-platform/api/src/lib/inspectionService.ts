import type { AssetCategory, Prisma, PrismaClient, Role } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller } from './incidentService.js'
import {
  ASSET_CATEGORIES, CATEGORY_LABEL, CHECKLISTS, DEFECT_DUE_DAYS, FREQUENCY_DAYS,
} from './inspectionCatalog.js'

/** Roles permitted to register assets and schedule inspections. */
const MANAGE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']

export class InspectionError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message)
  }
}

const DAY = 86400_000

/**
 * A due date is a calendar date, not an instant, so it is pinned to UTC midnight.
 *
 * Local midnight would be wrong here: the server runs in UTC+8, where local midnight on
 * the 4th is 16:00 UTC on the 3rd. Every client renders a due date as the first ten
 * characters of the ISO string, so the whole register would show dates a day early.
 * Pinning to UTC means the value round-trips through `toISOString().slice(0, 10)`
 * unchanged, which is what the date actually means.
 */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Whole days from today until a date. Same-day is 0, yesterday is -1. */
function daysUntil(d: Date): number {
  return Math.round((utcMidnight(d).getTime() - utcMidnight(new Date()).getTime()) / DAY)
}

function addDays(days: number): Date {
  return utcMidnight(new Date(Date.now() + days * DAY))
}

export interface ChecklistAnswer {
  itemId: string
  label: string
  result: 'pass' | 'fail' | 'na'
  comment?: string
  measurement?: string
}

const assetInclude = {
  documents: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AssetInclude

type AssetRow = Prisma.AssetGetPayload<{ include: typeof assetInclude }>

export type AssetView = AssetRow & {
  /** 0–100. Falls with overdue inspections, open defects and a failed last check. */
  health: number
  risk: 'Low' | 'Medium' | 'High'
  openDefects: number
  overdue: boolean
  daysToDue: number
  lastOutcome?: 'passed' | 'failed'
  /** Why the score is what it is — a bare number nobody can audit is not a score. */
  healthFactors: { label: string; delta: number }[]
  categoryLabel: string
}

export interface AssetFilters {
  companyId: string
  page: number
  pageSize: number
  q?: string
  siteId?: string
  category?: AssetCategory
  status?: string
  bucket?: 'all' | 'overdue' | 'due_week' | 'high_risk' | 'defects'
}

export interface InspectionFilters {
  companyId: string
  page: number
  pageSize: number
  q?: string
  siteId?: string
  status?: 'all' | 'scheduled' | 'overdue' | 'completed' | 'failed'
}

export class InspectionService {
  constructor(private db: PrismaClient) {}

  // ── Authorisation ──────────────────────────────────────────────────────────

  private membership(caller: Caller, companyId: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new InspectionError('forbidden', 'You do not have access to this workspace.', 403)
    return m
  }

  private requireManager(caller: Caller, companyId: string, what: string) {
    const m = this.membership(caller, companyId)
    if (!MANAGE_ROLES.includes(m.role)) {
      throw new InspectionError('forbidden', `Only Safety Officers and above can ${what}.`, 403)
    }
    return m
  }

  /** Loads an asset and proves the caller belongs to its tenant. */
  private async loadAsset(caller: Caller, id: string) {
    const asset = await this.db.asset.findUnique({ where: { id }, include: assetInclude })
    if (!asset) throw new InspectionError('not_found', 'Asset not found.', 404)
    this.membership(caller, asset.companyId)
    return asset
  }

  // ── Health scoring ─────────────────────────────────────────────────────────

  /**
   * Asset health.
   *
   * Deliberately a small number of blunt, explainable penalties rather than a weighted
   * model: the score exists so a supervisor can see which asset to deal with first, and
   * a score nobody can reconstruct from the factors is not one anyone will act on.
   */
  private score(
    asset: AssetRow,
    openDefects: number,
    lastOutcome: 'passed' | 'failed' | undefined,
  ): Pick<AssetView, 'health' | 'risk' | 'overdue' | 'daysToDue' | 'healthFactors'> {
    const daysToDue = daysUntil(asset.nextDueDate)
    const active = asset.status !== 'retired'
    const overdue = active && daysToDue < 0

    const healthFactors: { label: string; delta: number }[] = []
    let health = 100

    if (overdue) {
      const penalty = Math.min(30, 10 + Math.abs(daysToDue) * 2)
      health -= penalty
      healthFactors.push({ label: `Inspection ${Math.abs(daysToDue)}d overdue`, delta: -penalty })
    }
    if (openDefects > 0) {
      const penalty = Math.min(30, openDefects * 15)
      health -= penalty
      healthFactors.push({ label: `${openDefects} open defect(s)`, delta: -penalty })
    }
    if (lastOutcome === 'failed') {
      health -= 15
      healthFactors.push({ label: 'Last inspection failed', delta: -15 })
    }
    if (asset.status === 'under_maintenance') {
      health -= 10
      healthFactors.push({ label: 'Under maintenance', delta: -10 })
    }
    if (asset.status === 'out_of_service') {
      health -= 40
      healthFactors.push({ label: 'Out of service', delta: -40 })
    }

    health = Math.max(5, Math.min(100, health))
    return {
      health,
      risk: health >= 80 ? 'Low' : health >= 60 ? 'Medium' : 'High',
      overdue,
      daysToDue,
      healthFactors,
    }
  }

  /**
   * Open defect counts and last outcome for a set of assets, in two queries rather than
   * two per asset. The register renders every row's health, so the per-row version turns
   * one page into a hundred round trips.
   */
  private async healthInputs(assetIds: string[]) {
    if (assetIds.length === 0) {
      return { defects: new Map<string, number>(), outcomes: new Map<string, 'passed' | 'failed'>() }
    }

    const [defectRows, completed] = await this.db.$transaction([
      this.db.correctiveAction.groupBy({
        by: ['assetId'],
        where: { assetId: { in: assetIds }, status: { notIn: ['verified', 'cancelled'] } },
        _count: { _all: true },
        orderBy: undefined,
      }),
      this.db.inspection.findMany({
        where: { assetId: { in: assetIds }, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        select: { assetId: true, outcome: true, completedAt: true },
      }),
    ])

    const defects = new Map(
      (defectRows as unknown as { assetId: string | null; _count?: { _all: number } }[])
        .filter((r) => r.assetId)
        .map((r) => [r.assetId as string, r._count?._all ?? 0] as const),
    )
    // Ordered newest first, so the first row seen per asset is the latest.
    const outcomes = new Map<string, 'passed' | 'failed'>()
    for (const row of completed) {
      if (!outcomes.has(row.assetId) && row.outcome) {
        outcomes.set(row.assetId, row.outcome)
      }
    }
    return { defects, outcomes }
  }

  private toAssetView(
    asset: AssetRow,
    defects: Map<string, number>,
    outcomes: Map<string, 'passed' | 'failed'>,
  ): AssetView {
    const openDefects = defects.get(asset.id) ?? 0
    const lastOutcome = outcomes.get(asset.id)
    return {
      ...asset,
      ...this.score(asset, openDefects, lastOutcome),
      openDefects,
      lastOutcome,
      categoryLabel: CATEGORY_LABEL[asset.category],
    }
  }

  // ── Assets ─────────────────────────────────────────────────────────────────

  async listAssets(caller: Caller, f: AssetFilters) {
    this.membership(caller, f.companyId)
    const q = f.q?.trim()

    const where: Prisma.AssetWhereInput = {
      companyId: f.companyId,
      ...(f.siteId ? { siteId: f.siteId } : {}),
      ...(f.category ? { category: f.category } : {}),
      ...(f.status ? { status: f.status as never } : {}),
      // Time-based buckets are expressed in SQL; risk and defect buckets depend on the
      // derived score and are applied after mapping.
      ...(f.bucket === 'overdue'
        ? { nextDueDate: { lt: addDays(0) }, status: { not: 'retired' } }
        : {}),
      ...(f.bucket === 'due_week'
        ? { nextDueDate: { gte: addDays(0), lte: addDays(7) }, status: { not: 'retired' } }
        : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { serialNumber: { contains: q, mode: 'insensitive' } },
              { owner: { contains: q, mode: 'insensitive' } },
              { department: { contains: q, mode: 'insensitive' } },
              { location: { contains: q, mode: 'insensitive' } },
              { manufacturer: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, rows] = await this.db.$transaction([
      this.db.asset.count({ where }),
      this.db.asset.findMany({
        where,
        include: assetInclude,
        // Soonest due first, so a page boundary keeps the assets that need attention.
        orderBy: [{ nextDueDate: 'asc' }, { code: 'asc' }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ])

    const { defects, outcomes } = await this.healthInputs(rows.map((r) => r.id))
    let views = rows.map((r) => this.toAssetView(r, defects, outcomes))

    if (f.bucket === 'high_risk') views = views.filter((v) => v.risk === 'High')
    if (f.bucket === 'defects') views = views.filter((v) => v.openDefects > 0)

    // Worst health first — the register is a queue, not a catalogue.
    views.sort(
      (a, b) => a.health - b.health || a.nextDueDate.getTime() - b.nextDueDate.getTime(),
    )

    return {
      rows: views,
      page: f.page,
      pageSize: f.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    }
  }

  /**
   * Asset profile by id, QR payload or printed code.
   *
   * The QR path is the one people actually use: a phone camera on a label in the field.
   * A stale label must resolve to a clear "not found" rather than silently matching
   * something else, so all three lookups are exact and scoped to the caller's tenants.
   */
  async getAssetProfile(caller: Caller, idOrQr: string) {
    const companyIds = caller.roles.map((r) => r.companyId)
    if (companyIds.length === 0) {
      throw new InspectionError('forbidden', 'You do not have access to this workspace.', 403)
    }

    const asset = await this.db.asset.findFirst({
      where: {
        companyId: { in: companyIds },
        OR: [{ id: idOrQr }, { qrKey: idOrQr }, { code: idOrQr }],
      },
      include: assetInclude,
    })
    if (!asset) {
      throw new InspectionError('not_found', 'Asset not found — the QR label may be stale.', 404)
    }

    const [inspections, openActions] = await this.db.$transaction([
      this.db.inspection.findMany({
        where: { assetId: asset.id },
        include: { actions: { select: { code: true } } },
        orderBy: [{ scheduledFor: 'desc' }],
      }),
      this.db.correctiveAction.findMany({
        where: { assetId: asset.id, status: { notIn: ['verified', 'cancelled'] } },
        orderBy: { dueDate: 'asc' },
      }),
    ])

    const { defects, outcomes } = await this.healthInputs([asset.id])
    return {
      asset: this.toAssetView(asset, defects, outcomes),
      inspections: inspections.map((i) => this.toInspectionView(i, asset)),
      openActions,
    }
  }

  /**
   * Registers an asset and books its first inspection in the same transaction.
   *
   * The schedule is not optional. An asset registered without one is an asset nobody is
   * ever prompted to check, which is worse than not recording it at all.
   */
  async createAsset(caller: Caller, input: {
    companyId: string
    siteId: string
    name: string
    category: AssetCategory
    customCategory?: string
    serialNumber: string
    manufacturer?: string
    model?: string
    department?: string
    owner: string
    location?: string
    frequency: keyof typeof FREQUENCY_DAYS
    commissionDate?: string
    warrantyUntil?: string
    purchaseDate?: string
    /// Safety-critical: failure of this item hurts someone directly.
    critical?: boolean
    requiresCalibration?: boolean
    notes?: string
    /// Who holds it from the outset. At most one; the service refuses both.
    assignedEmployeeId?: string
    assignedContractorWorkerId?: string
  }) {
    const m = this.requireManager(caller, input.companyId, 'register assets')

    if (!input.name?.trim() || !input.serialNumber?.trim() || !input.siteId || !input.owner?.trim()) {
      throw new InspectionError('validation', 'Name, serial number, site and owner are required.')
    }
    if (!ASSET_CATEGORIES.includes(input.category)) {
      throw new InspectionError('validation', 'Unknown asset category.')
    }
    // Refused at creation as well as on edit: equipment is held by one person, and a record
    // created with two holders would be a state the edit path will not let you fix.
    if (input.assignedEmployeeId && input.assignedContractorWorkerId) {
      throw new InspectionError(
        'validation',
        'Equipment is held by one person. Assign it to an employee or a contractor worker, not both.',
      )
    }

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new InspectionError('validation', 'Unknown site for this workspace.')

    const nextDueDate = addDays(FREQUENCY_DAYS[input.frequency])

    const assetId = await this.db.$transaction(async (tx) => {
      const assetCounter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'asset' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'asset', next: 1101 },
        select: { next: true },
      })
      const code = `AST-${assetCounter.next}`

      const asset = await tx.asset.create({
        data: {
          code,
          qrKey: code,
          companyId: input.companyId,
          siteId: input.siteId,
          name: input.name.trim(),
          category: input.category,
          customCategory: input.customCategory?.trim() || null,
          serialNumber: input.serialNumber.trim(),
          manufacturer: input.manufacturer?.trim() ?? '',
          model: input.model?.trim() ?? '',
          department: input.department?.trim() ?? '',
          owner: input.owner.trim(),
          location: input.location?.trim() ?? '',
          frequency: input.frequency,
          commissionDate: input.commissionDate ? new Date(input.commissionDate) : null,
          warrantyUntil: input.warrantyUntil ? new Date(input.warrantyUntil) : null,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
          critical: input.critical ?? false,
          requiresCalibration: input.requiresCalibration ?? false,
          notes: input.notes?.trim() || null,
          assignedEmployeeId: input.assignedEmployeeId ?? null,
          assignedContractorWorkerId: input.assignedContractorWorkerId ?? null,
          nextDueDate,
          createdBy: caller.name,
        },
        select: { id: true },
      })

      const insCounter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'inspection' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'inspection', next: 2080 },
        select: { next: true },
      })
      await tx.inspection.create({
        data: {
          code: `INS-${insCounter.next}`,
          assetId: asset.id,
          companyId: input.companyId,
          siteId: input.siteId,
          scheduledFor: nextDueDate,
          assignedTo: input.owner.trim(),
        },
      })

      // The first line of the item's history, written where it is created so a register
      // entry can never exist without one.
      await tx.assetEvent.create({
        data: {
          assetId: asset.id, kind: 'created',
          summary: `Registered as ${code}, ${input.category.replace(/_/g, ' ')}.`,
          detail: [
            `Serial ${input.serialNumber.trim()}`,
            `owner ${input.owner.trim()}`,
            input.critical ? 'safety-critical' : null,
          ].filter(Boolean).join(', '),
          actor: caller.name, actorRole: m.role,
        },
      })

      // Equipment issued at registration gets its own assignment line, the same as one
      // handed over later. Who was holding it is asked from the timeline, and an item
      // issued on day one would otherwise appear to have never been given to anybody.
      if (input.assignedEmployeeId || input.assignedContractorWorkerId) {
        const holder = input.assignedEmployeeId
          ? await tx.employee.findUnique({
              where: { id: input.assignedEmployeeId }, select: { name: true },
            })
          : await tx.contractorWorker.findUnique({
              where: { id: input.assignedContractorWorkerId! }, select: { name: true },
            })
        await tx.assetEvent.create({
          data: {
            assetId: asset.id, kind: 'assigned',
            summary: `Assigned to ${holder?.name ?? 'a worker'}.`,
            actor: caller.name, actorRole: m.role,
          },
        })
      }

      return asset.id
    })

    const asset = await this.loadAsset(caller, assetId)
    const { defects, outcomes } = await this.healthInputs([assetId])
    return this.toAssetView(asset, defects, outcomes)
  }

  // ── Inspections ────────────────────────────────────────────────────────────

  private toInspectionView(
    i: Prisma.InspectionGetPayload<{ include: { actions: { select: { code: true } } } }>,
    asset: Pick<AssetRow, 'name' | 'code' | 'category' | 'department'>,
  ) {
    const daysToDue = daysUntil(i.scheduledFor)
    return {
      ...i,
      assetName: asset.name,
      assetCode: asset.code,
      category: asset.category,
      categoryLabel: CATEGORY_LABEL[asset.category],
      department: asset.department,
      overdue: i.status === 'scheduled' && daysToDue < 0,
      daysToDue,
      actionCodes: i.actions.map((a) => a.code),
    }
  }

  /**
   * Books or re-books an inspection.
   *
   * An asset carries at most one outstanding booking: re-scheduling moves the existing
   * one rather than adding a second, because two open bookings for the same asset is how
   * one gets done and the other quietly goes overdue forever.
   */
  async scheduleInspection(caller: Caller, assetId: string, date: string, inspector: string) {
    const asset = await this.loadAsset(caller, assetId)
    this.requireManager(caller, asset.companyId, 'schedule inspections')

    if (!date?.trim() || !inspector?.trim()) {
      throw new InspectionError('validation', 'Date and inspector are required.')
    }
    const parsed = new Date(date)
    if (Number.isNaN(parsed.getTime())) {
      throw new InspectionError('validation', 'A valid inspection date is required.')
    }
    // Normalised for the same reason as nextDueDate — a booking is a calendar date.
    const when = utcMidnight(parsed)

    const inspectionId = await this.db.$transaction(async (tx) => {
      const existing = await tx.inspection.findFirst({
        where: { assetId: asset.id, status: 'scheduled' },
        orderBy: { scheduledFor: 'asc' },
        select: { id: true },
      })

      const id = existing
        ? (await tx.inspection.update({
            where: { id: existing.id },
            data: { scheduledFor: when, assignedTo: inspector.trim() },
            select: { id: true },
          })).id
        : await (async () => {
            const counter = await tx.counter.upsert({
              where: { companyId_kind: { companyId: asset.companyId, kind: 'inspection' } },
              update: { next: { increment: 1 } },
              create: { companyId: asset.companyId, kind: 'inspection', next: 2080 },
              select: { next: true },
            })
            const created = await tx.inspection.create({
              data: {
                code: `INS-${counter.next}`,
                assetId: asset.id,
                companyId: asset.companyId,
                siteId: asset.siteId,
                scheduledFor: when,
                assignedTo: inspector.trim(),
              },
              select: { id: true },
            })
            return created.id
          })()

      // The asset's due date follows the booking, whichever branch made it.
      await tx.asset.update({
        where: { id: asset.id },
        data: { nextDueDate: when, version: { increment: 1 } },
      })
      return id
    })

    const full = await this.db.inspection.findUniqueOrThrow({
      where: { id: inspectionId },
      include: { actions: { select: { code: true } } },
    })
    return this.toInspectionView(full, asset)
  }

  /**
   * Completes an inspection.
   *
   * Three rules make this a record rather than a formality: every checklist item must be
   * answered against the template the server holds, every failure must say what is wrong,
   * and the result must be signed. A failure then becomes a corrective action with an
   * owner and a date, in the same transaction — a defect that depends on someone
   * remembering to raise it separately is a defect that stays on the plant.
   */
  async completeInspection(caller: Caller, inspectionId: string, input: {
    answers: ChecklistAnswer[]
    comments?: string
    photoCount?: number
    gps?: string
    signature: string
  }) {
    const inspection = await this.db.inspection.findUnique({
      where: { id: inspectionId },
      include: { asset: true },
    })
    if (!inspection) throw new InspectionError('not_found', 'Inspection not found.', 404)
    const m = this.membership(caller, inspection.companyId)

    if (inspection.status !== 'scheduled') {
      throw new InspectionError('validation', 'This inspection is already completed.')
    }
    if (inspection.assignedTo !== caller.name && !MANAGE_ROLES.includes(m.role)) {
      throw new InspectionError(
        'forbidden',
        'Only the assigned inspector (or a Safety Officer and above) can complete this inspection.',
        403,
      )
    }

    const asset = inspection.asset
    const template = CHECKLISTS[asset.category]
    const answers = input.answers ?? []

    // Checked against the server's template, not just counted: a client that renames or
    // invents items would otherwise record an inspection of a checklist nobody wrote.
    const answered = new Set(answers.map((a) => a.itemId))
    if (
      answers.length !== template.length ||
      template.some((t) => !answered.has(t.id)) ||
      answers.some((a) => !['pass', 'fail', 'na'].includes(a.result))
    ) {
      throw new InspectionError('validation', 'Every checklist item needs a Pass, Fail or N/A answer.')
    }

    const fails = answers.filter((a) => a.result === 'fail')
    if (fails.some((f) => !f.comment?.trim())) {
      throw new InspectionError('validation', 'Each failed item needs a comment describing the defect.')
    }
    if (!input.signature?.trim()) {
      throw new InspectionError('validation', 'A digital signature is required.')
    }

    const now = new Date()
    const outcome = fails.length > 0 ? 'failed' : 'passed'
    const nextDueDate = addDays(FREQUENCY_DAYS[asset.frequency])
    const dueDate = addDays(DEFECT_DUE_DAYS)

    await this.db.$transaction(async (tx) => {
      await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: 'completed',
          completedAt: now,
          completedBy: caller.name,
          outcome,
          // Labels come from the server template, so a relabelled client answer cannot
          // rewrite what the checklist said was checked.
          answers: answers.map((a) => ({
            itemId: a.itemId,
            label: template.find((t) => t.id === a.itemId)?.label ?? a.label,
            result: a.result,
            comment: a.comment?.trim() || undefined,
            measurement: a.measurement?.trim() || undefined,
          })) as never,
          comments: input.comments?.trim() || null,
          photoCount: input.photoCount ?? 0,
          gps: input.gps ?? null,
          signature: input.signature.trim(),
        },
      })

      for (const fail of fails) {
        const counter = await tx.counter.upsert({
          where: { companyId_kind: { companyId: asset.companyId, kind: 'capa' } },
          update: { next: { increment: 1 } },
          create: { companyId: asset.companyId, kind: 'capa', next: 401 },
          select: { next: true },
        })
        const label = template.find((t) => t.id === fail.itemId)?.label ?? fail.label
        await tx.correctiveAction.create({
          data: {
            code: `CA-${counter.next}`,
            source: 'inspection',
            companyId: asset.companyId,
            siteId: asset.siteId,
            assetId: asset.id,
            inspectionId: inspection.id,
            title: `Defect: ${label} — ${asset.name}`,
            detail: fail.comment?.trim() ?? '',
            owner: asset.owner,
            dueDate,
            priority: 'High',
            createdBy: caller.name,
          },
        })
      }

      // Roll the schedule forward so the asset cannot fall off the calendar by being
      // inspected, and book the next check in the same breath.
      await tx.asset.update({
        where: { id: asset.id },
        data: { lastInspectedAt: now, nextDueDate, version: { increment: 1 } },
      })

      const insCounter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: asset.companyId, kind: 'inspection' } },
        update: { next: { increment: 1 } },
        create: { companyId: asset.companyId, kind: 'inspection', next: 2080 },
        select: { next: true },
      })
      await tx.inspection.create({
        data: {
          code: `INS-${insCounter.next}`,
          assetId: asset.id,
          companyId: asset.companyId,
          siteId: asset.siteId,
          scheduledFor: nextDueDate,
          assignedTo: inspection.assignedTo,
        },
      })

      await tx.assetEvent.create({
        data: {
          assetId: asset.id, kind: 'inspection',
          summary: `${inspection.code} ${outcome}.`,
          detail: fails.length > 0
            ? `${fails.length} item${fails.length === 1 ? '' : 's'} failed: ${fails.map((f) => f.label).join('; ')}`
            : `All ${answers.length} checks passed`,
          actor: caller.name, actorRole: m.role,
          refType: 'inspection', refId: inspection.id,
        },
      })
    })

    const full = await this.db.inspection.findUniqueOrThrow({
      where: { id: inspection.id },
      include: { actions: { select: { code: true } } },
    })
    return this.toInspectionView(full, asset)
  }

  async listInspections(caller: Caller, f: InspectionFilters) {
    this.membership(caller, f.companyId)
    const q = f.q?.trim()
    const today = addDays(0)

    const where: Prisma.InspectionWhereInput = {
      companyId: f.companyId,
      status: { not: 'cancelled' },
      ...(f.siteId ? { siteId: f.siteId } : {}),
      ...(f.status === 'scheduled' ? { status: 'scheduled' } : {}),
      ...(f.status === 'completed' ? { status: 'completed' } : {}),
      ...(f.status === 'failed' ? { outcome: 'failed' } : {}),
      // Overdue is a time predicate on an open booking, not a stored state.
      ...(f.status === 'overdue' ? { status: 'scheduled', scheduledFor: { lt: today } } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { assignedTo: { contains: q, mode: 'insensitive' } },
              { asset: { name: { contains: q, mode: 'insensitive' } } },
              { asset: { code: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }

    const [total, rows] = await this.db.$transaction([
      this.db.inspection.count({ where }),
      this.db.inspection.findMany({
        where,
        include: { actions: { select: { code: true } }, asset: true },
        orderBy: [{ scheduledFor: 'asc' }, { code: 'asc' }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      }),
    ])

    const views = rows
      .map((r) => this.toInspectionView(r, r.asset))
      // Overdue first, then what is booked, then history newest-first.
      .sort((a, b) => {
        const rank = (x: typeof a) => (x.overdue ? 0 : x.status === 'scheduled' ? 1 : 2)
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        if (rank(a) === 2) {
          return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
        }
        return a.scheduledFor.getTime() - b.scheduledFor.getTime()
      })

    return {
      rows: views,
      page: f.page,
      pageSize: f.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    }
  }

  // ── Counters ───────────────────────────────────────────────────────────────

  /** Register-wide statistics for the assets dashboard. */
  async assetStats(caller: Caller, companyId: string, siteId?: string | null) {
    this.membership(caller, companyId)
    const today = addDays(0)
    const inAWeek = addDays(7)

    const base: Prisma.AssetWhereInput = {
      companyId,
      status: { not: 'retired' },
      ...(siteId ? { siteId } : {}),
    }

    const [totalAssets, overdueInspections, dueThisWeek, active] = await this.db.$transaction([
      this.db.asset.count({ where: base }),
      this.db.asset.count({ where: { ...base, nextDueDate: { lt: today } } }),
      this.db.asset.count({ where: { ...base, nextDueDate: { gte: today, lte: inAWeek } } }),
      // Health is derived, so the average and the worst-five need the rows themselves.
      // Bounded: a register beyond this is a reporting job, not a dashboard tile.
      this.db.asset.findMany({ where: base, include: assetInclude, take: 1000 }),
    ])

    const { defects, outcomes } = await this.healthInputs(active.map((a) => a.id))
    const views = active.map((a) => this.toAssetView(a, defects, outcomes))

    const bySite = new Map<string, number[]>()
    for (const v of views) bySite.set(v.siteId, [...(bySite.get(v.siteId) ?? []), v.health])

    /*
     * Six months of completion history.
     *
     * Counted in one round trip rather than six. This was a `for` loop awaiting a
     * two-count transaction per month — twelve queries in six sequential round trips, each
     * waiting on the last for no reason, since the months do not depend on each other.
     *
     * It showed up as the slowest endpoint in the load test: `/assets/stats` at 1.2s p95
     * with 150 concurrent users, against 417ms at 50. Latency from serialised round trips
     * scales with contention, because every one of them holds a pool connection while it
     * waits — so the endpoint degrades faster than the work it does would suggest.
     */
    const scope = { companyId, ...(siteId ? { siteId } : {}) }
    const months = Array.from({ length: 6 }, (_, i) => {
      const start = new Date()
      start.setMonth(start.getMonth() - (5 - i), 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      return { start, end }
    })

    const counts = await this.db.$transaction(
      months.flatMap(({ start, end }) => [
        this.db.inspection.count({
          where: { ...scope, status: 'completed', completedAt: { gte: start, lt: end } },
        }),
        this.db.inspection.count({
          where: { ...scope, status: 'completed', outcome: 'failed', completedAt: { gte: start, lt: end } },
        }),
      ]),
    )

    const monthlyTrend = months.map(({ start }, i) => ({
      month: start.toLocaleDateString('en-MY', { month: 'short' }),
      Completed: counts[i * 2],
      Failed: counts[i * 2 + 1],
    }))

    return {
      totalAssets,
      complianceRate: totalAssets
        ? Math.round(((totalAssets - overdueInspections) / totalAssets) * 100)
        : 100,
      overdueInspections,
      dueThisWeek,
      openDefects: views.reduce((s, v) => s + v.openDefects, 0),
      avgHealth: views.length
        ? Math.round(views.reduce((s, v) => s + v.health, 0) / views.length)
        : 0,
      highestRisk: [...views]
        .sort((a, b) => a.health - b.health)
        .slice(0, 5)
        .map((a) => ({ code: a.code, name: a.name, health: a.health, siteId: a.siteId })),
      bySiteHealth: [...bySite.entries()]
        .map(([name, hs]) => ({ name, value: Math.round(hs.reduce((s, h) => s + h, 0) / hs.length) }))
        .sort((a, b) => a.value - b.value),
      monthlyTrend,
    }
  }
}
