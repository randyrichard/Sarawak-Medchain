import { useEffect, useState } from 'react'
import { Archive, Database, DatabaseBackup, Download, History, RotateCcw, Save } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { Backup, RetentionSettings } from '@/api/admin'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Input, Skeleton, Switch,
} from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { timeAgo } from '@/lib/time'
import { downloadJson, useAdminActor } from '../lib'

export function BackupSection() {
  const actor = useAdminActor()
  const [backups, setBackups] = useState<Backup[] | null>(null)
  const [retention, setRetention] = useState<RetentionSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreFor, setRestoreFor] = useState<Backup | null>(null)
  const [savingRetention, setSavingRetention] = useState(false)

  const load = () => { api.adminListBackups().then(setBackups); api.adminGetRetention().then(setRetention) }
  useEffect(() => { load() }, [])

  const createBackup = async () => {
    setBusy(true); setError(null)
    try {
      const { backup, snapshot } = await api.adminCreateBackup(actor, 'Manual snapshot')
      downloadJson(snapshot, `safeops-backup-${backup.id}.json`)
      setFlash('Backup created and downloaded — restorable from the list below.')
      setTimeout(() => setFlash(null), 3500)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Backup failed.')
    } finally { setBusy(false) }
  }

  const restore = async () => {
    if (!restoreFor) return
    try {
      await api.adminRestoreBackup(restoreFor.id, actor)
      // a genuine restore rewrote localStorage — reload so every store rehydrates
      window.location.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Restore failed.')
      setRestoreFor(null)
    }
  }

  const saveRetention = async (patch: Partial<RetentionSettings>) => {
    if (!retention) return
    setSavingRetention(true)
    const next = { ...retention, ...patch }
    setRetention(next)
    try { await api.adminUpdateRetention(patch, actor) } catch { /* revert not critical */ } finally { setSavingRetention(false) }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

      <Card>
        <CardHeader title="Backups" subtitle="Point-in-time snapshots of the entire tenant" right={<Button size="sm" icon={<Save size={13} />} loading={busy} onClick={() => void createBackup()}>Create backup</Button>} />
        <CardBody>
          {backups === null ? <Skeleton className="h-40 w-full" /> : (
            <ul className="space-y-2">
              {backups.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft"><DatabaseBackup size={15} className="text-accent" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{b.note}</p>
                    <p className="text-2xs text-muted">{fmtDateTime(b.at)} · {b.sizeKb} KB · by {b.by}</p>
                  </div>
                  <Badge tone={b.type === 'manual' ? 'accent' : 'neutral'}>{b.type === 'manual' ? 'Manual' : 'Auto'}</Badge>
                  {b.restorable ? (
                    <Button size="sm" variant="secondary" icon={<RotateCcw size={12} />} onClick={() => setRestoreFor(b)}>Restore</Button>
                  ) : (
                    <span className="text-2xs text-muted" title="Older snapshots are catalogued; the payload is on encrypted cold storage">catalogued</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-center gap-1 text-2xs text-muted"><History size={11} /> A manual backup snapshots this tenant's live data and downloads a JSON copy. Restoring reloads that exact state.</p>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Data retention" subtitle="How long records and snapshots are kept" />
          <CardBody className="space-y-3">
            {retention === null ? <Skeleton className="h-32 w-full" /> : (
              <>
                <Input label="Audit log retention (days)" type="number" value={String(retention.auditLogDays)} onChange={(e) => void saveRetention({ auditLogDays: Number(e.target.value) || 365 })} className="w-40" />
                <Input label="Backups to keep" type="number" value={String(retention.backupCount)} onChange={(e) => void saveRetention({ backupCount: Number(e.target.value) || 10 })} className="w-40" />
                <Input label="Closed incident retention (years)" type="number" value={String(retention.closedIncidentYears)} onChange={(e) => void saveRetention({ closedIncidentYears: Number(e.target.value) || 7 })} className="w-40" />
                {savingRetention && <p className="text-2xs text-muted">Saving…</p>}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Archive & scheduling" subtitle="Automated protection" />
          <CardBody className="space-y-3">
            {retention && (
              <div className="rounded-lg border px-3.5 py-3">
                <Switch checked={retention.autoBackupDaily} onChange={(v) => void saveRetention({ autoBackupDaily: v })} label="Daily automated backup (02:00 local)" />
                <p className="mt-1 text-2xs text-muted">Snapshots are encrypted at rest and replicated to the SG region.</p>
              </div>
            )}
            <div className="flex items-start gap-2.5 rounded-lg border px-3.5 py-3">
              <Archive size={16} className="mt-0.5 text-accent" />
              <div>
                <p className="text-sm font-medium text-ink">Cold archive</p>
                <p className="text-2xs text-muted">Closed incidents older than the retention window are moved to immutable archive storage, keeping the working set fast while preserving the legal record.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border px-3.5 py-3">
              <Database size={16} className="mt-0.5 text-accent" />
              <div>
                <p className="text-sm font-medium text-ink">RPO / RTO</p>
                <p className="text-2xs text-muted">Recovery point objective 1 hour · recovery time objective 4 hours. Restore drills run monthly.</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Dialog open={restoreFor !== null} onClose={() => setRestoreFor(null)} title={`Restore "${restoreFor?.note}"?`}
        description="This overwrites the current tenant data with the snapshot and reloads the app."
        footer={<><Button variant="secondary" onClick={() => setRestoreFor(null)}>Cancel</Button><Button variant="danger" icon={<RotateCcw size={13} />} onClick={() => void restore()}>Restore snapshot</Button></>}>
        <Alert tone="warning">
          Restoring reverts every module — incidents, actions, assets, audits, training and admin — to <span className="font-semibold">{restoreFor ? timeAgo(restoreFor.at) : ''}</span>. Create a fresh backup first if you want to keep the current state.
        </Alert>
      </Dialog>
    </div>
  )
}
