import type { NextFunction, Request, Response } from 'express'

/**
 * An async route handler whose rejection reaches the central error handler.
 *
 * Express 4 ignores the promise a handler returns, so a rejected one used to hang the
 * request until the client gave up - which is why every handler here was wrapped in its
 * own `try { ... } catch (e) { next(e) }`, about three hundred copies of the same four
 * lines. This does it once. A forgotten wrapper can no longer turn a thrown DomainError
 * into a request that never answers.
 *
 * Behaviour is identical to the hand-written form: the handler runs with the same
 * arguments, and anything it throws or rejects with goes to next().
 */
export function asyncRoute<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next)
  }
}
