import type { Prisma } from '@prisma/client'
import type { Caller } from './caller.js'
import { todayDate } from './businessDay.js'

/**
 * Row-level access: which incidents and corrective actions a caller may see.
 *
 * Tenant isolation is checked by every service (membershipOf). These are the rules one
 * level down - inside a workspace the caller belongs to - and they are shared on purpose:
 * the register, the dashboard, search, the site comparison and the reports must apply the
 * same scope, or the wider number on one screen is the one that leaks. They lived in
 * incidentService.ts, so every module that needed them depended on the incident module.
 */

/**
 * Which incidents a caller may see.
 *
 * Exported so the dashboard applies exactly the same row scope the register does. Without
 * it an employee's dashboard would total every incident in the company while the list one
 * click away showed only their own - and the wider number is the one that leaks.
 */
export function incidentScopeWhere(caller: Caller, companyId: string): Prisma.IncidentWhereInput {
  const m = caller.roles.find((r) => r.companyId === companyId)
  if (!m) return { id: '__no_access__' }
  if (['admin', 'hse_manager', 'ceo'].includes(m.role)) return {}
  if (m.role === 'safety_officer' || m.role === 'supervisor') {
    return m.siteIds.length > 0 ? { siteId: { in: m.siteIds } } : {}
  }
  // employee
  return { reporterId: caller.userId }
}

/**
 * Which corrective actions a caller may see.
 *
 * Mirrors the incident register's stats: an employee or supervisor sees the actions they
 * own, not the company's whole backlog.
 */
export function actionScopeWhere(caller: Caller, companyId: string): Prisma.CorrectiveActionWhereInput {
  const m = caller.roles.find((r) => r.companyId === companyId)
  if (!m) return { id: '__no_access__' }
  return ['employee', 'supervisor'].includes(m.role) ? ownedByWhere(caller) : {}
}

/**
 * Who owns a corrective action.
 *
 * An action stores its owner twice: `owner`, the name as written when it was raised, and
 * `ownerId`, the account it belongs to. The account decides wherever it is known; the name
 * is the fallback only for an action not linked to anybody - an owner with no login, or a
 * name that matched nobody or more than one person. Linking happens when an action is
 * raised (lib/actionOwner.ts, resolveOwnerId).
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

/**
 * Today at UTC midnight - the boundary an action's due date is measured against.
 *
 * Due dates are date-only, stored at UTC midnight. Comparing them with `now` makes
 * everything due today overdue from one second past midnight, which is why the Overdue
 * chip and the Overdue list disagreed by exactly the actions due today.
 */
export function startOfToday(): Date {
  // Today's *local* date (APP_TIMEZONE): at UTC midnight that was 08:00 in Malaysia, and
  // an action due today was not yet due until eight in the morning.
  return todayDate()
}

/**
 * What counts as an overdue corrective action.
 *
 * One definition, so the register, the board count and the scheduled report all mean the
 * same thing by "overdue". Completed, verified and cancelled actions are excluded - an
 * action closed last week is not overdue, and a report that says otherwise is the fastest
 * way to lose a reader's trust. Measured against UTC midnight so an action due today is
 * not overdue for the whole of today.
 */
export function overdueActionWhere(): Prisma.CorrectiveActionWhereInput {
  return {
    dueDate: { lt: startOfToday() },
    status: { in: ['open', 'in_progress'] },
  }
}
