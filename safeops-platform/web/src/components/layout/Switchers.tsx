import { Briefcase, Building2, Check, ChevronsUpDown, Factory, Globe } from 'lucide-react'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'
import { PROJECT_STATUS_LABEL } from '@/api/orgAdminApi'
import { Dropdown, DropdownItem, DropdownLabel, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

function SwitcherButton({
  icon, value, hint, open,
}: {
  icon: React.ReactNode
  value: string
  hint?: string
  open: boolean
}) {
  return (
    <button
      className={cn(
        /*
         * `min-w-0` is what makes the `truncate` below actually truncate.
         *
         * A flex item's default `min-width: auto` refuses to shrink past its content, so
         * the company and site switchers sitting side by side in the header pushed each
         * other out rather than eliding. On a 375px phone that put the site name 5px past
         * the viewport and gave the whole page a horizontal scroll - small, but it is the
         * header, so it is on every screen. `max-w` alone could not fix it: the floor was
         * the minimum, not the maximum.
         *
         * `w-full` is the other half, and without it the above only looked fixed.
         *
         * Dropdown wraps this button in two plain <div>s. Those are the flex items, so they
         * shrank correctly - to 85px and 60px on a 375px phone - but the button inside is
         * not a flex item of that row, and a block container does not constrain a child that
         * sizes itself from its own content. So the button stayed at its natural 180px and,
         * the wrappers being overflow:visible, simply painted straight through the next one:
         * the two switchers overlapped by 89px and the company name ran under the
         * notification badge. Three controls drawn on top of each other.
         *
         * Nothing caught it. There was no horizontal scroll to find - the spill stayed
         * inside the viewport - so a responsive audit measuring document width passed it,
         * and measuring the wrappers rather than the button says everything is fine. It is
         * visible in a screenshot and in the button's own rect, and nowhere else.
         */
        'flex w-full min-w-0 max-w-[180px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-ink transition-colors coarse:min-h-11 md:max-w-[240px]',
        open ? 'bg-accent-soft' : 'hover:bg-accent-soft/60',
      )}
    >
      <span className="text-muted">{icon}</span>
      <span className="truncate">{value}</span>
      {hint && <span className="hidden text-2xs text-muted md:inline">{hint}</span>}
      <ChevronsUpDown size={13} className="shrink-0 text-muted" />
    </button>
  )
}

export function CompanySwitcher() {
  const { companies, company, membership, switchCompany, loading } = useOrg()
  if (loading && !company) return <Skeleton className="h-8 w-40" />
  if (!company) return null
  return (
    <Dropdown align="start" width="w-80" trigger={(open) => (
      <SwitcherButton icon={<Building2 size={14} />} value={company.name} open={open} />
    )}>
      <DropdownLabel>Company</DropdownLabel>
      {companies.map((c) => (
        <DropdownItem key={c.id} onSelect={() => switchCompany(c.id)}>
          <span className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-2xs font-bold text-ink">
              {c.logoInitials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{c.name}</span>
              <span className="block text-2xs text-muted">{c.industry} · {c.plan}</span>
            </span>
            {c.id === company.id && <Check size={15} className="text-accent" />}
          </span>
        </DropdownItem>
      ))}
      {membership && (
        <p className="px-2.5 pb-1.5 pt-2 text-2xs text-muted">
          Your role here: <span className="font-semibold text-ink-2">{ROLE_LABEL[membership.role]}</span>
        </p>
      )}
    </Dropdown>
  )
}

/**
 * Company -> Project -> Site, and the middle one only when it exists.
 *
 * Renders nothing at all for a workspace with no projects, which is every existing
 * customer. An empty picker between the company and the site would be a control that
 * cannot be used and a hierarchy level that is not there - worse than the two-level header
 * it replaces. Adopting projects makes it appear; nobody has to be told about it.
 */
export function ProjectSwitcher() {
  const { projects, project, switchProject, loading } = useOrg()
  if (loading && projects.length === 0) return null
  if (projects.length === 0) return null

  /*
   * The divider belongs to this component, not to the bar.
   *
   * A "/" placed in the Topbar between here and the site picker would still be drawn for
   * the workspaces where this renders nothing - leaving "Acme / / LMG". Owning it means it
   * appears and disappears with the control it separates.
   */
  return (
    <>
    <Dropdown align="start" width="w-80" trigger={(open) => (
      <SwitcherButton
        icon={<Briefcase size={14} />}
        value={project ? project.name : `All projects (${projects.length})`}
        open={open}
      />
    )}>
      <DropdownLabel>Project</DropdownLabel>
      <DropdownItem onSelect={() => switchProject(null)}>
        <span className="flex w-full items-center justify-between">
          <span className="font-medium text-ink">All projects</span>
          {!project && <Check size={15} className="text-accent" />}
        </span>
      </DropdownItem>
      {projects.map((p) => (
        <DropdownItem key={p.id} onSelect={() => switchProject(p.id)}>
          <span className="flex w-full items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{p.name}</span>
              <span className="block text-2xs text-muted">
                {PROJECT_STATUS_LABEL[p.status]}
                {p.code ? ` · ${p.code}` : ''}
                {` · ${p.siteCount} site${p.siteCount === 1 ? '' : 's'}`}
              </span>
            </span>
            {project?.id === p.id && <Check size={15} className="shrink-0 text-accent" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
    <span className="hidden text-muted md:inline">/</span>
    </>
  )
}

export function SiteSwitcher() {
  const { sites, site, switchSite, project, loading } = useOrg()
  if (loading && sites.length === 0) return <Skeleton className="h-8 w-32" />
  /*
   * Two different empties, and only one of them is worth a control.
   *
   * No sites at all means nothing to choose. A project with no sites under it means the
   * filter is hiding them, and a reader who has just picked that project needs to be told
   * that rather than watching the picker vanish - otherwise the obvious conclusion is that
   * their sites are gone.
   */
  if (sites.length === 0) {
    return project ? (
      <span className="hidden truncate text-2xs text-muted md:inline">
        No sites in {project.name} yet
      </span>
    ) : null
  }
  const allLabel = sites.length > 1 ? `All sites (${sites.length})` : sites[0].name
  return (
    <Dropdown align="start" width="w-72" trigger={(open) => (
      <SwitcherButton
        icon={site ? <Factory size={14} /> : <Globe size={14} />}
        value={site ? site.name : allLabel}
        open={open}
      />
    )}>
      <DropdownLabel>Site scope</DropdownLabel>
      {sites.length > 1 && (
        <DropdownItem onSelect={() => switchSite(null)}>
          <span className="flex w-full items-center justify-between">
            <span className="font-medium text-ink">All sites</span>
            {!site && <Check size={15} className="text-accent" />}
          </span>
        </DropdownItem>
      )}
      {/*
        Alphabetical. In the order the server returned them, finding a site meant reading
        the list until it turned up; sorted, the eye jumps to the right letter - the
        difference between scanning (linear in the number of sites) and choosing among
        known options (logarithmic). Hick's law only holds for the second. With the
        type-ahead in Dropdown, pressing a letter now lands on that part of the list too.
      */}
      {[...sites].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((s) => (
        <DropdownItem key={s.id} onSelect={() => switchSite(s.id)}>
          <span className="flex w-full items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{s.name}</span>
              <span className="block text-2xs text-muted">{s.city} · {s.headcount.toLocaleString()} workers</span>
            </span>
            {site?.id === s.id && <Check size={15} className="shrink-0 text-accent" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
