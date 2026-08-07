import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import {
  INCIDENT_STATUS_FILTERS, IncidentError, IncidentService, type Caller,
} from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { INCIDENT_SEVERITIES, INCIDENT_TYPES } from '../lib/incidentCatalog.js'

/** One list, used to build the report form and to validate what comes back from it. */
const TYPE_VALUES = z.enum(
  INCIDENT_TYPES.map((t) => t.value) as [string, ...string[]],
)
const SEVERITY_VALUES = z.enum(
  INCIDENT_SEVERITIES.map((s) => s.value) as [string, ...string[]],
)

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
  status: z.enum(INCIDENT_STATUS_FILTERS).optional(),
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
  /*
   * Derived from the catalogue rather than listed again. These were hardcoded copies, so
   * adding a type server-side left the route rejecting it - the classification list and
   * the thing that validates against it have to be the same list.
   */
  type: TYPE_VALUES,
  severity: SEVERITY_VALUES,
  department: z.string().max(120).optional(),
  departmentId: z.string().optional(),
  location: z.string().min(1).max(300),
  gps: z.string().max(120).optional(),
  immediateActions: z.string().max(5000).optional(),
  weather: z.string().max(120).optional(),
  shift: z.string().max(120).optional(),
  emergencyResponseActivated: z.boolean().optional(),
  anonymous: z.boolean().optional(),
  /*
   * Offsets accepted, not just Z. This platform is sold in Malaysia and the natural thing
   * for a client to send is local time as +08:00; zod's default rejects that, which turns
   * a correct ISO-8601 timestamp into a 400 nobody can explain. Stored as UTC either way.
   */
  occurredAt: z.string().datetime({ offset: true }),
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
  potentialSeverity: SEVERITY_VALUES.optional(),
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
