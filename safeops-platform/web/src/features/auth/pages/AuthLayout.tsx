import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

/** Split auth screen: form left, product promise right (hidden on mobile). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <div className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-[460px] lg:shrink-0 lg:border-r">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
              <ShieldCheck size={19} color="#fff" strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-base font-bold leading-none tracking-tight text-ink">SafeOps</p>
              <p className="mt-0.5 text-2xs font-medium uppercase tracking-widest text-muted">Safety Intelligence</p>
            </div>
          </div>
          {children}
        </div>
      </div>

      <div className="hidden flex-1 items-center justify-center bg-sunken p-12 lg:flex">
        <div className="max-w-md">
          <p className="text-2xl font-semibold leading-snug tracking-tight text-ink">
            Every screen answers one question: <span className="text-accent">what should you do next?</span>
          </p>
          <ul className="mt-6 space-y-3 text-sm text-ink-2">
            <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> Ranked decision feed instead of report piles</li>
            <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> Explainable safety and compliance scores</li>
            <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> Corrective actions that chase their owners</li>
          </ul>
          <p className="mt-8 text-2xs text-muted">MedChain Enterprise · Sprint 1 foundation build</p>
        </div>
      </div>
    </div>
  )
}
