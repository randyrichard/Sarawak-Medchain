import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Building2, RefreshCw } from 'lucide-react'
import {
  Alert, Badge, Button, Card, CardBody, EmptyState, PageHeader, Skeleton,
} from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { usePlatformAdmin } from '@/features/platform/usePlatformAdmin'
import { timeAgo } from '@/lib/time'
import { useDashboard } from './useDashboard'
import { DashboardFilters } from './components/DashboardFilters'
import { GettingStarted } from './components/GettingStarted'
import { useGettingStarted } from './useGettingStarted'
import { NeedsAttention } from './components/NeedsAttention'
import { SiteComparison } from './components/SiteComparison'
import {
  ActionsPanel, EquipmentPanel, IncidentPanel, PermitPanel, ReportPanel, VisitorPanel,
} from './components/ModulePanels'
import { headline, kpiCards, scopeCaveats, scopeSummary } from './lib'

/**
 * The safety operations dashboard.
 *
 * One question, answered in the order an HSE manager asks it: is anything on fire, what is
 * overdue, and then how each module is doing. Every figure is counted server-side from the
 * modules that own the data - nothing here is illustrative, and a metric that cannot be
 * derived is absent rather than estimated.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const { loading: orgLoading, companies, company, project, site, sites, allowed, switchSite } = useOrg()
  const platformAdmin = usePlatformAdmin()
  const { data, loading, error, filters, setFilter, clearFilters, refresh, filtered } = useDashboard()
  const { progress: gettingStarted, dismiss: dismissGettingStarted } = useGettingStarted()
  /*
   * Bumped by the Refresh button only. The comparison used to follow the overview's
   * generatedAt, which changes from nothing to a time as the page first loads - so it
   * fetched every site's figures twice on every visit.
   */
  const [compareTick, setCompareTick] = useState(0)
  const refreshAll = () => { refresh(); setCompareTick((n) => n + 1) }

  /*
   * This dashboard is tenant-scoped, and some people belong to no tenant.
   *
   * A SafeOps platform administrator has no company membership by design - that is what
   * makes their access cross-tenant rather than inside one - so sending them here showed a
   * page that could never populate: an empty company switcher, a search box reading
   * "Search unavailable", and twenty skeleton tiles pulsing forever. Their landing place
   * is the customer console.
   *
   * Waits for the org context to finish loading first, or a normal user with one company
   * would be bounced away during the moment before their membership arrives.
   */
  if (!orgLoading && companies.length === 0 && platformAdmin) {
    return <Navigate to="/platform" replace />
  }

  /*
   * Anybody else with no workspace gets told so. Rare - it means an account exists with no
   * membership - but the alternative is the same blank page with no explanation, and
   * somebody staring at it has no way to know whether it is broken or empty.
   */
  if (!orgLoading && companies.length === 0) {
    return (
      <>
        <PageHeader title="Safety operations" subtitle="No workspace yet" />
        <Card>
          <CardBody>
            <EmptyState icon={Building2} title="Your account is not in a workspace yet.">
              An administrator needs to add you to a company before there is anything to
              show here. If you were expecting access, ask whoever invited you.
            </EmptyState>
          </CardBody>
        </Card>
      </>
    )
  }

  const firstName = user?.name.split(' ')[0] ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const cards = data ? kpiCards(data) : []
  const verdict = data ? headline(data) : null
  const caveats = data ? scopeCaveats(data) : []

  return (
    <>
      <PageHeader
        title="Safety operations"
        subtitle={`${greeting}${firstName ? `, ${firstName}` : ''}. Here is what needs attention today.`}
        right={data
          ? (
            <div className="flex items-center gap-2">
              <Badge tone="neutral">updated {timeAgo(data.generatedAt)}</Badge>
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw size={12} />}
                onClick={refreshAll}
              >
                Refresh
              </Button>
            </div>
          )
          : undefined}
      />

      {error && (
        <Alert tone="critical" className="mb-3">
          {error} Nothing below is current until this loads.
        </Alert>
      )}

      {/*
        Above the filters and the tiles, because on a workspace with nothing in it yet the
        tiles are twenty-four zeros and this is the only thing on the page with an answer.
        It removes itself once the four steps are done.
      */}
      {gettingStarted && (
        <GettingStarted progress={gettingStarted} onDismiss={dismissGettingStarted} />
      )}

      <DashboardFilters
        filters={filters}
        departments={data?.departments ?? []}
        onChange={setFilter}
        onClear={clearFilters}
        filtered={filtered}
      />

      {/*
        The verdict line. If it says all clear, an operator can stop reading - which is the
        point of putting it above everything else.
      */}
      {verdict && (
        <Card className="mb-3">
          <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3">
            <p className="flex items-center gap-2">
              <Badge tone={verdict.tone}>{verdict.text}</Badge>
            </p>
            <p className="text-2xs text-muted">{data && scopeSummary(data)}</p>
          </CardBody>
        </Card>
      )}

      {/* Said plainly, because these totals will not reconcile against the module otherwise. */}
      {caveats.map((c) => (
        <Alert key={c} tone="info" className="mb-2">
          {c}
        </Alert>
      ))}

      {/* ── The eight numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {loading && !data
          ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          : cards.map((c) => (
            <Link key={c.id} to={c.href} className="group">
              <Card className="h-full transition group-hover:border-[var(--accent)]">
                <CardBody className="py-3">
                  <p className="text-2xs font-medium text-muted">{c.label}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${
                    c.value === 0 ? 'text-muted'
                      : c.tone === 'critical' ? 'text-critical'
                        : c.tone === 'serious' ? 'text-[var(--serious)]'
                          : c.tone === 'warning' ? 'text-[var(--warning)]'
                            : c.tone === 'good' ? 'text-[var(--good)]' : 'text-ink'
                  }`}
                  >
                    {c.value}
                  </p>
                  {/* A bare zero reads as broken; saying what zero means does not. */}
                  {c.value === 0 && <p className="mt-0.5 text-2xs text-muted">{c.quiet}</p>}
                </CardBody>
              </Card>
            </Link>
          ))}
      </div>

      {/*
        The wider view: every site side by side, when the dashboard is looking at more than
        one. Hidden once a single site is chosen - the tiles above are then that site.
      */}
      {company && !site && sites.length > 1 && allowed('analytics:view') && (
        <SiteComparison
          companyId={company.id}
          projectId={project?.id ?? null}
          from={filters.from}
          to={filters.to}
          refresh={compareTick}
          onOpenSite={switchSite}
        />
      )}

      {/* ── What needs attention ───────────────────────────────────────────── */}
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <NeedsAttention
          items={data?.attention}
          total={data?.attentionTotal ?? 0}
          loading={loading && !data}
          className="min-w-0 xl:col-span-2"
        />
        <div className="min-w-0 space-y-3">
          {data ? <ActionsPanel d={data} /> : <Skeleton className="h-64 rounded-xl" />}
          {data ? <VisitorPanel d={data} /> : <Skeleton className="h-48 rounded-xl" />}
        </div>
      </div>

      {/* ── Per-module detail ──────────────────────────────────────────────── */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {data ? <IncidentPanel d={data} className="min-w-0" /> : <Skeleton className="h-72 rounded-xl" />}
        {data ? <PermitPanel d={data} className="min-w-0" /> : <Skeleton className="h-72 rounded-xl" />}
        {data ? <EquipmentPanel d={data} className="min-w-0" /> : <Skeleton className="h-72 rounded-xl" />}
      </div>

      <div className="mt-3">
        {data ? <ReportPanel d={data} /> : <Skeleton className="h-40 rounded-xl" />}
      </div>
    </>
  )
}
