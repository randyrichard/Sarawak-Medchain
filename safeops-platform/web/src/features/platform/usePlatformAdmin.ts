import { useEffect, useState } from 'react'
import { platformApi, type PlatformPlan } from '@/api/platformApi'

/**
 * Whether this session is SafeOps staff, and what it may sell.
 *
 * Deliberately not derived from the access token: the token carries company memberships,
 * and putting a platform flag in it would mean revoking somebody's access waited for the
 * token to expire. The server re-checks the database on every platform call regardless -
 * this only decides what the UI draws.
 *
 * The answer is shared across every caller rather than fetched per component. Three
 * separate components need it on one page (the sidebar, the route guard and the console
 * itself), and asking three times is three identical database reads for one navigation.
 *
 * Staleness is not a security question - a cached `true` still cannot make the server
 * answer a call it would otherwise refuse. It only means a link stays drawn until reload
 * for somebody whose privilege was revoked mid-session, and the page they reach explains
 * itself.
 */

export interface PlatformInfo {
  platformAdmin: boolean
  plans: PlatformPlan[]
  /** False once an answer has arrived, so callers can tell "no" from "not yet". */
  loading: boolean
}

const EMPTY: PlatformInfo = { platformAdmin: false, plans: [], loading: true }

let inFlight: Promise<PlatformInfo> | null = null

function fetchInfo(): Promise<PlatformInfo> {
  if (!inFlight) {
    inFlight = platformApi.me()
      .then((r) => ({ platformAdmin: r.platformAdmin, plans: r.plans, loading: false }))
      // A failed call must not be cached as a permanent "no" - clear it so a later mount
      // can retry, then answer negatively for now.
      .catch(() => { inFlight = null; return { ...EMPTY, loading: false } })
  }
  return inFlight
}

/** Drops the shared answer, so the next mount asks again. Used when signing out. */
export function resetPlatformInfo() {
  inFlight = null
}

export function usePlatformInfo(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>(EMPTY)

  useEffect(() => {
    let cancelled = false
    fetchInfo().then((r) => { if (!cancelled) setInfo(r) })
    return () => { cancelled = true }
  }, [])

  return info
}

export function usePlatformAdmin(): boolean {
  return usePlatformInfo().platformAdmin
}
