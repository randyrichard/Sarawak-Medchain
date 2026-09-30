import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { OrgError, OrgService } from '../lib/orgService.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new OrgService(prisma)
export const orgRouter = Router()

orgRouter.use(requireAuth)

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
orgRouter.get('/companies', asyncRoute(async (req, res) => {
  res.json(await svc.listCompanies(callerOf(req)))
}))

const companyQuery = z.object({ companyId: z.string().min(1) })

orgRouter.get('/sites', asyncRoute(async (req, res) => {
  const parsed = companyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.listSites(callerOf(req), parsed.data.companyId))
}))

orgRouter.get('/departments', asyncRoute(async (req, res) => {
  res.json(await svc.listDepartments(callerOf(req), idList(req.query.siteIds)))
}))

orgRouter.get('/teams', asyncRoute(async (req, res) => {
  res.json(await svc.listTeams(callerOf(req), idList(req.query.departmentIds)))
}))

orgRouter.get('/tree', asyncRoute(async (req, res) => {
  const parsed = companyQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  }
  res.json(await svc.tree(callerOf(req), parsed.data.companyId))
}))

export { OrgError }
