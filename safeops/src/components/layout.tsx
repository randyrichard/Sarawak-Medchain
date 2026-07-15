import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, GitBranch, Factory, ListChecks,
  ShieldCheck, LineChart, Moon, Sun, Search, Bell, ChevronRight, Shield,
} from 'lucide-react'
import { useTheme } from '../theme'
import { COMPANY } from '../data/mock'

const NAV = [
  { to: '/', label: 'Executive Dashboard', icon: LayoutDashboard, end: true },
  { to: '/incidents', label: 'Incidents', icon: ClipboardList, badge: COMPANY.openIncidents },
  { to: '/root-cause', label: 'Root Cause Analytics', icon: GitBranch },
  { to: '/sites', label: 'Site Intelligence', icon: Factory },
  { to: '/actions', label: 'Corrective Actions', icon: ListChecks, badge: COMPANY.overdueActions, badgeTone: 'var(--critical)' },
  { to: '/audit', label: 'Audit Readiness', icon: ShieldCheck },
  { to: '/analytics', label: 'Executive Analytics', icon: LineChart },
]

const TITLES: Record<string, string> = {
  '/': 'Executive Dashboard',
  '/incidents': 'Incident Investigation',
  '/root-cause': 'Root Cause Analytics',
  '/sites': 'Site Intelligence',
  '/actions': 'Corrective Action Tracker',
  '/audit': 'Audit Readiness',
  '/analytics': 'Executive Analytics',
}

export default function AppShell() {
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  const section = pathname.startsWith('/incidents') ? '/incidents' : pathname
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent)' }}>
            <Shield size={17} color="#fff" strokeWidth={2.4} />
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-tight text-ink">SafeOps</p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted">Safety Intelligence</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end as boolean | undefined}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-accent-soft/60 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span
                      className="rounded-full px-1.5 py-px text-[10px] font-bold text-white"
                      style={{ background: item.badgeTone ?? 'var(--accent)' }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t px-5 py-4">
          <p className="text-[11px] font-semibold text-ink">Borneo Industrial Group</p>
          <p className="text-[11px] text-muted">Enterprise plan · 6 sites</p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface px-5">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="text-muted">SafeOps</span>
            <ChevronRight size={13} className="text-muted" />
            <span className="font-semibold text-ink">{TITLES[section] ?? 'Incident Investigation'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border bg-page px-3 py-1.5 md:flex">
              <Search size={14} className="text-muted" />
              <input
                placeholder="Search incidents, sites, actions…"
                className="w-56 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
              <kbd className="rounded border px-1.5 text-[10px] text-muted">⌘K</kbd>
            </div>
            <button className="relative rounded-lg border p-2 text-ink-2 hover:bg-accent-soft" aria-label="Notifications">
              <Bell size={15} />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: 'var(--critical)' }} />
            </button>
            <button onClick={toggle} className="rounded-lg border p-2 text-ink-2 hover:bg-accent-soft" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: 'var(--s5)' }}
              title="Randy Richard — Group HSE Manager"
            >
              RR
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7">
          <div className="mx-auto max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
