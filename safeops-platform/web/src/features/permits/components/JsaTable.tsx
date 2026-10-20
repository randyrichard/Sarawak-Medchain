import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, ClipboardList, Check, Loader2 } from 'lucide-react'
import { permitWorkflowApi, type JsaStep } from '@/api/permitWorkflowApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { discardLocalJsaRow, queuePermitOp } from '../offlineOps'
import { isLocalJsaId, newLocalJsaId, resolveJsaId } from '../localJsaIds'

/**
 * The job safety analysis, as an editable table.
 *
 * Rows rather than a prose box: a JSA is only useful if each hazard has a named control
 * and a named person. Free text produces "usual precautions apply", which is what an
 * investigation finds when nobody can say who was responsible for what.
 *
 * Cells auto-save on blur after a debounce. A JSA is filled in at a desk with a method
 * statement open alongside, and a Save button at the bottom of a twelve-row table is how
 * half of it gets lost.
 */

const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'] as const

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function JsaTable({
  permitId, permitCode, canEdit, userId, onChanged, onQueued,
}: {
  permitId: string
  /** Names the permit on a record waiting to sync. */
  permitCode: string
  canEdit: boolean
  /** The signed-in account a queued amendment is filed under. Absent in the offline demo. */
  userId?: string
  onChanged?: () => void
  /** Something was kept on the device, so the list of records waiting to sync has moved. */
  onQueued?: () => void
}) {
  const [rows, setRows] = useState<JsaStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** An amendment kept on the device. Not an error — see editCell. */
  const [offlineNote, setOfflineNote] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    permitWorkflowApi.listJsa(permitId)
      .then(setRows)
      .catch((e) => {
        setRows([])
        setError(e instanceof ApiError ? e.message : 'Could not load the JSA.')
      })
  }, [permitId])

  useEffect(() => { load() }, [load])

  /**
   * Keeps one cell's change on the device. False when storage itself refused it.
   *
   * `note` is the caller's, because the two reasons an amendment is queued are different
   * things to be told. One is that there is no signal. The other is that the row itself has
   * not reached the server yet, which is true whatever the signal is doing — and a message
   * about a connection would be a message about the wrong problem.
   */
  const queueAmendment = async (
    id: string, field: keyof JsaStep, value: string, note: string,
  ) => {
    if (!userId) return false
    try {
      await queuePermitOp(userId, {
        kind: 'jsa-update', permitId, permitCode, stepId: id, patch: { [field]: value },
      })
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 1600)
      setError(null)
      setOfflineNote(note)
      onQueued?.()
      return true
    } catch {
      return false
    }
  }

  /** Optimistic cell edit, persisted after the user stops typing. */
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const editCell = (id: string, field: keyof JsaStep, value: string) => {
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, [field]: value } : r)) ?? rs)

    const key = `${id}:${field}`
    clearTimeout(timers.current.get(key))
    timers.current.set(key, setTimeout(async () => {
      // Hazard and control are the two the server refuses when blank, so an empty one is
      // held locally rather than sent and bounced.
      if ((field === 'hazard' || field === 'control') && !value.trim()) {
        setSaveState('error')
        setError('A hazard needs a control. Fill both in before this row is saved.')
        return
      }
      setSaveState('saving')
      setError(null)

      /*
       * A row this device invented and the server has not been given yet.
       *
       * Sent now it would be addressed by a name the server has never seen, and answered
       * "JSA step not found". It goes into the queue behind the add instead, whatever the
       * signal is doing — the drain is oldest-first, so the row exists by the time its
       * amendments are sent. Once the add has landed the translation is known and this
       * stops being true, which is what `resolveJsaId` is reporting.
       */
      if (isLocalJsaId(resolveJsaId(id))) {
        const queued = await queueAmendment(
          id, field, value,
          'Saved on this device. It will be sent with the row it belongs to, which is also '
          + 'still waiting.',
        )
        if (queued) return
        setSaveState('error')
        setError('This device could not save that change. Write it down and enter it later.')
        return
      }

      try {
        await permitWorkflowApi.updateJsa(resolveJsaId(id), { [field]: value })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1600)
        onChanged?.()
      } catch (e) {
        /*
         * Amending an existing row with no signal.
         *
         * This is the walk-down case: the crew gets to the job, the control written at the
         * desk does not match what is in front of them, and the row is corrected there. The
         * amendment is kept and sent later, and the permit's version is bumped when it
         * lands — so an approver who signed the old analysis has not signed the new one,
         * which is the property that makes a JSA worth anything.
         *
         * A row added at the job is the same amendment made one step earlier: see addRow.
         */
        const unreachable = e instanceof ApiError && (e.code === 'network' || e.code === 'request_failed')
        const queued = unreachable && userId && await queueAmendment(
          id, field, value,
          'No connection. This amendment is saved on this device and will be sent when there is signal.',
        )
        if (queued) return
        setSaveState('error')
        setError(e instanceof ApiError ? e.message : 'Could not save that change.')
      }
    }, 700))
  }

  /**
   * Adds a row — at the desk, or at the job with no signal.
   *
   * The offline half is the walk-down case one step further than an amendment: the crew
   * gets to the job and finds a hazard that is not on the analysis at all. An unguarded
   * opening, a line nobody knew was still live. Refusing to record it is how that hazard
   * ends up written on a glove, and the row is the only place the control for it can be
   * named and owned.
   *
   * The device names the row, so it can be filled in there — every cell of it —
   * before the server has ever heard of it. What makes this safe rather than merely
   * convenient is that the row is still an amendment to the analysis when it lands: it
   * bumps the permit's version and writes to the timeline exactly as one typed at the desk
   * does, so an approver who signed the analysis without this hazard has not signed the one
   * with it. Nothing about adding it offline lets it arrive quietly.
   */
  const addRow = async () => {
    setAdding(true)
    setError(null)
    // Seeded rather than blank: an empty row the server would reject is a dead end, and
    // the placeholder text says plainly that it has to be replaced.
    const seed = { hazard: 'New hazard', control: 'Control to be described' }
    try {
      const created = await permitWorkflowApi.addJsa(permitId, seed)
      setRows((rs) => [...(rs ?? []), created])
      onChanged?.()
    } catch (e) {
      const unreachable = e instanceof ApiError && (e.code === 'network' || e.code === 'request_failed')
      if (unreachable && userId) {
        const clientId = newLocalJsaId()
        try {
          await queuePermitOp(userId, { kind: 'jsa-add', permitId, permitCode, clientId, step: seed })
          setRows((rs) => [...(rs ?? []), localRow(permitId, clientId, seed, rs?.length ?? 0)])
          setOfflineNote(
            'No connection. This hazard is saved on this device and will be added to the '
            + 'analysis when there is signal. Describe it now — the description goes with it.',
          )
          onQueued?.()
          return
        } catch { /* storage refused it; fall through to the message below */ }
      }
      setError(unreachable
        // Only reachable with no device storage and no account to file under, which is the
        // offline demo. Said plainly: the alternative is somebody believing a hazard is on
        // the analysis when it is not.
        ? 'No connection, and this device could not save the row. Write the hazard down and add it when there is signal.'
        : e instanceof ApiError ? e.message : 'Could not add a row.')
    } finally {
      setAdding(false)
    }
  }

  const removeRow = async (id: string) => {
    const previous = rows
    setRows((rs) => rs?.filter((r) => r.id !== id) ?? rs)

    /*
     * Which row this is depends on whether the add has landed, not on what the table is
     * still calling it.
     *
     * A row that exists only on this device is *withdrawn*: there is nothing on the server
     * to remove, and its queued amendments go with it. That is the one undo the field has,
     * and it is the paper equivalent of striking a line out before the sheet is handed in.
     *
     * A row whose add has since drained is on an analysis the permit desk can see, even
     * though the table in front of this supervisor still shows it under the name the device
     * gave it. Withdrawing that would take it off this screen and leave the hazard on the
     * permit — the two copies disagreeing, with nobody told. So it is resolved first and
     * deleted properly, with the timeline entry a deletion earns.
     */
    const target = resolveJsaId(id)
    if (isLocalJsaId(target)) {
      try {
        if (userId) await discardLocalJsaRow(userId, id)
        onQueued?.()
      } catch {
        setRows(previous)
        setError('Could not take that row back. It is still saved on this device.')
      }
      return
    }

    try {
      await permitWorkflowApi.removeJsa(target)
      onChanged?.()
    } catch (e) {
      setRows(previous)
      setError(e instanceof ApiError ? e.message : 'Could not remove that row.')
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          Job safety analysis
          {rows && rows.length > 0 && <span className="text-muted">({rows.length})</span>}
        </p>
        <SaveIndicator state={saveState} />
      </div>

      {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}
      {offlineNote && (
        <Alert tone="info" className="mb-2" onDismiss={() => setOfflineNote(null)}>{offlineNote}</Alert>
      )}

      {rows === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6">
          <ClipboardList size={18} className="mb-2 text-muted" />
          <p className="text-sm text-ink-2">No hazards analysed yet.</p>
          <p className="mt-0.5 text-2xs text-muted">
            One row per step of the job: what could hurt someone, and what stops it.
          </p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b bg-sunken text-2xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-8 px-2 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Hazard</th>
                <th className="w-24 px-2 py-2 font-semibold">Risk</th>
                <th className="px-2 py-2 font-semibold">Control</th>
                <th className="px-2 py-2 font-semibold">Responsible</th>
                <th className="w-24 px-2 py-2 font-semibold">Residual</th>
                {canEdit && <th className="w-9 px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-2 py-1.5 text-2xs text-muted">
                    {i + 1}
                    {/*
                      Marked, because the difference matters to whoever is reading the
                      analysis. This hazard is on the crew's copy and not yet on the one the
                      permit desk and the approver can see, and a table that looked the same
                      either way would be the version of this feature that misleads.
                    */}
                    {isLocalJsaId(r.id) && (
                      <span className="mt-1 block font-semibold uppercase tracking-wide text-warning"
                        title="Added on this device. Not on the analysis the server holds until it syncs.">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <Cell value={r.hazard} readOnly={!canEdit} required
                      onChange={(v) => editCell(r.id, 'hazard', v)} />
                  </td>
                  <td className="px-1 py-1">
                    <RiskCell value={r.risk} readOnly={!canEdit}
                      onChange={(v) => editCell(r.id, 'risk', v)} />
                  </td>
                  <td className="px-1 py-1">
                    <Cell value={r.control} readOnly={!canEdit} required
                      onChange={(v) => editCell(r.id, 'control', v)} />
                  </td>
                  <td className="px-1 py-1">
                    <Cell value={r.responsible} readOnly={!canEdit} placeholder="Who owns it"
                      onChange={(v) => editCell(r.id, 'responsible', v)} />
                  </td>
                  <td className="px-1 py-1">
                    <RiskCell value={r.residualRisk} readOnly={!canEdit}
                      onChange={(v) => editCell(r.id, 'residualRisk', v)} />
                  </td>
                  {canEdit && (
                    <td className="px-1 py-1">
                      <button
                        onClick={() => void removeRow(r.id)}
                        aria-label={`Remove row ${i + 1}`}
                        className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-critical"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <Button size="sm" variant="secondary" icon={<Plus size={11} />} className="mt-2"
          loading={adding} onClick={() => void addRow()}>
          Add Hazard
        </Button>
      )}
    </section>
  )
}

/**
 * A row that exists only on this device, in the shape the table already draws.
 *
 * `id` is the name the device gave it, which is also what its queued amendments address
 * and what the server will store alongside the id it generates — so one value carries
 * the row from the moment it is invented to the moment it is recognised.
 */
function localRow(
  permitId: string, clientId: string, seed: { hazard: string; control: string }, count: number,
): JsaStep {
  const now = new Date().toISOString()
  return {
    id: clientId,
    permitId,
    clientId,
    // Where this device is showing it. The server puts it at the end of the analysis as it
    // stands when it lands, which may be further down if the desk added rows meanwhile.
    sequence: count + 1,
    step: '',
    hazard: seed.hazard,
    risk: '',
    control: seed.control,
    responsible: '',
    residualRisk: '',
    createdBy: '',
    createdAt: now,
    updatedAt: now,
  }
}

function Cell({
  value, onChange, readOnly, required, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  required?: boolean
  placeholder?: string
}) {
  const empty = required && !value.trim()
  if (readOnly) {
    return <p className="px-1.5 py-1 text-sm leading-snug text-ink-2">{value || '—'}</p>
  }
  return (
    <textarea
      rows={2}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full resize-y rounded-md border bg-surface px-1.5 py-1 text-sm text-ink outline-none',
        'focus:border-accent focus:ring-1 focus:ring-accent',
        empty && 'border-critical',
      )}
    />
  )
}

function RiskCell({
  value, onChange, readOnly,
}: { value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  if (readOnly) {
    return <p className="px-1.5 py-1 text-sm text-ink-2">{value || '—'}</p>
  }
  return (
    <select
      value={RISK_LEVELS.includes(value as never) ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-surface px-1.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
    >
      <option value="">—</option>
      {RISK_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
    </select>
  )
}

/** Quiet when idle, so it never competes with the table for attention. */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-2xs text-muted">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    )
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-2xs text-good">
        <Check size={11} strokeWidth={3} /> Saved
      </span>
    )
  }
  return <span className="text-2xs text-critical">Not Saved</span>
}
