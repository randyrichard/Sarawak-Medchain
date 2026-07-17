import { useState } from 'react'
import { CalendarDays, CheckCheck, Play, Plus, ShieldCheck } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ActionPriority, Incident, IncidentAction } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import {
  Alert, Avatar, Badge, Button, Checkbox, Dialog, EmptyState, Input, Select, StatusPill, Textarea,
} from '@/components/ui'
import { PEOPLE, useActor } from '../lib'
import { ListChecks } from 'lucide-react'

const statusKind = (s: IncidentAction['status']) =>
  s === 'Verified' ? 'good' : s === 'Completed' ? 'info' : s === 'In Progress' ? 'warning' : 'serious'

export function ActionsPanel({ incident, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  const actor = useActor()
  const { role } = useOrg()
  const canManage = ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '')
  const canVerify = ['admin', 'hse_manager'].includes(role ?? '')
  const canAdd = canManage && (incident.stage === 'rca' || incident.stage === 'actions')

  const [addOpen, setAddOpen] = useState(false)
  const [completeFor, setCompleteFor] = useState<IncidentAction | null>(null)
  const [evidenceNote, setEvidenceNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // new action form
  const [title, setTitle] = useState('')
  const [causeId, setCauseId] = useState<string>('')
  const [owner, setOwner] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<ActionPriority>('High')
  const [evidenceRequired, setEvidenceRequired] = useState(true)

  const causes = incident.rca?.causes ?? []
  const causeName = (id: string | null) => causes.find((c) => c.id === id)?.category

  const run = async (fn: () => Promise<Incident>) => {
    setBusy(true)
    setError(null)
    try {
      onUpdate(await fn())
      return true
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Request failed.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const submitNew = async () => {
    const ok = await run(() =>
      api.addIncidentAction(incident.id, { title, causeId: causeId || null, owner, dueDate, priority, evidenceRequired }, actor),
    )
    if (ok) {
      setAddOpen(false)
      setTitle(''); setOwner(''); setDueDate(''); setCauseId('')
    }
  }

  const complete = async () => {
    if (!completeFor) return
    const ok = await run(() =>
      api.updateIncidentAction(incident.id, completeFor.id, { status: 'Completed', evidenceNote }, actor),
    )
    if (ok) {
      setCompleteFor(null)
      setEvidenceNote('')
    }
  }

  return (
    <div className="space-y-3">
      {error && !addOpen && !completeFor && <Alert tone="critical" onDismiss={() => setError(null)}>{error}</Alert>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          {incident.actions.length} action(s) · every root cause must be covered before review
        </p>
        {canAdd && (
          <Button size="sm" icon={<Plus size={13} />} onClick={() => { setError(null); setAddOpen(true) }}>
            Add action
          </Button>
        )}
      </div>

      {incident.actions.length === 0 ? (
        <EmptyState icon={ListChecks} title="No corrective actions yet">
          Actions are raised from the root causes — each cause needs at least one before the case can go to review.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {incident.actions.map((a) => {
            const overdue = a.status !== 'Verified' && a.status !== 'Completed' && new Date(a.dueDate) < new Date()
            return (
              <li key={a.id} className="rounded-xl border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-ink">{a.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                      {causeName(a.causeId) && <Badge tone="accent">{causeName(a.causeId)}</Badge>}
                      <span className="inline-flex items-center gap-1"><Avatar name={a.owner} size={15} /> {a.owner}</span>
                      <span className={overdue ? 'font-semibold text-critical' : ''}>
                        <CalendarDays size={10} className="mr-0.5 inline" /> due {a.dueDate}{overdue ? ' · overdue' : ''}
                      </span>
                      <Badge tone={a.priority === 'High' ? 'critical' : 'neutral'}>{a.priority}</Badge>
                      {a.evidenceRequired && <span>evidence required</span>}
                    </div>
                  </div>
                  <StatusPill kind={statusKind(a.status)} label={a.status} />
                </div>

                {a.evidenceNote && (
                  <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-2">
                    <span className="font-semibold text-ink">Evidence:</span> {a.evidenceNote}
                    {a.verifiedBy && <span className="text-muted"> · verified by {a.verifiedBy}</span>}
                  </p>
                )}

                {canManage && incident.stage !== 'closed' && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {a.status === 'Open' && (
                      <Button size="sm" variant="secondary" icon={<Play size={12} />} loading={busy}
                        onClick={() => void run(() => api.updateIncidentAction(incident.id, a.id, { status: 'In Progress' }, actor))}>
                        Start
                      </Button>
                    )}
                    {(a.status === 'Open' || a.status === 'In Progress') && (
                      <Button size="sm" icon={<CheckCheck size={12} />}
                        onClick={() => { setError(null); setEvidenceNote(a.evidenceNote ?? ''); setCompleteFor(a) }}>
                        Complete…
                      </Button>
                    )}
                    {a.status === 'Completed' && canVerify && (
                      <Button size="sm" variant="secondary" icon={<ShieldCheck size={12} />} loading={busy}
                        onClick={() => void run(() => api.updateIncidentAction(incident.id, a.id, { status: 'Verified' }, actor))}>
                        Verify completion
                      </Button>
                    )}
                    {a.status === 'Completed' && !canVerify && (
                      <span className="text-2xs text-muted">Awaiting verification by an HSE Manager</span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Add action */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New corrective action"
        description="Linked to a root cause, owned by one person, verified before closure."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => void submitNew()}>Assign action</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {error && <Alert tone="critical">{error}</Alert>}
          <Input label="What must be done" required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Add reinstatement step + sign-back to barrier permit" />
          <Select label="Addresses root cause" value={causeId} onChange={(e) => setCauseId(e.target.value)}
            hint={causes.length === 0 ? 'No causes recorded yet — save the RCA first.' : undefined}>
            <option value="">General / preventive</option>
            {causes.map((c) => <option key={c.id} value={c.id}>{c.category} — {c.description.slice(0, 40)}…</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Owner" required value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="" disabled>Select…</option>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </Select>
            <Input label="Due date" required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as ActionPriority)} className="w-full">
              {(['High', 'Medium', 'Low'] as const).map((p) => <option key={p}>{p}</option>)}
            </Select>
            <div className="pt-5">
              <Checkbox label="Evidence required" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Complete action */}
      <Dialog
        open={completeFor !== null}
        onClose={() => setCompleteFor(null)}
        title={`Complete: ${completeFor?.title ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteFor(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => void complete()}>Mark completed</Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="critical">{error}</Alert>}
          <Textarea
            label={completeFor?.evidenceRequired ? 'Completion evidence (required)' : 'Completion note (optional)'}
            rows={3} value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)}
            placeholder="What proves this is done? Reference photos, records, sign-offs…"
          />
          {completeFor?.evidenceRequired && (
            <p className="text-2xs text-muted">An HSE Manager verifies this evidence before the incident can close.</p>
          )}
        </div>
      </Dialog>
    </div>
  )
}
