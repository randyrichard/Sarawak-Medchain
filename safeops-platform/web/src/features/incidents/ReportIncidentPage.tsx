import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, CloudUpload, FileText, Film, Image as ImageIcon,
  LocateFixed, PenLine, Send, Trash2, UserPlus, X,
} from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { AttachmentKind, IncidentSeverity, IncidentType, NewIncidentInput, PersonInvolved } from '@/api/incidents'
import { INCIDENT_TYPES, TYPE_LABEL } from '@/api/incidents'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Badge, Button, Card, Checkbox, Input, Select, Textarea } from '@/components/ui'
import { severityKind, SITE_COORDS, TYPE_ICON, useActor } from './lib'
import { StatusPill } from '@/components/ui'
import { cn } from '@/lib/cn'

const STEPS = ['What happened', 'Where & who', 'Details & evidence', 'Review & sign'] as const

interface Draft {
  step: number
  type: IncidentType | null
  severity: IncidentSeverity
  title: string
  occurredAt: string
  siteId: string
  department: string
  location: string
  gps: string
  weather: string
  peopleInvolved: PersonInvolved[]
  witnesses: string
  immediateActions: string
  description: string
  attachments: { name: string; kind: AttachmentKind; sizeKb: number }[]
  signature: string
  attested: boolean
}

const emptyDraft = (): Draft => ({
  step: 0,
  type: null,
  severity: 'Minor',
  title: '',
  occurredAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  siteId: '',
  department: '',
  location: '',
  gps: '',
  weather: '',
  peopleInvolved: [],
  witnesses: '',
  immediateActions: '',
  description: '',
  attachments: [],
  signature: '',
  attested: false,
})

const kindOf = (name: string): AttachmentKind => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel'
  return 'report'
}

export function ReportIncidentPage() {
  const { user } = useAuth()
  const { company, sites } = useOrg()
  const actor = useActor()
  const navigate = useNavigate()
  const draftKey = `safeops.incidentDraft.${user?.id ?? 'anon'}`

  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touchedNext, setTouchedNext] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // Pristine forms never autosave — otherwise a reload would overwrite a real
  // stored draft with an empty one before the user can click "Resume".
  const dirty = useRef(false)

  // Restore banner
  useEffect(() => {
    const raw = localStorage.getItem(draftKey)
    if (raw) setResumeAvailable(true)
  }, [draftKey])

  // Autosave (debounced, only after first interaction)
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify(draft))
      setSavedAt(new Date())
    }, 700)
    return () => clearTimeout(t)
  }, [draft, draftKey])

  const patch = (p: Partial<Draft>) => {
    dirty.current = true
    setDraft((d) => ({ ...d, ...p }))
  }
  const step = draft.step

  const stepValid = useMemo(() => {
    switch (step) {
      case 0: return draft.type !== null && draft.title.trim().length >= 8 && !!draft.occurredAt
      case 1: return !!draft.siteId && draft.department.trim() !== '' && draft.location.trim() !== ''
      case 2: return draft.description.trim().length >= 30 && draft.immediateActions.trim() !== ''
      case 3: return draft.signature.trim().length >= 5 && draft.attested
      default: return false
    }
  }, [draft, step])

  const next = () => {
    if (!stepValid) {
      setTouchedNext(true)
      return
    }
    setTouchedNext(false)
    patch({ step: Math.min(step + 1, 3) })
  }
  const back = () => patch({ step: Math.max(step - 1, 0) })

  const captureGps = () => {
    const fallback = () => patch({ gps: `${SITE_COORDS[draft.siteId] ?? 'unavailable'} (site datum)` })
    if (!navigator.geolocation) return fallback()
    navigator.geolocation.getCurrentPosition(
      (pos) => patch({ gps: `${pos.coords.latitude.toFixed(4)}° , ${pos.coords.longitude.toFixed(4)}° (device)` }),
      fallback,
      { timeout: 3000 },
    )
  }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const mapped = [...files].map((f) => ({ name: f.name, kind: kindOf(f.name), sizeKb: Math.max(1, Math.round(f.size / 1024)) }))
    patch({ attachments: [...draft.attachments, ...mapped] })
  }

  const submit = async () => {
    if (!company || !draft.type) return
    setSubmitting(true)
    setError(null)
    const input: NewIncidentInput = {
      title: draft.title,
      type: draft.type,
      severity: draft.severity,
      companyId: company.id,
      siteId: draft.siteId,
      department: draft.department,
      location: draft.location,
      gps: draft.gps || undefined,
      weather: draft.weather || undefined,
      occurredAt: new Date(draft.occurredAt).toISOString(),
      reporter: user?.name ?? 'Unknown',
      peopleInvolved: draft.peopleInvolved.filter((p) => p.name.trim()),
      witnesses: draft.witnesses.split(',').map((w) => w.trim()).filter(Boolean),
      immediateActions: draft.immediateActions,
      description: draft.description,
      attachments: draft.attachments,
      signature: draft.signature,
    }
    try {
      const incident = await api.createIncident(input, actor)
      localStorage.removeItem(draftKey)
      navigate(`/incidents/${incident.id}`, { state: { created: true } })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Submission failed — your draft is safe, try again.')
      setSubmitting(false)
    }
  }

  const siteName = sites.find((s) => s.id === draft.siteId)?.name

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/incidents" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
        <ArrowLeft size={13} /> All incidents
      </Link>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Report an incident</h1>
          <p className="mt-1 text-sm text-ink-2">Four short steps — most reports take under three minutes.</p>
        </div>
        <span className="text-2xs text-muted" aria-live="polite">
          {savedAt ? `Draft saved ${savedAt.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Autosave on'}
        </span>
      </div>

      {resumeAvailable && step === 0 && draft.title === '' && (
        <Alert
          tone="info"
          title="You have an unfinished report"
          className="mb-4"
          onDismiss={() => {
            localStorage.removeItem(draftKey)
            setResumeAvailable(false)
          }}
        >
          <button
            className="font-semibold text-accent underline"
            onClick={() => {
              const raw = localStorage.getItem(draftKey)
              if (raw) setDraft(JSON.parse(raw))
              setResumeAvailable(false)
            }}
          >
            Resume where you left off
          </button>
          {' '}or dismiss to start fresh.
        </Alert>
      )}

      {/* Progress */}
      <ol className="mb-5 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <div
              className="h-1.5 rounded-full transition-colors"
              style={{ background: i < step ? 'var(--good)' : i === step ? 'var(--accent)' : 'var(--grid)' }}
            />
            <span className={cn('hidden text-2xs font-medium sm:block', i === step ? 'text-ink' : 'text-muted')}>
              {i < step ? <Check size={10} className="mr-0.5 inline text-good" /> : null}
              {label}
            </span>
          </li>
        ))}
      </ol>

      <Card className="p-5 md:p-6">
        {/* STEP 0 — what happened */}
        {step === 0 && (
          <div className="animate-rise space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-ink-2">
                Incident type <span className="text-critical">*</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {INCIDENT_TYPES.map((t) => {
                  const Icon = TYPE_ICON[t]
                  const active = draft.type === t
                  return (
                    <button
                      key={t}
                      onClick={() => patch({ type: t })}
                      className={cn(
                        'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5',
                        active ? 'bg-accent-soft shadow-card' : 'hover:bg-accent-soft/40',
                      )}
                      style={active ? { borderColor: 'var(--accent)' } : undefined}
                    >
                      <Icon size={16} className={active ? 'text-accent' : 'text-muted'} />
                      <span className="text-xs font-medium leading-tight text-ink">{TYPE_LABEL[t]}</span>
                    </button>
                  )
                })}
              </div>
              {touchedNext && !draft.type && <p className="mt-1.5 text-xs font-medium text-critical" role="alert">Pick the type that fits best.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Severity" required value={draft.severity} onChange={(e) => patch({ severity: e.target.value as IncidentSeverity })}>
                {(['Minor', 'Moderate', 'Serious', 'Critical'] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              <Input
                label="Date & time of occurrence" required type="datetime-local"
                value={draft.occurredAt} onChange={(e) => patch({ occurredAt: e.target.value })}
              />
            </div>

            <Input
              label="One-line title" required placeholder="e.g. Forklift near-collision with pedestrian in Aisle D"
              value={draft.title} onChange={(e) => patch({ title: e.target.value })}
              error={touchedNext && draft.title.trim().length < 8 ? 'Give it a short descriptive title (at least 8 characters).' : undefined}
              hint="Auto-numbered on submit — you don't need to include a number."
            />
          </div>
        )}

        {/* STEP 1 — where & who */}
        {step === 1 && (
          <div className="animate-rise space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Site" required value={draft.siteId}
                onChange={(e) => patch({ siteId: e.target.value, gps: '' })}
                error={touchedNext && !draft.siteId ? 'Select the site.' : undefined}
              >
                <option value="" disabled>Select site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Input
                label="Department" required placeholder="e.g. Warehouse & Stores"
                value={draft.department} onChange={(e) => patch({ department: e.target.value })}
                error={touchedNext && !draft.department.trim() ? 'Which department does this belong to?' : undefined}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Input
                label="Exact location" required placeholder="e.g. Aisle D, racking bay 12"
                value={draft.location} onChange={(e) => patch({ location: e.target.value })}
                error={touchedNext && !draft.location.trim() ? 'Describe where exactly it happened.' : undefined}
              />
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-ink-2">GPS</span>
                <Button variant="secondary" icon={<LocateFixed size={14} />} onClick={captureGps} disabled={!draft.siteId}>
                  {draft.gps ? 'Recapture' : 'Capture'}
                </Button>
              </div>
            </div>
            {draft.gps && <Badge tone="accent">{draft.gps}</Badge>}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-2">People involved</p>
                <Button
                  variant="ghost" size="sm" icon={<UserPlus size={13} />}
                  onClick={() => patch({ peopleInvolved: [...draft.peopleInvolved, { name: '', role: 'Employee' }] })}
                >
                  Add person
                </Button>
              </div>
              {draft.peopleInvolved.length === 0 && <p className="text-xs text-muted">None added — that's fine for hazards and near misses.</p>}
              <div className="space-y-2">
                {draft.peopleInvolved.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={p.name}
                      onChange={(e) => {
                        const next = [...draft.peopleInvolved]
                        next[i] = { ...p, name: e.target.value }
                        patch({ peopleInvolved: next })
                      }}
                      placeholder="Name or role, e.g. Reach truck operator"
                      className="h-9 flex-1 rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                    />
                    <select
                      value={p.role}
                      onChange={(e) => {
                        const next = [...draft.peopleInvolved]
                        next[i] = { ...p, role: e.target.value as PersonInvolved['role'] }
                        patch({ peopleInvolved: next })
                      }}
                      className="h-9 rounded-lg border bg-surface px-2 text-sm text-ink-2 outline-none"
                    >
                      <option>Employee</option>
                      <option>Contractor</option>
                    </select>
                    <button
                      aria-label="Remove person"
                      onClick={() => patch({ peopleInvolved: draft.peopleInvolved.filter((_, x) => x !== i) })}
                      className="rounded-lg p-2 text-muted hover:bg-critical-soft hover:text-critical"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <Input
              label="Witnesses" placeholder="Comma-separated, e.g. Shift supervisor, Banksman"
              value={draft.witnesses} onChange={(e) => patch({ witnesses: e.target.value })}
              hint="Optional — names or roles of anyone who saw it."
            />
            <Input label="Reporter" value={user?.name ?? ''} disabled hint="Reports are filed under your account." />
          </div>
        )}

        {/* STEP 2 — details & evidence */}
        {step === 2 && (
          <div className="animate-rise space-y-5">
            <Textarea
              label="What happened?" required rows={5}
              placeholder="Describe the sequence of events in plain language — what, when, how…"
              value={draft.description} onChange={(e) => patch({ description: e.target.value })}
              error={touchedNext && draft.description.trim().length < 30 ? 'A few sentences, please (at least 30 characters) — this drives the investigation.' : undefined}
            />
            <Textarea
              label="Immediate actions taken" required rows={3}
              placeholder="e.g. Area isolated, supervisor informed, first aid given…"
              value={draft.immediateActions} onChange={(e) => patch({ immediateActions: e.target.value })}
              error={touchedNext && !draft.immediateActions.trim() ? 'What was done right away? "Nothing yet" is a valid answer.' : undefined}
            />
            <Select label="Weather (optional)" value={draft.weather} onChange={(e) => patch({ weather: e.target.value })} hint="Relevant for outdoor and driving incidents.">
              <option value="">Not relevant</option>
              {['Clear / hot', 'Overcast', 'Rain', 'Heavy rain / storm', 'Haze', 'Night / low light'].map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </Select>

            <div>
              <p className="mb-2 text-xs font-semibold text-ink-2">Photos, videos & documents</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors hover:bg-accent-soft/40"
              >
                <CloudUpload size={20} className="text-accent" />
                <span className="text-sm font-medium text-ink">Click to add evidence</span>
                <span className="text-2xs text-muted">Images · video · PDF · Word · Excel · inspection reports</span>
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
              {draft.attachments.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {draft.attachments.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                      {a.kind === 'image' ? <ImageIcon size={14} className="text-accent" /> : a.kind === 'video' ? <Film size={14} className="text-accent" /> : <FileText size={14} className="text-accent" />}
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{a.name}</span>
                      <span className="text-2xs text-muted">{a.sizeKb.toLocaleString()} KB</span>
                      <button
                        aria-label={`Remove ${a.name}`}
                        onClick={() => patch({ attachments: draft.attachments.filter((_, x) => x !== i) })}
                        className="rounded p-1 text-muted hover:text-critical"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* STEP 3 — review & sign */}
        {step === 3 && draft.type && (
          <div className="animate-rise space-y-5">
            {error && <Alert tone="critical" title="Couldn't submit">{error}</Alert>}
            <div className="rounded-xl border">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <StatusPill kind={severityKind(draft.severity)} label={draft.severity} />
                <Badge tone="accent">{TYPE_LABEL[draft.type]}</Badge>
                <span className="text-2xs text-muted">number assigned on submit</span>
              </div>
              <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2">
                <ReviewRow label="Title" value={draft.title} />
                <ReviewRow label="When" value={new Date(draft.occurredAt).toLocaleString('en-MY')} />
                <ReviewRow label="Site" value={siteName ?? '—'} />
                <ReviewRow label="Department" value={draft.department} />
                <ReviewRow label="Location" value={draft.location} />
                <ReviewRow label="GPS" value={draft.gps || '—'} />
                <ReviewRow label="People involved" value={draft.peopleInvolved.map((p) => `${p.name} (${p.role})`).join(', ') || 'None'} />
                <ReviewRow label="Witnesses" value={draft.witnesses || 'None'} />
                <ReviewRow label="Evidence" value={`${draft.attachments.length} file(s)`} />
                <ReviewRow label="Weather" value={draft.weather || '—'} />
              </dl>
              <p className="border-t px-4 py-3 text-sm leading-relaxed text-ink-2">{draft.description}</p>
            </div>

            <div className="rounded-xl border px-4 py-4" style={{ borderColor: 'var(--accent)' }}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
                <PenLine size={12} /> Digital signature
              </p>
              <Input
                label="Type your full name to sign" required placeholder={user?.name}
                value={draft.signature} onChange={(e) => patch({ signature: e.target.value })}
                error={touchedNext && draft.signature.trim().length < 5 ? 'Type your full name as your signature.' : undefined}
              />
              {draft.signature.trim().length >= 5 && (
                <p className="mt-2 border-b pb-1 font-mono text-lg italic text-ink">{draft.signature}</p>
              )}
              <div className="mt-3">
                <Checkbox
                  label="I confirm this report is accurate to the best of my knowledge."
                  checked={draft.attested}
                  onChange={(e) => patch({ attested: e.target.checked })}
                />
                {touchedNext && !draft.attested && <p className="mt-1 text-xs font-medium text-critical" role="alert">Please confirm before submitting.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Wizard nav */}
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <Button variant="ghost" onClick={back} disabled={step === 0} icon={<ArrowLeft size={14} />}>
            Back
          </Button>
          {step < 3 ? (
            <Button onClick={next} icon={<ArrowRight size={14} />}>
              Continue
            </Button>
          ) : (
            <Button onClick={() => (stepValid ? void submit() : setTouchedNext(true))} loading={submitting} icon={<Send size={14} />}>
              Submit report
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate font-medium text-ink" title={value}>{value}</dd>
    </div>
  )
}
