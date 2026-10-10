import type { Capability } from '@/features/permissions/permissions'

/**
 * Sidebar sections - Hick's law.
 *
 * An administrator saw seventeen items in one flat column. With nothing to separate them
 * the column is read top to bottom every time, and the time to find "Training" grows with
 * everything above it. Five small labelled groups turn that into two quick choices - which
 * area, then which page - and give the eye landmarks to jump to. Each group holds at most
 * four, the size people take in at a glance.
 *
 * The everyday items (home, report a near miss, notifications) have no heading and stay at
 * the top: they are what most people open most often, and the cheapest choice is the one
 * already in front of you.
 */
type NavGroup = 'Incidents' | 'Operations' | 'People' | 'Assurance' | 'Workspace'
export const NAV_GROUPS: NavGroup[] = ['Incidents', 'Operations', 'People', 'Assurance', 'Workspace']

/**
 * Below this many visible items the sidebar stays one flat list. A worker who can open four
 * pages gains nothing from four headings over them - grouping pays only once the list is
 * long enough to need scanning.
 */
export const GROUP_NAV_ABOVE = 7

export interface NavItem {
  to: string
  label: string
  /** The section it sits under. None: the everyday items at the top. */
  group?: NavGroup
  capability: Capability
  /** future-sprint modules render locked, communicating the roadmap */
  locked?: string
  end?: boolean
  /**
   * Sub-paths that belong to a different nav item.
   *
   * NavLink matches by prefix, so "/incidents" lit up on "/incidents/board" and both rows
   * highlighted at once - reported exactly that way. Plain `end` is the wrong cure: it
   * would also stop "Incidents" highlighting on "/incidents/INC-2601", which genuinely is
   * part of that section. Only the paths that have their own nav row are excluded.
   */
  notFor?: string[]
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', capability: 'dashboard:view', end: true },
  // Near-miss capture sits in the nav because under-reporting is driven by friction and
  // forgetting (customer research P1) — it has to be one tap from anywhere.
  { to: '/near-miss', label: 'Report a near miss', capability: 'reports:submit' },
  // Everyone gets told what needs them.
  { to: '/notifications', label: 'Notifications', capability: 'dashboard:view' },
  /*
   * Each item asks for the capability it actually needs.
   *
   * Thirteen of these were gated on `dashboard:view`, which every role holds, so an
   * employee was shown the contractor register, the workforce list, audits, training and
   * tenant-wide reports. Nothing leaked - the API refused every write, and medical detail
   * is redacted server-side - but the menu promised a product that was not theirs, and a
   * worker who opens a screen full of things they cannot use stops opening it.
   *
   * Incidents deliberately asks for `:view`, not `:manage`. Reporting one is everybody's
   * job; triaging it is not, and the difference belongs in the page rather than the menu.
   */
  { to: '/incidents', label: 'Incidents', capability: 'incidents:view', notFor: ['/incidents/board'], group: 'Incidents' },
  { to: '/incidents/board', label: 'Incident board', capability: 'incidents:view', group: 'Incidents' },
  { to: '/actions', label: 'Corrective actions', capability: 'actions:view', group: 'Incidents' },
  { to: '/assets', label: 'Assets & inspections', capability: 'equipment:view', group: 'Operations' },
  { to: '/permits', label: 'Permits to work', capability: 'permits:view', group: 'Operations' },
  { to: '/visitors', label: 'Visitors', capability: 'visitors:view', group: 'Operations' },
  { to: '/toolbox', label: 'Toolbox meetings', capability: 'toolbox:view', group: 'Operations' },
  { to: '/performance', label: 'HSE performance', capability: 'analytics:view', group: 'Assurance' },
  { to: '/reports', label: 'Reports', capability: 'reports:view', group: 'Assurance' },
  { to: '/audits', label: 'Audits & compliance', capability: 'compliance:manage', group: 'Assurance' },
  { to: '/training', label: 'Training & competency', capability: 'training:view', group: 'People' },
  { to: '/employees', label: 'Employees', capability: 'workforce:view', group: 'People' },
  { to: '/contractors', label: 'Contractors', capability: 'workforce:view', group: 'People' },
  { to: '/organization', label: 'Organization', capability: 'org:view', group: 'Workspace' },
  { to: '/admin', label: 'Administration', capability: 'settings:manage', group: 'Workspace' },
]

/**
 * The capability the page at `href` asks for, or null for a page every member can open.
 *
 * Read from this table rather than restated: the longest menu path that contains `href`
 * owns it, so `/actions?open=…` asks for what Corrective actions asks for. Used to decide
 * whether a notification can be a link for the person reading it - every reminder is sent
 * to the whole workspace, and a link that ends in "you don't have access" is worse than
 * none.
 */
export function capabilityFor(href: string): Capability | null {
  const path = href.split(/[?#]/)[0]
  const owner = NAV
    .filter((n) => n.to !== '/' && (path === n.to || path.startsWith(`${n.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0]
  return owner?.capability ?? null
}
