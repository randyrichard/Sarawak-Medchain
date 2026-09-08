import { forgetPeople } from './people'
import { forgetDepartments } from './departments'
import { forgetPositions, forgetContractorCompanies } from './registers'

/**
 * Drops everything the org module remembers between components.
 *
 * These four caches are keyed by workspace, which was enough while a workspace meant one
 * answer. It does not: every one of them is filtered by the reader. The workforce register
 * is limited to the sites an account covers, the members list is role-guarded, and the
 * curated position and contractor registers are admin-guarded and fall back to whatever the
 * caller could actually read. So the cached answer belongs to a person, not to a company.
 *
 * Sign out and back in as somebody else in the same tab and the previous reader's lists
 * were still there - names from sites the new one cannot see, or an empty list held over
 * from a role that could not read them. Neither is visible as wrong; both are wrong.
 *
 * Called wherever the reader changes: signing in, signing out, and a session that changed
 * underneath the tab because another one signed in on the shared refresh cookie.
 */
export function forgetOrgCaches() {
  forgetPeople()
  forgetDepartments()
  forgetPositions()
  forgetContractorCompanies()
}
