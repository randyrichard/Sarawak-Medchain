import { useMemo } from 'react'
import type { AdminActor, UserStatus } from '@/api/admin'
import type { StatusKind } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'

/** The acting administrator, with a session-stable device + IP for the audit log. */
export function useAdminActor(): AdminActor {
  const { user } = useAuth()
  const { role } = useOrg()
  return useMemo(() => {
    const ua = navigator.userAgent
    const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Browser'
    const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Unknown'
    return { name: user?.name ?? 'Unknown', role: role ?? 'employee', ip: '203.82.14.6', device: `${browser} · ${os}` }
  }, [user?.name, role])
}

export const USER_STATUS_KIND: Record<UserStatus, StatusKind> = {
  active: 'good',
  invited: 'info',
  deactivated: 'critical',
  locked: 'warning',
}

export function downloadCsv(header: string[], rows: (string | number | null | undefined)[][], filename: string) {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob([[header.map(esc).join(','), body].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
