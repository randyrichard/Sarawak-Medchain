import { endOfLocalDate, recentLocalMonths, todayDate } from './businessDay.js'

/**
 * The corrective action analytics, from the workspace's own actions.
 *
 * The Analytics tab used to take every panel but two from the browser's demo data, so a
 * real workspace was shown a sample company's owners, sites and monthly trend with its own
 * completion rate pasted on top. Each figure here is counted from the rows passed in and
 * nothing else; a figure with nothing to count is null rather than a confident zero.
 */

export interface PanelRow {
  status: string
  owner: string
  siteId: string
  dueDate: Date
  createdAt: Date
  completedAt: Date | null
  verifiedAt: Date | null
  /** The department of the incident it came from. Actions from audits and inspections have none. */
  department: string | null
}

export const NO_DEPARTMENT = 'Not from an incident'

const OPEN = new Set(['open', 'in_progress'])
/** Still somebody's work: being done, or done and waiting to be checked. */
const LOAD = new Set(['open', 'in_progress', 'completed'])

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

export function actionPanels(rows: PanelRow[], now = new Date()) {
  const live = rows.filter((r) => r.status !== 'cancelled')
  const today = todayDate(now)
  const overdue = (r: PanelRow) => OPEN.has(r.status) && r.dueDate < today
  const done = live.filter((r) => r.status === 'verified')

  /*
   * Creation to verification - the moment somebody other than the owner agreed it was
   * fixed. A record finished before it was created was entered after the fact, so it has
   * no close time to give; counting it made the average negative.
   */
  const closeDays = done.flatMap((r) => {
    const end = r.verifiedAt ?? r.completedAt
    const days = end ? (end.getTime() - r.createdAt.getTime()) / 86_400_000 : -1
    return days >= 0 ? [days] : []
  })
  const avgCloseDays = closeDays.length
    ? Math.round((closeDays.reduce((a, b) => a + b, 0) / closeDays.length) * 10) / 10
    : null

  // On time means finished on or before the due date, which is a whole local day.
  const finished = live.filter((r) => r.completedAt)
  const onTime = (r: PanelRow) => r.completedAt! <= endOfLocalDate(r.dueDate)

  const overdueBySite = new Map<string, number>()
  const loadBySite = new Map<string, number>()
  const byDept = new Map<string, { done: number; onTime: number }>()
  const byOwner = new Map<string, { open: number; overdue: number; completed: number }>()
  for (const r of live) {
    if (overdue(r)) overdueBySite.set(r.siteId, (overdueBySite.get(r.siteId) ?? 0) + 1)
    if (LOAD.has(r.status)) loadBySite.set(r.siteId, (loadBySite.get(r.siteId) ?? 0) + 1)
    if (r.completedAt) {
      const name = r.department?.trim() || NO_DEPARTMENT
      const d = byDept.get(name) ?? { done: 0, onTime: 0 }
      d.done++
      if (onTime(r)) d.onTime++
      byDept.set(name, d)
    }
    if (r.owner.trim()) {
      const o = byOwner.get(r.owner) ?? { open: 0, overdue: 0, completed: 0 }
      if (r.status === 'verified') o.completed++
      else o.open++
      if (overdue(r)) o.overdue++
      byOwner.set(r.owner, o)
    }
  }

  const worst = [...overdueBySite.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

  const within = (d: Date | null, m: { start: Date; end: Date }) => d !== null && d >= m.start && d < m.end
  const monthly = recentLocalMonths(6, now).map((m) => ({
    month: m.label,
    created: live.filter((r) => within(r.createdAt, m)).length,
    completed: live.filter((r) => within(r.verifiedAt ?? r.completedAt, m)).length,
  }))

  return {
    completionRate: pct(done.length, live.length),
    avgCloseDays,
    onTimeRate: pct(finished.filter(onTime).length, finished.length),
    mostOverdueSite: worst ? { siteId: worst[0], count: worst[1] } : null,
    bySite: [...loadBySite.entries()]
      .map(([siteId, open]) => ({ siteId, open }))
      .sort((a, b) => b.open - a.open || a.siteId.localeCompare(b.siteId)),
    byDepartment: [...byDept.entries()]
      .map(([name, v]) => ({ name, onTimePct: pct(v.onTime, v.done)!, completed: v.done }))
      .sort((a, b) => b.onTimePct - a.onTimePct || a.name.localeCompare(b.name)),
    // Heaviest first: overdue work counts double, because it is the work already late.
    byOwner: [...byOwner.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.open + b.overdue * 2 - (a.open + a.overdue * 2) || a.name.localeCompare(b.name))
      .slice(0, 8),
    monthly,
  }
}
