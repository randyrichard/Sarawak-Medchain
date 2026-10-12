import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, ClipboardList, Check, Loader2 } from 'lucide-react'
import { permitWorkflowApi, type JsaStep } from '@/api/permitWorkflowApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'

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
  permitId, canEdit, onChanged,
}: {
  permitId: string
  canEdit: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<JsaStep[] | null>(null)
  const [error, setError] = useState<string | null>(null)
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
      try {
        await permitWorkflowApi.updateJsa(id, { [field]: value })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1600)
        onChanged?.()
      } catch (e) {
        setSaveState('error')
        setError(e instanceof ApiError ? e.message : 'Could not save that change.')
      }
    }, 700))
  }

  const addRow = async () => {
    setAdding(true)
    setError(null)
    try {
      // Seeded rather than blank: an empty row the server would reject is a dead end, and
      // the placeholder text says plainly that it has to be replaced.
      const created = await permitWorkflowApi.addJsa(permitId, {
        hazard: 'New hazard', control: 'Control to be described',
      })
      setRows((rs) => [...(rs ?? []), created])
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add a row.')
    } finally {
      setAdding(false)
    }
  }

  const removeRow = async (id: string) => {
    const previous = rows
    setRows((rs) => rs?.filter((r) => r.id !== id) ?? rs)
    try {
      await permitWorkflowApi.removeJsa(id)
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

      {rows === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <ClipboardList size={18} className="mx-auto mb-2 text-muted" />
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
                  <td className="px-2 py-1.5 text-2xs text-muted">{i + 1}</td>
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
