import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ToolboxService } from '../lib/toolboxService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new ToolboxService(prisma)
export const toolboxRouter = Router()

// Identity always comes from the verified token, never from the request body.
toolboxRouter.use(requireAuth)

function ctxOf(req: { ip?: string; headers: Record<string, unknown> }) {
  return { ip: req.ip, device: String(req.headers['user-agent'] ?? '').slice(0, 300) }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
const companyOnly = z.object({ companyId: z.string().min(1) })

const listQuery = z.object({
  companyId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  siteId: z.string().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(200).optional(),
})

const body = z.object({
  companyId: z.string().min(1),
  siteId: z.string().min(1),
  // Offsets accepted: a Malaysian client naturally sends +08:00.
  heldAt: z.string().datetime({ offset: true }),
  ledBy: z.string().max(200),
  topic: z.string().max(300),
  hazards: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
  groups: z.array(z.object({
    organisation: z.string().max(200),
    count: z.coerce.number(),
  })).max(50),
})

toolboxRouter.get('/', asyncRoute(async (req, res) => {
  const parsed = listQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: parsed.error.issues[0]?.message ?? 'Invalid query parameters.' })
  }
  res.json(await svc.list(callerOf(req), parsed.data))
}))

// Literal paths before /:id, or "today" would be looked up as a meeting id.
toolboxRouter.get('/today', asyncRoute(async (req, res) => {
  const parsed = companyOnly.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.today(callerOf(req), parsed.data.companyId))
}))

toolboxRouter.get('/organisations', asyncRoute(async (req, res) => {
  const parsed = companyOnly.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json({ rows: await svc.organisations(callerOf(req), parsed.data.companyId) })
}))

toolboxRouter.get('/:id', asyncRoute(async (req, res) => {
  const parsed = companyOnly.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.get(callerOf(req), parsed.data.companyId, req.params.id))
}))

toolboxRouter.post('/', asyncRoute(async (req, res) => {
  const parsed = body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: parsed.error.issues[0]?.message ?? 'Invalid toolbox meeting.' })
  }
  const { companyId, ...input } = parsed.data
  res.status(201).json(await svc.create(callerOf(req), companyId, input, ctxOf(req)))
}))

toolboxRouter.put('/:id', asyncRoute(async (req, res) => {
  const parsed = body.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: parsed.error.issues[0]?.message ?? 'Invalid toolbox meeting.' })
  }
  const { companyId, ...input } = parsed.data
  res.json(await svc.update(callerOf(req), companyId, req.params.id, input, ctxOf(req)))
}))

toolboxRouter.delete('/:id', asyncRoute(async (req, res) => {
  const parsed = companyOnly.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  await svc.remove(callerOf(req), parsed.data.companyId, req.params.id, ctxOf(req))
  res.status(204).end()
}))
