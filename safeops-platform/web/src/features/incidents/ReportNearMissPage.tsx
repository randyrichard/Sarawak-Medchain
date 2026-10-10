import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CloudOff, Zap } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { NewIncidentInput } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import { useAuth } from '@/features/auth/AuthContext'
import { enqueue, shouldRetry } from './outbox'
import { useActor, SITE_COORDS } from './lib'
import { EVIDENCE_ACCEPT, screenEvidence, uploadEvidence } from './evidence'
import { Alert, Button, Card, LinkButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useUnsavedChangesWarning } from '@/lib/useUnsavedChangesWarning'
import { uuid } from '@/lib/uuid'

/**
 * Fast near-miss capture.
 *
 * Interview evidence (docs/CUSTOMER_RESEARCH.md, P1): workers do not report near misses
 * because there is "too much paperwork, takes too long, they forget, they think its
 * unimportant". The full incident form is a four-step wizard with thirteen controls —
 * appropriate for an LTI investigation, fatal for a 30-second observation.
 *
 * So this asks for two things only: what you saw, and where. Everything else is either
 * inferred (reporter, time, site, GPS) or optional. A near miss has no injury and no
 * damage by definition, so severity, people-involved and witness capture do not apply.
 *
 * The confirmation screen exists because they also said reporting goes unrewarded
 * ("maybe ndai award"): the reporter is told immediately that the report matters and
 * what happens next.
 */

/** The recurring near-miss categories on a multi-contractor SIMOPS site. */
const QUICK_TAGS = [
  'Slip / trip hazard',
  'Dropped object',
  'Vehicle / pedestrian',
  'Unsafe act',
  'Housekeeping',
  'PPE not worn',
  'Guard / barrier missing',
  'Electrical',
  'Chemical / spill',
  'Lifting',
]

export function ReportNearMissPage() {
  const { company, site, sites } = useOrg()
  const actor = useActor()

  const [what, setWhat] = useState('')
  const [where, setWhere] = useState('')
  const [tags, setTags] = useState<string[]>([])
  // The photos themselves - see ./evidence.ts for why the names alone were not enough.
  const [photos, setPhotos] = useState<File[]>([])
  const [refused, setRefused] = useState<string[]>([])
  const [photosFailed, setPhotosFailed] = useState(0)
  // Saved for sending with no signal: how many photos could not be kept with it, or null.
  const [queued, setQueued] = useState<number | null>(null)
  const { user } = useAuth()
  const [siteId, setSiteId] = useState(site?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ number: string; id: string } | null>(null)
  const [reportedCount, setReportedCount] = useState(0)

  const effectiveSite = siteId || site?.id || sites[0]?.id || ''

  // Half a near-miss report is worth keeping: ask before a stray click on the sidebar or a
  // closed tab throws it away. Not once it has been sent.
  useUnsavedChangesWarning(!done && !busy && (what.trim() !== '' || where.trim() !== '' || photos.length > 0 || tags.length > 0))

  // Recognition, not gamification: a simple running count of what this reporter has filed.
  useEffect(() => {
    try {
      setReportedCount(Number(localStorage.getItem('safeops.nearMiss.count') ?? '0'))
    } catch { /* storage unavailable — count is cosmetic */ }
  }, [])

  const valid = what.trim().length >= 5 && where.trim().length >= 2 && effectiveSite

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  const title = useMemo(() => {
    const base = what.trim().replace(/\s+/g, ' ')
    return base.length <= 90 ? base : `${base.slice(0, 87)}…`
  }, [what])

  // One key per near miss, kept across retries: pressing Submit again after a reply was lost
  // must not file it twice (see ReportIncidentPage). A new one after "Report another".
  const clientRef = useRef(uuid())

  const submit = async () => {
    if (!company || !valid) return
    setBusy(true)
    setError(null)
    let input: NewIncidentInput | null = null
    try {
      input = {
        title,
        type: 'near_miss',
        // A near miss caused no harm; potential severity is set during triage, not by
        // the reporter — asking them to rate it is one of the barriers to reporting.
        severity: 'Minor',
        companyId: company.id,
        siteId: effectiveSite,
        department: '',
        location: where.trim(),
        gps: SITE_COORDS[effectiveSite],
        occurredAt: new Date().toISOString(),
        reporter: actor.name,
        peopleInvolved: [],
        witnesses: [],
        immediateActions: '',
        description: [what.trim(), tags.length ? `\n\nCategory: ${tags.join(', ')}` : ''].join(''),
        attachments: [],
        signature: actor.name,
        clientRef: clientRef.current,
      }
      const created = await api.createIncident(input, actor)
      setPhotosFailed(photos.length ? await uploadEvidence(created.id, photos, actor) : 0)
      try {
        const n = reportedCount + 1
        localStorage.setItem('safeops.nearMiss.count', String(n))
        setReportedCount(n)
      } catch { /* cosmetic only */ }
      setDone({ number: created.number, id: created.id })
    } catch (e) {
      /*
       * No signal, rather than the server saying no: kept and sent later, as the full
       * incident form does. A near miss is the report most often made on a phone out on
       * site, and "try again" asks someone to remember to come back and retype it.
       */
      if (input && shouldRetry(e instanceof ApiError ? e.code : undefined)) {
        enqueue(user?.id ?? 'anonymous', input, clientRef.current)
        setQueued(photos.length)
        return
      }
      setError(e instanceof ApiError ? e.message : 'Could not submit. Your text is still here — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (queued !== null) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <Card className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <CloudOff size={26} aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">Saved on this phone</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
            There is no connection right now. Your report is kept here and sent on its own as soon as
            SafeChain is open with a signal. Keep the phone signed in.
          </p>
          {queued > 0 && (
            <Alert tone="warning" className="mt-3 text-left">
              {queued === 1 ? 'The photo' : `The ${queued} photos`} could not be kept with it. Once it has gone,
              open the report and add {queued === 1 ? 'it' : 'them'} under Evidence.
            </Alert>
          )}
          <Button className="mt-5" onClick={() => { clientRef.current = uuid(); setQueued(null); setWhat(''); setWhere(''); setTags([]); setPhotos([]) }}>
            Report another
          </Button>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <Card className="p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'var(--good-soft, var(--accent-soft))', color: 'var(--good)' }}>
            <Check size={28} strokeWidth={2.6} />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">Thank you — that was worth reporting</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
            Logged as <span className="font-mono font-semibold text-accent">{done.number}</span>. An HSE
            officer reviews every near miss and raises a corrective action where it is needed.
          </p>
          {photosFailed > 0 && (
            <Alert tone="warning" className="mt-3 text-left">
              {photosFailed === 1 ? 'The photo' : `${photosFailed} photos`} did not upload. Open the report and
              add {photosFailed === 1 ? 'it' : 'them'} under Evidence.
            </Alert>
          )}
          <p className="mt-3 text-sm font-semibold text-ink">
            {reportedCount === 1
              ? 'That is your first near miss report.'
              : `That is ${reportedCount} near misses you have reported.`}
          </p>
          <p className="mt-1 text-2xs leading-relaxed text-muted">
            Near misses are the warnings that come before someone gets hurt. Reporting one is
            the cheapest safety improvement there is.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => { clientRef.current = uuid(); setDone(null); setWhat(''); setWhere(''); setTags([]); setPhotos([]) }}>
              Report another
            </Button>
            <LinkButton variant="secondary" to="/">Back to home</LinkButton>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="group/nm mx-auto max-w-lg py-2">
      <div className="mb-4">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Report a near miss</h1>
        <p className="text-xs text-ink-2">
          Two questions, about thirty seconds. No injury or damage — just what you saw.
        </p>
      </div>

      {error && <Alert tone="critical" className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}

      <Card className="space-y-4 p-4">
        {/* 1. What */}
        <div>
          <label htmlFor="nm-what" className="text-sm font-semibold text-ink">What happened, or what did you see?</label>
          <textarea
            id="nm-what"
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            rows={4}
            autoFocus
            placeholder="e.g. Scaffold plank not secured on level 3 — could have fallen onto the walkway below"
            // 16px (text-lg in this scale): anything smaller makes iOS zoom on focus.
            className="mt-1.5 w-full rounded-lg border bg-surface px-3 py-2.5 text-lg text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          <p className="mt-1 text-2xs text-muted">Plain words are fine. No form language needed.</p>
        </div>

        {/* 2. Where */}
        <div>
          <label htmlFor="nm-where" className="text-sm font-semibold text-ink">Where was it?</label>
          <div className="mt-1.5">
            <input
              id="nm-where"
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="e.g. Jetty 2, near loading arm 3"
              className="h-11 w-full rounded-lg border bg-surface px-3 text-lg text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </div>
          {sites.length > 1 && (
            <select
              value={effectiveSite}
              onChange={(e) => setSiteId(e.target.value)}
              aria-label="Site"
              className="mt-2 h-9 coarse:h-11 w-full rounded-lg border bg-surface px-2.5 text-sm text-ink-2 outline-none"
            >
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {/* Optional category — tap, don't type */}
        <div>
          <p className="text-xs font-semibold text-ink-2">Category <span className="font-normal text-muted">(optional)</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                /*
                 * These are toggles, so they have to say whether they are on.
                 *
                 * Selection was signalled by colour alone - accent fill for chosen, plain
                 * for not - which is invisible to a screen reader and unreliable for anyone
                 * who cannot distinguish the two. `aria-pressed` is the standard way to say
                 * it, and it costs one attribute.
                 *
                 * The period filters on the dashboard already do this; these were the ones
                 * that did not.
                 */
                aria-pressed={tags.includes(t)}
                className={cn(
                  'inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 py-1.5 text-2xs font-semibold transition-colors coarse:min-h-11 coarse:px-4',
                  // Tinted with a check mark, not filled solid: three chosen tags in the same
                  // solid blue as "Submit near miss" made four equal standouts on one form,
                  // and the button that matters stopped being the one that stood out. The
                  // check is the non-colour cue for which tags are on.
                  tags.includes(t) ? 'border-[color:var(--accent)] bg-accent-soft text-ink' : 'text-ink-2 hover:bg-accent-soft',
                )}
              >
                {tags.includes(t) && <Check size={12} aria-hidden className="text-accent" />}
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Optional photo */}
        <div>
          <p className="text-xs font-semibold text-ink-2">Photo <span className="font-normal text-muted">(optional)</span></p>
          <label className="mt-1.5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-ink-2 hover:bg-accent-soft/40">
            {photos.length > 0 ? `${photos.length} photo(s) to send` : 'Take or attach a photo'}
            {/*
              No `capture` attribute: it opens the camera directly on Android, so a photo already taken
              could not be chosen - though this says "or attach". Without it, the phone
              offers the camera and the gallery.
            */}
            <input
              type="file"
              accept={EVIDENCE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                const { ok, refused: no } = screenEvidence(Array.from(e.target.files ?? []))
                setPhotos([...photos, ...ok])
                setRefused(no)
                e.target.value = ''
              }}
            />
          </label>
          {refused.length > 0 && <Alert tone="warning" className="mt-2" onDismiss={() => setRefused([])}>{refused.join(' ')}</Alert>}
        </div>
      </Card>

      {/*
        Single primary action, thumb-reachable - pinned to the bottom while reading, but not
        while typing. With the keyboard up the screen is a third of its height, and a pinned
        bar sat on top of the very field being filled in ("Where was it?" was hidden on every
        phone tested). So it stops pinning while a text field has focus, and on short
        (landscape) screens, and simply follows the form.
      */}
      <div className="sticky bottom-0 mt-4 bg-page pb-2 pt-2 short:static group-has-[input:focus,textarea:focus]/nm:static">
        <Button
          className="min-h-[44px] w-full"
          size="lg"
          icon={<Zap size={16} />}
          loading={busy}
          disabled={!valid}
          onClick={() => void submit()}
        >
          Submit near miss
        </Button>
        <p className="mt-2 text-center text-2xs text-muted">
          Need to report an injury, damage or a spill?{' '}
          <Link to="/incidents/new" className="font-semibold text-accent hover:underline">Use the full report</Link>
        </p>
      </div>
    </div>
  )
}
