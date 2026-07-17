import { useState } from 'react'
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { AdvancePayload, Incident, IncidentSeverity, RiskRating } from '@/api/incidents'
import { useOrg } from '@/features/org/OrgContext'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Dialog, Input, Select, Textarea } from '@/components/ui'
import { PEOPLE, useActor } from '../lib'

const MANAGE = ['admin', 'hse_manager', 'safety_officer']
const REVIEW = ['admin', 'hse_manager']

/** Contextual "what this case needs next" card — one primary action per stage. */
export function NextStepCard({ incident, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  const actor = useActor()
  const { role } = useOrg()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // per-stage dialog fields
  const [riskRating, setRiskRating] = useState<RiskRating>('Medium')
  const [potential, setPotential] = useState<IncidentSeverity>(incident.severity)
  const [requiresInv, setRequiresInv] = useState(true)
  const [note, setNote] = useState('')
  const [investigator, setInvestigator] = useState('')
  const [findings, setFindings] = useState(incident.findings ?? '')

  const canManage = MANAGE.includes(role ?? '')
  const canReview = REVIEW.includes(role ?? '')

  const STEP: Record<string, { title: string; hint: string; cta: string; allowed: boolean; needsDialog: boolean } | null> = {
    reported: { title: 'Complete the initial assessment', hint: 'Rate the risk and decide the investigation path. Target: within 24h of reporting.', cta: 'Start assessment', allowed: canManage, needsDialog: true },
    assessment: { title: 'Assign the investigation', hint: 'Pick a lead investigator — the clock is running.', cta: 'Start investigation', allowed: canManage, needsDialog: true },
    investigation: { title: 'Record findings and open RCA', hint: 'Summarise what the investigation established, then analyse root causes.', cta: 'Record findings', allowed: canManage, needsDialog: true },
    rca: { title: 'Submit the root cause analysis', hint: 'Needs at least one contributing cause and a 5-Why root statement (Investigation tab).', cta: 'Submit RCA', allowed: canManage, needsDialog: false },
    actions: { title: 'Submit for manager review', hint: 'Every cause must have an action, and every action must be completed first.', cta: 'Submit for review', allowed: canManage, needsDialog: false },
    review: { title: 'Manager review', hint: 'Approve the root cause and corrective actions to begin verification.', cta: 'Approve → verification', allowed: canReview, needsDialog: true },
    verification: { title: 'Verify and close', hint: 'Verify each action\'s evidence (Actions tab), then close the incident.', cta: 'Close incident', allowed: canReview, needsDialog: true },
    closed: null,
  }

  const step = STEP[incident.stage]

  const advance = async (payload: AdvancePayload) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.advanceIncident(incident.id, payload, actor)
      onUpdate(updated)
      setOpen(false)
      setNote('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const runPrimary = () => {
    setError(null)
    if (!step) return
    if (step.needsDialog) {
      setOpen(true)
      return
    }
    if (incident.stage === 'rca') void advance({ to: 'actions' })
    if (incident.stage === 'actions') void advance({ to: 'review' })
  }

  if (!step) {
    return (
      <Card>
        <CardBody className="flex items-start gap-3 py-4">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--good)' }} />
          <div>
            <p className="text-sm font-semibold text-ink">Incident closed</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{incident.closeNote}</p>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Next step" subtitle={step.hint} />
      <CardBody className="space-y-2.5">
        {error && !open && <Alert tone="critical">{error}</Alert>}
        <Button className="w-full" icon={step.allowed ? <ArrowRight size={14} /> : <Lock size={13} />} disabled={!step.allowed} loading={busy && !open} onClick={runPrimary}>
          {step.cta}
        </Button>
        {!step.allowed && (
          <p className="text-2xs leading-relaxed text-muted">
            This step needs {incident.stage === 'review' || incident.stage === 'verification' ? 'an HSE Manager or Admin' : 'a Safety Officer or above'}. You can still comment and upload evidence.
          </p>
        )}
      </CardBody>

      {/* Stage dialogs */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={step.title}
        width="max-w-md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() => {
                if (incident.stage === 'reported')
                  void advance({ to: 'assessment', riskRating, potentialSeverity: potential, requiresInvestigation: requiresInv, note: note || undefined })
                if (incident.stage === 'assessment') void advance({ to: 'investigation', investigator })
                if (incident.stage === 'investigation') void advance({ to: 'rca', findings })
                if (incident.stage === 'review') void advance({ to: 'verification', reviewNote: note })
                if (incident.stage === 'verification') void advance({ to: 'closed', closeNote: note })
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="critical">{error}</Alert>}
          {incident.stage === 'reported' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Risk rating" value={riskRating} onChange={(e) => setRiskRating(e.target.value as RiskRating)}>
                  {(['Low', 'Medium', 'High', 'Extreme'] as const).map((r) => <option key={r}>{r}</option>)}
                </Select>
                <Select label="Potential severity" value={potential} onChange={(e) => setPotential(e.target.value as IncidentSeverity)}>
                  {(['Minor', 'Moderate', 'Serious', 'Critical'] as const).map((s) => <option key={s}>{s}</option>)}
                </Select>
              </div>
              <Checkbox label="Full investigation required" checked={requiresInv} onChange={(e) => setRequiresInv(e.target.checked)} />
              <Textarea label="Assessment note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the investigator should know from day one…" />
              <p className="text-2xs text-muted">High/Extreme ratings flag the case as high-risk on Mission Control.</p>
            </>
          )}
          {incident.stage === 'assessment' && (
            <Select label="Lead investigator" required value={investigator} onChange={(e) => setInvestigator(e.target.value)} hint="They'll be notified immediately.">
              <option value="" disabled>Select…</option>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </Select>
          )}
          {incident.stage === 'investigation' && (
            <Textarea
              label="Investigation findings" required rows={5} value={findings} onChange={(e) => setFindings(e.target.value)}
              placeholder="What did interviews, CCTV, and records establish? Facts, not blame."
              hint="At least a couple of sentences — this becomes the basis of the RCA."
            />
          )}
          {incident.stage === 'review' && (
            <Textarea
              label="Review note" required rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Your judgement on the RCA quality and action adequacy…"
            />
          )}
          {incident.stage === 'verification' && (
            <>
              <Textarea
                label="Closing note" required rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Confirm what was verified and any learning to share…"
              />
              <p className="text-2xs text-muted">Closing requires every corrective action to be verified — the system enforces it.</p>
            </>
          )}
        </div>
      </Dialog>
    </Card>
  )
}
