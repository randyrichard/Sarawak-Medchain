import type {
  ActivityEvent, AppNotification, Company, Department, Employee, Site, Team, User,
} from '../types'

// Two companies so the company switcher is real. Borneo Industrial Group is the
// primary demo tenant; Kenyalang Construction proves cross-tenant boundaries.

export const COMPANIES: Company[] = [
  { id: 'big', name: 'Borneo Industrial Group', industry: 'Diversified Industrial', plan: 'enterprise', logoInitials: 'BI' },
  { id: 'kcs', name: 'Kenyalang Construction Sdn Bhd', industry: 'Construction', plan: 'standard', logoInitials: 'KC' },
]

export const SITES: Site[] = [
  { id: 'kch', companyId: 'big', name: 'Kuching Assembly Plant', short: 'Kuching', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 1240 },
  { id: 'btu', companyId: 'big', name: 'Bintulu LNG Terminal', short: 'Bintulu', city: 'Bintulu', timezone: 'Asia/Kuching', headcount: 860 },
  { id: 'mri', companyId: 'big', name: 'Miri Fabrication Yard', short: 'Miri', city: 'Miri', timezone: 'Asia/Kuching', headcount: 620 },
  { id: 'sbu', companyId: 'big', name: 'Sibu Logistics Hub', short: 'Sibu', city: 'Sibu', timezone: 'Asia/Kuching', headcount: 430 },
  { id: 'twu', companyId: 'big', name: 'Tawau Plantation Estate', short: 'Tawau', city: 'Tawau', timezone: 'Asia/Kuching', headcount: 980 },
  { id: 'sen', companyId: 'big', name: 'Senari Warehouse Complex', short: 'Senari', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 310 },
  { id: 'pjy', companyId: 'kcs', name: 'Petra Jaya Township Project', short: 'Petra Jaya', city: 'Kuching', timezone: 'Asia/Kuching', headcount: 480 },
  { id: 'smh', companyId: 'kcs', name: 'Samalaju Plant Expansion', short: 'Samalaju', city: 'Bintulu', timezone: 'Asia/Kuching', headcount: 350 },
]

export const DEPARTMENTS: Department[] = [
  { id: 'kch-prod', siteId: 'kch', name: 'Production' },
  { id: 'kch-mnt', siteId: 'kch', name: 'Maintenance' },
  { id: 'kch-whs', siteId: 'kch', name: 'Warehouse & Stores' },
  { id: 'btu-ops', siteId: 'btu', name: 'Field Operations' },
  { id: 'btu-mnt', siteId: 'btu', name: 'Maintenance' },
  { id: 'btu-hse', siteId: 'btu', name: 'HSE' },
  { id: 'mri-fab', siteId: 'mri', name: 'Fabrication' },
  { id: 'mri-ctr', siteId: 'mri', name: 'Contractors' },
  { id: 'sbu-log', siteId: 'sbu', name: 'Logistics & Transport' },
  { id: 'twu-fld', siteId: 'twu', name: 'Field Operations' },
  { id: 'twu-mil', siteId: 'twu', name: 'Mill' },
  { id: 'sen-whs', siteId: 'sen', name: 'Warehouse' },
  { id: 'pjy-civ', siteId: 'pjy', name: 'Civil Works' },
  { id: 'smh-mep', siteId: 'smh', name: 'M&E Installation' },
]

export const TEAMS: Team[] = [
  { id: 't1', departmentId: 'kch-prod', name: 'Line 1 (Day)', lead: 'Sarah Wong' },
  { id: 't2', departmentId: 'kch-prod', name: 'Line 2 (Night)', lead: 'Jason Ngu' },
  { id: 't3', departmentId: 'kch-mnt', name: 'Mechanical', lead: 'Ganesh Pillai' },
  { id: 't4', departmentId: 'btu-ops', name: 'Jetty & Loading', lead: 'Rashid Karim' },
  { id: 't5', departmentId: 'btu-mnt', name: 'Rotating Equipment', lead: 'Faizal Omar' },
  { id: 't6', departmentId: 'mri-ctr', name: 'Scaffolding Crew A', lead: 'Vincent Chai' },
  { id: 't7', departmentId: 'twu-fld', name: 'Harvest Block 12–16', lead: 'Dayang Nurul' },
  { id: 't8', departmentId: 'sen-whs', name: 'Inbound Shift', lead: 'Grace Lim' },
]

export const EMPLOYEES: Employee[] = [
  { id: 'e01', companyId: 'big', siteId: 'kch', departmentId: 'kch-prod', teamId: 't1', name: 'Sarah Wong', position: 'Production Supervisor' },
  { id: 'e02', companyId: 'big', siteId: 'kch', departmentId: 'kch-prod', teamId: 't2', name: 'Jason Ngu', position: 'Shift Supervisor' },
  { id: 'e03', companyId: 'big', siteId: 'kch', departmentId: 'kch-mnt', teamId: 't3', name: 'Ganesh Pillai', position: 'Maintenance Supervisor' },
  { id: 'e04', companyId: 'big', siteId: 'btu', departmentId: 'btu-ops', teamId: 't4', name: 'Rashid Karim', position: 'Loading Master' },
  { id: 'e05', companyId: 'big', siteId: 'btu', departmentId: 'btu-mnt', teamId: 't5', name: 'Faizal Omar', position: 'Rotating Equipment Engineer' },
  { id: 'e06', companyId: 'big', siteId: 'btu', departmentId: 'btu-hse', name: 'Amirul Hassan', position: 'Site Safety Officer' },
  { id: 'e07', companyId: 'big', siteId: 'mri', departmentId: 'mri-ctr', teamId: 't6', name: 'Vincent Chai', position: 'Contracts HSE Coordinator' },
  { id: 'e08', companyId: 'big', siteId: 'twu', departmentId: 'twu-fld', teamId: 't7', name: 'Dayang Nurul', position: 'Estate Safety Officer' },
  { id: 'e09', companyId: 'big', siteId: 'sen', departmentId: 'sen-whs', teamId: 't8', name: 'Grace Lim', position: 'Warehouse Safety Officer' },
  { id: 'e10', companyId: 'big', siteId: 'kch', departmentId: 'kch-whs', name: 'Melissa Bong', position: 'Store Keeper' },
  { id: 'e11', companyId: 'kcs', siteId: 'pjy', departmentId: 'pjy-civ', name: 'Azlan Mahmud', position: 'Site Agent' },
  { id: 'e12', companyId: 'kcs', siteId: 'smh', departmentId: 'smh-mep', name: 'Lau Tze Ming', position: 'M&E Supervisor' },
]

// Demo users — one per role. All share the demo password (see mock client).
export const USERS: (User & { password: string })[] = [
  {
    id: 'u-ceo', email: 'ceo@demo.safeops.app', name: 'Faridah Abdullah', title: 'Group Managing Director',
    password: 'SafeOps#2026',
    memberships: [
      { companyId: 'big', role: 'ceo', siteIds: [] },
      { companyId: 'kcs', role: 'ceo', siteIds: [] },
    ],
  },
  {
    id: 'u-admin', email: 'admin@demo.safeops.app', name: 'Randy Richard', title: 'Platform Administrator',
    password: 'SafeOps#2026',
    memberships: [
      { companyId: 'big', role: 'admin', siteIds: [] },
      { companyId: 'kcs', role: 'admin', siteIds: [] },
    ],
  },
  {
    id: 'u-hse', email: 'hse@demo.safeops.app', name: 'Marcus Tan', title: 'Group HSE Manager',
    password: 'SafeOps#2026',
    memberships: [{ companyId: 'big', role: 'hse_manager', siteIds: [] }],
  },
  {
    id: 'u-so', email: 'officer@demo.safeops.app', name: 'Amirul Hassan', title: 'Site Safety Officer — Bintulu',
    password: 'SafeOps#2026',
    memberships: [{ companyId: 'big', role: 'safety_officer', siteIds: ['btu'] }],
  },
  {
    id: 'u-sup', email: 'supervisor@demo.safeops.app', name: 'Ganesh Pillai', title: 'Maintenance Supervisor — Kuching',
    password: 'SafeOps#2026',
    memberships: [{ companyId: 'big', role: 'supervisor', siteIds: ['kch'] }],
  },
  {
    id: 'u-emp', email: 'employee@demo.safeops.app', name: 'Melissa Bong', title: 'Store Keeper — Kuching',
    password: 'SafeOps#2026',
    memberships: [{ companyId: 'big', role: 'employee', siteIds: ['kch'] }],
  },
]

const now = Date.now()
const iso = (minAgo: number) => new Date(now - minAgo * 60000).toISOString()

export const NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', kind: 'incident', title: 'Critical incident reported at Bintulu', detail: 'Hydrocarbon leak at loading arm 3 — investigation not yet assigned.', createdAt: iso(42), readAt: null },
  { id: 'n2', kind: 'action', title: 'Corrective action overdue: CA-440', detail: 'Alarm-shelving audit is 4 days late. Escalated to site manager.', createdAt: iso(60 * 3), readAt: null },
  { id: 'n3', kind: 'audit', title: 'CIMAH audit in 38 days', detail: '3 major findings still open at Bintulu LNG Terminal.', createdAt: iso(60 * 8), readAt: null },
  { id: 'n4', kind: 'action', title: 'Verification requested: CA-436', detail: 'Tool-lanyard checks marked complete — evidence awaiting your review.', createdAt: iso(60 * 26), readAt: iso(60 * 20) },
  { id: 'n5', kind: 'system', title: 'Weekly digest is ready', detail: 'Your safety summary for week 28 covering 6 sites.', createdAt: iso(60 * 49), readAt: iso(60 * 44) },
]

export const ACTIVITY: ActivityEvent[] = [
  { id: 'a1', actor: 'Amirul Hassan', verb: 'promoted report to incident', target: 'INC-2607 · Hydrocarbon leak at loading arm 3', at: iso(38) },
  { id: 'a2', actor: 'Grace Lim', verb: 'completed action', target: 'CA-438 · Reinstate pedestrian barriers', at: iso(60 * 2) },
  { id: 'a3', actor: 'Marcus Tan', verb: 'approved RCA for', target: 'INC-2604 · Dropped scaffold clamp', at: iso(60 * 5) },
  { id: 'a4', actor: 'Vincent Chai', verb: 'uploaded evidence to', target: 'CA-428 · Contractor CSE refresher', at: iso(60 * 7) },
  { id: 'a5', actor: 'Dayang Nurul', verb: 'raised corrective action', target: 'CA-437 · Mobile hydration stations', at: iso(60 * 22) },
  { id: 'a6', actor: 'System', verb: 'escalated overdue action to', target: 'Site Manager — Bintulu (CA-440)', at: iso(60 * 26) },
]
