import type { Session } from '@/api/types'
import { decodeToken } from '@/api/client'

const KEY = 'safeops.session'

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(KEY)
}

/** Returns the stored session only if it is well-formed and unexpired. */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    const payload = decodeToken(s.token)
    if (!payload || payload.exp < Date.now()) {
      clearSession()
      return null
    }
    return s
  } catch {
    clearSession()
    return null
  }
}
