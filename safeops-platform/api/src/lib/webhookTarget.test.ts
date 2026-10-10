import { describe, it, expect } from 'vitest'
import { checkUrlShape, isPublicAddress } from './webhookTarget.js'

/**
 * The SSRF guard.
 *
 * This is the check that decides whether SafeChain will make an HTTP request to an address a
 * customer's administrator typed into a form. Get it wrong and the webhook feature becomes
 * a way for any administrator of any tenant to read whatever this server can reach: the
 * database container beside it, an internal admin tool, or the cloud metadata endpoint that
 * hands out the deployment's credentials.
 *
 * So the tests here are mostly the addresses that must be refused, and particularly the
 * ways of writing them that a naive check misses.
 */
describe('isPublicAddress', () => {
  it('accepts ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '104.16.0.1', '203.0.113.9', '2606:4700::1111']) {
      expect(isPublicAddress(ip), ip).toBe(true)
    }
  })

  it('refuses loopback', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '::1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('refuses the RFC 1918 private ranges', () => {
    for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('does not refuse the public addresses either side of 172.16/12', () => {
    // The range is 172.16-172.31, not all of 172. Blocking 172.15 and 172.32 would refuse
    // real customer endpoints, which is a different bug with the same cause: guessing.
    expect(isPublicAddress('172.15.0.1')).toBe(true)
    expect(isPublicAddress('172.32.0.1')).toBe(true)
  })

  it('refuses the cloud metadata address', () => {
    // 169.254.169.254 serves instance credentials on every major provider. It is the single
    // most valuable thing an SSRF can reach, and it is a link-local address.
    expect(isPublicAddress('169.254.169.254')).toBe(false)
    expect(isPublicAddress('169.254.0.1')).toBe(false)
  })

  it('refuses carrier-grade NAT, benchmarking, "this network" and multicast', () => {
    for (const ip of ['100.64.0.1', '198.18.0.1', '0.0.0.0', '224.0.0.1', '239.1.1.1', '255.255.255.255']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('refuses IPv6 link-local, unique-local and multicast', () => {
    for (const ip of ['fe80::1', 'fd00::1', 'fc00::1', 'ff02::1', '::']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('refuses a blocked IPv4 address written as IPv6', () => {
    /*
     * The bypass a range check usually misses. `::ffff:169.254.169.254` is the metadata
     * address, and a guard that only understands dotted quads waves it straight through.
     */
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:169.254.169.254')).toBe(false)
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false)
    expect(isPublicAddress('::127.0.0.1')).toBe(false)
  })

  it('refuses the same addresses in the hex spelling a URL parser produces', () => {
    /*
     * `new URL('https://[::ffff:127.0.0.1]/')` reports its hostname as `[::ffff:7f00:1]`,
     * and the dotted-quad pattern this guard used to rely on never matched that form:
     * loopback and the metadata address both read as public.
     */
    for (const ip of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:a00:1', '0:0:0:0:0:ffff:c0a8:1', '::7f00:1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('refuses private IPv4 addresses carried by NAT64 and 6to4', () => {
    for (const ip of ['64:ff9b::7f00:1', '64:ff9b::169.254.169.254', '2002:7f00:1::', '2002:a9fe:a9fe::1', '64:ff9b:1::1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('refuses documentation, discard and Teredo ranges', () => {
    for (const ip of ['2001:db8::1', '100::1', '2001:0:4136:e378::1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('still accepts public IPv6, including public IPv4 carried inside it', () => {
    for (const ip of ['2001:4860:4860::8888', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '64:ff9b::8.8.8.8', '2002:808:808::1']) {
      expect(isPublicAddress(ip), ip).toBe(true)
    }
  })

  it('refuses a malformed IPv6 address rather than guessing', () => {
    for (const ip of ['1::2::3', '12345::1', '1:2:3:4:5:6:7:8:9']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
  })

  it('refuses a bracketed or zone-suffixed form of a blocked address', () => {
    expect(isPublicAddress('[::1]')).toBe(false)
    expect(isPublicAddress('fe80::1%eth0')).toBe(false)
  })

  it('refuses anything that is not an address at all', () => {
    // Reached only with a resolved address, so a hostname here means something upstream
    // went wrong; refusing is the safe answer to that.
    for (const s of ['', 'localhost', 'example.com', '127.0.0.1.evil.com', '999.1.1.1']) {
      expect(isPublicAddress(s), s).toBe(false)
    }
  })
})

describe('checkUrlShape', () => {
  it('accepts an ordinary HTTPS endpoint', () => {
    expect(checkUrlShape('https://hooks.example.com/safeops')).toBeNull()
    expect(checkUrlShape('https://example.com:8443/a/b?c=d')).toBeNull()
  })

  it('refuses plaintext', () => {
    // A webhook carries incident detail off the platform. Over HTTP that is on the wire
    // for anyone on the path, and the signature proves origin, not confidentiality.
    expect(checkUrlShape('http://hooks.example.com/x')).toBe('not_https')
  })

  it('refuses a URL that is not a URL', () => {
    expect(checkUrlShape('not a url')).toBe('bad_url')
    expect(checkUrlShape('https://')).toBe('bad_url')
  })

  it('refuses a literal private address before any DNS is involved', () => {
    for (const u of [
      'https://127.0.0.1/x',
      'https://10.0.0.1/x',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/x',
      'https://[::ffff:127.0.0.1]/x',
      'https://[::ffff:169.254.169.254]/latest/meta-data/',
    ]) {
      expect(checkUrlShape(u), u).toBe('private_address')
    }
  })

  it('lets a hostname through, because a name is judged on what it resolves to', () => {
    /*
     * `internal.example.com` may well point at 10.0.0.1, and this check cannot know that.
     * Blocking by name is the wrong instinct anyway - it is defeated by one DNS record -
     * so the real defence is resolving it and connecting only to an approved address. See
     * the `lookup` in webhookDelivery.ts.
     */
    expect(checkUrlShape('https://internal.example.com/x')).toBeNull()
  })
})
