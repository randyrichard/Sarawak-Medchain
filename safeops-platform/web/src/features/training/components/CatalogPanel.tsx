import { useState } from 'react'
import { BookOpen, Clock, Monitor, Plus, Users } from 'lucide-react'
import type { CourseView } from '@/api/training'
import { CATEGORY_LABEL } from '@/api/training'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { CATEGORY_TONE } from '../lib'
import { NewCourseDialog } from './NewCourseDialog'
import { cn } from '@/lib/cn'

export function CatalogPanel({
  courses, manage, onChanged,
}: {
  courses: CourseView[] | null
  manage: boolean
  onChanged: () => void
}) {
  const [newOpen, setNewOpen] = useState(false)

  if (courses === null) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">{courses.length} programs in the catalog</p>
        {manage && <Button size="sm" icon={<Plus size={13} />} onClick={() => setNewOpen(true)}>Add course</Button>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => (
          <Card key={c.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--accent-soft)' }}>
                  <BookOpen size={15} style={{ color: CATEGORY_TONE[c.category] }} />
                </span>
                <div>
                  <p className="font-mono text-2xs text-muted">{c.code}</p>
                  <Badge tone="neutral">{CATEGORY_LABEL[c.category]}</Badge>
                </div>
              </div>
              {c.mandatory ? <Badge tone="critical">Mandatory</Badge> : <Badge tone="neutral">Optional</Badge>}
            </div>

            <p className="mt-2.5 text-sm font-semibold leading-snug text-ink">{c.name}</p>
            <p className="mt-1 line-clamp-2 flex-1 text-2xs leading-relaxed text-muted">{c.description}</p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
              <span className="inline-flex items-center gap-1"><Clock size={11} /> {c.durationHours}h</span>
              <span>{c.validityMonths ? `${c.validityMonths}-mo validity` : 'No expiry'}</span>
              <span className="inline-flex items-center gap-1"><Monitor size={11} /> {c.deliveryModes.join(' / ')}</span>
            </div>

            <div className="mt-3 border-t pt-2.5">
              <div className="mb-1 flex items-center justify-between text-2xs">
                <span className="inline-flex items-center gap-1 text-ink-2"><Users size={11} /> {c.certifiedEmployees}/{c.requiredEmployees} certified</span>
                <span className="font-semibold" style={{ color: c.compliancePct >= 90 ? 'var(--good)' : c.compliancePct >= 75 ? 'var(--warning)' : 'var(--critical)' }}>
                  {c.compliancePct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-grid">
                <div className={cn('h-full rounded-full')} style={{ width: `${c.compliancePct}%`, background: c.compliancePct >= 90 ? 'var(--good)' : c.compliancePct >= 75 ? 'var(--warning)' : 'var(--critical)' }} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <NewCourseDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); onChanged() }} />
    </>
  )
}
