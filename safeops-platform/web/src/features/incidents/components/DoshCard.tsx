import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { doshApi, DOSH_OPTIONS, type DoshCategory, type DoshInput, type DoshView } from '@/api/doshApi'
import { isBackendConfigured } from '@/api/authApi'
import { ApiError } from '@/api/types'
import { Alert, Button, Card, CardBody, CardHeader, Dialog, ErrorAlert, Input, NotInDemo, Select, Skeleton, Textarea } from '@/components/ui'
import { toLocalInput } from '@/features/toolbox/lib'
import { fmtDateTime } from '../lib'

/**
 * Whether DOSH must be told, and whether it has been: the NADOPOD duty on this incident.
 *
 * In the right-hand column, beside the next step, because it is a legal deadline and the
 * seven days run whatever tab somebody is on. The server decides what is owed and by when
 * (api/src/domain/doshNotification.ts); this card says it, and records what people did.
 */
export function DoshCard({ incidentId, onChanged }: { incidentId: string; onChanged?: () => void }) {
  if (!isBackendConfigured()) {
    return (
      <Card>
        <CardHeader title="DOSH Notification" />
        <CardBody>
          <NotInDemo>
            Tracking a DOSH notification needs the server: the decision, the seven-day JKKP 6 or JKKP 7
            deadline and DOSH&apos;s reference.
          </NotInDemo>
        </CardBody>
      </Card>
    )
  }
  return <LiveDoshCard incidentId={incidentId} onChanged={onChanged} />
}

/** "YYYY-MM-DD" as a readable date, without the time zone moving it a day. */
const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })

function daysText(n: number | null) {
  if (n === null) return ''
  if (n === 0) return 'due today'
  if (n > 0) return `${n} day${n === 1 ? '' : 's'} left`
  return `${-n} day${n === -1 ? '' : 's'} overdue`
}

function LiveDoshCard({ incidentId, onChanged }: { incidentId: string; onChanged?: () => void }) {
  const [view, setView] = useState<DoshView | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    doshApi.get(incidentId).then(setView).catch(setLoadError)
  }, [incidentId])
  useEffect(() => { load() }, [load])

  if (loadError) {
    return (
      <Card>
        <CardHeader title="DOSH Notification" />
        <CardBody><ErrorAlert error={loadError} /></CardBody>
      </Card>
    )
  }
  if (!view) {
    return (
      <Card>
        <CardHeader title="DOSH Notification" />
        <CardBody><Skeleton className="h-16 w-full rounded-lg" /></CardBody>
      </Card>
    )
  }

  const s = view.status
  const overdue = s.state === 'overdue'
  const action = view.category ? 'Update' : 'Record Decision'

  return (
    <Card>
      <CardHeader title="DOSH Notification" />
      <CardBody className="space-y-2.5 text-sm">
        {s.state === 'decide' && (
          <div className="space-y-1.5 rounded-lg border border-warning/60 bg-warning-soft/30 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <AlertTriangle size={12} aria-hidden /> Decide whether DOSH must be told
            </p>
            <p className="text-2xs leading-relaxed text-ink">{view.suggestion.reason}</p>
            {s.dueDate && (
              <p className="text-2xs text-ink-2">
                If it is notifiable, JKKP 6 is due by <span className="font-semibold">{fmtDay(s.dueDate)}</span> ({daysText(s.daysLeft)}).
              </p>
            )}
          </div>
        )}

        {s.state === 'unflagged' && (
          <p className="text-2xs leading-relaxed text-muted">{view.suggestion.reason}</p>
        )}

        {view.category && view.category !== 'not_notifiable' && (
          <div className="space-y-1">
            <p className="font-medium text-ink">{view.categoryLabel}</p>
            {view.detail && <p className="text-2xs text-ink-2">{view.detail}</p>}
          </div>
        )}

        {s.immediateOutstanding && (
          <Alert tone="critical">
            Tell DOSH now, by the quickest means - telephone or e-mail to the nearest office - then record it here.
          </Alert>
        )}

        {(s.state === 'due' || s.state === 'overdue') && s.dueDate && (
          <p className={overdue ? 'flex items-center gap-1.5 text-xs font-semibold text-critical' : 'flex items-center gap-1.5 text-xs text-ink'}>
            <Clock size={12} aria-hidden />
            {s.form} {overdue ? 'was due' : 'due by'} {fmtDay(s.dueDate)} · {daysText(s.daysLeft)}
          </p>
        )}

        {s.state === 'submitted' && view.submittedAt && (
          <p className="flex items-center gap-1.5 text-xs text-good">
            <CheckCircle2 size={12} aria-hidden /> {s.form} sent {fmtDateTime(view.submittedAt)}
            {view.reference && <span className="text-ink-2"> · ref {view.reference}</span>}
          </p>
        )}

        {view.informedAt && (
          <p className="text-2xs text-ink-2">
            DOSH told {fmtDateTime(view.informedAt)}
            {[view.informedHow, view.office].filter(Boolean).length > 0 && ` · ${[view.informedHow, view.office].filter(Boolean).join(', ')}`}
          </p>
        )}

        {s.state === 'not_required' && (
          <div className="space-y-1">
            <p className="font-medium text-ink">Not notifiable to DOSH</p>
            <p className="text-2xs leading-relaxed text-ink-2">{view.notRequiredReason}</p>
          </div>
        )}

        {view.decidedBy && view.decidedAt && (
          <p className="text-2xs text-muted">Decided by {view.decidedBy}, {fmtDateTime(view.decidedAt)}</p>
        )}

        {view.canEdit ? (
          <Button size="sm" variant={s.state === 'decide' || s.immediateOutstanding || overdue ? 'primary' : 'secondary'} className="w-full" onClick={() => setOpen(true)}>
            {action}
          </Button>
        ) : (
          (s.state === 'decide' || s.state === 'due' || overdue) && (
            <p className="text-2xs text-muted">An HSE Manager, Safety Officer or Admin records this.</p>
          )
        )}
      </CardBody>

      {open && (
        <DoshDialog
          view={view}
          onClose={() => setOpen(false)}
          onSaved={(v) => { setView(v); setOpen(false); onChanged?.() }}
        />
      )}
    </Card>
  )
}

const HOW = ['Telephone', 'E-mail', 'In person', 'myKKP', 'Fax']

/** An ISO instant as a datetime-local value, or empty. */
const localValue = (iso: string | null) => (iso ? toLocalInput(new Date(iso)) : '')
/** A datetime-local value as an ISO instant, or null. */
const isoOf = (v: string) => (v ? new Date(v).toISOString() : null)
/** A date input's "YYYY-MM-DD" as noon local, so no zone moves it to another day. */
const isoOfDay = (v: string) => (v ? new Date(`${v}T12:00:00`).toISOString() : null)

function DoshDialog({ view, onClose, onSaved }: { view: DoshView; onClose: () => void; onSaved: (v: DoshView) => void }) {
  const [category, setCategory] = useState<DoshCategory | ''>(view.category ?? view.suggestion.category ?? '')
  const [detail, setDetail] = useState(view.detail ?? '')
  const [reason, setReason] = useState(view.notRequiredReason ?? '')
  const [clockFrom, setClockFrom] = useState(view.clockFrom ? view.clockFrom.slice(0, 10) : '')
  const [informedAt, setInformedAt] = useState(localValue(view.informedAt))
  const [informedHow, setInformedHow] = useState(view.informedHow ?? '')
  const [office, setOffice] = useState(view.office ?? '')
  const [submittedAt, setSubmittedAt] = useState(localValue(view.submittedAt))
  const [reference, setReference] = useState(view.reference ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const option = DOSH_OPTIONS.find((o) => o.value === category)
  const notifiable = !!category && category !== 'not_notifiable'
  const immediate = category === 'death' || category === 'serious_bodily_injury' || category === 'dangerous_occurrence'
  const form = category === 'occupational_poisoning' || category === 'occupational_disease' ? 'JKKP 7' : 'JKKP 6'

  const save = async () => {
    if (!category) {
      setError('Choose why DOSH must, or need not, be told.')
      return
    }
    setBusy(true)
    setError(null)
    const input: DoshInput = {
      category,
      // Only the categories that ask for it: a description typed under another one is not this one's.
      detail: category === 'serious_bodily_injury' || category === 'dangerous_occurrence' ? detail || null : null,
      notRequiredReason: category === 'not_notifiable' ? reason : null,
      clockFrom: form === 'JKKP 7' ? isoOfDay(clockFrom) : null,
      informedAt: notifiable ? isoOf(informedAt) : null,
      informedHow: notifiable ? informedHow || null : null,
      office: notifiable ? office || null : null,
      submittedAt: notifiable ? isoOf(submittedAt) : null,
      reference: notifiable ? reference || null : null,
    }
    try {
      onSaved(await doshApi.save(view.incidentId, input))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the DOSH record.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      error={error}
      title="DOSH Notification"
      description="Under the NADOPOD Regulations 2004. SafeChain records what was decided and sent; it does not submit anything to DOSH."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-ink-2">Category</legend>
          <p className="mb-1 text-2xs text-muted">Why DOSH must, or need not, be told.</p>
          {DOSH_OPTIONS.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 hover:bg-sunken/60">
              <input
                type="radio" name="dosh-category" value={o.value} className="mt-1"
                checked={category === o.value} onChange={() => setCategory(o.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm text-ink">{o.label}</span>
                <span className="block text-2xs leading-relaxed text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {view.suggestion.flagged && (
          <p className="text-2xs leading-relaxed text-muted">From the record: {view.suggestion.reason}</p>
        )}

        {(category === 'serious_bodily_injury' || category === 'dangerous_occurrence') && (
          <Input
            label={category === 'serious_bodily_injury' ? 'Which First Schedule injury' : 'Which dangerous occurrence'}
            required value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500}
            placeholder={category === 'serious_bodily_injury' ? 'e.g. Fracture of the left wrist' : 'e.g. Collapse of a scaffold over 5 m'}
          />
        )}

        {category === 'not_notifiable' && (
          <Textarea
            label="Why DOSH need not be told" required rows={3} value={reason} maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. First aid only, back at normal work the same shift; no First Schedule injury."
          />
        )}

        {form === 'JKKP 7' && notifiable && (
          <Input
            label="Date you learned of the diagnosis" type="date" value={clockFrom}
            onChange={(e) => setClockFrom(e.target.value)}
            hint="The seven days run from this date. Leave it empty to count from the incident."
          />
        )}

        {notifiable && immediate && (
          <div className="space-y-3 rounded-lg border px-3 py-3">
            <p className="text-xs font-semibold text-ink-2">Told DOSH at once</p>
            <Input label="When" type="datetime-local" value={informedAt} onChange={(e) => setInformedAt(e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="How" value={informedHow} onChange={(e) => setInformedHow(e.target.value)}>
                <option value="">Choose…</option>
                {HOW.map((h) => <option key={h}>{h}</option>)}
              </Select>
              <Input label="DOSH office" value={office} maxLength={120} onChange={(e) => setOffice(e.target.value)} placeholder="e.g. JKKP Sarawak, Kuching" />
            </div>
          </div>
        )}

        {notifiable && (
          <div className="space-y-3 rounded-lg border px-3 py-3">
            <p className="text-xs font-semibold text-ink-2">The written report ({form})</p>
            <Input label="Sent on" type="datetime-local" value={submittedAt} onChange={(e) => setSubmittedAt(e.target.value)} />
            <Input label="DOSH reference" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="The reference DOSH or myKKP gave you" />
          </div>
        )}

        {option && <p className="text-2xs leading-relaxed text-muted">{option.hint}</p>}
      </div>
    </Dialog>
  )
}
