import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { api } from '@/api/client'
import type { AssetFilters, AssetStats, AssetView, InspectionView } from '@/api/assets'
import { ASSET_CATEGORIES, CATEGORY_LABEL, type AssetCategory } from '@/api/assets'
import { useOrg } from '@/features/org/OrgContext'
import { useActor } from '@/features/incidents/lib'
import { Badge, Button, Card, PageHeader, Skeleton, StatusPill, Tabs, type TabItem, AttentionIcon, attentionOf, attentionStripe } from '@/components/ui'
import { cn } from '@/lib/cn'
import { assetStatusFromParam, openParam } from '@/lib/links'
import { canManageAssets, healthColor, RISK_PILL } from './lib'
import { AssetDrawer } from './components/AssetDrawer'
import { InspectionsList } from './components/InspectionsList'
import { InspectionCalendar } from './components/InspectionCalendar'
import { EquipmentBoard } from './components/EquipmentBoard'
import { AssetAnalytics } from './components/AssetAnalytics'
import { NewAssetDialog } from './components/NewAssetDialog'
import { InspectionRunner } from './components/InspectionRunner'

type View = 'register' | 'inspections' | 'calendar' | 'analytics' | 'board'
type Bucket = NonNullable<AssetFilters['bucket']>

/** What each filter shows, in words, for the chip that says the register is filtered. */
const BUCKET_LABEL: Record<Bucket, string> = {
  all: 'All assets',
  overdue: 'Inspection overdue',
  due_week: 'Due this week',
  high_risk: 'High risk',
  defects: 'Open defects',
}

export function AssetsPage() {
  const { company, role, site, sites } = useOrg()
  const actor = useActor()
  const [params, setParams] = useSearchParams()

  const [view, setView] = useState<View>((params.get('view') as View) || 'register')
  const bucket = (params.get('bucket') as Bucket) || 'all'
  // From Home's "In service" and "Out of service" figures.
  const status = assetStatusFromParam(params.get('status'))
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<AssetCategory | ''>('')

  const [assets, setAssets] = useState<AssetView[] | null>(null)
  const [inspections, setInspections] = useState<InspectionView[] | null>(null)
  const [stats, setStats] = useState<AssetStats | null>(null)
  const [openAssetId, setOpenAssetId] = useState<string | null>(null)
  const [runInspection, setRunInspection] = useState<InspectionView | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const manage = canManageAssets(role)

  const refresh = useCallback(() => {
    if (!company) return
    api.listAssets(company.id, { q, category, bucket, status, siteId: site?.id }).then(setAssets)
    api.listInspections(company.id, { siteId: site?.id, status: 'all' }).then(setInspections)
    api.assetStats(company.id).then(setStats)
  }, [company, q, category, bucket, status, site?.id])

  useEffect(() => {
    setAssets(null)
    const t = setTimeout(refresh, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, q])

  /*
   * Opening one asset from a link. Printed labels carry `?qr=AST-1007`, search and Home
   * send `?open=`, and inspection and calibration reminders were stored with `?asset=`.
   * Only `qr` was read, so every other link opened the register and left the asset to be
   * found by hand.
   */
  useEffect(() => {
    const target = openParam(params, 'qr', 'asset', 'focus')
    if (target) {
      setOpenAssetId(target)
      for (const key of ['open', 'qr', 'asset', 'focus']) params.delete(key)
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearStatus = () => {
    params.delete('status')
    setParams(params, { replace: true })
  }

  const setBucket = (b: Bucket) => {
    params.set('bucket', b)
    setParams(params, { replace: true })
  }
  const switchView = (v: View) => {
    setView(v)
    params.set('view', v)
    setParams(params, { replace: true })
  }

  const KPIS: { label: string; value: number | string | undefined; bucket?: Bucket; tone?: string }[] = [
    // totalAssets is the whole register, in service or not. Labelling it "in service"
    // made this tile disagree with the dashboard, which counts status = in_service.
    { label: 'Assets registered', value: stats?.totalAssets },
    { label: 'Inspection compliance', value: stats !== null ? `${stats.complianceRate}%` : undefined, tone: stats && stats.complianceRate < 85 ? 'var(--serious)' : 'var(--good)' },
    { label: 'Overdue inspections', value: stats?.overdueInspections, bucket: 'overdue', tone: stats && stats.overdueInspections > 0 ? 'var(--critical)' : 'var(--good)' },
    { label: 'Due this week', value: stats?.dueThisWeek, bucket: 'due_week', tone: 'var(--warning)' },
    { label: 'Open defects', value: stats?.openDefects, bucket: 'defects', tone: stats && stats.openDefects > 0 ? 'var(--serious)' : 'var(--good)' },
    { label: 'Avg. asset health', value: stats !== null ? `${stats.avgHealth}` : undefined, bucket: 'high_risk', tone: stats ? healthColor(stats.avgHealth) : undefined },
  ]

  const viewTabs: TabItem<View>[] = [
    { value: 'register', label: 'Register' },
    { value: 'inspections', label: 'Inspections' },
    { value: 'calendar', label: 'Calendar' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'board', label: 'Equipment board' },
  ]

  return (
    <>
      <PageHeader
        title="Assets & inspections"
        subtitle="Equipment that must be inspected regularly. Run inspections here; any item that fails becomes a corrective action automatically."
        right={manage ? <Button icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>Register asset</Button> : undefined}
      />

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((k, i) => {
          const active = k.bucket && bucket === k.bucket
          const inner = (
            <Card className={cn('px-4 py-3 transition-all', k.bucket && 'hover:-translate-y-0.5 hover:shadow-pop', active && 'ring-2 ring-[var(--accent)]')} style={attentionStripe(attentionOf(k.tone))}>
              <p className="text-2xs font-semibold text-ink-2">{k.label}</p>
              {k.value === undefined ? (
                <Skeleton className="mt-1.5 h-7 w-10" />
              ) : (
                <p className="mt-0.5 flex items-center gap-1.5 text-2xl font-semibold tracking-tight" style={{ color: k.tone ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {k.value}
                <AttentionIcon level={attentionOf(k.tone)} /></p>
              )}
            </Card>
          )
          return k.bucket ? (
            <button key={k.label} className="animate-rise text-left" style={{ animationDelay: `${i * 35}ms` }}
              onClick={() => setBucket(active ? 'all' : k.bucket!)}>
              {inner}
            </button>
          ) : (
            <div key={k.label} className="animate-rise" style={{ animationDelay: `${i * 35}ms` }}>{inner}</div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {view === 'register' && (
          <>
            <label className="flex min-w-52 flex-1 cursor-text items-center gap-2 rounded-lg border coarse:min-h-11 bg-surface px-3 py-2 coarse:py-0 md:max-w-xs focus-within:border-accent">
              <Search size={14} aria-hidden className="shrink-0 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search asset, serial, owner, location…"
                className="w-full coarse:self-stretch bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory | '')} className="h-9 coarse:h-11 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by category">
              <option value="">All categories</option>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            {bucket !== 'all' && (
              <Badge tone="accent">
                <button onClick={() => setBucket('all')} aria-label={`Clear filter: ${BUCKET_LABEL[bucket]}`}>
                  {BUCKET_LABEL[bucket]} ✕
                </button>
              </Badge>
            )}
            {status && (
              <Badge tone="accent">
                <button onClick={clearStatus} aria-label={`Clear filter: ${status}`}>{status} ✕</button>
              </Badge>
            )}
          </>
        )}
        <div className="ml-auto min-w-0">
          <Tabs items={viewTabs} value={view} onChange={switchView} className="border-b-0" />
        </div>
      </div>

      {view === 'register' && (
        <RegisterTable assets={assets} sites={sites} onOpen={setOpenAssetId} />
      )}
      {view === 'inspections' && (
        <InspectionsList
          inspections={inspections}
          actor={actor}
          manage={manage}
          onRun={setRunInspection}
          onOpenAsset={setOpenAssetId}
        />
      )}
      {view === 'calendar' && (
        <InspectionCalendar
          inspections={inspections}
          actor={actor}
          manage={manage}
          onRun={setRunInspection}
        />
      )}
      {view === 'analytics' && <AssetAnalytics stats={stats} sites={sites} onOpenAsset={setOpenAssetId} />}

      {/* Calibration, maintenance and the fitness counts, none of which the health-based
          analytics view can express. */}
      {view === 'board' && company && <EquipmentBoard companyId={company.id} siteId={site?.id} />}

      <AssetDrawer
        assetId={openAssetId}
        manage={manage}
        onClose={() => setOpenAssetId(null)}
        onRun={(i) => setRunInspection(i)}
        onChanged={refresh}
      />

      <InspectionRunner
        inspection={runInspection}
        onClose={() => setRunInspection(null)}
        onCompleted={() => refresh()}
      />

      <NewAssetDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refresh() }} />
    </>
  )
}

function RegisterTable({
  assets, sites, onOpen,
}: {
  assets: AssetView[] | null
  sites: { id: string; short: string }[]
  onOpen: (id: string) => void
}) {
  if (assets === null) {
    return (
      <Card className="space-y-3 p-5">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </Card>
    )
  }
  const siteShort = (id: string) => sites.find((s) => s.id === id)?.short ?? id.toUpperCase()
  return (
    <Card>
      {/* 900px wide, so it scrolls sideways on a phone; focusable and named so a keyboard can too. */}
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Asset register">
        <table className="w-full min-w-[900px] text-left">
          <thead>
            <tr className="border-b text-2xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2.5 font-semibold">Asset</th>
              <th className="px-3 py-2.5 font-semibold">Category</th>
              <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Site / Dept</th>
              <th className="px-3 py-2.5 font-semibold">Health</th>
              <th className="px-3 py-2.5 font-semibold">Next inspection</th>
              <th className="hidden px-3 py-2.5 font-semibold xl:table-cell">Defects</th>
              <th className="px-5 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              return (
                <tr key={a.id} onClick={() => onOpen(a.id)} className="cursor-pointer border-b last:border-0 hover:bg-accent-soft/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug text-ink">{a.name}</p>
                        <p className="text-2xs text-muted"><span className="font-mono">{a.code}</span> · S/N {a.serialNumber}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-2">{CATEGORY_LABEL[a.category]}</td>
                  <td className="hidden px-3 py-3 text-xs text-ink-2 lg:table-cell">{siteShort(a.siteId)} · {a.department}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: healthColor(a.health), fontVariantNumeric: 'tabular-nums' }}>{a.health}</span>
                      <StatusPill kind={RISK_PILL[a.risk]} label={a.risk} />
                    </div>
                  </td>
                  <td className={cn('px-3 py-3 text-xs font-semibold', a.overdue ? 'text-critical' : 'text-ink-2')} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {a.nextDueDate}
                    <span className="block text-2xs font-normal">
                      {a.overdue ? `${Math.abs(a.daysToDue)}d overdue` : a.daysToDue === 0 ? 'due today' : `in ${a.daysToDue}d`}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    {a.openDefects > 0 ? <Badge tone="critical">{a.openDefects} open</Badge> : <span className="text-2xs text-muted">none</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={a.status === 'In Service' ? 'good' : a.status === 'Under Maintenance' ? 'warning' : 'neutral'}>{a.status}</Badge>
                  </td>
                </tr>
              )
            })}
            {assets.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted">No assets match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
