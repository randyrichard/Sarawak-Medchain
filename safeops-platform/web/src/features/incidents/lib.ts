import { useEffect, useState } from 'react'
import {
  AlertTriangle, Ambulance, Car, CloudRain, Droplets, Flame, HardHat, HeartPulse,
  Leaf, ShieldAlert, Skull, Stethoscope, Wrench, type LucideIcon,
} from 'lucide-react'
import type { Incident, IncidentStage, IncidentType } from '@/api/incidents'
import type { StatusKind } from '@/components/ui'
import type { Actor } from '@/api/incidents'
import { useAuth } from '@/features/auth/AuthContext'
import { useOrg } from '@/features/org/OrgContext'
import { loadPeople } from '@/features/org/people'

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
  injury: HeartPulse,
  chemical_spill: Droplets,
  security: ShieldAlert,
  occupational_illness: Stethoscope,
  equipment_failure: Wrench,
}

/**
 * How loudly to render a severity.
 *
 * A lookup with an explicit fallback rather than a chain of equality checks: a value the
 * map has not heard of renders as neutral instead of quietly reading as "good", which is
 * how a fatality ended up styled the same as a near miss.
 */
const SEVERITY_KIND: Record<string, StatusKind> = {
  catastrophic: 'critical',
  fatality: 'critical',
  Critical: 'critical',
  environmental_major: 'serious',
  lost_time_injury: 'serious',
  Serious: 'serious',
  restricted_work: 'warning',
  medical_treatment: 'warning',
  Moderate: 'warning',
  Minor: 'good',
  near_miss: 'good',
}

export const severityKind = (s: Incident['severity']): StatusKind =>
  SEVERITY_KIND[s] ?? 'neutral'

/** Stage accent (series tokens — workflow identity, not status). */
export const STAGE_COLOR: Record<IncidentStage, string> = {
  draft: 'var(--s7)',
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

/**
 * People available for assignment and @-mentions, scoped to the workspace in view.
 *
 * Two bugs have lived here. The first was a module constant spanning every company in the
 * fixture set, so Borneo's "assign owner" dropdown offered Kenyalang's site agent. The
 * second was subtler and worse: the fix for the first still read the fixtures, and those
 * are compiled out of a production build - so on a real deployment every picker in the
 * product was empty, and because Owner is required, a corrective action could not be
 * created at all. It looked correct in development, which is why it lasted.
 *
 * The names now come from the workforce register and the workspace's members. See
 * features/org/people.ts for how, and why members are best-effort.
 *
 * Returns an empty array on the first render and fills in when the request lands, which is
 * what every caller already tolerated - `people.map(...)` over nothing renders a select
 * with only its placeholder.
 */
export function usePeople(): string[] {
  const { company, role } = useOrg()
  const companyId = company?.id ?? ''
  const [people, setPeople] = useState<string[]>([])

  useEffect(() => {
    let live = true
    void loadPeople(companyId, role).then((names) => {
      // Guarded because switching workspace unmounts and remounts these dialogs, and a
      // late answer for the previous company would otherwise offer its staff here.
      if (live) setPeople(names)
    })
    return () => { live = false }
  }, [companyId, role])

  return people
}

/** The acting user, as the API's permission checks expect it. */
export function useActor(): Actor {
  const { user } = useAuth()
  const { role, membership } = useOrg()
  return {
    name: user?.name ?? 'Unknown',
    userId: user?.id,
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

/**
 * How serious a severity is, for sorting: higher is worse. Covers the original scale and the
 * enterprise one, and an unknown value sorts below everything rather than above a fatality.
 */
const SEVERITY_WEIGHT: Record<string, number> = {
  catastrophic: 12, fatality: 11,
  Critical: 10, environmental_major: 10,
  Serious: 9, lost_time_injury: 9,
  Moderate: 8, restricted_work: 8, medical_treatment: 8,
  Minor: 7, near_miss: 6,
}
export const severityWeight = (s: Incident['severity']): number => SEVERITY_WEIGHT[s] ?? 0

/**
 * The incident types, in groups - Hick's law.
 *
 * Decision time grows with the number of choices, and for a list nobody has memorised it
 * grows *linearly*: the person reads tile after tile until one fits. The report form showed
 * all seventeen types as one flat grid in storage order ("Near Miss, First Aid Case, Medical
 * Treatment Case, …, Equipment Failure"), so somebody reporting a chemical spill read
 * fourteen tiles to find it - at the moment they are most likely to be shaken.
 *
 * Grouping turns one seventeen-way choice into two small ones: first the kind of event,
 * which anyone can answer at a glance ("was anybody hurt?"), then one of at most seven types
 * inside it. Within each group the commonest come first, so the usual answer is near the
 * top of the place the eye lands.
 *
 * Every type appears exactly once; the test beside this file holds that, because a type
 * missing from here could not be reported at all.
 */
export const INCIDENT_TYPE_GROUPS: { label: string; hint: string; types: IncidentType[] }[] = [
  {
    label: 'Someone was hurt or made ill',
    hint: 'Any injury or illness, however minor',
    types: ['first_aid', 'injury', 'mtc', 'rwc', 'lti', 'occupational_illness', 'fatality'],
  },
  {
    label: 'Nobody was hurt, but could have been',
    hint: 'Near misses and hazards',
    types: ['near_miss', 'unsafe_condition', 'unsafe_act'],
  },
  {
    label: 'Plant, property or environment',
    hint: 'Damage, failures, spills, fires and vehicles',
    types: ['equipment_failure', 'property_damage', 'vehicle', 'chemical_spill', 'fire', 'environmental'],
  },
  {
    label: 'Security',
    hint: 'Theft or intrusion',
    types: ['security'],
  },
]
