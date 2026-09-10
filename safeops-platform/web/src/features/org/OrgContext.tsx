import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { api } from '@/api/client'
import type { Company, Membership, Role, Site } from '@/api/types'
import type { AdminProject } from '@/api/orgAdminApi'
import { useAuth } from '@/features/auth/AuthContext'
import { loadPreferences, takeFreshLogin } from '@/features/account/preferences'
import { can, type Capability } from '@/features/permissions/permissions'

// Active company + site scope. The user's role is PER COMPANY (memberships),
// so switching company can change what the entire app allows.

interface OrgValue {
  loading: boolean
  companies: Company[]
  company: Company | null
  /**
   * Projects in this company, or empty when the workspace has none.
   *
   * Empty is a normal state, not a gap - projects arrived long after sites, and a customer
   * who has not adopted them keeps every site and every record. The picker hides itself
   * rather than showing an empty control nobody can use.
   */
  projects: AdminProject[]
  /** null = every project, and the sites under none of them */
  project: AdminProject | null
  /**
   * Sites the reader may see, narrowed to the selected project when there is one.
   *
   * Narrowed, never widened: this starts from the membership's own site scope, so choosing
   * a project can only ever remove sites from the list. A project filter is a convenience,
   * not a grant.
   */
  sites: Site[]
  /** null = all sites the user can see in this company */
  site: Site | null
  membership: Membership | null
  role: Role | null
  allowed: (capability: Capability) => boolean
  switchCompany: (companyId: string) => void
  switchProject: (projectId: string | null) => void
  switchSite: (siteId: string | null) => void
}

const OrgContext = createContext<OrgValue | null>(null)
const ACTIVE_KEY = 'safeops.activeOrg'

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load companies when the user changes
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    // Driven by the user's memberships rather than a fixture lookup by id: in backend
    // mode the id is issued by the server and does not exist in the mock user list.
    Promise.all([
      api.listCompaniesByIds(user.memberships.map((m) => m.companyId)),
      loadPreferences(),
    ]).then(([list, prefs]) => {
      if (cancelled) return
      setCompanies(list)
      const stored = safeParse(localStorage.getItem(`${ACTIVE_KEY}.${user.id}`))
      const initial = list.find((c) => c.id === stored?.companyId) ?? list[0] ?? null
      setCompanyId(initial?.id ?? null)
      // A fresh sign-in starts at the user's default site; a reload keeps whatever site
      // they switched to. The site effect below validates the id against what they may see.
      const sameCompany = stored?.companyId === initial?.id
      const restored = sameCompany ? (stored?.siteId ?? null) : null
      setProjectId(sameCompany ? (stored?.projectId ?? null) : null)
      setSiteId(takeFreshLogin() ? prefs.defaultSiteId : restored)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  /*
   * Load sites when company changes; restrict to membership site scope.
   *
   * This effect is also where `loading` is cleared, which is why the early return below
   * has to clear it too. With no company there are no sites to fetch, so this returned
   * immediately and left `loading` true for the rest of the session - and a context that
   * says "still loading" forever means every consumer waits forever. A platform
   * administrator, who belongs to no company by design, saw a dashboard of skeleton tiles
   * that never resolved because of this line.
   */
  useEffect(() => {
    if (!user) return
    if (!companyId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    /*
     * Both halves, independently. A workspace with no projects - which is every existing
     * one - must not have its site list held up or emptied by the project call, so a
     * failure there costs the project picker and nothing else.
     */
    Promise.all([
      api.listSites(companyId),
      api.listProjects(companyId).catch(() => [] as AdminProject[]),
    ]).then(([list, projectList]) => {
      if (cancelled) return
      const membership = user.memberships.find((m) => m.companyId === companyId)
      const scoped = membership && membership.siteIds.length > 0
        ? list.filter((s) => membership.siteIds.includes(s.id))
        : list
      setSites(scoped)
      /*
       * Cancelled projects are dropped from the picker but not from history: a report for
       * a finished job still resolves its name through `projects` only while it is live,
       * and through the record itself afterwards. Keeping them here would grow the picker
       * forever with jobs nobody is working on.
       */
      setProjects(projectList.filter((p) => p.status !== 'cancelled'))
      setProjectId((cur) => (cur && projectList.some((p) => p.id === cur) ? cur : null))
      setSiteId((cur) => (cur && scoped.some((s) => s.id === cur) ? cur : scoped.length === 1 ? scoped[0].id : null))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [user, companyId])

  // Persist selection per user
  useEffect(() => {
    if (!user || !companyId) return
    localStorage.setItem(
      `${ACTIVE_KEY}.${user.id}`, JSON.stringify({ companyId, projectId, siteId }),
    )
  }, [user, companyId, projectId, siteId])

  const value = useMemo<OrgValue>(() => {
    const company = companies.find((c) => c.id === companyId) ?? null
    const project = projects.find((p) => p.id === projectId) ?? null
    const membership = user?.memberships.find((m) => m.companyId === companyId) ?? null
    const role = membership?.role ?? null

    /*
     * The project narrows the site list, and only ever narrows it. `sites` is already the
     * membership's scope, so intersecting with the project's sites cannot hand anybody a
     * site they could not otherwise see - which is what keeps this a filter rather than a
     * second, weaker permission system.
     */
    const inProject = new Set(project?.sites.map((x) => x.id) ?? [])
    const visibleSites = project ? sites.filter((s) => inProject.has(s.id)) : sites
    const site = visibleSites.find((s) => s.id === siteId) ?? null

    return {
      loading,
      companies,
      company,
      projects,
      project,
      sites: visibleSites,
      site,
      membership,
      role,
      allowed: (capability) => can(role, capability),
      switchCompany: (id) => {
        setCompanyId(id)
        setProjectId(null)
        setSiteId(null)
      },
      /*
       * Changing project clears the site. Keeping it would leave a site selected that the
       * new project does not contain, so the header would name one scope while the data
       * came from another.
       */
      switchProject: (id) => {
        setProjectId(id)
        setSiteId(null)
      },
      switchSite: (id) => setSiteId(id),
    }
  }, [companies, projects, sites, companyId, projectId, siteId, user, loading])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

function safeParse(
  raw: string | null,
): { companyId?: string; projectId?: string | null; siteId?: string | null } | null {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function useOrg(): OrgValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>')
  return ctx
}

/**
 * The sites this account is limited to, by name. Empty means organisation-wide.
 *
 * `sites` is already filtered to the membership's scope, so the names are simply what the
 * reader can see - what makes it a *restriction* is siteIds being set at all. Both halves
 * are needed: an unscoped account also has sites, and saying "nobody at these sites" to
 * somebody who can see all of them would be noise.
 */
export function useSiteScope(): string[] {
  const { membership, sites } = useOrg()
  return membership && membership.siteIds.length > 0 ? sites.map((s) => s.name) : []
}
