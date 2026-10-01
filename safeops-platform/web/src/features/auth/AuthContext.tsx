import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { api } from '@/api/client'
import { authApi, isBackendConfigured, onSessionIdentityChange } from '@/api/authApi'
import { setAuthenticatedRoles } from '@/api/mock/identity'
import type { User } from '@/api/types'
import { clearPreferences, markFreshLogin } from '@/features/account/preferences'
import { resetPlatformInfo } from '@/features/platform/usePlatformAdmin'
import { forgetOrgCaches } from '@/features/org/caches'
import { clearSession, loadSession, saveSession } from './session'

type Status = 'restoring' | 'anonymous' | 'authenticated'

interface AuthValue {
  status: Status
  user: User | null
  /** `rememberMe` false makes the refresh cookie last only as long as the browser is open. */
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  /** Finishes a sign-in that `login` answered with MfaRequiredError. */
  verifyMfa: (challenge: string, code: string) => Promise<void>
  /** Re-reads the session from the server, e.g. once MFA has been set up. */
  reload: () => Promise<void>
  logout: () => Promise<void>
  /** True when authentication is served by the real API rather than the mock client. */
  backend: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Authentication is served by the real API whenever VITE_API_BASE_URL is set. The mock
 * path is retained only so the credential-free static demo still runs; it is not a
 * security boundary and must never be enabled for a tenant deployment.
 */
const BACKEND = isBackendConfigured()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('restoring')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false

    if (BACKEND) {
      // Restore purely from the httpOnly refresh cookie — nothing is read from browser
      // storage, so there is no client-held state an attacker could forge.
      authApi
        .restore()
        .then((u) => {
          if (cancelled) return
          setUser(u)
          setAuthenticatedRoles(u ? u.memberships.map((m) => m.role) : null)
          setStatus(u ? 'authenticated' : 'anonymous')
        })
        .catch(() => {
          if (cancelled) return
          setStatus('anonymous')
        })
      return () => { cancelled = true }
    }

    const session = loadSession()
    if (!session) {
      setStatus('anonymous')
      return
    }
    api
      .me(session.token)
      .then((u) => {
        if (cancelled) return
        setUser(u)
        setAuthenticatedRoles(u.memberships.map((m) => m.role))
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearSession()
        setStatus('anonymous')
      })
    return () => { cancelled = true }
  }, [])

  /**
   * Follows the session when it changes underneath this tab.
   *
   * The access token is per-tab, but the refresh token is an httpOnly cookie shared by the
   * whole origin, so signing in as somebody else in any tab re-points all of them at the
   * next refresh. Nothing here noticed: this provider set `user` once, on login or restore,
   * and never read it again. The result was a screen drawn for one account and answered for
   * another - the administrator navigation and avatar over a session with neither, every
   * click refused and nothing saying why.
   *
   * The server was never fooled; it authorised the token it was handed and refused
   * correctly. The lie was the client's, about who it was showing.
   *
   * So this drops to the restoring spinner immediately rather than leaving the wrong name
   * on screen for the length of a round trip, then asks who the tab is now.
   */
  useEffect(() => {
    if (!BACKEND) return
    onSessionIdentityChange(() => {
      // Everything cached for the previous reader, cleared for the same reasons login
      // clears it - none of it is theirs any more.
      clearPreferences()
      resetPlatformInfo()
      forgetOrgCaches()

      setUser(null)
      setAuthenticatedRoles(null)
      setStatus('restoring')

      // The token is already the new one, so this needs no rotation - just the roles,
      // which only /auth/me can answer.
      authApi
        .me()
        .then((u) => {
          setUser(u)
          setAuthenticatedRoles(u.memberships.map((m) => m.role))
          setStatus('authenticated')
        })
        .catch(() => {
          setAuthenticatedRoles(null)
          setStatus('anonymous')
        })
    })
    return () => onSessionIdentityChange(null)
  }, [])

  /** A session the server has just issued becomes the one this tab shows. */
  const adopt = (u: User) => {
    markFreshLogin()
    setUser(u)
    setAuthenticatedRoles(u.memberships.map((m) => m.role))
    setStatus('authenticated')
  }

  const login = useCallback(async (email: string, password: string, rememberMe = true) => {
    // Whoever was signed in before, their cached preferences must not leak into this session.
    clearPreferences()
    /*
     * Nor may their platform-staff answer. It is cached in a module-level promise shared by
     * the sidebar, the route guard and the console; signing out clears it, but a session
     * that simply expired never passes through sign-out. Without this, the next person to
     * sign in on that browser inherits the previous answer - either seeing a console link
     * they cannot use, or missing one they can.
     *
     * Cosmetic rather than a hole, since the server re-checks the database on every
     * platform call and a stale `true` still cannot make it answer one. But the login
     * redirect now reads this to decide where to land somebody, so a stale answer would put
     * them back on the wall this change exists to remove.
     */
    resetPlatformInfo()
    // Keyed by workspace but filtered by the reader - see forgetOrgCaches. Without this
    // the next person to sign in on this browser inherits the previous one's pickers.
    forgetOrgCaches()
    if (BACKEND) {
      // Throws MfaRequiredError when a code is needed; the sign-in screen catches it and
      // finishes with verifyMfa below.
      adopt(await authApi.login(email, password, rememberMe))
      return
    }
    const { session, user: u } = await api.login(email, password)
    saveSession(session)
    markFreshLogin()
    setUser(u)
    setAuthenticatedRoles(u.memberships.map((m) => m.role))
    setStatus('authenticated')
  }, [])

  const verifyMfa = useCallback(async (challenge: string, code: string) => {
    adopt(await authApi.verifyMfa(challenge, code))
  }, [])

  const reload = useCallback(async () => {
    const u = await authApi.reload()
    setUser(u)
    setAuthenticatedRoles(u.memberships.map((m) => m.role))
  }, [])

  const logout = useCallback(async () => {
    clearPreferences()
    // The platform-staff answer is cached across components for the session. Without
    // this, signing out and back in as somebody else would leave the previous user's
    // navigation drawn until a full reload.
    resetPlatformInfo()
    forgetOrgCaches()
    if (BACKEND) {
      // Revoke server-side first; clearing local state alone would leave the session live.
      await authApi.logout().catch(() => {})
      setUser(null)
      setAuthenticatedRoles(null)
      setStatus('anonymous')
      return
    }
    const session = loadSession()
    clearSession()
    setUser(null)
    setAuthenticatedRoles(null)
    setStatus('anonymous')
    if (session) await api.logout(session.token).catch(() => {})
  }, [])

  const value = useMemo(
    () => ({ status, user, login, verifyMfa, reload, logout, backend: BACKEND }),
    [status, user, login, verifyMfa, reload, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
