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
import { PrismaRateLimitStore } from '../lib/rateLimitStore.js'
import { AccountError, AccountService, LANDING_PAGES } from '../lib/accountService.js'
import { MfaService } from '../lib/mfaService.js'
import { requireAuth } from '../http/requireAuth.js'
import { asyncRoute } from '../http/asyncRoute.js'

const svc = new AccountService(prisma)
const mfa = new MfaService(prisma)
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
  store: new PrismaRateLimitStore(prisma, 'account'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Try again shortly.' },
})

// ── Preferences ──────────────────────────────────────────────────────────────

accountRouter.get('/preferences', asyncRoute(async (req, res) => {
  res.json(await svc.getPreferences(req.auth!.sub))
}))

const preferencesBody = z.object({
  landingPage: z.enum(LANDING_PAGES).optional(),
  defaultSiteId: z.string().max(120).nullable().optional(),
})

accountRouter.patch('/preferences', asyncRoute(async (req, res) => {
  const parsed = preferencesBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Those are not settings we recognise.' })
  }
  res.json(await svc.updatePreferences(req.auth!.sub, parsed.data))
}))

// ── Password ─────────────────────────────────────────────────────────────────

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
})

accountRouter.post('/password', changeLimiter, asyncRoute(async (req, res) => {
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
}))

// ── Multi-factor sign-in ─────────────────────────────────────────────────────

/*
 * Setting up, turning off and replacing recovery codes all work on the caller's own
 * account only - there is no user id in any of these paths. The ones that check a code or
 * a password share the password-change limiter, because each is a guessing oracle for
 * somebody holding a session but not the phone.
 */

accountRouter.get('/mfa', asyncRoute(async (req, res) => {
  res.json(await mfa.status(req.auth!.sub))
}))

accountRouter.post('/mfa/setup', asyncRoute(async (req, res) => {
  res.json(await mfa.beginSetup(req.auth!.sub))
}))

const codeBody = z.object({ code: z.string().min(1).max(40) })

accountRouter.post('/mfa/enable', changeLimiter, asyncRoute(async (req, res) => {
  const parsed = codeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Enter the code from your authenticator app.' })
  }
  res.json(await mfa.confirmSetup(req.auth!.sub, parsed.data.code))
}))

accountRouter.post('/mfa/disable', changeLimiter, asyncRoute(async (req, res) => {
  const parsed = z.object({ password: z.string().min(1).max(200), code: z.string().min(1).max(40) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Enter your password and a code.' })
  }
  await mfa.disable(req.auth!.sub, parsed.data.password, parsed.data.code)
  res.status(204).end()
}))

accountRouter.post('/mfa/recovery-codes', changeLimiter, asyncRoute(async (req, res) => {
  const parsed = codeBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', message: 'Enter the code from your authenticator app.' })
  }
  res.json(await mfa.regenerateRecoveryCodes(req.auth!.sub, parsed.data.code))
}))

export { AccountError }
