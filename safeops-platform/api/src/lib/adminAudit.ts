import type { PrismaClient } from '@prisma/client'
import type { Caller } from './incidentService.js'

/**
 * The administrative audit trail.
 *
 * One writer, so every console mutation lands in the same immutable table with the same
 * fields. Extracted from AdminService when organisation administration needed to write to
 * it too - a second implementation is how half the actions end up without an actor.
 *
 * Never called with a password, a token, or an invitation secret. What goes in here is
 * read by auditors and exported.
 */
export interface AdminContext {
  ip?: string
  device?: string
}

export async function writeAdminAudit(
  db: PrismaClient,
  caller: Caller,
  companyId: string,
  ctx: AdminContext,
  action: string,
  module: string,
  target: string,
  oldValue?: string,
  newValue?: string,
) {
  const m = caller.roles.find((r) => r.companyId === companyId)
  await db.adminAuditEntry.create({
    data: {
      companyId,
      // The actor is taken from the verified session, never from the request body.
      actor: caller.name,
      actorRole: m?.role ?? '',
      action,
      module,
      target,
      ip: ctx.ip ?? '',
      device: ctx.device ?? '',
      oldValue,
      newValue,
    },
  })
}
