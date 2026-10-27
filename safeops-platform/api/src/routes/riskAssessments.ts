import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { RiskAssessmentService } from '../lib/riskAssessmentService.js'
import { LIMITS } from '../domain/hirarc.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * The HIRARC register (lib/riskAssessmentService.ts, rules in domain/hirarc.ts).
 *
 * The schema checks shapes only - a rating is a whole number, a date is a date - and the
 * service says what is wrong with the content, in words a person can act on.
 */
const svc = new RiskAssessmentService(prisma)
export const riskAssessmentsRouter = Router()

riskAssessmentsRouter.use(requireAuth)

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

const rating = z.number().int()
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** A date field a person may clear: empty means the default (today, a year on, none). */
const ymdOrEmpty = z.union([ymd, z.literal('')])
const text = (max: number) => z.string().max(max)

const riskBody = z.object({
  siteId: z.string().min(1),
  activity: text(LIMITS.activity),
  hazard: text(LIMITS.hazard),
  effect: text(LIMITS.effect),
  existingControls: text(LIMITS.controls).optional(),
  likelihood: rating,
  severity: rating,
  additionalControls: text(LIMITS.controls).optional(),
  owner: text(LIMITS.person).optional(),
  controlsDue: ymdOrEmpty.nullish(),
  residualLikelihood: rating.nullish(),
  residualSeverity: rating.nullish(),
  assessedBy: text(LIMITS.person).optional(),
  assessedOn: ymdOrEmpty.optional(),
  reviewDue: ymdOrEmpty.optional(),
})
const SHAPE = 'Check the ratings, the dates and the length of each field.'

const listQuery = z.object({
  companyId: z.string().min(1),
  siteId: z.string().optional(),
  level: z.enum(['low', 'medium', 'high']).optional(),
  q: z.string().max(100).optional(),
  archived: z.enum(['true', 'false']).optional(),
  attention: z.enum(['review_overdue', 'needs_controls', 'controls_overdue']).optional(),
  likelihood: z.coerce.number().int().min(1).max(5).optional(),
  severity: z.coerce.number().int().min(1).max(5).optional(),
  residual: z.enum(['true', 'false']).optional(),
})

riskAssessmentsRouter.get('/', asyncRoute(async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required, and the filters must be ones the register has.' })
  const { companyId, archived, residual, ...f } = parsed.data
  res.json(await svc.list(callerOf(req), companyId, { ...f, archived: archived === 'true', residual: residual === 'true' }))
}))

/** The register as the DOSH form lays it out, for Excel. Before /:id, which would take "export.csv" for an id. */
riskAssessmentsRouter.get('/export.csv', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  const siteId = typeof req.query.siteId === 'string' && req.query.siteId ? req.query.siteId : undefined
  const csv = await svc.exportCsv(callerOf(req), companyId, siteId)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="hirarc-register.csv"')
  res.send(csv)
}))

riskAssessmentsRouter.get('/:id', asyncRoute(async (req, res) => {
  res.json(await svc.get(callerOf(req), req.params.id))
}))

riskAssessmentsRouter.post('/', asyncRoute(async (req, res) => {
  const companyId = typeof req.body?.companyId === 'string' ? req.body.companyId : ''
  const parsed = riskBody.safeParse(req.body)
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: SHAPE })
  res.status(201).json(await svc.create(callerOf(req), companyId, parsed.data, ctxOf(req)))
}))

riskAssessmentsRouter.put('/:id', asyncRoute(async (req, res) => {
  const parsed = riskBody.extend({ version: z.number().int() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: SHAPE })
  res.json(await svc.update(callerOf(req), req.params.id, parsed.data, ctxOf(req)))
}))

riskAssessmentsRouter.post('/:id/archive', asyncRoute(async (req, res) => {
  const parsed = z.object({ reason: z.string().max(LIMITS.reason) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'Say why this assessment no longer applies.' })
  res.json(await svc.archive(callerOf(req), req.params.id, parsed.data.reason, ctxOf(req)))
}))

riskAssessmentsRouter.post('/:id/restore', asyncRoute(async (req, res) => {
  res.json(await svc.restore(callerOf(req), req.params.id, ctxOf(req)))
}))

/** A corrective action to put the row's recommended controls in place. */
riskAssessmentsRouter.post('/:id/actions', asyncRoute(async (req, res) => {
  const parsed = z.object({
    title: z.string().max(200).optional(),
    owner: z.string().max(LIMITS.person).optional(),
    dueDate: ymd.optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  }).safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'Check the title, owner, due date and priority.' })
  res.status(201).json(await svc.raiseAction(callerOf(req), req.params.id, parsed.data))
}))
