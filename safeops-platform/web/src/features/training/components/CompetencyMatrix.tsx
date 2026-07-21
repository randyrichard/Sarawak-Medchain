import { useMemo, useState } from 'react'
import { Download, Users } from 'lucide-react'
import type { EmployeeCompetency, TrainingMatrix } from '@/api/training'
import { Avatar, Button, Card, EmptyState, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { COMPETENCY_META, exportMatrixCsv, LEVEL_META } from '../lib'

type GroupBy = 'none' | 'site' | 'department'

export function CompetencyMatrix({
  matrix, onOpenEmployee,
}: {
  matrix: TrainingMatrix | null
  onOpenEmployee: (employeeId: string) => void
}) {
  const [group, setGroup] = useState<GroupBy>('site')
  const [gapsOnly, setGapsOnly] = useState(false)

  const groups = useMemo(() => {
    if (!matrix) return []
    const employees = gapsOnly
      ? matrix.employees.filter((e) => e.gapCount > 0 || e.expiringCount > 0)
      : matrix.employees
    if (group === 'none') return [{ label: null as string | null, rows: employees }]
    const key = (e: EmployeeCompetency) => (group === 'site' ? e.siteId.toUpperCase() : e.department)
    const map = new Map<string, EmployeeCompetency[]>()
    employees.forEach((e) => map.set(key(e), [...(map.get(key(e)) ?? []), e]))
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, rows]) => ({ label, rows }))
  }, [matrix, group, gapsOnly])

  if (matrix === null) {
    return <Card className="p-5"><Skeleton className="h-96 w-full" /></Card>
  }

  const { courses } = matrix

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Group by</span>
        <select value={group} onChange={(e) => setGroup(e.target.value as GroupBy)} className="h-8 rounded-lg border bg-surface px-2 text-xs text-ink-2 outline-none">
          <option value="none">None</option>
          <option value="site">Site</option>
          <option value="department">Department</option>
        </select>
        <button
          onClick={() => setGapsOnly((v) => !v)}
          className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', gapsOnly ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink')}
          style={gapsOnly ? { borderColor: 'var(--accent)' } : undefined}
        >
          Gaps &amp; expiring only
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-3 text-2xs text-muted sm:flex">
            {(['competent', 'expiring', 'missing'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COMPETENCY_META[s].color }} />
                {s === 'missing' ? 'Not competent' : COMPETENCY_META[s].label}
              </span>
            ))}
          </span>
          <Button size="sm" variant="ghost" icon={<Download size={12} />} onClick={() => exportMatrixCsv(courses, matrix.employees)}>
            Export
          </Button>
        </div>
      </div>

      <Card>
        {matrix.employees.length === 0 ? (
          <EmptyState icon={Users} title="No employees in scope">Your role scopes the matrix — an employee sees only their own row.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-muted">Employee</th>
                  <th className="px-2 py-2.5 text-center text-2xs font-semibold uppercase tracking-wide text-muted">Level</th>
                  {courses.map((c) => (
                    <th key={c.id} className="px-1.5 py-2.5 text-center" title={c.name}>
                      <span className="mx-auto block max-w-[46px] truncate text-2xs font-semibold text-ink-2">{c.code.replace('TRN-', '')}</span>
                      {c.mandatory && <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-critical" title="Mandatory" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <MatrixGroup key={g.label ?? '_all'} label={g.label} rows={g.rows} courses={courses} onOpen={onOpenEmployee} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-2xs text-muted">
        Columns are courses (code shown; hover for name); the red dot marks mandatory competencies. Click any employee for their full training profile.
      </p>
    </>
  )
}

function MatrixGroup({
  label, rows, courses, onOpen,
}: {
  label: string | null
  rows: EmployeeCompetency[]
  courses: TrainingMatrix['courses']
  onOpen: (id: string) => void
}) {
  return (
    <>
      {label && (
        <tr className="border-b bg-sunken/70">
          <td colSpan={courses.length + 2} className="sticky left-0 px-4 py-1.5 text-2xs font-bold uppercase tracking-wider text-ink-2">
            {label} <span className="font-normal text-muted">· {rows.length}</span>
          </td>
        </tr>
      )}
      {rows.map((e) => (
        <tr key={e.employeeId} className="border-b last:border-0 hover:bg-accent-soft/30">
          <td className="sticky left-0 z-10 cursor-pointer bg-surface px-4 py-2.5" onClick={() => onOpen(e.employeeId)}>
            <div className="flex items-center gap-2.5">
              <Avatar name={e.name} size={26} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink hover:text-accent">{e.name}</p>
                <p className="truncate text-2xs text-muted">{e.position}</p>
              </div>
            </div>
          </td>
          <td className="px-2 py-2.5 text-center">
            <span
              className="inline-block h-6 rounded-full px-2 text-2xs font-bold leading-6 text-white"
              style={{ background: LEVEL_META[e.level].color }}
              title={`${e.compliancePct}% of required competencies current`}
            >
              {e.compliancePct}%
            </span>
          </td>
          {courses.map((c) => {
            const cell = e.cells[c.id]
            const status = cell?.status ?? 'na'
            const meta = COMPETENCY_META[status]
            return (
              <td key={c.id} className="px-1.5 py-2.5 text-center">
                <span
                  className={cn('mx-auto block h-6 w-6 rounded-md', status === 'na' && 'opacity-40')}
                  style={{ background: status === 'na' ? 'transparent' : meta.color, border: status === 'na' ? '1px dashed var(--grid)' : 'none' }}
                  title={`${c.name}: ${meta.label}${cell?.expiryDate ? ` · expires ${cell.expiryDate}` : ''}`}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
