import { Badge, PageHeader } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { useDashboard } from './useDashboard'
import { KpiGrid } from './components/KpiGrid'
import { PriorityPanel } from './components/PriorityPanel'
import { RiskHeatmap } from './components/RiskHeatmap'
import { PerformanceCharts } from './components/PerformanceCharts'
import { Leaderboard } from './components/Leaderboard'
import { ActivityTimeline } from './components/ActivityTimeline'
import { InsightsPanel } from './components/InsightsPanel'
import { EventsList } from './components/EventsList'
import { timeAgo } from '@/lib/time'

// Mission Control — the decision dashboard. Order encodes priority:
// 1. KPIs (30-second health check)  2. Priorities + Insights (what to do)
// 3. Risk map (where)  4. Performance + Upcoming (how it's changing / what's next)
// 5. Leaderboard + Activity (accountability / pulse)

export function DashboardPage() {
  const { user } = useAuth()
  const { allowed, site } = useOrg()
  const { loading, data } = useDashboard()

  const firstName = user?.name.split(' ')[0] ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const canAnalyze = allowed('analytics:view')

  return (
    <>
      <PageHeader
        title="Mission Control"
        subtitle={`${greeting}, ${firstName}. Here's what's happening across ${site ? site.name : 'your organization'} today.`}
        right={
          data ? (
            <Badge tone="neutral">{data.scopeLabel} · updated {timeAgo(data.generatedAt)}</Badge>
          ) : undefined
        }
      />

      {/* 30-second health check */}
      <KpiGrid kpis={data?.kpis} loading={loading} />

      {/* What needs me + what the data says */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <PriorityPanel items={data?.priorities} loading={loading} className="xl:col-span-2" />
        <InsightsPanel insights={data?.insights} loading={loading} />
      </div>

      {/* Where the risk is */}
      {canAnalyze && (
        <div className="mt-4">
          <RiskHeatmap sites={data?.sites} loading={loading} />
        </div>
      )}

      {/* How performance is moving + what's coming */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {canAnalyze ? (
          <PerformanceCharts charts={data?.charts} loading={loading} className="xl:col-span-2" />
        ) : (
          <ActivityTimeline events={data?.activity} loading={loading} className="xl:col-span-2" />
        )}
        <EventsList events={data?.events} loading={loading} />
      </div>

      {/* Accountability + pulse */}
      {canAnalyze && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Leaderboard entries={data?.leaderboard} loading={loading} />
          <ActivityTimeline events={data?.activity} loading={loading} />
        </div>
      )}
    </>
  )
}
