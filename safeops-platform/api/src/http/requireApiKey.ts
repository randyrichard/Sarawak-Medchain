import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma.js'
import {
  authenticateApiKey, hasScope, scopeForMethod, type ApiPrincipal,
} from '../lib/apiKeyAuth.js'
import { countApiCall, countApiError } from '../lib/apiUsage.js'
import { enterTenants } from '../lib/tenantContext.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiPrincipal
    }
  }
}

/**
 * Authenticates the integration API.
 *
 * Deliberately a separate door from `requireAuth`. A session token opens the application's
 * routes and nothing else; a key opens `/v1` and nothing else. Neither middleware will
 * accept the other's credential, so there is no route where the wrong kind of caller could
 * arrive by way of a mounting mistake.
 *
 * Every failure answers 401 with the same shape and no detail about which key exists. A
 * revoked key and a key that was never issued are indistinguishable from outside, because
 * the difference is only useful to somebody working out what to try next.
 */
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const presented = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined
  if (!presented) {
    return res.status(401).json({
      error: 'unauthenticated',
      message: 'Send an API key as: Authorization: Bearer sk_live_...',
    })
  }

  let result
  try {
    result = await authenticateApiKey(prisma, presented)
  } catch (e) {
    return next(e)
  }

  if ('failure' in result) {
    // The one failure worth distinguishing: a suspended workspace is a state the customer
    // can do something about, and leaving them to debug a key that is in fact valid is a
    // support call with no information in it.
    if (result.failure === 'company_suspended') {
      return res.status(403).json({
        error: 'workspace_suspended',
        message: 'This workspace is suspended. Contact SafeOps.',
      })
    }
    return res.status(401).json({ error: 'unauthenticated', message: 'Invalid API key.' })
  }

  const principal = result.principal
  // From here on, database reads and writes are confined to the key's company.
  enterTenants([principal.companyId])

  /*
   * Counted on the way in, before the scope check, and awaited.
   *
   * Before the scope check because `calls` is the denominator the usage panel divides
   * `errors` by. Counting a refusal as an error but not as a call gives a workspace whose
   * only traffic is refusals two errors out of zero calls - an error rate that is either a
   * division by zero or, guarded, a reassuring 0%. It is a request the API served, and
   * refusing is how it served it.
   *
   * Awaited, so a request that returns has certainly been counted: a fire-and-forget write
   * would make the console's figure depend on whether the process survived long enough to
   * flush it. One indexed upsert, and it swallows its own failures - metering must never
   * be the reason a customer's integration breaks.
   */
  await countApiCall(prisma, principal.keyId, principal.companyId)

  const needed = scopeForMethod(req.method)
  if (!hasScope(principal, needed)) {
    // A key repeatedly denied for scope is exactly what the error rate is for: it is how
    // an integrator notices they issued a read-only key for a job that writes.
    await countApiError(prisma, principal.keyId, principal.companyId)
    return res.status(403).json({
      error: 'insufficient_scope',
      message: `This key does not hold the "${needed}" scope.`,
    })
  }

  req.apiKey = principal

  // Failures are counted once the status is known. Fire-and-forget on purpose: the
  // response has already been sent by then, so there is nothing left to wait for.
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      void countApiError(prisma, principal.keyId, principal.companyId)
    }
  })

  next()
}
