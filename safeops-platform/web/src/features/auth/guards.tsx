import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import type { Capability } from '@/features/permissions/permissions'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ForbiddenPage } from '@/app/pages/ForbiddenPage'
import { ChangePasswordRequiredPage } from './pages/ChangePasswordRequiredPage'
import { MfaSetupRequiredPage } from './pages/MfaSetupRequiredPage'

/** Blocks anonymous users; preserves the intended destination. */
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'restoring') return <FullPageSpinner label="Restoring your session…" />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  /*
   * An account still carrying a password somebody else chose gets no further.
   *
   * Four admin actions set this flag and nothing acted on it, so "Force password reset"
   * changed a column and left the old password working. It matters most for the first
   * administrator of a new workspace, whose password is chosen by whoever deploys the
   * system - without this, that person keeps a working login to the customer's records.
   *
   * Placed here rather than on a route so there is no address that skips it.
   */
  if (user?.mustChangePassword) return <ChangePasswordRequiredPage />
  /*
   * Then, if a workspace requires multi-factor sign-in, setting it up comes before
   * anything else - the API refuses everything but the setup until it is done, so showing
   * the app would only show a wall of errors.
   */
  if (user?.mfaSetupRequired) return <MfaSetupRequiredPage />
  return <Outlet />
}

/** Blocks authenticated users out of auth pages (login while logged in → home). */
export function RequireAnonymous() {
  const { status } = useAuth()
  if (status === 'restoring') return <FullPageSpinner />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}

/** Route-level capability gate. Renders 403 — never hides the fact a page exists. */
export function RequireCapability({ capability, children }: { capability: Capability; children: ReactNode }) {
  const { allowed, loading } = useOrg()
  if (loading) return <FullPageSpinner />
  if (!allowed(capability)) return <ForbiddenPage capability={capability} />
  return <>{children}</>
}

/** Inline conditional rendering: <Can capability="org:manage">…</Can> */
export function Can({ capability, children }: { capability: Capability; children: ReactNode }) {
  const { allowed } = useOrg()
  return allowed(capability) ? <>{children}</> : null
}
