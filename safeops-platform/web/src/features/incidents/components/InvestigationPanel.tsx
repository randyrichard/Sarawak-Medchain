import { useCallback, useEffect, useRef, useState } from 'react'
import { Microscope, CheckCircle2, AlertTriangle } from 'lucide-react'
import { investigationApi, type Investigation } from '@/api/investigationApi'
import { ApiError } from '@/api/types'
import { Alert, Badge, Button, Card, CardBody, Input, Skeleton, Textarea } from '@/components/ui'
import { fmtDateTime } from '../lib'

/**
 * The causal analysis, and the sign-off.
 *
 * Three causes, not one, because they are three different findings and collapsing them is
 * how an investigation concludes "operator error" and changes nothing. The direct cause is
 * what happened, the underlying cause is why it was possible, and the root cause is the
 * thing that has to change so it does not happen again.
 *
 * Auto-saves on a debounce. A Save button at the bottom of a form this long is how half an
 * investigation gets lost when somebody navigates away.
 */
const FISHBONE_CATEGORIES = [
  'Manpower', 'Machine', 'Method', 'Material', 'Measurement', 'Environment',
] as const

export function InvestigationPanel({
  incidentId, canEdit, canSignOff, onChanged,
}: {
  incidentId: string
  canEdit: boolean
  canSignOff: boolean
  onChanged?: () => void
}) {
  const [data, setData] = useState<Investigation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)

  /** Local edits, so typing is not fighting a round trip. */
  const [draft, setDraft] = useState<Partial<Investigation>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(() => {
    investigationApi.get(incidentId)
      .then((d) => { setData(d); setDraft({}) })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the investigation.'))
  }, [incidentId])

  useEffect(() => { load() }, [load])

  const value = <K extends keyof Investigation>(k: K): Investigation[K] | '' =>
    (draft[k] as Investigation[K]) ?? data?.[k] ?? ''

  const edit = (patch: Partial<Investigation>) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save({ ...draft, ...patch }), 700)
  }

  const save = async (payload: Partial<Investigation>) => {
    setSaving(true)
    setError(null)
    try {
      await investigationApi.save(incidentId, {
        leadInvestigator: payload.leadInvestigator ?? undefined,
        investigationTeam: payload.investigationTeam ?? undefined,
        directCause: payload.directCause ?? undefined,
        underlyingCause: payload.underlyingCause ?? undefined,
        rootCause: payload.rootCause ?? undefined,
        contributingFactors: payload.contributingFactors ?? undefined,
        recommendations: payload.recommendations ?? undefined,
      })
      setSavedAt(new Date().toISOString())
      // Re-read: the blockers list changes as fields are filled, and it is the thing the
      // sign-off button is gated on.
      const fresh = await investigationApi.get(incidentId)
      setData(fresh)
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the investigation.')
    } finally {
      setSaving(false)
    }
  }

  const signOff = async () => {
    setSigning(true)
    setError(null)
    try {
      await investigationApi.complete(incidentId)
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign off the investigation.')
    } finally {
      setSigning(false)
    }
  }

  const done = !!data?.investigationCompletedAt
  const editable = canEdit && !done

  return (
    <Card>
      <CardBody>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <Microscope size={12} /> Investigation
          {data?.mandatory && <Badge tone="warning">Required by severity</Badge>}
          {done && <Badge tone="good">Signed off</Badge>}
          {saving && <span className="text-2xs font-normal normal-case text-muted">Saving…</span>}
          {!saving && savedAt && !done && (
            <span className="text-2xs font-normal normal-case text-muted">Saved</span>
          )}
        </p>

        {error && <Alert tone="critical" className="mb-2" onDismiss={() => setError(null)}>{error}</Alert>}

        {data === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {done ? (
              <Alert tone="success">
                Signed off {fmtDateTime(data.investigationCompletedAt!)}.
                {data.investigationStartedAt && (
                  <> Started {fmtDateTime(data.investigationStartedAt)}.</>
                )}
              </Alert>
            ) : data.blockers.length > 0 ? (
              <div className="rounded-lg border border-warning/60 bg-warning-soft/30 px-3 py-2">
                <p className="flex items-center gap-1.5 text-2xs font-medium text-warning">
                  <AlertTriangle size={11} /> Outstanding before this can be signed off:
                </p>
                {/* The server's own sentences, rendered as-is. */}
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {data.blockers.map((b) => <li key={b} className="text-2xs text-ink">{b}</li>)}
                </ul>
              </div>
            ) : (
              <Alert tone="success">Complete. Ready to sign off.</Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Lead investigator"
                value={String(value('leadInvestigator'))}
                disabled={!editable}
                onChange={(e) => edit({ leadInvestigator: e.target.value })}
                hint="Naming a lead starts the investigation clock."
              />
              <Input
                label="Investigation team"
                value={String(value('investigationTeam'))}
                disabled={!editable}
                onChange={(e) => edit({ investigationTeam: e.target.value })}
                placeholder="Everyone else on the team"
              />
            </div>

            {/*
              Three causes, laid out in the order an investigator works through them.
              Collapsing them into one box is how a report concludes "operator error".
            */}
            <Textarea
              label="Direct cause"
              value={String(value('directCause'))}
              disabled={!editable}
              onChange={(e) => edit({ directCause: e.target.value })}
              placeholder="The unsafe act or condition — what actually caused the harm."
            />
            <Textarea
              label="Underlying cause"
              value={String(value('underlyingCause'))}
              disabled={!editable}
              onChange={(e) => edit({ underlyingCause: e.target.value })}
              placeholder="Why that act or condition was possible."
            />
            <Textarea
              label="Root cause"
              value={String(value('rootCause'))}
              disabled={!editable}
              onChange={(e) => edit({ rootCause: e.target.value })}
              placeholder="The thing that has to change so it does not happen again."
            />
            <Textarea
              label="Contributing factors"
              value={String(value('contributingFactors'))}
              disabled={!editable}
              onChange={(e) => edit({ contributingFactors: e.target.value })}
            />
            <Textarea
              label="Recommendations"
              value={String(value('recommendations'))}
              disabled={!editable}
              onChange={(e) => edit({ recommendations: e.target.value })}
              hint="Recommendations are not corrective actions. Raise those separately so they have an owner and a date."
            />

            {canSignOff && !done && (
              <Button
                icon={<CheckCircle2 size={13} />}
                loading={signing}
                disabled={data.blockers.length > 0}
                onClick={() => void signOff()}
              >
                Sign off investigation
              </Button>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export { FISHBONE_CATEGORIES }
