import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarPlus, FileText, Link2, PlayCircle, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { AssetView, InspectionView } from '@/api/assets'
import { CATEGORY_LABEL, FREQUENCY_LABEL } from '@/api/assets'
import type { CapaItem } from '@/api/capa'
import { useActor, fmtDate, fmtDateTime } from '@/features/incidents/lib'
import { PEOPLE } from '@/features/incidents/lib'
import { Alert, Avatar, Badge, Button, Dialog, Input, Select, Skeleton, StatusPill } from '@/components/ui'
import { CATEGORY_ICON, healthColor, RISK_PILL } from '../lib'
import { QrBlock } from './QrBlock'
import { cn } from '@/lib/cn'

interface Profile {
  asset: AssetView
  inspections: InspectionView[]
  openActions: CapaItem[]
}

export function AssetDrawer({
  assetId, manage, onClose, onRun, onChanged,
}: {
  assetId: string | null
  manage: boolean
  onClose: () => void
  onRun: (inspection: InspectionView) => void
  onChanged: () => void
}) {
  const actor = useActor()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [missing, setMissing] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [date, setDate] = useState('')
  const [inspector, setInspector] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!assetId) return
    setProfile(null)
    setMissing(false)
    api.getAssetProfile(assetId)
      .then((p) => {
        setProfile(p)
        setDate(p.asset.nextDueDate)
        setInspector(p.asset.owner)
      })
      .catch(() => setMissing(true))
  }, [assetId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !scheduleOpen && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, scheduleOpen])

  if (!assetId) return null

  const asset = profile?.asset
  const Icon = asset ? CATEGORY_ICON[asset.category] : FileText
  const nextScheduled = profile?.inspections.find((i) => i.status === 'Scheduled')

  const schedule = async () => {
    if (!asset) return
    setBusy(true)
    setError(null)
    try {
      await api.scheduleInspection(asset.id, date, inspector, actor)
      setScheduleOpen(false)
      onChanged()
      const p = await api.getAssetProfile(asset.id)
      setProfile(p)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Scheduling failed.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-label="Asset profile" className="absolute inset-y-0 right-0 flex w-full max-w-[540px] animate-scale-in flex-col border-l bg-surface shadow-modal">
        {missing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted">Asset not found — the QR label may be stale.</p>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        ) : !asset ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft">
                    <Icon size={17} className="text-accent" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold leading-snug tracking-tight text-ink">{asset.name}</h2>
                    <p className="text-2xs text-muted">
                      <span className="font-mono">{asset.code}</span> · {CATEGORY_LABEL[asset.category]} · S/N {asset.serialNumber}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPill kind={RISK_PILL[asset.risk]} label={`${asset.risk} risk`} />
                  <Badge tone={asset.status === 'In Service' ? 'good' : asset.status === 'Under Maintenance' ? 'warning' : 'neutral'}>{asset.status}</Badge>
                  {asset.overdue && <Badge tone="critical">Inspection {Math.abs(asset.daysToDue)}d overdue</Badge>}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Health */}
              <div className="flex items-center gap-4 rounded-xl border p-4">
                <div className="relative h-20 w-20 shrink-0">
                  <svg width="80" height="80" className="-rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="var(--grid)" strokeWidth="7" />
                    <circle cx="40" cy="40" r="34" fill="none" stroke={healthColor(asset.health)} strokeWidth="7"
                      strokeDasharray={`${(asset.health / 100) * 213.6} 213.6`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {asset.health}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xs font-bold uppercase tracking-wider text-muted">Health score</p>
                  {asset.healthFactors.length === 0 ? (
                    <p className="mt-1 text-sm text-ink-2">No deductions — inspections current, no open defects.</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {asset.healthFactors.map((f) => (
                        <li key={f.label} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-ink-2">{f.label}</span>
                          <span className="font-semibold text-critical" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.delta}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Next inspection */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3">
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-muted">Next inspection</p>
                  <p className={cn('text-sm font-semibold', asset.overdue ? 'text-critical' : 'text-ink')}>
                    {asset.nextDueDate} · {FREQUENCY_LABEL[asset.frequency].toLowerCase()} cycle
                  </p>
                  {nextScheduled && <p className="text-2xs text-muted">Inspector: {nextScheduled.assignedTo}</p>}
                </div>
                <div className="flex gap-2">
                  {nextScheduled && (
                    <Button size="sm" icon={<PlayCircle size={13} />} onClick={() => onRun(nextScheduled)}>
                      Run now
                    </Button>
                  )}
                  {manage && (
                    <Button size="sm" variant="secondary" icon={<CalendarPlus size={13} />} onClick={() => { setError(null); setScheduleOpen(true) }}>
                      Reschedule
                    </Button>
                  )}
                </div>
              </div>

              {/* Open defects */}
              {profile!.openActions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Open defects</p>
                  <ul className="space-y-1.5">
                    {profile!.openActions.map((a) => (
                      <li key={a.id}>
                        <Link to={`/actions?open=${a.id}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-accent-soft/50" style={{ borderColor: 'var(--serious)' }}>
                          <Link2 size={12} className="shrink-0 text-accent" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{a.title}</span>
                          <span className="font-mono text-2xs text-muted">{a.code}</span>
                          <StatusPill kind={a.overdue ? 'critical' : 'warning'} label={a.derived} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Profile */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Meta label="Site · Dept" value={`${asset.siteId.toUpperCase()} · ${asset.department}`} />
                <Meta label="Location" value={asset.location} />
                <Meta label="Owner"><span className="flex items-center gap-1.5"><Avatar name={asset.owner} size={16} />{asset.owner}</span></Meta>
                <Meta label="Manufacturer" value={`${asset.manufacturer} ${asset.model}`} />
                {asset.commissionDate && <Meta label="Commissioned" value={fmtDate(asset.commissionDate)} />}
                {asset.warrantyUntil && <Meta label="Warranty until" value={fmtDate(asset.warrantyUntil)} />}
                {asset.lastInspectedAt && <Meta label="Last inspected" value={fmtDateTime(asset.lastInspectedAt)} />}
                <Meta label="Frequency" value={FREQUENCY_LABEL[asset.frequency]} />
              </div>

              {/* QR */}
              <QrBlock qrKey={asset.qrKey} />

              {/* Documents */}
              {asset.documents.length > 0 && (
                <div>
                  <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Documents</p>
                  <ul className="space-y-1.5">
                    {asset.documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-ink-2">
                        <FileText size={13} className="text-accent" /> {d.name}
                        {d.kind === 'certificate' && <Badge tone="accent">Certificate</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* History */}
              <div>
                <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Inspection history</p>
                <ul className="space-y-1.5">
                  {profile!.inspections.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="font-mono text-2xs text-muted">{i.code}</span>
                      <span className="min-w-0 flex-1 text-xs text-ink-2">
                        {i.status === 'Completed' ? `${fmtDateTime(i.completedAt!)} · ${i.completedBy}` : `Scheduled ${i.scheduledFor} · ${i.assignedTo}`}
                      </span>
                      {i.status === 'Completed' ? (
                        <StatusPill kind={i.outcome === 'passed' ? 'good' : 'critical'} label={i.outcome === 'passed' ? 'Passed' : `Failed · ${i.actionCodes.length} defect(s)`} />
                      ) : (
                        <StatusPill kind={i.overdue ? 'critical' : 'info'} label={i.overdue ? 'Overdue' : 'Scheduled'} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Schedule dialog */}
      <Dialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title={`Schedule inspection — ${asset?.code ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => void schedule()}>Schedule</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select label="Inspector" value={inspector} onChange={(e) => setInspector(e.target.value)} hint="They're notified immediately.">
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </div>
      </Dialog>
    </div>,
    document.body,
  )
}

function Meta({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs text-muted">{label}</p>
      <div className="text-sm font-medium text-ink">{children ?? value}</div>
    </div>
  )
}
