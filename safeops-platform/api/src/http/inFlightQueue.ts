import type { RequestHandler } from 'express'

/**
 * At most `perKey` requests from one key (by default the address) in progress at once in this
 * process; the rest wait their turn, in arrival order, instead of being refused.
 *
 * Put in front of the sign-in throttle. That throttle counts an attempt when it arrives and
 * refunds it when it succeeds, so an attempt still being checked holds a place in the
 * address's budget of failures. Unbounded, a shift arriving at once - 300 people behind one
 * site address pressing "Sign in" in the same second - filled the budget with sign-ins that
 * were about to succeed, and 260 of them were told "Too many attempts". With this in front,
 * no more than `perKey` places can be held that way, far inside the budget, so only real
 * failures can use it up. It also keeps an address's count exact under a parallel spray.
 *
 * Waiting costs a shift nothing: password checks are CPU-bound on a small thread pool, so
 * they were queueing anyway. A queue longer than `maxWaiting` is refused, so one address
 * cannot hold unlimited open requests in memory.
 */
export function inFlightQueue(opts: {
  perKey: number
  maxWaiting: number
  key?: (req: Parameters<RequestHandler>[0]) => string
  message: object
}): RequestHandler {
  const lanes = new Map<string, { active: number; waiting: (() => void)[] }>()
  const keyOf = opts.key ?? ((req) => req.ip ?? 'unknown')

  return (req, res, next) => {
    const key = keyOf(req)
    let lane = lanes.get(key)
    if (!lane) { lane = { active: 0, waiting: [] }; lanes.set(key, lane) }
    const l = lane

    let done = false
    const release = () => {
      if (done) return
      done = true
      // Hand the place straight to the next in line, so a newcomer cannot slip in between.
      const nextInLine = l.waiting.shift()
      if (nextInLine) return nextInLine()
      l.active--
      if (l.active === 0) lanes.delete(key)
    }
    const start = () => {
      res.once('finish', release)
      res.once('close', release)
      next()
    }

    if (l.active < opts.perKey) { l.active++; return start() }
    if (l.waiting.length >= opts.maxWaiting) {
      res.status(429).json(opts.message)
      return
    }
    l.waiting.push(start)
    // A client that gives up while waiting leaves the queue. One whose turn has come is
    // already running and passes its place on through release().
    res.once('close', () => {
      const i = l.waiting.indexOf(start)
      if (i >= 0) l.waiting.splice(i, 1)
    })
  }
}
