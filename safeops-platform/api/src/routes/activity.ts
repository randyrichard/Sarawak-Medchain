import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ActivityError, ActivityService } from '../lib/activityService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new ActivityService(prisma)
export const activityRouter = Router()

activityRouter.use(requireAuth)

const query = z.object({
  companyId: z.string().min(1),
  siteId: z.string().max(120).optional(),
})

activityRouter.get('/', asyncRoute(async (req, res) => {
  const parsed = query.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.list(callerOf(req), parsed.data.companyId, parsed.data.siteId))
}))

export { ActivityError }
