import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Filter } from 'lucide-react'
import { Card, PageHeader, StatusPill, severityKind } from '../components/ui'
import { INCIDENTS, SITES, WORKFLOW_STAGES, siteById, SEVERITY_RANK, type Stage } from '../data/mock'

const stageTone: Record<Stage, string> = {
  Reported: 'var(--s3)', Investigation: 'var(--s1)', 'Root Cause': 'var(--s5)',
  'Corrective Action': 'var(--s8)', Approval: 'var(--s2)', Closed: 'var(--baseline)',
}

export default function Incidents() {
  const [stageFilter, setStageFilter] = useState<'All' | Stage>('All')
  const [siteFilter, setSiteFilter] = useState('All')

  const filtered = useMemo(
    () =>
      INCIDENTS.filter(
        (i) => (stageFilter === 'All' || i.stage === stageFilter) && (siteFilter === 'All' || i.site === siteFilter),
      ).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.date.localeCompare(a.date)),
    [stageFilter, siteFilter],
  )

  const openBySeverity = INCIDENTS.filter((i) => i.stage !== 'Closed')

  return (
    <>
      <PageHeader
        title="Incident Investigation"
        subtitle={`${openBySeverity.length} open investigations · sorted by severity so the worst is always on top`}
        right={
          <button className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white shadow-card" style={{ background: 'var(--accent)' }}>
            <Plus size={15} /> Report Incident
          </button>
        }
      />

      {/* Pipeline overview */}
      <Card className="mb-4 px-5 py-4">
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {WORKFLOW_STAGES.map((stage) => {
            const count = INCIDENTS.filter((i) => i.stage === stage).length
            const active = stageFilter === stage
            return (
              <button
                key={stage}
                onClick={() => setStageFilter(active ? 'All' : stage)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'bg-accent-soft' : 'hover:bg-accent-soft/50'}`}
                style={active ? { borderColor: 'var(--accent)' } : undefined}
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: stageTone[stage] }} />
                  <span className="text-[11px] font-medium text-ink-2">{stage}</span>
                </div>
                <p className="mt-1 text-xl font-semibold tracking-tight text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</p>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted"><Filter size={13} /> Site</span>
        <button
          onClick={() => setSiteFilter('All')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${siteFilter === 'All' ? 'bg-accent-soft text-ink' : 'text-ink-2'}`}
          style={siteFilter === 'All' ? { borderColor: 'var(--accent)' } : undefined}
        >
          All sites
        </button>
        {SITES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSiteFilter(siteFilter === s.id ? 'All' : s.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${siteFilter === s.id ? 'bg-accent-soft text-ink' : 'text-ink-2'}`}
            style={siteFilter === s.id ? { borderColor: 'var(--accent)' } : undefined}
          >
            {s.short}
          </button>
        ))}
      </div>

      {/* List */}
      <Card>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-semibold">Incident</th>
              <th className="hidden px-3 py-3 font-semibold md:table-cell">Site</th>
              <th className="px-3 py-3 font-semibold">Severity</th>
              <th className="hidden px-3 py-3 font-semibold lg:table-cell">Stage</th>
              <th className="hidden px-3 py-3 font-semibold lg:table-cell">Owner</th>
              <th className="px-5 py-3 text-right font-semibold">Days open</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inc) => (
              <tr key={inc.id} className="border-b last:border-0 hover:bg-accent-soft/40">
                <td className="px-5 py-3">
                  <Link to={`/incidents/${inc.id}`} className="block">
                    <p className="text-[13px] font-semibold text-ink hover:text-accent">{inc.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{inc.id} · {inc.type} · {inc.date}</p>
                  </Link>
                </td>
                <td className="hidden px-3 py-3 text-xs text-ink-2 md:table-cell">{siteById(inc.site).short}</td>
                <td className="px-3 py-3"><StatusPill kind={severityKind(inc.severity)} label={inc.severity} /></td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: stageTone[inc.stage] }} />
                    {inc.stage}
                  </span>
                </td>
                <td className="hidden px-3 py-3 text-xs text-ink-2 lg:table-cell">{inc.owner}</td>
                <td className="px-5 py-3 text-right">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ fontVariantNumeric: 'tabular-nums', color: inc.stage !== 'Closed' && inc.daysOpen > 14 ? 'var(--critical)' : 'var(--ink)' }}
                  >
                    {inc.daysOpen}d
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">No incidents match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  )
}
