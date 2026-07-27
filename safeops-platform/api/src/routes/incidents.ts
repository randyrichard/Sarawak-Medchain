import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { IncidentError, IncidentService, type Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new IncidentService(prisma)
export const incidentsRouter = Router()

// Identity always comes from the verified token, never from the request body.
incidentsRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const MAX_PAGE_SIZE = 100

const listQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  // Bounded: an unbounded page size lets one request pull the whole table.
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(25),
  q: z.string().max(200).optional(),
  type: z.string().optional(),
  severity: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum(['open', 'closed', 'high_risk', 'all']).optional(),
  siteId: z.string().optional(),
})

incidentsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    res.json(await svc.list(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

incidentsRouter.get('/stats', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined
    res.json(await svc.stats(callerOf(req), companyId, siteId))
  } catch (e) {
    next(e)
  }
})

incidentsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await svc.get(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const createBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  type: z.enum([
    'near_miss', 'first_aid', 'mtc', 'rwc', 'lti', 'fatality', 'property_damage',
    'environmental', 'vehicle', 'fire', 'unsafe_act', 'unsafe_condition',
  ]),
  severity: z.enum(['Minor', 'Moderate', 'Serious', 'Critical']),
  department: z.string().max(120).optional(),
  location: z.string().min(1).max(300),
  gps: z.string().max(120).optional(),
  immediateActions: z.string().max(5000).optional(),
  occurredAt: z.string().datetime(),
})

incidentsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid incident payload.',
      })
    }
    res.status(201).json(await svc.create(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

const advanceBody = z.object({
  to: z.string().min(1),
  note: z.string().max(5000).optional(),
  investigator: z.string().max(200).optional(),
  findings: z.string().max(10000).optional(),
  riskRating: z.enum(['Low', 'Medium', 'High', 'Extreme']).optional(),
  potentialSeverity: z.enum(['Minor', 'Moderate', 'Serious', 'Critical']).optional(),
  expectedVersion: z.number().int().optional(),
})

incidentsRouter.post('/:id/advance', async (req, res, next) => {
  try {
    const parsed = advanceBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid stage transition payload.' })
    }
    res.json(await svc.advance(callerOf(req), req.params.id, parsed.data))
  } catch (e) {
    next(e)
  }
})

export { IncidentError }
