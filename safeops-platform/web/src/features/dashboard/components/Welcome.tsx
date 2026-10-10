import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Role } from '@/api/types'
import { Card, CardBody } from '@/components/ui'
import { ROLE_GUIDE } from '@/features/help/guides'

const STORAGE_KEY = 'safeops.welcome.hidden'

/**
 * Where to start, for somebody new who is not setting the workspace up.
 *
 * The administrator gets a setup checklist (GettingStarted). Everybody else arrived on a
 * page of figures with nothing saying what was theirs to do. This names the first three
 * things their role does, each a link, and points at the full guide. It goes away when
 * dismissed and stays away on this browser.
 */
export function useWelcome() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const dismiss = () => {
    setHidden(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* private mode: hidden for this visit only */ }
  }
  return { hidden, dismiss }
}

export function Welcome({ role, onDismiss }: { role: Role; onDismiss: () => void }) {
  const guide = ROLE_GUIDE[role]
  return (
    <Card className="mb-4 border-accent/40">
      <CardBody className="pt-4">
        {/* The close button sits beside the heading only, so the steps below get the full width on a phone. */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">New to SafeOps? Start here.</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{guide.summary}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Hide this introduction"
            title="Hide this introduction"
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <ol className="mt-3 grid gap-2 md:grid-cols-3">
          {guide.tasks.slice(0, 3).map((t, i) => (
            <li key={t.title}>
              <Link
                to={t.to}
                className="block h-full rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--accent)] hover:bg-accent-soft/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="block text-xs font-semibold text-ink">{i + 1}. {t.title}</span>
                <span className="mt-0.5 block text-2xs leading-relaxed text-muted">{t.detail}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-2">
          <Link to="/help" className="font-semibold text-accent hover:underline">Read the guide for your role</Link>
          {' '}- step-by-step help and what the safety terms mean. It is always under Help in the menu.
        </p>
      </CardBody>
    </Card>
  )
}
