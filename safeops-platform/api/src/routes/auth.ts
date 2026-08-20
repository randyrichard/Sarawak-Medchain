import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { AuthError, AuthService, type RequestContext } from '../lib/authService.js'
import { AccountService } from '../lib/accountService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const auth = new AuthService(prisma)
const account = new AccountService(prisma)
export const authRouter = Router()

const REFRESH_COOKIE = 'safeops_rt'

/**
 * The refresh token lives in an httpOnly cookie so page JavaScript cannot read it —
 * an XSS bug then cannot exfiltrate a long-lived session. `sameSite: strict` keeps it
 * off cross-site requests, and `secure` is required once served over HTTPS.
 */
function refreshCookieOptions(remember = true) {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict' as const,
    path: '/auth',
    domain: env.COOKIE_DOMAIN,
    // Without "keep me signed in" the cookie is omitted a maxAge, making it a session
    // cookie the browser drops when it closes. That is the point of the choice on a
    // shared site-office machine, so it must reach the cookie rather than being decoration.
    ...(remember ? { maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 } : {}),
  }
}

function ctxOf(req: { ip?: string; headers: Record<string, unknown> }): RequestContext {
  return { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) }
}

/**
 * Per-IP throttle in front of the credential endpoint. This bounds online guessing
 * independently of per-account lockout, which alone would let an attacker spray one
 * attempt each across thousands of accounts.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Try again shortly.' },
})

/**
 * Refresh is unauthenticated at the HTTP layer — it is gated only by the cookie — so it
 * needs its own ceiling. The limit is looser than login because legitimate clients refresh
 * on a timer and across tabs, but it still bounds token-guessing and replay storms.
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Try again shortly.' },
})

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
  // Absent means "keep me signed in", which is what the login form defaults to.
  rememberMe: z.boolean().optional(),
})

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'Email and password are required.' })
    }
    const { accessToken, accessExpiresAt, refreshToken, user } = await auth.login(
      parsed.data.email, parsed.data.password, ctxOf(req),
    )
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(parsed.data.rememberMe ?? true))
    res.json({ accessToken, accessExpiresAt, user })
  } catch (e) {
    next(e)
  }
})

authRouter.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE]
    if (!raw) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in required.' })

    const { accessToken, accessExpiresAt, refreshToken, user } = await auth.refresh(raw, ctxOf(req))
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions())
    res.json({ accessToken, accessExpiresAt, user })
  } catch (e) {
    // A failed refresh must not leave a stale cookie behind.
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined })
    next(e)
  }
})

authRouter.post('/logout', async (req, res, next) => {
  try {
    await auth.logout(req.cookies?.[REFRESH_COOKIE], req.body?.allDevices === true)
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined })
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

/**
 * Reset redemption is unauthenticated by necessity — the whole point is that the caller
 * cannot sign in. The token is the only credential, so this is throttled harder than
 * login: an attacker here is guessing a 32-byte value, and the limit removes any
 * remaining value in trying.
 */
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Try again shortly.' },
})

const resetBody = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(1).max(200),
})

authRouter.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const parsed = resetBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', message: 'A reset token and new password are required.' })
    }
    await account.redeemPasswordReset(parsed.data.token, parsed.data.newPassword)
    res.status(204).end()
  } catch (e) {
    next(e)
  }
})

/**
 * Self-service password reset: "I forgot mine, send me a link."
 *
 * Until now recovery was administrator-issued only, which works for a team member and
 * strands the people most likely to need it - a company's sole administrator has no peer to
 * ask, and a platform administrator belongs to no company at all. Both had to contact a
 * human who then ran a CLI command on the server.
 *
 * ── Anti-enumeration ─────────────────────────────────────────────────────────
 * The response is identical whether or not the address exists: same status, same body, no
 * timing branch worth measuring, and no hint in any error. A sign-in form that answers "no
 * such account" is a free membership oracle - worth more to an attacker than it sounds,
 * because knowing who banks with whom, or in this case which companies use this product and
 * who works there, is the reconnaissance step before a phishing run.
 *
 * That is why nothing here throws on a miss and why delivery failures are swallowed too: a
 * 500 for real addresses and a 202 for made-up ones is the same oracle wearing a different
 * hat.
 *
 * Rate limited by the same limiter as the rest of the reset flow - 15 attempts per quarter
 * hour per IP - so the endpoint cannot be walked through an address list.
 */
const forgotBody = z.object({ email: z.string().email().max(320) })

authRouter.post('/forgot-password', resetLimiter, async (req, res) => {
  const parsed = forgotBody.safeParse(req.body)
  /*
   * Even a malformed address gets the same answer. Replying 400 for "not an email" and 202
   * for a well-formed one is harmless; replying differently for a well-formed address that
   * does not exist is not, and keeping one exit path is how that stays true when somebody
   * edits this later.
   */
  if (parsed.success) {
    try {
      await account.requestPasswordReset(parsed.data.email)
    } catch (e) {
      /*
       * Deliberately swallowed. This endpoint's whole purpose is to be indistinguishable
       * across inputs, and an error response is a distinguishing input. Logged server-side
       * without the address's token so an operator can still see something went wrong.
       */
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({
        t: new Date().toISOString(),
        event: 'forgot_password_failed',
        reason: e instanceof Error ? e.message : 'unknown',
      }))
    }
  }
  res.status(202).json({
    message: 'If that address has an account, a reset link is on its way. '
      + 'Check your inbox, including spam.',
  })
})

/** Lets the reset page tell the user a link is dead before they type a password twice. */
authRouter.get('/reset-password/:token', resetLimiter, async (req, res, next) => {
  try {
    res.json({ valid: await account.isResetTokenValid(req.params.token) })
  } catch (e) {
    next(e)
  }
})

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } })
    if (!user || user.status === 'deactivated') {
      return res.status(401).json({ error: 'unauthenticated', message: 'Account is unavailable.' })
    }
    res.json({ user: auth.publicUser(user), roles: req.auth!.roles })
  } catch (e) {
    next(e)
  }
})

export { AuthError }
