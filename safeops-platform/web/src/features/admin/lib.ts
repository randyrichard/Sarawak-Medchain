import { useMemo } from 'react'
import type { AdminActor, UserStatus } from '@/api/admin'
import type { StatusKind } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { csvDocument } from '@/lib/csv'

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
  // Built by the shared writer, which neutralises cells a spreadsheet would execute. The
  // login-history export carries the raw User-Agent of every login attempt, so an attacker
  // with no account can put a formula into a file an administrator opens.
  const blob = new Blob([csvDocument(header, rows)], { type: 'text/csv;charset=utf-8' })
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

/**
 * What a site is carrying, in a sentence.
 *
 * Shown next to every site because the only off-switch offered is deactivation - stating
 * what would be orphaned is how an administrator understands why, rather than hunting for
 * a delete button that is deliberately absent.
 */
export function siteInUseSummary(s: {
  inUse: { incidents: number; permits: number; assets: number; employees: number; departments: number }
}): string {
  const parts = [
    [s.inUse.incidents, 'incident'],
    [s.inUse.permits, 'permit'],
    [s.inUse.assets, 'asset'],
    [s.inUse.employees, 'employee'],
    [s.inUse.departments, 'department'],
  ] as const
  const used = parts
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
  return used.length === 0
    ? 'Nothing references this site yet.'
    : `Referenced by ${used.join(', ')}.`
}

/**
 * The plan's site allowance, measured against what the console is showing.
 *
 * Counts active sites only, matching the server: a deactivated site keeps its history and
 * stays listed, but it is not a location anyone operates, so it does not consume the
 * allowance. Getting this wrong in either direction is worse than not showing it - a
 * button enabled at the limit fails on click, and one disabled below it blocks work the
 * customer has paid for.
 *
 * This decides what to show. The API decides what is allowed, and refuses the write
 * whatever this returns.
 */
export interface SiteAllowance {
  /** null when the plan sets no limit. */
  limit: number | null
  used: number
  atLimit: boolean
}

export function siteAllowanceOf(
  sites: { active: boolean }[] | null,
  entitlements: { maxSites: number | null } | undefined,
): SiteAllowance {
  const limit = entitlements?.maxSites ?? null
  const used = (sites ?? []).filter((s) => s.active).length
  return { limit, used, atLimit: limit !== null && used >= limit }
}

/** "2 of 3 sites", or nothing at all when the plan does not limit them. */
export function siteAllowanceLabel(a: SiteAllowance): string | null {
  return a.limit === null ? null : `${a.used} of ${a.limit} sites`
}

/**
 * Why the New site button is off, and what to do about it.
 *
 * Deliberately the same three facts the API's refusal carries - the plan, the number, and
 * the two ways out - so an administrator who hits this in the console and an integrator
 * who hits it through the API are told the same thing.
 */
export function siteLimitNote(a: SiteAllowance, planLabel: string): string {
  return `${planLabel} includes ${a.limit} active ${a.limit === 1 ? 'site' : 'sites'}, `
    + `and this workspace has ${a.used}. Deactivate a site you no longer operate, or move `
    + 'to Premium for unlimited sites.'
}

/** The same, for a department. */
export function departmentInUseSummary(d: {
  inUse: { incidents: number; visitors: number; teams: number }
}): string {
  const used = ([
    [d.inUse.incidents, 'incident'],
    [d.inUse.visitors, 'visitor'],
    [d.inUse.teams, 'team'],
  ] as const)
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
  return used.length === 0
    ? 'Nothing references this department yet.'
    : `Referenced by ${used.join(', ')}.`
}

/** How an invitation reads, and how urgently. */
export function invitationState(state: string): { label: string; tone: 'good' | 'warning' | 'neutral' | 'critical' } {
  switch (state) {
    case 'accepted': return { label: 'Accepted', tone: 'good' }
    case 'pending': return { label: 'Pending', tone: 'warning' }
    case 'revoked': return { label: 'Revoked', tone: 'neutral' }
    case 'expired': return { label: 'Expired', tone: 'critical' }
    default: return { label: state, tone: 'neutral' }
  }
}

/**
 * The link an invitee follows.
 *
 * Built in the browser from the token the server returned once. With no mail provider
 * configured this is how the invitation reaches somebody, so it is shown to the
 * administrator to pass on rather than pretending an email went out.
 */
export function invitationLink(token: string, origin = window.location.origin): string {
  return `${origin}/accept-invitation/${token}`
}

/**
 * How an invitation's email delivery reads.
 *
 * Deliberately the same words and tones the Reports page uses for its own delivery - an
 * operator who has learnt what "Failed" means there should not have to learn it again.
 * "Not sent" is not a failure: it means nobody has configured a mail provider yet.
 */
export function invitationDelivery(status: string): {
  label: string
  tone: 'good' | 'warning' | 'neutral' | 'critical'
} {
  switch (status) {
    case 'sent': return { label: 'Emailed', tone: 'good' }
    case 'failed': return { label: 'Email failed', tone: 'critical' }
    case 'email_pending': return { label: 'Sending', tone: 'warning' }
    default: return { label: 'Not emailed', tone: 'neutral' }
  }
}

/**
 * Whether resending is worth offering.
 *
 * Only for an invitation that is still live and has attempts left. Offering it on an
 * accepted or revoked one invites a click that can only fail.
 */
export function canResendInvitation(inv: {
  state: string
  attempts: number
  maxSends: number
}): boolean {
  return inv.state === 'pending' && inv.attempts < inv.maxSends
}
