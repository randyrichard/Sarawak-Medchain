import { useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Cpu, Database, HardDrive, Info, RefreshCw, Users, Zap,
} from 'lucide-react'
import { api } from '@/api/client'
import type { SystemHealth } from '@/api/admin'
import { Badge, Button, Card, CardBody, CardHeader, Skeleton, StatusPill } from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'

export function OverviewSection() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = () => api.adminSystemHealth().then(setHealth)
  useEffect(() => {
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [])

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setTimeout(() => setRefreshing(false), 400)
  }

  if (!health) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
  }

  const storagePct = Math.round((health.storageUsedKb / health.storageQuotaKb) * 100)
  const statusPill = (s: 'operational' | 'degraded' | 'down') =>
    <StatusPill kind={s === 'operational' ? 'good' : s === 'degraded' ? 'warning' : 'critical'} label={s === 'operational' ? 'Operational' : s === 'degraded' ? 'Degraded' : 'Down'} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">Live platform status · uptime <span className="font-semibold text-ink">{health.uptimePct}%</span></p>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />} onClick={() => void refresh()}>Refresh</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} label="Users online" value={String(health.usersOnline)} note="active in last 15 min" tone="var(--good)" />
        <StatTile icon={Zap} label="API" value={statusPill(health.apiStatus)} note={`${health.apiLatencyMs}ms median latency`} />
        <StatTile icon={Database} label="Database" value={statusPill(health.dbStatus)} note="primary + replica healthy" />
        <StatTile icon={AlertTriangle} label="Failed notifications" value={String(health.failedNotifications)} note="last 24 hours" tone={health.failedNotifications > 0 ? 'var(--warning)' : 'var(--good)'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Background jobs" subtitle="Scheduled workers keeping the platform current" />
          <CardBody className="space-y-2">
            {health.jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5">
                <Cpu size={15} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{j.name}</p>
                  <p className="text-2xs text-muted">{j.detail} · {j.schedule}</p>
                </div>
                <span className="text-2xs text-muted">ran {timeAgo(j.lastRun)}</span>
                <StatusPill kind={j.status === 'ok' ? 'good' : j.status === 'running' ? 'info' : 'critical'} label={j.status === 'ok' ? 'OK' : j.status === 'running' ? 'Running' : 'Failed'} />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Storage" subtitle="Tenant data footprint" />
          <CardBody>
            <div className="flex items-center gap-3">
              <HardDrive size={20} className="text-accent" />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{(health.storageUsedKb / 1024).toFixed(2)} MB</span>
                  <span className="text-2xs text-muted">of {(health.storageQuotaKb / 1024).toFixed(0)} MB</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-grid">
                  <div className="h-full rounded-full" style={{ width: `${storagePct}%`, background: storagePct > 80 ? 'var(--critical)' : storagePct > 60 ? 'var(--warning)' : 'var(--good)' }} />
                </div>
                <p className="mt-1 text-2xs text-muted">{storagePct}% used · measured live from tenant store</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="System alerts" subtitle="Recent platform events" />
        <CardBody className="space-y-1.5">
          {health.alerts.map((a) => {
            const Icon = a.severity === 'critical' ? AlertTriangle : a.severity === 'warning' ? AlertTriangle : a.severity === 'info' ? Info : CheckCircle2
            const color = a.severity === 'critical' ? 'var(--critical)' : a.severity === 'warning' ? 'var(--warning)' : 'var(--accent)'
            return (
              <div key={a.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <Icon size={14} style={{ color }} />
                <span className="flex-1 text-sm text-ink-2">{a.text}</span>
                <Badge tone="neutral">{timeAgo(a.at)}</Badge>
              </div>
            )
          })}
        </CardBody>
      </Card>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, note, tone }: { icon: typeof Users; label: string; value: React.ReactNode; note: string; tone?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-muted" />
        <span className="text-2xs font-semibold text-ink-2">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight" style={{ color: tone ?? 'var(--ink)' }}>{value}</div>
      <p className="mt-0.5 text-2xs text-muted">{note}</p>
    </Card>
  )
}
