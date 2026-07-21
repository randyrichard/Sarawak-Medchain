import { useEffect, useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, MapPin, ShieldCheck, Save } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { LoginEvent, SecurityCenter, SecuritySettings } from '@/api/admin'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Input, Skeleton, StatusPill, Switch, Tabs,
  type TabItem,
} from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { downloadCsv, useAdminActor } from '../lib'

type Tab = 'center' | 'policy' | 'logins'

export function SecuritySection() {
  const [tab, setTab] = useState<Tab>('center')
  const tabs: TabItem<Tab>[] = [
    { value: 'center', label: 'Security Center' },
    { value: 'policy', label: 'Authentication Policy' },
    { value: 'logins', label: 'Login History' },
  ]
  return (
    <div className="space-y-4">
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'center' && <CenterPanel />}
      {tab === 'policy' && <PolicyPanel />}
      {tab === 'logins' && <LoginsPanel />}
    </div>
  )
}

const SEV_ICON = { critical: AlertOctagon, serious: AlertTriangle, warning: AlertTriangle, good: CheckCircle2 }
const SEV_COLOR = { critical: 'var(--critical)', serious: 'var(--serious)', warning: 'var(--warning)', good: 'var(--good)' }

function CenterPanel() {
  const { company } = useOrg()
  const [sc, setSc] = useState<SecurityCenter | null>(null)
  useEffect(() => { if (company) api.adminSecurityCenter(company.id).then(setSc) }, [company])

  if (!sc) return <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>

  const tiles = [
    { label: 'MFA adoption', value: `${sc.mfaAdoptionPct}%`, tone: sc.mfaAdoptionPct >= 90 ? 'var(--good)' : 'var(--warning)', note: `${sc.mfaEnabledCount}/${sc.totalUsers} users` },
    { label: 'Weak passwords', value: sc.weakPasswords, tone: sc.weakPasswords > 0 ? 'var(--critical)' : 'var(--good)', note: 'below policy' },
    { label: 'Inactive accounts', value: sc.inactiveUsers, tone: sc.inactiveUsers > 0 ? 'var(--warning)' : 'var(--good)', note: '60+ days idle' },
    { label: 'Suspicious logins', value: sc.suspiciousLogins, tone: sc.suspiciousLogins > 0 ? 'var(--critical)' : 'var(--good)', note: 'last 7 days' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="px-4 py-3.5">
            <p className="text-2xs font-semibold text-ink-2">{t.label}</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight" style={{ color: t.tone, fontVariantNumeric: 'tabular-nums' }}>{t.value}</p>
            <p className="text-2xs text-muted">{t.note}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Security recommendations" subtitle="Ranked by risk — resolve from the top" />
        <CardBody className="space-y-2">
          {sc.findings.map((f) => {
            const Icon = SEV_ICON[f.severity]
            return (
              <div key={f.id} className="flex items-start gap-3 rounded-lg border px-3.5 py-3" style={{ borderColor: SEV_COLOR[f.severity] }}>
                <Icon size={17} className="mt-0.5 shrink-0" style={{ color: SEV_COLOR[f.severity] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{f.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{f.detail}</p>
                </div>
                <Badge tone="neutral">{f.metric}</Badge>
              </div>
            )
          })}
        </CardBody>
      </Card>
    </div>
  )
}

function PolicyPanel() {
  const actor = useAdminActor()
  const [s, setS] = useState<SecuritySettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.adminGetSecurity().then(setS) }, [])
  if (!s) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
  const set = (p: Partial<SecuritySettings>) => setS({ ...s, ...p })

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await api.adminUpdateSecurity(s, actor)
      setFlash(true); setTimeout(() => setFlash(false), 2500)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Password policy" subtitle="Enforced on every password set or reset" />
        <CardBody className="space-y-3">
          {flash && <Alert tone="success">Security policy saved.</Alert>}
          {error && <Alert tone="critical">{error}</Alert>}
          <Input label="Minimum length" type="number" value={String(s.passwordMinLength)} onChange={(e) => set({ passwordMinLength: Number(e.target.value) || 8 })} className="w-32" />
          <div className="space-y-2">
            <Switch checked={s.requireUppercase} onChange={(v) => set({ requireUppercase: v })} label="Require an uppercase letter" />
            <Switch checked={s.requireNumber} onChange={(v) => set({ requireNumber: v })} label="Require a number" />
            <Switch checked={s.requireSymbol} onChange={(v) => set({ requireSymbol: v })} label="Require a symbol" />
          </div>
          <Input label="Password expiry (days, 0 = never)" type="number" value={String(s.passwordExpiryDays)} onChange={(e) => set({ passwordExpiryDays: Number(e.target.value) || 0 })} className="w-40" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sessions & MFA" subtitle="Lockout, session lifetime and MFA enforcement" />
        <CardBody className="space-y-3">
          <Input label="Account lockout after N failed attempts" type="number" value={String(s.lockoutThreshold)} onChange={(e) => set({ lockoutThreshold: Number(e.target.value) || 5 })} className="w-40" />
          <Input label="Session timeout (hours)" type="number" value={String(s.sessionTimeoutHours)} onChange={(e) => set({ sessionTimeoutHours: Number(e.target.value) || 8 })} className="w-40"
            hint="Applies to your next sign-in — sessions expire after this many hours." />
          <div className="rounded-lg border px-3.5 py-3">
            <Switch checked={s.mfaRequired} onChange={(v) => set({ mfaRequired: v })} label="Require multi-factor authentication for all users" />
            <p className="mt-1 text-2xs text-muted">New users must enrol in MFA at first sign-in.</p>
          </div>
          <Button icon={<Save size={14} />} loading={busy} onClick={() => void save()}>Save policy</Button>
        </CardBody>
      </Card>
    </div>
  )
}

function LoginsPanel() {
  const [events, setEvents] = useState<LoginEvent[] | null>(null)
  useEffect(() => { api.adminLoginHistory().then(setEvents) }, [])

  const exportCsv = () => downloadCsv(
    ['Time', 'User', 'Email', 'Result', 'IP', 'Device', 'Location', 'Suspicious'],
    (events ?? []).map((e) => [e.at, e.userName, e.email, e.result, e.ip, e.device, e.location, e.suspicious ? 'YES' : '']),
    'safeops-login-history.csv',
  )

  if (events === null) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
  return (
    <Card>
      <CardHeader title="Login history" subtitle="Every sign-in attempt across the tenant" right={<Button size="sm" variant="ghost" onClick={exportCsv}>Export</Button>} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b text-2xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2.5 font-semibold">User</th>
              <th className="px-3 py-2.5 font-semibold">Result</th>
              <th className="px-3 py-2.5 font-semibold">IP / Device</th>
              <th className="px-3 py-2.5 font-semibold">Location</th>
              <th className="px-5 py-2.5 text-right font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b last:border-0" style={e.suspicious ? { background: 'var(--critical-soft)' } : undefined}>
                <td className="px-5 py-3"><p className="text-sm font-medium text-ink">{e.userName}</p><p className="text-2xs text-muted">{e.email}</p></td>
                <td className="px-3 py-3"><StatusPill kind={e.result === 'success' ? 'good' : 'critical'} label={e.result === 'success' ? 'Success' : 'Failed'} /></td>
                <td className="px-3 py-3 text-xs text-ink-2"><span className="font-mono">{e.ip}</span><span className="block text-2xs text-muted">{e.device}</span></td>
                <td className="px-3 py-3 text-xs text-ink-2">
                  <span className="inline-flex items-center gap-1">{e.suspicious && <MapPin size={11} className="text-critical" />}{e.location}</span>
                  {e.suspicious && <Badge tone="critical" className="ml-1.5">Unusual</Badge>}
                </td>
                <td className="px-5 py-3 text-right text-2xs text-muted">{timeAgo(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
