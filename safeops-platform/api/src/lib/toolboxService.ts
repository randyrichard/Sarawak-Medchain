/**
 * The daily toolbox meeting: the whole-site pre-shift briefing.
 *
 * Not the toolbox talk on a permit, which briefs the named crew of one job and blocks that
 * job until everyone has acknowledged it. This is the mass meeting a site safety officer runs
 * every morning - on a multi-contractor site, several hundred people from several firms at
 * once (docs/CUSTOMER_RESEARCH.md: "Mass toolbox meeting with contractors, ~350 personnel").
 *
 * So attendance is a headcount per organisation - the tenant's own staff, each contractor -
 * rather than a list of names. Nobody types 350 names at a muster point, and a form that
 * demanded it would be skipped, which leaves no record at all. What a client or an auditor
 * asks for is proof the briefing happened, what it covered, who led it, and roughly who was
 * there. That is what this keeps.
 *
 * "Did every site hold one today?" is the question the register exists to answer, so it is
 * asked per site, in the site's own timezone: a meeting at 07:30 in Kuching is 23:30 the
 * previous day in UTC, and counting it against the wrong day would report a site that held
 * its briefing as one that did not.
 */
import { Prisma, type PrismaClient, type Role } from '@prisma/client'
import { membershipOf, type Caller } from '../domain/caller.js'
import { instantForLocal, isValidTimezone, localParts } from './reportSchedule.js'
import { DomainError } from '../domain/errors.js'
import { endOfLocalDateString, startOfLocalDateString } from '../domain/businessDay.js'

export class ToolboxError extends DomainError {}

/**
 * Who may read the register. The people who run the briefing, the managers above them,
 * and the executive, who is asked about it by clients. Employees attend the meeting; the
 * register of every meeting on every site is not theirs.
 */
const VIEW_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor', 'ceo']

/** Who may record one. The supervisor is here on purpose: on most sites they lead it. */
const RECORD_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'supervisor']

/** Who may delete one. A briefing record is evidence; removing it is a management act. */
const DELETE_ROLES: Role[] = ['admin', 'hse_manager']

const MAX_PAGE_SIZE = 100
/** Generous: a large site's own staff plus a dozen contractors. */
const MAX_GROUPS = 50
/** More people than any single muster point holds; a typo guard, not a policy. */
const MAX_GROUP_COUNT = 5000
/** A record in the future is a typo. A little slack absorbs a phone clock that runs fast. */
const FUTURE_SLACK_MS = 10 * 60_000

export interface AttendanceGroupInput {
  organisation: string
  count: number
}

export interface ToolboxInput {
  siteId: string
  heldAt: string
  ledBy: string
  topic: string
  hazards?: string
  notes?: string
  groups: AttendanceGroupInput[]
}

export interface ListToolboxParams {
  companyId: string
  page: number
  pageSize: number
  siteId?: string
  from?: string
  to?: string
  q?: string
}

type Ctx = { ip?: string; device?: string }

const withGroups = { groups: { orderBy: { count: 'desc' as const } }, site: { select: { name: true, timezone: true } } }

export class ToolboxService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, ToolboxError)
  }


  private requireRole(caller: Caller, companyId: string, allowed: Role[], doing: string) {
    const m = this.membership(caller, companyId)
    if (!allowed.includes(m.role)) {
      throw new ToolboxError('forbidden', `Your role does not permit ${doing}.`, 403)
    }
    return m
  }

  /** Site restriction, applied as SQL so restricted rows never leave the database. */
  private siteWhere(caller: Caller, companyId: string): Prisma.ToolboxMeetingWhereInput {
    const m = this.membership(caller, companyId)
    return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
  }

  private async requireSite(caller: Caller, companyId: string, siteId: string) {
    const m = this.membership(caller, companyId)
    if (m.siteIds.length > 0 && !m.siteIds.includes(siteId)) {
      throw new ToolboxError('forbidden', 'You are not assigned to that site.', 403)
    }
    const site = await this.db.site.findFirst({ where: { id: siteId, companyId }, select: { id: true } })
    if (!site) throw new ToolboxError('validation', 'That site does not belong to this workspace.')
  }

  private async log(caller: Caller, companyId: string, action: string, target: string, ctx: Ctx, detail?: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    await this.db.adminAuditEntry.create({
      data: {
        companyId,
        actor: caller.name,
        actorRole: m?.role ?? '',
        action,
        module: 'toolbox',
        target,
        ip: ctx.ip ?? '',
        device: ctx.device ?? '',
        newValue: detail ?? null,
      },
    })
  }

  /** Validates and normalises what a form sends. Every message names the field. */
  private clean(input: ToolboxInput) {
    const topic = input.topic?.trim()
    if (!topic) throw new ToolboxError('validation', 'Say what the meeting was about - a topic is required.')
    const ledBy = input.ledBy?.trim()
    if (!ledBy) throw new ToolboxError('validation', 'Record who led the meeting.')

    const heldAt = new Date(input.heldAt)
    if (Number.isNaN(heldAt.getTime())) throw new ToolboxError('validation', 'The meeting time is not a valid date.')
    if (heldAt.getTime() > Date.now() + FUTURE_SLACK_MS) {
      throw new ToolboxError('validation', 'The meeting time is in the future. Record a meeting once it has been held.')
    }

    const groups = (input.groups ?? [])
      .map((g) => ({ organisation: g.organisation?.trim() ?? '', count: Number(g.count) }))
      .filter((g) => g.organisation || g.count)
    if (groups.length === 0) {
      throw new ToolboxError('validation', 'Record who attended: at least one organisation and how many of its people were there.')
    }
    if (groups.length > MAX_GROUPS) throw new ToolboxError('validation', `At most ${MAX_GROUPS} organisations per meeting.`)
    for (const g of groups) {
      if (!g.organisation) throw new ToolboxError('validation', 'Every attendance line needs the organisation it counts.')
      if (!Number.isInteger(g.count) || g.count < 1 || g.count > MAX_GROUP_COUNT) {
        throw new ToolboxError('validation', `The headcount for ${g.organisation} must be a whole number from 1 to ${MAX_GROUP_COUNT}.`)
      }
    }
    // The same firm entered twice is one firm counted twice; merge rather than refuse.
    const merged = new Map<string, AttendanceGroupInput>()
    for (const g of groups) {
      const key = g.organisation.toLowerCase()
      const known = merged.get(key)
      if (known) known.count += g.count
      else merged.set(key, { ...g })
    }
    const finalGroups = [...merged.values()]

    return {
      siteId: input.siteId,
      heldAt,
      ledBy: ledBy.slice(0, 200),
      topic: topic.slice(0, 300),
      hazards: (input.hazards ?? '').trim().slice(0, 5000),
      notes: (input.notes ?? '').trim().slice(0, 5000),
      groups: finalGroups,
      headcount: finalGroups.reduce((n, g) => n + g.count, 0),
    }
  }

  async list(caller: Caller, p: ListToolboxParams) {
    this.requireRole(caller, p.companyId, VIEW_ROLES, 'viewing toolbox meetings')
    const pageSize = Math.min(Math.max(p.pageSize, 1), MAX_PAGE_SIZE)
    const heldAt: Prisma.DateTimeFilter = {}
    // Meetings are moments; the filter's dates are local days (an 07:00 meeting is 23:00
    // UTC the day before, and fell outside a one-day filter on its own date).
    if (p.from) heldAt.gte = startOfLocalDateString(p.from)
    if (p.to) heldAt.lte = endOfLocalDateString(p.to)
    const q = p.q?.trim()

    const where: Prisma.ToolboxMeetingWhereInput = {
      companyId: p.companyId,
      // AND, never a spread: both constrain siteId, and spreading the filter over the
      // restriction would let a supervisor on one site read another by asking for it.
      AND: [this.siteWhere(caller, p.companyId), p.siteId ? { siteId: p.siteId } : {}],
      ...(p.from || p.to ? { heldAt } : {}),
      ...(q ? {
        OR: [
          { topic: { contains: q, mode: 'insensitive' } },
          { ledBy: { contains: q, mode: 'insensitive' } },
          { number: { contains: q, mode: 'insensitive' } },
          { hazards: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    }
    const [rows, total] = await this.db.$transaction([
      this.db.toolboxMeeting.findMany({
        where, include: withGroups, orderBy: { heldAt: 'desc' },
        skip: (Math.max(p.page, 1) - 1) * pageSize, take: pageSize,
      }),
      this.db.toolboxMeeting.count({ where }),
    ])
    return { rows, total, page: Math.max(p.page, 1), pageSize }
  }

  async get(caller: Caller, companyId: string, id: string) {
    this.requireRole(caller, companyId, VIEW_ROLES, 'viewing toolbox meetings')
    const row = await this.db.toolboxMeeting.findFirst({
      where: { id, companyId, ...this.siteWhere(caller, companyId) },
      include: withGroups,
    })
    if (!row) throw new ToolboxError('not_found', 'Toolbox meeting not found.', 404)
    return row
  }

  async create(caller: Caller, companyId: string, input: ToolboxInput, ctx: Ctx = {}) {
    this.requireRole(caller, companyId, RECORD_ROLES, 'recording toolbox meetings')
    const data = this.clean(input)
    await this.requireSite(caller, companyId, data.siteId)

    const created = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId, kind: 'toolbox' } },
        update: { next: { increment: 1 } },
        create: { companyId, kind: 'toolbox', next: 1001 },
        select: { next: true },
      })
      return tx.toolboxMeeting.create({
        data: {
          companyId,
          siteId: data.siteId,
          number: `TBM-${counter.next}`,
          heldAt: data.heldAt,
          ledBy: data.ledBy,
          topic: data.topic,
          hazards: data.hazards,
          notes: data.notes,
          headcount: data.headcount,
          recordedBy: caller.name,
          recordedById: caller.userId,
          groups: { create: data.groups },
        },
        include: withGroups,
      })
    })
    await this.log(caller, companyId, 'toolbox_recorded', created.number, ctx,
      `${created.topic} - ${created.headcount} present`)
    return created
  }

  async update(caller: Caller, companyId: string, id: string, input: ToolboxInput, ctx: Ctx = {}) {
    this.requireRole(caller, companyId, RECORD_ROLES, 'editing toolbox meetings')
    const existing = await this.get(caller, companyId, id)
    const data = this.clean(input)
    await this.requireSite(caller, companyId, data.siteId)

    // Groups are replaced wholesale: an edited attendance is a corrected count, and a
    // partial merge of the old and new lines would double-count whoever was on both.
    const updated = await this.db.$transaction(async (tx) => {
      await tx.toolboxAttendanceGroup.deleteMany({ where: { meetingId: existing.id } })
      return tx.toolboxMeeting.update({
        where: { id: existing.id },
        data: {
          siteId: data.siteId,
          heldAt: data.heldAt,
          ledBy: data.ledBy,
          topic: data.topic,
          hazards: data.hazards,
          notes: data.notes,
          headcount: data.headcount,
          groups: { create: data.groups },
        },
        include: withGroups,
      })
    })
    await this.log(caller, companyId, 'toolbox_updated', updated.number, ctx,
      `${updated.topic} - ${updated.headcount} present (was ${existing.headcount})`)
    return updated
  }

  async remove(caller: Caller, companyId: string, id: string, ctx: Ctx = {}) {
    this.requireRole(caller, companyId, DELETE_ROLES, 'deleting toolbox meetings')
    const existing = await this.get(caller, companyId, id)
    await this.db.toolboxMeeting.delete({ where: { id: existing.id } })
    await this.log(caller, companyId, 'toolbox_deleted', existing.number, ctx,
      `${existing.topic} on ${existing.heldAt.toISOString()}`)
  }

  /**
   * Today, per site: held or not, and by how many.
   *
   * "Today" is each site's own calendar day. The window is computed per site rather than
   * once, because one tenant can run sites in more than one timezone.
   */
  async today(caller: Caller, companyId: string, now = new Date()) {
    this.requireRole(caller, companyId, VIEW_ROLES, 'viewing toolbox meetings')
    const m = this.membership(caller, companyId)
    const sites = await this.db.site.findMany({
      where: { companyId, active: true, ...(m.siteIds.length > 0 ? { id: { in: m.siteIds } } : {}) },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
    })

    const windows = sites.map((s) => {
      const tz = isValidTimezone(s.timezone) ? s.timezone : 'Asia/Kuching'
      const d = localParts(now, tz)
      const start = instantForLocal(d.year, d.month, d.day, 0, 0, tz)
      const next = localParts(new Date(start.getTime() + 36 * 3600_000), tz)
      const end = instantForLocal(next.year, next.month, next.day, 0, 0, tz)
      return { site: s, start, end, date: `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` }
    })
    if (windows.length === 0) return { sites: [], held: 0, total: 0, headcount: 0 }

    const earliest = new Date(Math.min(...windows.map((w) => w.start.getTime())))
    const latest = new Date(Math.max(...windows.map((w) => w.end.getTime())))
    const meetings = await this.db.toolboxMeeting.findMany({
      where: { companyId, siteId: { in: sites.map((s) => s.id) }, heldAt: { gte: earliest, lt: latest } },
      select: { id: true, number: true, siteId: true, heldAt: true, topic: true, ledBy: true, headcount: true },
      orderBy: { heldAt: 'asc' },
    })

    const rows = windows.map((w) => {
      const own = meetings.filter((mt) => mt.siteId === w.site.id && mt.heldAt >= w.start && mt.heldAt < w.end)
      return {
        siteId: w.site.id,
        siteName: w.site.name,
        date: w.date,
        held: own.length > 0,
        headcount: own.reduce((n, mt) => n + mt.headcount, 0),
        meetings: own,
      }
    })
    return {
      sites: rows,
      held: rows.filter((r) => r.held).length,
      total: rows.length,
      headcount: rows.reduce((n, r) => n + r.headcount, 0),
    }
  }

  /** Organisations already used on this workspace's meetings, for the attendance field. */
  async organisations(caller: Caller, companyId: string) {
    this.requireRole(caller, companyId, VIEW_ROLES, 'viewing toolbox meetings')
    const [used, contractors, company] = await Promise.all([
      this.db.toolboxAttendanceGroup.findMany({
        where: { meeting: { companyId } }, distinct: ['organisation'], select: { organisation: true }, take: 200,
      }),
      this.db.contractorCompany.findMany({ where: { companyId, status: 'active' }, select: { name: true } }),
      this.db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    ])
    const names = [
      ...(company ? [company.name] : []),
      ...contractors.map((c) => c.name),
      ...used.map((u) => u.organisation),
    ]
    const seen = new Set<string>()
    return names.filter((n) => {
      const k = n.trim().toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
}
