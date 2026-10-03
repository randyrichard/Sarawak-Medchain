import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {/*
        `max-w-full` + `flex-wrap`: the actions may wrap onto more lines but never run wider
        than the screen. As `shrink-0` alone, a header with four actions made a 678px row on
        a 412px phone, and the phone zoomed the whole page out to fit it - every word on the
        page drawn at 60% size.
      */}
      {right && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}
