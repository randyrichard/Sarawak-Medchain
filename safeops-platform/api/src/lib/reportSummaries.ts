/**
 * Two summaries an HSE manager asked for, written from the records rather than by a model.
 *
 * Every sentence below is assembled from counts and fields the database holds, so each one
 * can be traced to a row - which is the property that matters when the page is handed to a
 * client, a department head or DOSH. Nothing is estimated and nothing is paraphrased: a
 * figure the product does not hold is not mentioned rather than guessed.
 *
 *  - weekly_actions: every open corrective action, by department, overdue first. This is
 *    the weekly SAIL the site safety officer used to build in Excel and email to each head
 *    of department before the Friday HOD meeting (docs/CUSTOMER_RESEARCH.md, P3/P4).
 *  - site_activity: what happened on site today or over the last seven days - incidents,
 *    toolbox briefings, permits, inspections and actions - for a manager or a shift
 *    handover.
 */
import type { PrismaClient } from '@prisma/client'
import { overdueActionWhere } from '../domain/access.js'
import { docDate, humanize, isInjury, isNearMiss, severityName, stageLabel, typeName } from './incidentCatalog.js'
import { PERMIT_STATUS_LABEL, PERMIT_TYPE_LABEL } from './permitCatalog.js'
import { instantForLocal, localParts } from './reportSchedule.js'
import type { ReportData } from './reportService.js'
import { todayDate } from '../domain/businessDay.js'

const DAY = 86_400_000

export interface SummaryScope {
  companyId: string
  companyName: string
  siteId: string | null
  siteName: string | null
  projectName: string | null
  /** Null means the whole company; a list means exactly those sites, empty included. */
  siteIds: string[] | null
}

export type ActivityPeriod = 'day' | 'week'

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
/** Today's local date (APP_TIMEZONE), as a date-only value; due dates are compared with it. */
const startOfTodayUtc = () => todayDate()
const iso = (d: Date) => docDate(d)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Whole days an action is past its due date, or negative days until it is due. */
const daysLate = (due: Date) => Math.round((startOfTodayUtc().getTime() - utcDay(due)) / DAY)

function dueLabel(due: Date): string {
  const late = daysLate(due)
  if (late > 0) return `Overdue ${plural(late, 'day')}`
  if (late === 0) return 'Due today'
  return `Due in ${plural(-late, 'day')}`
}

// ── Weekly corrective actions ───────────────────────────────────────────────

export async function buildWeeklyActions(db: PrismaClient, scope: SummaryScope): Promise<ReportData> {
  const { companyId, companyName, siteName, projectName, siteIds } = scope
  const at = siteIds ? { siteId: { in: siteIds } } : {}
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * DAY)
  const today = startOfTodayUtc()
  const weekAhead = new Date(today.getTime() + 7 * DAY)

  const [open, raised, closed] = await Promise.all([
    db.correctiveAction.findMany({
      where: { companyId, ...at, status: { in: ['open', 'in_progress'] } },
      include: {
        incident: { select: { number: true, department: true } },
        site: { select: { name: true } },
      },
      orderBy: [{ dueDate: 'asc' }],
      take: 3000,
    }),
    db.correctiveAction.count({ where: { companyId, ...at, createdAt: { gte: weekAgo } } }),
    db.correctiveAction.count({ where: { companyId, ...at, completedAt: { gte: weekAgo } } }),
  ])

  const NO_DEPT = 'No department recorded'
  const deptOf = (a: (typeof open)[number]) => a.incident?.department?.trim() || NO_DEPT
  const isOverdue = (a: (typeof open)[number]) => daysLate(a.dueDate) > 0
  const overdue = open.filter(isOverdue)
  const dueSoon = open.filter((a) => a.dueDate >= today && a.dueDate < weekAhead)

  // Departments with overdue work first, then by how much they hold; the unnamed bucket last.
  const byDept = new Map<string, typeof open>()
  for (const a of open) byDept.set(deptOf(a), [...(byDept.get(deptOf(a)) ?? []), a])
  const departments = [...byDept.entries()].sort(([an, a], [bn, b]) => {
    if ((an === NO_DEPT) !== (bn === NO_DEPT)) return an === NO_DEPT ? 1 : -1
    return b.filter(isOverdue).length - a.filter(isOverdue).length || b.length - a.length || an.localeCompare(bn)
  })

  const oldest = overdue[0]
  const owners = new Map<string, { overdue: number; worst: number }>()
  for (const a of overdue) {
    const o = owners.get(a.owner) ?? { overdue: 0, worst: 0 }
    o.overdue += 1
    o.worst = Math.max(o.worst, daysLate(a.dueDate))
    owners.set(a.owner, o)
  }

  const summary = open.length === 0
    ? `No corrective actions are open. In the last 7 days ${plural(raised, 'action was', 'actions were')} raised and ${closed} closed.`
    : [
        `${plural(open.length, 'corrective action is', 'corrective actions are')} open across ${plural(byDept.size, 'department')}.`,
        overdue.length === 0
          ? 'None is overdue.'
          : `${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} overdue; the oldest, ${oldest.code} "${oldest.title}", `
            + `owned by ${oldest.owner}, is ${plural(daysLate(oldest.dueDate), 'day')} late.`,
        dueSoon.length > 0 ? `${dueSoon.length} more fall${dueSoon.length === 1 ? 's' : ''} due in the next 7 days.` : '',
        `In the last 7 days ${raised} ${raised === 1 ? 'was' : 'were'} raised and ${closed} closed.`,
      ].filter(Boolean).join(' ')

  const rows = departments.flatMap(([dept, actions]) =>
    [...actions]
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .map((a) => ({
        department: dept,
        code: a.code,
        title: a.title,
        owner: a.owner,
        due: iso(a.dueDate),
        state: dueLabel(a.dueDate),
        priority: a.priority,
        site: a.site?.name ?? '',
      })))

  return {
    type: 'weekly_actions',
    title: 'Weekly corrective actions',
    companyName,
    siteName,
    projectName,
    generatedAt: now,
    periodStart: null,
    periodEnd: now,
    summary: [
      { label: 'Open actions', value: String(open.length) },
      { label: 'Overdue', value: String(overdue.length) },
      { label: 'Due next 7 days', value: String(dueSoon.length) },
      { label: 'Closed last 7 days', value: String(closed) },
    ],
    columns: [
      { key: 'department', label: 'Department', width: 74 },
      { key: 'code', label: 'Action', width: 48 },
      { key: 'title', label: 'What is outstanding', width: 150 },
      { key: 'owner', label: 'Owner', width: 72 },
      { key: 'due', label: 'Due', width: 52 },
      { key: 'state', label: 'Status', width: 64 },
      { key: 'priority', label: 'Priority', width: 44 },
    ],
    rows,
    emptyMessage: 'No corrective actions are open. Nothing to chase this week.',
    sections: [
      { title: 'Summary', note: summary },
      {
        title: 'By department',
        note: open.length === 0 ? 'Nothing open in any department.' : undefined,
        ...(open.length > 0 ? {
          columns: [
            { key: 'department', label: 'Department', width: 150 },
            { key: 'open', label: 'Open', width: 40 },
            { key: 'overdue', label: 'Overdue', width: 48 },
            { key: 'soon', label: 'Due in 7 days', width: 64 },
            { key: 'worst', label: 'Oldest overdue', width: 72 },
          ],
          rows: departments.map(([dept, actions]) => {
            const late = actions.filter(isOverdue)
            const worst = late.reduce((n, a) => Math.max(n, daysLate(a.dueDate)), 0)
            return {
              department: dept,
              open: String(actions.length),
              overdue: String(late.length),
              soon: String(actions.filter((a) => a.dueDate >= today && a.dueDate < weekAhead).length),
              worst: worst ? plural(worst, 'day') : '-',
            }
          }),
        } : {}),
      },
      {
        title: 'Owners with overdue actions',
        note: owners.size === 0 ? 'Nobody has an overdue action.' : undefined,
        ...(owners.size > 0 ? {
          columns: [
            { key: 'owner', label: 'Owner', width: 150 },
            { key: 'overdue', label: 'Overdue', width: 48 },
            { key: 'worst', label: 'Longest late', width: 72 },
          ],
          rows: [...owners.entries()]
            .sort(([, a], [, b]) => b.overdue - a.overdue || b.worst - a.worst)
            .map(([owner, o]) => ({ owner, overdue: String(o.overdue), worst: plural(o.worst, 'day') })),
        } : {}),
      },
    ],
  }
}

// ── Site activity, today or this week ───────────────────────────────────────

export async function buildSiteActivity(
  db: PrismaClient, scope: SummaryScope, period: ActivityPeriod, timezone: string,
): Promise<ReportData> {
  const { companyId, companyName, siteName, projectName, siteIds } = scope
  const at = siteIds ? { siteId: { in: siteIds } } : {}
  const now = new Date()

  // Local midnight today, or local midnight six days ago: "this week" is the last seven
  // calendar days including today, cut in the site's own timezone.
  const here = localParts(now, timezone)
  const todayStart = instantForLocal(here.year, here.month, here.day, 0, 0, timezone)
  const back = localParts(new Date(todayStart.getTime() - (period === 'week' ? 6 : 0) * DAY + 12 * 3600_000), timezone)
  const start = instantForLocal(back.year, back.month, back.day, 0, 0, timezone)
  const inWindow = { gte: start, lte: now }
  const fmt = (d: Date, withTime = false) => new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : { year: 'numeric' }),
    timeZone: timezone,
  }).format(d)
  const periodLabel = period === 'day'
    ? `${fmt(now)} (${timezone})`
    : `${fmt(start)} to ${fmt(now)} (${timezone})`

  const [incidents, meetings, permitsIssued, permitsClosed, permitsActive, inspections, raised, closed, overdueNow] =
    await Promise.all([
      db.incident.findMany({
        where: { companyId, ...at, archived: false, occurredAt: inWindow },
        include: { site: { select: { name: true } } },
        orderBy: { occurredAt: 'asc' },
        take: 500,
      }),
      db.toolboxMeeting.findMany({
        where: { companyId, ...at, heldAt: inWindow },
        include: { site: { select: { name: true } } },
        orderBy: { heldAt: 'asc' },
        take: 500,
      }),
      db.permit.findMany({
        where: { companyId, ...at, createdAt: inWindow },
        include: { site: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      db.permit.count({ where: { companyId, ...at, closedAt: inWindow } }),
      db.permit.count({ where: { companyId, ...at, status: 'active' } }),
      db.inspection.findMany({
        where: { companyId, ...at, completedAt: inWindow },
        select: { outcome: true },
        take: 2000,
      }),
      db.correctiveAction.count({ where: { companyId, ...at, createdAt: inWindow } }),
      db.correctiveAction.count({ where: { companyId, ...at, completedAt: inWindow } }),
      db.correctiveAction.count({ where: { companyId, ...at, ...overdueActionWhere() } }),
    ])

  const injuries = incidents.filter(isInjury).length
  const nearMisses = incidents.filter(isNearMiss).length
  const highRisk = incidents.filter((i) => i.highRisk).length
  const briefed = meetings.reduce((n, m) => n + m.headcount, 0)
  const failed = inspections.filter((i) => i.outcome === 'failed').length
  const when = period === 'day' ? 'Today' : 'In the last 7 days'

  const summary = [
    incidents.length === 0
      ? `${when} no incidents were reported.`
      : `${when} ${plural(incidents.length, 'incident was', 'incidents were')} reported`
        + ` (${plural(nearMisses, 'near miss', 'near misses')}, ${plural(injuries, 'injury', 'injuries')}`
        + `${highRisk ? `, ${highRisk} high risk` : ''}).`,
    meetings.length === 0
      ? 'No toolbox meetings were recorded.'
      : `${plural(meetings.length, 'toolbox meeting')} briefed ${briefed.toLocaleString('en-MY')} people.`,
    `${plural(permitsIssued.length, 'permit was', 'permits were')} raised and ${permitsClosed} closed; ${permitsActive} ${permitsActive === 1 ? 'is' : 'are'} active now.`,
    inspections.length > 0
      ? `${plural(inspections.length, 'inspection was', 'inspections were')} completed${failed ? `, ${failed} failed` : ''}.`
      : '',
    `${plural(raised, 'corrective action was', 'corrective actions were')} raised and ${closed} closed; ${overdueNow} ${overdueNow === 1 ? 'is' : 'are'} overdue.`,
  ].filter(Boolean).join(' ')

  return {
    type: 'site_activity',
    title: period === 'day' ? 'Site activity - today' : 'Site activity - last 7 days',
    companyName,
    siteName,
    projectName,
    generatedAt: now,
    periodStart: start,
    periodEnd: now,
    periodLabel,
    summary: [
      { label: 'Incidents', value: String(incidents.length) },
      { label: 'Toolbox briefed', value: briefed.toLocaleString('en-MY') },
      { label: 'Permits raised', value: String(permitsIssued.length) },
      { label: 'Actions overdue', value: String(overdueNow) },
    ],
    columns: [
      { key: 'number', label: 'Incident', width: 56 },
      { key: 'occurred', label: 'Occurred', width: 66 },
      { key: 'type', label: 'Type', width: 64 },
      { key: 'severity', label: 'Severity', width: 60 },
      { key: 'site', label: 'Site', width: 70 },
      { key: 'title', label: 'What happened', width: 140 },
      { key: 'stage', label: 'Stage', width: 60 },
    ],
    rows: incidents.map((i) => ({
      number: i.number,
      occurred: fmt(i.occurredAt, true),
      type: typeName(i.type),
      severity: severityName(i.severity),
      site: i.site?.name ?? '',
      title: i.title,
      stage: stageLabel(i.stage),
    })),
    emptyMessage: period === 'day' ? 'No incidents were reported today.' : 'No incidents were reported in the last 7 days.',
    sections: [
      { title: 'Summary', note: summary },
      {
        title: 'Toolbox meetings',
        note: meetings.length === 0 ? 'None recorded in this period.' : undefined,
        ...(meetings.length > 0 ? {
          columns: [
            { key: 'number', label: 'Meeting', width: 56 },
            { key: 'held', label: 'Held', width: 66 },
            { key: 'site', label: 'Site', width: 80 },
            { key: 'topic', label: 'Topic', width: 170 },
            { key: 'ledBy', label: 'Led by', width: 70 },
            { key: 'headcount', label: 'Present', width: 44 },
          ],
          rows: meetings.map((m) => ({
            number: m.number, held: fmt(m.heldAt, true), site: m.site?.name ?? '',
            topic: m.topic, ledBy: m.ledBy, headcount: m.headcount.toLocaleString('en-MY'),
          })),
        } : {}),
      },
      {
        title: 'Permits to work',
        stats: [
          { label: 'Raised', value: String(permitsIssued.length) },
          { label: 'Closed', value: String(permitsClosed) },
          { label: 'Active now', value: String(permitsActive) },
        ],
        ...(permitsIssued.length > 0 ? {
          columns: [
            { key: 'code', label: 'Permit', width: 56 },
            { key: 'type', label: 'Type', width: 90 },
            { key: 'site', label: 'Site', width: 80 },
            { key: 'title', label: 'Work', width: 190 },
            { key: 'status', label: 'Status', width: 70 },
          ],
          rows: permitsIssued.map((p) => ({
            code: p.code, type: PERMIT_TYPE_LABEL[p.type] ?? humanize(p.type), site: p.site?.name ?? '', title: p.title,
            status: PERMIT_STATUS_LABEL[p.status] ?? humanize(p.status),
          })),
        } : {}),
      },
      {
        title: 'Inspections and corrective actions',
        stats: [
          { label: 'Inspections done', value: String(inspections.length) },
          { label: 'Inspections failed', value: String(failed) },
          { label: 'Actions raised', value: String(raised) },
          { label: 'Actions closed', value: String(closed) },
          { label: 'Actions overdue', value: String(overdueNow) },
        ],
      },
    ],
  }
}
