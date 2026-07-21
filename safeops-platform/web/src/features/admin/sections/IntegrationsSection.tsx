import { useEffect, useMemo, useState } from 'react'
import {
  Boxes, Building, Cable, Database, KeyRound, MessageSquare, Plug, Users2,
} from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { Connector, ConnectorCategory } from '@/api/admin'
import { Alert, Badge, Button, Card, Dialog, Input, Skeleton, StatusPill } from '@/components/ui'
import { useAdminActor } from '../lib'
import { timeAgo } from '@/lib/time'

const CAT_META: Record<ConnectorCategory, { label: string; icon: typeof Plug }> = {
  identity: { label: 'Identity & SSO', icon: KeyRound },
  communication: { label: 'Communication', icon: MessageSquare },
  erp: { label: 'ERP', icon: Building },
  hr: { label: 'HR Systems', icon: Users2 },
  developer: { label: 'Developer', icon: Cable },
  data: { label: 'Data', icon: Database },
}

export function IntegrationsSection() {
  const actor = useAdminActor()
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  const [configFor, setConfigFor] = useState<Connector | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.adminListConnectors().then(setConnectors)
  useEffect(() => { load() }, [])

  const grouped = useMemo(() => {
    const map = new Map<ConnectorCategory, Connector[]>()
    ;(connectors ?? []).forEach((c) => map.set(c.category, [...(map.get(c.category) ?? []), c]))
    return [...map.entries()]
  }, [connectors])

  const disconnect = async (c: Connector) => {
    setError(null)
    try { await api.adminSetConnector(c.id, false, undefined, actor); load() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.') }
  }

  if (connectors === null) return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>

  return (
    <div className="space-y-5">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      <Card className="flex items-center gap-3 px-5 py-3.5">
        <Boxes size={18} className="text-accent" />
        <p className="text-sm text-ink-2">A scalable connector framework. <span className="font-semibold text-ink">{connectors.filter((c) => c.status === 'connected').length} connected</span> · configuration is stored securely; third-party API calls are provisioned per environment.</p>
      </Card>

      {grouped.map(([cat, items]) => {
        const CatIcon = CAT_META[cat].icon
        return (
          <div key={cat}>
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-muted"><CatIcon size={12} /> {CAT_META[cat].label}</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((c) => (
                <Card key={c.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-semibold text-ink">{c.name}</p>
                    {c.status === 'connected' ? <StatusPill kind="good" label="Connected" />
                      : c.status === 'available' ? <Badge tone="neutral">Available</Badge>
                      : <Badge tone="neutral">Coming soon</Badge>}
                  </div>
                  <p className="mt-1.5 flex-1 text-2xs leading-relaxed text-muted">{c.description}</p>
                  <p className="mt-2 text-2xs font-medium text-ink-2">{c.capability}</p>
                  {c.connectedAt && <p className="text-2xs text-muted">Connected {timeAgo(c.connectedAt)} by {c.connectedBy}</p>}
                  <div className="mt-3 flex gap-2">
                    {c.status === 'connected' ? (
                      <>
                        {c.fields.length > 0 && <Button size="sm" variant="secondary" onClick={() => setConfigFor(c)}>Configure</Button>}
                        <Button size="sm" variant="ghost" onClick={() => void disconnect(c)}>Disconnect</Button>
                      </>
                    ) : c.status === 'available' ? (
                      <Button size="sm" onClick={() => setConfigFor(c)}>Connect</Button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled>Notify me</Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      })}

      <ConnectDialog connector={configFor} onClose={() => setConfigFor(null)} onConnected={() => { setConfigFor(null); load() }} />
    </div>
  )
}

function ConnectDialog({ connector, onClose, onConnected }: { connector: Connector | null; onClose: () => void; onConnected: () => void }) {
  const actor = useAdminActor()
  const [config, setConfig] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setConfig(connector?.config ?? {}); setError(null) }, [connector?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!connector) return null

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.adminSetConnector(connector.id, true, config, actor)
      onConnected()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not connect.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} title={`${connector.status === 'connected' ? 'Configure' : 'Connect'} ${connector.name}`} description={connector.capability}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>{connector.status === 'connected' ? 'Save' : 'Connect'}</Button></>}>
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        {connector.fields.length === 0 ? (
          <Alert tone="info">This connector needs no credentials — it is enabled at the platform level.</Alert>
        ) : connector.fields.map((f) => (
          <Input key={f.key} label={f.label} type={f.secret ? 'password' : 'text'} placeholder={f.placeholder}
            value={config[f.key] ?? ''} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} />
        ))}
        <p className="text-2xs text-muted">Credentials are stored encrypted. SafeOps does not initiate live third-party calls until the connector is verified in your environment.</p>
      </div>
    </Dialog>
  )
}
