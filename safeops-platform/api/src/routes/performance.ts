import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { HsePerformanceService } from '../lib/hsePerformance.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * HSE performance: organisation-wide rates, leading indicators and the 12-month trend, plus
 * the man-hours they are calculated from. Roles and tenancy are checked in the service.
 */
const svc = new HsePerformanceService(prisma)
export const performanceRouter = Router()

performanceRouter.use(requireAuth)

const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

performanceRouter.get('/', asyncRoute(async (req, res) => {
  const q = z.object({
    companyId: z.string().min(1),
    projectId: z.string().optional(),
    months: z.coerce.number().int().min(1).max(24).optional(),
    endMonth: MONTH.optional(),
  }).parse(req.query)
  res.json(await svc.performance(callerOf(req), q))
}))

performanceRouter.get('/man-hours', asyncRoute(async (req, res) => {
  const q = z.object({ companyId: z.string().min(1), year: z.coerce.number().int().min(2000).max(2100) }).parse(req.query)
  res.json(await svc.manHours(callerOf(req), q))
}))

performanceRouter.put('/man-hours', asyncRoute(async (req, res) => {
  const b = z.object({
    companyId: z.string().min(1),
    siteId: z.string().min(1),
    month: MONTH,
    /** null clears the recorded figure, so the month falls back to the estimate. */
    hours: z.number().int().min(0).max(50_000_000).nullable(),
  }).parse(req.body)
  res.json(await svc.setManHours(callerOf(req), b))
}))

performanceRouter.put('/targets', asyncRoute(async (req, res) => {
  const b = z.object({
    companyId: z.string().min(1),
    metric: z.string().min(1),
    /** null clears the target. Range is checked in the service, per metric. */
    value: z.number().finite().nullable(),
  }).parse(req.body)
  res.json(await svc.setTarget(callerOf(req), b))
}))
