import type { Prisma, PrismaClient } from '@prisma/client'
import type { Caller } from './incidentService.js'

/**
 * Who owns a corrective action.
 *
 * An action stores its owner twice: `owner`, the name as written when it was raised, and
 * `ownerId`, the account it belongs to. For a long time only the name was ever set, and
 * ownership was decided by comparing it with the caller's name. That breaks both ways in
 * a real workforce:
 *   - two people with the same name each saw, and could work, the other's actions;
 *   - a person whose account name differed by a word from what was typed - "Ahmad Ali"
 *     invited, "Ahmad bin Ali" chosen on accepting - lost their own actions.
 *
 * The account is now the owner wherever it is known. The name is the fallback only for an
 * action that is not linked to anybody - an owner who has no login, or a name that matched
 * nobody or more than one person - so nothing that was visible to its owner before is
 * hidden from them, and nothing linked to one person is visible to another who shares
 * their name.
 */

/** Actions the caller owns. Wrapped in AND so it composes with any OR a caller adds. */
export function ownedByWhere(caller: Caller): Prisma.CorrectiveActionWhereInput {
  return {
    AND: [{
      OR: [
        { ownerId: caller.userId },
        { ownerId: null, owner: caller.name },
      ],
    }],
  }
}

/** The same rule for a row already loaded. */
export function isOwnedBy(action: { owner: string; ownerId: string | null }, caller: Caller): boolean {
  return action.ownerId ? action.ownerId === caller.userId : action.owner === caller.name
}

type Db = PrismaClient | Prisma.TransactionClient

/**
 * The account an action being raised belongs to, or null.
 *
 * `hint` is an account the caller already knows is the owner (the employee record's own
 * login, the caller themselves). It is used only if that account is a member of the
 * workspace - an id from anywhere else is ignored rather than trusted.
 *
 * Otherwise the owner's name is looked up among the workspace's members, ignoring case and
 * surrounding spaces. Exactly one match links it. None, or more than one, leaves it
 * unlinked: guessing between two people called Muhammad Hafiz is precisely the mistake
 * this exists to stop, and an unlinked action still reaches its owner by name as before.
 */
export async function resolveOwnerId(
  db: Db, companyId: string, ownerName: string, hint?: string | null,
): Promise<string | null> {
  if (hint) {
    const member = await db.membership.findFirst({ where: { companyId, userId: hint }, select: { userId: true } })
    if (member) return member.userId
  }
  const name = ownerName.trim()
  if (!name) return null
  const matches = await db.membership.findMany({
    where: { companyId, user: { name: { equals: name, mode: 'insensitive' } } },
    select: { userId: true },
    take: 2,
  })
  return matches.length === 1 ? matches[0].userId : null
}
