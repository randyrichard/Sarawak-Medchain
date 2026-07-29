import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { OrgError, OrgService } from '../lib/orgService.js'
import type { Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new OrgService(prisma)
export const orgRouter = Router()

orgRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

/** Comma-separated id list, bounded so one request cannot ask for the whole table. */
const idList = (raw: unknown, max = 200) =>
  String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)

// ── Literal paths first ──────────────────────────────────────────────────────

/**
 * The caller's own workspaces. Takes no parameter on purpose: the switcher must offer
 * exactly what the verified session can open, not what the client asks for.
 */
orgRouter.get('/companies', async (req, res, next) => {
  try {
    res.json(await svc.listCompanies(callerOf(req)))
  } catch (e) {
    next(e)
  }
})

const companyQuery = z.object({ companyId: z.string().min(1) })

orgRouter.get('/sites', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.listSites(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

orgRouter.get('/departments', async (req, res, next) => {
  try {
    res.json(await svc.listDepartments(callerOf(req), idList(req.query.siteIds)))
  } catch (e) {
    next(e)
  }
})

orgRouter.get('/teams', async (req, res, next) => {
  try {
    res.json(await svc.listTeams(callerOf(req), idList(req.query.departmentIds)))
  } catch (e) {
    next(e)
  }
})

orgRouter.get('/tree', async (req, res, next) => {
  try {
    const parsed = companyQuery.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
    }
    res.json(await svc.tree(callerOf(req), parsed.data.companyId))
  } catch (e) {
    next(e)
  }
})

export { OrgError }
