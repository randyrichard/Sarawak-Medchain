import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { TrainingError, TrainingService } from '../lib/trainingService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new TrainingService(prisma)
export const trainingRouter = Router()

const CATEGORY = z.enum([
  'induction', 'safety', 'equipment', 'emergency', 'health', 'environmental', 'custom',
])
const MODE = z.enum(['online', 'physical'])
const companyQuery = z.object({ companyId: z.string().min(1) })

/**
 * Certificate verification is public on purpose.
 *
 * The point of a QR on a printed certificate is that a client or an inspector can check
 * it, and they hold no SafeOps session. It is registered before `requireAuth` and returns
 * only what is already on the certificate the holder handed over.
 */
const verifyQuery = z.object({ code: z.string().min(1).max(120) })

trainingRouter.get('/verify', asyncRoute(async (req, res) => {
  const parsed = verifyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'A certificate code is required.' })
  }
  res.json(await svc.verifyCertificate(parsed.data.code))
}))

// Everything below requires a verified session.
trainingRouter.use(requireAuth)

// ── Literal paths first ──────────────────────────────────────────────────────
// Express matches in declaration order, so every literal collection is registered
// before the parameterised employee and session routes below.

trainingRouter.get('/courses', asyncRoute(async (req, res) => {
  const parsed = companyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.listCourses(callerOf(req), parsed.data.companyId))
}))

const courseBody = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(200),
  category: CATEGORY,
  description: z.string().max(2000).optional(),
  mandatory: z.boolean().default(false),
  validityMonths: z.number().int().positive().max(600).nullable().default(null),
  durationHours: z.coerce.number().positive().max(500),
  deliveryModes: z.array(MODE).min(1).max(2),
  competency: z.string().max(200).optional(),
  applies: z.array(z.string().max(120)).max(30).optional(),
})

trainingRouter.post('/courses', asyncRoute(async (req, res) => {
  const parsed = courseBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid course payload.',
    })
  }
  const { companyId, ...input } = parsed.data
  res.status(201).json(await svc.createCourse(callerOf(req), companyId, input))
}))

trainingRouter.get('/matrix', asyncRoute(async (req, res) => {
  const parsed = companyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.trainingMatrix(callerOf(req), parsed.data.companyId))
}))

trainingRouter.get('/stats', asyncRoute(async (req, res) => {
  const parsed = companyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.trainingStats(callerOf(req), parsed.data.companyId))
}))

trainingRouter.get('/employees', asyncRoute(async (req, res) => {
  const parsed = companyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.listEmployees(callerOf(req), parsed.data.companyId))
}))

const certQuery = z.object({
  companyId: z.string().min(1),
  q: z.string().max(200).optional(),
  siteId: z.string().max(120).optional(),
  status: z.enum(['all', 'competent', 'expiring', 'expired']).optional(),
})

trainingRouter.get('/certificates', asyncRoute(async (req, res) => {
  const parsed = certQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  res.json(await svc.listCertificates(callerOf(req), parsed.data))
}))

const sessionQuery = z.object({
  companyId: z.string().min(1),
  q: z.string().max(200).optional(),
  siteId: z.string().max(120).optional(),
  status: z.enum(['all', 'scheduled', 'completed']).optional(),
})

trainingRouter.get('/sessions', asyncRoute(async (req, res) => {
  const parsed = sessionQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  res.json(await svc.listSessions(callerOf(req), parsed.data))
}))

const sessionBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  courseId: z.string().min(1).max(120),
  trainer: z.string().min(1).max(200),
  venue: z.string().min(1).max(300),
  mode: MODE,
  scheduledFor: z.string().min(1).max(40),
  maxParticipants: z.coerce.number().int().positive().max(500),
  enrolled: z.array(z.string().max(120)).max(500).optional(),
})

trainingRouter.post('/sessions', asyncRoute(async (req, res) => {
  const parsed = sessionBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid session payload.',
    })
  }
  res.status(201).json(await svc.createSession(callerOf(req), parsed.data))
}))

const enrolBody = z.object({
  employeeIds: z.array(z.string().max(120)).min(1).max(500),
})

trainingRouter.post('/sessions/:id/enrol', asyncRoute(async (req, res) => {
  const parsed = enrolBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Select at least one employee.' })
  }
  res.json(await svc.enrollSession(callerOf(req), req.params.id, parsed.data.employeeIds))
}))

const completeBody = z.object({
  attendance: z.array(z.object({
    employeeId: z.string().min(1).max(120),
    present: z.boolean(),
    result: z.enum(['pass', 'fail']).nullable(),
    score: z.coerce.number().int().min(0).max(100).optional(),
  })).min(1).max(500),
  signature: z.string().min(1).max(200),
})

trainingRouter.post('/sessions/:id/complete', asyncRoute(async (req, res) => {
  const parsed = completeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid attendance payload.',
    })
  }
  res.json(await svc.completeSession(callerOf(req), req.params.id, parsed.data))
}))

const actionBody = z.object({
  employeeId: z.string().min(1).max(120),
  courseId: z.string().min(1).max(120),
})

trainingRouter.post('/actions', asyncRoute(async (req, res) => {
  const parsed = actionBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Employee and course are required.' })
  }
  const { employeeId, courseId } = parsed.data
  res.status(201).json(await svc.raiseTrainingAction(callerOf(req), employeeId, courseId))
}))

// ── Parameterised paths ──────────────────────────────────────────────────────

trainingRouter.get('/employees/:employeeId', asyncRoute(async (req, res) => {
  res.json(await svc.getEmployeeTraining(callerOf(req), req.params.employeeId))
}))

export { TrainingError }
