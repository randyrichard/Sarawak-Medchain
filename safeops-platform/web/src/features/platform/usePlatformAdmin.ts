import { useEffect, useState } from 'react'
import { platformApi } from '@/api/platformApi'

/**
 * Whether this session is SafeOps staff.
 *
 * Asked once per mount and cached in state. Deliberately not derived from the access token:
 * the token carries company memberships, and putting a platform flag in it would mean
 * revoking somebody's access waited for the token to expire. The server re-checks the
 * database on every platform call regardless — this only decides whether to draw the
 * navigation entry.
 *
 * Defaults to false and stays false on error, so a failed call hides the entry rather than
 * offering a page that will refuse.
 */
export function usePlatformAdmin(): boolean {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    platformApi.me()
      .then((r) => { if (!cancelled) setIsPlatformAdmin(r.platformAdmin) })
      .catch(() => { if (!cancelled) setIsPlatformAdmin(false) })
    return () => { cancelled = true }
  }, [])

  return isPlatformAdmin
}
