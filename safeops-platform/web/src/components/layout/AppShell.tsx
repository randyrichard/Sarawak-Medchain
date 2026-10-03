import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, FileText, ListChecks, GraduationCap, ShieldCheck, Bell,
  Building2, Boxes, Menu, X, Lock, SlidersHorizontal, HardHat, UserCheck, ShieldAlert, Users, Megaphone, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOrg } from '@/features/org/OrgContext'
import { usePlatformAdmin } from '@/features/platform/usePlatformAdmin'
import type { Capability } from '@/features/permissions/permissions'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { PageTitleContext, resolveTitle } from '@/app/pageTitle'
import { Topbar } from './Topbar'
import { OutboxBanner } from '@/features/incidents/components/OutboxBanner'
import { CompanySwitcher } from './Switchers'
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { Badge, FullPageSpinner } from '@/components/ui'

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

interface NavItem {
  to: string
  label: string
  /** The section it sits under. None: the everyday items at the top. */
  group?: NavGroup
  icon: typeof LayoutDashboard
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
  { to: '/', label: 'Mission Control', icon: LayoutDashboard, capability: 'dashboard:view', end: true },
  // Near-miss capture sits in the nav because under-reporting is driven by friction and
  // forgetting (customer research P1) — it has to be one tap from anywhere.
  { to: '/near-miss', label: 'Report Near Miss', icon: ShieldAlert, capability: 'reports:submit' },
  // Everyone gets told what needs them.
  { to: '/notifications', label: 'Notifications', icon: Bell, capability: 'dashboard:view' },
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
  { to: '/incidents', label: 'Incidents', icon: ClipboardList, capability: 'incidents:view', notFor: ['/incidents/board'], group: 'Incidents' },
  { to: '/incidents/board', label: 'Incident board', icon: LayoutDashboard, capability: 'incidents:view', group: 'Incidents' },
  { to: '/actions', label: 'Actions', icon: ListChecks, capability: 'actions:manage', group: 'Incidents' },
  { to: '/assets', label: 'Assets', icon: Boxes, capability: 'equipment:view', group: 'Operations' },
  { to: '/permits', label: 'Permits', icon: HardHat, capability: 'permits:view', group: 'Operations' },
  { to: '/visitors', label: 'Visitors', icon: UserCheck, capability: 'visitors:view', group: 'Operations' },
  { to: '/toolbox', label: 'Toolbox meetings', icon: Megaphone, capability: 'toolbox:view', group: 'Operations' },
  { to: '/performance', label: 'HSE Performance', icon: TrendingUp, capability: 'analytics:view', group: 'Assurance' },
  { to: '/reports', label: 'Reports', icon: FileText, capability: 'reports:view', group: 'Assurance' },
  { to: '/audits', label: 'Compliance', icon: ShieldCheck, capability: 'compliance:manage', group: 'Assurance' },
  { to: '/training', label: 'Training', icon: GraduationCap, capability: 'training:view', group: 'People' },
  { to: '/employees', label: 'Workforce', icon: Users, capability: 'workforce:view', group: 'People' },
  { to: '/contractors', label: 'Contractors', icon: HardHat, capability: 'workforce:view', group: 'People' },
  { to: '/organization', label: 'Organization', icon: Building2, capability: 'org:view', group: 'Workspace' },
  { to: '/admin', label: 'Administration', icon: SlidersHorizontal, capability: 'settings:manage', group: 'Workspace' },
]

/**
 * Keeps the browser title in step with the route.
 *
 * Every screen announced "SafeOps — Safety Intelligence Platform", because a single-page
 * app changes the URL without touching the document title. A screen reader reads the title
 * on navigation, so every move around the product was announced identically — and a person
 * with a dozen tabs open had a dozen tabs with the same name.
 *
 * The label comes from the nav table rather than a second list, so a renamed screen renames
 * its title too. That covers every section, and it is all a section page needs.
 *
 * A page that knows something more specific says so through `usePageTitle` — an incident
 * detail page names the incident — and that wins when present. Without it a deep route falls
 * back to its section, so `/incidents/INC-2601` is titled "Incidents": imprecise but true,
 * and better than the alternative of leaving it as the product name.
 */
function useDocumentTitle(pathname: string, claimed: string | null) {
  useEffect(() => {
    document.title = resolveTitle(pathname, NAV, claimed)
  }, [pathname, claimed])
}

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  // What the current page calls itself, if it has said. See src/app/pageTitle.ts for why
  // this is state up here rather than the page writing document.title itself.
  const [claimedTitle, setClaimedTitle] = useState<string | null>(null)
  const location = useLocation()
  useDocumentTitle(location.pathname, claimedTitle)
  return (
    <div className="flex h-full">
      {/*
        Skip link.

        Sixteen navigation items sit before the content on every screen, so anyone tabbing
        through — a keyboard user, or somebody using a switch or voice control — traverses
        the whole sidebar again on every page before reaching what they came for.
        WCAG 2.4.1 exists for exactly this.

        Visually hidden until focused rather than hidden outright: `display: none` and
        `visibility: hidden` both remove an element from the tab order, which would make
        this a link nobody can reach.
      */}
      <a
        href="#main"
        className="sr-only rounded-lg bg-accent-solid px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60]"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-surface lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-scale-in flex-col border-r bg-surface shadow-modal">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-lg p-1.5 text-muted hover:bg-accent-soft coarse:min-h-11 coarse:min-w-11 coarse:flex coarse:items-center coarse:justify-center"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <KeyboardShortcuts />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          menuButton={
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="rounded-lg border p-2 text-ink-2 hover:bg-accent-soft coarse:min-h-11 coarse:min-w-11 lg:hidden"
            >
              <Menu size={15} />
            </button>
          }
        />
        {/* `tabIndex={-1}` so the skip link can move focus here, not merely scroll to it —
            without it the browser jumps the viewport and leaves focus in the sidebar. */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto px-4 py-5 outline-none md:px-6 lg:px-7">
          <div className="mx-auto max-w-[1360px]">
            {/*
              Unsent incident reports, shown on every screen.

              Above the error boundary and outside Suspense on purpose: the queue must stay
              visible even when the page inside has crashed or is still loading. Somebody
              whose report is sitting unsent needs to know that regardless of what else the
              app is doing.
            */}
            <OutboxBanner />
            {/* Per-route boundary: a page crash shows a recoverable fallback here while the
                shell stays usable. Keying by pathname clears the error on navigation. */}
            <ErrorBoundary key={location.pathname} scope="This screen">
              <Suspense fallback={<FullPageSpinner label="Loading…" />}>
                <PageTitleContext.Provider value={setClaimedTitle}>
                  <Outlet />
                </PageTitleContext.Provider>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { allowed, company } = useOrg()
  // Platform staff only, and answered by the server rather than by a tenant capability -
  // managing customers sits above every workspace rather than inside one.
  const platformAdmin = usePlatformAdmin()
  const { pathname } = useLocation()

  /**
   * Does this row own the current page?
   *
   * NavLink's own `isActive` matches by prefix, so "/incidents" reported itself active on
   * "/incidents/board" and two rows lit up together. This keeps the prefix behaviour -
   * "Incidents" should stay lit on "/incidents/INC-2601" - and subtracts only the paths
   * that have a nav row of their own.
   */
  const own = (item: { notFor?: string[] }, isActive: boolean) =>
    isActive && !item.notFor?.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return (
    <>
      {/*
        The logo is the way home, as it is on nearly every site people use (Jakob's law). It
        was a picture: clicking it did nothing, so the one move everybody tries first when
        lost - click the logo - led nowhere.
      */}
      <Link
        to="/"
        onClick={onNavigate}
        aria-label="SafeOps home"
        className="mx-2 mt-2 flex items-center gap-2.5 rounded-lg px-3 py-3 hover:bg-accent-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--accent)]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-solid">
          <ShieldCheck size={17} color="#fff" strokeWidth={2.4} aria-hidden />
        </div>
        <div>
          <p className="text-sm font-bold leading-none tracking-tight text-ink">SafeOps</p>
          <p className="mt-0.5 text-2xs font-medium uppercase tracking-widest text-muted">Safety Intelligence</p>
        </div>
      </Link>

      {/*
        Company switching, for the widths where the header cannot afford it. See the note in
        Topbar.tsx: below md the header gives up this control so the site switcher has room
        to show a name, and this is where it goes instead. Hidden from md up, where the
        header has it again, so it is never in two places at once.
      */}
      <div className="px-3 pb-3 md:hidden">
        <CompanySwitcher />
      </div>

      {/*
        `min-h-0 overflow-y-auto`: on a short screen the list scrolls inside the sidebar
        instead of pushing the company footer off the bottom. A full administrator list with
        its section headings is taller than a 900px laptop window.
      */}
      <nav aria-label="Main" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 pt-1">
        {(() => {
          const visible = NAV.filter((item) => allowed(item.capability))
          const renderItem = (item: NavItem) =>
            item.locked ? (
              <div
                key={item.to}
                aria-disabled
                className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted opacity-70"
                title={`Ships in ${item.locked}`}
              >
                <item.icon size={16} />
                <span className="flex-1">{item.label}</span>
                <Badge tone="neutral" className="gap-1"><Lock size={9} /> {item.locked}</Badge>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors coarse:min-h-11',
                    own(item, isActive)
                      ? 'bg-accent-soft text-ink'
                      : 'text-ink-2 hover:bg-accent-soft/60 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={16} className={own(item, isActive) ? 'text-accent' : 'text-muted'} />
                    <span className="flex-1">{item.label}</span>
                  </>
                )}
              </NavLink>
            )
          // Short lists stay flat; see GROUP_NAV_ABOVE.
          if (visible.length <= GROUP_NAV_ABOVE) return visible.map(renderItem)
          return (
            <>
              {visible.filter((i) => !i.group).map(renderItem)}
              {NAV_GROUPS.map((group) => {
                const items = visible.filter((i) => i.group === group)
                if (items.length === 0) return null
                const headingId = `nav-group-${group.toLowerCase()}`
                return (
                  <div key={group} role="group" aria-labelledby={headingId} className="pt-2.5">
                    <p id={headingId} className="px-3 pb-1 text-2xs font-semibold uppercase tracking-widest text-muted">
                      {group}
                    </p>
                    <div className="space-y-0.5">{items.map(renderItem)}</div>
                  </div>
                )
              })}
            </>
          )
        })()}

        {/*
          SafeOps staff tools, kept out of the customer's navigation.

          This link used to be appended to the same list as Incidents and Permits, which
          made it read as part of the workspace somebody was working in. It is not: it
          spans every customer on the deployment, and opening it in front of one customer
          shows them the names and plans of the others.

          Separating it is a visual change, not a security one - the flag can only be set
          from a shell on the server (grantPlatformAdmin), the server re-checks it on every
          platform call, and nothing in the product can grant it. The label exists so that
          whoever holds it always knows which hat they are wearing.
        */}
        {platformAdmin && (
          <div className="mt-4 border-t pt-3">
            <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-widest text-muted">
              SafeOps staff
            </p>
            <NavLink
              to="/platform"
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors coarse:min-h-11',
                  isActive ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-accent-soft/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Building2 size={16} className={isActive ? 'text-accent' : 'text-muted'} />
                  <span className="flex-1">SafeOps customers</span>
                </>
              )}
            </NavLink>
            <p className="px-3 pt-1 text-2xs leading-relaxed text-muted">
              Every customer on this deployment. Not part of {company?.name ?? 'this workspace'}.
            </p>
          </div>
        )}
      </nav>

      <div className="border-t px-5 py-4">
        <p className="truncate text-xs font-semibold text-ink">{company?.name ?? '—'}</p>
        <p className="text-2xs capitalize text-muted">{company ? `${company.plan} plan` : ''}</p>
      </div>
    </>
  )
}
