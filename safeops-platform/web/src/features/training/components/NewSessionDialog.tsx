import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { CourseView, DeliveryMode, SessionView } from '@/api/training'
import type { Employee } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { usePeople, useActor } from '@/features/incidents/lib'
import { Avatar, Badge, Button, Dialog, Input, Select } from '@/components/ui'
import { cn } from '@/lib/cn'
import { PeopleOptions } from '@/features/org/PeopleOptions'
import { useFormCheck } from '@/lib/useFormCheck'

export function NewSessionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (session: SessionView) => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()
  const people = usePeople()

  const [courses, setCourses] = useState<CourseView[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [courseId, setCourseId] = useState('')
  const [trainer, setTrainer] = useState('')
  const [venue, setVenue] = useState('')
  const [mode, setMode] = useState<DeliveryMode>('physical')
  const [siteId, setSiteId] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [maxParticipants, setMaxParticipants] = useState('12')
  const [enrolled, setEnrolled] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !company) return
    // Said, not swallowed: an empty participant list must not be mistaken for an empty site.
    const failed = () => setError('Could not load courses or people. Close this and try again.')
    void api.listCourses(company.id).then((c) => { setCourses(c); if (!courseId && c.length) setCourseId(c[0].id) }).catch(failed)
    void api.listEmployees(company.id).then(setEmployees).catch(failed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company])

  const siteEmployees = useMemo(
    () => employees.filter((e) => !siteId || e.siteId === siteId),
    [employees, siteId],
  )

  const toggle = (id: string) => setEnrolled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const seats = Number(maxParticipants)
  const form = useFormCheck({
    courseId: !courseId && 'Choose the course.',
    trainer: !trainer && 'Choose the trainer.',
    venue: !venue.trim() && 'Say where it is held.',
    siteId: !siteId && 'Choose the site.',
    scheduledFor: !scheduledFor && 'Choose the date.',
    maxParticipants: !seats ? 'Enter the number of seats.'
      : seats > 500 ? 'At most 500 seats.'
      : enrolled.length > seats && `${enrolled.length} people are enrolled for ${seats} seats.`,
  }, open)

  const submit = async () => {
    if (!company || !form.check()) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createSession(
        { courseId, trainer, venue, mode, scheduledFor, maxParticipants: seats, companyId: company.id, siteId, enrolled },
        actor,
      )
      setVenue(''); setScheduledFor(''); setEnrolled([])
      onCreated(created)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the session.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title="Schedule Training Session"
      description="Enrol participants now — attendance is captured live when you run the session."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}>Schedule Session</Button>
        </>
      }
    >
      <div className="max-h-[62vh] space-y-5 overflow-y-auto pr-1">
        <Select label="Course" required value={courseId} onChange={(e) => setCourseId(e.target.value)} error={form.errorFor('courseId')}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-5">
          <Select label="Trainer" required value={trainer} onChange={(e) => setTrainer(e.target.value)} error={form.errorFor('trainer')}>
            <option value="" disabled>Select…</option>
            <PeopleOptions people={people} />
            <option>MRC Trainer</option>
          </Select>
          <Select label="Delivery" value={mode} onChange={(e) => setMode(e.target.value as DeliveryMode)}>
            <option value="physical">Physical</option>
            <option value="online">Online</option>
          </Select>
        </div>
        <Input label="Venue" required value={venue} onChange={(e) => setVenue(e.target.value)} placeholder={mode === 'online' ? 'e.g. Online (Microsoft Teams)' : 'e.g. Kuching training room 2'} error={form.errorFor('venue')} />
        <div className="grid grid-cols-3 items-start gap-x-3 gap-y-5">
          {/* The site's name, not its code: "KCH" is only obvious to somebody who already knows. */}
          <Select label="Site" required value={siteId} onChange={(e) => { setSiteId(e.target.value); setEnrolled([]) }} error={form.errorFor('siteId')}>
            <option value="" disabled>Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input label="Date" required type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} error={form.errorFor('scheduledFor')} />
          <Input label="Max seats" required inputMode="numeric" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value.replace(/\D/g, ''))} error={form.errorFor('maxParticipants')} />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-ink-2">Enrol participants</p>
            <Badge tone={enrolled.length > Number(maxParticipants) ? 'critical' : 'accent'}>{enrolled.length}/{maxParticipants || '∞'}</Badge>
          </div>
          {!siteId ? (
            <p className="rounded-lg border border-dashed px-3 py-3 text-center text-2xs text-muted">Select a site to list its employees.</p>
          ) : (
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1.5">
              {siteEmployees.map((e) => (
                <button key={e.id} type="button" aria-pressed={enrolled.includes(e.id)} onClick={() => toggle(e.id)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors', enrolled.includes(e.id) ? 'bg-accent-soft' : 'hover:bg-accent-soft/50')}>
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded border text-2xs', enrolled.includes(e.id) && 'text-white')}
                    style={enrolled.includes(e.id) ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>
                    {enrolled.includes(e.id) ? '✓' : ''}
                  </span>
                  <Avatar name={e.name} size={20} />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{e.name}</span>
                  <span className="truncate text-2xs text-muted">{e.position}</span>
                </button>
              ))}
              {siteEmployees.length === 0 && <p className="px-2 py-3 text-center text-2xs text-muted">No employees at this site.</p>}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
