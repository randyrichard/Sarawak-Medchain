import { createHmac, timingSafeEqual } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import type { LookupAddress } from 'node:dns'
import { env } from '../env.js'
import { checkUrlShape, isPublicAddress, TARGET_MESSAGE } from './webhookTarget.js'

/**
 * Sending one webhook.
 *
 * The version of this that shipped made no request at all: `testWebhook` wrote
 * `lastDeliveryStatus: 'success'` and a 200 into the row and returned. Its comment gave
 * the real reason - firing at an operator-supplied URL from inside the network is an SSRF
 * primitive, and outbound delivery belongs behind an allow-list rather than in a
 * synchronous admin endpoint - and then stopped there, so the console showed green
 * deliveries that had never happened.
 *
 * What that comment asked for:
 *
 *   - HTTPS only, and only to addresses outside every private, loopback, link-local and
 *     metadata range (webhookTarget.ts).
 *   - The socket connects to the exact address that was checked. The DNS answer is
 *     resolved once, filtered, and handed to the connection through a custom `lookup`, so
 *     a name cannot resolve to something public for the check and something internal for
 *     the connection.
 *   - No redirects. A 302 to `http://169.254.169.254` would otherwise walk straight past
 *     everything above, and `https.request` does not follow them.
 *   - A hard timeout, so one unresponsive endpoint cannot occupy a sweep.
 *   - The response body is discarded. Nothing here needs it, and reading an unbounded one
 *     from an untrusted host is a way to be handed a memory problem.
 */

/** Ten seconds. Long enough for a slow endpoint, short enough not to hold up a sweep. */
const TIMEOUT_MS = 10_000

/** Signature header, in the shape Stripe and GitHub use, so it is already familiar. */
export const SIGNATURE_HEADER = 'x-safeops-signature'
export const EVENT_HEADER = 'x-safeops-event'
export const DELIVERY_HEADER = 'x-safeops-delivery'

/**
 * `t=<unix seconds>,v1=<hex hmac>` over `<t>.<body>`.
 *
 * The timestamp is inside the signed string, not merely alongside it, so a captured
 * delivery cannot be replayed later with a fresh timestamp - changing `t` invalidates the
 * signature. A receiver should reject anything more than a few minutes old.
 */
export function signPayload(secret: string, body: string, at = new Date()): string {
  const t = Math.floor(at.getTime() / 1000)
  const mac = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${mac}`
}

/**
 * Verifies a signature the way a receiver should, and the way the tests do.
 *
 * Exported because a signing scheme nothing ever checks is a signing scheme nobody knows
 * is broken. The comparison is constant-time: a receiver leaking which prefix matched
 * would let a forger recover a valid MAC byte by byte.
 */
export function verifySignature(
  secret: string, body: string, header: string, toleranceSeconds = 300, now = new Date(),
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=').map((x) => x.trim())),
  ) as { t?: string; v1?: string }
  if (!parts.t || !parts.v1) return false

  const t = Number(parts.t)
  if (!Number.isFinite(t)) return false
  if (Math.abs(Math.floor(now.getTime() / 1000) - t) > toleranceSeconds) return false

  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest()
  let presented: Buffer
  try {
    presented = Buffer.from(parts.v1, 'hex')
  } catch {
    return false
  }
  if (presented.length !== expected.length) return false
  return timingSafeEqual(presented, expected)
}

export interface DeliveryOutcome {
  ok: boolean
  statusCode?: number
  error?: string
}

/**
 * Whether delivery to private addresses is permitted.
 *
 * Off unless explicitly enabled, and impossible to enable in production - see the check in
 * env.ts. It exists so the integration tests can deliver to a server on 127.0.0.1 and
 * assert on what actually arrived, which is the only way to test a signature end to end.
 * A production deployment turning this on would be handing out the SSRF primitive the rest
 * of this file exists to prevent.
 */
function privateTargetsAllowed(): boolean {
  return env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true' && !env.isProd
}

/**
 * A `lookup` that only ever yields an address the guard approved.
 *
 * `https.request` calls this instead of the system resolver, so the address the socket
 * connects to is by construction one of the addresses that passed - closing the window
 * between checking a name and connecting to it.
 */
function guardedLookup(
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    const safe = privateTargetsAllowed()
      ? addresses
      : addresses.filter((a) => isPublicAddress(a.address))
    if (safe.length === 0) {
      const refused: NodeJS.ErrnoException = new Error(TARGET_MESSAGE.private_address)
      refused.code = 'ESAFEOPSBLOCKED'
      return callback(refused, '')
    }
    const wantsAll = (options as { all?: boolean } | undefined)?.all
    if (wantsAll) return callback(null, safe)
    callback(null, safe[0].address, safe[0].family)
  })
}

/**
 * POSTs one signed payload.
 *
 * Returns an outcome rather than throwing: every failure here is ordinary - somebody's
 * endpoint is down, or their certificate expired - and the caller records it on the row
 * and schedules a retry. Nothing about a customer's endpoint should be able to raise an
 * exception through a sweep.
 */
export async function deliver(
  url: string, secret: string, event: string, deliveryId: string, payload: unknown,
): Promise<DeliveryOutcome> {
  /*
   * In test mode the two rejections that exist to stop SSRF are exactly what a local test
   * endpoint trips, so they are waived - and only they. A malformed URL is still malformed.
   */
  const waived = privateTargetsAllowed()
  const shape = checkUrlShape(url)
  if (shape && !(waived && (shape === 'private_address' || shape === 'not_https'))) {
    return { ok: false, error: TARGET_MESSAGE[shape] }
  }

  const body = JSON.stringify(payload)
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return { ok: false, error: TARGET_MESSAGE.bad_url }
  }
  // Plain HTTP is reachable only on the same waiver. Outside tests `checkUrlShape` has
  // already refused anything that is not https.
  const send = target.protocol === 'http:' ? httpRequest : httpsRequest

  return new Promise<DeliveryOutcome>((resolve) => {
    let settled = false
    const finish = (outcome: DeliveryOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }

    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'http:' ? 80 : 443),
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        lookup: guardedLookup,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'user-agent': 'SafeOps-Webhooks/1',
          [EVENT_HEADER]: event,
          [DELIVERY_HEADER]: deliveryId,
          [SIGNATURE_HEADER]: signPayload(secret, body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0
        // Drained and discarded. Nothing here reads it, and leaving it unread would hold
        // the socket open until the timeout.
        res.resume()
        res.on('end', () => finish({
          ok: status >= 200 && status < 300,
          statusCode: status,
          error: status >= 200 && status < 300 ? undefined : `Endpoint answered ${status}.`,
        }))
      },
    )

    req.on('timeout', () => {
      req.destroy()
      finish({ ok: false, error: `No response within ${TIMEOUT_MS / 1000}s.` })
    })
    req.on('error', (e: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        error: e.code === 'ESAFEOPSBLOCKED' ? TARGET_MESSAGE.private_address : e.message,
      })
    })

    req.end(body)
  })
}
