import { useEffect, useState } from 'react'
import { Check, Copy, Plus, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react'
import { api } from '@/api/client'
import { API_BASE_URL } from '@/api/authApi'
import { useOrg } from '@/features/org/OrgContext'
import { ApiError } from '@/api/types'
import type { ApiKey, RbacAction, Webhook } from '@/api/admin'
import { RBAC_ACTIONS, WEBHOOK_EVENTS } from '@/api/admin'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, ErrorState, Input, Skeleton, StatusPill,
  Switch, Tabs, type TabItem,
} from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { timeAgo } from '@/lib/time'
import { useAdminActor } from '../lib'
import { cn } from '@/lib/cn'
import { useUrlState } from '@/lib/useUrlState'

const TABS = ['keys', 'webhooks', 'usage', 'docs'] as const
type Tab = (typeof TABS)[number]

/**
 * Why creating an integration is off, when it is.
 *
 * API keys and webhooks sit on the Premium side of the line. What is gated is issuing a
 * new one: the panels still list what a workspace holds, and still revoke and disable -
 * a plan must never be able to trap a customer with a credential they cannot turn off.
 * The API enforces the same split; this only explains it before the click.
 *
 * Deliberately not an upsell. Neither capability is finished - see planCatalog.ts - and
 * pushing somebody towards a paid plan to reach something that does not work yet is the
 * one thing this notice must not do.
 */
function PlanGate({ thing, planLabel }: { thing: string; planLabel: string }) {
  return (
    <Alert tone="info" title={`${thing} are not available on ${planLabel}`}>
      Anything already created here keeps working, and you can still revoke or disable it —
      only creating a new one is unavailable.
    </Alert>
  )
}

/** The stored plan key, title-cased for a sentence. */
function usePlanLabel(): string {
  const { company } = useOrg()
  if (!company?.plan) return 'your current plan'
  return company.plan.charAt(0).toUpperCase() + company.plan.slice(1)
}

export function DeveloperSection() {
  const [tab, setTab] = useUrlState<Tab>('tab', 'keys', TABS)
  const tabs: TabItem<Tab>[] = [
    { value: 'keys', label: 'API Keys' },
    { value: 'webhooks', label: 'Webhooks' },
    { value: 'usage', label: 'Usage' },
    { value: 'docs', label: 'Documentation' },
  ]
  return (
    <div className="space-y-4">
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'keys' && <KeysPanel />}
      {tab === 'webhooks' && <WebhooksPanel />}
      {tab === 'usage' && <UsagePanel />}
      {tab === 'docs' && <DocsPanel />}
    </div>
  )
}

function KeysPanel() {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const actor = useAdminActor()
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const integrations = company?.entitlements.integrations ?? true
  const planLabel = usePlanLabel()

  const load = () => api.adminListApiKeys(companyId).then(setKeys)
  useEffect(() => { load() }, [])

  const revoke = async (id: string) => {
    setError(null)
    try { await api.adminRevokeApiKey(companyId, id, actor); load() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      {!integrations && <PlanGate thing="API keys" planLabel={planLabel} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">Signed keys for the SafeChain REST API. Treat them like passwords.</p>
        <Button
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setNewOpen(true)}
          disabled={!integrations}
        >
          Generate Key
        </Button>
      </div>
      <Card>
        {keys === null ? <div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="API keys">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-semibold">Key</th>
                  <th className="px-3 py-2.5 font-semibold">Scopes</th>
                  <th className="px-3 py-2.5 font-semibold">Last Used</th>
                  <th className="px-3 py-2.5 font-semibold">Calls Today</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={cn('border-b last:border-0', k.revoked && 'opacity-55')}>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-ink">{k.name}</p>
                      <p className="font-mono text-2xs text-muted">{k.masked}</p>
                    </td>
                    <td className="px-3 py-3">{k.scopes.map((s) => <Badge key={s} tone="neutral" className="mr-1">{s}</Badge>)}</td>
                    <td className="px-3 py-3 text-2xs text-muted">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : 'never'}</td>
                    <td className="px-3 py-3 text-xs text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{k.callsToday.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      {k.revoked ? <Badge tone="neutral">Revoked</Badge> : (
                        <div className="flex items-center justify-end gap-2">
                          <StatusPill kind="good" label="Active" />
                          <button onClick={() => void revoke(k.id)} className="rounded p-1 text-muted hover:text-critical" aria-label="Revoke"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <NewKeyDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); load() }} />
    </div>
  )
}

function NewKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const actor = useAdminActor()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<RbacAction[]>(['view'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toggle = (a: RbacAction) => setScopes((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]))

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const { secret } = await api.adminCreateApiKey(companyId, name, scopes, actor)
      setSecret(secret)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') } finally { setBusy(false) }
  }

  const close = () => { setName(''); setScopes(['view']); setSecret(null); setCopied(false); onClose(); if (secret) onCreated() }

  return (
    <Dialog
      error={error} open={open} onClose={close} title="Generate API Key" description="Scoped access to the SafeChain REST API."
      footer={secret ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Generate</Button></>}>
      <div className="space-y-3">
        {secret ? (
          <>
            <Alert tone="warning" title="Copy your key now">This secret is shown once and cannot be retrieved again.</Alert>
            <div className="flex items-center gap-2 rounded-lg border bg-sunken px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{secret}</code>
              <Button size="sm" variant="secondary" icon={copied ? <Check size={12} /> : <Copy size={12} />}
                onClick={() => { navigator.clipboard?.writeText(secret).catch(() => {}); setCopied(true) }}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Input label="Key name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data warehouse sync" />
            <div>
              <p className="mb-1.5 text-xs font-semibold text-ink-2">Scopes</p>
              <div className="flex flex-wrap gap-3">
                {RBAC_ACTIONS.map((a) => <Checkbox key={a} label={a} checked={scopes.includes(a)} onChange={() => toggle(a)} />)}
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

function WebhooksPanel() {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const actor = useAdminActor()
  const [hooks, setHooks] = useState<Webhook[] | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const integrations = company?.entitlements.integrations ?? true
  const planLabel = usePlanLabel()

  const load = () => api.adminListWebhooks(companyId).then(setHooks)
  useEffect(() => { load() }, [])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn(); load() } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      {!integrations && <PlanGate thing="Webhooks" planLabel={planLabel} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">Send events to your endpoints over HTTPS, usually within 30 seconds of them happening.</p>
        <Button
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => setNewOpen(true)}
          disabled={!integrations}
        >
          Add Webhook
        </Button>
      </div>
      {hooks === null ? <Skeleton className="h-40 w-full rounded-xl" /> : hooks.map((wh) => (
        <Card key={wh.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-sm text-ink"><WebhookIcon size={14} className="text-accent" /> {wh.url}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">{wh.events.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}</div>
            </div>
            <Switch checked={wh.active} onChange={() => void act(() => api.adminToggleWebhook(companyId, wh.id, actor))} />
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-2xs text-muted">
            <span>Secret {wh.secretMasked}
              {wh.lastDelivery && <> · last delivery <span className={wh.lastDelivery.status === 'success' ? 'text-good' : 'text-critical'}>{wh.lastDelivery.code}</span> {timeAgo(wh.lastDelivery.at)}</>}
            </span>
            <Button size="sm" variant="ghost" icon={<Send size={11} />} onClick={() => void act(() => api.adminTestWebhook(companyId, wh.id, actor))}>Send Test</Button>
          </div>
        </Card>
      ))}
      <NewWebhookDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); load() }} />
    </div>
  )
}

function NewWebhookDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const actor = useAdminActor()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (e: string) => setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))

  const submit = async () => {
    setBusy(true); setError(null)
    try { await api.adminCreateWebhook(companyId, url, events, actor); setUrl(''); setEvents([]); onCreated() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') } finally { setBusy(false) }
  }

  return (
    <Dialog
      error={error} open={open} onClose={onClose} title="Add Webhook" description="We POST a signed JSON payload for each selected event." width="max-w-lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Create Webhook</Button></>}>
      <div className="space-y-5">
        <Input label="Endpoint URL (HTTPS)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/safechain" />
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-2">Events</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((e) => <Checkbox key={e} label={e} checked={events.includes(e)} onChange={() => toggle(e)} />)}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function UsagePanel() {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  // Per company, and never stuck on a skeleton: it used to load once, for whichever company
  // was selected first, and had no error branch.
  const loaded = useAsync(() => api.adminApiUsage(companyId), [companyId], { enabled: Boolean(companyId) })
  const usage = loaded.data
  if (!usage && loaded.status === 'error') return <ErrorState title="Couldn't load API usage" error={loaded.error} onRetry={loaded.reload} />
  if (!usage) return <Card className="p-5"><Skeleton className="h-56 w-full" /></Card>
  // At least 1: an empty series made this -Infinity and a quiet week made the bars divide by zero.
  const max = Math.max(1, ...usage.series.map((p) => p.calls))
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="px-5 py-4"><p className="text-2xs font-semibold text-ink-2">Calls today</p><p className="mt-0.5 text-2xl font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{usage.totalToday.toLocaleString()}</p></Card>
      <Card className="px-5 py-4"><p className="text-2xs font-semibold text-ink-2">Error rate (7d)</p><p className="mt-0.5 text-2xl font-semibold" style={{ color: usage.errorRate > 2 ? 'var(--warning)' : 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>{usage.errorRate}%</p></Card>
      <Card className="px-5 py-4"><p className="text-2xs font-semibold text-ink-2">Rate limit</p><p className="mt-0.5 text-2xl font-semibold text-ink">1,000<span className="text-sm text-muted"> / min</span></p></Card>
      <Card className="xl:col-span-3">
        <CardHeader title="API Calls — Last 7 Days" subtitle="Successful requests per day" />
        <CardBody>
          <div className="flex h-40 items-end gap-3">
            {usage.series.map((p) => (
              <div key={p.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end justify-center" style={{ height: '128px' }}>
                  <div className="w-full max-w-[36px] rounded-t-md bg-accent" style={{ height: `${(p.calls / max) * 100}%` }} title={`${p.calls} calls · ${p.errors} errors`} />
                </div>
                <span className="text-2xs text-muted">{p.label}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

/**
 * The address this console is actually talking to.
 *
 * The reference used to hard-code https://api.safeops.app, which resolves to nothing - so
 * the one command an integrator was most likely to copy could never have worked. A
 * same-origin deployment leaves API_BASE_URL empty, in which case the origin is the answer.
 */
function apiBase(): string {
  return API_BASE_URL || window.location.origin
}

/*
 * Exactly what api/src/routes/v1.ts mounts, and nothing else.
 *
 * This list used to name nine endpoints, three of them writes, none of which existed - an
 * API key authenticated no request at all, so every line described something no customer
 * could call. Two are gone rather than built, and for a reason worth keeping: a key acts
 * as `ceo`, chosen because it reads the whole workspace without unmasking anonymous
 * reporters, and that role is deliberately not in MANAGE_ROLES. Updating an action or
 * completing an inspection would therefore have refused every request, and the fix for
 * that is not to hand a bearer token in somebody's CI configuration a manager's authority.
 */
const ENDPOINTS = [
  { method: 'GET', path: '/v1/incidents', desc: 'List incidents with filters' },
  { method: 'GET', path: '/v1/incidents/{id}', desc: 'One incident in full' },
  { method: 'POST', path: '/v1/incidents', desc: 'Report a new incident' },
  { method: 'GET', path: '/v1/actions', desc: 'List corrective actions' },
  { method: 'GET', path: '/v1/assets', desc: 'Asset register with health' },
  { method: 'GET', path: '/v1/audits', desc: 'List audits & findings' },
  { method: 'GET', path: '/v1/training/matrix', desc: 'Competency matrix' },
  { method: 'GET', path: '/v1/certificates/{number}/verify', desc: 'Verify a certificate' },
]


function DocsPanel() {
  return (
    <Card>
      <CardHeader title="REST API Reference" subtitle={`Base URL ${apiBase()} · Bearer token auth · JSON`} />
      <CardBody className="space-y-1.5">
        <div className="relative overflow-x-auto whitespace-nowrap rounded-lg border bg-sunken p-3 font-mono text-2xs text-ink-2" tabIndex={0} role="region" aria-label="Example request">
          curl {apiBase()}/v1/incidents \<br />&nbsp;&nbsp;-H "Authorization: Bearer sk_live_…"
        </div>
        {ENDPOINTS.map((e) => (
          <div key={`${e.method} ${e.path}`} className="flex items-center gap-3 rounded-lg border px-3.5 py-2">
            <Badge tone={e.method === 'GET' ? 'good' : e.method === 'POST' ? 'accent' : 'warning'}>{e.method}</Badge>
            <code className="font-mono text-xs text-ink">{e.path}</code>
            <span className="ml-auto text-2xs text-muted">{e.desc}</span>
          </div>
        ))}
        <p className="pt-1 text-2xs text-muted">
          Every endpoint enforces the scopes on the calling API key and is rate-limited per
          key. A key reads its own workspace only — do not send a companyId.
        </p>
      </CardBody>
    </Card>
  )
}
