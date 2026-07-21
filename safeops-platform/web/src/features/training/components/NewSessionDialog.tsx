import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { CourseView, DeliveryMode } from '@/api/training'
import type { Employee } from '@/api/types'
import { useOrg } from '@/features/org/OrgContext'
import { PEOPLE, useActor } from '@/features/incidents/lib'
import { Alert, Avatar, Badge, Button, Dialog, Input, Select } from '@/components/ui'
import { cn } from '@/lib/cn'

export function NewSessionDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { company, sites } = useOrg()
  const actor = useActor()

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
    void api.listCourses(company.id).then((c) => { setCourses(c); if (!courseId && c.length) setCourseId(c[0].id) })
    void api.listEmployees(company.id).then(setEmployees)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company])

  const siteEmployees = useMemo(
    () => employees.filter((e) => !siteId || e.siteId === siteId),
    [employees, siteId],
  )

  const toggle = (id: string) => setEnrolled((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const submit = async () => {
    if (!company) return
    setBusy(true)
    setError(null)
    try {
      await api.createSession(
        { courseId, trainer, venue, mode, scheduledFor, maxParticipants: Number(maxParticipants) || 12, companyId: company.id, siteId, enrolled },
        actor,
      )
      setVenue(''); setScheduledFor(''); setEnrolled([])
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the session.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule training session"
      description="Enrol participants now — attendance is captured live when you run the session."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}>Schedule session</Button>
        </>
      }
    >
      <div className="max-h-[62vh] space-y-3.5 overflow-y-auto pr-1">
        {error && <Alert tone="critical">{error}</Alert>}
        <Select label="Course" required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Trainer" required value={trainer} onChange={(e) => setTrainer(e.target.value)}>
            <option value="" disabled>Select…</option>
            {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            <option>MRC Trainer</option>
          </Select>
          <Select label="Delivery" value={mode} onChange={(e) => setMode(e.target.value as DeliveryMode)}>
            <option value="physical">Physical</option>
            <option value="online">Online</option>
          </Select>
        </div>
        <Input label="Venue" required value={venue} onChange={(e) => setVenue(e.target.value)} placeholder={mode === 'online' ? 'e.g. Online (Microsoft Teams)' : 'e.g. Kuching training room 2'} />
        <div className="grid grid-cols-3 gap-3">
          <Select label="Site" required value={siteId} onChange={(e) => { setSiteId(e.target.value); setEnrolled([]) }}>
            <option value="" disabled>Select…</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.short}</option>)}
          </Select>
          <Input label="Date" required type="date" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
          <Input label="Max seats" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value.replace(/\D/g, ''))} />
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
                <button key={e.id} onClick={() => toggle(e.id)}
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
