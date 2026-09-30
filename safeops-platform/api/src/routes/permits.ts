import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { PermitError, PermitService } from '../lib/permitService.js'
import { PermitPeopleService } from '../lib/permitPeople.js'
import { PermitReviewService } from '../lib/permitReview.js'
import { PERMIT_TYPES } from '../lib/permitCatalog.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new PermitService(prisma)
const people = new PermitPeopleService(prisma)
const review = new PermitReviewService(prisma)
export const permitsRouter = Router()

// Identity always comes from the verified token, never from the request body.
permitsRouter.use(requireAuth)

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

permitsRouter.get('/stats', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  const siteId = req.query.siteId ? String(req.query.siteId) : undefined
  res.json(await svc.stats(callerOf(req), companyId, siteId))
}))

/** Feeds the expiry warning. A pure read — safe to poll from every open board. */
permitsRouter.get('/expiring', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.expiring(callerOf(req), companyId))
}))

permitsRouter.get('/', asyncRoute(async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
  }
  res.json(await svc.list(callerOf(req), parsed.data))
}))

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

permitsRouter.post('/', asyncRoute(async (req, res) => {
  const parsed = createBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'Invalid permit payload.',
    })
  }
  res.status(201).json(await svc.create(callerOf(req), parsed.data))
}))

// ── Parameterised paths ──────────────────────────────────────────────────────

permitsRouter.get('/:id', asyncRoute(async (req, res) => {
  res.json(await svc.get(callerOf(req), req.params.id))
}))

permitsRouter.post('/:id/submit', asyncRoute(async (req, res) => {
  res.json(await svc.submit(callerOf(req), req.params.id))
}))

const statementBody = z.object({ statement: z.string().max(2000).optional() })

permitsRouter.post('/:id/approve', asyncRoute(async (req, res) => {
  const parsed = statementBody.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid issue statement.' })
  }
  res.json(await svc.approve(callerOf(req), req.params.id, parsed.data.statement ?? ''))
}))

const reasonBody = z.object({ reason: z.string().max(2000).optional() })

permitsRouter.post('/:id/reject', asyncRoute(async (req, res) => {
  const parsed = reasonBody.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid rejection payload.' })
  }
  res.json(await svc.reject(callerOf(req), req.params.id, parsed.data.reason ?? ''))
}))

permitsRouter.post('/:id/activate', asyncRoute(async (req, res) => {
  res.json(await svc.activate(callerOf(req), req.params.id))
}))

permitsRouter.post('/:id/suspend', asyncRoute(async (req, res) => {
  const parsed = reasonBody.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid suspension payload.' })
  }
  res.json(await svc.suspend(callerOf(req), req.params.id, parsed.data.reason ?? ''))
}))

permitsRouter.post('/:id/resume', asyncRoute(async (req, res) => {
  res.json(await svc.resume(callerOf(req), req.params.id))
}))

const closeBody = z.object({
  handbackConfirmed: z.boolean(),
  statement: z.string().max(2000).optional(),
})

permitsRouter.post('/:id/close', asyncRoute(async (req, res) => {
  const parsed = closeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: 'Confirm the site has been handed back before closing.',
    })
  }
  res.json(await svc.close(callerOf(req), req.params.id, parsed.data))
}))

const controlBody = z.object({ confirmed: z.boolean() })

permitsRouter.patch('/:id/controls/:controlId', asyncRoute(async (req, res) => {
  const parsed = controlBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid control update.' })
  }
  res.json(await svc.confirmControl(
    callerOf(req), req.params.id, req.params.controlId, parsed.data.confirmed,
  ))
}))

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

permitsRouter.post('/:id/gas-tests', asyncRoute(async (req, res) => {
  const parsed = gasBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: 'Enter O₂, LEL, H₂S and CO readings as numbers.',
    })
  }
  res.status(201).json(await svc.addGasTest(callerOf(req), req.params.id, parsed.data))
}))

const isolationBody = z.object({
  description: z.string().min(1).max(500),
  tagId: z.string().min(1).max(80),
})

permitsRouter.post('/:id/isolations', asyncRoute(async (req, res) => {
  const parsed = isolationBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: 'An isolation needs a description and a lock/tag identifier.',
    })
  }
  res.status(201).json(await svc.addIsolation(callerOf(req), req.params.id, parsed.data))
}))

permitsRouter.post('/:id/isolations/:isolationId/release', asyncRoute(async (req, res) => {
  res.json(await svc.releaseIsolation(callerOf(req), req.params.id, req.params.isolationId))
}))

export { PermitError }

// ── People on the permit ─────────────────────────────────────────────────────

const attendeeBody = z.object({
  employeeId: z.string().min(1).optional(),
  contractorWorkerId: z.string().min(1).optional(),
  role: z.enum(['supervisor', 'receiver', 'worker', 'standby', 'gas_tester']).optional(),
})

permitsRouter.get('/:id/people', asyncRoute(async (req, res) => {
  res.json({ rows: await people.list(callerOf(req), req.params.id) })
}))

permitsRouter.post('/:id/people', asyncRoute(async (req, res) => {
  const parsed = attendeeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Name an employee or a contractor worker.' })
  }
  res.status(201).json(await people.add(callerOf(req), req.params.id, parsed.data))
}))

permitsRouter.delete('/people/:attendeeId', asyncRoute(async (req, res) => {
  await people.remove(callerOf(req), req.params.attendeeId)
  res.status(204).end()
}))

/** Sign in and out of the work area, so occupancy is a query rather than a headcount. */
permitsRouter.post('/people/:attendeeId/entry', asyncRoute(async (req, res) => {
  const parsed = z.object({ inside: z.boolean() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'inside must be true or false.' })
  }
  res.json(await people.setInside(callerOf(req), req.params.attendeeId, parsed.data.inside))
}))

/** Who may be named, and why anyone may not — drives the picker at the permit desk. */
permitsRouter.get('/:id/eligible', asyncRoute(async (req, res) => {
  res.json({ rows: await people.eligible(callerOf(req), req.params.id) })
}))

// ── Extensions ───────────────────────────────────────────────────────────────

permitsRouter.get('/:id/extensions', asyncRoute(async (req, res) => {
  res.json({ rows: await svc.listExtensions(callerOf(req), req.params.id) })
}))

permitsRouter.post('/:id/extensions', asyncRoute(async (req, res) => {
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
}))

permitsRouter.post('/extensions/:extensionId/approve', asyncRoute(async (req, res) => {
  res.json(await svc.approveExtension(callerOf(req), req.params.extensionId))
}))

// ── Review chain ─────────────────────────────────────────────────────────────

function ctxOf(req: { ip?: string; headers: Record<string, unknown> }) {
  return { ip: req.ip, device: String(req.headers['user-agent'] ?? '').slice(0, 300) }
}

permitsRouter.get('/:id/review', asyncRoute(async (req, res) => {
  res.json(await review.status(callerOf(req), req.params.id))
}))

/**
 * Advance one stage. Deliberately takes no target stage: the chain decides what comes
 * next, so a client cannot name `approved` from `submitted` and skip both reviews.
 */
permitsRouter.post('/:id/review/advance', asyncRoute(async (req, res) => {
  const parsed = z.object({ statement: z.string().min(1).max(2000) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Record what you checked before signing.' })
  }
  res.json(await review.advance(callerOf(req), req.params.id, parsed.data.statement, ctxOf(req)))
}))

permitsRouter.post('/:id/review/return', asyncRoute(async (req, res) => {
  const parsed = z.object({ reason: z.string().min(1).max(2000) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Say what has to change.' })
  }
  res.json(await review.returnToApplicant(callerOf(req), req.params.id, parsed.data.reason, ctxOf(req)))
}))

// ── Toolbox ──────────────────────────────────────────────────────────────────

permitsRouter.post('/:id/toolbox', asyncRoute(async (req, res) => {
  const parsed = z.object({
    heldAt: z.string().datetime().optional(),
    supervisor: z.string().max(160).optional(),
  }).safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid toolbox payload.' })
  }
  res.json(await review.recordToolbox(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

permitsRouter.post('/people/:attendeeId/toolbox-ack', asyncRoute(async (req, res) => {
  res.json(await review.acknowledgeToolbox(callerOf(req), req.params.attendeeId, ctxOf(req)))
}))

// ── PPE ──────────────────────────────────────────────────────────────────────

permitsRouter.put('/:id/ppe', asyncRoute(async (req, res) => {
  const parsed = z.object({ items: z.array(z.string().max(60)).max(30) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Send the PPE list as an array.' })
  }
  res.json(await review.setRequiredPpe(callerOf(req), req.params.id, parsed.data.items, ctxOf(req)))
}))

permitsRouter.post('/:id/ppe/acknowledge', asyncRoute(async (req, res) => {
  res.json(await review.acknowledgePpe(callerOf(req), req.params.id, ctxOf(req)))
}))

// ── JSA ──────────────────────────────────────────────────────────────────────

const jsaBody = z.object({
  step: z.string().max(300).optional(),
  hazard: z.string().min(1).max(500),
  risk: z.string().max(200).optional(),
  control: z.string().min(1).max(1000),
  responsible: z.string().max(160).optional(),
  residualRisk: z.string().max(200).optional(),
})

permitsRouter.get('/:id/jsa', asyncRoute(async (req, res) => {
  res.json({ rows: await review.listJsa(callerOf(req), req.params.id) })
}))

permitsRouter.post('/:id/jsa', asyncRoute(async (req, res) => {
  const parsed = jsaBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'validation',
      message: parsed.error.issues[0]?.message ?? 'A hazard and a control are required.',
    })
  }
  res.status(201).json(await review.addJsaStep(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

permitsRouter.patch('/jsa/:stepId', asyncRoute(async (req, res) => {
  const parsed = jsaBody.partial().safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Invalid JSA payload.' })
  }
  res.json(await review.updateJsaStep(callerOf(req), req.params.stepId, parsed.data, ctxOf(req)))
}))

permitsRouter.delete('/jsa/:stepId', asyncRoute(async (req, res) => {
  await review.removeJsaStep(callerOf(req), req.params.stepId, ctxOf(req))
  res.status(204).end()
}))
