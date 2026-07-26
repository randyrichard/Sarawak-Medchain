import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { api } from '@/api/client'
import { authApi, isBackendConfigured } from '@/api/authApi'
import { setAuthenticatedRoles } from '@/api/mock/identity'
import type { User } from '@/api/types'
import { clearSession, loadSession, saveSession } from './session'

type Status = 'restoring' | 'anonymous' | 'authenticated'

interface AuthValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<void>
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

  const login = useCallback(async (email: string, password: string) => {
    if (BACKEND) {
      const u = await authApi.login(email, password)
      setUser(u)
      setAuthenticatedRoles(u.memberships.map((m) => m.role))
      setStatus('authenticated')
      return
    }
    const { session, user: u } = await api.login(email, password)
    saveSession(session)
    setUser(u)
    setAuthenticatedRoles(u.memberships.map((m) => m.role))
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
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
    () => ({ status, user, login, logout, backend: BACKEND }),
    [status, user, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
