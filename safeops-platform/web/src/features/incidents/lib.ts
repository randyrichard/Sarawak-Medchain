import {
  AlertTriangle, Ambulance, Car, CloudRain, Flame, HardHat, HeartPulse,
  Leaf, ShieldAlert, Skull, Stethoscope, Wrench, type LucideIcon,
} from 'lucide-react'
import type { Incident, IncidentStage, IncidentType } from '@/api/incidents'
import type { StatusKind } from '@/components/ui'
import type { Actor } from '@/api/incidents'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { EMPLOYEES, USERS } from '@/api/mock/fixtures'

export const TYPE_ICON: Record<IncidentType, LucideIcon> = {
  near_miss: ShieldAlert,
  first_aid: HeartPulse,
  mtc: Stethoscope,
  rwc: Ambulance,
  lti: HardHat,
  fatality: Skull,
  property_damage: Wrench,
  environmental: Leaf,
  vehicle: Car,
  fire: Flame,
  unsafe_act: AlertTriangle,
  unsafe_condition: CloudRain,
}

export const severityKind = (s: Incident['severity']): StatusKind =>
  s === 'Critical' ? 'critical' : s === 'Serious' ? 'serious' : s === 'Moderate' ? 'warning' : 'good'

/** Stage accent (series tokens — workflow identity, not status). */
export const STAGE_COLOR: Record<IncidentStage, string> = {
  reported: 'var(--s3)',
  assessment: 'var(--s8)',
  investigation: 'var(--s1)',
  rca: 'var(--s5)',
  actions: 'var(--s2)',
  review: 'var(--s7)',
  verification: 'var(--s4)',
  closed: 'var(--baseline)',
}

export const daysOpen = (i: Incident): number =>
  Math.max(0, Math.floor((Date.now() - new Date(i.reportedAt).getTime()) / 86400_000))

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })

/** People available for assignment/mentions (org directory + platform users). */
export const PEOPLE: string[] = [
  ...new Set([...USERS.map((u) => u.name), ...EMPLOYEES.map((e) => e.name)]),
].sort()

/** The acting user, as the API's permission checks expect it. */
export function useActor(): Actor {
  const { user } = useAuth()
  const { role, membership } = useOrg()
  return {
    name: user?.name ?? 'Unknown',
    role: role ?? 'employee',
    siteIds: membership?.siteIds ?? [],
  }
}

/** Mock site datum coordinates for the GPS capture fallback. */
export const SITE_COORDS: Record<string, string> = {
  kch: '1.5533° N, 110.3592° E',
  btu: '3.2608° N, 113.0662° E',
  mri: '4.3995° N, 113.9914° E',
  sbu: '2.2870° N, 111.8305° E',
  twu: '4.2448° N, 117.8911° E',
  sen: '1.6533° N, 110.4442° E',
  pjy: '1.5761° N, 110.3266° E',
  smh: '3.1499° N, 113.2735° E',
}
