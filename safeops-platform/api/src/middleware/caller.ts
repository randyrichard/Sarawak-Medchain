import type { Caller } from '../lib/incidentService.js'

/**
 * The caller as every service expects it, built from the verified access token.
 *
 * Identity comes from `req.auth`, which only requireAuth sets and only from a signature
 * this service produced - never from the body, the query or a header the client chose.
 * Call it only behind requireAuth; there is no caller to build without one.
 */
export function callerOf(req: { auth?: { sub: string; name: string; roles: unknown } }): Caller {
  const a = req.auth!
  return { userId: a.sub, name: a.name, roles: a.roles as Caller['roles'] }
}
