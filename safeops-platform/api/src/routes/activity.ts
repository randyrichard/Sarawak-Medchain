import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { ActivityError, ActivityService } from '../lib/activityService.js'
import type { Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new ActivityService(prisma)
export const activityRouter = Router()

activityRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const query = z.object({
  companyId: z.string().min(1),
  siteId: z.string().max(120).optional(),
})

activityRouter.get('/', async (req, res, next) => {
  try {
    const parsed = query.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.list(callerOf(req), parsed.data.companyId, parsed.data.siteId))
  } catch (e) {
    next(e)
  }
})

export { ActivityError }
