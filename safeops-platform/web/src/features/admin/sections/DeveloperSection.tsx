import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Plus, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ApiKey, RbacAction, Webhook } from '@/api/admin'
import { RBAC_ACTIONS, WEBHOOK_EVENTS } from '@/api/admin'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Input, Skeleton, StatusPill,
  Switch, Tabs, type TabItem,
} from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { useAdminActor } from '../lib'
import { cn } from '@/lib/cn'

type Tab = 'keys' | 'webhooks' | 'usage' | 'docs'

export function DeveloperSection() {
  const [tab, setTab] = useState<Tab>('keys')
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
  const actor = useAdminActor()
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.adminListApiKeys().then(setKeys)
  useEffect(() => { load() }, [])

  const revoke = async (id: string) => {
    setError(null)
    try { await api.adminRevokeApiKey(id, actor); load() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">Signed keys for the SafeOps REST API. Treat them like passwords.</p>
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setNewOpen(true)}>Generate key</Button>
      </div>
      <Card>
        {keys === null ? <div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-semibold">Key</th>
                  <th className="px-3 py-2.5 font-semibold">Scopes</th>
                  <th className="px-3 py-2.5 font-semibold">Last used</th>
                  <th className="px-3 py-2.5 font-semibold">Calls today</th>
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
      const { secret } = await api.adminCreateApiKey(name, scopes, actor)
      setSecret(secret)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') } finally { setBusy(false) }
  }

  const close = () => { setName(''); setScopes(['view']); setSecret(null); setCopied(false); onClose(); if (secret) onCreated() }

  return (
    <Dialog open={open} onClose={close} title="Generate API key" description="Scoped access to the SafeOps REST API."
      footer={secret ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Generate</Button></>}>
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
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
  const actor = useAdminActor()
  const [hooks, setHooks] = useState<Webhook[] | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.adminListWebhooks().then(setHooks)
  useEffect(() => { load() }, [])

  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn(); load() } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">Push real-time events to your endpoints over HTTPS.</p>
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setNewOpen(true)}>Add webhook</Button>
      </div>
      {hooks === null ? <Skeleton className="h-40 w-full rounded-xl" /> : hooks.map((wh) => (
        <Card key={wh.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-sm text-ink"><WebhookIcon size={14} className="text-accent" /> {wh.url}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">{wh.events.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}</div>
            </div>
            <Switch checked={wh.active} onChange={() => void act(() => api.adminToggleWebhook(wh.id, actor))} />
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-2xs text-muted">
            <span>Secret {wh.secretMasked}
              {wh.lastDelivery && <> · last delivery <span className={wh.lastDelivery.status === 'success' ? 'text-good' : 'text-critical'}>{wh.lastDelivery.code}</span> {timeAgo(wh.lastDelivery.at)}</>}
            </span>
            <Button size="sm" variant="ghost" icon={<Send size={11} />} onClick={() => void act(() => api.adminTestWebhook(wh.id, actor))}>Send test</Button>
          </div>
        </Card>
      ))}
      <NewWebhookDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); load() }} />
    </div>
  )
}

function NewWebhookDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const actor = useAdminActor()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (e: string) => setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))

  const submit = async () => {
    setBusy(true); setError(null)
    try { await api.adminCreateWebhook(url, events, actor); setUrl(''); setEvents([]); onCreated() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add webhook" description="We POST a signed JSON payload for each selected event." width="max-w-lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Create webhook</Button></>}>
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        <Input label="Endpoint URL (HTTPS)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/safeops" />
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-2">Events</p>
          <div className="grid grid-cols-2 gap-1.5">
            {WEBHOOK_EVENTS.map((e) => <Checkbox key={e} label={e} checked={events.includes(e)} onChange={() => toggle(e)} />)}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function UsagePanel() {
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof api.adminApiUsage>> | null>(null)
  useEffect(() => { api.adminApiUsage().then(setUsage) }, [])
  if (!usage) return <Card className="p-5"><Skeleton className="h-56 w-full" /></Card>
  const max = Math.max(...usage.series.map((p) => p.calls))
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="px-5 py-4"><p className="text-2xs font-semibold text-ink-2">Calls today</p><p className="mt-0.5 text-2xl font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{usage.totalToday.toLocaleString()}</p></Card>
      <Card className="px-5 py-4"><p className="text-2xs font-semibold text-ink-2">Error rate (7d)</p><p className="mt-0.5 text-2xl font-semibold" style={{ color: usage.errorRate > 2 ? 'var(--warning)' : 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>{usage.errorRate}%</p></Card>
      <Card className="px-5 py-4"><p className="text-2xs font-semibold text-ink-2">Rate limit</p><p className="mt-0.5 text-2xl font-semibold text-ink">1,000<span className="text-sm text-muted"> / min</span></p></Card>
      <Card className="xl:col-span-3">
        <CardHeader title="API calls — last 7 days" subtitle="Successful requests per day" />
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

const ENDPOINTS = [
  { method: 'GET', path: '/v1/incidents', desc: 'List incidents with filters' },
  { method: 'POST', path: '/v1/incidents', desc: 'Report a new incident' },
  { method: 'GET', path: '/v1/actions', desc: 'List corrective actions' },
  { method: 'PATCH', path: '/v1/actions/{id}', desc: 'Update action status / progress' },
  { method: 'GET', path: '/v1/assets', desc: 'Asset register with health' },
  { method: 'POST', path: '/v1/inspections/{id}/complete', desc: 'Submit an inspection' },
  { method: 'GET', path: '/v1/audits', desc: 'List audits & findings' },
  { method: 'GET', path: '/v1/training/matrix', desc: 'Competency matrix' },
  { method: 'GET', path: '/v1/certificates/{number}/verify', desc: 'Verify a certificate' },
]

function DocsPanel() {
  return (
    <Card>
      <CardHeader title="REST API reference" subtitle="Base URL https://api.safeops.app · Bearer token auth · JSON" />
      <CardBody className="space-y-1.5">
        <div className="rounded-lg border bg-sunken p-3 font-mono text-2xs text-ink-2">
          curl https://api.safeops.app/v1/incidents \<br />&nbsp;&nbsp;-H "Authorization: Bearer sk_live_…"
        </div>
        {ENDPOINTS.map((e) => (
          <div key={e.path} className="flex items-center gap-3 rounded-lg border px-3.5 py-2">
            <Badge tone={e.method === 'GET' ? 'good' : e.method === 'POST' ? 'accent' : 'warning'}>{e.method}</Badge>
            <code className="font-mono text-xs text-ink">{e.path}</code>
            <span className="ml-auto text-2xs text-muted">{e.desc}</span>
          </div>
        ))}
        <p className="pt-1 text-2xs text-muted">Every endpoint enforces the scopes on the calling API key and is rate-limited per key.</p>
      </CardBody>
    </Card>
  )
}
