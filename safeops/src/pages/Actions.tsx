import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CheckCheck, Filter } from 'lucide-react'
import { Card, PageHeader, StatusPill, actionStatusKind, ProgressBar, StatTile } from '../components/ui'
import { ACTIONS, siteById, type ActionStatus } from '../data/mock'

const STATUS_ORDER: ActionStatus[] = ['Overdue', 'At Risk', 'Awaiting Verification', 'On Track', 'Completed']

export default function Actions() {
  const [statusFilter, setStatusFilter] = useState<'All' | ActionStatus>('All')

  const rows = useMemo(
    () =>
      ACTIONS.filter((a) => statusFilter === 'All' || a.status === statusFilter).sort(
        (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.due.localeCompare(b.due),
      ),
    [statusFilter],
  )

  const overdue = ACTIONS.filter((a) => a.status === 'Overdue')
  const verify = ACTIONS.filter((a) => a.status === 'Awaiting Verification')
  const completedThisMonth = ACTIONS.filter((a) => a.status === 'Completed').length
  const onTimeRate = 78

  return (
    <>
      <PageHeader
        title="Corrective Action Tracker"
        subtitle="An action that isn't verified isn't closed — this board holds owners to that"
        right={
          <button className="inline-flex items-center gap-1.5 rounded-lg border bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-2 hover:bg-accent-soft">
            <BellRing size={14} /> Send reminders to {overdue.length} overdue owners
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Overdue" value={overdue.length} footnote="Oldest is 4 days late (CA-440, Bintulu)" />
        <StatTile label="Awaiting verification" value={verify.length} footnote="Both waiting > 7 days for evidence review" />
        <StatTile label="On-time completion rate" value={onTimeRate} unit="%" delta={4} goodWhen="up" footnote="Rolling 90 days, all sites" />
        <StatTile label="Completed this quarter" value={completedThisMonth} delta={2} goodWhen="up" footnote="Avg. closure time 18 days" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted"><Filter size={13} /> Status</span>
        {(['All', ...STATUS_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s as any)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${statusFilter === s ? 'bg-accent-soft text-ink' : 'text-ink-2'}`}
            style={statusFilter === s ? { borderColor: 'var(--accent)' } : undefined}
          >
            {s}
          </button>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-3 py-3 font-semibold">Owner</th>
                <th className="px-3 py-3 font-semibold">Site</th>
                <th className="px-3 py-3 font-semibold">Priority</th>
                <th className="px-3 py-3 font-semibold">Due</th>
                <th className="w-48 px-3 py-3 font-semibold">Progress</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-accent-soft/40">
                  <td className="px-5 py-3">
                    <p className="text-[13px] font-semibold text-ink">{a.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {a.id} · from <Link to={`/incidents/${a.incident}`} className="font-semibold text-accent">{a.incident}</Link>
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: 'var(--s5)' }}
                      >
                        {a.owner.split(' ').map((w) => w[0]).join('')}
                      </span>
                      <span className="text-xs text-ink-2">{a.owner}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-ink-2">{siteById(a.site).short}</td>
                  <td className="px-3 py-3">
                    <span
                      className="rounded-md border px-2 py-0.5 text-[11px] font-semibold text-ink-2"
                      style={a.priority === 'High' ? { borderColor: 'var(--critical)', color: 'var(--critical)' } : undefined}
                    >
                      {a.priority}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ fontVariantNumeric: 'tabular-nums', color: a.status === 'Overdue' ? 'var(--critical)' : 'var(--ink-2)' }}>
                    {a.due}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <ProgressBar value={a.progress} tone={a.status === 'Overdue' ? 'var(--critical)' : a.status === 'Completed' ? 'var(--good)' : 'var(--s1)'} />
                      </div>
                      <span className="w-8 text-right text-[11px] text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{a.progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {a.status === 'Awaiting Verification' ? (
                      <button className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:bg-accent-soft" style={{ borderColor: 'var(--warning)' }}>
                        <CheckCheck size={12} /> Verify now
                      </button>
                    ) : (
                      <StatusPill kind={actionStatusKind(a.status)} label={a.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-[11px] text-muted">
        Automatic reminders: owners are nudged 7 days and 48 hours before the due date, then daily once overdue. Escalates to the site manager after 5 days late.
      </p>
    </>
  )
}
