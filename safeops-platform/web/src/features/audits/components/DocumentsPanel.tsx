import { useMemo, useRef, useState } from 'react'
import { CheckCheck, FileText, History, Upload } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ComplianceDocument, DocKind } from '@/api/audits'
import { DOC_KIND_LABEL, DOC_KINDS } from '@/api/audits'
import { useOrg } from '@/features/org/OrgContext'
import { useActor, fmtDateTime } from '@/features/incidents/lib'
import { Alert, Avatar, Badge, Button, Card, Dialog, Skeleton, StatusPill } from '@/components/ui'
import { isComplianceManager } from '../lib'
import { cn } from '@/lib/cn'

const STATUS_KIND = { Draft: 'info', 'Pending Approval': 'warning', Approved: 'good', Superseded: 'info' } as const

/** Controlled documents: versioning + approval workflow. */
export function DocumentsPanel({
  documents, q, role, onChanged,
}: {
  documents: ComplianceDocument[] | null
  q: string
  role: string | null
  onChanged: () => void
}) {
  const { company } = useOrg()
  const actor = useActor()
  const [kind, setKind] = useState<DocKind | ''>('')
  const [historyFor, setHistoryFor] = useState<ComplianceDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<ComplianceDocument | null>(null)

  const canManage = ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '')
  const canApprove = isComplianceManager(role)

  const rows = useMemo(() => {
    if (!documents) return []
    const query = q.trim().toLowerCase()
    return documents
      .filter((d) => !kind || d.kind === kind)
      .filter((d) => !query || [d.name, d.owner, d.version].join(' ').toLowerCase().includes(query))
  }, [documents, q, kind])

  const upload = async (files: FileList | null) => {
    if (!files?.length || !company) return
    const f = files[0]
    const target = uploadTarget.current
    setBusy(target?.id ?? 'new')
    setError(null)
    try {
      await api.addDocumentVersion(
        target?.id ?? null,
        {
          name: target?.name ?? f.name.replace(/\.[^.]+$/, ''),
          kind: target?.kind ?? 'sop',
          sizeKb: Math.max(1, Math.round(f.size / 1024)),
          note: target ? `Replaced with ${f.name}` : `Uploaded ${f.name}`,
          companyId: company.id,
          siteId: null,
        },
        actor,
      )
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed.')
    } finally {
      setBusy(null)
      uploadTarget.current = null
    }
  }

  const approve = async (doc: ComplianceDocument) => {
    setBusy(doc.id)
    setError(null)
    try {
      await api.approveDocument(doc.id, actor)
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Approval failed.')
    } finally {
      setBusy(null)
    }
  }

  if (documents === null) {
    return <Card className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</Card>
  }

  return (
    <>
      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as DocKind | '')} className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none" aria-label="Filter by document kind">
          <option value="">All kinds</option>
          {DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}
        </select>
        {canManage && (
          <Button size="sm" variant="secondary" icon={<Upload size={13} />} loading={busy === 'new'}
            onClick={() => { uploadTarget.current = null; fileRef.current?.click() }}>
            Upload document
          </Button>
        )}
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => void upload(e.target.files)} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b text-2xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-semibold">Document</th>
                <th className="px-3 py-2.5 font-semibold">Kind</th>
                <th className="px-3 py-2.5 font-semibold">Version</th>
                <th className="px-3 py-2.5 font-semibold">Owner</th>
                <th className="px-3 py-2.5 font-semibold">Updated</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b last:border-0" style={d.status === 'Pending Approval' ? { background: 'var(--warning-soft)' } : undefined}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                        <FileText size={14} className="text-accent" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug text-ink">{d.name}</p>
                        <p className="text-2xs text-muted">
                          {d.sizeKb >= 1024 ? `${(d.sizeKb / 1024).toFixed(1)} MB` : `${d.sizeKb} KB`}
                          {d.approvedBy && ` · approved by ${d.approvedBy}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><Badge tone="neutral">{DOC_KIND_LABEL[d.kind]}</Badge></td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-2">v{d.version}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-ink-2"><Avatar name={d.owner} size={18} /> {d.owner}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(d.updatedAt).split(',')[0]}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill kind={STATUS_KIND[d.status]} label={d.status} />
                      {d.status === 'Pending Approval' && canApprove && (
                        <Button size="sm" icon={<CheckCheck size={12} />} loading={busy === d.id} onClick={() => void approve(d)}>
                          Approve
                        </Button>
                      )}
                      {canManage && d.status !== 'Pending Approval' && (
                        <Button size="sm" variant="ghost" icon={<Upload size={11} />}
                          onClick={() => { uploadTarget.current = d; fileRef.current?.click() }}>
                          New version
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon={<History size={11} />} onClick={() => setHistoryFor(d)}>
                        History
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">No documents match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={`Version history — ${historyFor?.name ?? ''}`}
      >
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {historyFor?.history.map((h) => (
            <li key={h.version + h.at} className="rounded-lg border px-3.5 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-bold text-ink">v{h.version}</span>
                <span className="text-2xs text-muted">{fmtDateTime(h.at)} · {h.by}</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{h.note}</p>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  )
}
