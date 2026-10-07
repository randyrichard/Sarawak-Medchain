import type { Role } from '@/api/types'
import { employeesApi } from '@/api/employeesApi'
import { reportsApi } from '@/api/reportsApi'
import { drainRows } from '@/api/paging'
import { isBackendConfigured } from '@/api/authApi'
import { EMPLOYEES, USERS } from '@/api/mock/fixtures'

/**
 * Who can be named as an owner, a reviewer, an inspector, or @-mentioned.
 *
 * Every people-picker in the product read this from `@/api/mock/fixtures`, and those
 * fixtures are compiled out of a production build - `INCLUDE` is `import.meta.env.DEV ||
 * VITE_DEMO_LOGINS === 'true'`, and neither is set on a real deployment. So on the
 * deployment every list was empty, and because Owner is a required field, a corrective
 * action could not be created at all. Fourteen components were affected: actions, assets,
 * audits, permits, training and incident comments. In development it all worked, which is
 * exactly why it survived.
 *
 * Two sources, unioned, because that is what the fixture version meant by "people":
 *
 *   - The workforce register, which is who actually does the work. Guarded only by
 *     membership, so anyone who can open these screens can read it.
 *   - Workspace members, because plenty of people who own an action - the HSE manager, a
 *     site engineer - hold a login without a row in the register. This list is role-
 *     guarded, and a caller who may not read it is not an error: their picker simply
 *     offers the register, which is the larger and more relevant half.
 *
 * The mock path is untouched. A credential-free demo has no API to ask, and it stays
 * exactly as it was.
 */

/** Resolved lists, per workspace. A picker opening should not re-fetch what is known. */
const cache = new Map<string, string[]>()
/**
 * In-flight requests, per workspace.
 *
 * Four of these components can be mounted at once - the actions page, its table, a drawer
 * and a dialog - and each calls the hook. Without this they would issue four identical
 * requests on every visit.
 */
const inFlight = new Map<string, Promise<string[]>>()

/** The demo's answer, which is the whole answer when there is no API. */
export function fixturePeople(companyId: string): string[] {
  return [
    ...new Set([
      ...USERS.filter((u) => u.memberships.some((m) => m.companyId === companyId)).map((u) => u.name),
      ...EMPLOYEES.filter((e) => e.companyId === companyId).map((e) => e.name),
    ]),
  ].sort()
}

/**
 * Roles the member list answers for. Mirrors REPORT_ROLES in api/src/lib/reportService.ts:
 * the list is the report-schedule recipients, which only those roles may manage.
 *
 * Anyone else was refused with a 403 every time a picker opened - harmless, because the
 * refusal is caught below, but a request that can never succeed and an error in the
 * console of every supervisor's and employee's phone.
 */
const MEMBER_LIST_ROLES: Role[] = ['admin', 'hse_manager', 'safety_officer', 'ceo']

async function fetchPeople(companyId: string, withMembers: boolean): Promise<string[]> {
  const [employees, members] = await Promise.all([
    /*
     * Drained rather than one page. The register is the one list that grows with headcount
     * instead of with activity, and a picker that silently stops at the first twenty-five
     * names is worse than an empty one: the name somebody is looking for is missing and
     * nothing says so. `drainRows` bounds the walk, so a very large workforce is capped
     * rather than fetched forever.
     */
    drainRows((page, pageSize) =>
      employeesApi.list(companyId, { page, pageSize, status: 'active' })),
    /*
     * Members are best-effort. The endpoint is role-guarded, so a supervisor reading an
     * action drawer gets a 403 here - which is not a failure of the picker, and must not
     * empty it. Anything else that goes wrong is treated the same way, because a people
     * list that throws takes the whole dialog down with it.
     */
    withMembers ? reportsApi.recipients(companyId).catch(() => []) : Promise.resolve([]),
  ])

  return [
    ...new Set([
      ...employees.map((e) => e.name),
      ...members.map((m) => m.name),
    ]),
  ]
    .filter((n) => n.trim())
    .sort((a, b) => a.localeCompare(b))
}

/**
 * The people for a workspace, fetched once and shared.
 *
 * Rejections are not cached: a picker that failed once because the network blinked should
 * work on the next visit rather than stay empty for the session.
 */
export function loadPeople(companyId: string, role?: Role | null): Promise<string[]> {
  if (!companyId) return Promise.resolve([])
  if (!isBackendConfigured()) return Promise.resolve(fixturePeople(companyId))

  // An unknown role still asks: the refusal is handled, and a missing name is worse.
  const withMembers = !role || MEMBER_LIST_ROLES.includes(role)
  const key = withMembers ? companyId : `${companyId}|register`

  const known = cache.get(key)
  if (known) return Promise.resolve(known)

  const pending = inFlight.get(key)
  if (pending) return pending

  const request = fetchPeople(companyId, withMembers)
    .then((names) => {
      cache.set(key, names)
      return names
    })
    .finally(() => inFlight.delete(key))

  inFlight.set(key, request)
  return request
}

/**
 * Drops what is remembered, so a newly added employee appears without a reload.
 *
 * Called after anything that changes the workforce. Without it, hiring somebody and then
 * assigning them an action in the same session offers a list that does not include them.
 */
export function forgetPeople(companyId?: string) {
  if (companyId) { cache.delete(companyId); cache.delete(`${companyId}|register`) }
  else cache.clear()
}
