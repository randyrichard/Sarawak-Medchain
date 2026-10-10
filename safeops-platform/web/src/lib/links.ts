import type { AssetFilters, AssetStatus } from '@/api/assets'
import type { CapaFilters } from '@/api/capa'
import type { IncidentStatusFilter } from '@/api/incidents'
import type { PermitFilters } from '@/api/permits'
import type { VisitorFilters } from '@/api/visitorsApi'

/**
 * Links into a page, written in that page's own words.
 *
 * Home's figures used to link to `/actions?due=overdue`, `/permits?status=awaiting`,
 * `/visitors?status=expected` and `/incidents/board?status=investigating` - and the pages
 * read `bucket`, `submitted`, `today` and `stage`. Every one of those opened the full,
 * unfiltered list, so the number somebody clicked was nowhere on the page they landed on.
 * Nothing failed loudly; the link simply did less than it said.
 *
 * Each builder takes the target page's own filter type, so a value that page does not
 * understand stops compiling instead of quietly showing everything.
 */

export type ActionBucket = NonNullable<CapaFilters['bucket']>
export type PermitStatusFilter = NonNullable<PermitFilters['status']>
export type AssetBucket = NonNullable<AssetFilters['bucket']>
export type VisitorStatusFilter = NonNullable<VisitorFilters['status']>

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** Asset statuses as they appear in a URL: `in_service` rather than `In+Service`. */
const ASSET_STATUS_PARAM: Record<AssetStatus, string> = {
  'In Service': 'in_service',
  'Under Maintenance': 'under_maintenance',
  'Out of Service': 'out_of_service',
  Retired: 'retired',
}

/** The asset status a `status` parameter names, or '' when it names none. */
export function assetStatusFromParam(value: string | null): AssetStatus | '' {
  const hit = Object.entries(ASSET_STATUS_PARAM).find(([, param]) => param === value)
  return hit ? (hit[0] as AssetStatus) : ''
}

export const linkTo = {
  incidents: (status?: IncidentStatusFilter) => withQuery('/incidents', { status }),
  action: (id: string) => withQuery('/actions', { open: id }),
  actions: (bucket?: ActionBucket) => withQuery('/actions', { bucket: bucket === 'all' ? undefined : bucket }),
  permit: (id: string) => withQuery('/permits', { open: id }),
  audit: (id: string) => withQuery('/audits', { open: id }),
  incident: (id: string) => `/incidents/${encodeURIComponent(id)}`,
  permits: (status?: PermitStatusFilter) => withQuery('/permits', { status }),
  asset: (id: string) => withQuery('/assets', { open: id }),
  assets: (filter: { bucket?: AssetBucket; status?: AssetStatus } = {}) =>
    withQuery('/assets', {
      bucket: filter.bucket === 'all' ? undefined : filter.bucket,
      status: filter.status ? ASSET_STATUS_PARAM[filter.status] : undefined,
    }),
  /**
   * The equipment board: what is unusable now and what lapses next, including calibration,
   * which the register's filters do not cover.
   */
  equipmentBoard: () => withQuery('/assets', { view: 'board' }),
  // The register is the view that can be filtered; the live board shows everyone on site.
  visitors: (status?: VisitorStatusFilter) =>
    withQuery('/visitors', status && status !== 'all' ? { view: 'register', status } : {}),
}

/**
 * The record a page has been asked to open, from any of the names it has been linked by.
 *
 * Search sends `?open=`, the scheduler's reminders were stored with `?permit=` and
 * `?asset=`, and printed asset labels carry `?qr=`. Stored reminders and printed labels
 * cannot be rewritten, so a page accepts every name rather than only the newest.
 */
export function openParam(params: URLSearchParams, ...aliases: string[]): string | null {
  for (const key of ['open', ...aliases]) {
    const value = params.get(key)
    if (value) return value
  }
  return null
}

/**
 * Where to go when a notification is clicked, or null to stay put.
 *
 * Only paths inside this app are followed. A notification's link is stored data, and a
 * value such as `https://elsewhere` or `//elsewhere` must not turn the bell into a way of
 * sending somebody off-site.
 *
 * Reminders for a corrective action were stored as `/actions/<id>?due=3`, a path no page
 * answers. That shape is kept on the server - it is how the scheduler tells one reminder
 * from the next - so it is translated here.
 */
export function notificationTarget(href: string | null | undefined): string | null {
  if (!href || !href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return null
  const action = href.match(/^\/actions\/([^/?#]+)/)
  if (action) return linkTo.action(decodeURIComponent(action[1]))
  return href
}
