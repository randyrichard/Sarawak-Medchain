import { request, qs } from './http'

/**
 * The signed-in person's own account and the global search.
 *
 * Both are session-scoped: no call here takes a user id, and search takes only the
 * workspace the caller is already looking at.
 */

export const LANDING_PAGES = [
  '/', '/incidents', '/actions', '/permits', '/assets', '/audits', '/training',
] as const
export type LandingPage = (typeof LANDING_PAGES)[number]

/** Labels for the preference picker. Keyed by route so they cannot drift apart. */
export const LANDING_PAGE_LABEL: Record<LandingPage, string> = {
  '/': 'Home',
  '/incidents': 'Incidents',
  '/actions': 'Corrective Actions',
  '/permits': 'Permits to Work',
  '/assets': 'Assets & Inspections',
  '/audits': 'Audits & Compliance',
  '/training': 'Training & Competency',
}

export interface UserPreferences {
  landingPage: LandingPage
  defaultSiteId: string | null
}

export type SearchKind =
  | 'incident' | 'action' | 'permit' | 'asset' | 'audit' | 'certificate'
  | 'employee' | 'user' | 'company' | 'auditlog'
  | 'contractor' | 'contractorWorker' | 'visitor'

export interface SearchHit {
  kind: SearchKind
  id: string
  code: string
  title: string
  detail: string
  href: string
}

export const accountApi = {
  getPreferences(): Promise<UserPreferences> {
    return request<UserPreferences>('/account/preferences')
  },

  updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
    return request<UserPreferences>('/account/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  /**
   * Returns how many *other* sessions were ended. The current browser stays signed in —
   * the server spares this session's token family deliberately.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<{ revokedSessions: number }> {
    return request<{ revokedSessions: number }>('/account/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  },
}

export const searchApi = {
  search(companyId: string, q: string): Promise<SearchHit[]> {
    return request<{ hits: SearchHit[] }>(`/search?${qs({ companyId, q })}`)
      .then((r) => r.hits)
  },
}
