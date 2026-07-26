import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../env.js'
import { prisma } from '../lib/prisma.js'
import { AuthError, AuthService, type RequestContext } from '../lib/authService.js'
import { requireAuth } from '../middleware/requireAuth.js'

const auth = new AuthService(prisma)
export const authRouter = Router()

const REFRESH_COOKIE = 'safeops_rt'

/**
 * The refresh token lives in an httpOnly cookie so page JavaScript cannot read it —
 * an XSS bug then cannot exfiltrate a long-lived session. `sameSite: strict` keeps it
 * off cross-site requests, and `secure` is required once served over HTTPS.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict' as const,
    path: '/auth',
    domain: env.COOKIE_DOMAIN,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
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

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
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
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions())
    res.json({ accessToken, accessExpiresAt, user })
  } catch (e) {
    next(e)
  }
})

authRouter.post('/refresh', async (req, res, next) => {
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
