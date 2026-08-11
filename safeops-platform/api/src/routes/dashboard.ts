import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { DashboardService } from '../lib/dashboardService.js'
import type { Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

/**
 * The operational dashboard.
 *
 * One endpoint for the whole page. The alternative - the browser calling eight module
 * endpoints and adding up the answers - means eight round trips on the app's landing page
 * and, worse, a total the client computed and the server cannot vouch for.
 */
const svc = new DashboardService(prisma)
export const dashboardRouter = Router()

dashboardRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const QUERY = z.object({
  companyId: z.string().min(1),
  siteId: z.string().optional(),
  department: z.string().optional(),
  /** Plain YYYY-MM-DD; the service resolves them into an inclusive window. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

dashboardRouter.get('/overview', async (req, res, next) => {
  try {
    const q = QUERY.parse(req.query)
    /*
     * companyId is checked against the session's memberships inside the service, not
     * trusted from the query string. Passing another tenant's id is a 403, not a wider
     * view - which is the whole point of doing the aggregation here rather than in the
     * browser.
     */
    res.json(await svc.overview(callerOf(req), q))
  } catch (e) {
    next(e)
  }
})
