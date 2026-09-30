import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { VisitorError, VisitorService, ACKNOWLEDGEMENTS } from '../lib/visitorService.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { callerOf } from '../middleware/caller.js'

/**
 * Visitor management.
 *
 * Literal paths are declared before /:id, the same rule as the incident and asset routers:
 * Express matches in declaration order, and /visitors/blacklist would otherwise be looked
 * up as a visitor whose id happens to read "blacklist".
 */
const svc = new VisitorService(prisma)
export const visitorsRouter = Router()

// Identity always comes from the verified token, never from the request body.
visitorsRouter.use(requireAuth)

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

const VISITOR_STATUS = z.enum([
  'draft', 'pre_registered', 'waiting', 'checked_in', 'on_site',
  'checked_out', 'expired', 'denied', 'blacklisted', 'cancelled',
])

// ── Literal paths first ──────────────────────────────────────────────────────

visitorsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined
    res.json(await svc.dashboard(callerOf(req), companyId, siteId))
  } catch (e) {
    next(e)
  }
})

/** The site rules, served so the screen shows exactly what the server will require. */
visitorsRouter.get('/acknowledgements', (_req, res) => {
  res.json(ACKNOWLEDGEMENTS)
})

visitorsRouter.get('/blacklist', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json({ rows: await svc.listBlacklist(callerOf(req), companyId) })
  } catch (e) {
    next(e)
  }
})

const blacklistBody = z.object({
  companyId: z.string().min(1),
  idNumber: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  visitorCompany: z.string().max(200).optional(),
  vehicleNumber: z.string().max(60).optional(),
  reason: z.string().min(1).max(2000),
  expiresAt: z.string().max(40).nullable().optional(),
})

visitorsRouter.post('/blacklist', async (req, res, next) => {
  try {
    const parsed = blacklistBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'A reason and at least one detail to match on are required.',
      })
    }
    const { companyId, ...rest } = parsed.data
    res.status(201).json(await svc.addToBlacklist(callerOf(req), companyId, rest, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.post('/blacklist/:id/lift', async (req, res, next) => {
  try {
    res.json(await svc.liftBlacklist(callerOf(req), req.params.id, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

/** Resolve a scanned pass. Read-only; every mutation below still needs a session. */
visitorsRouter.get('/pass/:passKey', async (req, res, next) => {
  try {
    res.json(await svc.byPassKey(callerOf(req), req.params.passKey))
  } catch (e) {
    next(e)
  }
})

const listQuery = z.object({
  companyId: z.string().min(1),
  status: z.union([VISITOR_STATUS, z.enum(['all', 'today', 'overdue'])]).optional(),
  siteId: z.string().optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
})

visitorsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    const { companyId, ...filters } = parsed.data
    res.json(await svc.list(callerOf(req), companyId, filters as never))
  } catch (e) {
    next(e)
  }
})

const createBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  name: z.string().min(1).max(200),
  idNumber: z.string().min(1).max(120),
  nationality: z.string().max(120).optional(),
  visitorCompany: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  vehicleNumber: z.string().max(60).optional(),
  hostEmployeeId: z.string().optional(),
  departmentId: z.string().optional(),
  purpose: z.string().max(1000).optional(),
  expectedArrival: z.string().min(1).max(40),
  expectedDeparture: z.string().min(1).max(40),
  notes: z.string().max(4000).optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(60).optional(),
})

visitorsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'Name, IC or passport, site and both visit times are required.',
      })
    }
    res.status(201).json(await svc.create(callerOf(req), parsed.data, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

// ── Parameterised paths ──────────────────────────────────────────────────────

visitorsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await svc.get(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.get('/:id/timeline', async (req, res, next) => {
  try {
    res.json(await svc.timeline(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

/** What still stands between this visit and the gate. */
visitorsRouter.get('/:id/gate', async (req, res, next) => {
  try {
    res.json(await svc.gateStatus(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const decisionBody = z.object({
  approve: z.boolean(),
  note: z.string().max(2000).optional(),
})

visitorsRouter.post('/:id/decision', async (req, res, next) => {
  try {
    const parsed = decisionBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Say whether the visit is approved.' })
    }
    res.json(await svc.decide(
      callerOf(req), req.params.id, parsed.data.approve, parsed.data.note, ctxOf(req),
    ))
  } catch (e) {
    next(e)
  }
})

const ackBody = z.object({
  key: z.enum(['inductionAt', 'ndaAt', 'safetyBriefingAt', 'emergencyProcedureAt', 'siteRulesAt']),
})

visitorsRouter.post('/:id/acknowledge', async (req, res, next) => {
  try {
    const parsed = ackBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Unknown acknowledgement.' })
    }
    res.json(await svc.acknowledge(callerOf(req), req.params.id, parsed.data.key, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

const checkInBody = z.object({
  badgeNumber: z.string().max(60).optional(),
  vehicleNumber: z.string().max(60).optional(),
})

visitorsRouter.post('/:id/check-in', async (req, res, next) => {
  try {
    const parsed = checkInBody.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'That check-in is not valid.' })
    }
    res.json(await svc.checkIn(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.post('/:id/check-out', async (req, res, next) => {
  try {
    const badgeReturned = z.boolean().optional().safeParse(req.body?.badgeReturned)
    res.json(await svc.checkOut(
      callerOf(req), req.params.id,
      { badgeReturned: badgeReturned.success ? badgeReturned.data : undefined },
      ctxOf(req),
    ))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.post('/:id/badge', async (req, res, next) => {
  try {
    const parsed = z.object({ badgeNumber: z.string().max(60).nullable() }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'That badge number is not valid.' })
    }
    res.json(await svc.setBadge(callerOf(req), req.params.id, parsed.data.badgeNumber, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.post('/:id/vehicle', async (req, res, next) => {
  try {
    const parsed = z.object({ vehicleNumber: z.string().max(60).nullable() }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'That vehicle number is not valid.' })
    }
    res.json(await svc.setVehicle(callerOf(req), req.params.id, parsed.data.vehicleNumber, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.post('/:id/notes', async (req, res, next) => {
  try {
    const parsed = z.object({ note: z.string().min(1).max(2000) }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Write something first.' })
    }
    res.json(await svc.addNote(callerOf(req), req.params.id, parsed.data.note, ctxOf(req)))
  } catch (e) {
    next(e)
  }
})

visitorsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const reason = z.string().max(2000).optional().safeParse(req.body?.reason)
    res.json(await svc.cancel(
      callerOf(req), req.params.id, reason.success ? (reason.data ?? '') : '', ctxOf(req),
    ))
  } catch (e) {
    next(e)
  }
})

export { VisitorError }
