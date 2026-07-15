import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList, ListChecks, ShieldCheck, Bell, Compass, CalendarClock, Activity, ArrowRight, Lock,
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { api } from '@/api/client'
import type { ActivityEvent, AppNotification } from '@/api/types'
import { timeAgo } from '@/lib/time'
import {
  Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, SkeletonRows, SkeletonText,
} from '@/components/ui'
import { ScoreRing } from '@/components/charts/Sparkline'
import { useSimulatedQuery } from './useSimulatedQuery'
import { Avatar } from '@/components/ui'

export function DashboardPage() {
  const { user } = useAuth()
  const { company, site, allowed } = useOrg()
  const scopeLabel = site ? site.name : company ? `${company.name} · all sites` : ''
  const firstName = user?.name.split(' ')[0] ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle={scopeLabel ? `Safety posture for ${scopeLabel}` : 'Loading scope…'}
        right={<Badge tone="accent">Foundation build · data modules ship next sprint</Badge>}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <MissionControlCard className="xl:col-span-2" />
        <ScoresCard />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <IncidentSummaryCard />
        <ActionsCard />
        <AuditsCard />
        <NotificationsCard />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ActivityCard />
        {allowed('analytics:view') ? <TrendPlaceholderCard /> : <ReportPromptCard />}
      </div>
    </>
  )
}

// ─── Mission Control (Decision Feed placeholder) ─────────────────────────────

function MissionControlCard({ className }: { className?: string }) {
  const { loading } = useSimulatedQuery(() => true, 1100)
  return (
    <Card className={className}>
      <CardHeader
        title="Mission Control"
        subtitle="Ranked decisions — what to act on today"
        right={<Badge tone="neutral" className="gap-1"><Lock size={9} /> Sprint 2</Badge>}
      />
      <CardBody>
        {loading ? (
          <div className="space-y-4 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <div className="flex-1"><SkeletonText lines={2} /></div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Compass} title="Your decision feed starts here">
            When the incident and action modules go live, SafeOps ranks what needs attention —
            each item with its evidence and a recommended next step. No more digging through reports.
          </EmptyState>
        )}
      </CardBody>
    </Card>
  )
}

// ─── Scores ──────────────────────────────────────────────────────────────────

function ScoresCard() {
  const { loading } = useSimulatedQuery(() => true, 800)
  return (
    <Card>
      <CardHeader title="Scores" subtitle="Explainable — click will show the formula" />
      <CardBody className="flex items-center justify-around py-5">
        {loading ? (
          <>
            <Skeleton className="h-[120px] w-[120px] rounded-full" />
            <Skeleton className="h-[120px] w-[120px] rounded-full" />
          </>
        ) : (
          <>
            <ScoreRing value={null} label="Safety Score" sublabel="Needs 1 month of data" />
            <ScoreRing value={null} label="Compliance Score" sublabel="Configure standards first" />
          </>
        )}
      </CardBody>
    </Card>
  )
}

// ─── Small summary cards ─────────────────────────────────────────────────────

function SummaryCard({
  title, icon: Icon, sprint, loading, children,
}: {
  title: string
  icon: typeof ClipboardList
  sprint?: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <div className="flex items-start justify-between px-4 pb-1 pt-4">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-2">
          <Icon size={14} className="text-muted" /> {title}
        </span>
        {sprint && <Badge tone="neutral" className="gap-1"><Lock size={9} /> {sprint}</Badge>}
      </div>
      <div className="px-4 pb-4 pt-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}

function IncidentSummaryCard() {
  const { loading } = useSimulatedQuery(() => true, 700)
  return (
    <SummaryCard title="Incident Summary" icon={ClipboardList} sprint="Sprint 2" loading={loading}>
      <p className="text-2xl font-semibold tracking-tight text-muted">—</p>
      <p className="mt-1 text-2xs leading-relaxed text-muted">
        Open investigations and severity mix will appear once incident capture is live.
      </p>
    </SummaryCard>
  )
}

function ActionsCard() {
  const { loading } = useSimulatedQuery(() => true, 850)
  return (
    <SummaryCard title="Corrective Actions" icon={ListChecks} sprint="Sprint 2" loading={loading}>
      <p className="text-2xl font-semibold tracking-tight text-muted">—</p>
      <p className="mt-1 text-2xs leading-relaxed text-muted">
        Open, overdue and awaiting-verification counts — with automatic escalation.
      </p>
    </SummaryCard>
  )
}

function AuditsCard() {
  const { loading } = useSimulatedQuery(() => true, 950)
  return (
    <SummaryCard title="Upcoming Audits" icon={CalendarClock} sprint="Sprint 3" loading={loading}>
      <p className="text-2xl font-semibold tracking-tight text-muted">—</p>
      <p className="mt-1 text-2xs leading-relaxed text-muted">
        Audit countdowns and majors-first readiness queues land with the Compliance module.
      </p>
    </SummaryCard>
  )
}

function NotificationsCard() {
  const [items, setItems] = useState<AppNotification[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api.listNotifications().then((n) => !cancelled && setItems(n))
    return () => {
      cancelled = true
    }
  }, [])
  const unread = items?.filter((n) => !n.readAt).length ?? 0
  return (
    <SummaryCard title="Notifications" icon={Bell} loading={items === null}>
      <p className="text-2xl font-semibold tracking-tight text-ink">{unread}</p>
      <p className="mt-1 text-2xs leading-relaxed text-muted">unread of {items?.length ?? 0} total</p>
      <Link to="/notifications" className="mt-2 inline-flex items-center gap-1 text-2xs font-semibold text-accent">
        Open center <ArrowRight size={11} />
      </Link>
    </SummaryCard>
  )
}

// ─── Recent activity (live from mock API) ────────────────────────────────────

function ActivityCard() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api.listActivity().then((e) => !cancelled && setEvents(e))
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <Card>
      <CardHeader title="Recent Activity" subtitle="Everything is audited — this is the human-readable view" />
      <CardBody>
        {events === null ? (
          <SkeletonRows rows={5} />
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3">
                <Avatar name={e.actor} size={28} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="text-ink-2">
                    <span className="font-semibold text-ink">{e.actor}</span> {e.verb}{' '}
                    <span className="font-medium text-ink">{e.target}</span>
                  </p>
                  <p className="text-2xs text-muted">{timeAgo(e.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function TrendPlaceholderCard() {
  const { loading } = useSimulatedQuery(() => true, 1200)
  return (
    <Card>
      <CardHeader
        title="Safety KPI Trends"
        subtitle="Incidents, near-misses and TRIFR against target"
        right={<Badge tone="neutral" className="gap-1"><Lock size={9} /> Sprint 3</Badge>}
      />
      <CardBody>
        {loading ? (
          <div className="flex h-44 items-end gap-2 px-2" aria-hidden>
            {[35, 55, 40, 70, 50, 80, 60, 45, 75, 58, 66, 88].map((h, i) => (
              <div key={i} className="w-full animate-pulse rounded-t-md bg-grid" style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Activity} title="Charts arrive with the Analytics module">
            The design system's chart layer is ready (see Design System → Charts). It lights up
            as soon as incident data exists to draw.
          </EmptyState>
        )}
      </CardBody>
    </Card>
  )
}

function ReportPromptCard() {
  return (
    <Card>
      <CardHeader title="Report something" subtitle="See a hazard? That's the whole point." />
      <CardBody>
        <EmptyState icon={ShieldCheck} title="Field reporting opens in Sprint 2">
          You'll scan a QR code at your station and file a hazard or near-miss in under a minute —
          in Bahasa Malaysia or English, even offline.
        </EmptyState>
      </CardBody>
    </Card>
  )
}
