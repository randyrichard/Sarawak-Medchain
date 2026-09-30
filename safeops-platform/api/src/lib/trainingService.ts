import type { DeliveryMode, Prisma, PrismaClient, Role } from '@prisma/client'
// `Caller` is the verified identity shape shared by every module — see permitService.
import { type Caller, membershipOf } from '../domain/caller.js'
import { enqueueEvent } from './webhookService.js'
import {
  BUILT_IN_COURSE_IDS, EXPIRING_WINDOW_DAYS, TRAINING_ACTION_DUE_DAYS, TRAINING_COURSES,
  courseApplies, type CourseShape,
} from './trainingCatalog.js'
import { DomainError } from '../domain/errors.js'
import { resolveOwnerId } from './actionOwner.js'

/** Roles permitted to author courses and escalate a competency gap. */
const REVIEW_ROLES: Role[] = ['admin', 'hse_manager']
/** Roles permitted to schedule sessions and enrol people. */
const MANAGE_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer']
/** Roles that see the whole roster rather than their own sites or themselves. */
const ORG_WIDE_ROLES: Role[] = ['admin', 'hse_manager', 'ceo']

export class TrainingError extends DomainError {}

const DAY = 86400_000

/**
 * Reserved Counter key for sequences that must be unique across the whole deployment
 * rather than within a tenant. Not a real company id, and no company can collide with it
 * because company ids are slugs.
 */
const GLOBAL_SEQUENCE = '__global__'

/**
 * Date-only values are pinned to UTC midnight — the rule established in the inspection
 * register. Local midnight in UTC+8 lands on the previous UTC day, and every client
 * renders a date by slicing the ISO string, so issue and expiry dates would read a day
 * early across the whole matrix.
 */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function daysUntil(d: Date): number {
  return Math.round((utcMidnight(d).getTime() - utcMidnight(new Date()).getTime()) / DAY)
}

function addDays(days: number): Date {
  return utcMidnight(new Date(Date.now() + days * DAY))
}

/** Today plus a whole number of months, kept at UTC midnight. */
function addMonths(months: number): Date {
  const d = utcMidnight(new Date())
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

export type CompetencyStatus = 'competent' | 'expiring' | 'expired' | 'missing' | 'na'
export type CertStatus = 'competent' | 'expiring' | 'expired'
export type CompetencyLevel = 'Fully Competent' | 'Competent' | 'Developing' | 'At Risk'

type CertRow = Prisma.CertificateGetPayload<Record<string, never>>
type EmployeeRow = Prisma.EmployeeGetPayload<Record<string, never>>

export interface SessionFilters {
  companyId: string
  q?: string
  siteId?: string
  status?: 'all' | 'scheduled' | 'completed'
}

export interface TrainingFilters {
  companyId: string
  q?: string
  siteId?: string
  status?: 'all' | 'competent' | 'expiring' | 'expired'
}

export class TrainingService {
  constructor(private db: PrismaClient) {}

  // ── Authorisation ──────────────────────────────────────────────────────────

  private membership(caller: Caller, companyId: string) {
    return membershipOf(caller, companyId, TrainingError)
  }


  private requireRole(caller: Caller, companyId: string, allowed: Role[], what: string) {
    const m = this.membership(caller, companyId)
    if (!allowed.includes(m.role)) {
      throw new TrainingError('forbidden', `Your role does not permit ${what}.`, 403)
    }
    return m
  }

  /**
   * Which of the workforce this caller may see.
   *
   * Applied as a WHERE clause so restricted rows never leave the database. An employee
   * sees only their own record: a competency matrix is a list of who is not qualified,
   * and that is not everyone's to browse.
   */
  private rosterWhere(caller: Caller, companyId: string): Prisma.EmployeeWhereInput {
    const m = this.membership(caller, companyId)
    if (ORG_WIDE_ROLES.includes(m.role)) return {}
    if (m.role === 'safety_officer' || m.role === 'supervisor') {
      return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
    }
    return { name: caller.name }
  }

  // ── Courses ────────────────────────────────────────────────────────────────

  /** The standard catalogue plus whatever this workspace has authored. */
  async allCourses(companyId: string): Promise<CourseShape[]> {
    const custom = await this.db.trainingCourse.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    })
    return [
      ...TRAINING_COURSES,
      ...custom.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        category: c.category,
        description: c.description,
        mandatory: c.mandatory,
        validityMonths: c.validityMonths,
        durationHours: c.durationHours,
        deliveryModes: c.deliveryModes,
        competency: c.competency,
        passMark: c.passMark,
        applies: c.applies,
        custom: true,
      })),
    ]
  }

  private async resolveCourse(companyId: string, courseId: string): Promise<CourseShape> {
    const all = await this.allCourses(companyId)
    const found = all.find((c) => c.id === courseId)
    // Scoped to the tenant: a course id from another workspace must not resolve, or one
    // tenant's session issues certificates against another's competency definition.
    if (!found) throw new TrainingError('validation', 'Select a valid course.')
    return found
  }

  async listCourses(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const [courses, roster, certs, upcoming] = await Promise.all([
      this.allCourses(companyId),
      this.db.employee.findMany({ where: { companyId, active: true } }),
      this.db.certificate.findMany({
        where: { companyId },
        orderBy: { issueDate: 'desc' },
      }),
      this.db.trainingSession.groupBy({
        by: ['courseId'],
        where: { companyId, status: 'scheduled' },
        _count: { _all: true },
        orderBy: undefined,
      }),
    ])

    const current = this.currentCerts(certs)
    const sessions = new Map(
      (upcoming as unknown as { courseId: string; _count?: { _all: number } }[])
        .map((r) => [r.courseId, r._count?._all ?? 0] as const),
    )

    return courses.map((course) => {
      const required = roster.filter((e) => courseApplies(course, e.department))
      const certified = required.filter((e) => {
        const cert = current.get(`${e.id}:${course.id}`)
        if (!cert) return false
        const s = this.certStatus(cert).status
        // Expiring still counts as certified — the competency has not lapsed yet.
        return s === 'competent' || s === 'expiring'
      })
      return {
        ...course,
        requiredEmployees: required.length,
        certifiedEmployees: certified.length,
        compliancePct: required.length
          ? Math.round((certified.length / required.length) * 100)
          : 100,
        upcomingSessions: sessions.get(course.id) ?? 0,
      }
    })
  }

  async createCourse(caller: Caller, companyId: string, input: {
    name: string
    category: CourseShape['category']
    description?: string
    mandatory: boolean
    validityMonths: number | null
    durationHours: number
    deliveryModes: DeliveryMode[]
    competency?: string
    applies?: string[]
  }) {
    this.requireRole(caller, companyId, REVIEW_ROLES, 'creating training courses')

    if (!input.name?.trim() || !(input.durationHours > 0)) {
      throw new TrainingError('validation', 'Course name and a positive duration are required.')
    }

    return this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId, kind: 'course' } },
        update: { next: { increment: 1 } },
        create: { companyId, kind: 'course', next: 111 },
        select: { next: true },
      })
      return tx.trainingCourse.create({
        data: {
          companyId,
          code: `TRN-${counter.next}`,
          name: input.name.trim(),
          category: input.category,
          description: input.description?.trim() ?? '',
          mandatory: input.mandatory,
          validityMonths: input.validityMonths,
          durationHours: input.durationHours,
          deliveryModes: input.deliveryModes,
          competency: input.competency?.trim() ?? '',
          passMark: 80,
          applies: input.applies ?? [],
          createdBy: caller.name,
        },
      })
    })
  }

  // ── Certificates & derived competency ──────────────────────────────────────

  /**
   * The current certificate per employee and course.
   *
   * A renewal is a new row rather than an edit, so "current" is the most recently issued
   * one. Derived rather than flagged: a stored `superseded` boolean is a second source of
   * truth that goes wrong the moment a backdated certificate is imported.
   */
  private currentCerts(certs: CertRow[]): Map<string, CertRow> {
    const latest = new Map<string, CertRow>()
    for (const c of certs) {
      const key = `${c.employeeId}:${c.courseId}`
      const prev = latest.get(key)
      if (!prev || c.issueDate.getTime() > prev.issueDate.getTime()) latest.set(key, c)
    }
    return latest
  }

  private certStatus(cert: CertRow): { status: CertStatus; days: number | null } {
    if (cert.expiryDate === null) return { status: 'competent', days: null }
    const days = daysUntil(cert.expiryDate)
    return {
      status: days < 0 ? 'expired' : days <= EXPIRING_WINDOW_DAYS ? 'expiring' : 'competent',
      days,
    }
  }

  private level(compliancePct: number, hasExpiredMandatory: boolean): CompetencyLevel {
    // A lapsed mandatory competency is At Risk regardless of the percentage: being 90%
    // trained is no comfort when the missing 10% is the one the law requires.
    if (hasExpiredMandatory) return 'At Risk'
    if (compliancePct >= 100) return 'Fully Competent'
    if (compliancePct >= 75) return 'Competent'
    if (compliancePct >= 50) return 'Developing'
    return 'At Risk'
  }

  private competencyFor(
    emp: EmployeeRow,
    courses: CourseShape[],
    current: Map<string, CertRow>,
  ) {
    const required = courses.filter((c) => courseApplies(c, emp.department))
    const cells: Record<string, {
      courseId: string; status: CompetencyStatus; expiryDate: string | null; certId?: string
    }> = {}

    let competent = 0
    let expiring = 0
    let gaps = 0
    let hasExpiredMandatory = false

    for (const course of required) {
      const cert = current.get(`${emp.id}:${course.id}`)
      if (!cert) {
        cells[course.id] = { courseId: course.id, status: 'missing', expiryDate: null }
        gaps++
        if (course.mandatory) hasExpiredMandatory = true
        continue
      }
      const { status } = this.certStatus(cert)
      cells[course.id] = {
        courseId: course.id,
        status,
        expiryDate: cert.expiryDate ? cert.expiryDate.toISOString().slice(0, 10) : null,
        certId: cert.id,
      }
      if (status === 'competent') competent++
      else if (status === 'expiring') expiring++
      else {
        gaps++
        if (course.mandatory) hasExpiredMandatory = true
      }
    }

    const requiredCount = required.length
    const compliancePct = requiredCount ? Math.round((competent / requiredCount) * 100) : 100
    return {
      employeeId: emp.id,
      name: emp.name,
      position: emp.position,
      siteId: emp.siteId,
      department: emp.department,
      level: this.level(compliancePct, hasExpiredMandatory),
      compliancePct,
      requiredCount,
      competentCount: competent,
      expiringCount: expiring,
      gapCount: gaps,
      hasExpiredMandatory,
      cells,
    }
  }

  private toCertView(cert: CertRow, emp: EmployeeRow | undefined, courses: CourseShape[]) {
    const course = courses.find((c) => c.id === cert.courseId)
    const { status, days } = this.certStatus(cert)
    return {
      ...cert,
      employeeName: emp?.name ?? '—',
      status,
      daysToExpiry: days,
      siteId: emp?.siteId ?? '-',
      department: emp?.department ?? '-',
      mandatory: course?.mandatory ?? false,
    }
  }

  // ── Matrix ─────────────────────────────────────────────────────────────────

  async trainingMatrix(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    const [courses, roster, certs] = await Promise.all([
      this.allCourses(companyId),
      this.db.employee.findMany({
        where: { companyId, active: true, ...this.rosterWhere(caller, companyId) },
        orderBy: { name: 'asc' },
      }),
      this.db.certificate.findMany({ where: { companyId } }),
    ])

    const current = this.currentCerts(certs)
    const employees = roster
      .map((e) => this.competencyFor(e, courses, current))
      // Weakest first — the matrix is a queue of who to train, not a directory.
      .sort((a, b) => a.compliancePct - b.compliancePct || a.name.localeCompare(b.name))

    const used = new Set<string>()
    for (const e of employees) for (const id of Object.keys(e.cells)) used.add(id)

    return {
      courses: courses
        .filter((c) => used.has(c.id))
        .map((c) => ({ id: c.id, code: c.code, name: c.name, mandatory: c.mandatory })),
      employees,
    }
  }

  async getEmployeeTraining(caller: Caller, employeeId: string) {
    const emp = await this.db.employee.findUnique({ where: { id: employeeId } })
    if (!emp) throw new TrainingError('not_found', 'Employee not found.', 404)
    this.membership(caller, emp.companyId)

    // Re-apply roster scoping to a direct fetch: a guessed id must not bypass it.
    const visible = await this.db.employee.findFirst({
      where: { id: employeeId, ...this.rosterWhere(caller, emp.companyId) },
      select: { id: true },
    })
    if (!visible) {
      throw new TrainingError('forbidden', 'You do not have access to this employee record.', 403)
    }

    const [courses, certs, sessions] = await Promise.all([
      this.allCourses(emp.companyId),
      this.db.certificate.findMany({
        where: { employeeId },
        orderBy: { issueDate: 'desc' },
      }),
      this.db.trainingSession.findMany({
        where: { status: 'scheduled', enrolments: { some: { employeeId } } },
        include: { enrolments: true },
        orderBy: { scheduledFor: 'asc' },
      }),
    ])

    const current = this.currentCerts(certs)
    const competency = this.competencyFor(emp, courses, current)

    const required = courses
      .filter((c) => courseApplies(c, emp.department))
      .map((course) => {
        const cert = current.get(`${emp.id}:${course.id}`)
        return {
          course,
          status: competency.cells[course.id]?.status ?? 'missing',
          cert: cert ? this.toCertView(cert, emp, courses) : undefined,
        }
      })

    const certificates = [...current.values()]
      .map((c) => this.toCertView(c, emp, courses))
      .sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime())

    const upcomingRenewals = certificates
      .filter((c) => c.status === 'expiring' && c.daysToExpiry !== null)
      .map((c) => ({
        courseName: c.courseName,
        expiryDate: c.expiryDate!.toISOString().slice(0, 10),
        daysToExpiry: c.daysToExpiry!,
      }))
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry)

    const enrolledSessions = sessions.map((s) => this.toSessionView(s))

    const history = [
      ...certificates.map((c) => ({
        at: c.issueDate.toISOString(),
        kind: 'certified' as const,
        text: `Certified: ${c.courseName} (${c.number})`,
      })),
      ...certificates
        .filter((c) => c.status === 'expired' && c.expiryDate)
        .map((c) => ({
          at: c.expiryDate!.toISOString(),
          kind: 'expired' as const,
          text: `Expired: ${c.courseName}`,
        })),
      ...enrolledSessions.map((s) => ({
        at: s.scheduledFor.toISOString(),
        kind: 'enrolled' as const,
        text: `Enrolled: ${s.courseName} (${s.code})`,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at))

    return { competency, required, certificates, upcomingRenewals, enrolledSessions, history }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  private toSessionView(
    s: Prisma.TrainingSessionGetPayload<{ include: { enrolments: true } }>,
  ) {
    const daysToStart = daysUntil(s.scheduledFor)
    return {
      ...s,
      enrolled: s.enrolments.map((e) => e.employeeId),
      attendance: s.enrolments.map((e) => ({
        employeeId: e.employeeId,
        present: e.present,
        result: e.result,
        score: e.score,
      })),
      enrolledCount: s.enrolments.length,
      passedCount: s.enrolments.filter((e) => e.result === 'pass').length,
      siteName: s.siteId.toUpperCase(),
      daysToStart,
      overdue: s.status === 'scheduled' && daysToStart < 0,
      seatsLeft: Math.max(0, s.maxParticipants - s.enrolments.length),
    }
  }

  async listSessions(caller: Caller, f: SessionFilters) {
    this.membership(caller, f.companyId)
    const q = f.q?.trim()

    const where: Prisma.TrainingSessionWhereInput = {
      companyId: f.companyId,
      ...(f.siteId ? { siteId: f.siteId } : {}),
      ...(f.status === 'scheduled' ? { status: 'scheduled' } : {}),
      ...(f.status === 'completed' ? { status: 'completed' } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { courseName: { contains: q, mode: 'insensitive' } },
              { trainer: { contains: q, mode: 'insensitive' } },
              { venue: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const rows = await this.db.trainingSession.findMany({
      where,
      include: { enrolments: true },
      orderBy: [{ scheduledFor: 'asc' }],
      take: 500,
    })

    // What is still to run comes first, soonest first; history reads newest first.
    return rows
      .map((s) => this.toSessionView(s))
      .sort((a, b) => {
        const rank = (x: typeof a) => (x.status === 'scheduled' ? 0 : 1)
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        return rank(a) === 0
          ? a.scheduledFor.getTime() - b.scheduledFor.getTime()
          : b.scheduledFor.getTime() - a.scheduledFor.getTime()
      })
  }

  async createSession(caller: Caller, input: {
    companyId: string
    siteId: string
    courseId: string
    trainer: string
    venue: string
    mode: DeliveryMode
    scheduledFor: string
    maxParticipants: number
    enrolled?: string[]
  }) {
    this.requireRole(caller, input.companyId, MANAGE_ROLES, 'scheduling training sessions')

    const course = await this.resolveCourse(input.companyId, input.courseId)
    if (!input.trainer?.trim() || !input.venue?.trim() || !input.scheduledFor) {
      throw new TrainingError('validation', 'Trainer, venue and date are required.')
    }
    const when = new Date(input.scheduledFor)
    if (Number.isNaN(when.getTime())) {
      throw new TrainingError('validation', 'A valid session date is required.')
    }

    const site = await this.db.site.findFirst({
      where: { id: input.siteId, companyId: input.companyId },
      select: { id: true },
    })
    if (!site) throw new TrainingError('validation', 'Unknown site for this workspace.')

    const enrolled = [...new Set(input.enrolled ?? [])]
    if (enrolled.length > input.maxParticipants) {
      throw new TrainingError(
        'validation',
        `Enrolment exceeds the ${input.maxParticipants}-seat capacity.`,
      )
    }
    await this.assertOwnEmployees(input.companyId, enrolled)

    const id = await this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: input.companyId, kind: 'session' } },
        update: { next: { increment: 1 } },
        create: { companyId: input.companyId, kind: 'session', next: 505 },
        select: { next: true },
      })
      const created = await tx.trainingSession.create({
        data: {
          code: `SES-${counter.next}`,
          companyId: input.companyId,
          siteId: input.siteId,
          courseId: course.id,
          courseName: course.name,
          trainer: input.trainer.trim(),
          venue: input.venue.trim(),
          mode: input.mode,
          scheduledFor: utcMidnight(when),
          durationHours: course.durationHours,
          maxParticipants: input.maxParticipants,
          createdBy: caller.name,
          enrolments: { create: enrolled.map((employeeId) => ({ employeeId })) },
        },
        select: { id: true },
      })
      return created.id
    })

    return this.loadSession(id)
  }

  /** Every enrolled person must belong to the tenant running the session. */
  private async assertOwnEmployees(companyId: string, employeeIds: string[]) {
    if (employeeIds.length === 0) return
    const count = await this.db.employee.count({
      where: { id: { in: employeeIds }, companyId },
    })
    if (count !== employeeIds.length) {
      throw new TrainingError('validation', 'One or more employees are not in this workspace.')
    }
  }

  private async loadSession(id: string) {
    const s = await this.db.trainingSession.findUniqueOrThrow({
      where: { id },
      include: { enrolments: true },
    })
    return this.toSessionView(s)
  }

  async enrollSession(caller: Caller, sessionId: string, employeeIds: string[]) {
    const session = await this.db.trainingSession.findUnique({
      where: { id: sessionId },
      include: { enrolments: true },
    })
    if (!session) throw new TrainingError('not_found', 'Session not found.', 404)
    this.requireRole(caller, session.companyId, MANAGE_ROLES, 'enrolling people in training')

    if (session.status !== 'scheduled') {
      throw new TrainingError('validation', 'Only scheduled sessions accept enrolment.')
    }

    const existing = new Set(session.enrolments.map((e) => e.employeeId))
    const toAdd = [...new Set(employeeIds)].filter((id) => !existing.has(id))
    if (existing.size + toAdd.length > session.maxParticipants) {
      throw new TrainingError(
        'validation',
        `That exceeds the ${session.maxParticipants}-seat capacity.`,
      )
    }
    await this.assertOwnEmployees(session.companyId, toAdd)

    if (toAdd.length > 0) {
      await this.db.sessionEnrolment.createMany({
        data: toAdd.map((employeeId) => ({ sessionId, employeeId })),
        skipDuplicates: true,
      })
    }
    return this.loadSession(sessionId)
  }

  /**
   * Closes a session and issues certificates.
   *
   * Everyone marked present needs a pass or fail — "attended" is not a competency — and
   * only a pass earns a certificate. Expiry is taken from the course validity at the
   * moment of issue, so shortening a course later does not retroactively lapse the
   * people who already hold it.
   */
  async completeSession(caller: Caller, sessionId: string, input: {
    attendance: { employeeId: string; present: boolean; result: 'pass' | 'fail' | null; score?: number }[]
    signature: string
  }) {
    const session = await this.db.trainingSession.findUnique({
      where: { id: sessionId },
      include: { enrolments: true },
    })
    if (!session) throw new TrainingError('not_found', 'Session not found.', 404)
    const m = this.membership(caller, session.companyId)

    if (session.status !== 'scheduled') {
      throw new TrainingError('validation', 'This session is already completed.')
    }
    if (session.trainer !== caller.name && !MANAGE_ROLES.includes(m.role)) {
      throw new TrainingError(
        'forbidden',
        'Only the trainer (or a Safety Officer and above) can close this session.',
        403,
      )
    }
    if (!input.signature?.trim()) {
      throw new TrainingError('validation', 'A trainer signature is required.')
    }
    const attendance = input.attendance ?? []
    if (attendance.length === 0) {
      throw new TrainingError('validation', 'Record attendance before completing.')
    }
    for (const a of attendance) {
      if (a.present && a.result === null) {
        throw new TrainingError('validation', 'Every present attendee needs a Pass or Fail result.')
      }
    }

    // Attendance must be for people actually on the sheet, or a session can certify
    // someone who never enrolled.
    const enrolled = new Set(session.enrolments.map((e) => e.employeeId))
    if (attendance.some((a) => !enrolled.has(a.employeeId))) {
      throw new TrainingError('validation', 'Attendance includes someone who was not enrolled.')
    }

    const course = await this.resolveCourse(session.companyId, session.courseId)
    const now = new Date()
    const issueDate = utcMidnight(now)
    const expiryDate = course.validityMonths ? addMonths(course.validityMonths) : null

    const issuedIds = await this.db.$transaction(async (tx) => {
      for (const a of attendance) {
        await tx.sessionEnrolment.update({
          where: { sessionId_employeeId: { sessionId, employeeId: a.employeeId } },
          data: { present: a.present, result: a.result, score: a.score ?? null },
        })
      }

      const ids: string[] = []
      for (const a of attendance.filter((x) => x.present && x.result === 'pass')) {
        // The one sequence that is NOT per tenant. A certificate number is quoted to
        // people outside the workspace — a client, an inspector — and verified by number
        // alone, with no company to disambiguate it. Two tenants each holding a
        // CERT-2026-2000 would make that lookup ambiguous, so the sequence is global.
        const counter = await tx.counter.upsert({
          where: { companyId_kind: { companyId: GLOBAL_SEQUENCE, kind: 'certificate' } },
          update: { next: { increment: 1 } },
          create: { companyId: GLOBAL_SEQUENCE, kind: 'certificate', next: 2000 },
          select: { next: true },
        })
        const number = `CERT-${issueDate.getUTCFullYear()}-${String(counter.next).padStart(4, '0')}`
        const cert = await tx.certificate.create({
          data: {
            number,
            qrKey: number,
            employeeId: a.employeeId,
            companyId: session.companyId,
            courseId: session.courseId,
            courseName: session.courseName,
            sessionId,
            issueDate,
            expiryDate,
            issuedBy: caller.name,
            score: a.score ?? null,
          },
          select: { id: true },
        })
        ids.push(cert.id)
      }

      await tx.trainingSession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          completedAt: now,
          completedBy: caller.name,
          signature: input.signature.trim(),
        },
      })
      return ids
    })

    const [view, courses, certs] = await Promise.all([
      this.loadSession(sessionId),
      this.allCourses(session.companyId),
      this.db.certificate.findMany({
        where: { id: { in: issuedIds } },
        include: { employee: true },
      }),
    ])

    /*
     * One event per certificate rather than one per session.
     *
     * A receiving system files competency against a person, so a session that qualified
     * eleven people is eleven things to record. Batching them into a single event would
     * make the receiver unpack an array to do what it was always going to do individually.
     */
    await Promise.all(certs.map((c) => enqueueEvent(this.db, session.companyId, 'certificate.issued', {
        id: c.id,
        number: c.number,
        employeeId: c.employeeId,
        employeeName: c.employee?.name ?? null,
        courseName: c.courseName,
        issueDate: c.issueDate.toISOString(),
        expiryDate: c.expiryDate ? c.expiryDate.toISOString() : null,
        issuedBy: c.issuedBy,
      })))

    return {
      session: view,
      certificates: certs.map((c) => this.toCertView(c, c.employee, courses)),
    }
  }

  // ── Certificates ───────────────────────────────────────────────────────────

  async listCertificates(caller: Caller, f: TrainingFilters) {
    this.membership(caller, f.companyId)

    const roster = await this.db.employee.findMany({
      where: { companyId: f.companyId, ...this.rosterWhere(caller, f.companyId) },
    })
    const byId = new Map(roster.map((e) => [e.id, e]))
    if (roster.length === 0) return []

    const [courses, certs] = await Promise.all([
      this.allCourses(f.companyId),
      this.db.certificate.findMany({
        where: { companyId: f.companyId, employeeId: { in: roster.map((e) => e.id) } },
        orderBy: { issueDate: 'desc' },
      }),
    ])

    const q = f.q?.trim().toLowerCase()
    const views = [...this.currentCerts(certs).values()]
      .map((c) => this.toCertView(c, byId.get(c.employeeId), courses))
      .filter((c) => !f.siteId || c.siteId === f.siteId)
      .filter((c) => !f.status || f.status === 'all' || c.status === f.status)
      .filter(
        (c) => !q || [c.number, c.employeeName, c.courseName].join(' ').toLowerCase().includes(q),
      )

    // Lapsed first, then closest to lapsing — the order someone works down.
    const rank = { expired: 0, expiring: 1, competent: 2 } as const
    return views.sort(
      (a, b) => rank[a.status] - rank[b.status] || (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9),
    )
  }

  /**
   * Public certificate check.
   *
   * Deliberately unscoped by tenant: the point is that a client or an inspector holding
   * the printed number can confirm it, and they are not a member of the workspace. It
   * returns only what is on the certificate itself, which is what the holder already
   * handed over.
   */
  async verifyCertificate(codeOrKey: string) {
    const key = codeOrKey.trim().toUpperCase()
    if (!key) {
      return { valid: false, reason: 'Enter a certificate number to verify.' }
    }

    const cert = await this.db.certificate.findFirst({
      where: { OR: [{ number: key }, { qrKey: key }] },
      include: { employee: true },
    })
    if (!cert) {
      return {
        valid: false,
        reason: 'No certificate matches this code. It may be counterfeit or mistyped.',
      }
    }

    const courses = await this.allCourses(cert.companyId)
    const view = this.toCertView(cert, cert.employee, courses)

    /**
     * Only what is printed on the certificate.
     *
     * This endpoint is deliberately unauthenticated, and the internal view carries far
     * more than the document does: the employee's email and database id, the tenant id,
     * the site and department they work in, and the row's own metadata. Certificate
     * numbers are sequential, so returning that made the whole workforce directory of
     * every tenant enumerable by anyone who could count.
     *
     * An inspector holding the printed certificate already has everything below. They
     * have no business receiving the rest.
     */
    const publicView = {
      number: view.number,
      holder: view.employeeName,
      courseName: view.courseName,
      issueDate: view.issueDate,
      expiryDate: view.expiryDate,
      issuedBy: view.issuedBy,
      status: view.status,
      daysToExpiry: view.daysToExpiry,
    }

    if (view.status === 'expired') {
      return {
        valid: false,
        reason: `Certificate expired on ${cert.expiryDate!.toISOString().slice(0, 10)}. Renewal required.`,
        certificate: publicView,
      }
    }
    return {
      valid: true,
      reason: view.status === 'expiring'
        ? `Valid — expires in ${view.daysToExpiry} days.`
        : 'Valid and current.',
      certificate: publicView,
    }
  }

  /**
   * Turns a lapsed mandatory competency into a tracked corrective action.
   *
   * A gap on a dashboard is a gap nobody owns; this gives it an owner and a date on the
   * same register as every other outstanding safety action.
   */
  async raiseTrainingAction(caller: Caller, employeeId: string, courseId: string) {
    const emp = await this.db.employee.findUnique({ where: { id: employeeId } })
    if (!emp) throw new TrainingError('not_found', 'Employee or course not found.', 404)
    this.requireRole(caller, emp.companyId, REVIEW_ROLES, 'raising a training action')

    const courses = await this.allCourses(emp.companyId)
    const course = courses.find((c) => c.id === courseId)
    if (!course) throw new TrainingError('not_found', 'Employee or course not found.', 404)

    const dueDate = addDays(TRAINING_ACTION_DUE_DAYS)

    return this.db.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { companyId_kind: { companyId: emp.companyId, kind: 'capa' } },
        update: { next: { increment: 1 } },
        create: { companyId: emp.companyId, kind: 'capa', next: 401 },
        select: { next: true },
      })
      return tx.correctiveAction.create({
        data: {
          code: `CA-${counter.next}`,
          source: 'training',
          companyId: emp.companyId,
          siteId: emp.siteId,
          title: `Training lapse: ${emp.name} — ${course.name}`,
          detail:
            `${course.name} is a mandatory competency for ${emp.department} and has lapsed ` +
            `or is missing for ${emp.name}. Enrol and re-certify.`,
          // The HSE team owns its own gaps; everyone else owns theirs.
          owner: emp.department.includes('HSE') ? caller.name : emp.name,
          // The account is known outright here - the caller's own, or the employee's login.
          ownerId: await resolveOwnerId(
            tx, emp.companyId,
            emp.department.includes('HSE') ? caller.name : emp.name,
            emp.department.includes('HSE') ? caller.userId : emp.userId,
          ),
          dueDate,
          priority: 'High',
          createdBy: caller.name,
        },
      })
    })
  }

  // ── Counters ───────────────────────────────────────────────────────────────

  async trainingStats(caller: Caller, companyId: string) {
    this.membership(caller, companyId)

    const [courses, roster, certs, upcomingSessions, completed] = await Promise.all([
      this.allCourses(companyId),
      this.db.employee.findMany({ where: { companyId, active: true } }),
      this.db.certificate.findMany({ where: { companyId } }),
      this.db.trainingSession.count({ where: { companyId, status: 'scheduled' } }),
      this.db.trainingSession.findMany({
        where: { companyId, status: 'completed' },
        include: { enrolments: true },
        take: 1000,
      }),
    ])

    const current = this.currentCerts(certs)
    const comps = roster.map((e) => this.competencyFor(e, courses, current))

    const totalRequired = comps.reduce((s, c) => s + c.requiredCount, 0)
    const totalCompetent = comps.reduce((s, c) => s + c.competentCount, 0)
    const compliancePct = totalRequired
      ? Math.round((totalCompetent / totalRequired) * 100)
      : 100

    let mReq = 0
    let mOk = 0
    for (const e of roster) {
      for (const course of courses.filter((c) => c.mandatory && courseApplies(c, e.department))) {
        mReq++
        const cert = current.get(`${e.id}:${course.id}`)
        if (cert && this.certStatus(cert).status === 'competent') mOk++
      }
    }
    const mandatoryPct = mReq ? Math.round((mOk / mReq) * 100) : 100

    const rosterIds = new Set(roster.map((e) => e.id))
    const views = [...current.values()]
      .filter((c) => rosterIds.has(c.employeeId))
      .map((c) => this.certStatus(c))
    const expiring = (within: number) =>
      views.filter((v) => v.status === 'expiring' && v.days !== null && v.days <= within).length

    const deptAgg = new Map<string, { req: number; ok: number }>()
    const siteAgg = new Map<string, { req: number; ok: number }>()
    for (const c of comps) {
      const d = deptAgg.get(c.department) ?? { req: 0, ok: 0 }
      d.req += c.requiredCount
      d.ok += c.competentCount
      deptAgg.set(c.department, d)
      const s = siteAgg.get(c.siteId) ?? { req: 0, ok: 0 }
      s.req += c.requiredCount
      s.ok += c.competentCount
      siteAgg.set(c.siteId, s)
    }
    const pct = (v: { req: number; ok: number }) => (v.req ? Math.round((v.ok / v.req) * 100) : 100)

    // Hours delivered = course length times the number who actually turned up.
    const monthlyHours: { month: string; Hours: number }[] = []
    for (let m = 5; m >= 0; m--) {
      const start = new Date()
      start.setMonth(start.getMonth() - m, 1)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      const hours = completed
        .filter((s) => s.completedAt && s.completedAt >= start && s.completedAt < end)
        .reduce((sum, s) => sum + s.durationHours * s.enrolments.filter((e) => e.present).length, 0)
      monthlyHours.push({
        month: start.toLocaleDateString('en-MY', { month: 'short' }),
        Hours: hours,
      })
    }

    const expiredCount = views.filter((v) => v.status === 'expired').length

    return {
      compliancePct,
      mandatoryPct,
      totalEmployees: roster.length,
      employeesTrained: comps.filter((c) => c.compliancePct >= 100).length,
      employeesOverdue: comps.filter((c) => c.hasExpiredMandatory).length,
      expiring30: expiring(30),
      expiring60: expiring(60),
      expiring90: expiring(90),
      expired: expiredCount,
      upcomingSessions,
      trainingHoursMonth: monthlyHours[monthlyHours.length - 1]?.Hours ?? 0,
      byDepartment: [...deptAgg.entries()]
        .map(([name, v]) => ({ name, value: pct(v) }))
        .sort((a, b) => a.value - b.value),
      bySite: [...siteAgg.entries()]
        .map(([name, v]) => ({ name: name.toUpperCase(), value: pct(v) }))
        .sort((a, b) => a.value - b.value),
      expiryBreakdown: [
        { name: 'Expired', value: expiredCount },
        { name: '<=30 days', value: expiring(30) },
        { name: '31-60 days', value: expiring(60) - expiring(30) },
        { name: '61-90 days', value: expiring(90) - expiring(60) },
      ],
      monthlyHours,
    }
  }

  // ── Roster ─────────────────────────────────────────────────────────────────

  /** The workforce this caller may see. Feeds the enrolment pickers. */
  async listEmployees(caller: Caller, companyId: string) {
    this.membership(caller, companyId)
    return this.db.employee.findMany({
      where: { companyId, active: true, ...this.rosterWhere(caller, companyId) },
      orderBy: { name: 'asc' },
    })
  }
}

export { BUILT_IN_COURSE_IDS }
