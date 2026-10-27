import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { DoshService } from '../lib/doshNotification.js'
import { DOSH_CATEGORIES } from '../domain/doshNotification.js'
import { requireAuth } from '../http/requireAuth.js'
import { callerOf } from '../http/caller.js'
import { asyncRoute } from '../http/asyncRoute.js'

/**
 * DOSH notification on an incident (NADOPOD Regulations 2004).
 *
 * Mounted on /incidents ahead of the router that owns /:id, like the investigation router,
 * so /incidents/dosh/outstanding is not looked up as an incident whose id reads "dosh".
 */
const svc = new DoshService(prisma)
export const doshNotificationRouter = Router()

doshNotificationRouter.use(requireAuth)

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

/** An instant, with its offset: the browser sends what the person typed, converted to UTC. */
const instant = z.string().datetime({ offset: true }).nullish()
const text = (max: number) => z.string().max(max).nullish()

const doshBody = z.object({
  category: z.enum(DOSH_CATEGORIES),
  detail: text(500),
  notRequiredReason: text(1000),
  clockFrom: instant,
  informedAt: instant,
  informedHow: text(60),
  office: text(120),
  submittedAt: instant,
  reference: text(80),
})

const toDate = (s: string | null | undefined) => (s ? new Date(s) : null)

/** What is owed to DOSH across the workspace, soonest first. */
doshNotificationRouter.get('/dosh/outstanding', asyncRoute(async (req, res) => {
  const companyId = String(req.query.companyId ?? '')
  if (!companyId) return res.status(400).json({ error: 'validation', message: 'companyId is required.' })
  res.json(await svc.outstanding(callerOf(req), companyId))
}))

doshNotificationRouter.get('/:id/dosh', asyncRoute(async (req, res) => {
  res.json(await svc.get(callerOf(req), req.params.id))
}))

doshNotificationRouter.put('/:id/dosh', asyncRoute(async (req, res) => {
  const parsed = doshBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Choose a category, and check the dates and text lengths.' })
  }
  const b = parsed.data
  res.json(await svc.save(callerOf(req), req.params.id, {
    category: b.category,
    detail: b.detail,
    notRequiredReason: b.notRequiredReason,
    clockFrom: toDate(b.clockFrom),
    informedAt: toDate(b.informedAt),
    informedHow: b.informedHow,
    office: b.office,
    submittedAt: toDate(b.submittedAt),
    reference: b.reference,
  }, ctxOf(req)))
}))
