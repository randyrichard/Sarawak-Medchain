import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, ListChecks, LineChart, ShieldCheck, Bell,
  Building2, Menu, Palette, X, Lock,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOrg } from '@/features/org/OrgContext'
import type { Capability } from '@/features/permissions/permissions'
import { Topbar } from './Topbar'
import { Badge } from '@/components/ui'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  capability: Capability
  /** future-sprint modules render locked, communicating the roadmap */
  locked?: string
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Mission Control', icon: LayoutDashboard, capability: 'dashboard:view', end: true },
  { to: '/incidents', label: 'Incidents', icon: ClipboardList, capability: 'incidents:manage', locked: 'Sprint 2' },
  { to: '/actions', label: 'Actions', icon: ListChecks, capability: 'actions:manage', locked: 'Sprint 2' },
  { to: '/analytics', label: 'Analytics', icon: LineChart, capability: 'analytics:view', locked: 'Sprint 3' },
  { to: '/compliance', label: 'Compliance', icon: ShieldCheck, capability: 'compliance:manage', locked: 'Sprint 3' },
  { to: '/notifications', label: 'Notifications', icon: Bell, capability: 'dashboard:view' },
  { to: '/organization', label: 'Organization', icon: Building2, capability: 'org:view' },
  { to: '/design', label: 'Design System', icon: Palette, capability: 'dashboard:view' },
]

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="flex h-full">
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
              className="absolute right-3 top-4 rounded-lg p-1.5 text-muted hover:bg-accent-soft"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          menuButton={
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="rounded-lg border p-2 text-ink-2 hover:bg-accent-soft lg:hidden"
            >
              <Menu size={15} />
            </button>
          }
        />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-7">
          <div className="mx-auto max-w-[1360px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { allowed, company } = useOrg()
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <ShieldCheck size={17} color="#fff" strokeWidth={2.4} />
        </div>
        <div>
          <p className="text-sm font-bold leading-none tracking-tight text-ink">SafeOps</p>
          <p className="mt-0.5 text-2xs font-medium uppercase tracking-widest text-muted">Safety Intelligence</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pt-1">
        {NAV.filter((item) => allowed(item.capability)).map((item) =>
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
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-accent-soft/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} className={isActive ? 'text-accent' : 'text-muted'} />
                  <span className="flex-1">{item.label}</span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>

      <div className="border-t px-5 py-4">
        <p className="truncate text-xs font-semibold text-ink">{company?.name ?? '—'}</p>
        <p className="text-2xs capitalize text-muted">{company ? `${company.plan} plan` : ''}</p>
      </div>
    </>
  )
}
