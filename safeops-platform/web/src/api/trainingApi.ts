import { request, qs } from './http'
import type {
  Certificate, CertVerification, CertificateView, CompetencyStatus, CompleteSessionInput,
  CourseCategory, CourseView, DeliveryMode, EmployeeTrainingProfile, NewCourseInput,
  NewSessionInput, SessionFilters, SessionStatus, SessionView, TrainingFilters,
  TrainingMatrix, TrainingStats,
} from './training'
import type { CapaItem } from './capa'

/**
 * HTTP client for the training & competency vertical.
 *
 * Replaces the browser-storage store. Competency is derived on the server from real
 * certificates, so nothing here recomputes a status — it only maps shapes.
 */

const SESSION_STATUS: Record<string, SessionStatus> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

interface ServerCourse {
  id: string
  code: string
  name: string
  category: CourseCategory
  description: string
  mandatory: boolean
  validityMonths: number | null
  durationHours: number
  deliveryModes: DeliveryMode[]
  competency: string
  passMark: number
  applies: string[]
  custom?: boolean
  requiredEmployees: number
  certifiedEmployees: number
  compliancePct: number
  upcomingSessions: number
}

interface ServerCert {
  id: string
  number: string
  qrKey: string
  employeeId: string
  employeeName: string
  courseId: string
  courseName: string
  sessionId: string | null
  issueDate: string
  expiryDate: string | null
  issuedBy: string
  score: number | null
  docName: string | null
  status: 'competent' | 'expiring' | 'expired'
  daysToExpiry: number | null
  siteId: string
  department: string
  mandatory: boolean
}

interface ServerSession {
  id: string
  code: string
  companyId: string
  siteId: string
  courseId: string
  courseName: string
  trainer: string
  venue: string
  mode: DeliveryMode
  scheduledFor: string
  durationHours: number
  maxParticipants: number
  status: string
  signature: string | null
  completedAt: string | null
  completedBy: string | null
  enrolled: string[]
  attendance: { employeeId: string; present: boolean; result: 'pass' | 'fail' | null; score: number | null }[]
  enrolledCount: number
  passedCount: number
  siteName: string
  daysToStart: number
  overdue: boolean
  seatsLeft: number
}

interface ServerEmployee {
  id: string
  companyId: string
  siteId: string
  department: string
  name: string
  position: string
}

interface ServerAction {
  id: string
  code: string
  title: string
  detail: string
  owner: string
  dueDate: string
  priority: CapaItem['priority']
  status: string
  companyId: string
  siteId: string
  createdAt: string
}

const nu = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

/** Date-only fields are stored at UTC midnight, so the first ten characters are the date. */
const asDate = (iso: string) => iso.slice(0, 10)

function toCourse(c: ServerCourse): CourseView {
  return {
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
    // The server keeps an empty list for "whole workforce"; the UI type uses 'all'.
    applies: c.applies.length === 0 ? 'all' : c.applies,
    custom: c.custom,
    requiredEmployees: c.requiredEmployees,
    certifiedEmployees: c.certifiedEmployees,
    compliancePct: c.compliancePct,
    upcomingSessions: c.upcomingSessions,
  }
}

export function toCertificate(c: ServerCert): CertificateView {
  return {
    id: c.id,
    number: c.number,
    qrKey: c.qrKey,
    employeeId: c.employeeId,
    employeeName: c.employeeName,
    courseId: c.courseId,
    courseName: c.courseName,
    sessionId: nu(c.sessionId),
    issueDate: asDate(c.issueDate),
    expiryDate: c.expiryDate ? asDate(c.expiryDate) : null,
    issuedBy: c.issuedBy,
    score: nu(c.score),
    docName: nu(c.docName),
    status: c.status,
    daysToExpiry: c.daysToExpiry,
    siteId: c.siteId,
    department: c.department,
    mandatory: c.mandatory,
  }
}

export function toSession(s: ServerSession): SessionView {
  return {
    id: s.id,
    code: s.code,
    courseId: s.courseId,
    courseName: s.courseName,
    trainer: s.trainer,
    venue: s.venue,
    mode: s.mode,
    scheduledFor: asDate(s.scheduledFor),
    durationHours: s.durationHours,
    maxParticipants: s.maxParticipants,
    companyId: s.companyId,
    siteId: s.siteId,
    status: SESSION_STATUS[s.status] ?? 'Scheduled',
    enrolled: s.enrolled,
    attendance: s.attendance.map((a) => ({
      employeeId: a.employeeId,
      employeeName: '',
      present: a.present,
      result: a.result,
      score: nu(a.score),
    })),
    signature: nu(s.signature),
    completedAt: nu(s.completedAt),
    completedBy: nu(s.completedBy),
    // Certificates are read from the register rather than carried on the session row.
    certificatesIssued: [],
    enrolledCount: s.enrolledCount,
    passedCount: s.passedCount,
    siteName: s.siteName,
    daysToStart: s.daysToStart,
    overdue: s.overdue,
    seatsLeft: s.seatsLeft,
  }
}

export const trainingApi = {
  async listCourses(companyId: string): Promise<CourseView[]> {
    const rows = await request<ServerCourse[]>(`/training/courses?${qs({ companyId })}`)
    return rows.map(toCourse)
  },

  async createCourse(companyId: string, input: NewCourseInput): Promise<CourseView> {
    const c = await request<ServerCourse>('/training/courses', {
      method: 'POST',
      body: JSON.stringify({ companyId, ...input }),
    })
    // A freshly created course has no cohort yet; the register recomputes on next read.
    return toCourse({
      ...c,
      requiredEmployees: c.requiredEmployees ?? 0,
      certifiedEmployees: c.certifiedEmployees ?? 0,
      compliancePct: c.compliancePct ?? 100,
      upcomingSessions: c.upcomingSessions ?? 0,
      custom: true,
    })
  },

  async matrix(companyId: string): Promise<TrainingMatrix> {
    return request<TrainingMatrix>(`/training/matrix?${qs({ companyId })}`)
  },

  async employeeProfile(employeeId: string): Promise<EmployeeTrainingProfile> {
    const p = await request<{
      competency: EmployeeTrainingProfile['competency']
      required: { course: ServerCourse; status: CompetencyStatus; cert?: ServerCert }[]
      certificates: ServerCert[]
      upcomingRenewals: EmployeeTrainingProfile['upcomingRenewals']
      enrolledSessions: ServerSession[]
      history: EmployeeTrainingProfile['history']
    }>(`/training/employees/${employeeId}`)

    return {
      competency: p.competency,
      required: p.required.map((r) => ({
        course: toCourse(r.course),
        status: r.status,
        cert: r.cert ? toCertificate(r.cert) : undefined,
      })),
      certificates: p.certificates.map(toCertificate),
      upcomingRenewals: p.upcomingRenewals,
      enrolledSessions: p.enrolledSessions.map(toSession),
      history: p.history,
    }
  },

  async listSessions(companyId: string, filters: SessionFilters = {}): Promise<SessionView[]> {
    const rows = await request<ServerSession[]>(`/training/sessions?${qs({
      companyId, q: filters.q, siteId: filters.siteId,
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
    })}`)
    return rows.map(toSession)
  },

  async createSession(input: NewSessionInput): Promise<SessionView> {
    return toSession(await request<ServerSession>('/training/sessions', {
      method: 'POST', body: JSON.stringify(input),
    }))
  },

  async enrollSession(sessionId: string, employeeIds: string[]): Promise<SessionView> {
    return toSession(await request<ServerSession>(`/training/sessions/${sessionId}/enrol`, {
      method: 'POST', body: JSON.stringify({ employeeIds }),
    }))
  },

  async completeSession(sessionId: string, input: CompleteSessionInput) {
    const r = await request<{ session: ServerSession; certificates: ServerCert[] }>(
      `/training/sessions/${sessionId}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({
          signature: input.signature,
          attendance: input.attendance.map((a) => ({
            employeeId: a.employeeId, present: a.present, result: a.result, score: a.score,
          })),
        }),
      },
    )
    return { session: toSession(r.session), certificates: r.certificates.map(toCertificate) }
  },

  async listCertificates(companyId: string, filters: TrainingFilters = {}): Promise<CertificateView[]> {
    const rows = await request<ServerCert[]>(`/training/certificates?${qs({
      companyId, q: filters.q, siteId: filters.siteId,
      status: filters.status && filters.status !== 'all' ? filters.status : undefined,
    })}`)
    return rows.map(toCertificate)
  },

  /**
   * Public — no session required, the same as reading the printed certificate.
   *
   * The response carries only what the document shows. It is not a `CertificateView`
   * and must not be widened into one: this endpoint answers to anyone, and certificate
   * numbers are sequential.
   */
  async verifyCertificate(codeOrKey: string): Promise<CertVerification> {
    return request<CertVerification>(`/training/verify?${qs({ code: codeOrKey })}`)
  },

  async raiseTrainingAction(employeeId: string, courseId: string): Promise<CapaItem> {
    const a = await request<ServerAction>('/training/actions', {
      method: 'POST', body: JSON.stringify({ employeeId, courseId }),
    })
    const daysToDue = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400_000)
    return {
      id: a.id,
      code: a.code,
      title: a.title,
      companyId: a.companyId,
      siteId: a.siteId,
      department: '',
      incidentId: null,
      owner: a.owner,
      priority: a.priority,
      dueDate: asDate(a.dueDate),
      createdAt: a.createdAt,
      status: 'Open',
      derived: 'Assigned',
      overdue: daysToDue < 0,
      daysToDue,
      progress: 0,
      evidenceRequired: true,
      notes: [],
      timeline: [],
    } as CapaItem
  },

  async listEmployees(companyId: string): Promise<ServerEmployee[]> {
    return request<ServerEmployee[]>(`/training/employees?${qs({ companyId })}`)
  },

  async stats(companyId: string): Promise<TrainingStats> {
    return request<TrainingStats>(`/training/stats?${qs({ companyId })}`)
  },
}

export type { Certificate }
