import { useEffect, useMemo, useState } from 'react'
import { performanceApi, type Target } from '@/api/performanceApi'
import { ApiError } from '@/api/types'
import { Button, Dialog } from '@/components/ui'
import { TARGET_DEFS, parseTarget, targetInput } from './lib'

/**
 * Setting the company's targets.
 *
 * One field per indicator, already showing which way it points ("at most" for injury
 * rates, "at least" for reporting and closure), so a target cannot be entered backwards.
 * A blank field means no target, and only the fields that changed are saved.
 */
export function TargetsDialog({
  open, companyId, targets, onClose, onSaved,
}: {
  open: boolean
  companyId: string
  targets: Target[]
  onClose: () => void
  onSaved: () => void
}) {
  const current = useMemo(() => {
    const out: Record<string, string> = {}
    for (const d of TARGET_DEFS) out[d.metric] = targetInput(targets.find((t) => t.metric === d.metric))
    return out
  }, [targets])
  const [draft, setDraft] = useState(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (open) { setDraft(current); setError(null) } }, [open, current])

  const parsed = TARGET_DEFS.map((d) => ({ def: d, result: parseTarget(d.metric, draft[d.metric] ?? '') }))
  const invalid = parsed.some((p) => !p.result.ok)
  const changed = parsed.filter((p) => (draft[p.def.metric] ?? '').trim() !== (current[p.def.metric] ?? ''))

  const save = async () => {
    if (invalid) return
    setSaving(true)
    setError(null)
    try {
      for (const { def, result } of changed) {
        if (result.ok) await performanceApi.setTarget({ companyId, metric: def.metric, value: result.value })
      }
      onSaved()
      onClose()
    } catch (e) {
      // Targets before the failure are saved; refresh so the page shows what stuck.
      onSaved()
      setError(e instanceof ApiError ? e.message : 'Could not save the targets. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set Performance Targets"
      description="The figures your company commits to for each period. Each tile and site is then marked on or off target. Leave a field blank for no target."
      width="max-w-lg"
      error={error}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={changed.length === 0 || invalid} onClick={() => void save()}>
            {changed.length > 1 ? `Save ${changed.length} targets` : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {parsed.map(({ def, result }) => (
          <label key={def.metric} className="block">
            <span className="text-xs font-semibold text-ink">{def.label}</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="w-14 shrink-0 text-2xs font-semibold text-ink-2">{def.direction === 'max' ? 'At most' : 'At least'}</span>
              <span className="relative flex-1">
                <input
                  inputMode="decimal"
                  value={draft[def.metric] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [def.metric]: e.target.value }))}
                  placeholder="No target"
                  aria-invalid={!result.ok || undefined}
                  aria-describedby={`target-hint-${def.metric}`}
                  className="h-9 coarse:h-11 w-full rounded-lg border bg-surface px-2.5 pr-8 text-sm tabular-nums text-ink outline-none placeholder:text-muted focus:border-accent aria-[invalid=true]:border-[color:var(--critical)]"
                />
                {(def.unit === 'percent' || def.unit === 'ratio') && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted" aria-hidden>
                    {def.unit === 'percent' ? '%' : ':1'}
                  </span>
                )}
              </span>
            </span>
            <span id={`target-hint-${def.metric}`} className={result.ok ? 'mt-0.5 block text-2xs text-muted' : 'mt-0.5 block text-2xs text-critical'}>
              {result.ok ? def.hint : result.error}
            </span>
          </label>
        ))}
      </div>
    </Dialog>
  )
}
