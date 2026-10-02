import { useSearchParams } from 'react-router-dom'
import {
  Activity, Building2, DatabaseBackup, KeyRound, ScrollText, ShieldCheck, Plug, Users, UserCog,
  MailPlus, MapPin, Network, Briefcase,
} from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { cn } from '@/lib/cn'
import { OverviewSection } from './sections/OverviewSection'
import { UsersSection } from './sections/UsersSection'
import { RolesSection } from './sections/RolesSection'
import { OrganizationSection } from './sections/OrganizationSection'
import { SecuritySection } from './sections/SecuritySection'
import { AuditLogSection } from './sections/AuditLogSection'
import { IntegrationsSection } from './sections/IntegrationsSection'
import { DeveloperSection } from './sections/DeveloperSection'
import { BackupSection } from './sections/BackupSection'
import { SitesSection } from './sections/SitesSection'
import { ProjectsSection } from './sections/ProjectsSection'
import { DepartmentsSection } from './sections/DepartmentsSection'
import { InvitationsSection } from './sections/InvitationsSection'

type Section =
  | 'overview' | 'users' | 'invitations' | 'roles' | 'organization' | 'security'
  | 'projects' | 'sites' | 'departments' | 'audit' | 'integrations' | 'developer' | 'backup'

const NAV: { id: Section; label: string; icon: typeof Activity; group: string }[] = [
  { id: 'overview', label: 'System Health', icon: Activity, group: 'Monitor' },
  { id: 'users', label: 'Users', icon: Users, group: 'People & Access' },
  { id: 'invitations', label: 'Invitations', icon: MailPlus, group: 'People & Access' },
  { id: 'roles', label: 'Roles & Permissions', icon: UserCog, group: 'People & Access' },
  { id: 'security', label: 'Security Center', icon: ShieldCheck, group: 'People & Access' },
  { id: 'organization', label: 'Organization', icon: Building2, group: 'Configuration' },
  { id: 'projects', label: 'Projects', icon: Briefcase, group: 'Configuration' },
  { id: 'sites', label: 'Sites', icon: MapPin, group: 'Configuration' },
  { id: 'departments', label: 'Departments', icon: Network, group: 'Configuration' },
  { id: 'audit', label: 'Audit Log', icon: ScrollText, group: 'Governance' },
  { id: 'integrations', label: 'Integrations', icon: Plug, group: 'Platform' },
  { id: 'developer', label: 'API & Webhooks', icon: KeyRound, group: 'Platform' },
  { id: 'backup', label: 'Backup & Recovery', icon: DatabaseBackup, group: 'Platform' },
]

export function AdminPage() {
  const [params, setParams] = useSearchParams()
  /*
   * Read from the URL on every render, not once. It used to seed a `useState`, and each
   * change replaced the history entry, so Back left the admin console altogether instead of
   * returning to the section before - not how a settings area behaves anywhere else. A
   * stale or hand-edited `?s=` falls back to the overview.
   */
  const requested = params.get('s') as Section | null
  const section: Section = requested && NAV.some((n) => n.id === requested) ? requested : 'overview'

  const go = (s: Section) => {
    // A new history entry per section, and the previous section's own tab is dropped so the
    // next one opens on its first tab.
    setParams({ s })
  }

  const groups = [...new Set(NAV.map((n) => n.group))]

  return (
    <>
      <PageHeader title="Administration" subtitle="Governance, security and integrations — the SafeOps control plane" />

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Sub-navigation */}
        {/*
          min-w-0 matters at mobile. A grid item defaults to min-width:auto, so the twelve
          nowrap buttons below stretched the single column to their combined width and the
          section beside them was clipped off-screen - taking the row actions with it.
        */}
        <nav className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {groups.map((g) => (
              <div key={g} className="contents lg:block">
                <p className="hidden px-3 pb-1 pt-3 text-2xs font-bold uppercase tracking-wider text-muted lg:block">{g}</p>
                {NAV.filter((n) => n.group === g).map((n) => {
                  const active = section === n.id
                  return (
                    <button
                      key={n.id}
                      onClick={() => go(n.id)}
                      className={cn(
                        'flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-accent-soft/60 hover:text-ink',
                      )}
                    >
                      <n.icon size={15} className={active ? 'text-accent' : 'text-muted'} />
                      {n.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </nav>

        {/* Section content */}
        <div className="min-w-0">
          {section === 'overview' && <OverviewSection />}
          {section === 'users' && <UsersSection />}
          {section === 'invitations' && <InvitationsSection />}
          {section === 'projects' && <ProjectsSection />}
          {section === 'sites' && <SitesSection />}
          {section === 'departments' && <DepartmentsSection />}
          {section === 'roles' && <RolesSection />}
          {section === 'organization' && <OrganizationSection />}
          {section === 'security' && <SecuritySection />}
          {section === 'audit' && <AuditLogSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'developer' && <DeveloperSection />}
          {section === 'backup' && <BackupSection />}
        </div>
      </div>
    </>
  )
}
