import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { OrgAdminService } from '../lib/orgAdminService.js'
import type { Caller } from '../lib/incidentService.js'
import { requireAuth } from '../middleware/requireAuth.js'

/**
 * Organisation administration.
 *
 * Mounted under /admin alongside the existing console router. Every route here is
 * administrator-only and re-checks the caller's membership inside the service, so a
 * companyId in a query string can never widen what is returned.
 *
 * The two invitation routes at the bottom are the exception: an invitee has no session
 * yet, so they authenticate with the token itself and carry no auth middleware.
 */
const svc = new OrgAdminService(prisma)
export const orgAdminRouter = Router()

function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}

const ctxOf = (req: { ip?: string; get: (h: string) => string | undefined }) =>
  ({ ip: req.ip, device: req.get('user-agent') ?? '' })

const COMPANY = z.object({ companyId: z.string().min(1) })

/**
 * A ceiling on invitation mail leaving this instance.
 *
 * The service already enforces a cooldown and a send ceiling per invitation; this bounds
 * the whole surface, so a compromised admin session cannot use the console to post mail at
 * a few hundred addresses. Generous enough that onboarding a real site never touches it.
 */
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many invitations. Try again shortly.' },
})

// ── Sites ────────────────────────────────────────────────────────────────────

const SITE_BODY = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1).max(120),
  code: z.string().max(24).optional(),
  city: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  timezone: z.string().max(64).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
})

orgAdminRouter.get('/sites', requireAuth, async (req, res, next) => {
  try {
    const { companyId } = COMPANY.parse(req.query)
    res.json({ rows: await svc.listSites(callerOf(req), companyId) })
  } catch (e) { next(e) }
})

orgAdminRouter.post('/sites', requireAuth, async (req, res, next) => {
  try {
    const { companyId, ...input } = SITE_BODY.parse(req.body)
    res.status(201).json(await svc.createSite(callerOf(req), companyId, ctxOf(req), input))
  } catch (e) { next(e) }
})

orgAdminRouter.patch('/sites/:id', requireAuth, async (req, res, next) => {
  try {
    const { companyId, ...patch } = SITE_BODY.partial({ name: true }).parse(req.body)
    res.json(await svc.updateSite(callerOf(req), companyId, ctxOf(req), req.params.id, patch))
  } catch (e) { next(e) }
})

orgAdminRouter.post('/sites/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { companyId, active } = COMPANY.extend({ active: z.boolean() }).parse(req.body)
    res.json(await svc.setSiteActive(callerOf(req), companyId, ctxOf(req), req.params.id, active))
  } catch (e) { next(e) }
})

// ── Departments ──────────────────────────────────────────────────────────────

orgAdminRouter.get('/departments', requireAuth, async (req, res, next) => {
  try {
    const { companyId, siteId } = COMPANY.extend({ siteId: z.string().optional() }).parse(req.query)
    res.json({ rows: await svc.listDepartments(callerOf(req), companyId, siteId) })
  } catch (e) { next(e) }
})

orgAdminRouter.post('/departments', requireAuth, async (req, res, next) => {
  try {
    const { companyId, ...input } = COMPANY.extend({
      name: z.string().min(1).max(120),
      siteId: z.string().min(1),
      code: z.string().max(24).optional(),
      managerUserId: z.string().nullable().optional(),
    }).parse(req.body)
    res.status(201).json(await svc.createDepartment(callerOf(req), companyId, ctxOf(req), input))
  } catch (e) { next(e) }
})

orgAdminRouter.patch('/departments/:id', requireAuth, async (req, res, next) => {
  try {
    const { companyId, ...patch } = COMPANY.extend({
      name: z.string().min(1).max(120).optional(),
      code: z.string().max(24).optional(),
      managerUserId: z.string().nullable().optional(),
    }).parse(req.body)
    res.json(await svc.updateDepartment(callerOf(req), companyId, ctxOf(req), req.params.id, patch))
  } catch (e) { next(e) }
})

orgAdminRouter.post('/departments/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { companyId, active } = COMPANY.extend({ active: z.boolean() }).parse(req.body)
    res.json(
      await svc.setDepartmentActive(callerOf(req), companyId, ctxOf(req), req.params.id, active),
    )
  } catch (e) { next(e) }
})

// ── Invitations ──────────────────────────────────────────────────────────────

orgAdminRouter.get('/invitations', requireAuth, async (req, res, next) => {
  try {
    const { companyId } = COMPANY.parse(req.query)
    res.json({ rows: await svc.listInvitations(callerOf(req), companyId) })
  } catch (e) { next(e) }
})

orgAdminRouter.post('/invitations', inviteLimiter, requireAuth, async (req, res, next) => {
  try {
    const { companyId, ...input } = COMPANY.extend({
      email: z.string().min(3).max(200),
      name: z.string().max(120).optional(),
      role: z.string().min(1),
      siteIds: z.array(z.string()).optional(),
      departmentId: z.string().nullable().optional(),
    }).parse(req.body)
    res.status(201).json(await svc.createInvitation(callerOf(req), companyId, ctxOf(req), input))
  } catch (e) { next(e) }
})

orgAdminRouter.post('/invitations/:id/resend', inviteLimiter, requireAuth, async (req, res, next) => {
  try {
    const { companyId } = COMPANY.parse(req.body)
    res.json(await svc.resendInvitation(callerOf(req), companyId, ctxOf(req), req.params.id))
  } catch (e) { next(e) }
})

orgAdminRouter.post('/invitations/:id/revoke', requireAuth, async (req, res, next) => {
  try {
    const { companyId } = COMPANY.parse(req.body)
    res.json(await svc.revokeInvitation(callerOf(req), companyId, ctxOf(req), req.params.id))
  } catch (e) { next(e) }
})

// ── User access ──────────────────────────────────────────────────────────────

orgAdminRouter.get('/role-catalog', requireAuth, async (req, res, next) => {
  try {
    const { companyId } = COMPANY.parse(req.query)
    res.json({ rows: await svc.roleCatalog(callerOf(req), companyId) })
  } catch (e) { next(e) }
})

orgAdminRouter.patch('/users/:id/access', requireAuth, async (req, res, next) => {
  try {
    const { companyId, ...patch } = COMPANY.extend({
      role: z.string().optional(),
      siteIds: z.array(z.string()).optional(),
      departmentId: z.string().nullable().optional(),
    }).parse(req.body)
    res.json(await svc.setUserAccess(callerOf(req), companyId, ctxOf(req), req.params.id, patch))
  } catch (e) { next(e) }
})

// ── Accepting an invitation (no session yet) ─────────────────────────────────

/*
 * Deliberately unauthenticated: the invitee has no account to sign in with. The token is
 * the whole authority, which is why it is single-use, time-limited and bound to one
 * workspace, and why every failure mode returns the same sentence.
 */
export const inviteRouter = Router()

inviteRouter.get('/:token', async (req, res, next) => {
  try {
    res.json(await svc.previewInvitation(req.params.token))
  } catch (e) { next(e) }
})

inviteRouter.post('/:token/accept', async (req, res, next) => {
  try {
    const body = z.object({
      password: z.string().min(1),
      name: z.string().max(120).optional(),
    }).parse(req.body)
    res.json(await svc.acceptInvitation(req.params.token, body))
  } catch (e) { next(e) }
})
