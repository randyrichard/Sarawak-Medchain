import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { PrismaRateLimitStore } from '../lib/rateLimitStore.js'
import { ProvisioningService } from '../lib/provisioningService.js'
import { SELLABLE_PLANS, formatMyr } from '../lib/planCatalog.js'
import type { Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

/**
 * The SafeOps platform console.
 *
 * Deliberately its own router at its own prefix rather than another section of /admin.
 * Everything under /admin is scoped to one customer and answers "what may this person do
 * inside their workspace"; everything here sits above every customer. Keeping them apart
 * means no route can drift between the two authorization models by accident.
 *
 * Every handler re-checks the platform flag in the service, against the database rather
 * than the token.
 */
const svc = new ProvisioningService(prisma)
export const platformRouter = Router()

platformRouter.use(requireAuth)

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

/**
 * Provisioning creates a customer and sends mail, so it gets a ceiling of its own.
 * Generous against any real onboarding rate, tight enough that a stuck retry loop cannot
 * mint a hundred tenants.
 */
const provisionLimiter = rateLimit({
  store: new PrismaRateLimitStore(prisma, 'platform'),
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many provisioning attempts. Try again shortly.' },
})

/**
 * Whether this session may see the console, and what it may sell.
 *
 * Answers 200 with `platformAdmin: false` for everyone else rather than 403: the client
 * uses this to decide whether to show the navigation entry at all, and a forbidden here
 * would be an error on every ordinary customer's first page load.
 */
platformRouter.get('/me', async (req, res, next) => {
  try {
    const platformAdmin = await svc.isPlatformAdmin(callerOf(req))
    res.json({
      platformAdmin,
      plans: platformAdmin
        ? SELLABLE_PLANS.map((p) => ({
          key: p.key,
          label: p.label,
          summary: p.summary,
          monthlyPriceMyr: p.monthlyPriceMyr,
          monthlyPrice: formatMyr(p.monthlyPriceMyr),
          // What the operator is actually selling, so the console shows the difference
          // between two plans rather than two prices.
          entitlements: p.entitlements,
        }))
        : [],
    })
  } catch (e) { next(e) }
})

platformRouter.get('/companies', async (req, res, next) => {
  try {
    res.json({ rows: await svc.listCompanies(callerOf(req)) })
  } catch (e) { next(e) }
})

const PROVISION = z.object({
  companyName: z.string().min(1).max(160),
  plan: z.string().min(1).max(40),
  industry: z.string().max(120).optional(),
  adminName: z.string().min(1).max(120),
  adminEmail: z.string().min(3).max(200),
  siteName: z.string().min(1).max(120),
  siteCity: z.string().max(120).optional(),
  siteTimezone: z.string().max(64).optional(),
})

platformRouter.post('/companies', provisionLimiter, async (req, res, next) => {
  try {
    const input = PROVISION.parse(req.body)
    res.status(201).json(await svc.provisionCompany(callerOf(req), ctxOf(req), input))
  } catch (e) { next(e) }
})

platformRouter.patch('/companies/:id', async (req, res, next) => {
  try {
    const patch = z.object({
      plan: z.string().max(40).optional(),
      status: z.string().max(40).optional(),
      subscriptionStatus: z.string().max(40).optional(),
      billingReference: z.string().max(200).nullable().optional(),
    }).parse(req.body)
    res.json(await svc.setCompanyStatus(callerOf(req), ctxOf(req), req.params.id, patch))
  } catch (e) { next(e) }
})
