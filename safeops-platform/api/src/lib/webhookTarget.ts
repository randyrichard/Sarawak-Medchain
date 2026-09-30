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

/**
 * An IPv6 address as its eight 16-bit groups, or null if it is not one.
 *
 * Parsed rather than matched as text, because IPv6 has too many spellings for prefix
 * tests on a string to be sound. The WHATWG URL parser, for one, rewrites
 * `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`, and the dotted-quad pattern this used to rely
 * on never saw the hex form: loopback and the cloud metadata address both read as public.
 */
function hextets(raw: string): number[] | null {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  // A trailing dotted quad is the last two groups written in IPv4 notation.
  const quad = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (quad) {
    if (isIP(quad[2]) !== 4) return null
    const [a, b, c, d] = octets(quad[2])
    ip = `${quad[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

/** The IPv4 address carried in two 16-bit groups. */
function v4Of(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
}

function isPrivateV6(raw: string): boolean {
  const g = hextets(raw)
  if (!g) return true // not an address we can reason about, so not one we will send to
  const zeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0)

  if (zeroUntil(8)) return true // :: unspecified
  if (zeroUntil(7) && g[7] === 1) return true // ::1 loopback
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // 2001:db8::/32 documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true // 100::/64 discard

  /*
   * Forms that carry an IPv4 address, judged by that address. Without these an attacker
   * reaches every blocked IPv4 range by writing it in IPv6:
   *   ::ffff:a.b.c.d   IPv4-mapped          ::a.b.c.d   IPv4-compatible (deprecated)
   *   64:ff9b::a.b.c.d NAT64                2002:AABB:CCDD::   6to4
   */
  if (zeroUntil(5) && g[5] === 0xffff) return isPrivateV4(v4Of(g[6], g[7]))
  if (zeroUntil(6)) return isPrivateV4(v4Of(g[6], g[7]))
  if (g[0] === 0x0064 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateV4(v4Of(g[6], g[7]))
  }
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 0x0001) return true // 64:ff9b:1::/48 local NAT64
  if (g[0] === 0x2002) return isPrivateV4(v4Of(g[1], g[2]))
  // Teredo hides the client address behind an XOR; nothing legitimate needs a webhook there.
  if (g[0] === 0x2001 && g[1] === 0x0000) return true
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
