import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import type { Capability } from '@/features/permissions/permissions'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { ForbiddenPage } from '@/app/pages/ForbiddenPage'

/** Blocks anonymous users; preserves the intended destination. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'restoring') return <FullPageSpinner label="Restoring your session…" />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
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
