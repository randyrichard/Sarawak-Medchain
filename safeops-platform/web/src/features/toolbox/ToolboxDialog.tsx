import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toolboxApi, type AttendanceGroup, type ToolboxMeeting } from '@/api/toolboxApi'
import { ApiError } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { usePeople } from '@/features/incidents/lib'
import { Alert, Button, Dialog, Input, Select, SuggestSelect, Textarea } from '@/components/ui'
import { toLocalInput } from './lib'

/**
 * Record, or correct, a daily toolbox meeting.
 *
 * Attendance is entered per organisation: at a 350-person muster nobody types names, but
 * every contractor's supervisor can say how many of theirs were there. The total is summed
 * here as they type, because the number an HSE manager is asked for is the total.
 */
export function ToolboxDialog({
  companyId, meeting, onClose, onSaved,
}: {
  companyId: string
  meeting: ToolboxMeeting | null
  onClose: () => void
  onSaved: (m: ToolboxMeeting) => void
}) {
  const { sites, site, company } = useOrg()
  const people = usePeople()
  const [organisations, setOrganisations] = useState<string[]>([])

  const [siteId, setSiteId] = useState(meeting?.siteId ?? site?.id ?? sites[0]?.id ?? '')
  const [heldAt, setHeldAt] = useState(toLocalInput(meeting ? new Date(meeting.heldAt) : new Date()))
  const [ledBy, setLedBy] = useState(meeting?.ledBy ?? '')
  const [topic, setTopic] = useState(meeting?.topic ?? '')
  const [hazards, setHazards] = useState(meeting?.hazards ?? '')
  const [notes, setNotes] = useState(meeting?.notes ?? '')
  const [groups, setGroups] = useState<{ organisation: string; count: string }[]>(
    meeting
      ? meeting.groups.map((g) => ({ organisation: g.organisation, count: String(g.count) }))
      : [{ organisation: company?.name ?? '', count: '' }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    toolboxApi.organisations(companyId).then((o) => { if (live) setOrganisations(o) }).catch(() => {})
    return () => { live = false }
  }, [companyId])

  const total = groups.reduce((n, g) => n + (Number.parseInt(g.count, 10) || 0), 0)
  const patch = (i: number, p: Partial<{ organisation: string; count: string }>) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...p } : g)))

  const save = async () => {
    setError(null)
    const clean: AttendanceGroup[] = groups
      .filter((g) => g.organisation.trim() || g.count.trim())
      .map((g) => ({ organisation: g.organisation.trim(), count: Number(g.count) }))
    const at = new Date(heldAt)
    if (Number.isNaN(at.getTime())) { setError('Enter when the meeting was held.'); return }

    const input = { siteId, heldAt: at.toISOString(), ledBy, topic, hazards, notes, groups: clean }
    setSaving(true)
    try {
      const saved = meeting
        ? await toolboxApi.update(companyId, meeting.id, input)
        : await toolboxApi.create(companyId, input)
      onSaved(saved)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the meeting. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={meeting ? `Edit ${meeting.number}` : 'Record toolbox meeting'}
      description="The daily site briefing: what was covered, who led it, and how many people from each organisation attended."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} loading={saving}>{meeting ? 'Save changes' : 'Record meeting'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="critical">{error}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Site" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input
            label="Held at" type="datetime-local" required
            value={heldAt} max={toLocalInput(new Date())}
            onChange={(e) => setHeldAt(e.target.value)}
          />
        </div>

        <SuggestSelect
          label="Led by" required value={ledBy} onChange={setLedBy}
          options={people} placeholder="Who ran the briefing" addLabel="Someone not listed…"
        />

        <Input
          label="Topic" required maxLength={300} value={topic}
          placeholder="e.g. Working at height on the pipe rack"
          onChange={(e) => setTopic(e.target.value)}
        />

        <Textarea
          label="Hazards and controls discussed" rows={3} maxLength={5000} value={hazards}
          placeholder="Today's high-risk work, the controls, lessons from recent incidents…"
          onChange={(e) => setHazards(e.target.value)}
        />

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-ink">
            Attendance <span className="text-critical">*</span>
          </legend>
          <p className="mb-2 text-2xs text-muted">One line per organisation — your own staff, then each contractor.</p>
          <datalist id="toolbox-orgs">
            {organisations.map((o) => <option key={o} value={o} />)}
          </datalist>
          <ul className="space-y-2">
            {groups.map((g, i) => (
              <li key={i} className="flex items-center gap-2">
                {/* The wrapper takes the width: Input's own wrapper would otherwise size to content
                    and cut a contractor's name off after twenty characters. */}
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label={`Organisation ${i + 1}`} list="toolbox-orgs" placeholder="Organisation"
                    value={g.organisation} maxLength={200}
                    onChange={(e) => patch(i, { organisation: e.target.value })}
                  />
                </div>
                <Input
                  aria-label={`Headcount for ${g.organisation || `organisation ${i + 1}`}`}
                  type="number" inputMode="numeric" min={1} max={5000} step={1} placeholder="People"
                  value={g.count} className="w-28"
                  onChange={(e) => patch(i, { count: e.target.value })}
                />
                <Button
                  variant="ghost" size="sm" aria-label={`Remove ${g.organisation || 'this line'}`}
                  disabled={groups.length === 1}
                  onClick={() => setGroups((gs) => gs.filter((_, j) => j !== i))}
                  icon={<Trash2 size={14} />}
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between">
            <Button
              variant="secondary" size="sm" icon={<Plus size={14} />}
              onClick={() => setGroups((gs) => [...gs, { organisation: '', count: '' }])}
            >
              Add organisation
            </Button>
            <p className="text-sm text-ink-2" aria-live="polite">
              Total present: <span className="font-semibold text-ink">{total.toLocaleString()}</span>
            </p>
          </div>
        </fieldset>

        <Textarea
          label="Notes" rows={2} maxLength={5000} value={notes}
          placeholder="Anything else — questions raised, follow-ups agreed"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  )
}
