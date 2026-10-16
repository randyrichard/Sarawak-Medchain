import type { ReactNode } from 'react'
import { ServerOff } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * One quiet line naming what a demo screen leaves out because it needs the server.
 *
 * For parts of a screen, where a note per part would stack up: an asset's record had five
 * server-only sections, and each said so in red. A whole page the demo lacks says so with
 * `ErrorAlert` instead.
 */
export function NotInDemo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-2xs text-muted', className)}>
      <ServerOff size={12} className="mt-px shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}
