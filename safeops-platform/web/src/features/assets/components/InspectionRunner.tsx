import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Camera, CheckCircle2, LocateFixed, PenLine, Send, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { ChecklistAnswer, ChecklistResult, InspectionView } from '@/api/assets'
import { CHECKLISTS } from '@/api/mock/assets'
import { useActor, SITE_COORDS } from '@/features/incidents/lib'
import { Alert, Badge, Button, Checkbox, Input, Textarea } from '@/components/ui'
import { cn } from '@/lib/cn'

type DraftState = {
  answers: Record<string, { result?: ChecklistResult; comment?: string; measurement?: string }>
  comments: string
  signature: string
  photoCount: number
  gps: string
}

/** Full-screen digital inspection form: checklist, evidence, GPS, signature.
 *  Autosaves locally (offline-ready pattern) and clears on submit. */
export function InspectionRunner({
  inspection, onClose, onCompleted,
}: {
  inspection: InspectionView | null
  onClose: () => void
  onCompleted: () => void
}) {
  const actor = useActor()
  const [draft, setDraft] = useState<DraftState>({ answers: {}, comments: '', signature: '', photoCount: 0, gps: '' })
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InspectionView | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const dirty = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const template = inspection ? CHECKLISTS[inspection.category] : []
  const draftKey = inspection ? `safeops.inspectionDraft.${inspection.id}` : ''

  // restore draft when opening
  useEffect(() => {
    if (!inspection) return
    setResult(null)
    setError(null)
    setAttested(false)
    dirty.current = false
    try {
      const raw = localStorage.getItem(draftKey)
      setDraft(raw ? JSON.parse(raw) : { answers: {}, comments: '', signature: '', photoCount: 0, gps: '' })
      if (raw) setSavedAt('restored')
      else setSavedAt(null)
    } catch {
      setDraft({ answers: {}, comments: '', signature: '', photoCount: 0, gps: '' })
    }
  }, [inspection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // autosave — the offline-ready pattern: nothing is lost if the phone dies
  useEffect(() => {
    if (!inspection || !dirty.current) return
    const t = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify(draft))
      setSavedAt(new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 600)
    return () => clearTimeout(t)
  }, [draft, inspection, draftKey])

  const patch = (p: Partial<DraftState>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, ...p }))
  }
  const setAnswer = (itemId: string, p: Partial<{ result: ChecklistResult; comment: string; measurement: string }>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, answers: { ...d.answers, [itemId]: { ...d.answers[itemId], ...p } } }))
  }

  const answered = template.filter((t) => draft.answers[t.id]?.result).length
  const fails = template.filter((t) => draft.answers[t.id]?.result === 'fail')
  const failsMissingComment = fails.filter((t) => !draft.answers[t.id]?.comment?.trim())
  const canSubmit = answered === template.length && failsMissingComment.length === 0 && draft.signature.trim().length >= 5 && attested

  const captureGps = () => {
    if (!inspection) return
    const fallback = () => patch({ gps: `${SITE_COORDS[inspection.siteId] ?? 'unavailable'} (site datum)` })
    if (!navigator.geolocation) return fallback()
    navigator.geolocation.getCurrentPosition(
      (pos) => patch({ gps: `${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}° (device)` }),
      fallback,
      { timeout: 3000 },
    )
  }

  const submit = async () => {
    if (!inspection) return
    setBusy(true)
    setError(null)
    const answers: ChecklistAnswer[] = template.map((t) => ({
      itemId: t.id,
      label: t.label,
      result: draft.answers[t.id]!.result!,
      comment: draft.answers[t.id]?.comment?.trim() || undefined,
      measurement: draft.answers[t.id]?.measurement?.trim() || undefined,
    }))
    try {
      const done = await api.completeInspection(
        inspection.id,
        { answers, comments: draft.comments, photoCount: draft.photoCount, gps: draft.gps || undefined, signature: draft.signature },
        actor,
      )
      localStorage.removeItem(draftKey)
      setResult(done)
      onCompleted()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Submission failed — your answers are saved locally.')
    } finally {
      setBusy(false)
    }
  }

  const progressPct = useMemo(() => (template.length ? Math.round((answered / template.length) * 100) : 0), [answered, template.length])

  if (!inspection) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={result ? onClose : undefined} aria-hidden />
      <aside role="dialog" aria-label={`Inspection ${inspection.code}`} className="absolute inset-y-0 right-0 flex w-full max-w-[560px] animate-scale-in flex-col border-l bg-surface shadow-modal">
        {/* Header */}
        <div className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-2xs text-muted">{inspection.code}</p>
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-ink">{inspection.assetName}</h2>
              <p className="text-2xs text-muted">
                {inspection.assetCode} · scheduled {inspection.scheduledFor} · inspector {inspection.assignedTo}
                {inspection.overdue && <Badge tone="critical" className="ml-1.5">overdue</Badge>}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink">
              <X size={16} />
            </button>
          </div>
          {!result && (
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grid">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-2xs font-semibold text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {answered}/{template.length}
              </span>
              <span className="text-2xs text-muted" aria-live="polite">
                {savedAt === 'restored' ? 'draft restored' : savedAt ? `saved ${savedAt}` : 'autosave on'}
              </span>
            </div>
          )}
        </div>

        {/* Result screen */}
        {result ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 size={36} style={{ color: result.outcome === 'passed' ? 'var(--good)' : 'var(--serious)' }} />
              <p className="text-lg font-semibold text-ink">
                {result.outcome === 'passed' ? 'Inspection passed' : `Completed — ${result.actionCodes.length} defect(s) found`}
              </p>
              <p className="max-w-sm text-sm leading-relaxed text-ink-2">
                {result.outcome === 'passed'
                  ? 'All checklist items passed. The next inspection has been scheduled automatically.'
                  : 'Each failed item became a corrective action, assigned to the asset owner and tracked in the CAPA module until verified.'}
              </p>
            </div>
            {result.actionCodes.length > 0 && (
              <div className="space-y-1.5">
                {result.actionIds.map((id, i) => (
                  <Link key={id} to={`/actions?open=${id}`}
                    className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-accent-soft/50"
                    style={{ borderColor: 'var(--serious)' }}>
                    <span>Corrective action created</span>
                    <span className="font-mono text-xs text-accent">{result.actionCodes[i]}</span>
                  </Link>
                ))}
              </div>
            )}
            <p className="text-center text-2xs text-muted">Next inspection auto-scheduled — this asset cannot fall off the calendar.</p>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            {/* Checklist */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {error && <Alert tone="critical">{error}</Alert>}
              {template.map((item, idx) => {
                const a = draft.answers[item.id]
                return (
                  <div key={item.id} className="animate-rise rounded-xl border p-3" style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}>
                    <p className="text-sm font-medium leading-snug text-ink">
                      <span className="mr-1.5 text-2xs font-bold text-muted">{idx + 1}.</span>
                      {item.label}
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {(['pass', 'fail', 'na'] as ChecklistResult[]).map((r) => {
                        const active = a?.result === r
                        const color = r === 'pass' ? 'var(--good)' : r === 'fail' ? 'var(--critical)' : 'var(--muted)'
                        return (
                          <button
                            key={r}
                            onClick={() => setAnswer(item.id, { result: r })}
                            className={cn('rounded-lg border py-1.5 text-xs font-bold uppercase tracking-wide transition-all', active ? 'text-white' : 'text-ink-2 hover:text-ink')}
                            style={active ? { background: color, borderColor: color } : undefined}
                          >
                            {r === 'na' ? 'N/A' : r}
                          </button>
                        )
                      })}
                    </div>
                    {item.measure && a?.result && a.result !== 'na' && (
                      <input
                        value={a?.measurement ?? ''}
                        onChange={(e) => setAnswer(item.id, { measurement: e.target.value })}
                        placeholder={item.measure}
                        className="mt-2 h-8 w-full rounded-lg border bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
                      />
                    )}
                    {a?.result === 'fail' && (
                      <textarea
                        value={a?.comment ?? ''}
                        onChange={(e) => setAnswer(item.id, { comment: e.target.value })}
                        rows={2}
                        placeholder="Describe the defect (required) — this becomes a corrective action…"
                        className={cn(
                          'mt-2 w-full rounded-lg border bg-surface px-2.5 py-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent',
                          !a?.comment?.trim() && 'border-[var(--critical)]',
                        )}
                      />
                    )}
                  </div>
                )
              })}

              {/* Evidence + context */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold text-ink-2 hover:bg-accent-soft">
                  <Camera size={13} /> Photos ({draft.photoCount})
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => patch({ photoCount: draft.photoCount + (e.target.files?.length ?? 0) })} />
                <button onClick={captureGps} className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold text-ink-2 hover:bg-accent-soft">
                  <LocateFixed size={13} /> {draft.gps ? 'GPS ✓' : 'Capture GPS'}
                </button>
              </div>
              {draft.gps && <Badge tone="accent">{draft.gps}</Badge>}

              <Textarea label="Overall comments (optional)" rows={2} value={draft.comments} onChange={(e) => patch({ comments: e.target.value })} />

              <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--accent)' }}>
                <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-accent">
                  <PenLine size={11} /> Digital signature
                </p>
                <Input placeholder={actor.name} value={draft.signature} onChange={(e) => patch({ signature: e.target.value })} aria-label="Type your full name to sign" />
                {draft.signature.trim().length >= 5 && <p className="mt-1.5 border-b pb-1 font-mono text-base italic text-ink">{draft.signature}</p>}
                <div className="mt-2">
                  <Checkbox label="I performed this inspection and the results are accurate." checked={attested} onChange={(e) => setAttested(e.target.checked)} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-5 py-3">
              {fails.length > 0 && (
                <p className="mb-2 text-2xs font-semibold text-critical">
                  {fails.length} failed item(s) → {fails.length} corrective action(s) will be auto-created on submit.
                </p>
              )}
              <Button className="w-full" size="lg" icon={<Send size={14} />} loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
                {answered < template.length ? `Answer ${template.length - answered} more item(s)` : 'Submit inspection'}
              </Button>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  )
}
