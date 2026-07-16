import { Sparkles, ArrowRight } from 'lucide-react'
import type { Insight } from '@/api/dashboard'
import { Badge, Card, CardHeader, SkeletonText, StatusPill } from '@/components/ui'

export function InsightsPanel({
  insights, loading, className,
}: {
  insights: Insight[] | undefined
  loading: boolean
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader
        title="Insights"
        subtitle="What the data is trying to tell you"
        right={
          <Badge tone="accent" className="gap-1">
            <Sparkles size={10} /> AI-assisted · preview
          </Badge>
        }
      />
      <div className="space-y-2.5 px-5 pb-4 pt-1">
        {loading || !insights ? (
          <>
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
          </>
        ) : (
          insights.map((insight, i) => (
            <div key={insight.id} className="animate-rise rounded-lg border px-3.5 py-3" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0">
                  <StatusPill
                    kind={insight.severity}
                    label={insight.severity === 'critical' ? 'Act' : insight.severity === 'serious' ? 'High' : insight.severity === 'warning' ? 'Watch' : 'Note'}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-ink">{insight.text}</p>
                  <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-ink-2">
                    <ArrowRight size={12} className="mt-0.5 shrink-0 text-accent" />
                    {insight.suggestion}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
        <p className="pt-1 text-2xs leading-relaxed text-muted">
          Generated from your own trends by rule-based analysis today; the AI engine that writes these
          arrives in a later sprint. Every insight will always link to its evidence.
        </p>
      </div>
    </Card>
  )
}
