/**
 * Calibration and the permit-equipment link.
 *
 * Mounted alongside the existing asset routes rather than inside them: the asset router is
 * keyed on /:idOrQr, and adding /calibrations under it would make Express match an asset
 * whose QR code happens to read "calibrations". Same reasoning as /stats and /checklists
 * being declared first over there.
 */
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { EquipmentError, EquipmentService } from '../lib/equipmentService.js'
import type { Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new EquipmentService(prisma)
export const equipmentRouter = Router()

/*
 * Identity always comes from the verified token, never from the request body.
 *
 * Attached per route rather than with router.use(). This router is mounted at '/' so its
 * paths can outrank /assets/:id, /permits/:id and /incidents/:id - and a blanket use() on
 * a root-mounted router runs against every request in the application, which put a login
 * wall in front of /auth/login itself.
 */
const auth = requireAuth

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

// ── Calibration ──────────────────────────────────────────────────────────────

equipmentRouter.get('/assets/:assetId/calibrations', auth, async (req, res, next) => {
  try {
    res.json(await svc.listCalibrations(callerOf(req), req.params.assetId))
  } catch (e) {
    next(e)
  }
})

equipmentRouter.get('/assets/:assetId/fitness', auth, async (req, res, next) => {
  try {
    res.json(await svc.fitness(callerOf(req), req.params.assetId))
  } catch (e) {
    next(e)
  }
})

const calibrationBody = z.object({
  calibratedAt: z.string().min(1).max(40),
  expiresAt: z.string().min(1).max(40),
  certificateNumber: z.string().min(1).max(120),
  vendor: z.string().max(200).optional(),
  result: z.enum(['pass', 'pass_with_adjustment', 'fail']).optional(),
  remarks: z.string().max(2000).optional(),
})

equipmentRouter.post('/assets/:assetId/calibrations', auth, async (req, res, next) => {
  try {
    const parsed = calibrationBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'A certificate number and both dates are required.',
      })
    }
    res.status(201).json(await svc.recordCalibration(
      callerOf(req), req.params.assetId, parsed.data,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    ))
  } catch (e) {
    next(e)
  }
})

// ── Permit link ──────────────────────────────────────────────────────────────

/** What could be booked onto this permit, fit and unfit alike, each with its verdict. */
equipmentRouter.get('/permits/:permitId/equipment/selectable', auth, async (req, res, next) => {
  try {
    res.json(await svc.selectableFor(callerOf(req), req.params.permitId))
  } catch (e) {
    next(e)
  }
})

equipmentRouter.get('/permits/:permitId/equipment', auth, async (req, res, next) => {
  try {
    res.json(await svc.listForPermit(callerOf(req), req.params.permitId))
  } catch (e) {
    next(e)
  }
})

const bookBody = z.object({
  assetId: z.string().min(1),
  purpose: z.string().max(300).optional(),
})

equipmentRouter.post('/permits/:permitId/equipment', auth, async (req, res, next) => {
  try {
    const parsed = bookBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Choose a piece of equipment.' })
    }
    res.status(201).json(await svc.addToPermit(
      callerOf(req), req.params.permitId, parsed.data.assetId, parsed.data.purpose,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    ))
  } catch (e) {
    next(e)
  }
})

// -- Dashboard ---------------------------------------------------------------

equipmentRouter.get('/equipment/dashboard', auth, async (req, res, next) => {
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

// -- Timeline ----------------------------------------------------------------

equipmentRouter.get('/assets/:assetId/timeline', auth, async (req, res, next) => {
  try {
    res.json(await svc.timeline(callerOf(req), req.params.assetId))
  } catch (e) {
    next(e)
  }
})

equipmentRouter.get('/assets/:assetId/incidents', auth, async (req, res, next) => {
  try {
    res.json(await svc.incidentsFor(callerOf(req), req.params.assetId))
  } catch (e) {
    next(e)
  }
})

// -- Maintenance -------------------------------------------------------------

equipmentRouter.get('/assets/:assetId/work-orders', auth, async (req, res, next) => {
  try {
    res.json(await svc.listWorkOrders(callerOf(req), req.params.assetId))
  } catch (e) {
    next(e)
  }
})

const workOrderBody = z.object({
  kind: z.enum(['preventive', 'corrective', 'emergency']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  description: z.string().min(1).max(2000),
  assignedTo: z.string().max(200).optional(),
  dueAt: z.string().max(40).optional(),
  takeOutOfService: z.boolean().optional(),
})

equipmentRouter.post('/assets/:assetId/work-orders', auth, async (req, res, next) => {
  try {
    const parsed = workOrderBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'Choose the kind of work and describe what needs doing.',
      })
    }
    res.status(201).json(await svc.raiseWorkOrder(
      callerOf(req), req.params.assetId, parsed.data,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    ))
  } catch (e) {
    next(e)
  }
})

const workOrderPatch = z.object({
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
  assignedTo: z.string().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  downtimeMinutes: z.number().int().min(0).max(1_000_000).optional(),
  cost: z.number().min(0).max(100_000_000).optional(),
  partsUsed: z.string().max(2000).optional(),
  closingNote: z.string().max(2000).optional(),
  returnToService: z.boolean().optional(),
})

equipmentRouter.patch('/work-orders/:workOrderId', auth, async (req, res, next) => {
  try {
    const parsed = workOrderPatch.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'That work order update is not valid.' })
    }
    res.json(await svc.updateWorkOrder(
      callerOf(req), req.params.workOrderId, parsed.data,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    ))
  } catch (e) {
    next(e)
  }
})

// -- Incident link -----------------------------------------------------------

equipmentRouter.get('/incidents/:incidentId/equipment', auth, async (req, res, next) => {
  try {
    res.json(await svc.listForIncident(callerOf(req), req.params.incidentId))
  } catch (e) {
    next(e)
  }
})

const linkBody = z.object({
  assetId: z.string().min(1),
  involvement: z.string().max(2000).optional(),
})

equipmentRouter.post('/incidents/:incidentId/equipment', auth, async (req, res, next) => {
  try {
    const parsed = linkBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Choose a piece of equipment.' })
    }
    res.status(201).json(await svc.linkToIncident(
      callerOf(req), req.params.incidentId, parsed.data.assetId, parsed.data.involvement,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    ))
  } catch (e) {
    next(e)
  }
})

equipmentRouter.delete('/incidents/equipment/:linkId', auth, async (req, res, next) => {
  try {
    await svc.unlinkFromIncident(
      callerOf(req), req.params.linkId,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    )
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

equipmentRouter.delete('/permits/equipment/:linkId', auth, async (req, res, next) => {
  try {
    await svc.removeFromPermit(
      callerOf(req), req.params.linkId,
      { ip: req.ip, device: req.get('user-agent') ?? '' },
    )
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

export { EquipmentError }
