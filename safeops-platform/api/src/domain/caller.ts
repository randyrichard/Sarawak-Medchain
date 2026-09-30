import type { Role } from '@prisma/client'
import type { DomainError } from './errors.js'

/**
 * Who is making a request - the verified identity every service acts on.
 *
 * Built from the signed access token (or an API key), never from the body, the query or a
 * header the client chose; see http/caller.ts. It lived in incidentService.ts, which made
 * every other module depend on the incident module just to know who was calling.
 */
export interface Caller {
  userId: string
  name: string
  roles: { companyId: string; role: Role; siteIds: string[] }[]
}

/** The caller's role in one workspace, and the sites it is restricted to (empty: all). */
export type Membership = Caller['roles'][number]

/**
 * The caller's membership of a workspace, or the module's own 403.
 *
 * Every service answers "you do not have access to this workspace" identically; only the
 * error class differs, so each module's refusal still names where it came from.
 */
export function membershipOf(
  caller: Caller,
  companyId: string,
  Err: new (code: string, message: string, status?: number) => DomainError,
): Membership {
  const m = caller.roles.find((r) => r.companyId === companyId)
  if (!m) throw new Err('forbidden', 'You do not have access to this workspace.', 403)
  return m
}
