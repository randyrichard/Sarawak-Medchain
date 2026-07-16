import { Award, TrendingUp, AlertOctagon, Hourglass, ShieldCheck } from 'lucide-react'
import type { LeaderboardEntry } from '@/api/dashboard'
import { Card, CardHeader, Skeleton, StatusPill } from '@/components/ui'

const ICONS = [Award, TrendingUp, AlertOctagon, Hourglass, ShieldCheck]

export function Leaderboard({
  entries, loading, className,
}: {
  entries: LeaderboardEntry[] | undefined
  loading: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader title="Site leaderboard" subtitle="Recognition and pressure, in equal measure" />
      <div className="space-y-1 px-3 pb-3 pt-1">
        {loading || !entries
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-44" />
                </div>
              </div>
            ))
          : entries.map((entry, i) => {
              const Icon = ICONS[i % ICONS.length]
              return (
                <div key={entry.title} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent-soft/40">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                    <Icon size={15} className="text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{entry.title}</p>
                    <p className="truncate text-sm font-semibold text-ink">{entry.siteName}</p>
                  </div>
                  <StatusPill kind={entry.kind} label={entry.metric} />
                </div>
              )
            })}
      </div>
    </Card>
  )
}
