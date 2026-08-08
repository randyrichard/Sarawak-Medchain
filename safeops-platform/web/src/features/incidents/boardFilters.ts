/**
 * The incident board's filter state, and how it maps to and from the URL.
 *
 * Extracted from the page so it can be tested without a DOM. This is where the board's
 * real bugs live: a filter change that forgets to reset the page shows an empty board and
 * reads as "no incidents"; a default written into the URL makes every link noisy and the
 * "clear filters" count wrong; a tri-state flattened to a boolean silently turns "either"
 * into "no". None of that is visible in a screenshot.
 */

export const SORT_KEYS = [
  'priority', 'newest', 'oldest', 'severity', 'updated', 'site', 'type', 'status',
] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const SORT_LABEL: Record<SortKey, string> = {
  priority: 'Most urgent first',
  newest: 'Newest',
  oldest: 'Oldest',
  severity: 'Highest severity',
  updated: 'Recently updated',
  site: 'Site',
  type: 'Type',
  status: 'Status',
}

/** The default sort. Omitted from the URL, so a bare board link stays clean. */
export const DEFAULT_SORT: SortKey = 'priority'

export interface BoardFilters {
  q: string
  type: string
  severity: string
  stage: string
  siteId: string
  department: string
  investigator: string
  from: string
  to: string
  shift: string
  /** Tri-state as a string: '' means either, which is not the same as 'false'. */
  anonymous: string
  emergencyResponse: string
  sort: SortKey
  page: number
}

export const EMPTY_FILTERS: BoardFilters = {
  q: '', type: '', severity: '', stage: '', siteId: '', department: '',
  investigator: '', from: '', to: '', shift: '', anonymous: '',
  emergencyResponse: '', sort: DEFAULT_SORT, page: 1,
}

/** Everything except sort and page — those are how you look, not what you asked for. */
const FILTER_FIELDS = [
  'q', 'type', 'severity', 'stage', 'siteId', 'department',
  'investigator', 'from', 'to', 'shift', 'anonymous', 'emergencyResponse',
] as const

export function parseFilters(params: URLSearchParams): BoardFilters {
  const str = (k: string) => params.get(k) ?? ''
  const sort = params.get('sort')
  const page = Number(params.get('page') ?? 1)

  return {
    q: str('q'),
    type: str('type'),
    severity: str('severity'),
    stage: str('stage'),
    siteId: str('siteId'),
    department: str('department'),
    investigator: str('investigator'),
    from: str('from'),
    to: str('to'),
    shift: str('shift'),
    anonymous: str('anonymous'),
    emergencyResponse: str('emergencyResponse'),
    // An unrecognised sort falls back rather than being passed through: the server
    // validates it too, but a bad link should show a board, not an error.
    sort: (SORT_KEYS as readonly string[]).includes(sort ?? '') ? (sort as SortKey) : DEFAULT_SORT,
    // A missing, zero or negative page is page one. Page 0 would ask the server for a
    // negative offset.
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
  }
}

/**
 * Serialise back to the URL, omitting anything at its default.
 *
 * Defaults are left out so a shared link carries only what was actually chosen, and so the
 * active-filter count means something.
 */
export function toSearchParams(f: BoardFilters): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v === '' || v === undefined || v === null) continue
    if (k === 'sort' && v === DEFAULT_SORT) continue
    if (k === 'page' && v === 1) continue
    p.set(k, String(v))
  }
  return p
}

/**
 * Apply a change.
 *
 * Any change to what is being asked for resets to page one. Staying on page 4 of a result
 * set that now has one page shows an empty board, which reads as "there are no incidents"
 * - the most dangerous wrong answer this screen can give. Changing the page itself, or
 * only the sort, does not reset.
 */
export function applyChange(current: BoardFilters, next: Partial<BoardFilters>): BoardFilters {
  const merged = { ...current, ...next }
  const changedAFilter = FILTER_FIELDS.some((k) => k in next && next[k] !== current[k])
  if (changedAFilter) merged.page = 1
  return merged
}

/** How many filters are actually narrowing the board. Sort and page are not filters. */
export function activeFilterCount(f: BoardFilters): number {
  return FILTER_FIELDS.filter((k) => f[k] !== '').length
}

/** The query the API is asked for. Blank strings become undefined, not empty filters. */
export function toQuery(f: BoardFilters, pageSize: number) {
  const opt = (v: string) => (v === '' ? undefined : v)
  return {
    page: f.page,
    pageSize,
    sort: f.sort,
    q: opt(f.q),
    type: opt(f.type),
    severity: opt(f.severity),
    stage: opt(f.stage),
    siteId: opt(f.siteId),
    department: opt(f.department),
    investigator: opt(f.investigator),
    from: opt(f.from),
    to: opt(f.to),
    shift: opt(f.shift),
    anonymous: opt(f.anonymous) as 'true' | 'false' | undefined,
    emergencyResponse: opt(f.emergencyResponse) as 'true' | 'false' | undefined,
  }
}

/** Severities the board counts as high. Mirrors the server's lost-time-and-above set. */
export const HIGH_SEVERITIES = [
  'fatality', 'catastrophic', 'Critical', 'environmental_major', 'lost_time_injury',
]

export const highSeverityCount = (bySeverity: { name: string; value: number }[]) =>
  bySeverity.filter((s) => HIGH_SEVERITIES.includes(s.name)).reduce((a, b) => a + b.value, 0)
