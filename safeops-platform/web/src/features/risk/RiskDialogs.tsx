import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LIKELIHOOD, RISK_ACTION, RISK_LEVEL_LABEL, riskApi, riskLevel, SEVERITY,
  type RatingStep, type RiskInput, type RiskLevel, type RiskRow,
} from '@/api/riskApi'
import type { Site } from '@/api/types'
import { Alert, Badge, Button, DetailRow, Dialog, FormRow, FormSection, FormSections, Input, Select, Textarea } from '@/components/ui'
import { errorMessage } from '@/lib/useAsync'

export const LEVEL_TONE: Record<RiskLevel, 'good' | 'warning' | 'critical'> = { low: 'good', medium: 'warning', high: 'critical' }

export function RiskBadge({ score }: { score: number }) {
  const level = riskLevel(score)
  return <Badge tone={LEVEL_TONE[level]} className="whitespace-nowrap">{score} {RISK_LEVEL_LABEL[level]}</Badge>
}

/** The band alone, beside a score already written out. */
const LevelBadge = ({ level }: { level: RiskLevel }) => <Badge tone={LEVEL_TONE[level]}>{RISK_LEVEL_LABEL[level]}</Badge>

/** "YYYY-MM-DD" as a readable date, without a time zone moving it a day. */
export const fmtDay = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const yearAfter = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate()
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** One axis of the matrix as a list of choices, each with the guideline's description. */
function RatingPicker({ name, legend, steps, value, onChange }: {
  name: string
  legend: string
  steps: RatingStep[]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-xs font-semibold text-ink-2">{legend}</legend>
      {steps.map((s) => (
        <label key={s.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-1.5 hover:bg-sunken/60">
          <input type="radio" name={name} value={s.value} className="mt-1" checked={value === s.value} onChange={() => onChange(s.value)} />
          <span className="min-w-0 text-sm">
            <span className="font-medium text-ink">{s.value} {s.label}</span>
            <span className="block text-2xs text-muted">{s.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

const blank = (siteId: string): RiskInput => {
  const t = today()
  return {
    siteId, activity: '', hazard: '', effect: '', existingControls: '', likelihood: 3, severity: 3,
    additionalControls: '', owner: '', controlsDue: null, residualLikelihood: null, residualSeverity: null,
    assessedBy: '', assessedOn: t, reviewDue: yearAfter(t),
  }
}

const inputOf = (r: RiskRow): RiskInput => ({
  siteId: r.siteId, activity: r.activity, hazard: r.hazard, effect: r.effect, existingControls: r.existingControls,
  likelihood: r.likelihood, severity: r.severity, additionalControls: r.additionalControls, owner: r.owner,
  controlsDue: r.controlsDue, residualLikelihood: r.residualLikelihood, residualSeverity: r.residualSeverity,
  assessedBy: r.assessedBy, assessedOn: r.assessedOn, reviewDue: r.reviewDue,
})

/** Adding a hazard, or changing one: the HIRARC form's fields, in its order. */
export function RiskEditDialog({ companyId, sites, defaultSiteId, row, onClose, onSaved }: {
  companyId: string
  sites: Site[]
  defaultSiteId: string
  row: RiskRow | null
  onClose: () => void
  onSaved: (row: RiskRow) => void
}) {
  const [f, setF] = useState<RiskInput>(() => (row ? inputOf(row) : blank(defaultSiteId)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof RiskInput>(k: K, v: RiskInput[K]) => setF((p) => ({ ...p, [k]: v }))

  const score = f.likelihood * f.severity
  const level = riskLevel(score)
  const residualScore = f.residualLikelihood && f.residualSeverity ? f.residualLikelihood * f.residualSeverity : null

  const save = async () => {
    setBusy(true); setError(null)
    try {
      onSaved(row ? await riskApi.update(row.id, f, row.version) : await riskApi.create(companyId, f))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? `Change ${row.code}` : 'Add a Hazard'}
      description="One hazard of one work activity: what it can cause, the controls in place, and the risk."
      width="max-w-2xl"
      error={error ? <Alert tone="critical">{error}</Alert> : null}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      )}
    >
      <FormSections>
        <FormSection title="The Hazard">
          <FormRow>
            <Select label="Site" value={f.siteId} onChange={(e) => set('siteId', e.target.value)} required>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Work Activity" value={f.activity} onChange={(e) => set('activity', e.target.value)} placeholder="Loading at Bay 4" required />
            <Input label="Hazard" value={f.hazard} onChange={(e) => set('hazard', e.target.value)} placeholder="Reversing forklift" required />
            <Input label="Which Can Cause" value={f.effect} onChange={(e) => set('effect', e.target.value)} placeholder="Struck-by injury, crushing" required />
          </FormRow>
          <Textarea label="Existing Controls" rows={2} value={f.existingControls} onChange={(e) => set('existingControls', e.target.value)} hint="What is already in place, if anything." />
        </FormSection>

        <FormSection title="Risk Now">
          <FormRow>
            <RatingPicker name="likelihood" legend="Likelihood" steps={LIKELIHOOD} value={f.likelihood} onChange={(v) => set('likelihood', v)} />
            <RatingPicker name="severity" legend="Severity" steps={SEVERITY} value={f.severity} onChange={(v) => set('severity', v)} />
          </FormRow>
          <div className="rounded-lg border px-3 py-2" aria-live="polite">
            <p className="text-sm text-ink">
              Risk <span className="font-semibold tabular-nums">{f.likelihood} × {f.severity} = {score}</span> <LevelBadge level={level} />
            </p>
            <p className="mt-0.5 text-xs text-ink-2">{RISK_ACTION[level]}</p>
          </div>
        </FormSection>

        <FormSection title="Further Controls" description="By the hierarchy of control: eliminate, substitute, engineer, administer, then PPE.">
          <Textarea
            label="Recommended Controls" rows={2} value={f.additionalControls}
            onChange={(e) => set('additionalControls', e.target.value)}
            hint={level === 'low' ? 'Optional for a low risk.' : 'What will bring the risk down, and is not in place yet.'}
          />
          <FormRow>
            <Input label="Person in Charge" value={f.owner} onChange={(e) => set('owner', e.target.value)} hint="Who puts the recommended controls in place." />
            <Input label="Date for Completion" type="date" value={f.controlsDue ?? ''} onChange={(e) => set('controlsDue', e.target.value || null)} />
            <Select
              label="Likelihood Once Controlled" value={f.residualLikelihood ?? ''}
              onChange={(e) => set('residualLikelihood', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Not rated yet</option>
              {LIKELIHOOD.map((s) => <option key={s.value} value={s.value}>{s.value} {s.label}</option>)}
            </Select>
            <Select
              label="Severity Once Controlled" value={f.residualSeverity ?? ''}
              onChange={(e) => set('residualSeverity', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Not rated yet</option>
              {SEVERITY.map((s) => <option key={s.value} value={s.value}>{s.value} {s.label}</option>)}
            </Select>
          </FormRow>
          {residualScore !== null && (
            <p className="text-sm text-ink">
              Once controlled <span className="font-semibold tabular-nums">{f.residualLikelihood} × {f.residualSeverity} = {residualScore}</span>{' '}
              <LevelBadge level={riskLevel(residualScore)} />
            </p>
          )}
        </FormSection>

        <FormSection title="The Assessment">
          <FormRow columns={3}>
            <Input label="Assessed By" value={f.assessedBy} onChange={(e) => set('assessedBy', e.target.value)} placeholder="You" />
            <Input label="Assessed On" type="date" value={f.assessedOn} onChange={(e) => set('assessedOn', e.target.value)} />
            <Input label="Next Review" type="date" value={f.reviewDue} onChange={(e) => set('reviewDue', e.target.value)} hint="Sooner if the work, the equipment or the controls change." />
          </FormRow>
        </FormSection>
      </FormSections>
    </Dialog>
  )
}

const CONTROLS_LABEL: Record<RiskRow['controls'], string> = {
  none: 'None Needed', planned: 'Planned', in_progress: 'In Progress', done: 'In Place',
}
export const controlsBadge = (r: RiskRow) => (
  <Badge tone={r.controlsOverdue ? 'critical' : r.controls === 'done' ? 'good' : r.needsControls ? 'warning' : 'neutral'} className="whitespace-nowrap">
    {r.controlsOverdue ? 'Overdue' : r.needsControls ? 'Needed' : CONTROLS_LABEL[r.controls]}
  </Badge>
)

const ACTION_STATUS: Record<RiskRow['actions'][number]['status'], string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed', verified: 'Verified', cancelled: 'Cancelled',
}

/** One row of the register, whole, with the actions raised for it. */
export function RiskDetailDialog({ row, onClose, onEdit, onChanged }: {
  row: RiskRow
  onClose: () => void
  onEdit: () => void
  onChanged: (row: RiskRow) => void
}) {
  const [mode, setMode] = useState<'view' | 'action' | 'archive'>('view')
  const [title, setTitle] = useState(`Control: ${row.hazard}`.slice(0, 120))
  const [owner, setOwner] = useState(row.owner)
  const [due, setDue] = useState(row.controlsDue ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [raised, setRaised] = useState<{ id: string; code: string } | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const archived = row.archivedAt !== null

  const footer = mode === 'action' ? (
    <>
      <Button variant="ghost" onClick={() => setMode('view')}>Back</Button>
      <Button disabled={busy} onClick={() => void run(async () => {
        const a = await riskApi.raiseAction(row.id, { title, owner, dueDate: due || undefined })
        setRaised(a); setMode('view')
        onChanged(await riskApi.get(row.id))
      })}
      >Raise Action</Button>
    </>
  ) : mode === 'archive' ? (
    <>
      <Button variant="ghost" onClick={() => setMode('view')}>Back</Button>
      <Button variant="danger" disabled={busy} onClick={() => void run(async () => { onChanged(await riskApi.archive(row.id, reason)); setMode('view') })}>Archive</Button>
    </>
  ) : row.canEdit ? (
    archived ? (
      <Button variant="secondary" disabled={busy} onClick={() => void run(async () => onChanged(await riskApi.restore(row.id)))}>Restore</Button>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setMode('archive')}>Archive</Button>
        {row.additionalControls.trim() && <Button variant="secondary" onClick={() => setMode('action')}>Raise Corrective Action</Button>}
        <Button onClick={onEdit}>Change</Button>
      </>
    )
  ) : undefined

  return (
    <Dialog
      open onClose={onClose} title={`${row.code}: ${row.hazard}`} description={`${row.activity} · ${row.siteName}`}
      width="max-w-2xl" guardUnsaved={false}
      error={error ? <Alert tone="critical">{error}</Alert> : null}
      footer={footer}
    >
      {mode === 'action' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">An action to put the recommended controls in place, tracked in Corrective Actions and shown here.</p>
          <Input label="Action" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
            <Input label="Due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
      )}
      {mode === 'archive' && (
        <Textarea
          label="Why This No Longer Applies" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          hint="The row is kept, with this reason, and leaves the matrix."
        />
      )}
      {mode === 'view' && (
        <div className="space-y-4">
          {raised && (
            <Alert tone="success">
              {raised.code} raised. <Link className="font-semibold underline" to={`/actions?open=${raised.id}`}>Open it in Corrective Actions</Link>
            </Alert>
          )}
          {archived && (
            <Alert tone="info">Archived by {row.archivedBy}: {row.archivedReason}</Alert>
          )}
          <div>
            <DetailRow label="Which can cause" value={row.effect} />
            <DetailRow label="Existing controls" value={row.existingControls} />
            <DetailRow label="Risk now" value={<span>{row.likelihood} × {row.severity} <RiskBadge score={row.riskScore} /></span>} />
            <DetailRow label="What it asks" value={RISK_ACTION[row.level]} />
            <DetailRow label="Recommended" value={row.additionalControls} />
            <DetailRow label="Person in charge" value={row.owner} />
            <DetailRow label="Completion due" value={row.controlsDue ? <span>{fmtDay(row.controlsDue)} {row.controlsOverdue && <Badge tone="critical">Overdue</Badge>}</span> : null} />
            <DetailRow
              label="Once controlled"
              value={row.residualScore !== null ? <span>{row.residualLikelihood} × {row.residualSeverity} <RiskBadge score={row.residualScore} /></span> : 'Not rated yet'}
            />
            <DetailRow label="Assessed" value={`${row.assessedBy}, ${fmtDay(row.assessedOn)}`} />
            <DetailRow label="Next review" value={<span>{fmtDay(row.reviewDue)} {row.reviewOverdue && <Badge tone="critical">Overdue</Badge>}</span>} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Corrective Actions</h3>
            {row.actions.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                {row.additionalControls.trim() ? 'None raised yet.' : 'Write down the recommended controls to raise one.'}
              </p>
            ) : (
              <ul className="mt-1 divide-y rounded-lg border">
                {row.actions.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link to={`/actions?open=${a.id}`} className="min-w-0 font-medium text-ink hover:underline">{a.code} · {a.title}</Link>
                    <span className="flex items-center gap-2 text-xs text-ink-2">
                      {a.owner}, due {fmtDay(a.dueDate)} <Badge tone={a.status === 'verified' || a.status === 'completed' ? 'good' : 'neutral'}>{ACTION_STATUS[a.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
