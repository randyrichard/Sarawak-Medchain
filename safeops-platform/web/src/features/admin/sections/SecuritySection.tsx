import { useEffect, useState } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Save } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { LoginEvent, SecurityCenter, SecuritySettings } from '@/api/admin'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, ErrorState, Input, Skeleton, StatusPill, Switch, Tabs, type TabItem, AttentionIcon, attentionOf, attentionStripe,
} from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { timeAgo } from '@/lib/time'
import { downloadCsv, useAdminActor } from '../lib'
import { useUrlState } from '@/lib/useUrlState'

const TABS = ['center', 'policy', 'logins'] as const
type Tab = (typeof TABS)[number]

export function SecuritySection() {
  const [tab, setTab] = useUrlState<Tab>('tab', 'center', TABS)
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
  const companyId = company?.id ?? ''
  // useAsync, not a bare effect: a failed load used to leave the skeleton on screen for good.
  const center = useAsync<SecurityCenter>(() => api.adminSecurityCenter(companyId), [companyId], { enabled: Boolean(companyId) })
  const sc = center.data

  if (!sc && center.status === 'error') return <ErrorState title="Couldn't load the Security Center" error={center.error} onRetry={center.reload} />
  if (!sc) return <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>

  const tiles = [
    { label: 'MFA adoption', value: `${sc.mfaAdoptionPct}%`, tone: sc.mfaAdoptionPct >= 90 ? 'var(--good)' : 'var(--warning)', note: `${sc.mfaEnabledCount}/${sc.totalUsers} users` },
    // Not "weak passwords": with Argon2id the server holds only a digest and genuinely
    // cannot tell a weak password from a strong one — that is what the hashing is for.
    // What it does know is which accounts an administrator has flagged for reset.
    { label: 'Pending resets', value: sc.weakPasswords, tone: sc.weakPasswords > 0 ? 'var(--warning)' : 'var(--good)', note: 'must change at next sign-in' },
    { label: 'Inactive accounts', value: sc.inactiveUsers, tone: sc.inactiveUsers > 0 ? 'var(--warning)' : 'var(--good)', note: '60+ days idle' },
    // Counted over 30 days by the server; this said 7. A few failures are normal (typos), so
    // the colour follows the volume rather than turning red at the first one.
    { label: 'Failed sign-ins', value: sc.suspiciousLogins, tone: sc.suspiciousLogins === 0 ? 'var(--good)' : sc.suspiciousLogins >= 10 ? 'var(--critical)' : 'var(--warning)', note: 'last 30 days' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="px-4 py-3.5" style={attentionStripe(attentionOf(t.tone))}>
            <p className="text-2xs font-semibold text-ink-2">{t.label}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-2xl font-semibold tracking-tight" style={{ color: t.tone, fontVariantNumeric: 'tabular-nums' }}>{t.value}<AttentionIcon level={attentionOf(t.tone)} /></p>
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
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const actor = useAdminActor()
  const [s, setS] = useState<SecuritySettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * Loaded per company. It used to load once with no dependencies, so switching company
   * kept showing - and on Save, wrote - the previous company's policy under the new one.
   */
  const loaded = useAsync<SecuritySettings>(() => api.adminGetSecurity(companyId), [companyId], { enabled: Boolean(companyId) })
  useEffect(() => { setS(loaded.data ?? null) }, [loaded.data])
  if (!s && loaded.status === 'error') return <ErrorState title="Couldn't load the security policy" error={loaded.error} onRetry={loaded.reload} />
  if (!s) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
  const set = (p: Partial<SecuritySettings>) => setS({ ...s, ...p })

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await api.adminUpdateSecurity(companyId, s, actor)
      setFlash(true); setTimeout(() => setFlash(false), 2500)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Password policy" subtitle="Enforced whenever a password is set: changed, reset or chosen on joining" />
        <CardBody className="space-y-5">
          {flash && <Alert tone="success">Security policy saved.</Alert>}
          {error && <Alert tone="critical">{error}</Alert>}
          <Input label="Minimum length" type="number" min={12} value={String(s.passwordMinLength)} onChange={(e) => set({ passwordMinLength: Number(e.target.value) || 12 })} className="w-32"
            hint="12 or more. SafeOps never accepts fewer than 12 characters." />
          <div className="space-y-2">
            {/* Always on: SafeOps requires both on every account. Shown so the page says what applies. */}
            <Switch checked disabled onChange={() => {}} label="Require an uppercase letter (always required)" />
            <Switch checked disabled onChange={() => {}} label="Require a number (always required)" />
            <Switch checked={s.requireSymbol} onChange={(v) => set({ requireSymbol: v })} label="Require a symbol" />
          </div>
          <Input label="Password expiry (days, 0 = never)" type="number" value={String(s.passwordExpiryDays)} onChange={(e) => set({ passwordExpiryDays: Number(e.target.value) || 0 })} className="w-40"
            hint="Counted from when each password was last set. When it runs out, the person must choose a new one at their next sign-in." />
          <p className="text-2xs text-muted">Someone who belongs to more than one organisation follows the strictest of their policies.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sessions & MFA" subtitle="Lockout, session lifetime and MFA enforcement" />
        <CardBody className="space-y-5">
          <Input label="Account lockout after N failed attempts" type="number" value={String(s.lockoutThreshold)} onChange={(e) => set({ lockoutThreshold: Number(e.target.value) || 5 })} className="w-40"
            hint="Wrong passwords and wrong codes both count. The account then stays locked for a set time (15 minutes unless the server is configured otherwise), or until an administrator unlocks it." />
          <Input label="Session timeout (hours)" type="number" value={String(s.sessionTimeoutHours)} onChange={(e) => set({ sessionTimeoutHours: Number(e.target.value) || 12 })} className="w-40"
            hint="Applies from each person's next sign-in: they are signed out this many hours after signing in, however active they are." />
          <div className="rounded-lg border px-3.5 py-3">
            <Switch checked={s.mfaRequired} onChange={(v) => set({ mfaRequired: v })} label="Require multi-factor authentication for all users" />
            <p className="mt-1 text-2xs text-muted">Anyone without it is asked to set up an authenticator app the next time they sign in, and can do nothing else until they have.</p>
          </div>
          <Button icon={<Save size={14} />} loading={busy} onClick={() => void save()}>Save policy</Button>
        </CardBody>
      </Card>
    </div>
  )
}

/** Why an attempt is worth a look, in words. Matches SUSPICIOUS_OUTCOMES in adminService.ts. */
const OUTCOME_LABEL: Record<string, string> = {
  locked_out: 'Tried a locked account',
  deactivated: 'Tried a deactivated account',
  workspace_suspended: 'Workspace suspended',
}

function LoginsPanel() {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const history = useAsync<LoginEvent[]>(() => api.adminLoginHistory(companyId), [companyId], { enabled: Boolean(companyId) })
  const events = history.data ?? null

  const exportCsv = () => downloadCsv(
    // No location column: SafeOps does not look up where an address is, so it was always empty.
    ['Time', 'User', 'Email', 'Result', 'IP', 'Device', 'Needs a look'],
    (events ?? []).map((e) => [e.at, e.userName, e.email, e.result, e.ip, e.device, e.suspicious ? 'YES' : '']),
    'safeops-login-history.csv',
  )

  if (events === null && history.status === 'error') return <ErrorState title="Couldn't load the login history" error={history.error} onRetry={history.reload} />
  if (events === null) return <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
  return (
    <Card>
      <CardHeader title="Login history" subtitle="Every sign-in attempt across the tenant" right={<Button size="sm" variant="ghost" onClick={exportCsv}>Export</Button>} />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b text-2xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2.5 font-semibold">User</th>
              <th className="px-3 py-2.5 font-semibold">Result</th>
              <th className="px-3 py-2.5 font-semibold">IP / Device</th>
              <th className="px-3 py-2.5 font-semibold">Needs a look</th>
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
                  {e.suspicious && <Badge tone="critical">{OUTCOME_LABEL[e.outcome ?? ''] ?? 'Unusual'}</Badge>}
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
