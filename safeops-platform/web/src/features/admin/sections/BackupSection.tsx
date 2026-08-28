import { useEffect, useState } from 'react'
import { Archive, Database, DatabaseBackup, Download, History, RotateCcw, Save } from 'lucide-react'
import { api } from '@/api/client'
import { isBackendConfigured } from '@/api/authApi'
import { useOrg } from '@/features/org/OrgContext'
import { ApiError } from '@/api/types'
import type { Backup, RetentionSettings } from '@/api/admin'
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Dialog, Input, Skeleton, Switch,
} from '@/components/ui'
import { fmtDateTime } from '@/features/incidents/lib'
import { timeAgo } from '@/lib/time'
import { downloadJson, useAdminActor } from '../lib'

export function BackupSection() {
  const { company } = useOrg()
  const companyId = company?.id ?? ''
  const actor = useAdminActor()
  const [backups, setBackups] = useState<Backup[] | null>(null)
  const [retention, setRetention] = useState<RetentionSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreFor, setRestoreFor] = useState<Backup | null>(null)
  const [savingRetention, setSavingRetention] = useState(false)
  const [exporting, setExporting] = useState(false)
  // The archive streams files from the server's disk, which the static demo does not have.
  const serverBacked = isBackendConfigured()

  const load = () => { api.adminListBackups(companyId).then(setBackups); api.adminGetRetention(companyId).then(setRetention) }
  useEffect(() => { load() }, [])

  const createBackup = async () => {
    setBusy(true); setError(null)
    try {
      const { backup, snapshot } = await api.adminCreateBackup(companyId, actor, 'Manual snapshot')
      downloadJson(snapshot, `safeops-backup-${backup.id}.json`)
      setFlash('Backup created and downloaded — restorable from the list below.')
      setTimeout(() => setFlash(null), 3500)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Backup failed.')
    } finally { setBusy(false) }
  }

  /**
   * Download the whole workspace.
   *
   * The archive is streamed and can run to hundreds of megabytes once photographs are in it,
   * so the button stays in its loading state until the last byte has arrived. A control that
   * returned to idle while the download was still running would invite a second click and a
   * second full export.
   */
  const exportWorkspace = async () => {
    setExporting(true); setError(null)
    try {
      const archive = await api.adminExportWorkspace(companyId)
      const stamp = new Date().toISOString().slice(0, 10)
      const slug = (company?.name ?? 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const url = URL.createObjectURL(archive)
      const a = document.createElement('a')
      a.href = url
      a.download = `safeops-${slug || 'workspace'}-${stamp}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setFlash('Export downloaded. It opens in Excel and needs no SafeOps account to read.')
      setTimeout(() => setFlash(null), 5000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not export the workspace.')
    } finally { setExporting(false) }
  }

  const restore = async () => {
    if (!restoreFor) return
    try {
      await api.adminRestoreBackup(companyId, restoreFor.id, actor)
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
    try { await api.adminUpdateRetention(companyId, patch, actor) } catch { /* revert not critical */ } finally { setSavingRetention(false) }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}
      {flash && <Alert tone="success" onDismiss={() => setFlash(null)}>{flash}</Alert>}

      {/*
        Deliberately the first thing on this screen, and deliberately separate from Backups.

        A backup is a snapshot we hold, in a format only this application understands, stored
        inside the database it protects. This is a copy the customer keeps and can read
        without us. They answer different questions and putting them in one card would blur
        the only one that matters to somebody deciding whether to trust a small supplier.
      */}
      {serverBacked && (
        <Card>
          <CardHeader
            title="Export your data"
            subtitle="Everything in this workspace, in a format you can read without SafeOps"
            right={
              <Button size="sm" icon={<Download size={13} />} loading={exporting} onClick={() => void exportWorkspace()}>
                Export everything
              </Button>
            }
          />
          <CardBody>
            <p className="text-sm text-ink-2">
              A ZIP containing one spreadsheet per register — incidents, permits and the
              precautions signed off on them, actions, assets, inspections, training,
              contractors and visitors — together with every photograph and document uploaded
              to this workspace, and a readme explaining how the records join up.
            </p>
            <p className="mt-2 text-2xs text-muted">
              Opens in Excel, LibreOffice or Numbers. No account or licence is needed to read
              it. Unlike a restore point, this includes incident timelines, permit controls,
              gas tests and signatures.
            </p>
            <p className="mt-2 text-2xs text-muted">
              The workforce register contains health information, which is sensitive personal
              data under the PDPA. The downloaded file has no access control of its own — store
              it accordingly. Administrators only, and every export is recorded in the audit log.
            </p>
          </CardBody>
        </Card>
      )}

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
          <p className="mt-3 flex items-center gap-1 text-2xs text-muted"><History size={11} /> A manual backup snapshots this tenant's live data and downloads a JSON copy. Restoring reinstates that state without removing anything created since.</p>
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
        description="This reinstates the records in the snapshot and reloads the app."
        footer={<><Button variant="secondary" onClick={() => setRestoreFor(null)}>Cancel</Button><Button variant="danger" icon={<RotateCcw size={13} />} onClick={() => void restore()}>Restore snapshot</Button></>}>
        <Alert tone="warning">
          Records across every module — incidents, actions, assets, audits and training — are returned to their state at <span className="font-semibold">{restoreFor ? timeAgo(restoreFor.at) : ''}</span>, and anything deleted since is reinstated. Work created after the snapshot is left alone, and a snapshot of the current state is taken automatically first, so this is reversible.
        </Alert>
        {/* Measured, not estimated: a drill against 12 incidents and 6 permits restored
            every parent record and left 11 incident timeline entries and 20 permit
            precautions behind. An operator who believes this is a full recovery will find
            out at the worst moment, so the limit is stated where the decision is made. */}
        <Alert tone="critical" className="mt-2">
          <span className="font-semibold">This restores records, not their history.</span> Incident
          timelines, permit precaution checklists, gas tests, isolations and comments are not in
          the snapshot — a restored permit comes back without the controls that were signed off
          on it. Use this to undo a bad import, not to recover from data loss. Full recovery is a{' '}
          <span className="font-mono">pg_dump</span> restore — see BACKUP.md.
        </Alert>
      </Dialog>
    </div>
  )
}
