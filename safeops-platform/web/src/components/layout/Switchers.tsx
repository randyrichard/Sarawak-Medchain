import { Building2, Check, ChevronsUpDown, Factory, Globe } from 'lucide-react'
import { useOrg } from '@/features/org/OrgContext'
import { ROLE_LABEL } from '@/api/types'
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
        'flex max-w-[180px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-ink transition-colors md:max-w-[240px]',
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

export function SiteSwitcher() {
  const { sites, site, switchSite, loading } = useOrg()
  if (loading && sites.length === 0) return <Skeleton className="h-8 w-32" />
  if (sites.length === 0) return null
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
      {sites.map((s) => (
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
