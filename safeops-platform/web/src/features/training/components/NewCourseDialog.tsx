import { useState } from 'react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { CourseCategory, DeliveryMode } from '@/api/training'
import { CATEGORY_LABEL } from '@/api/training'
import { useActor } from '@/features/incidents/lib'
import { useOrg } from '@/features/org/OrgContext'
import { Button, Checkbox, Dialog, Input, Select, Textarea } from '@/components/ui'
import { useFormCheck } from '@/lib/useFormCheck'

const CATEGORIES: CourseCategory[] = ['induction', 'safety', 'equipment', 'emergency', 'health', 'environmental', 'custom']
const DEPT_KEYWORDS = ['Production', 'Maintenance', 'Warehouse', 'Logistics', 'Field', 'Mill', 'Contractors', 'HSE', 'Civil', 'M&E']

export function NewCourseDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const actor = useActor()
  const { company } = useOrg()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<CourseCategory>('safety')
  const [description, setDescription] = useState('')
  const [mandatory, setMandatory] = useState(true)
  const [validityMonths, setValidityMonths] = useState('24')
  const [durationHours, setDurationHours] = useState('8')
  const [modes, setModes] = useState<DeliveryMode[]>(['physical'])
  const [competency, setCompetency] = useState('')
  const [applies, setApplies] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleMode = (m: DeliveryMode) => setModes((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))
  const toggleApplies = (k: string) => setApplies((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))

  /*
   * A blank duration went in as one hour, and no delivery mode as "physical", without a word.
   * Each is now asked for instead of being guessed.
   */
  const hours = Number(durationHours)
  const months = validityMonths ? Number(validityMonths) : null
  const form = useFormCheck({
    name: !name.trim() && 'Name the course.',
    durationHours: !hours ? 'Enter how many hours it takes.' : hours > 500 && 'At most 500 hours.',
    validityMonths: months !== null && (months < 1 || months > 600) && 'Between 1 and 600 months, or blank if it never expires.',
    modes: modes.length === 0 && 'Choose at least one way it is delivered.',
  }, open)

  const submit = async () => {
    if (!company || !form.check()) return
    setBusy(true)
    setError(null)
    try {
      await api.createCourse(
        company.id,
        {
          name, category, description, mandatory,
          validityMonths: months,
          durationHours: hours,
          deliveryModes: modes,
          competency: competency || name,
          applies,
        },
        actor,
      )
      setName(''); setDescription(''); setCompetency(''); setApplies([])
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the course.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      error={error}
      open={open}
      onClose={onClose}
      title="Add Training Course"
      description="Custom programmes appear in the catalogue and can be scheduled as sessions."
      width="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void submit()}>Add Course</Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <Input label="Course name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overhead Crane Operation" error={form.errorFor('name')} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as CourseCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
          <Input label="Competency granted" value={competency} onChange={(e) => setCompetency(e.target.value)} placeholder="e.g. Licensed crane operator" />
        </div>
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-5">
          <Input label="Validity (months, blank = no expiry)" inputMode="numeric" value={validityMonths} onChange={(e) => setValidityMonths(e.target.value.replace(/\D/g, ''))} placeholder="24" error={form.errorFor('validityMonths')} />
          <Input label="Duration (hours)" required inputMode="numeric" value={durationHours} onChange={(e) => setDurationHours(e.target.value.replace(/\D/g, ''))} placeholder="8" error={form.errorFor('durationHours')} />
        </div>
        <div role="group" aria-labelledby="course-modes" aria-describedby={form.errorFor('modes') ? 'course-modes-error' : undefined}>
          <p id="course-modes" className="mb-1.5 text-xs font-semibold text-ink-2">Delivery modes <span className="text-critical">*</span></p>
          <div className="flex gap-4">
            <Checkbox label="Physical" checked={modes.includes('physical')} onChange={() => toggleMode('physical')} aria-invalid={form.errorFor('modes') ? true : undefined} />
            <Checkbox label="Online" checked={modes.includes('online')} onChange={() => toggleMode('online')} />
          </div>
          {form.errorFor('modes') && <p id="course-modes-error" role="alert" className="mt-1.5 text-xs font-medium text-critical">{form.errorFor('modes')}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox label="Mandatory competency" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-2">Applies to departments <span className="text-muted">(none = whole workforce)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {DEPT_KEYWORDS.map((k) => (
              <button key={k} type="button" aria-pressed={applies.includes(k)} onClick={() => toggleApplies(k)}
                className="rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors"
                style={applies.includes(k) ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
