import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { InspectionError, InspectionService } from '../lib/inspectionService.js'
import type { Caller } from '../lib/incidentService.js'
import { ASSET_CATEGORIES, CHECKLISTS } from '../lib/inspectionCatalog.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new InspectionService(prisma)
export const inspectionsRouter = Router()

// Identity always comes from the verified token, never from the request body.
inspectionsRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const MAX_PAGE_SIZE = 200
const ASSET_CATEGORY = z.enum(ASSET_CATEGORIES)

// ── Literal paths first ──────────────────────────────────────────────────────
// Express matches in declaration order. /stats, /checklists and /inspections have to be
// registered before /:idOrQr or that route swallows them and looks up an asset named
// "stats" — the same bug the incident module hit with /actions/list.

inspectionsRouter.get('/stats', async (req, res, next) => {
  try {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    const siteId = req.query.siteId ? String(req.query.siteId) : undefined
    res.json(await svc.assetStats(callerOf(req), companyId, siteId))
  } catch (e) {
    next(e)
  }
})

/** The checklist templates. Served so the runner renders what the server will validate. */
inspectionsRouter.get('/checklists', (_req, res) => {
  res.json(CHECKLISTS)
})

const inspectionQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(100),
  q: z.string().max(200).optional(),
  siteId: z.string().max(120).optional(),
  status: z.enum(['all', 'scheduled', 'overdue', 'completed', 'failed']).optional(),
})

inspectionsRouter.get('/inspections', async (req, res, next) => {
  try {
    const parsed = inspectionQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    res.json(await svc.listInspections(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

const answerSchema = z.object({
  itemId: z.string().min(1).max(80),
  label: z.string().max(300).default(''),
  result: z.enum(['pass', 'fail', 'na']),
  comment: z.string().max(2000).optional(),
  measurement: z.string().max(200).optional(),
})

const completeBody = z.object({
  answers: z.array(answerSchema).min(1).max(60),
  comments: z.string().max(5000).optional(),
  photoCount: z.coerce.number().int().min(0).max(100).default(0),
  gps: z.string().max(120).optional(),
  signature: z.string().min(1).max(200),
})

inspectionsRouter.post('/inspections/:inspectionId/complete', async (req, res, next) => {
  try {
    const parsed = completeBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid inspection result.',
      })
    }
    res.json(await svc.completeInspection(callerOf(req), req.params.inspectionId, parsed.data))
  } catch (e) {
    next(e)
  }
})

const assetQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(100),
  q: z.string().max(200).optional(),
  siteId: z.string().max(120).optional(),
  category: ASSET_CATEGORY.optional(),
  status: z.enum(['in_service', 'under_maintenance', 'out_of_service', 'retired']).optional(),
  bucket: z.enum(['all', 'overdue', 'due_week', 'high_risk', 'defects']).optional(),
})

inspectionsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = assetQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Invalid query parameters.' })
    }
    res.json(await svc.listAssets(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

const createBody = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  name: z.string().min(1).max(200),
  category: ASSET_CATEGORY,
  customCategory: z.string().max(120).optional(),
  serialNumber: z.string().min(1).max(120),
  manufacturer: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  owner: z.string().min(1).max(200),
  location: z.string().max(300).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
  commissionDate: z.string().max(40).optional(),
  warrantyUntil: z.string().max(40).optional(),
  purchaseDate: z.string().max(40).optional(),
  critical: z.boolean().optional(),
  requiresCalibration: z.boolean().optional(),
  notes: z.string().max(4000).optional(),
  assignedEmployeeId: z.string().optional(),
  assignedContractorWorkerId: z.string().optional(),
})

inspectionsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid asset payload.',
      })
    }
    res.status(201).json(await svc.createAsset(callerOf(req), parsed.data))
  } catch (e) {
    next(e)
  }
})

// ── Parameterised paths ──────────────────────────────────────────────────────

/** Resolves by id, QR payload or printed code — the field scan lands here. */
inspectionsRouter.get('/:idOrQr', async (req, res, next) => {
  try {
    res.json(await svc.getAssetProfile(callerOf(req), req.params.idOrQr))
  } catch (e) {
    next(e)
  }
})

const scheduleBody = z.object({
  date: z.string().min(1).max(40),
  inspector: z.string().min(1).max(200),
})

inspectionsRouter.post('/:assetId/inspections', async (req, res, next) => {
  try {
    const parsed = scheduleBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Date and inspector are required.' })
    }
    res.status(201).json(await svc.scheduleInspection(
      callerOf(req), req.params.assetId, parsed.data.date, parsed.data.inspector,
    ))
  } catch (e) {
    next(e)
  }
})

export { InspectionError }
