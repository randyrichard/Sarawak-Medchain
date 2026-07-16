import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { DashboardData } from '@/api/dashboard'
import { useOrg } from '@/features/org/OrgContext'

/** Fetches the scoped Mission Control payload; refetches when scope changes. */
export function useDashboard(): { loading: boolean; data: DashboardData | null } {
  const { company, site } = useOrg()
  const [state, setState] = useState<{ loading: boolean; data: DashboardData | null }>({
    loading: true,
    data: null,
  })

  useEffect(() => {
    if (!company) return
    let cancelled = false
    setState({ loading: true, data: null })
    const scopeLabel = site ? site.name : `${company.name} · all sites`
    api.getDashboard(company.id, site?.id ?? null, scopeLabel).then((data) => {
      if (!cancelled) setState({ loading: false, data })
    })
    return () => {
      cancelled = true
    }
  }, [company, site])

  return state
}
