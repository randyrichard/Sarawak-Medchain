import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'

/** One cycle of the light across a placeholder: `.skeleton::after` in index.css (2.4s). */
export const SKELETON_PERIOD_MS = 2400

/**
 * Where the shared cycle is right now, as a negative delay. A placeholder that appears late,
 * because one panel reloads while the others still wait, joins the light where it already is
 * on the page instead of starting a light of its own.
 */
export function skeletonPhase(now: number): string {
  return `${-Math.round(now % SKELETON_PERIOD_MS)}ms`
}

/** Placeholder shape while something loads. Size it with width/height utilities at the call site. */
export function Skeleton({ className }: { className?: string }) {
  const [phase] = useState(() => skeletonPhase(performance.now()))
  return (
    <div
      aria-hidden
      className={cn('skeleton rounded-md', className)}
      style={{ '--skeleton-phase': phase } as CSSProperties}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
