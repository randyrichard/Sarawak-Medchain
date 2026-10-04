/**
 * HSE performance - the "wider view" an HSE manager reports upward.
 *
 * The dashboard answers "what needs doing today"; the site comparison answers "which site is
 * behind". Neither answers the question asked in a management review or on the DOSH JKKP 8
 * return: *how safe are we, at what rate, and is it getting better?* That needs three things
 * the product did not have:
 *
 *  - **Rates, not counts.** Two lost-time injuries mean something different at a 40-person
 *    store and a 1,200-person plant. Every lagging figure here is normalised by hours worked
 *    or by workforce, using the bases DOSH uses (per 1,000,000 man-hours, per 1,000 workers)
 *    and, for international comparison, OSHA's TRIR (per 200,000 hours).
 *  - **Leading indicators beside lagging ones** (ISO 45001 §9.1): near misses reported, the
 *    near-miss-to-injury ratio, corrective actions closed on time, toolbox meetings held.
 *    Lagging figures say what already went wrong; leading ones say whether the work that
 *    prevents it is being done.
 *  - **A trend.** Twelve months, month by month, so a rising rate is visible before the
 *    annual figure confirms it.
 *
 * Hours worked come from SiteManHours. A month a site has not recorded is **estimated** from
 * its headcount at 195 hours per worker (45 hours a week, the Employment Act 1955 limit since
 * 2023, × 52 / 12) and every figure says how much of it rests on estimates, so a rate is never
 * presented as more exact than its inputs.
 *
 * Scope rules are the site comparison's: the same roles, the same site restriction, the same
 * incident and action row scope, the same classifiers as the register and the reports.
 */
import type { Prisma, PrismaClient, Role } from '@prisma/client'
import { actionScopeWhere, incidentScopeWhere, overdueActionWhere } from '../domain/access.js'
import { type Caller } from '../domain/caller.js'
import { DomainError } from '../domain/errors.js'
import { isFatality, isInjury, isLostTime, isNearMiss, isRecordable } from './incidentCatalog.js'
import { dateOf, endOfLocalDate, startOfLocalMonth, todayDate } from '../domain/businessDay.js'

export class HsePerformanceError extends DomainError {}

/** Who reports organisation-wide safety performance: the same roles that compare sites. */
export const PERFORMANCE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'ceo']
/** Who may record hours worked: the people accountable for the figures built on them. */
export const MAN_HOURS_ROLES: Role[] = ['admin', 'hse_manager']

/**
 * The indicators a company may set a target for, and which way "on target" points:
 * `max` - the figure must be at or below the target (injury rates, overdue actions);
 * `min` - at or above it (near-miss ratio, actions closed on time).
 *
 * The direction is fixed here rather than stored, so a target cannot be saved backwards.
 * The database CHECK constraint on PerformanceTarget.metric lists the same keys.
 */
export const TARGET_METRICS = {
  frequencyRate: 'max',
  severityRate: 'max',
  incidenceRate: 'max',
  trir: 'max',
  fatalities: 'max',
  overdueActions: 'max',
  nearMissRatio: 'min',
  onTimeClosure: 'min',
} as const satisfies Record<string, 'max' | 'min'>
export type TargetMetric = keyof typeof TARGET_METRICS
export const isTargetMetric = (m: string): m is TargetMetric => Object.hasOwn(TARGET_METRICS, m)

/** DOSH JKKP 8 frequency and severity rates: per 1,000,000 man-hours. */
export const FREQUENCY_BASE = 1_000_000
/** OSHA TRIR: per 200,000 hours (100 full-time workers for a year). */
export const TRIR_BASE = 200_000
/** DOSH incidence rate: per 1,000 workers. */
export const INCIDENCE_BASE = 1_000
/** 45 h/week × 52 / 12 - the estimate for a month no hours were recorded for. */
export const ESTIMATED_HOURS_PER_WORKER_MONTH = 195

export interface Indicators {
  // Lagging
  lostTime: number
  recordable: number
  fatalities: number
  injuries: number
  daysLost: number
  hours: number
  /** Share of `hours` that is estimated from headcount rather than recorded, 0..1. */
  estimatedShare: number
  workers: number
  frequencyRate: number | null
  severityRate: number | null
  incidenceRate: number | null
  trir: number | null
  // Leading
  nearMisses: number
  /** Near misses reported per recordable injury. Null when there were no recordables. */
  nearMissRatio: number | null
  actionsClosed: number
  actionsClosedOnTime: number
  /** Share of actions closed in the window that were closed by their due date, 0..1. */
  onTimeClosure: number | null
  overdueActions: number
  toolboxMeetings: number
}

export interface MonthPoint {
  month: string // YYYY-MM
  lostTime: number
  recordable: number
  nearMisses: number
  hours: number
  estimatedShare: number
  frequencyRate: number | null
}

export interface Target {
  metric: TargetMetric
  value: number
  direction: 'max' | 'min'
}

export interface SitePerformance extends Indicators {
  siteId: string
  siteName: string
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp
const rate = (count: number, base: number, denominator: number) => (denominator > 0 ? round((count * base) / denominator) : null)
/*
 * Two kinds of month value, kept apart:
 * - `monthKey`/`monthStart`: the *storage key* of a month - SiteManHours.month is the 1st at
 *   UTC midnight, a date-only value. Never used as a moment.
 * - `periodStart`: the *moment* a month begins locally (APP_TIMEZONE) - 16:00 UTC on the
 *   last day of the previous month, for Malaysia. Incidents, closures and meetings are
 *   counted against these, so 02:00 on the 1st belongs to the 1st's month. With UTC bounds
 *   it was counted in the month before, and moved a lost-time injury between two months'
 *   rates on a JKKP 8 return.
 */
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1))
const periodStart = (y: number, m: number) => startOfLocalMonth(y, m)
/** "YYYY-MM-DD" of an instant's local date. */
const localDay = (d: Date) => dateOf(d).toISOString().slice(0, 10)

/** "2026-03" -> the first instant of March 2026, UTC. Throws on anything else. */
export function parseMonth(value: string): Date {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  if (!m) throw new HsePerformanceError('validation', 'Month must look like 2026-03.')
  return monthStart(Number(m[1]), Number(m[2]) - 1)
}

/** The rates for a set of counts - one place, so the site rows and the total cannot disagree. */
export function computeIndicators(c: {
  lostTime: number; recordable: number; fatalities: number; injuries: number; daysLost: number
  hours: number; estimatedHours: number; workers: number; nearMisses: number
  actionsClosed: number; actionsClosedOnTime: number; overdueActions: number; toolboxMeetings: number
}): Indicators {
  return {
    lostTime: c.lostTime,
    recordable: c.recordable,
    fatalities: c.fatalities,
    injuries: c.injuries,
    daysLost: c.daysLost,
    hours: Math.round(c.hours),
    estimatedShare: c.hours > 0 ? round(c.estimatedHours / c.hours, 3) : 0,
    workers: c.workers,
    frequencyRate: rate(c.lostTime, FREQUENCY_BASE, c.hours),
    severityRate: rate(c.daysLost, FREQUENCY_BASE, c.hours),
    incidenceRate: rate(c.lostTime, INCIDENCE_BASE, c.workers),
    trir: rate(c.recordable, TRIR_BASE, c.hours),
    nearMisses: c.nearMisses,
    nearMissRatio: c.recordable > 0 ? round(c.nearMisses / c.recordable, 1) : null,
    actionsClosed: c.actionsClosed,
    actionsClosedOnTime: c.actionsClosedOnTime,
    onTimeClosure: c.actionsClosed > 0 ? round(c.actionsClosedOnTime / c.actionsClosed, 3) : null,
    overdueActions: c.overdueActions,
    toolboxMeetings: c.toolboxMeetings,
  }
}

type Counts = Parameters<typeof computeIndicators>[0]
const emptyCounts = (): Counts => ({
  lostTime: 0, recordable: 0, fatalities: 0, injuries: 0, daysLost: 0, hours: 0, estimatedHours: 0,
  workers: 0, nearMisses: 0, actionsClosed: 0, actionsClosedOnTime: 0, overdueActions: 0, toolboxMeetings: 0,
})

export class HsePerformanceService {
  constructor(private db: PrismaClient) {}

  private membership(caller: Caller, companyId: string, roles: Role[], what: string) {
    const m = caller.roles.find((r) => r.companyId === companyId)
    if (!m) throw new HsePerformanceError('forbidden', 'You do not have access to this workspace.', 403)
    if (!roles.includes(m.role)) throw new HsePerformanceError('forbidden', `Your role does not permit ${what}.`, 403)
    return m
  }

  /** The active sites this caller may see, optionally narrowed to one project. */
  private async sitesFor(companyId: string, projectId: string | null | undefined, siteIds: string[]) {
    let projectSiteIds: string[] | null = null
    if (projectId) {
      const project = await this.db.project.findFirst({
        where: { id: projectId, companyId }, select: { sites: { select: { id: true } } },
      })
      if (!project) throw new HsePerformanceError('not_found', 'Project not found in this workspace.', 404)
      projectSiteIds = project.sites.map((s) => s.id)
    }
    return this.db.site.findMany({
      where: {
        companyId,
        active: true,
        AND: [siteIds.length > 0 ? { id: { in: siteIds } } : {}, projectSiteIds ? { id: { in: projectSiteIds } } : {}],
      },
      select: { id: true, name: true, headcount: true },
      orderBy: { name: 'asc' },
    })
  }

  /**
   * Rolling `months` calendar months ending with `endMonth` (default: the current month).
   * The current month counts up to now, and its estimated hours are pro-rated to match.
   */
  async performance(caller: Caller, f: { companyId: string; projectId?: string | null; months?: number; endMonth?: string | null; now?: Date }) {
    const m = this.membership(caller, f.companyId, PERFORMANCE_ROLES, 'viewing HSE performance')
    const now = f.now ?? new Date()
    const months = Math.min(Math.max(f.months ?? 12, 1), 24)
    const today = todayDate(now)
    // Month keys (storage) for the period, and the local moments it spans.
    const end = f.endMonth ? parseMonth(f.endMonth) : monthStart(today.getUTCFullYear(), today.getUTCMonth())
    const fromKey = monthStart(end.getUTCFullYear(), end.getUTCMonth() - (months - 1))
    const endKeyExclusive = monthStart(end.getUTCFullYear(), end.getUTCMonth() + 1)
    const from = periodStart(fromKey.getUTCFullYear(), fromKey.getUTCMonth())
    const endExclusive = periodStart(end.getUTCFullYear(), end.getUTCMonth() + 1)
    const to = endExclusive > now ? now : endExclusive
    if (from > now) throw new HsePerformanceError('validation', 'That period has not started yet.')
    // Returned as local calendar dates, inclusive: what a person means by "the period".
    const period = { from: localDay(from), to: localDay(new Date(to.getTime() - 1)) }

    const keys = Array.from({ length: months }, (_, i) => monthKey(monthStart(fromKey.getUTCFullYear(), fromKey.getUTCMonth() + i)))
    const [sites, targets] = await Promise.all([this.sitesFor(f.companyId, f.projectId, m.siteIds), this.targetsOf(f.companyId)])
    const empty = { ...period, months: [] as MonthPoint[], total: computeIndicators(emptyCounts()), sites: [] as SitePerformance[], missingHours: [] as { siteId: string; siteName: string; months: string[] }[], targets, basis: BASIS }
    if (sites.length === 0) return empty
    const siteIds = sites.map((s) => s.id)
    const at = { companyId: f.companyId, siteId: { in: siteIds } }

    const incidentWhere: Prisma.IncidentWhereInput = {
      ...at, archived: false, stage: { not: 'draft' }, occurredAt: { gte: from, lt: to },
      ...incidentScopeWhere(caller, f.companyId),
    }
    const actionScope: Prisma.CorrectiveActionWhereInput = { ...at, ...actionScopeWhere(caller, f.companyId) }

    const [incidents, daysLostRows, hoursRows, closed, overdue, toolbox] = await Promise.all([
      this.db.incident.findMany({ where: incidentWhere, select: { id: true, siteId: true, type: true, severity: true, occurredAt: true } }),
      this.db.incidentPerson.groupBy({
        by: ['incidentId'],
        where: { role: 'injured', daysLost: { gt: 0 }, incident: incidentWhere },
        _sum: { daysLost: true },
      }),
      this.db.siteManHours.findMany({ where: { ...at, month: { gte: fromKey, lt: endKeyExclusive } }, select: { siteId: true, month: true, hours: true } }),
      this.db.correctiveAction.findMany({
        where: { ...actionScope, status: { in: ['completed', 'verified'] }, completedAt: { gte: from, lt: to } },
        select: { siteId: true, completedAt: true, dueDate: true },
      }),
      this.db.correctiveAction.groupBy({ by: ['siteId'], where: { ...actionScope, ...overdueActionWhere() }, _count: true }),
      this.db.toolboxMeeting.groupBy({ by: ['siteId'], where: { ...at, heldAt: { gte: from, lt: to } }, _count: true }),
    ])

    const bySite = new Map(sites.map((s) => [s.id, emptyCounts()]))
    const byMonth = new Map(keys.map((k) => [k, { lostTime: 0, recordable: 0, nearMisses: 0, hours: 0, estimatedHours: 0 }]))
    const daysLostBy = new Map(daysLostRows.map((r) => [r.incidentId, r._sum.daysLost ?? 0]))

    // Each incident goes in the month whose local start it falls after. Comparing against the
    // period's month starts, worked out once, gives the same answer as asking the time zone
    // per incident, without tens of thousands of time-zone lookups per request.
    const monthStarts = keys.map((k) => { const [y, m] = k.split('-').map(Number); return periodStart(y, m - 1).getTime() })
    const monthOf = (at: Date) => {
      const t = at.getTime()
      let lo = 0, hi = monthStarts.length - 1
      if (t < monthStarts[0]) return undefined
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (monthStarts[mid] <= t) lo = mid; else hi = mid - 1 }
      return byMonth.get(keys[lo])
    }
    for (const i of incidents) {
      const c = bySite.get(i.siteId)!
      const mo = monthOf(i.occurredAt)
      if (isLostTime(i)) { c.lostTime++; if (mo) mo.lostTime++ }
      if (isRecordable(i)) { c.recordable++; if (mo) mo.recordable++ }
      if (isFatality(i)) c.fatalities++
      if (isInjury(i)) c.injuries++
      if (isNearMiss(i)) { c.nearMisses++; if (mo) mo.nearMisses++ }
      c.daysLost += daysLostBy.get(i.id) ?? 0
    }

    // Hours: recorded where there is a row, otherwise headcount × 195, pro-rated for the
    // month in progress so a half-finished month does not dilute the rate.
    const recorded = new Map(hoursRows.map((r) => [`${r.siteId}|${monthKey(r.month)}`, r.hours]))
    const elapsedShare = (key: string) => {
      const [y, mo] = key.split('-').map(Number)
      const start = periodStart(y, mo - 1), next = periodStart(y, mo)
      if (now >= next) return 1
      if (now <= start) return 0
      return (now.getTime() - start.getTime()) / (next.getTime() - start.getTime())
    }
    /*
     * Which finished months each site has no recorded hours for. The page already says how
     * much of the total is estimated; this says where, so it can be fixed. The month in
     * progress is left out - it cannot be recorded until it is over.
     */
    const currentKey = monthKey(monthStart(today.getUTCFullYear(), today.getUTCMonth()))
    const missingHours: { siteId: string; siteName: string; months: string[] }[] = []
    for (const s of sites) {
      const c = bySite.get(s.id)!
      c.workers = s.headcount
      const missing: string[] = []
      for (const key of keys) {
        const real = recorded.get(`${s.id}|${key}`)
        if (real === undefined && key < currentKey) missing.push(key)
        const hours = real ?? s.headcount * ESTIMATED_HOURS_PER_WORKER_MONTH * elapsedShare(key)
        c.hours += hours
        if (real === undefined) c.estimatedHours += hours
        const mo = byMonth.get(key)!
        mo.hours += hours
        if (real === undefined) mo.estimatedHours += hours
      }
      if (missing.length > 0) missingHours.push({ siteId: s.id, siteName: s.name, months: missing })
    }

    // Due dates are calendar days and thousands of actions share each one: work out where
    // each day ends once, not once per action.
    const dueEnds = new Map<number, Date>()
    const endOfDue = (d: Date) => {
      let end = dueEnds.get(d.getTime())
      if (!end) { end = endOfLocalDate(d); dueEnds.set(d.getTime(), end) }
      return end
    }
    for (const a of closed) {
      const c = bySite.get(a.siteId)
      if (!c || !a.completedAt) continue
      c.actionsClosed++
      if (a.completedAt <= endOfDue(a.dueDate)) c.actionsClosedOnTime++
    }
    for (const r of overdue) { const c = bySite.get(r.siteId); if (c) c.overdueActions = r._count }
    for (const r of toolbox) { const c = bySite.get(r.siteId); if (c) c.toolboxMeetings = r._count }

    const total = emptyCounts()
    for (const c of bySite.values()) for (const k of Object.keys(total) as (keyof Counts)[]) total[k] += c[k]

    const siteRows: SitePerformance[] = sites.map((s) => ({ siteId: s.id, siteName: s.name, ...computeIndicators(bySite.get(s.id)!) }))
    // Highest lost-time frequency first: the league table answers "who is worst" first.
    siteRows.sort((a, b) => (b.frequencyRate ?? -1) - (a.frequencyRate ?? -1) || a.siteName.localeCompare(b.siteName))

    return {
      ...period,
      months: keys.map((k) => {
        const mo = byMonth.get(k)!
        return {
          month: k, lostTime: mo.lostTime, recordable: mo.recordable, nearMisses: mo.nearMisses,
          hours: Math.round(mo.hours), estimatedShare: mo.hours > 0 ? round(mo.estimatedHours / mo.hours, 3) : 0,
          frequencyRate: rate(mo.lostTime, FREQUENCY_BASE, mo.hours),
        }
      }),
      total: computeIndicators(total),
      sites: siteRows,
      missingHours,
      targets,
      basis: BASIS,
    }
  }

  /** The company's targets, with the direction each one points. */
  private async targetsOf(companyId: string): Promise<Target[]> {
    const rows = await this.db.performanceTarget.findMany({ where: { companyId }, select: { metric: true, value: true } })
    return rows
      .filter((r) => isTargetMetric(r.metric))
      .map((r) => ({ metric: r.metric as TargetMetric, value: r.value, direction: TARGET_METRICS[r.metric as TargetMetric] }))
      .sort((a, b) => Object.keys(TARGET_METRICS).indexOf(a.metric) - Object.keys(TARGET_METRICS).indexOf(b.metric))
  }

  /**
   * Sets (or clears, with `value: null`) one target. Owned by the same people as the hours,
   * for the same reason: the board reads every tile against it.
   */
  async setTarget(caller: Caller, f: { companyId: string; metric: string; value: number | null }) {
    this.membership(caller, f.companyId, MAN_HOURS_ROLES, 'setting performance targets')
    if (!isTargetMetric(f.metric)) throw new HsePerformanceError('validation', 'There is no target for that indicator.')
    if (f.value === null) {
      await this.db.performanceTarget.deleteMany({ where: { companyId: f.companyId, metric: f.metric } })
      return { metric: f.metric, value: null }
    }
    const max = f.metric === 'onTimeClosure' ? 1 : 1_000_000
    if (!Number.isFinite(f.value) || f.value < 0 || f.value > max) {
      throw new HsePerformanceError('validation', f.metric === 'onTimeClosure'
        ? 'On-time closure is a share between 0 and 1 (0% to 100%).'
        : 'A target must be a number of 0 or more.')
    }
    const row = await this.db.performanceTarget.upsert({
      where: { companyId_metric: { companyId: f.companyId, metric: f.metric } },
      create: { companyId: f.companyId, metric: f.metric, value: f.value, updatedBy: caller.userId },
      update: { value: f.value, updatedBy: caller.userId },
    })
    return { metric: f.metric, value: row.value, direction: TARGET_METRICS[f.metric] }
  }

  /** Recorded hours for each site this caller may see, for the months of one year. */
  async manHours(caller: Caller, f: { companyId: string; year: number }) {
    const m = this.membership(caller, f.companyId, PERFORMANCE_ROLES, 'viewing man-hours')
    const sites = await this.sitesFor(f.companyId, null, m.siteIds)
    const rows = await this.db.siteManHours.findMany({
      where: { companyId: f.companyId, siteId: { in: sites.map((s) => s.id) }, month: { gte: monthStart(f.year, 0), lt: monthStart(f.year + 1, 0) } },
      select: { siteId: true, month: true, hours: true, updatedBy: true, updatedAt: true },
    })
    return {
      year: f.year,
      sites: sites.map((s) => ({
        siteId: s.id, siteName: s.name, headcount: s.headcount,
        estimatePerMonth: s.headcount * ESTIMATED_HOURS_PER_WORKER_MONTH,
        months: rows.filter((r) => r.siteId === s.id).map((r) => ({ month: monthKey(r.month), hours: r.hours, updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString() })),
      })),
    }
  }

  /** Records (or clears, with `hours: null`) the hours worked at one site in one month. */
  async setManHours(caller: Caller, f: { companyId: string; siteId: string; month: string; hours: number | null; now?: Date }) {
    const m = this.membership(caller, f.companyId, MAN_HOURS_ROLES, 'recording man-hours')
    const month = parseMonth(f.month)
    const now = f.now ?? new Date()
    const today = todayDate(now)
    if (month > monthStart(today.getUTCFullYear(), today.getUTCMonth())) {
      throw new HsePerformanceError('validation', 'Hours can only be recorded for this month or earlier.')
    }
    if (f.hours !== null && (!Number.isInteger(f.hours) || f.hours < 0 || f.hours > 50_000_000)) {
      throw new HsePerformanceError('validation', 'Hours must be a whole number between 0 and 50,000,000.')
    }
    const site = await this.db.site.findFirst({
      where: { id: f.siteId, companyId: f.companyId, ...(m.siteIds.length > 0 ? { id: { in: m.siteIds.filter((id) => id === f.siteId) } } : {}) },
      select: { id: true },
    })
    if (!site) throw new HsePerformanceError('not_found', 'Site not found in this workspace.', 404)

    if (f.hours === null) {
      await this.db.siteManHours.deleteMany({ where: { siteId: f.siteId, month } })
      return { siteId: f.siteId, month: f.month, hours: null }
    }
    const row = await this.db.siteManHours.upsert({
      where: { siteId_month: { siteId: f.siteId, month } },
      create: { companyId: f.companyId, siteId: f.siteId, month, hours: f.hours, updatedBy: caller.userId },
      update: { hours: f.hours, updatedBy: caller.userId },
    })
    return { siteId: row.siteId, month: f.month, hours: row.hours }
  }
}


const BASIS = {
  frequency: FREQUENCY_BASE,
  trir: TRIR_BASE,
  incidence: INCIDENCE_BASE,
  estimatedHoursPerWorkerMonth: ESTIMATED_HOURS_PER_WORKER_MONTH,
} as const
