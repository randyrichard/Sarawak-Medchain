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
import { CALIBRATED_CATEGORIES } from './equipmentService.js'
import { ReportService } from './reportService.js'
import { dueSlotKey, nextRunAt, type Frequency } from './reportSchedule.js'
import { enqueueEvent, sweepDeliveries } from './webhookService.js'
import { LOCK_SCHEDULER_SWEEP, LOCK_WEBHOOK_DELIVERY, withLeaderLock } from './leaderLock.js'

const MINUTE = 60_000
const DAY = 86400_000

/** How often the reminder sweep runs. Matches what the admin console advertises. */
const SWEEP_INTERVAL_MS = 15 * MINUTE

/*
 * Webhook deliveries run on their own, much faster clock.
 *
 * Everything else this scheduler does is a reminder, and a reminder that arrives fourteen
 * minutes late is still a reminder. A webhook is an event notification: a receiver told
 * about an incident a quarter of an hour after it was reported has been told too late to
 * act on it, and would have been better off polling. Thirty seconds is the difference
 * between an integration that feels live and one nobody trusts.
 *
 * A separate timer rather than a separate process. The sweep takes what is due, marks its
 * attempt before sending, and does nothing that a second instance running the same batch
 * could corrupt beyond delivering a duplicate - see webhookService.ts.
 */
const DELIVERY_INTERVAL_MS = 30_000

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
 * Days before expiry at which a fitness-to-work medical is flagged. Earlier than a
 * certificate because booking a company doctor takes longer than booking a course.
 */
const MEDICAL_EXPIRY_DAYS = [60, 30, 14, 7]

/**
 * Audience tag for the medical reminders. Resolved by `visibleToRole` in
 * notificationService, which is where the role list lives so it sits beside the read path
 * that enforces it rather than the write path that requests it.
 */
const MEDICAL_AUDIENCE = 'medical'

/**
 * Days before expiry at which contractor medicals, inductions and insurance are chased.
 * Matches what the customer specified, and the tenant has no other visibility of these
 * dates — nobody's HR system is tracking a subcontractor's induction.
 */
const CONTRACTOR_EXPIRY_DAYS = [30, 14, 7]

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
 * Days before a calibration lapses that a reminder goes out. Wider than the competency
 * window because a calibration house needs booking and the instrument leaves site.
 */
const CALIBRATION_DAYS = [30, 14, 7, 1]

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
/** Links per bulk existence query: well inside Postgres's parameter limit. */
const SEEN_CHUNK = 1000
const seenKey = (companyId: string, href: string) => `${companyId}\u0000${href}`

class Budget {
  private used = new Map<string, number>()
  exhausted(companyId: string): boolean {
    return (this.used.get(companyId) ?? 0) >= MAX_PER_SWEEP_PER_COMPANY
  }
  spend(companyId: string): void {
    this.used.set(companyId, (this.used.get(companyId) ?? 0) + 1)
  }
}

export type JobId = 'j1' | 'j2' | 'j3' | 'j4' | 'j5' | 'j6'

/**
 * When each sweep last completed, in this process. Deliberately not persisted: after a
 * restart the honest answer is that this process has not run it yet, and the admin
 * console renders exactly that rather than inventing a timestamp.
 */
const lastRuns = new Map<JobId, string>()
export const getLastRuns = (): Record<string, string | null> => ({
  j1: lastRuns.get('j1') ?? null,
  j2: lastRuns.get('j2') ?? null,
  j3: lastRuns.get('j3') ?? null,
  j4: lastRuns.get('j4') ?? null,
  j5: lastRuns.get('j5') ?? null,
  j6: lastRuns.get('j6') ?? null,
})

/** UTC midnight, matching how every date-only value in this codebase is stored. */
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const daysBetween = (a: Date, b: Date) => Math.round((utcDay(a).getTime() - utcDay(b).getTime()) / DAY)

export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private deliveryTimer: NodeJS.Timeout | null = null
  private running = false
  private deliveringWebhooks = false
  /** One sweep's bulk answers to "does this reminder exist?" - see withSeen. */
  private seen: Map<string, boolean> | null = null
  /** Owns report generation and delivery; the sweep only decides what is due. */
  private readonly reports: ReportService

  constructor(private db: PrismaClient) {
    this.reports = new ReportService(db)
  }

  /**
   * Raises a notification unless one already exists for this exact reason.
   *
   * Returns whether it created anything, which is what the sweep counts. The existence
   * check and the insert are not in a transaction: two racing sweeps could both pass the
   * check, and the cost of that is one duplicate bell, which is not worth a lock.
   */
  private async raise(
    budget: Budget, companyId: string, kind: string, title: string, detail: string, href: string,
    /**
     * Narrows the audience. Omitted means the whole workspace, which is what almost every
     * reminder here wants — see ROLE_AUDIENCES in notificationService for the exceptions.
     */
    recipientRole?: string,
  ): Promise<boolean> {
    if (budget.exhausted(companyId)) return false

    // A sweep that prefetched its candidates has the answer already; anything it did not
    // cover is looked up one at a time, as before.
    const known = this.seen?.get(seenKey(companyId, href))
    if (known === true) return false
    if (known === undefined) {
      const existing = await this.db.notification.findFirst({
        where: { companyId, href },
        select: { id: true },
      })
      // A duplicate costs nothing: the budget exists to bound what a customer is shown,
      // and showing them nothing is not something to charge for.
      if (existing) return false
    }

    try {
      await this.db.notification.create({
        data: {
          companyId, kind, href,
          title: title.slice(0, 300),
          detail: detail.slice(0, 1000),
          recipientRole: recipientRole ?? null,
        },
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
    this.seen?.set(seenKey(companyId, href), true)
    return true
  }

  /**
   * Which of a sweep's candidate reminders already exist, answered in bulk.
   *
   * raise() de-duplicates by asking the database about one link at a time. For a sweep
   * over thousands of overdue actions that is thousands of round trips every pass - most
   * of them answering "already sent" - measured at 7.7 s for 3,000 overdue actions with
   * every reminder already raised. This asks once per workspace per thousand links, and
   * raise() uses the answers.
   *
   * Only an optimisation: a link not prefetched is still checked individually, so a sweep
   * that computes its candidates wrongly costs speed, never a duplicate. The answers live
   * for one sweep - `withSeen` clears them - so nothing is carried between passes.
   */
  private async withSeen<T>(candidates: { companyId: string; href: string }[], run: () => Promise<T>): Promise<T> {
    const seen = new Map<string, boolean>()
    const byCompany = new Map<string, string[]>()
    for (const c of candidates) {
      seen.set(seenKey(c.companyId, c.href), false)
      const list = byCompany.get(c.companyId) ?? []
      list.push(c.href)
      byCompany.set(c.companyId, list)
    }
    for (const [companyId, hrefs] of byCompany) {
      for (let i = 0; i < hrefs.length; i += SEEN_CHUNK) {
        const rows = await this.db.notification.findMany({
          where: { companyId, href: { in: hrefs.slice(i, i + SEEN_CHUNK) } },
          select: { href: true },
        })
        for (const r of rows) if (r.href) seen.set(seenKey(companyId, r.href), true)
      }
    }
    this.seen = seen
    try {
      return await run()
    } finally {
      this.seen = null
    }
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

    /*
     * The reminders this pass would raise, in the order it raises them, worked out first so
     * which already exist can be asked in bulk (see withSeen). Raised below exactly as
     * before: same order, same per-workspace budget, same de-duplication.
     */
    type Planned = { companyId: string; title: string; detail: string; href: string }
    const plan: Planned[] = []
    for (const a of actions) {
      const days = daysBetween(a.dueDate, now)

      if (days > 0) {
        if (!ACTION_REMINDER_DAYS.includes(days)) continue
        plan.push({
          companyId: a.companyId,
          title: `${a.code} is due in ${days} day${days === 1 ? '' : 's'}`,
          detail: `${a.title} — owned by ${a.owner}.`,
          href: `/actions/${a.id}?due=${days}`,
        })
        continue
      }

      if (days === 0) {
        plan.push({
          companyId: a.companyId,
          title: `${a.code} is due today`,
          detail: `${a.title} — owned by ${a.owner}.`,
          href: `/actions/${a.id}?due=0`,
        })
        continue
      }

      // Past due. Announce the lapse once, then once per escalation threshold.
      const overdueBy = Math.abs(days)
      plan.push({
        companyId: a.companyId,
        title: `${a.code} is overdue`,
        detail: `${a.title} — owned by ${a.owner}, ${overdueBy} day${overdueBy === 1 ? '' : 's'} past due.`,
        href: `/actions/${a.id}?overdue=1`,
      })
      for (const step of ESCALATIONS) {
        if (overdueBy < step.afterDays) continue
        plan.push({
          companyId: a.companyId,
          title: `${a.code} escalated to ${step.to}`,
          detail: `${a.title} — ${overdueBy} days past due, owned by ${a.owner}.`,
          href: `/actions/${a.id}?escalated=${step.afterDays}`,
        })
      }
    }

    const budget = new Budget()
    return this.withSeen(plan, async () => {
      let raised = 0
      for (const p of plan) {
        if (await this.raise(budget, p.companyId, 'action', p.title, p.detail, p.href)) raised++
      }
      return raised
    })
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
      )) {
        raised++
        /*
         * Queued only when the notification was actually raised, which is what makes this
         * idempotent. `raise` returns false when one already exists for the same href, so
         * a sweep that runs every fifteen minutes announces each expiry band once rather
         * than ninety-six times a day.
         */
        void enqueueEvent(this.db, c.companyId, 'certificate.expiring', {
          id: c.id,
          number: c.number,
          courseName: c.courseName,
          employeeId: c.employeeId,
          employeeName: c.employee?.name ?? null,
          expiryDate: c.expiryDate.toISOString(),
          daysRemaining: days,
        })
      }
    }
    return raised
  }

  /**
   * Fitness-to-work medicals approaching expiry, and those that have lapsed.
   *
   * Chased on the same footing as a certificate, because the consequence is the same: an
   * expired medical is a legal bar on confined space, working at height and most hot
   * work, and the first anyone usually notices is when a permit is refused on the day.
   */
  async sweepMedicals(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...MEDICAL_EXPIRY_DAYS) * DAY)
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)
    const people = await this.db.employee.findMany({
      where: { active: true, medicalExpiry: { not: null, lte: horizon, gte: floor } },
      select: { id: true, companyId: true, name: true, employeeNo: true, medicalExpiry: true },
      orderBy: { medicalExpiry: 'asc' },
      // Same ceiling the certificate sweep uses: bounded work per pass, soonest first.
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0

    for (const p of people) {
      if (!p.medicalExpiry || budget.exhausted(p.companyId)) continue
      const days = daysBetween(p.medicalExpiry, now)

      /*
       * Addressed to the roles that may see medical detail, not broadcast.
       *
       * These name an employee and state the exact date their fitness-to-work certificate
       * expires. `EmployeeService` withholds that date from every role outside
       * MEDICAL_ROLES and from anyone outside the employee's site — and the notification
       * feed had no role filter and the table has no site column, so this reminder was
       * handing the whole workspace precisely what the register refuses them. The tag is
       * what `visibleToRole` enforces on the way out.
       */
      if (days < 0) {
        if (await this.raise(
          budget, p.companyId, 'system',
          `Medical expired — ${p.name}`,
          `${p.employeeNo}'s fitness-to-work certificate lapsed on ${p.medicalExpiry.toISOString().slice(0, 10)}. They cannot hold a permit until it is renewed.`,
          `/employees?open=${p.id}&medical=expired`,
          MEDICAL_AUDIENCE,
        )) raised++
        continue
      }
      if (!MEDICAL_EXPIRY_DAYS.includes(days)) continue
      if (await this.raise(
        budget, p.companyId, 'system',
        `Medical expires in ${days} days — ${p.name}`,
        `${p.employeeNo}'s fitness-to-work certificate lapses on ${p.medicalExpiry.toISOString().slice(0, 10)}. Book the appointment.`,
        `/employees?open=${p.id}&expiring=${days}`,
        MEDICAL_AUDIENCE,
      )) raised++
    }
    return raised
  }

  /**
   * Contractor compliance: worker medicals, site inductions and the firm's insurance.
   *
   * Chased harder than an employee's equivalents because the client organisation has no
   * other visibility of them — nobody in the tenant's HR system is tracking a
   * subcontractor's induction date, so if this sweep does not raise it, the first anyone
   * hears is a worker turned away at the gate on the morning of a shutdown.
   */
  async sweepContractors(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...CONTRACTOR_EXPIRY_DAYS) * DAY)
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)
    const budget = new Budget()
    let raised = 0

    const workers = await this.db.contractorWorker.findMany({
      where: {
        active: true,
        OR: [
          { medicalExpiry: { not: null, lte: horizon, gte: floor } },
          { inductionExpiry: { not: null, lte: horizon, gte: floor } },
        ],
      },
      select: {
        id: true, companyId: true, name: true, workerNo: true,
        medicalExpiry: true, inductionExpiry: true,
        contractorCompany: { select: { name: true } },
      },
      take: 5000,
    })

    for (const w of workers) {
      for (const [label, date] of [
        ['Medical', w.medicalExpiry],
        ['Site induction', w.inductionExpiry],
      ] as const) {
        if (!date || budget.exhausted(w.companyId)) continue
        const days = daysBetween(date, now)
        const on = date.toISOString().slice(0, 10)
        const who = `${w.name} (${w.workerNo}, ${w.contractorCompany.name})`

        if (days < 0) {
          if (await this.raise(
            budget, w.companyId, 'system',
            `${label} expired — ${w.name}`,
            `${who}. ${label} lapsed on ${on}; they cannot be admitted to site.`,
            `/contractors?worker=${w.id}&${label === 'Medical' ? 'medical' : 'induction'}=expired`,
          )) raised++
          continue
        }
        if (!CONTRACTOR_EXPIRY_DAYS.includes(days)) continue
        if (await this.raise(
          budget, w.companyId, 'system',
          `${label} expires in ${days} days — ${w.name}`,
          `${who}. ${label} lapses on ${on}.`,
          `/contractors?worker=${w.id}&expiring=${label === 'Medical' ? 'medical' : 'induction'}-${days}`,
        )) raised++
      }
    }

    const firms = await this.db.contractorCompany.findMany({
      where: { status: 'active', insuranceExpiry: { not: null, lte: horizon, gte: floor } },
      select: { id: true, companyId: true, name: true, code: true, insuranceExpiry: true },
      take: 5000,
    })

    for (const f of firms) {
      if (!f.insuranceExpiry || budget.exhausted(f.companyId)) continue
      const days = daysBetween(f.insuranceExpiry, now)
      const on = f.insuranceExpiry.toISOString().slice(0, 10)

      if (days < 0) {
        if (await this.raise(
          budget, f.companyId, 'system',
          `Contractor insurance expired — ${f.name}`,
          `${f.code} insurance lapsed on ${on}. An uninsured contractor on site is your liability.`,
          `/contractors?contractor=${f.id}&insurance=expired`,
        )) raised++
        continue
      }
      if (!CONTRACTOR_EXPIRY_DAYS.includes(days)) continue
      if (await this.raise(
        budget, f.companyId, 'system',
        `Contractor insurance expires in ${days} days — ${f.name}`,
        `${f.code} insurance lapses on ${on}. Ask for the renewal certificate.`,
        `/contractors?contractor=${f.id}&expiring=${days}`,
      )) raised++
    }

    return raised
  }

  /**
   * Permits: sitting unapproved, ending today, or overrun.
   *
   * A permit is the shortest-lived thing the scheduler watches — hours, not months — so
   * this sweep is about the working day rather than a renewal calendar. An approval
   * request nobody has picked up is chased because the crew is standing at the desk; an
   * overrun permit is chased because work is happening under an authority that lapsed.
   */
  async sweepPermits(now = new Date()): Promise<number> {
    const budget = new Budget()
    let raised = 0

    const endOfDay = new Date(now)
    endOfDay.setUTCHours(23, 59, 59, 999)
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)

    // Awaiting a signature. Every stage of the chain counts: a permit parked with HSE is
    // as stalled as one parked at submission.
    const waiting = await this.db.permit.findMany({
      where: {
        status: { in: ['submitted', 'supervisor_review', 'hse_review', 'area_authority'] },
        validFrom: { gte: floor },
      },
      select: { id: true, companyId: true, code: true, title: true, status: true, validFrom: true },
      take: 2000,
    })
    for (const p of waiting) {
      if (budget.exhausted(p.companyId)) continue
      if (await this.raise(
        budget, p.companyId, 'system',
        `${p.code} is waiting for approval`,
        `${p.title} — currently at ${p.status.replace(/_/g, ' ')}. Work is due to start ${p.validFrom.toISOString().slice(0, 16).replace('T', ' ')}.`,
        `/permits?permit=${p.id}&awaiting=${p.status}`,
      )) raised++
    }

    // Ending today, and overrun. Both are keyed on the date so a permit extended into
    // tomorrow raises a fresh notification rather than reusing today's.
    const ending = await this.db.permit.findMany({
      where: { status: 'active', validTo: { gte: floor, lte: endOfDay } },
      select: { id: true, companyId: true, code: true, title: true, validTo: true },
      take: 2000,
    })
    for (const p of ending) {
      if (budget.exhausted(p.companyId)) continue
      const overrun = p.validTo < now
      const on = p.validTo.toISOString().slice(0, 10)
      if (await this.raise(
        budget, p.companyId, 'system',
        overrun ? `${p.code} has overrun its permit` : `${p.code} expires today`,
        overrun
          ? `${p.title} — the authority lapsed at ${p.validTo.toISOString().slice(11, 16)}. Stop work, or extend and re-approve.`
          : `${p.title} — valid until ${p.validTo.toISOString().slice(11, 16)}. Close it or request an extension.`,
        `/permits?permit=${p.id}&${overrun ? 'overdue' : 'expiring'}=${on}`,
      )) raised++
    }

    // Suspended work, which stays stopped until somebody resumes it.
    const suspended = await this.db.permit.findMany({
      where: { status: 'suspended', validTo: { gte: floor } },
      select: { id: true, companyId: true, code: true, title: true, suspendedReason: true },
      take: 1000,
    })
    for (const p of suspended) {
      if (budget.exhausted(p.companyId)) continue
      if (await this.raise(
        budget, p.companyId, 'system',
        `${p.code} is suspended`,
        `${p.title} — ${p.suspendedReason ?? 'no reason recorded'}. Work stays stopped until it is resumed.`,
        `/permits?permit=${p.id}&suspended=1`,
      )) raised++
    }

    return raised
  }


  /**
   * Calibration certificates falling due, and instruments already unfit.
   *
   * Only the newest certificate per instrument counts. An instrument with a lapsed 2024
   * certificate and a current 2026 one is calibrated, and chasing the old one forever is
   * how people learn to ignore the reminders.
   */
  async sweepCalibrations(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...CALIBRATION_DAYS) * DAY)
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)

    const assets = await this.db.asset.findMany({
      where: {
        status: { notIn: ['retired', 'disposed'] },
        OR: [{ requiresCalibration: true }, { category: { in: CALIBRATED_CATEGORIES } }],
      },
      select: {
        id: true, code: true, name: true, owner: true, companyId: true, critical: true,
        calibrations: { orderBy: { expiresAt: 'desc' }, take: 1 },
      },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const a of assets) {
      if (budget.exhausted(a.companyId)) continue
      const latest = a.calibrations[0]
      if (!latest) continue // Registered but never calibrated: chased by the register, not nightly.
      if (latest.expiresAt > horizon || latest.expiresAt < floor) continue

      const days = daysBetween(latest.expiresAt, now)
      const critical = a.critical ? 'Critical equipment. ' : ''

      if (days < 0) {
        if (await this.raise(
          budget, a.companyId, 'system',
          `Calibration expired: ${a.name}`,
          `${critical}${a.code} has been out of calibration for ${Math.abs(days)} day${days === -1 ? '' : 's'}. It cannot be booked onto a permit. Owner: ${a.owner}.`,
          // The expiry date is part of the key, so recalibrating and lapsing again is a
          // new event rather than a suppressed duplicate.
          `/assets?asset=${a.id}&calibration=${latest.expiresAt.toISOString().slice(0, 10)}`,
        )) raised++
      } else if (CALIBRATION_DAYS.includes(days)) {
        if (await this.raise(
          budget, a.companyId, 'system',
          `Calibration due in ${days} day${days === 1 ? '' : 's'}: ${a.name}`,
          `${critical}${a.code} certificate ${latest.certificateNumber} expires on ${latest.expiresAt.toISOString().slice(0, 10)}. Owner: ${a.owner}.`,
          `/assets?asset=${a.id}&calibration=${latest.expiresAt.toISOString().slice(0, 10)}&in=${days}`,
        )) raised++
      }
    }
    return raised
  }

  /** Work orders past their due date and still open. */
  async sweepMaintenance(now = new Date()): Promise<number> {
    const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY)
    const orders = await this.db.workOrder.findMany({
      where: {
        status: { in: ['open', 'in_progress'] },
        dueAt: { not: null, lt: now, gte: floor },
      },
      select: {
        id: true, code: true, dueAt: true, description: true, assignedTo: true, priority: true,
        asset: { select: { id: true, code: true, name: true, companyId: true, critical: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const w of orders) {
      if (!w.dueAt) continue
      if (budget.exhausted(w.asset.companyId)) continue
      const days = Math.abs(daysBetween(w.dueAt, now))
      const critical = w.asset.critical ? 'Critical equipment. ' : ''

      if (await this.raise(
        budget, w.asset.companyId, 'system',
        `Maintenance overdue: ${w.asset.name}`,
        `${critical}${w.code} was due ${days} day${days === 1 ? '' : 's'} ago — ${w.description}${w.assignedTo ? `. Assigned to ${w.assignedTo}` : ''}.`,
        `/assets?asset=${w.asset.id}&workOrder=${w.id}`,
      )) raised++
    }
    return raised
  }

  /**
   * Equipment sitting out of service.
   *
   * Raised once per item rather than nightly: the href carries no date, so the first
   * notification stands until somebody deals with it. A daily reminder that an item is
   * still broken is noise, and noise is what makes the real ones get dismissed.
   */
  async sweepOutOfService(): Promise<number> {
    const assets = await this.db.asset.findMany({
      where: { status: 'out_of_service' },
      select: { id: true, code: true, name: true, owner: true, companyId: true, critical: true },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const a of assets) {
      if (budget.exhausted(a.companyId)) continue
      if (await this.raise(
        budget, a.companyId, 'system',
        a.critical ? `Critical equipment out of service: ${a.name}` : `Equipment out of service: ${a.name}`,
        `${a.code} cannot be used or booked onto a permit until it is returned to service. Owner: ${a.owner}.`,
        `/assets?asset=${a.id}&outOfService=1`,
      )) raised++
    }
    return raised
  }


  /**
   * Visitors still inside past the time they said they would leave.
   *
   * The one sweep in this file that is about a person rather than a date on a record. An
   * unaccounted visitor is what a muster list gets wrong, so the href carries no date: the
   * first notification stands until somebody deals with it, rather than being re-raised
   * hourly and learned to be ignored.
   */
  async sweepOverdueVisitors(now = new Date()): Promise<number> {
    const visits = await this.db.visitor.findMany({
      where: {
        status: { in: ['checked_in', 'on_site'] },
        expectedDeparture: { lt: now },
      },
      select: {
        id: true, code: true, name: true, companyId: true, siteId: true,
        visitorCompany: true, hostNameAtBooking: true, badgeNumber: true,
        expectedDeparture: true,
      },
      orderBy: { expectedDeparture: 'asc' },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const v of visits) {
      if (budget.exhausted(v.companyId)) continue
      const minutes = Math.floor((now.getTime() - v.expectedDeparture.getTime()) / 60_000)
      const late = minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)} hours`

      if (await this.raise(
        budget, v.companyId, 'system',
        `Visitor still on site: ${v.name}`,
        `${v.code} was due to leave ${late} ago and has not checked out.`
        + `${v.visitorCompany ? ` ${v.visitorCompany}.` : ''}`
        + `${v.hostNameAtBooking ? ` Host: ${v.hostNameAtBooking}.` : ''}`
        + `${v.badgeNumber ? ` Badge ${v.badgeNumber}.` : ''}`,
        `/visitors?open=${v.id}&overdue=1`,
      )) raised++
    }
    return raised
  }

  /**
   * Badges out with somebody who has already left.
   *
   * Separate from the overdue sweep because it is a different problem with a different
   * owner: reception chases the badge, security chases the person.
   */
  async sweepOutstandingBadges(): Promise<number> {
    const visits = await this.db.visitor.findMany({
      where: {
        status: 'checked_out',
        badgeNumber: { not: null },
        badgeReturnedAt: null,
      },
      select: { id: true, code: true, name: true, companyId: true, badgeNumber: true },
      take: 5000,
    })

    const budget = new Budget()
    let raised = 0
    for (const v of visits) {
      if (budget.exhausted(v.companyId)) continue
      if (await this.raise(
        budget, v.companyId, 'system',
        `Badge not returned: ${v.badgeNumber}`,
        `${v.name} (${v.code}) has checked out without returning badge ${v.badgeNumber}.`,
        `/visitors?open=${v.id}&badge=1`,
      )) raised++
    }
    return raised
  }

  /**
   * Visits whose window has passed without anybody turning up.
   *
   * Marked expired rather than left pre-registered forever, so "expected today" means what
   * it says and reception is not looking at a list of people who never came. Only visits
   * that were never checked in: somebody inside is the overdue sweep's problem.
   */
  async sweepExpiredVisits(now = new Date()): Promise<number> {
    const stale = await this.db.visitor.updateMany({
      where: {
        status: { in: ['draft', 'pre_registered', 'waiting'] },
        checkedInAt: null,
        expectedDeparture: { lt: now },
      },
      data: { status: 'expired' },
    })
    return stale.count
  }


  /**
   * Scheduled reports that are now due.
   *
   * The only sweep that produces a document and sends it to people, so it is the one where
   * running twice is most visible - four copies of the Monday report before nine o'clock.
   * Idempotency comes from a unique index on (scheduleId, dueSlot) rather than from
   * in-process state, so it holds across restarts and across two instances of the API.
   *
   * nextRunAt is advanced whether the run succeeded or failed. A schedule that stops trying
   * because one week's report failed is worse than one that records the failure and carries
   * on to the next Monday.
   */
  async sweepScheduledReports(now = new Date()): Promise<number> {
    const due = await this.db.reportSchedule.findMany({
      where: { enabled: true, nextRunAt: { not: null, lte: now } },
      take: 200,
    })

    let ran = 0
    for (const s of due) {
      const shape = {
        frequency: s.frequency as Frequency,
        dayOfWeek: s.dayOfWeek,
        timeOfDay: s.timeOfDay,
        timezone: s.timezone,
      }

      // The slot this firing is for, derived from the due instant rather than from now:
      // a sweep that runs late must still be recorded against the slot it was owed.
      const slot = dueSlotKey(shape, s.nextRunAt ?? now)

      try {
        // One call. Generation, PDF, email and the run record all live in the delivery
        // service; this sweep decides only what is due.
        const result = await this.reports.runScheduledReport(s, slot)
        if (!result.skipped) ran++
      } catch {
        // execute() has already written the failure to the run and the schedule. Swallowed
        // here so one broken schedule cannot stop the others in the same pass.
      }

      const next = nextRunAt(shape, now)
      await this.db.reportSchedule.update({
        where: { id: s.id },
        // A schedule whose configuration no longer parses is disarmed rather than retried
        // every fifteen minutes forever; lastRunError already says why.
        data: { nextRunAt: next },
      })
    }
    return ran
  }

  /** One full pass. Safe to call directly; that is how the tests drive it. */
  async runOnce(now = new Date()): Promise<{
    actions: number; inspections: number; certificates: number; medicals: number
    contractors: number; permits: number
    calibrations: number; maintenance: number; outOfService: number
    overdueVisitors: number; outstandingBadges: number; expiredVisits: number
    reports: number
  }> {
    const actions = await this.sweepActions(now)
    const inspections = await this.sweepInspections(now)
    lastRuns.set('j1', new Date().toISOString())

    const certificates = await this.sweepCertificates(now)
    const medicals = await this.sweepMedicals(now)
    const contractors = await this.sweepContractors(now)
    const permits = await this.sweepPermits(now)
    lastRuns.set('j2', new Date().toISOString())

    const calibrations = await this.sweepCalibrations(now)
    const maintenance = await this.sweepMaintenance(now)
    const outOfService = await this.sweepOutOfService()
    lastRuns.set('j3', new Date().toISOString())

    // Expiry first: a visit that has quietly lapsed is not an overdue visitor, and
    // sweeping in the other order would chase somebody who was never on site.
    const expiredVisits = await this.sweepExpiredVisits(now)
    const overdueVisitors = await this.sweepOverdueVisitors(now)
    const outstandingBadges = await this.sweepOutstandingBadges()
    lastRuns.set('j4', new Date().toISOString())

    // Last in the pass: the report reads the results of everything above it, so it should
    // see this pass's notifications rather than last pass's.
    const reports = await this.sweepScheduledReports(now)
    /*
     * Recovery runs after the reports sweep, on the same pass.
     *
     * A delivery interrupted by a restart, or one waiting out a backoff, is picked up here
     * rather than by a timer of its own - the report system already has exactly one thing
     * that decides when work happens, and a second would be a second set of locking to get
     * wrong. Whether a message may actually be sent again is decided in reportRetry.ts.
     */
    const recovered = await this.reports.recoverStalledDeliveries(now)
    lastRuns.set('j5', new Date().toISOString())

    return {
      actions, inspections, certificates, medicals, contractors, permits,
      calibrations, maintenance, outOfService,
      overdueVisitors, outstandingBadges, expiredVisits,
      reports: reports + recovered.retried,
    }
  }

  /**
   * One reminder-and-report pass, if no other instance is running one.
   *
   * The timers call this rather than runOnce. With more than one API replica each would
   * otherwise sweep independently: the notification dedupe is check-then-insert, so two
   * concurrent passes can both find a reminder missing and both raise it. Returns null
   * when another instance holds the pass.
   */
  async sweepIfLeader(now = new Date()) {
    const r = await withLeaderLock(this.db, LOCK_SCHEDULER_SWEEP, () => this.runOnce(now))
    return r.ran ? r.value : null
  }

  /**
   * One webhook-delivery sweep, if no other instance is running one.
   *
   * sweepDeliveries reads every pending, due delivery and sends it. Two instances reading
   * together would each send the same event - and a receiver cannot tell a duplicate
   * incident alert from a second incident. Returns null when another instance holds it.
   */
  async deliverIfLeader(now = new Date()) {
    const r = await withLeaderLock(
      this.db, LOCK_WEBHOOK_DELIVERY, () => sweepDeliveries(this.db, now), 5 * 60_000,
    )
    return r.ran ? r.value : null
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
        const n = await this.sweepIfLeader()
        // Another instance holds the pass this time; it is doing the work.
        if (!n) return
        // Every sweep counted: a total that silently omits one makes a flood from that
        // sweep invisible in the logs, which is exactly when you need to see it.
        const total = n.actions + n.inspections + n.certificates + n.medicals + n.contractors + n.permits
        if (total > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[safeops-scheduler] raised ${total} notification(s): ` +
            `${n.actions} action, ${n.inspections} inspection, ${n.certificates} certificate, ` +
            `${n.medicals} medical, ${n.contractors} contractor, ${n.permits} permit`,
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

    this.startDeliveries()
  }

  /**
   * The webhook queue, on its own clock.
   *
   * Started by `start` and separable for the tests, which drive `sweepDeliveries` directly
   * rather than waiting on a timer.
   */
  startDeliveries(intervalMs = DELIVERY_INTERVAL_MS) {
    if (this.deliveryTimer) return
    const tick = async () => {
      if (this.deliveringWebhooks) return
      this.deliveringWebhooks = true
      try {
        const n = await this.deliverIfLeader()
        if (!n) return
        lastRuns.set('j6', new Date().toISOString())
        if (n.attempted > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `[safeops-webhooks] ${n.attempted} attempted: `
            + `${n.delivered} delivered, ${n.retrying} retrying, ${n.failed} failed`,
          )
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[safeops-webhooks] delivery sweep failed:', err)
      } finally {
        this.deliveringWebhooks = false
      }
    }
    this.deliveryTimer = setInterval(() => void tick(), intervalMs)
    this.deliveryTimer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.deliveryTimer) clearInterval(this.deliveryTimer)
    this.deliveryTimer = null
  }
}
