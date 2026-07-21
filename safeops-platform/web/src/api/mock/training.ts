// ─── Training catalog + roster helpers + seeds ───────────────────────────────

import type { Certificate, TrainingCourse, TrainingSession } from '../training'
import { DEPARTMENTS, EMPLOYEES } from './fixtures'

export const TRAINING_COURSES: TrainingCourse[] = [
  {
    id: 'trn-101', code: 'TRN-101', name: 'Safety Induction', category: 'induction',
    description: 'Site HSE rules, hazards, emergency procedures and worker rights. Required before any site access.',
    mandatory: true, validityMonths: 24, durationHours: 4, deliveryModes: ['physical', 'online'],
    competency: 'Site-safe worker', passMark: 80, applies: 'all',
  },
  {
    id: 'trn-102', code: 'TRN-102', name: 'Working at Height', category: 'safety',
    description: 'Fall-arrest systems, anchor points, ladder & scaffold safety, rescue awareness.',
    mandatory: true, validityMonths: 24, durationHours: 8, deliveryModes: ['physical'],
    competency: 'Authorised for work at height', passMark: 80, applies: ['Maintenance', 'Contractors', 'Field', 'Civil', 'M&E'],
  },
  {
    id: 'trn-103', code: 'TRN-103', name: 'Confined Space Entry', category: 'safety',
    description: 'Atmospheric testing, entry permits, ventilation and standby-person duties.',
    mandatory: true, validityMonths: 24, durationHours: 8, deliveryModes: ['physical'],
    competency: 'Confined space entrant', passMark: 85, applies: ['Field', 'Maintenance'],
  },
  {
    id: 'trn-104', code: 'TRN-104', name: 'Lockout / Tagout (LOTO)', category: 'safety',
    description: 'Isolation of hazardous energy, group lockout, verification and restoration.',
    mandatory: true, validityMonths: 24, durationHours: 4, deliveryModes: ['physical', 'online'],
    competency: 'Authorised isolator', passMark: 80, applies: ['Maintenance', 'Production', 'Mill'],
  },
  {
    id: 'trn-105', code: 'TRN-105', name: 'Forklift Operation', category: 'equipment',
    description: 'Powered industrial truck operation, load handling, pedestrian safety and daily checks.',
    mandatory: true, validityMonths: 36, durationHours: 16, deliveryModes: ['physical'],
    competency: 'Licensed forklift operator', passMark: 80, applies: ['Warehouse', 'Logistics', 'Stores'],
  },
  {
    id: 'trn-106', code: 'TRN-106', name: 'Chemical Handling (USECHH)', category: 'health',
    description: 'Safe handling, SDS interpretation, spill response and PPE for hazardous chemicals.',
    mandatory: true, validityMonths: 24, durationHours: 6, deliveryModes: ['physical', 'online'],
    competency: 'Chemical handler', passMark: 80, applies: ['Production', 'Mill', 'Field'],
  },
  {
    id: 'trn-107', code: 'TRN-107', name: 'Fire Warden', category: 'emergency',
    description: 'Evacuation coordination, extinguisher use, headcount and assembly-point duties.',
    mandatory: false, validityMonths: 12, durationHours: 4, deliveryModes: ['physical'],
    competency: 'Appointed fire warden', passMark: 80, applies: ['Warehouse', 'Production', 'HSE'],
  },
  {
    id: 'trn-108', code: 'TRN-108', name: 'Emergency Response Team', category: 'emergency',
    description: 'ERT roles, casualty handling, breathing apparatus awareness and incident command.',
    mandatory: false, validityMonths: 12, durationHours: 16, deliveryModes: ['physical'],
    competency: 'ERT member', passMark: 85, applies: ['HSE', 'Field'],
  },
  {
    id: 'trn-109', code: 'TRN-109', name: 'First Aid & CPR', category: 'health',
    description: 'Primary survey, CPR, bleeding control and workplace first-aid response (MRC certified).',
    mandatory: false, validityMonths: 24, durationHours: 16, deliveryModes: ['physical'],
    competency: 'Certified first aider', passMark: 80, applies: ['HSE', 'Warehouse', 'Mill'],
  },
  {
    id: 'trn-110', code: 'TRN-110', name: 'Permit-to-Work Authorisation', category: 'safety',
    description: 'Issuing and receiving permits, isolation confirmation, gas testing and sign-off.',
    mandatory: true, validityMonths: 24, durationHours: 4, deliveryModes: ['physical', 'online'],
    competency: 'Permit authoriser', passMark: 85, applies: ['Field', 'Maintenance'],
  },
]

const DEPT_NAME = new Map(DEPARTMENTS.map((d) => [d.id, d.name]))
export const deptNameOf = (departmentId: string) => DEPT_NAME.get(departmentId) ?? departmentId

export function courseApplies(course: TrainingCourse, deptName: string): boolean {
  if (course.applies === 'all') return true
  return course.applies.some((kw) => deptName.toLowerCase().includes(kw.toLowerCase()))
}

export interface RosterEntry {
  id: string
  name: string
  position: string
  siteId: string
  department: string
}

export function rosterFor(companyId: string): RosterEntry[] {
  return EMPLOYEES.filter((e) => e.companyId === companyId).map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    siteId: e.siteId,
    department: deptNameOf(e.departmentId),
  }))
}

export function requiredCoursesFor(deptName: string): TrainingCourse[] {
  return TRAINING_COURSES.filter((c) => courseApplies(c, deptName))
}

// ─── Certificate & session seeds ─────────────────────────────────────────────

const day = 86400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const shiftMonths = (base: Date, months: number) => {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Per (employeeId, courseId) deliberate states to drive the demo narrative;
 *  everything else defaults to 'competent'. */
const OVERRIDES: Record<string, 'expiring' | 'expired' | 'missing'> = {
  'e15:trn-105': 'expiring', // Siti — forklift refresher due (matches CA-914 / compliance obligation)
  'e16:trn-105': 'expiring', // Bong — forklift
  'e10:trn-105': 'expiring', // Melissa — forklift
  'e03:trn-104': 'expired', // Ganesh — LOTO lapsed (mandatory → overdue)
  'e14:trn-102': 'missing', // Kenny — never did Working at Height (mandatory → overdue)
  'e14:trn-104': 'expiring', // Kenny — LOTO expiring
  'e17:trn-103': 'expiring', // Hafiz — confined space
  'e20:trn-106': 'expired', // Lim Boon — chemical handling lapsed (mandatory → overdue)
  'e05:trn-110': 'missing', // Faizal — permit-to-work not done (mandatory → overdue)
  'e18:trn-109': 'expiring', // Nurul — first aid expiring
  'e19:trn-101': 'expiring', // Kumar — induction refresher due
}

let certSeq = 0
const certNo = () => `CERT-2026-${String(++certSeq).padStart(4, '0')}`

export function buildCertificateSeeds(): Certificate[] {
  const now = new Date()
  const certs: Certificate[] = []
  for (const company of ['big', 'kcs']) {
    for (const emp of rosterFor(company)) {
      for (const course of requiredCoursesFor(emp.department)) {
        const key = `${emp.id}:${course.id}`
        const state = OVERRIDES[key] ?? 'competent'
        if (state === 'missing') continue

        let expiry: Date | null
        let issue: Date
        if (course.validityMonths === null) {
          issue = shiftMonths(now, -8)
          expiry = null
        } else if (state === 'expiring') {
          expiry = new Date(now.getTime() + 45 * day)
          issue = shiftMonths(expiry, -course.validityMonths)
        } else if (state === 'expired') {
          expiry = new Date(now.getTime() - 15 * day)
          issue = shiftMonths(expiry, -course.validityMonths)
        } else {
          issue = shiftMonths(now, -8)
          expiry = shiftMonths(issue, course.validityMonths)
        }

        const number = certNo()
        certs.push({
          id: `cert-${emp.id}-${course.id}`,
          number,
          qrKey: number, // certificate number is the QR payload (stable, scannable)
          employeeId: emp.id,
          employeeName: emp.name,
          courseId: course.id,
          courseName: course.name,
          issueDate: iso(issue),
          expiryDate: expiry ? iso(expiry) : null,
          issuedBy: course.category === 'health' ? 'MRC Trainer' : 'Marcus Tan',
          score: 82 + ((certSeq * 7) % 16),
        })
      }
    }
  }
  return certs
}

let sesSeq = 500
const sesCode = () => `SES-${sesSeq++}`

export function buildSessionSeeds(): TrainingSession[] {
  const now = Date.now()
  const dAt = (offset: number) => iso(new Date(now + offset * day))
  const course = (id: string) => TRAINING_COURSES.find((c) => c.id === id)!

  const sessions: TrainingSession[] = [
    // Completed this month — provides "training hours this month"
    {
      id: 'ses-500', code: sesCode(), courseId: 'trn-101', courseName: course('trn-101').name,
      trainer: 'Marcus Tan', venue: 'Kuching training auditorium', mode: 'physical',
      scheduledFor: dAt(-8), durationHours: 4, maxParticipants: 30, companyId: 'big', siteId: 'kch',
      status: 'Completed', enrolled: ['e13', 'e14', 'e17'],
      attendance: [
        { employeeId: 'e13', employeeName: 'Rosli Ahmad', present: true, result: 'pass', score: 88 },
        { employeeId: 'e14', employeeName: 'Kenny Lau', present: true, result: 'pass', score: 84 },
        { employeeId: 'e17', employeeName: 'Hafiz Rahman', present: true, result: 'pass', score: 90 },
      ],
      completedAt: new Date(now - 8 * day).toISOString(), completedBy: 'Marcus Tan', signature: 'Marcus Tan',
      certificatesIssued: [],
    },
    // Upcoming — the forklift refresher we run in the demo to turn Senari green
    {
      id: 'ses-501', code: sesCode(), courseId: 'trn-105', courseName: course('trn-105').name,
      trainer: 'Grace Lim', venue: 'Senari warehouse training bay', mode: 'physical',
      scheduledFor: dAt(6), durationHours: 16, maxParticipants: 8, companyId: 'big', siteId: 'sen',
      status: 'Scheduled', enrolled: ['e15', 'e16', 'e10'], certificatesIssued: [],
    },
    {
      id: 'ses-502', code: sesCode(), courseId: 'trn-102', courseName: course('trn-102').name,
      trainer: 'Vincent Chai', venue: 'Miri site classroom', mode: 'physical',
      scheduledFor: dAt(10), durationHours: 8, maxParticipants: 12, companyId: 'big', siteId: 'mri',
      status: 'Scheduled', enrolled: ['e14', 'e19'], certificatesIssued: [],
    },
    {
      id: 'ses-503', code: sesCode(), courseId: 'trn-109', courseName: course('trn-109').name,
      trainer: 'MRC Trainer', venue: 'Bintulu clinic', mode: 'physical',
      scheduledFor: dAt(14), durationHours: 16, maxParticipants: 10, companyId: 'big', siteId: 'btu',
      status: 'Scheduled', enrolled: ['e18'], certificatesIssued: [],
    },
    {
      id: 'ses-504', code: sesCode(), courseId: 'trn-104', courseName: course('trn-104').name,
      trainer: 'Ganesh Pillai', venue: 'Online (Microsoft Teams)', mode: 'online',
      scheduledFor: dAt(3), durationHours: 4, maxParticipants: 20, companyId: 'big', siteId: 'kch',
      status: 'Scheduled', enrolled: ['e03', 'e14'], certificatesIssued: [],
    },
    {
      id: 'ses-k50', code: sesCode(), courseId: 'trn-101', courseName: course('trn-101').name,
      trainer: 'Azlan Mahmud', venue: 'Petra Jaya site office', mode: 'physical',
      scheduledFor: dAt(5), durationHours: 4, maxParticipants: 25, companyId: 'kcs', siteId: 'pjy',
      status: 'Scheduled', enrolled: ['e11', 'e12'], certificatesIssued: [],
    },
  ]
  return sessions
}
