import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CloudOff, CloudUpload, FileText, Image as ImageIcon, LocateFixed, Send, Trash2, UserPlus, X } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { IncidentSeverity, IncidentType, NewIncidentInput, PersonInvolved } from '@/api/incidents'
import { SEVERITY_LABEL, TYPE_LABEL } from '@/api/incidents'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { useDepartments } from '@/features/org/departments'
import { Alert, Badge, Breadcrumbs, Button, Card, Checkbox, Input, SuggestSelect, LinkButton, Select, Textarea } from '@/components/ui'
import { usePageTitle } from '@/app/pageTitle'
import { fmtDateTime, INCIDENT_TYPE_GROUPS, severityKind, SITE_COORDS, useActor } from './lib'
import { enqueue, shouldRetry } from './outbox'
import { EVIDENCE_ACCEPT, EVIDENCE_HINT, screenEvidence, uploadEvidence } from './evidence'
import { StatusPill } from '@/components/ui'
import { cn } from '@/lib/cn'
import { uuid } from '@/lib/uuid'

const STEPS = ['What happened', 'Where & who', 'Details & evidence', 'Review & sign'] as const

interface Draft {
  step: number
  type: IncidentType | null
  /** Empty until the reporter chooses - see the note on emptyDraft. */
  severity: IncidentSeverity | ''
  title: string
  occurredAt: string
  siteId: string
  department: string
  location: string
  gps: string
  weather: string
  shift: string
  emergencyResponseActivated: boolean
  anonymous: boolean
  peopleInvolved: PersonInvolved[]
  witnesses: string
  immediateActions: string
  description: string
  signature: string
  attested: boolean
}

const emptyDraft = (): Draft => ({
  step: 0,
  type: null,
  /*
   * No default. This was 'Minor', and a default is the strongest nudge a form has: it is
   * the one answer that needs no decision at all (Hyman's refinement of Hick's law - the
   * likely option is chosen fastest), so a pre-filled "Minor" quietly became the answer for
   * anyone in a hurry. For severity that is the wrong way to be wrong: an under-classified
   * incident skips the escalation and investigation its real severity would trigger. Four
   * options cost a second to choose from; the reporter makes that choice on purpose.
   */
  severity: '',
  title: '',
  occurredAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  siteId: '',
  department: '',
  location: '',
  gps: '',
  weather: '',
  shift: '',
  emergencyResponseActivated: false,
  anonymous: false,
  peopleInvolved: [],
  witnesses: '',
  immediateActions: '',
  description: '',
  signature: '',
  attested: false,
})

/** Now, as the `datetime-local` value it is compared with: local wall-clock, no zone. */
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

/** Later than now, with the same few minutes' allowance for a fast clock as the server. */
const inFuture = (local: string) => !!local && new Date(local).getTime() > Date.now() + 15 * 60_000

export function ReportIncidentPage() {
  usePageTitle('Report an incident')
  const { user } = useAuth()
  const { company, sites } = useOrg()
  const actor = useActor()
  const navigate = useNavigate()
  const draftKey = `safeops.incidentDraft.${user?.id ?? 'anon'}`

  const departments = useDepartments()


  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  // Set when the report could not be sent and was put in the outbox instead. It is a
  // separate state from `error` because it is not one: the report is filed.
  const [queued, setQueued] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touchedNext, setTouchedNext] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // The files themselves. Kept in memory, not in the saved draft: a draft is text, and a
  // file cannot be written into it. See ./evidence.ts.
  const [files, setFiles] = useState<File[]>([])
  const [refused, setRefused] = useState<string[]>([])
  const [queuedWithFiles, setQueuedWithFiles] = useState(0)
  // Pristine forms never autosave — otherwise a reload would overwrite a real
  // stored draft with an empty one before the user can click "Resume".
  const dirty = useRef(false)
  /*
   * The report's idempotency key, made once per report and sent on the first attempt as well
   * as every retry. It used to be made only when the first attempt failed, so a report the
   * server had already saved - but whose reply never arrived (signal lost, or the page left
   * mid-send) - was queued under a new key and filed a second time. One injury, two records.
   * With the key on the first attempt, the server recognises any resend as the same report.
   */
  const clientRef = useRef(uuid())

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
      case 0: return draft.type !== null && draft.severity !== '' && draft.title.trim().length >= 8 && !!draft.occurredAt && !inFuture(draft.occurredAt)
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

  const addFiles = (chosen: FileList | null) => {
    if (!chosen) return
    const { ok, refused: no } = screenEvidence([...chosen])
    setFiles((f) => [...f, ...ok])
    setRefused(no)
  }

  const submit = async () => {
    if (!company || !draft.type || !draft.severity) return
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
      shift: draft.shift || undefined,
      emergencyResponseActivated: draft.emergencyResponseActivated,
      anonymous: draft.anonymous,
      occurredAt: new Date(draft.occurredAt).toISOString(),
      reporter: user?.name ?? 'Unknown',
      peopleInvolved: draft.peopleInvolved.filter((p) => p.name.trim()),
      witnesses: draft.witnesses.split(',').map((w) => w.trim()).filter(Boolean),
      immediateActions: draft.immediateActions,
      description: draft.description,
      attachments: [],
      signature: draft.signature,
      clientRef: clientRef.current,
    }
    try {
      const incident = await api.createIncident(input, actor)
      localStorage.removeItem(draftKey)
      // The report stands whatever happens to the files; the page says if any did not arrive.
      const evidenceFailed = files.length ? await uploadEvidence(incident.id, files, actor) : 0
      navigate(`/incidents/${incident.id}`, { state: { created: true, evidenceFailed } })
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined

      /*
       * Could not reach the server, rather than the server saying no.
       *
       * The report is accepted rather than refused. Telling a supervisor standing in a yard
       * to "try again" is asking them to remember, later, on their own, to reopen the app
       * and resubmit an injury — and the one person least able to do that is the one dealing
       * with the injury. So it goes in the outbox and is sent when there is signal.
       *
       * The key is generated here, once, and travels with the report for every attempt. That
       * is what stops a replay filing the same injury twice; the server enforces it with a
       * unique index on (companyId, clientRef).
       */
      if (shouldRetry(code)) {
        enqueue(user?.id ?? 'anonymous', input, clientRef.current)
        localStorage.removeItem(draftKey)
        setQueuedWithFiles(files.length)
        setQueued(true)
        setSubmitting(false)
        return
      }

      setError(e instanceof ApiError ? e.message : 'Submission failed — your draft is safe, try again.')
      setSubmitting(false)
    }
  }

  const siteName = sites.find((s) => s.id === draft.siteId)?.name

  /*
   * The report could not be sent and is now in the outbox.
   *
   * Deliberately a confirmation rather than an error, because from the reporter's side the
   * job is done: they filed it, it is kept, and it goes as soon as there is signal. Wording
   * it as a failure would invite them to fill the whole thing in again, which is how one
   * injury becomes two records.
   *
   * It replaces the form for the same reason - there is nothing left to do on this screen,
   * and leaving the filled-in form on display invites a second submission.
   */
  if (queued) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Breadcrumbs items={[{ label: 'Incidents', to: '/incidents' }, { label: 'Report saved' }]} />
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
          <CloudOff size={22} className="text-accent" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Report saved</h1>
        <p className="mt-2 text-sm text-ink-2">
          There was no connection to send it, so it is being held on this device and will be
          submitted automatically as soon as you are back online. You do not need to fill it
          in again.
        </p>
        {queuedWithFiles > 0 && (
          <Alert tone="warning" className="mt-3">
            The {queuedWithFiles === 1 ? 'photo or file' : `${queuedWithFiles} photos or files`} could not be kept
            on this device. Once the report has gone, open it and add them under Evidence.
          </Alert>
        )}
        <p className="mt-3 rounded-lg border bg-sunken px-3 py-2.5 text-xs text-ink-2">
          It is safe to close the app. Keep the phone signed in — the report is held for this
          account and sends on its own next time SafeChain is open with a connection.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <LinkButton to="/incidents" size="lg">Back to incidents</LinkButton>
          <LinkButton to="/incidents/new" variant="secondary" size="lg" onClick={() => setQueued(false)}>
            Report another
          </LinkButton>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: 'Incidents', to: '/incidents' },
          { label: 'Report an incident' },
        ]}
      />

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

      {/*
        What step 1 said, carried onto the steps after it - Miller's law.

        Working memory holds a handful of things at once, and steps 2 and 3 asked for more
        while hiding what had already been said: writing "What happened?" meant remembering
        the title and time given a minute earlier, or stepping back to check. Shown here, the
        reporter reads them instead of recalling them, and can jump back to fix one. The last
        step is a full review already, so it is not repeated there.
      */}
      {(step === 1 || step === 2) && draft.type && (
        <ReportingSummary
          type={draft.type}
          severity={draft.severity}
          title={draft.title}
          occurredAt={draft.occurredAt}
          onEdit={() => patch({ step: 0 })}
        />
      )}

      <Card className="p-5 md:p-6">
        {/* STEP 0 — what happened */}
        {step === 0 && (
          <div className="animate-rise space-y-5">
            {/*
              Grouped, not one flat grid of seventeen - see INCIDENT_TYPE_GROUPS (Hick's law).
              A fieldset per group, so a screen reader announces "Someone was hurt or made
              ill" before the types inside it, the same chunking a sighted person gets.
            */}
            <div role="group" aria-labelledby="incident-type-label">
              <p id="incident-type-label" className="mb-2 text-xs font-semibold text-ink-2">
                Incident type <span aria-hidden className="text-critical">*</span>
                <span className="ml-1.5 font-normal text-muted">Start with what happened, then pick the closest match.</span>
              </p>
              <div className="space-y-3">
                {INCIDENT_TYPE_GROUPS.map((group) => (
                  <fieldset key={group.label} className="rounded-xl border p-3">
                    <legend className="px-1 text-xs font-semibold text-ink">
                      {group.label}
                      <span className="ml-1.5 font-normal text-muted">{group.hint}</span>
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {group.types.map((t) => {
                        const active = draft.type === t
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patch({ type: t })}
                            aria-pressed={active}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all hover:-translate-y-0.5 coarse:min-h-12',
                              active ? 'bg-accent-soft shadow-card' : 'hover:bg-accent-soft/40',
                            )}
                            style={active ? { borderColor: 'var(--accent)' } : undefined}
                          >
                            <span className="text-xs font-medium leading-tight text-ink">{TYPE_LABEL[t]}</span>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              {touchedNext && !draft.type && <p className="mt-1.5 text-xs font-medium text-critical" role="alert">Pick the type that fits best.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Severity" required value={draft.severity}
                onChange={(e) => patch({ severity: e.target.value as IncidentSeverity })}
                error={touchedNext && draft.severity === '' ? 'Choose how serious it was.' : undefined}
              >
                <option value="" disabled>Choose severity…</option>
                {(['Minor', 'Moderate', 'Serious', 'Critical'] as const).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
              <Input
                label="Date & time of occurrence" required type="datetime-local"
                value={draft.occurredAt} onChange={(e) => patch({ occurredAt: e.target.value })}
                max={localNow()}
                error={inFuture(draft.occurredAt) ? 'That is in the future. Check the date and time.' : undefined}
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
              <SuggestSelect
                options={departments}
                label="Department"
                required
                placeholder="Select a department…"
                addLabel="Add a new department…"
                value={draft.department}
                onChange={(v) => patch({ department: v })}
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
                      className="h-9 coarse:h-11 flex-1 rounded-lg border bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                    />
                    <select
                      value={p.role}
                      onChange={(e) => {
                        const next = [...draft.peopleInvolved]
                        next[i] = { ...p, role: e.target.value as PersonInvolved['role'] }
                        patch({ peopleInvolved: next })
                      }}
                      className="h-9 coarse:h-11 rounded-lg border bg-surface px-2 text-sm text-ink-2 outline-none"
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Weather (optional)" value={draft.weather} onChange={(e) => patch({ weather: e.target.value })} hint="Relevant for outdoor and driving incidents.">
                <option value="">Not relevant</option>
                {['Clear / hot', 'Overcast', 'Rain', 'Heavy rain / storm', 'Haze', 'Night / low light'].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </Select>
              {/*
                A picked list, not free text: "night", "Night" and "nite" would be three
                different shifts, and the reason to record it is to be able to count it.
                Night shift turns up in causal analysis often enough to be worth the field.
              */}
              <Select label="Shift (optional)" value={draft.shift} onChange={(e) => patch({ shift: e.target.value })} hint="Night shift is a recurring factor worth counting.">
                <option value="">Not stated</option>
                {['Day', 'Night', 'Swing', 'Rotating', 'Office hours'].map((sh) => (
                  <option key={sh} value={sh}>{sh}</option>
                ))}
              </Select>
            </div>

            <label className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs text-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.emergencyResponseActivated}
                onChange={(e) => patch({ emergencyResponseActivated: e.target.checked })}
              />
              <span>
                Emergency response was activated
                <span className="block text-2xs text-muted">
                  Muster, evacuation, fire team or ambulance. A separate fact from severity -
                  a near miss can trigger a muster and a lost-time injury might not.
                </span>
              </span>
            </label>

            {/*
              Anonymity is a promise made to the person reporting, so it says exactly what
              it does. The reporter is still recorded server-side - an anonymous channel
              that keeps no record cannot be audited, and somebody has to be able to follow
              up on a serious allegation - but it is withheld from everyone below HSE
              manager, including on the register and in search.
            */}
            <label className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs text-ink">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.anonymous}
                onChange={(e) => patch({ anonymous: e.target.checked })}
              />
              <span>
                Report this anonymously
                <span className="block text-2xs text-muted">
                  Your name will not be shown on the incident, the register or search
                  results. Only the HSE manager and admins can see who reported it, so that
                  somebody can follow up if they need to.
                </span>
              </span>
            </label>

            <div>
              <p className="mb-2 text-xs font-semibold text-ink-2">Photos & documents</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors hover:bg-accent-soft/40"
              >
                <CloudUpload size={20} className="text-accent" />
                <span className="text-sm font-medium text-ink">Add photos or documents</span>
                <span className="text-2xs text-muted">{EVIDENCE_HINT}</span>
              </button>
              <input ref={fileRef} type="file" accept={EVIDENCE_ACCEPT} multiple className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
              {refused.length > 0 && (
                <Alert tone="warning" className="mt-2" onDismiss={() => setRefused([])}>
                  {refused.join(' ')}
                </Alert>
              )}
              {files.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
                      {f.type === 'application/pdf' ? <FileText size={14} className="text-accent" /> : <ImageIcon size={14} className="text-accent" />}
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{f.name}</span>
                      <span className="text-2xs text-muted">{Math.max(1, Math.round(f.size / 1024)).toLocaleString()} KB</span>
                      <button
                        aria-label={`Remove ${f.name}`}
                        onClick={() => setFiles(files.filter((_, x) => x !== i))}
                        className="rounded p-1 text-muted hover:text-critical coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center"
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
                {draft.severity && <StatusPill kind={severityKind(draft.severity)} label={SEVERITY_LABEL[draft.severity] ?? draft.severity} />}
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
                <ReviewRow label="Evidence" value={files.length ? `${files.length} file(s), sent with the report` : 'None'} />
                <ReviewRow label="Weather" value={draft.weather || '—'} />
                <ReviewRow label="Shift" value={draft.shift || '—'} />
                <ReviewRow label="Emergency response" value={draft.emergencyResponseActivated ? 'Activated' : 'Not activated'} />
                <ReviewRow label="Reported as" value={draft.anonymous ? 'Anonymous' : 'Named'} />
              </dl>
              <p className="border-t px-4 py-3 text-sm leading-relaxed text-ink-2">{draft.description}</p>
            </div>

            <div className="rounded-xl border px-4 py-4" style={{ borderColor: 'var(--accent)' }}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
                Digital signature
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

/** "You are reporting …": the answers from step 1, on the steps that follow it. */
export function ReportingSummary({
  type, severity, title, occurredAt, onEdit,
}: {
  type: IncidentType
  severity: IncidentSeverity | ''
  title: string
  occurredAt: string
  onEdit: () => void
}) {
  return (
    <section
      aria-label="You are reporting"
      className="mb-3 flex items-center gap-3 rounded-xl border bg-sunken px-3.5 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{title || TYPE_LABEL[type]}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
          <span>{TYPE_LABEL[type]}</span>
          {severity && <StatusPill kind={severityKind(severity)} label={SEVERITY_LABEL[severity] ?? severity} />}
          {occurredAt && <span>{fmtDateTime(new Date(occurredAt).toISOString())}</span>}
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
    </section>
  )
}
