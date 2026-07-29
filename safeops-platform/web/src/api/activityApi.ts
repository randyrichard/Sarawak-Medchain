import { request, qs } from './http'
import type { ActivityEvent } from './types'
import type { TimelineEvent, TimelineKind } from './dashboard'

/**
 * HTTP client for the activity feed.
 *
 * The feed is not a stored list: the server merges the append-only trails each module
 * already keeps. So this reads what actually happened rather than a curated fixture that
 * could describe records the database does not contain.
 */

interface ServerActivity {
  id: string
  at: string
  kind: TimelineKind
  actor: string
  text: string
  target: string
  siteId: string | null
}

export const activityApi = {
  async list(companyId: string, siteId?: string | null): Promise<ServerActivity[]> {
    return request<ServerActivity[]>(`/activity?${qs({ companyId, siteId: siteId ?? undefined })}`)
  },

  /** Mission Control's timeline shape. */
  async timeline(companyId: string, siteId?: string | null): Promise<TimelineEvent[]> {
    const rows = await this.list(companyId, siteId)
    return rows.map((r) => ({
      id: r.id, at: r.at, kind: r.kind, actor: r.actor, text: r.text, target: r.target,
    }))
  },

  /** The shell's simpler shape, where the verb and object are one line. */
  async events(companyId: string, siteId?: string | null): Promise<ActivityEvent[]> {
    const rows = await this.list(companyId, siteId)
    return rows.map((r) => ({ id: r.id, actor: r.actor, verb: r.text, target: r.target, at: r.at }))
  },
}
