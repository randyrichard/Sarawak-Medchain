import { isIP } from 'node:net'

/**
 * Deciding whether an address is safe to POST to.
 *
 * A webhook URL is chosen by a customer's administrator and fetched by this service from
 * inside the network the service runs in. That is the textbook shape of server-side
 * request forgery: `https://169.254.169.254/latest/meta-data/` is a cloud provider's
 * credential endpoint, `https://db:5432` is the database container next door, and both are
 * reachable from here and from nowhere the administrator sits. The comment on the old
 * `testWebhook` was right that this belongs behind an allow-list rather than in a
 * synchronous admin endpoint; this is that check.
 *
 * Deny by range rather than by name. A blocklist of hostnames is defeated by a DNS record
 * pointing at 127.0.0.1, so what is tested is every address the name actually resolves to,
 * and the connection is then made to one of those exact addresses - see the `lookup` in
 * webhookDelivery.ts. Checking the name and then letting the socket resolve it again would
 * leave a window for the second answer to differ from the first.
 */

/** Parses "a.b.c.d" into its four octets. Assumes `isIP` has already said it is IPv4. */
function octets(ip: string): number[] {
  return ip.split('.').map((n) => Number(n))
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = octets(ip)
  if (a === 0) return true // "this network"
  if (a === 10) return true // RFC 1918
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local, and the cloud metadata address
  if (a === 172 && b >= 16 && b <= 31) return true // RFC 1918
  if (a === 192 && b === 168) return true // RFC 1918
  if (a === 192 && b === 0) return true // IETF protocol assignments, includes 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true // RFC 6598 carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true // RFC 2544 benchmarking
  if (a >= 224) return true // multicast and reserved, 224.0.0.0/4 and 240.0.0.0/4
  return false
}

function isPrivateV6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  if (ip === '::' || ip === '::1') return true // unspecified, loopback
  if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
    return true // fe80::/10 link-local
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true // fc00::/7 unique local
  if (ip.startsWith('ff')) return true // ff00::/8 multicast
  /*
   * IPv4-mapped and IPv4-compatible forms, e.g. ::ffff:127.0.0.1. Without this an
   * attacker reaches every blocked IPv4 range by writing it in IPv6.
   */
  const mapped = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateV4(mapped[1])
  return false
}

/** True when this address is one a customer's endpoint could legitimately live at. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return !isPrivateV4(ip)
  if (family === 6) return !isPrivateV6(ip)
  return false
}

export type TargetRejection = 'not_https' | 'bad_url' | 'private_address' | 'no_address'

export const TARGET_MESSAGE: Record<TargetRejection, string> = {
  not_https: 'Webhook URL must be HTTPS.',
  bad_url: 'Webhook URL could not be parsed.',
  private_address:
    'That address is on a private, loopback or link-local network, which this service will '
    + 'not send to. Use a publicly reachable HTTPS endpoint.',
  no_address: 'That hostname does not resolve to any address.',
}

/**
 * Checks the parts of a URL that need no network.
 *
 * Split out from the address check so the console can reject an obviously wrong URL the
 * moment it is typed, without a DNS lookup, and so the delivery path can run both.
 */
export function checkUrlShape(raw: string): TargetRejection | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'bad_url'
  }
  if (url.protocol !== 'https:') return 'not_https'
  if (!url.hostname) return 'bad_url'
  // A literal address is checked here; a name is checked once resolved.
  if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
    return 'private_address'
  }
  return null
}
