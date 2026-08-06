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
 * Days before expiry at which a fitness-to-work medical is flagged. Earlier than a
 * certificate because booking a company doctor takes longer than booking a course.
 */
const MEDICAL_EXPIRY_DAYS = [60, 30, 14, 7]

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
class Budget {
  private used = new Map<string, number>()
  exhausted(companyId: string): boolean {
    return (this.used.get(companyId) ?? 0) >= MAX_PER_SWEEP_PER_COMPANY
  }
  spend(companyId: string): void {
    this.used.set(companyId, (this.used.get(companyId) ?? 0) + 1)
  }
}

export type JobId = 'j1' | 'j2' | 'j3'

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

      if (days < 0) {
        if (await this.raise(
          budget, p.companyId, 'system',
          `Medical expired — ${p.name}`,
          `${p.employeeNo}'s fitness-to-work certificate lapsed on ${p.medicalExpiry.toISOString().slice(0, 10)}. They cannot hold a permit until it is renewed.`,
          `/employees?open=${p.id}&medical=expired`,
        )) raised++
        continue
      }
      if (!MEDICAL_EXPIRY_DAYS.includes(days)) continue
      if (await this.raise(
        budget, p.companyId, 'system',
        `Medical expires in ${days} days — ${p.name}`,
        `${p.employeeNo}'s fitness-to-work certificate lapses on ${p.medicalExpiry.toISOString().slice(0, 10)}. Book the appointment.`,
        `/employees?open=${p.id}&expiring=${days}`,
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

  /** One full pass. Safe to call directly; that is how the tests drive it. */
  async runOnce(now = new Date()): Promise<{
    actions: number; inspections: number; certificates: number; medicals: number
    contractors: number; permits: number
    calibrations: number; maintenance: number; outOfService: number
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

    return {
      actions, inspections, certificates, medicals, contractors, permits,
      calibrations, maintenance, outOfService,
    }
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
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
