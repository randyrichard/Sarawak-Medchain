/**
 * The sweeps that make the product's promises true.
 *
 * Every list screen states a policy — corrective actions are chased at 7/3/1 days and
 * escalated when they slip, certificates warn at 90/60/30/7 days, inspections that fall
 * due are raised. Until now nothing ran them, so those statements described an intention
 * rather than a behaviour. A safety system whose reminders do not fire is a spreadsheet
 * with better typography.
 *
 * Design notes worth keeping:
 *
 *  - **In-process, single instance.** A pilot runs one API. Two instances would each
 *    sweep and race; the dedupe below makes that harmless rather than duplicating, but
 *    the intended deployment is one. Moving to a separate worker is a later change.
 *  - **Idempotent by construction.** A sweep runs every fifteen minutes and must not
 *    re-announce what it announced last time. Each notification carries an `href` that
 *    encodes the record *and* the reason — `/actions/abc?due=7` — and the sweep skips
 *    anything already raised under that key. The link a user clicks and the key that
 *    stops a duplicate are the same string, so they cannot drift apart.
 *  - **Never fatal.** A sweep that throws must not take the API down with it. Each pass
 *    is wrapped, failures are logged, and the next tick tries again.
 */
import type { PrismaClient } from '@prisma/client'

const MINUTE = 60_000
const DAY = 86400_000

/** How often the reminder sweep runs. Matches what the admin console advertises. */
const SWEEP_INTERVAL_MS = 15 * MINUTE

/** Days before a due date at which an action is chased. */
const ACTION_REMINDER_DAYS = [7, 3, 1]

/** Days past due at which an overdue action is escalated, and to whom. */
const ESCALATIONS: { afterDays: number; to: string }[] = [
  { afterDays: 3, to: 'the site manager' },
  { afterDays: 7, to: 'the HSE manager' },
]

/** Days before expiry at which a certificate is flagged. */
const CERT_EXPIRY_DAYS = [90, 60, 30, 7]

/**
 * How far back a sweep will look.
 *
 * Measured against a year of imported history, the first sweep raised 3,361 notifications
 * in one pass — enough to make the bell useless on the customer's first morning. Something
 * three hundred days overdue is a backlog, and the register is where you work a backlog;
 * a notification is for what changed. Anything past this window is left to the registers,
 * which show it plainly.
 */
const LOOKBACK_DAYS = 45

/**
 * Ceiling on notifications from a single pass, **per workspace**.
 *
 * Belt to the lookback's braces: a first run against a large import should announce the
 * most urgent items and let the next sweep continue, rather than emptying the backlog
 * into somebody's notification bell in one go.
 *
 * Per workspace rather than per sweep, because the sweep spans every tenant. A single
 * global ceiling would let one customer with a large backlog consume the whole budget in
 * due-date order and silence everybody else's reminders indefinitely — a tenant starving
 * another tenant, which is precisely what a shared deployment must never allow.
 */
const MAX_PER_SWEEP_PER_COMPANY = 200

/**
 * Per-workspace budget for one sweep.
 *
 * Counts notifications *raised*, not rows considered. Charging a row that turned out to
 * be a duplicate would let the second sweep spend its whole budget re-checking what the
 * first one already announced, and the backlog would never advance.
 */
class Budget {
  private used = new Map<string, number>()
  exhausted(companyId: string): boolean {
    return (this.used.get(companyId) ?? 0) >= MAX_PER_SWEEP_PER_COMPANY
  }
  spend(companyId: string): void {
    this.used.set(companyId, (this.used.get(companyId) ?? 0) + 1)
  }
}

export type JobId = 'j1' | 'j2'

/**
 * When each sweep last completed, in this process. Deliberately not persisted: after a
 * restart the honest answer is that this process has not run it yet, and the admin
 * console renders exactly that rather than inventing a timestamp.
 */
const lastRuns = new Map<JobId, string>()
export const getLastRuns = (): Record<string, string | null> => ({
  j1: lastRuns.get('j1') ?? null,
  j2: lastRuns.get('j2') ?? null,
})

/** UTC midnight, matching how every date-only value in this codebase is stored. */
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const daysBetween = (a: Date, b: Date) => Math.round((utcDay(a).getTime() - utcDay(b).getTime()) / DAY)

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private db: PrismaClient) {}

  /**
   * Raises a notification unless one already exists for this exact reason.
   *
   * Returns whether it created anything, which is what the sweep counts. The existence
   * check and the insert are not in a transaction: two racing sweeps could both pass the
   * check, and the cost of that is one duplicate bell, which is not worth a lock.
   */
  private async raise(
    budget: Budget, companyId: string, kind: string, title: string, detail: string, href: string,
  ): Promise<boolean> {
    if (budget.exhausted(companyId)) return false

    const existing = await this.db.notification.findFirst({
      where: { companyId, href },
      select: { id: true },
    })
    // A duplicate costs nothing: the budget exists to bound what a customer is shown, and
    // showing them nothing is not something to charge for.
    if (existing) return false

    try {
      await this.db.notification.create({
        data: { companyId, kind, title: title.slice(0, 300), detail: detail.slice(0, 1000), href },
      })
    } catch (err) {
      // One row must never abort the pass. A workspace deleted between the query above and
      // this insert violates the foreign key, and without this every other tenant's
      // reminders would be lost for that sweep because of a tenant that no longer exists.
      // eslint-disable-next-line no-console
      console.warn(`[safeops-scheduler] skipped a notification for ${companyId}:`, err)
      return false
    }
    budget.spend(companyId)
    return true
  }

  /**
   * Corrective actions approaching or past their date.
   *
   * Only open and in-progress actions are chased. A completed action awaiting
   * verification has already had the work done, and chasing its owner would be noise.
   */
  async sweepActions(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...ACTION_REMINDER_DAYS) * DAY)
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)
    const actions = await this.db.correctiveAction.findMany({
      where: {
        status: { in: ['open', 'in_progress'] },
        // Bounded at both ends: nothing beyond the last reminder day, and nothing so old
        // that announcing it today would be news to no one.
        dueDate: { lte: horizon, gte: floor },
      },
      // Most urgent first, so a capped pass announces what matters most.
      orderBy: { dueDate: 'asc' },
      select: { id: true, code: true, title: true, owner: true, dueDate: true, companyId: true, priority: true },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const a of actions) {
      if (budget.exhausted(a.companyId)) continue
      const days = daysBetween(a.dueDate, now)

      if (days > 0) {
        if (!ACTION_REMINDER_DAYS.includes(days)) continue
        if (await this.raise(
          budget, a.companyId, 'action',
          `${a.code} is due in ${days} day${days === 1 ? '' : 's'}`,
          `${a.title} — owned by ${a.owner}.`,
          `/actions/${a.id}?due=${days}`,
        )) raised++
        continue
      }

      if (days === 0) {
        if (await this.raise(
          budget, a.companyId, 'action',
          `${a.code} is due today`,
          `${a.title} — owned by ${a.owner}.`,
          `/actions/${a.id}?due=0`,
        )) raised++
        continue
      }

      // Past due. Announce the lapse once, then once per escalation threshold.
      const overdueBy = Math.abs(days)
      if (await this.raise(
        budget, a.companyId, 'action',
        `${a.code} is overdue`,
        `${a.title} — owned by ${a.owner}, ${overdueBy} day${overdueBy === 1 ? '' : 's'} past due.`,
        `/actions/${a.id}?overdue=1`,
      )) raised++

      for (const step of ESCALATIONS) {
        if (overdueBy < step.afterDays) continue
        if (await this.raise(
          budget, a.companyId, 'action',
          `${a.code} escalated to ${step.to}`,
          `${a.title} — ${overdueBy} days past due, owned by ${a.owner}.`,
          `/actions/${a.id}?escalated=${step.afterDays}`,
        )) raised++
      }
    }
    return raised
  }

  /** Assets whose inspection has fallen due. */
  async sweepInspections(now = new Date()): Promise<number> {
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)
    const assets = await this.db.asset.findMany({
      where: {
        status: { in: ['in_service', 'under_maintenance'] },
        nextDueDate: { lte: now, gte: floor },
      },
      orderBy: { nextDueDate: 'asc' },
      select: { id: true, code: true, name: true, owner: true, nextDueDate: true, companyId: true },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const a of assets) {
      if (budget.exhausted(a.companyId)) continue
      const overdueBy = Math.abs(daysBetween(a.nextDueDate, now))
      if (await this.raise(
        budget, a.companyId, 'system',
        `Inspection overdue: ${a.name}`,
        `${a.code} is ${overdueBy} day${overdueBy === 1 ? '' : 's'} past its inspection date. Owner: ${a.owner}.`,
        // The due date is part of the key: when the inspection is done and the date rolls
        // forward, the next lapse is a new event and gets its own notification.
        `/assets?asset=${a.id}&overdue=${a.nextDueDate.toISOString().slice(0, 10)}`,
      )) raised++
    }
    return raised
  }

  /**
   * Certificates approaching expiry, and those that have lapsed.
   *
   * Only the most recently issued certificate for a person and course is considered —
   * a renewal supersedes its predecessor, and warning about the old one would be wrong.
   */
  async sweepCertificates(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...CERT_EXPIRY_DAYS) * DAY)
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)
    const certs = await this.db.certificate.findMany({
      where: { expiryDate: { not: null, lte: horizon, gte: floor } },
      select: {
        id: true, number: true, courseName: true, expiryDate: true, companyId: true,
        employeeId: true, courseId: true, issueDate: true,
        employee: { select: { name: true } },
      },
      orderBy: { issueDate: 'desc' },
      take: 5000,
    })

    // Keep only the current certificate per employee and course.
    const current = new Map<string, (typeof certs)[number]>()
    for (const c of certs) {
      const key = `${c.employeeId}:${c.courseId}`
      if (!current.has(key)) current.set(key, c)
    }

    const budget = new Budget()
    let raised = 0
    for (const c of current.values()) {
      if (!c.expiryDate) continue
      if (budget.exhausted(c.companyId)) continue
      const days = daysBetween(c.expiryDate, now)

      if (days < 0) {
        if (await this.raise(
          budget, c.companyId, 'system',
          `Competency lapsed: ${c.employee?.name ?? 'employee'} — ${c.courseName}`,
          `Certificate ${c.number} expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago.`,
          `/training?cert=${c.id}&expired=1`,
        )) raised++
        continue
      }

      if (!CERT_EXPIRY_DAYS.includes(days)) continue
      if (await this.raise(
        budget, c.companyId, 'system',
        `${c.courseName} expires in ${days} days — ${c.employee?.name ?? 'employee'}`,
        `Certificate ${c.number} lapses on ${c.expiryDate.toISOString().slice(0, 10)}. Book a renewal.`,
        `/training?cert=${c.id}&expiring=${days}`,
      )) raised++
    }
    return raised
  }

  /** One full pass. Safe to call directly; that is how the tests drive it. */
  async runOnce(now = new Date()): Promise<{ actions: number; inspections: number; certificates: number }> {
    const actions = await this.sweepActions(now)
    const inspections = await this.sweepInspections(now)
    lastRuns.set('j1', new Date().toISOString())

    const certificates = await this.sweepCertificates(now)
    lastRuns.set('j2', new Date().toISOString())

    return { actions, inspections, certificates }
  }

  /**
   * Begins sweeping. The first pass runs immediately so a freshly started instance is
   * current rather than fifteen minutes behind.
   */
  start(intervalMs = SWEEP_INTERVAL_MS) {
    if (this.timer) return
    const tick = async () => {
      if (this.running) return // a slow pass must not overlap the next tick
      this.running = true
      try {
        const n = await this.runOnce()
        const total = n.actions + n.inspections + n.certificates
        if (total > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[safeops-scheduler] raised ${total} notification(s): ` +
            `${n.actions} action, ${n.inspections} inspection, ${n.certificates} certificate`,
          )
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[safeops-scheduler] sweep failed:', err)
      } finally {
        this.running = false
      }
    }

    void tick()
    this.timer = setInterval(() => void tick(), intervalMs)
    // Do not hold the event loop open on shutdown.
    this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
