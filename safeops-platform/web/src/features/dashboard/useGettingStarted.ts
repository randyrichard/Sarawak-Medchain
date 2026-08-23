import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useOrg } from '@/features/org/OrgContext'
import type { GettingStartedProgress } from './components/GettingStarted'

const STORAGE_KEY = 'safeops.gettingStarted.hidden'

/**
 * How far a new workspace has got.
 *
 * Deliberately not read from the dashboard's own numbers, even though they are already
 * loaded. Those are scoped by the date range and site filter, so a step ticked on "last 30
 * days" would un-tick itself when somebody looked at last week - a checklist that changes
 * its mind is worse than none.
 *
 * These four questions are about whether a thing exists at all, so they are asked without
 * filters. Only asked while the checklist is still showing: once a workspace is set up, or
 * the card is dismissed, this does nothing on every subsequent dashboard load.
 */
export function useGettingStarted() {
  const { company, sites } = useOrg()
  const [hidden, setHidden] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1',
  )
  const [progress, setProgress] = useState<GettingStartedProgress | null>(null)

  useEffect(() => {
    if (hidden || !company) return
    let cancelled = false

    /*
     * Failures are swallowed on purpose. This is a helper card, not the dashboard: if one
     * of these calls fails the right outcome is no checklist, not an error banner covering
     * a page whose real content loaded perfectly well.
     */
    Promise.all([
      api.adminListUsers(company.id, {}).catch(() => []),
      api.listIncidents(company.id, {}).catch(() => []),
      api.listPermits(company.id, {}).catch(() => []),
    ]).then(([users, incidents, permits]) => {
      if (cancelled) return
      setProgress({
        /*
         * More than one site. Provisioning creates the first one, so "you have a site" is
         * true the moment a workspace exists and ticking it would be congratulating
         * somebody for something we did.
         */
        hasSites: sites.length > 1,
        /*
         * Likewise: the founding administrator is created with the workspace, so a second
         * account is what shows somebody actually invited their team.
         */
        hasPeople: users.length > 1,
        hasIncidents: incidents.length > 0,
        hasPermits: permits.length > 0,
      })
    })

    return () => { cancelled = true }
  }, [company, sites.length, hidden])

  const dismiss = () => {
    setHidden(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode: hidden for this tab only */ }
  }

  return { progress: hidden ? null : progress, dismiss }
}
