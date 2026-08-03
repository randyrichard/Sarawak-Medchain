/**
 * The signed-in person's own account: their password and their preferences.
 *
 * Every handler works from `req.auth.sub`. No route here takes a user id, so there is no
 * shape of request that lets one person act on another's account.
 */
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { AccountError, AccountService, LANDING_PAGES } from '../lib/accountService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const svc = new AccountService(prisma)
export const accountRouter = Router()

accountRouter.use(requireAuth)

/** The cookie name is duplicated from auth.ts rather than exported — it is a wire detail. */
const REFRESH_COOKIE = 'safeops_rt'

/**
 * Password change verifies the current password, which makes it a credential-checking
 * endpoint and therefore a guessing oracle if left unthrottled. A session is already
 * required, so this bounds an attacker who has a token but not the password.
 */
const changeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Try again shortly.' },
})

// ── Preferences ──────────────────────────────────────────────────────────────

accountRouter.get('/preferences', async (req, res, next) => {
  try {
    res.json(await svc.getPreferences(req.auth!.sub))
  } catch (e) {
    next(e)
  }
})

const preferencesBody = z.object({
  landingPage: z.enum(LANDING_PAGES).optional(),
  defaultSiteId: z.string().max(120).nullable().optional(),
})

accountRouter.patch('/preferences', async (req, res, next) => {
  try {
    const parsed = preferencesBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Those are not settings we recognise.' })
    }
    res.json(await svc.updatePreferences(req.auth!.sub, parsed.data))
  } catch (e) {
    next(e)
  }
})

// ── Password ─────────────────────────────────────────────────────────────────

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
})

accountRouter.post('/password', changeLimiter, async (req, res, next) => {
  try {
    const parsed = passwordBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'validation',
        message: 'Enter your current password and a new one.',
      })
    }
    const result = await svc.changePassword(
      req.auth!.sub,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      // Passed so this browser's session survives; every other device is signed out.
      req.cookies?.[REFRESH_COOKIE],
    )
    res.json(result)
  } catch (e) {
    next(e)
  }
})

export { AccountError }
