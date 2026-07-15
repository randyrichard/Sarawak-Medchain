import { useEffect, useMemo, useState } from 'react'
import { Building2, ChevronRight, Plus, Users } from 'lucide-react'
import { api } from '@/api/client'
import type { Department, Employee, Site, Team } from '@/api/types'
import { ROLE_LABEL, type Role } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { Can } from '@/features/auth/guards'
import { capabilitiesOf } from '@/features/permissions/permissions'
import {
  Avatar, Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, PageHeader,
  Skeleton, Tabs, type Column, type TabItem,
} from '@/components/ui'
import { cn } from '@/lib/cn'

type View = 'structure' | 'people' | 'roles'

export function OrganizationPage() {
  const { company } = useOrg()
  const [view, setView] = useState<View>('structure')

  const tabs: TabItem<View>[] = [
    { value: 'structure', label: 'Structure' },
    { value: 'people', label: 'People' },
    { value: 'roles', label: 'Roles & Permissions' },
  ]

  return (
    <>
      <PageHeader
        title="Organization"
        subtitle={company ? `${company.name} — companies hold sites, sites hold departments, departments hold teams` : 'Loading…'}
        right={
          <Can capability="org:manage">
            <Button size="sm" icon={<Plus size={14} />}>Invite user</Button>
          </Can>
        }
      />
      <Tabs items={tabs} value={view} onChange={setView} className="mb-4" />
      {view === 'structure' && <StructureView />}
      {view === 'people' && <PeopleView />}
      {view === 'roles' && <RolesView />}
    </>
  )
}

// ─── Structure tree ──────────────────────────────────────────────────────────

function StructureView() {
  const { company, sites } = useOrg()
  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [openSite, setOpenSite] = useState<string | null>(null)

  useEffect(() => {
    if (sites.length === 0) return
    let cancelled = false
    api.listDepartments(sites.map((s) => s.id)).then(async (deps) => {
      if (cancelled) return
      setDepartments(deps)
      const t = await api.listTeams(deps.map((d) => d.id))
      if (!cancelled) setTeams(t)
    })
    return () => {
      cancelled = true
    }
  }, [sites])

  if (!company) return <Skeleton className="h-40 w-full" />

  return (
    <Card>
      <CardHeader
        title={company.name}
        subtitle={`${sites.length} sites · ${departments?.length ?? '…'} departments · ${teams?.length ?? '…'} teams`}
        right={<Badge tone="accent" className="capitalize">{company.plan}</Badge>}
      />
      <CardBody>
        {departments === null ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <ul className="space-y-2">
            {sites.map((site) => (
              <SiteNode
                key={site.id}
                site={site}
                departments={departments.filter((d) => d.siteId === site.id)}
                teams={teams ?? []}
                open={openSite === site.id}
                onToggle={() => setOpenSite((cur) => (cur === site.id ? null : site.id))}
              />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function SiteNode({
  site, departments, teams, open, onToggle,
}: {
  site: Site
  departments: Department[]
  teams: Team[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <li className="rounded-lg border">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-accent-soft/40">
        <ChevronRight size={15} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-90')} />
        <Building2 size={16} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{site.name}</span>
          <span className="block text-2xs text-muted">{site.city} · {site.headcount.toLocaleString()} workers · {site.timezone}</span>
        </span>
        <Badge tone="neutral">{departments.length} {departments.length === 1 ? 'department' : 'departments'}</Badge>
      </button>
      {open && (
        <div className="space-y-1.5 border-t px-4 py-3 pl-11">
          {departments.length === 0 && <p className="text-xs text-muted">No departments recorded for this site.</p>}
          {departments.map((d) => {
            const deptTeams = teams.filter((t) => t.departmentId === d.id)
            return (
              <div key={d.id} className="rounded-lg bg-sunken px-3 py-2">
                <p className="text-sm font-medium text-ink">{d.name}</p>
                {deptTeams.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {deptTeams.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-xs text-ink-2">
                        <Users size={12} className="text-muted" />
                        {t.name} <span className="text-muted">· led by {t.lead}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </li>
  )
}

// ─── People ──────────────────────────────────────────────────────────────────

function PeopleView() {
  const { company, sites } = useOrg()
  const [employees, setEmployees] = useState<Employee[] | null>(null)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    api.listEmployees(company.id).then((e) => !cancelled && setEmployees(e))
    return () => {
      cancelled = true
    }
  }, [company])

  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.short])), [sites])

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (e) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={e.name} size={28} />
          <span className="text-sm font-medium text-ink">{e.name}</span>
        </span>
      ),
    },
    { key: 'position', header: 'Position', render: (e) => e.position },
    { key: 'site', header: 'Site', render: (e) => siteName.get(e.siteId) ?? '—', visibility: 'hidden md:table-cell' },
    { key: 'dept', header: 'Department', render: (e) => e.departmentId.split('-')[1]?.toUpperCase() ?? '—', visibility: 'hidden lg:table-cell' },
  ]

  return (
    <Card>
      {employees === null ? (
        <div className="p-5"><Skeleton className="h-48 w-full" /></div>
      ) : (
        <DataTable
          columns={columns}
          rows={employees}
          rowKey={(e) => e.id}
          empty={
            <EmptyState icon={Users} title="No employees yet">
              Import your workforce from CSV or add people one by one once org management opens.
            </EmptyState>
          }
        />
      )}
    </Card>
  )
}

// ─── Roles & permissions matrix ──────────────────────────────────────────────

const ALL_ROLES: Role[] = ['ceo', 'admin', 'hse_manager', 'safety_officer', 'supervisor', 'employee']

const CAPABILITY_LABEL: Record<string, string> = {
  'dashboard:view': 'View dashboard',
  'reports:submit': 'Submit field reports',
  'incidents:manage': 'Manage incidents',
  'actions:manage': 'Manage corrective actions',
  'analytics:view': 'View analytics',
  'compliance:manage': 'Manage compliance',
  'org:view': 'View organization',
  'org:manage': 'Manage organization',
  'audit-log:view': 'View audit log',
  'settings:manage': 'Manage settings',
}

function RolesView() {
  const { role: myRole } = useOrg()
  const capabilities = Object.keys(CAPABILITY_LABEL)
  return (
    <Card>
      <CardHeader
        title="Permission matrix"
        subtitle="Deny-by-default. Every route and API call checks a capability, not a role name."
        right={myRole ? <Badge tone="accent">You are: {ROLE_LABEL[myRole]}</Badge> : undefined}
      />
      <CardBody className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b text-2xs uppercase tracking-wide text-muted">
              <th className="py-2.5 pr-4 font-semibold">Capability</th>
              {ALL_ROLES.map((r) => (
                <th key={r} className={cn('px-3 py-2.5 text-center font-semibold', r === myRole && 'text-accent')}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capabilities.map((cap) => (
              <tr key={cap} className="border-b last:border-0">
                <td className="py-2.5 pr-4 text-sm text-ink">{CAPABILITY_LABEL[cap]}</td>
                {ALL_ROLES.map((r) => {
                  const has = capabilitiesOf(r).includes(cap as never)
                  return (
                    <td key={r} className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold',
                          has ? 'bg-accent-soft text-accent' : 'text-muted',
                        )}
                        aria-label={has ? 'Allowed' : 'Not allowed'}
                      >
                        {has ? '✓' : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
