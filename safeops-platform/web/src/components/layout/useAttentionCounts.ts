import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '@/api/client'
import type { AttentionCounts } from '@/api/dashboardApi'
import { useActor } from '@/features/incidents/lib'
import { useOrg } from '@/features/org/OrgContext'
import { pollWhileVisible } from '@/lib/poll'
import { onRefresh } from '@/lib/refreshSignal'

/**
 * How many items Needs Attention holds for each module, for the menu.
 *
 * The scope is Home's: the company, project and site in view. Read again on every move to
 * another page - so a count follows the work just done - and once a minute while the page
 * is visible. A refresh that fails keeps the numbers already shown: a count that could not
 * be read is not a count of nothing.
 */
export function useAttentionCounts(): AttentionCounts | null {
  const { company, project, site } = useOrg()
  const actor = useActor()
  const { pathname } = useLocation()
  const [counts, setCounts] = useState<AttentionCounts | null>(null)

  // Another workspace or site: its counts, not the last one's, even for the moment it takes.
  useEffect(() => { setCounts(null) }, [company?.id, project?.id, site?.id])

  useEffect(() => {
    if (!company) {
      setCounts(null)
      return
    }
    let live = true
    const load = () => api
      .attentionCounts({ companyId: company.id, projectId: project?.id ?? null, siteId: site?.id ?? null }, actor)
      .then((c) => { if (live) setCounts(c) })
      .catch(() => {})
    load()
    const stop = pollWhileVisible(load, 60_000)
    // And at once when somebody presses Refresh, so the menu agrees with the page.
    const off = onRefresh(load)
    return () => { live = false; stop(); off() }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the actor is rebuilt each render; who it is is its name and role
  }, [company, project, site, pathname, actor.name, actor.role])

  return counts
}
