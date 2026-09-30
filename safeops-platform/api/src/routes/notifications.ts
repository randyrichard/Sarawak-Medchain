import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { NotificationError, NotificationService } from '../lib/notificationService.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { callerOf } from '../middleware/caller.js'

const svc = new NotificationService(prisma)
export const notificationsRouter = Router()

notificationsRouter.use(requireAuth)

const companyQuery = z.object({ companyId: z.string().min(1) })

notificationsRouter.get('/', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.list(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

const createBody = z.object({
  companyId: z.string().min(1),
  kind: z.enum(['incident', 'action', 'audit', 'system']),
  title: z.string().min(1).max(300),
  detail: z.string().max(1000).optional(),
  href: z.string().max(500).optional(),
})

notificationsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: parsed.error.issues[0]?.message ?? 'Invalid notification payload.',
      })
    }
    const { companyId, ...input } = parsed.data
    res.status(201).json(await svc.create(callerOf(req), companyId, input))
  } catch (e) {
    next(e)
  }
})

// Literal before parameterised: /read-all must not be taken for a notification id.
notificationsRouter.post('/read-all', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.markAllRead(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

notificationsRouter.post('/:id/read', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    await svc.markRead(callerOf(req), parsed.data.companyId, req.params.id)
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

export { NotificationError }
