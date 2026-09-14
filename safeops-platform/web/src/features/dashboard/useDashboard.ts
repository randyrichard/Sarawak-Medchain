import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { dashboardApi, type DashboardOverview } from '@/api/dashboardApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'

/**
 * The dashboard's data and its filters.
 *
 * Filters live in the URL rather than in component state, so a refresh keeps what the
 * operator was looking at and a link to "Bintulu, last 7 days" is a link somebody can send.
 * Company and site come from the org switcher, which is where scope already lives - a
 * second site control on this page would let the two disagree.
 */

export interface DashboardFilterState {
  from: string | null
  to: string | null
  department: string | null
}

export function useDashboard() {
  const { company, project, site } = useOrg()
  const [params, setParams] = useSearchParams()

  const filters = useMemo<DashboardFilterState>(() => ({
    from: params.get('from'),
    to: params.get('to'),
    department: params.get('department'),
  }), [params])

  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Bumped by refresh(); the effect below watches it. */
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!company) {
      /*
       * No company means no request will ever be made, so the loading flag has to be
       * cleared here or it stays true forever - which is exactly what happened: a platform
       * administrator, who belongs to no company by design, landed on a dashboard of
       * twenty skeleton tiles that pulsed indefinitely. The page cannot show a useful
       * empty state while it still believes data is on the way.
       */
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    dashboardApi.overview({
      companyId: company.id,
      /*
       * Sent even when a site is also chosen. The server treats the site as the narrower
       * of the two and ignores the project then, but it still validates the id - so a
       * project from another tenant is refused rather than quietly dropped here.
       */
      projectId: project?.id ?? null,
      siteId: site?.id ?? null,
      department: filters.department,
      from: filters.from,
      to: filters.to,
    })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch((e) => {
        if (cancelled) return
        setLoading(false)
        /*
         * The error is shown rather than swallowed into an empty dashboard. A page of
         * zeroes that is actually a failed request is the worst outcome here: it reads as
         * "nothing needs attention".
         */
        setError(e instanceof ApiError ? e.message : 'Could not load the dashboard.')
      })

    return () => { cancelled = true }
  }, [company, project, site, filters.department, filters.from, filters.to, nonce])

  const setFilter = useCallback((patch: Partial<DashboardFilterState>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }, [params, setParams])

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(params)
    for (const k of ['from', 'to', 'department']) next.delete(k)
    setParams(next, { replace: true })
  }, [params, setParams])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return {
    data, loading, error, filters, setFilter, clearFilters, refresh,
    filtered: Boolean(filters.from || filters.to || filters.department),
  }
}
