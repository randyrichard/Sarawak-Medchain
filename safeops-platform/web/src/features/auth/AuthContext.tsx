import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { api } from '@/api/client'
import type { User } from '@/api/types'
import { clearSession, loadSession, saveSession } from './session'

type Status = 'restoring' | 'anonymous' | 'authenticated'

interface AuthValue {
  status: Status
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('restoring')
  const [user, setUser] = useState<User | null>(null)

  // Restore session on boot: validate the stored token against the API.
  useEffect(() => {
    const session = loadSession()
    if (!session) {
      setStatus('anonymous')
      return
    }
    let cancelled = false
    api
      .me(session.token)
      .then((u) => {
        if (cancelled) return
        setUser(u)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearSession()
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { session, user: u } = await api.login(email, password)
    saveSession(session)
    setUser(u)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    const session = loadSession()
    clearSession()
    setUser(null)
    setStatus('anonymous')
    if (session) await api.logout(session.token).catch(() => {})
  }, [])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
