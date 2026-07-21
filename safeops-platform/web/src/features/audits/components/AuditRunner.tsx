import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, LocateFixed, PenLine, Send, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type {
  AuditAnswer, AuditAnswerResult, AuditTemplate, AuditView, FailInput, FindingSeverity,
} from '@/api/audits'
import { useActor, PEOPLE, SITE_COORDS } from '@/features/incidents/lib'
import { Alert, Badge, Button, Checkbox, Input } from '@/components/ui'
import { cn } from '@/lib/cn'

interface DraftState {
  answers: Record<string, { result?: AuditAnswerResult; comment?: string; photoCount?: number }>
  fails: Record<string, Partial<FailInput>>
  signature: string
  gps: string
}

const SEVERITIES: FindingSeverity[] = ['Critical', 'Major', 'Minor', 'Observation']

/** Sectioned digital audit checklist. Failed items collect a finding (severity,
 *  description, owner) which becomes a corrective action on submit. */
export function AuditRunner({
  audit, template, onClose, onCompleted,
}: {
  audit: AuditView
  template: AuditTemplate
  onClose: () => void
  onCompleted: () => void
}) {
  const actor = useActor()
  const draftKey = `safeops.auditDraft.${audit.id}`
  const [draft, setDraft] = useState<DraftState>({ answers: {}, fails: {}, signature: '', gps: '' })
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const dirty = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string | null>(null)

  const allItems = useMemo(
    () => template.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))),
    [template],
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        setDraft(JSON.parse(raw))
        setSavedAt('restored')
      }
    } catch { /* fresh start */ }
  }, [draftKey])

  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify(draft))
      setSavedAt(new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 600)
    return () => clearTimeout(t)
  }, [draft, draftKey])

  const setAnswer = (id: string, p: Partial<{ result: AuditAnswerResult; comment: string; photoCount: number }>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, answers: { ...d.answers, [id]: { ...d.answers[id], ...p } } }))
  }
  const setFail = (id: string, p: Partial<FailInput>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, fails: { ...d.fails, [id]: { ...d.fails[id], ...p } } }))
  }
  const patch = (p: Partial<DraftState>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, ...p }))
  }

  const answered = allItems.filter((i) => draft.answers[i.id]?.result).length
  const fails = allItems.filter((i) => draft.answers[i.id]?.result === 'fail')
  const failsIncomplete = fails.filter((i) => {
    const f = draft.fails[i.id]
    return !f?.description?.trim() || !f?.owner
  })
  const canSubmit = answered === allItems.length && failsIncomplete.length === 0 && draft.signature.trim().length >= 5 && attested

  const captureGps = () => {
    const fallback = () => patch({ gps: `${SITE_COORDS[audit.siteId] ?? 'unavailable'} (site datum)` })
    if (!navigator.geolocation) return fallback()
    navigator.geolocation.getCurrentPosition(
      (pos) => patch({ gps: `${pos.coords.latitude.toFixed(4)}°, ${pos.coords.longitude.toFixed(4)}° (device)` }),
      fallback,
      { timeout: 3000 },
    )
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    const answers: AuditAnswer[] = allItems.map((i) => ({
      itemId: i.id,
      section: i.section,
      text: i.text,
      result: draft.answers[i.id]!.result!,
      comment: draft.answers[i.id]?.comment?.trim() || undefined,
      photoCount: draft.answers[i.id]?.photoCount ?? 0,
    }))
    const failsInput: Record<string, FailInput> = {}
    fails.forEach((i) => {
      const f = draft.fails[i.id]!
      failsInput[i.id] = {
        severity: (f.severity ?? 'Minor') as FindingSeverity,
        description: f.description!.trim(),
        owner: f.owner!,
        photoCount: draft.answers[i.id]?.photoCount ?? 0,
        linkedAssetId: f.linkedAssetId,
      }
    })
    try {
      await api.completeAudit(audit.id, { answers, fails: failsInput, signature: draft.signature, gps: draft.gps || undefined }, actor)
      localStorage.removeItem(draftKey)
      onCompleted()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Submission failed — your answers are saved locally.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 animate-fade-in bg-black/50" aria-hidden />
      <aside role="dialog" aria-label={`Audit checklist ${audit.code}`} className="absolute inset-y-0 right-0 flex w-full max-w-[600px] animate-scale-in flex-col border-l bg-surface shadow-modal">
        <div className="border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-2xs text-muted">{audit.code} · {template.name}</p>
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-ink">{audit.title}</h2>
            </div>
            <button onClick={onClose} aria-label="Close checklist" className="rounded-lg p-1.5 text-muted hover:bg-accent-soft hover:text-ink">
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grid">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${Math.round((answered / allItems.length) * 100)}%` }} />
            </div>
            <span className="text-2xs font-semibold text-ink-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{answered}/{allItems.length}</span>
            <span className="text-2xs text-muted" aria-live="polite">
              {savedAt === 'restored' ? 'draft restored' : savedAt ? `saved ${savedAt}` : 'autosave on'}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <Alert tone="critical">{error}</Alert>}
          {template.sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-accent">{section.title}</p>
              <div className="space-y-2.5">
                {section.items.map((item) => {
                  const a = draft.answers[item.id]
                  const f = draft.fails[item.id]
                  return (
                    <div key={item.id} className="rounded-xl border p-3">
                      <p className="text-sm font-medium leading-snug text-ink">{item.text}</p>
                      {item.guidance && <p className="mt-0.5 text-2xs text-muted">{item.guidance}</p>}
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {(['pass', 'fail', 'na'] as AuditAnswerResult[]).map((r) => {
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
                      {a?.result && a.result !== 'fail' && (
                        <input
                          value={a?.comment ?? ''}
                          onChange={(e) => setAnswer(item.id, { comment: e.target.value })}
                          placeholder="Comment (optional)"
                          className="mt-2 h-8 w-full rounded-lg border bg-surface px-2.5 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
                        />
                      )}
                      {a?.result === 'fail' && (
                        <div className="mt-2 space-y-2 rounded-lg p-2.5" style={{ background: 'var(--critical-soft)' }}>
                          <p className="text-2xs font-bold uppercase tracking-wider text-critical">Finding</p>
                          <textarea
                            value={f?.description ?? ''}
                            onChange={(e) => setFail(item.id, { description: e.target.value })}
                            rows={2}
                            placeholder="Describe the non-conformity (required)…"
                            className={cn('w-full rounded-lg border bg-surface px-2.5 py-2 text-xs text-ink outline-none placeholder:text-muted focus:border-accent', !f?.description?.trim() && 'border-[var(--critical)]')}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={f?.severity ?? 'Minor'}
                              onChange={(e) => setFail(item.id, { severity: e.target.value as FindingSeverity })}
                              className="h-8 rounded-lg border bg-surface px-2 text-xs text-ink-2 outline-none"
                              aria-label="Finding severity"
                            >
                              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
                            </select>
                            <select
                              value={f?.owner ?? ''}
                              onChange={(e) => setFail(item.id, { owner: e.target.value })}
                              className={cn('h-8 rounded-lg border bg-surface px-2 text-xs text-ink-2 outline-none', !f?.owner && 'border-[var(--critical)]')}
                              aria-label="Action owner"
                            >
                              <option value="" disabled>Action owner…</option>
                              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
                            </select>
                          </div>
                          <button
                            onClick={() => {
                              photoTarget.current = item.id
                              fileRef.current?.click()
                            }}
                            className="flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-2xs font-semibold text-ink-2 hover:text-ink"
                          >
                            <Camera size={12} /> Evidence photos ({a?.photoCount ?? 0})
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => {
              const id = photoTarget.current
              if (id) setAnswer(id, { photoCount: (draft.answers[id]?.photoCount ?? 0) + (e.target.files?.length ?? 0) })
            }} />

          <div className="grid grid-cols-1 gap-2">
            <button onClick={captureGps} className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold text-ink-2 hover:bg-accent-soft">
              <LocateFixed size={13} /> {draft.gps ? 'GPS captured ✓' : 'Capture GPS'}
            </button>
            {draft.gps && <Badge tone="accent">{draft.gps}</Badge>}
          </div>

          <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--accent)' }}>
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-accent">
              <PenLine size={11} /> Lead auditor signature
            </p>
            <Input placeholder={actor.name} value={draft.signature} onChange={(e) => patch({ signature: e.target.value })} aria-label="Type your full name to sign" />
            {draft.signature.trim().length >= 5 && <p className="mt-1.5 border-b pb-1 font-mono text-base italic text-ink">{draft.signature}</p>}
            <div className="mt-2">
              <Checkbox label="Findings and scores reflect the evidence sighted." checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            </div>
          </div>
        </div>

        <div className="border-t px-5 py-3">
          {fails.length > 0 && (
            <p className="mb-2 text-2xs font-semibold text-critical">
              {fails.length} finding(s) → {fails.length} corrective action(s) will be created on submit.
            </p>
          )}
          <Button className="w-full" size="lg" icon={<Send size={14} />} loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            {answered < allItems.length
              ? `Answer ${allItems.length - answered} more item(s)`
              : failsIncomplete.length > 0
                ? 'Complete finding details for failed items'
                : 'Submit audit'}
          </Button>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
