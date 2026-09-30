import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken, type AccessClaims } from '../lib/tokens.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims
    }
  }
}

/**
 * What an account still carrying somebody else's password is allowed to reach.
 *
 * Replacing that password, and asking who it is. Everything else - including reading a
 * single incident - waits until the password has been replaced.
 *
 * `/auth/me` has to be here: it is how the app establishes who is signed in, and the
 * forced-change screen cannot render without it. Gating it made the state unrecoverable -
 * sign-in succeeded and the app then failed to load the one screen that would have fixed
 * it, so the account was locked out by the very rule meant to protect it. It discloses the
 * caller's own identity and nothing belonging to a customer.
 */
const ALLOWED_WHILE_LOCKED: { method: string; path: string }[] = [
  { method: 'POST', path: '/account/password' },
  { method: 'GET', path: '/auth/me' },
]

function isAllowedWhileLocked(req: Request): boolean {
  // originalUrl, because this runs inside routers mounted on a prefix: req.path here is
  // '/password', and matching that alone would open any router with such a route.
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '')
  return ALLOWED_WHILE_LOCKED.some((a) => a.method === req.method && a.path === path)
}

/**
 * Authenticates the bearer token. Identity comes only from a signature this service
 * produced — a client cannot assert who it is.
 *
 * This is also where a forced password change is enforced. It lives here, rather than on
 * the routes that matter, for the same reason the browser gate sits in RequireAuth: there
 * must be no address that skips it. The web app used to be the only thing honouring the
 * flag, which meant the rule held in the product and not in the API behind it - anyone
 * with curl kept full read access to a customer's incident and audit records using a
 * password an administrator had chosen for them and told them to replace.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in required.' })

  const claims = verifyAccessToken(token)
  if (!claims) return res.status(401).json({ error: 'unauthenticated', message: 'Session is invalid or expired.' })

  if (claims.mustChangePassword && !isAllowedWhileLocked(req)) {
    /*
     * A distinct code, not a bare 403: the client has to be able to tell "you may not do
     * this" from "you must do something first", and sending somebody to a permissions
     * error when the answer is a password change is how a support call starts.
     */
    return res.status(403).json({
      error: 'password_change_required',
      message: 'Choose your own password before continuing.',
    })
  }

  req.auth = claims
  next()
}
