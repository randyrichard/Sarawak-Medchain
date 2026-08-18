import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { api } from '@/api/client'
import type { Company, Membership, Role, Site } from '@/api/types'
import { useAuth } from '@/features/auth/AuthContext'
import { loadPreferences, takeFreshLogin } from '@/features/account/preferences'
import { can, type Capability } from '@/features/permissions/permissions'

// Active company + site scope. The user's role is PER COMPANY (memberships),
// so switching company can change what the entire app allows.

interface OrgValue {
  loading: boolean
  companies: Company[]
  company: Company | null
  sites: Site[]
  /** null = all sites the user can see in this company */
  site: Site | null
  membership: Membership | null
  role: Role | null
  allowed: (capability: Capability) => boolean
  switchCompany: (companyId: string) => void
  switchSite: (siteId: string | null) => void
}

const OrgContext = createContext<OrgValue | null>(null)
const ACTIVE_KEY = 'safeops.activeOrg'

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
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
      const restored = stored?.companyId === initial?.id ? (stored?.siteId ?? null) : null
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
    api.listSites(companyId).then((list) => {
      if (cancelled) return
      const membership = user.memberships.find((m) => m.companyId === companyId)
      const scoped = membership && membership.siteIds.length > 0
        ? list.filter((s) => membership.siteIds.includes(s.id))
        : list
      setSites(scoped)
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
    localStorage.setItem(`${ACTIVE_KEY}.${user.id}`, JSON.stringify({ companyId, siteId }))
  }, [user, companyId, siteId])

  const value = useMemo<OrgValue>(() => {
    const company = companies.find((c) => c.id === companyId) ?? null
    const site = sites.find((s) => s.id === siteId) ?? null
    const membership = user?.memberships.find((m) => m.companyId === companyId) ?? null
    const role = membership?.role ?? null
    return {
      loading,
      companies,
      company,
      sites,
      site,
      membership,
      role,
      allowed: (capability) => can(role, capability),
      switchCompany: (id) => {
        setCompanyId(id)
        setSiteId(null)
      },
      switchSite: (id) => setSiteId(id),
    }
  }, [companies, sites, companyId, siteId, user, loading])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

function safeParse(raw: string | null): { companyId?: string; siteId?: string | null } | null {
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
