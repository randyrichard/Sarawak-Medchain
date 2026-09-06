import { Link, useLocation } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { LinkButton } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { usePageTitle } from '@/app/pageTitle'

/*
 * Destinations offered when someone lands here signed in.
 *
 * Deliberately a short list of the places people actually go, not a copy of the sidebar.
 * A 404 whose only exit is "back to home" makes the reader do the navigating twice; the
 * point of the page is to end the dead end, and the links are what does that.
 *
 * `capability` is not checked here. These four are the ones every signed-in role can reach,
 * so there is nothing to filter and nothing to leak.
 */
const DESTINATIONS = [
  { to: '/', label: 'Dashboard', hint: 'What needs you today' },
  { to: '/incidents', label: 'Incidents', hint: 'Reports and investigations' },
  { to: '/actions', label: 'Corrective actions', hint: 'What is open and overdue' },
  { to: '/notifications', label: 'Notifications', hint: 'Anything waiting on you' },
]

/*
 * Shown for any URL the router does not recognise.
 *
 * It sits outside the authentication guard on purpose. Before that it lived inside, so a
 * signed-out visitor with a mistyped or truncated link - a wrapped invitation URL in an
 * email is the common one - was redirected to the sign-in screen instead. That is a
 * genuinely misleading answer: it looks like the session expired, so people sign in, land
 * on the dashboard, and never learn the link they were sent was broken.
 *
 * Nothing here depends on being signed in, and the page reveals no route that is not
 * already in the JavaScript bundle every visitor downloads.
 */
export function NotFoundPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  usePageTitle('Page not found')

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
        <Compass size={22} className="text-accent" aria-hidden="true" />
      </div>

      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-ink-2">
        Nothing lives at{' '}
        {/* The path is rendered as text inside a styled span, never as markup. */}
        <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">{pathname}</span>.
        {' '}It may have been moved, or the link may have been cut short on its way to you.
      </p>

      {user ? (
        <>
          <p className="mt-8 text-2xs font-semibold uppercase tracking-wider text-muted">
            Try one of these
          </p>
          <ul className="mt-2 divide-y rounded-lg border">
            {DESTINATIONS.map((d) => (
              <li key={d.to}>
                <Link
                  to={d.to}
                  className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm transition-colors
                             hover:bg-accent-soft focus:outline-none focus-visible:ring-2
                             focus-visible:ring-accent coarse:min-h-11"
                >
                  <span className="font-medium text-ink">{d.label}</span>
                  <span className="shrink-0 text-xs text-muted">{d.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-8 flex flex-wrap gap-2">
          <LinkButton to="/login" size="lg">Go to sign in</LinkButton>
          <LinkButton to="/privacy" variant="secondary" size="lg">
            Privacy notice
          </LinkButton>
        </div>
      )}

      <p className="mt-8 border-t pt-4 text-2xs text-muted">
        If you followed a link from an email and it keeps failing, ask whoever sent it to
        issue a new one — invitation and reset links are single-use and expire.
      </p>
    </div>
  )
}
