import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  AlertOctagon, AtSign, Ban, CheckCheck, Link2, PenLine, Play, Send, ShieldCheck, Undo2, X,
} from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { CapaItem } from '@/api/capa'
import type { Actor, ActionPriority } from '@/api/incidents'
import {
  Alert, Avatar, Badge, Button, Dialog, Input, Select, StatusPill, Textarea,
} from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { fmtDateTime } from '@/features/incidents/lib'
import { PEOPLE } from '@/features/incidents/lib'
import { ProgressLine } from './ProgressLine'
import { canEditItem, canVerifyItem, DERIVED_META, dueLabel, isManager } from '../lib'
import { cn } from '@/lib/cn'

export function ActionDrawer({
  item, actor, readOnly, onClose, onChanged,
}: {
  item: CapaItem | null
  actor: Actor
  readOnly: boolean
  onClose: () => void
  onChanged: (item: CapaItem) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [mentions, setMentions] = useState<string[]>([])

  // management edit fields
  const [owner, setOwner] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [due, setDue] = useState('')
  const [prio, setPrio] = useState<ActionPriority>('Medium')
  const [desc, setDesc] = useState('')

  useEffect(() => {
    if (!item) return
    setError(null)
    setOwner(item.owner)
    setReviewer(item.reviewer ?? '')
    setDue(item.dueDate)
    setPrio(item.priority)
    setDesc(item.description ?? '')
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !completeOpen && !cancelOpen && !editOpen && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, completeOpen, cancelOpen, editOpen])

  if (!item) return null

  const editable = !readOnly && canEditItem(actor, item)
  const verifier = !readOnly && canVerifyItem(actor, item)
  const manager = !readOnly && isManager(actor.role)
  const active = ['Open', 'Assigned', 'In Progress'].includes(item.derived)

  const run = async (fn: () => Promise<CapaItem>) => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await fn())
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const postComment = async () => {
    const ok = await run(() => api.addCapaNote(item.id, comment, mentions.filter((m) => comment.includes(`@${m}`)), actor))
    if (ok) {
      setComment('')
      setMentions([])
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${item.code} workspace`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[520px] animate-scale-in flex-col border-l bg-surface shadow-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{item.code}</span>
              <StatusPill kind={DERIVED_META[item.derived].kind} label={item.derived} />
              <Badge tone={item.priority === 'High' ? 'critical' : item.priority === 'Medium' ? 'warning' : 'neutral'}>{item.priority}</Badge>
              {item.overdue && (
                <Badge tone="critical" className="gap-1"><AlertOctagon size={10} /> {dueLabel(item)}</Badge>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-ink">{item.title}</h2>
            {item.incidentId && (
              <Link
                to={`/incidents/${item.incidentId}`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
              >
                <Link2 size={11} /> {item.incidentNumber} · {item.incidentTitle}
              </Link>
            )}
          </div>
          <button onClick={onClose} aria-label="Close workspace" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

          {/* What / Who / When / Why */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Meta label="Owner"><span className="flex items-center gap-1.5"><Avatar name={item.owner || '?'} size={16} />{item.owner || 'Unassigned'}</span></Meta>
            <Meta label="Reviewer">{item.reviewer ?? '—'}</Meta>
            <Meta label="Site · Dept">{item.siteId.toUpperCase()} · {item.department}</Meta>
            <Meta label="Due">{item.dueDate}</Meta>
            <Meta label="Root cause">{item.rootCause ?? '—'}</Meta>
            <Meta label="Created">{item.createdAt ? timeAgo(item.createdAt) : '—'}</Meta>
          </div>

          {item.description && (
            <p className="rounded-lg bg-sunken px-3.5 py-2.5 text-sm leading-relaxed text-ink-2">{item.description}</p>
          )}

          {/* Progress */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-2xs font-bold uppercase tracking-wider text-muted">Progress</p>
              <span className="text-xs font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.progress}%</span>
            </div>
            <ProgressLine value={item.progress} overdue={item.overdue} />
            {editable && active && (
              <div className="mt-2 flex gap-1.5">
                {[0, 25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    disabled={busy}
                    onClick={() => void run(() => api.updateCapa(item.id, { progress: p }, actor))}
                    className={cn(
                      'flex-1 rounded-lg border py-1 text-2xs font-semibold transition-colors',
                      item.progress === p ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink',
                    )}
                    style={item.progress === p ? { borderColor: 'var(--accent)' } : undefined}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Workflow actions */}
          {!readOnly && item.derived !== 'Cancelled' && (
            <div className="flex flex-wrap gap-2">
              {editable && (item.derived === 'Open' || item.derived === 'Assigned') && (
                <Button size="sm" icon={<Play size={12} />} loading={busy}
                  onClick={() => void run(() => api.updateCapa(item.id, { status: 'In Progress' }, actor))}>
                  Start work
                </Button>
              )}
              {editable && item.derived === 'In Progress' && (
                <Button size="sm" icon={<CheckCheck size={12} />} onClick={() => { setEvidence(item.evidenceNote ?? ''); setCompleteOpen(true) }}>
                  Complete…
                </Button>
              )}
              {item.derived === 'Waiting Verification' && verifier && (
                <Button size="sm" icon={<ShieldCheck size={12} />} loading={busy}
                  onClick={() => void run(() => api.updateCapa(item.id, { status: 'Verified' }, actor))}>
                  Verify & sign off
                </Button>
              )}
              {item.derived === 'Waiting Verification' && manager && (
                <Button size="sm" variant="secondary" icon={<Undo2 size={12} />} loading={busy}
                  onClick={() => void run(() => api.updateCapa(item.id, { status: 'In Progress' }, actor))}>
                  Send back
                </Button>
              )}
              {manager && active && (
                <>
                  <Button size="sm" variant="secondary" icon={<PenLine size={12} />} onClick={() => setEditOpen(true)}>
                    Edit details
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Ban size={12} />} onClick={() => setCancelOpen(true)}>
                    Cancel…
                  </Button>
                </>
              )}
              {item.derived === 'Waiting Verification' && !verifier && (
                <p className="w-full text-2xs text-muted">Awaiting sign-off by {item.reviewer ?? 'an HSE Manager'} — verification comments land in the timeline.</p>
              )}
            </div>
          )}

          {/* Evidence */}
          {(item.evidenceNote || item.evidenceRequired) && (
            <div>
              <p className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">Completion evidence</p>
              {item.evidenceNote ? (
                <p className="rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed text-ink-2">
                  {item.evidenceNote}
                  {item.verifiedBy && (
                    <span className="mt-1 block text-2xs text-muted">
                      Verified by {item.verifiedBy} · {item.verifiedAt ? fmtDateTime(item.verifiedAt) : ''} · digital sign-off recorded
                    </span>
                  )}
                </p>
              ) : (
                <p className="rounded-lg border border-dashed px-3.5 py-2.5 text-xs text-muted">
                  Evidence required at completion — the action cannot close without it.
                </p>
              )}
            </div>
          )}

          {item.cancelReason && (
            <Alert tone="info" title="Cancelled">{item.cancelReason}</Alert>
          )}

          {/* Discussion */}
          <div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">Discussion</p>
            {item.notes.length === 0 && <p className="mb-2 text-xs text-muted">No comments yet.</p>}
            <ul className="space-y-2.5">
              {item.notes.map((n) => (
                <li key={n.id} className="flex gap-2.5">
                  <Avatar name={n.author} size={24} />
                  <div className="min-w-0 flex-1 rounded-lg border px-3 py-2">
                    <p className="text-2xs text-muted"><span className="font-semibold text-ink">{n.author}</span> · {timeAgo(n.at)}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{n.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 rounded-lg border p-2.5">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Add to the discussion…"
                className="w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 border-t pt-1.5">
                <span className="flex items-center gap-1.5">
                  <AtSign size={12} className="text-muted" />
                  <select
                    value=""
                    onChange={(e) => {
                      const name = e.target.value
                      if (!name) return
                      if (!mentions.includes(name)) setMentions((m) => [...m, name])
                      setComment((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${name} `)
                    }}
                    className="rounded-md border bg-surface px-1.5 py-0.5 text-2xs text-ink-2 outline-none"
                    aria-label="Mention someone"
                  >
                    <option value="">Mention…</option>
                    {PEOPLE.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </span>
                <Button size="sm" icon={<Send size={11} />} loading={busy} disabled={!comment.trim()} onClick={() => void postComment()}>
                  Post
                </Button>
              </div>
            </div>
          </div>

          {/* Timeline / activity log */}
          <div>
            <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-muted">Timeline</p>
            <ol className="relative space-y-3 before:absolute before:bottom-1.5 before:left-[5px] before:top-1.5 before:w-px before:bg-grid">
              {item.timeline.map((t) => (
                <li key={t.id} className="relative flex gap-3">
                  <span className="z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--baseline)] bg-surface" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-ink">{t.action}</p>
                    {t.detail && <p className="text-2xs leading-relaxed text-ink-2">{t.detail}</p>}
                    <p className="mt-0.5 text-2xs text-muted">{t.at ? fmtDateTime(t.at) : ''} · {t.actor}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>

      {/* Complete dialog */}
      <Dialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title={`Complete ${item.code}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => void run(() => api.updateCapa(item.id, { status: 'Completed', evidenceNote: evidence }, actor)).then((ok) => ok && setCompleteOpen(false))}>
              Mark completed
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <Textarea
            label={item.evidenceRequired ? 'Completion evidence (required)' : 'Completion note (optional)'}
            rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)}
            placeholder="What proves this is done? Photos, records, sign-offs…"
          />
        </div>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${item.code}?`}
        description="Cancelled actions stay in the record with the reason — they never silently disappear."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep action</Button>
            <Button variant="danger" loading={busy}
              onClick={() => void run(() => api.cancelCapa(item.id, reason, actor)).then((ok) => ok && setCancelOpen(false))}>
              Cancel action
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <Textarea label="Reason (required)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate of CA-901; superseded by engineering change…" />
        </div>
      </Dialog>

      {/* Edit details (management) */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${item.code}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button loading={busy}
              onClick={() => void run(() => api.updateCapa(item.id, { owner, reviewer, dueDate: due, priority: prio, description: desc }, actor)).then((ok) => ok && setEditOpen(false))}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </Select>
            <Select label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">None</option>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Select label="Priority" value={prio} onChange={(e) => setPrio(e.target.value as ActionPriority)}>
              <option>High</option><option>Medium</option><option>Low</option>
            </Select>
          </div>
          <Textarea label="Description" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
      </Dialog>
    </div>,
    document.body,
  )
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs text-muted">{label}</p>
      <div className="text-sm font-medium text-ink">{children}</div>
    </div>
  )
}
