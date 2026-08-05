import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { PermitError, PermitService } from '../lib/permitService.js'
import { PermitPeopleService } from '../lib/permitPeople.js'
import type { Caller } from '../lib/incidentService.js'
import { PERMIT_TYPES } from '../lib/permitCatalog.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new PermitService(prisma)
const people = new PermitPeopleService(prisma)
export const permitsRouter = Router()

// Identity always comes from the verified token, never from the request body.
permitsRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const MAX_PAGE_SIZE = 100

const PERMIT_TYPE = z.enum(PERMIT_TYPES)
const STATUS_FILTER = z.enum([
  'draft', 'submitted', 'approved', 'active', 'suspended', 'closed', 'rejected',
  'expired', 'live', 'all',
  'supervisor_review', 'hse_review', 'area_authority', 'archived',
])

const listQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  // Bounded: an unbounded page size lets one request pull the whole table.
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(25),
  q: z.string().max(200).optional(),
  siteId: z.string().max(120).optional(),
  type: PERMIT_TYPE.optional(),
  status: STATUS_FILTER.optional(),
})

// ── Literal paths first ──────────────────────────────────────────────────────
// Express matches in declaration order, so /stats and /expiring have to be registered
// before /:id or that route captures them and looks up a permit called "stats".

permitsRouter.get('/stats', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined
    res.json(await svc.stats(callerOf(req), companyId, siteId))
  } catch (e) {
    next(e)
  }
})

/** Feeds the expiry warning. A pure read — safe to poll from every open board. */
permitsRouter.get('/expiring', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    res.json(await svc.expiring(callerOf(req), companyId))
  } catch (e) {
    next(e)
  }
})

permitsRouter.get('/', async (req, res, next) => {
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

const createBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  type: PERMIT_TYPE,
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  department: z.string().max(120).optional(),
  location: z.string().min(1).max(300),
  applicant: z.string().min(1).max(200),
  contractor: z.string().max(200).optional(),
  workerCount: z.coerce.number().int().positive().max(999).default(1),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
})

permitsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid permit payload.',
      })
    }
    res.status(201).json(await svc.create(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

// ── Parameterised paths ──────────────────────────────────────────────────────

permitsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await svc.get(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/submit', async (req, res, next) => {
  try {
    res.json(await svc.submit(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const statementBody = z.object({ statement: z.string().max(2000).optional() })

permitsRouter.post('/:id/approve', async (req, res, next) => {
  try {
    const parsed = statementBody.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid issue statement.' })
    }
    res.json(await svc.approve(callerOf(req), req.params.id, parsed.data.statement ?? ''))
  } catch (e) {
    next(e)
  }
})

const reasonBody = z.object({ reason: z.string().max(2000).optional() })

permitsRouter.post('/:id/reject', async (req, res, next) => {
  try {
    const parsed = reasonBody.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid rejection payload.' })
    }
    res.json(await svc.reject(callerOf(req), req.params.id, parsed.data.reason ?? ''))
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/activate', async (req, res, next) => {
  try {
    res.json(await svc.activate(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/suspend', async (req, res, next) => {
  try {
    const parsed = reasonBody.safeParse(req.body ?? {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid suspension payload.' })
    }
    res.json(await svc.suspend(callerOf(req), req.params.id, parsed.data.reason ?? ''))
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/resume', async (req, res, next) => {
  try {
    res.json(await svc.resume(callerOf(req), req.params.id))
  } catch (e) {
    next(e)
  }
})

const closeBody = z.object({
  handbackConfirmed: z.boolean(),
  statement: z.string().max(2000).optional(),
})

permitsRouter.post('/:id/close', async (req, res, next) => {
  try {
    const parsed = closeBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'Confirm the site has been handed back before closing.',
      })
    }
    res.json(await svc.close(callerOf(req), req.params.id, parsed.data))
  } catch (e) {
    next(e)
  }
})

const controlBody = z.object({ confirmed: z.boolean() })

permitsRouter.patch('/:id/controls/:controlId', async (req, res, next) => {
  try {
    const parsed = controlBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid control update.' })
    }
    res.json(await svc.confirmControl(
      callerOf(req), req.params.id, req.params.controlId, parsed.data.confirmed,
    ))
  } catch (e) {
    next(e)
  }
})

/**
 * Readings are bounded to physically meaningful ranges. An out-of-range figure is a
 * mistyped entry, and silently storing it would put a nonsense value on a permit that
 * someone later reads as the reason work was allowed to start.
 */
const gasBody = z.object({
  oxygenPct: z.number().min(0).max(100),
  lelPct: z.number().min(0).max(100),
  h2sPpm: z.number().min(0).max(10000),
  coPpm: z.number().min(0).max(10000),
  note: z.string().max(2000).optional(),
})

permitsRouter.post('/:id/gas-tests', async (req, res, next) => {
  try {
    const parsed = gasBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'Enter O₂, LEL, H₂S and CO readings as numbers.',
      })
    }
    res.status(201).json(await svc.addGasTest(callerOf(req), req.params.id, parsed.data))
  } catch (e) {
    next(e)
  }
})

const isolationBody = z.object({
  description: z.string().min(1).max(500),
  tagId: z.string().min(1).max(80),
})

permitsRouter.post('/:id/isolations', async (req, res, next) => {
  try {
    const parsed = isolationBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'An isolation needs a description and a lock/tag identifier.',
      })
    }
    res.status(201).json(await svc.addIsolation(callerOf(req), req.params.id, parsed.data))
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/isolations/:isolationId/release', async (req, res, next) => {
  try {
    res.json(await svc.releaseIsolation(callerOf(req), req.params.id, req.params.isolationId))
  } catch (e) {
    next(e)
  }
})

export { PermitError }

// ── People on the permit ─────────────────────────────────────────────────────

const attendeeBody = z.object({
  employeeId: z.string().min(1).optional(),
  contractorWorkerId: z.string().min(1).optional(),
  role: z.enum(['supervisor', 'receiver', 'worker', 'standby', 'gas_tester']).optional(),
})

permitsRouter.get('/:id/people', async (req, res, next) => {
  try {
    res.json({ rows: await people.list(callerOf(req), req.params.id) })
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/people', async (req, res, next) => {
  try {
    const parsed = attendeeBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Name an employee or a contractor worker.' })
    }
    res.status(201).json(await people.add(callerOf(req), req.params.id, parsed.data))
  } catch (e) {
    next(e)
  }
})

permitsRouter.delete('/people/:attendeeId', async (req, res, next) => {
  try {
    await people.remove(callerOf(req), req.params.attendeeId)
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

/** Sign in and out of the work area, so occupancy is a query rather than a headcount. */
permitsRouter.post('/people/:attendeeId/entry', async (req, res, next) => {
  try {
    const parsed = z.object({ inside: z.boolean() }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'inside must be true or false.' })
    }
    res.json(await people.setInside(callerOf(req), req.params.attendeeId, parsed.data.inside))
  } catch (e) {
    next(e)
  }
})

/** Who may be named, and why anyone may not — drives the picker at the permit desk. */
permitsRouter.get('/:id/eligible', async (req, res, next) => {
  try {
    res.json({ rows: await people.eligible(callerOf(req), req.params.id) })
  } catch (e) {
    next(e)
  }
})

// ── Extensions ───────────────────────────────────────────────────────────────

permitsRouter.get('/:id/extensions', async (req, res, next) => {
  try {
    res.json({ rows: await svc.listExtensions(callerOf(req), req.params.id) })
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/:id/extensions', async (req, res, next) => {
  try {
    const parsed = z.object({
      newValidTo: z.string().datetime(),
      reason: z.string().min(3).max(1000),
    }).safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'A new end time and a reason are required.',
      })
    }
    res.status(201).json(await svc.requestExtension(
      callerOf(req), req.params.id, parsed.data.newValidTo, parsed.data.reason,
    ))
  } catch (e) {
    next(e)
  }
})

permitsRouter.post('/extensions/:extensionId/approve', async (req, res, next) => {
  try {
    res.json(await svc.approveExtension(callerOf(req), req.params.extensionId))
  } catch (e) {
    next(e)
  }
})
