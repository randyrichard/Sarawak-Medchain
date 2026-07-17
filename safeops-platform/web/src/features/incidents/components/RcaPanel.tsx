import { useState } from 'react'
import { CheckCircle2, GitBranch, HelpCircle, Plus, Save, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import { RCA_CATEGORIES, type Incident, type RcaCategory, type RcaCause } from '@/api/incidents'
import { Alert, Badge, Button, Select, Textarea } from '@/components/ui'
import { useActor } from '../lib'
import { cn } from '@/lib/cn'

/** Structured RCA: multiple contributing causes + a guided Five Whys drill-down. */
export function RcaPanel({ incident, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  const actor = useActor()
  const editable = incident.stage === 'rca'
  const rca = incident.rca

  const [causes, setCauses] = useState<RcaCause[]>(rca?.causes ?? [])
  const [newCategory, setNewCategory] = useState<RcaCategory>('Unsafe Behaviour')
  const [newDesc, setNewDesc] = useState('')
  const [problem, setProblem] = useState(rca?.fiveWhys.problem ?? incident.title)
  const [whys, setWhys] = useState<string[]>(rca?.fiveWhys.whys ?? ['', '', '', '', ''])
  const [rootStatement, setRootStatement] = useState(rca?.fiveWhys.rootStatement ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await api.saveIncidentRca(incident.id, causes, { problem, whys, rootStatement }, actor)
      onUpdate(updated)
      setSaved(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const addCause = () => {
    if (!newDesc.trim()) return
    setCauses((c) => [...c, { id: `c-${Date.now().toString(36)}`, category: newCategory, description: newDesc.trim() }])
    setNewDesc('')
    setSaved(false)
  }

  const visibleWhys = Math.min(5, Math.max(1, whys.findIndex((w) => !w.trim()) === -1 ? 5 : whys.findIndex((w) => !w.trim()) + 1))

  if (!editable && !rca) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted">
        Root cause analysis opens once investigation findings are recorded.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {rca?.approvedBy && (
        <Alert tone="success" title={`Root cause approved by ${rca.approvedBy}`}>
          Approved {rca.approvedAt ? new Date(rca.approvedAt).toLocaleDateString('en-MY') : ''} — the analysis below is locked.
        </Alert>
      )}

      {/* Contributing causes */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <GitBranch size={12} /> Contributing causes
        </p>
        {causes.length === 0 && <p className="mb-2 text-xs text-muted">None yet — add every cause that contributed, not just the biggest one.</p>}
        <ul className="space-y-2">
          {causes.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-lg border px-3.5 py-2.5">
              <Badge tone="accent" className="mt-0.5 shrink-0">{c.category}</Badge>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-2">{c.description}</p>
              {editable && (
                <button
                  aria-label="Remove cause"
                  onClick={() => { setCauses((cs) => cs.filter((x) => x.id !== c.id)); setSaved(false) }}
                  className="rounded p-1 text-muted hover:text-critical"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as RcaCategory)}
              className="h-9 rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
              aria-label="Cause category"
            >
              {RCA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCause()}
              placeholder="Describe how this cause contributed…"
              className="h-9 flex-1 rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
            <Button variant="secondary" size="md" icon={<Plus size={14} />} onClick={addCause}>Add</Button>
          </div>
        )}
      </div>

      {/* Guided Five Whys */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <HelpCircle size={12} /> Five Whys — guided drill-down
        </p>
        <div className="space-y-2.5 rounded-xl border p-4">
          <Textarea label="Problem statement" rows={2} value={problem} disabled={!editable}
            onChange={(e) => { setProblem(e.target.value); setSaved(false) }} />
          {Array.from({ length: editable ? visibleWhys : 5 }).map((_, i) => {
            const value = whys[i] ?? ''
            if (!editable && !value.trim()) return null
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span
                  className={cn('mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                    value.trim() ? 'bg-accent text-white' : 'border text-muted')}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    value={value}
                    disabled={!editable}
                    onChange={(e) => {
                      const next = [...whys]
                      next[i] = e.target.value
                      setWhys(next)
                      setSaved(false)
                    }}
                    placeholder={i === 0 ? 'Why did the problem happen?' : 'Why was that the case?'}
                    className="h-9 w-full rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent disabled:opacity-70"
                  />
                </div>
              </div>
            )
          })}
          <Textarea
            label="Root cause statement" rows={2} required value={rootStatement} disabled={!editable}
            onChange={(e) => { setRootStatement(e.target.value); setSaved(false) }}
            placeholder="The underlying systemic cause, in one or two sentences…"
            hint={editable ? 'Stop asking why when you reach something the management system can fix.' : undefined}
          />
        </div>
      </div>

      {editable && (
        <div className="flex items-center gap-3">
          <Button icon={<Save size={14} />} loading={busy} onClick={() => void save()}>Save RCA</Button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--delta-good)' }}>
              <CheckCircle2 size={13} /> Saved
            </span>
          )}
          {error && <span className="text-xs font-medium text-critical">{error}</span>}
        </div>
      )}
    </div>
  )
}
