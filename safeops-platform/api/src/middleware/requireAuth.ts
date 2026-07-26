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
 * Authenticates the bearer token. Identity comes only from a signature this service
 * produced — a client cannot assert who it is.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in required.' })

  const claims = verifyAccessToken(token)
  if (!claims) return res.status(401).json({ error: 'unauthenticated', message: 'Session is invalid or expired.' })

  req.auth = claims
  next()
}

/**
 * Authorizes against the roles embedded in the verified token, scoped to a company.
 * The role is read from the signed claims, never from the request body or a header.
 */
export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = req.auth
    if (!claims) return res.status(401).json({ error: 'unauthenticated', message: 'Sign in required.' })

    const companyId = (req.query.companyId as string) || (req.body?.companyId as string) || undefined
    const relevant = companyId
      ? claims.roles.filter((r) => r.companyId === companyId)
      : claims.roles

    if (!relevant.some((r) => allowed.includes(r.role))) {
      return res.status(403).json({ error: 'forbidden', message: 'Your role does not permit this action.' })
    }
    next()
  }
}
