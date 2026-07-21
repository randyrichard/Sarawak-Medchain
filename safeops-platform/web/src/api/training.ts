// ─── Training & Competency domain ────────────────────────────────────────────
// Courses define what competency looks like; sessions deliver training and
// generate certificates; certificates drive the live competency matrix and
// expiry reminders. Everything ties back to real employee profiles.

export type CourseCategory = 'induction' | 'safety' | 'equipment' | 'emergency' | 'health' | 'environmental' | 'custom'

export const CATEGORY_LABEL: Record<CourseCategory, string> = {
  induction: 'Induction',
  safety: 'Safety',
  equipment: 'Equipment',
  emergency: 'Emergency',
  health: 'Health',
  environmental: 'Environmental',
  custom: 'Custom',
}

export type DeliveryMode = 'online' | 'physical'

export interface TrainingCourse {
  id: string
  code: string // TRN-###
  name: string
  category: CourseCategory
  description: string
  mandatory: boolean
  /** null = one-time competency with no expiry */
  validityMonths: number | null
  durationHours: number
  deliveryModes: DeliveryMode[]
  competency: string
  passMark: number
  /** department-name keywords this course applies to; 'all' = whole workforce */
  applies: 'all' | string[]
  custom?: boolean
}

export interface CourseView extends TrainingCourse {
  requiredEmployees: number
  certifiedEmployees: number
  compliancePct: number
  upcomingSessions: number
}

export type CompetencyStatus = 'competent' | 'expiring' | 'expired' | 'missing' | 'na'

export interface Certificate {
  id: string
  number: string // CERT-YYYY-####
  qrKey: string
  employeeId: string
  employeeName: string
  courseId: string
  courseName: string
  sessionId?: string
  issueDate: string
  expiryDate: string | null
  issuedBy: string
  score?: number
  docName?: string
}

export interface CertificateView extends Certificate {
  status: 'competent' | 'expiring' | 'expired'
  daysToExpiry: number | null
  siteId: string
  department: string
  mandatory: boolean
}

export type SessionStatus = 'Scheduled' | 'Completed' | 'Cancelled'

export interface SessionAttendee {
  employeeId: string
  employeeName: string
  present: boolean
  result: 'pass' | 'fail' | null
  score?: number
}

export interface TrainingSession {
  id: string
  code: string // SES-###
  courseId: string
  courseName: string
  trainer: string
  venue: string
  mode: DeliveryMode
  scheduledFor: string
  durationHours: number
  maxParticipants: number
  companyId: string
  siteId: string
  status: SessionStatus
  enrolled: string[]
  attendance?: SessionAttendee[]
  signature?: string
  completedAt?: string
  completedBy?: string
  certificatesIssued: string[]
}

export interface SessionView extends TrainingSession {
  enrolledCount: number
  passedCount: number
  siteName: string
  daysToStart: number
  overdue: boolean
  seatsLeft: number
}

// ─── Competency matrix ───────────────────────────────────────────────────────

export type CompetencyLevel = 'Fully Competent' | 'Competent' | 'Developing' | 'At Risk'

export interface MatrixCell {
  courseId: string
  status: CompetencyStatus
  expiryDate?: string | null
  certId?: string
}

export interface EmployeeCompetency {
  employeeId: string
  name: string
  position: string
  siteId: string
  department: string
  level: CompetencyLevel
  compliancePct: number
  requiredCount: number
  competentCount: number
  expiringCount: number
  gapCount: number // expired + missing
  hasExpiredMandatory: boolean
  cells: Record<string, MatrixCell>
}

export interface TrainingMatrix {
  courses: { id: string; code: string; name: string; mandatory: boolean }[]
  employees: EmployeeCompetency[]
}

export interface EmployeeTrainingProfile {
  competency: EmployeeCompetency
  required: { course: TrainingCourse; status: CompetencyStatus; cert?: CertificateView }[]
  certificates: CertificateView[]
  upcomingRenewals: { courseName: string; expiryDate: string; daysToExpiry: number }[]
  enrolledSessions: SessionView[]
  history: { at: string; kind: 'certified' | 'enrolled' | 'expired'; text: string }[]
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface NewCourseInput {
  name: string
  category: CourseCategory
  description: string
  mandatory: boolean
  validityMonths: number | null
  durationHours: number
  deliveryModes: DeliveryMode[]
  competency: string
  applies: string[]
}

export interface NewSessionInput {
  courseId: string
  trainer: string
  venue: string
  mode: DeliveryMode
  scheduledFor: string
  maxParticipants: number
  companyId: string
  siteId: string
  enrolled: string[]
}

export interface CompleteSessionInput {
  attendance: SessionAttendee[]
  signature: string
}

export interface CertVerification {
  valid: boolean
  reason: string
  certificate?: CertificateView
}

export interface TrainingFilters {
  q?: string
  siteId?: string
  status?: 'all' | 'competent' | 'expiring' | 'expired'
}

export interface SessionFilters {
  q?: string
  siteId?: string
  status?: 'all' | 'scheduled' | 'completed'
}

export interface TrainingStats {
  compliancePct: number
  mandatoryPct: number
  totalEmployees: number
  employeesTrained: number
  employeesOverdue: number
  expiring30: number
  expiring60: number
  expiring90: number
  expired: number
  upcomingSessions: number
  trainingHoursMonth: number
  byDepartment: { name: string; value: number }[]
  bySite: { name: string; value: number }[]
  expiryBreakdown: { name: string; value: number }[]
  monthlyHours: { month: string; Hours: number }[]
}
