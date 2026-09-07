import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { Caller } from './incidentService.js'

/**
 * Authenticating an API key.
 *
 * Keys were issued, hashed and displayed by the administration console from the day it
 * shipped, and nothing anywhere looked one up: `requireAuth` accepts a signed session JWT
 * and only that, so every `sk_live_...` ever generated authenticated exactly nothing. This
 * is the missing half.
 *
 * The two credentials cannot be confused for one another. A session token is an RS256 JWT
 * this service signed; a key is an opaque random string with a fixed prefix. Each entry
 * point accepts one kind and rejects the other, so no route can be reached with the wrong
 * sort of caller by accident.
 */

/** Fixed, and the same string `createApiKey` mints with. */
export const API_KEY_PREFIX = 'sk_live_'

/** Matches ApiKey.tokenHash, which is what `createApiKey` stored. */
export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export interface ApiPrincipal {
  keyId: string
  companyId: string
  /** The key's name, used wherever a service records who did something. */
  name: string
  scopes: string[]
  caller: Caller
}

export type ApiKeyFailure =
  | 'malformed'
  | 'unknown'
  | 'revoked'
  | 'company_suspended'

/**
 * The role an API key acts as, and why it is this one.
 *
 * `ceo` is the read-widest role that is *not* a review role, and both halves of that
 * matter:
 *
 *   - Widest: `incidentScopeWhere` and `actionScopeWhere` return an empty filter for it,
 *     so a key sees the whole workspace rather than one site. An integration that silently
 *     returned a subset would be worse than one that returned nothing.
 *   - Not a review role: `maskAnonymous` withholds the reporter from everyone outside
 *     `['admin', 'hse_manager']`. Somebody who files an anonymous report is promised their
 *     name stays inside the HSE function; a bearer token sitting in another system's
 *     configuration is not the HSE function, and a key must never be the thing that
 *     quietly breaks that promise.
 *
 * `admin` was the obvious choice and is the wrong one twice over: it unmasks reporters and
 * it is the role every administration guard checks for.
 */
const API_KEY_ROLE = 'ceo'

/**
 * Resolves a presented secret to a principal, or says why not.
 *
 * The lookup is an indexed equality on the SHA-256 digest. There is no comparison to make
 * constant-time: nothing is compared in this process, and the secret carries 192 bits of
 * entropy, so the only attack against it is a search of that space.
 */
export async function authenticateApiKey(
  db: PrismaClient, presented: string,
): Promise<{ principal: ApiPrincipal } | { failure: ApiKeyFailure }> {
  if (!presented.startsWith(API_KEY_PREFIX) || presented.length < 24) {
    return { failure: 'malformed' }
  }

  const key = await db.apiKey.findUnique({
    where: { tokenHash: hashApiKey(presented) },
    select: {
      id: true,
      companyId: true,
      name: true,
      scopes: true,
      revoked: true,
      company: { select: { status: true } },
    },
  })
  if (!key) return { failure: 'unknown' }
  if (key.revoked) return { failure: 'revoked' }
  /*
   * A suspended tenant is suspended for its integrations too.
   *
   * Otherwise suspending a customer in the platform console would close the browser door
   * and leave the programmatic one open, which is the kind of gap that only ever shows up
   * when it matters.
   */
  if (key.company.status !== 'active') return { failure: 'company_suspended' }

  return {
    principal: {
      keyId: key.id,
      companyId: key.companyId,
      name: key.name,
      scopes: key.scopes,
      caller: {
        // Namespaced so it can never collide with a real user id, and so anything that
        // records it - an incident's reporterId, an audit entry - reads as what it is.
        userId: `apikey:${key.id}`,
        name: `API key: ${key.name}`,
        roles: [{ companyId: key.companyId, role: API_KEY_ROLE as never, siteIds: [] }],
      },
    },
  }
}

/**
 * The scope an HTTP method needs.
 *
 * Method-derived rather than declared per route, because the failure mode of declaring it
 * per route is a new endpoint added without one - and a missing declaration would read as
 * "no scope required". Here a new route is covered the moment it is mounted.
 */
export function scopeForMethod(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
      return 'view'
    case 'POST':
      return 'create'
    case 'PUT':
    case 'PATCH':
      return 'edit'
    case 'DELETE':
      return 'delete'
    default:
      // An unmapped method asks for a scope no key can hold, so it is refused rather than
      // waved through by a permissive default.
      return '__unmapped__'
  }
}

export function hasScope(principal: ApiPrincipal, scope: string): boolean {
  return principal.scopes.includes(scope)
}
