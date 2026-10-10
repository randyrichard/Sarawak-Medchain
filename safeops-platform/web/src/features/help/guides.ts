import type { Role } from '@/api/types'
import type { Capability } from '@/features/permissions/permissions'

/**
 * What the Help page says, kept apart from how it looks so it can be checked.
 *
 * Every link here is tested against the app's routes, and every task against the
 * permissions of the role it is written for (guides.test.ts). A guide that sends a new
 * starter to a page their role cannot open is worse than no guide: it is the first thing
 * they try, and it tells them they are doing it wrong.
 *
 * Words in **double asterisks** are the names on the screen - a button, a tab, a menu item -
 * and are shown in bold, so they can be matched against what is in front of you.
 */

export interface Task {
  title: string
  detail: string
  to: string
  /** What the role needs to open `to`. */
  capability: Capability
}

export interface RoleGuide {
  /** One sentence: what this role is for. */
  summary: string
  tasks: Task[]
}

export const ROLE_GUIDE: Record<Role, RoleGuide> = {
  employee: {
    summary: 'You report what you see, and you complete the corrective actions assigned to you.',
    tasks: [
      { title: 'Report a near miss', detail: 'Something that could have hurt someone but did not. Two questions, about thirty seconds.', to: '/near-miss', capability: 'reports:submit' },
      { title: 'Report an incident', detail: 'Someone hurt, something damaged, a spill or a fire. A short form in four steps.', to: '/incidents/new', capability: 'reports:submit' },
      { title: 'Work on your corrective actions', detail: 'Start the work, add a note or photo, then mark it complete. A manager checks it.', to: '/actions', capability: 'actions:view' },
      { title: 'Check the permits near you', detail: 'See what high-risk work is going on before you start your own.', to: '/permits', capability: 'permits:view' },
    ],
  },
  supervisor: {
    summary: 'You run the work on the floor: permits, the daily briefing, and who is on site.',
    tasks: [
      { title: 'Sign the permits waiting for you', detail: 'The first signature in the approval chain, Supervisor review, is yours.', to: '/permits?status=awaiting', capability: 'permits:view' },
      { title: 'Record the toolbox meeting', detail: 'The topic, the hazards talked about, and who attended.', to: '/toolbox', capability: 'toolbox:view' },
      { title: 'Check visitors in and out', detail: 'The live board shows who is on site right now, for a muster or an evacuation.', to: '/visitors', capability: 'visitors:view' },
      { title: 'Chase overdue corrective actions', detail: 'Start with the ones already late on your site.', to: '/actions?bucket=overdue', capability: 'actions:view' },
      { title: 'Report near misses and incidents', detail: 'The same quick forms everyone uses.', to: '/near-miss', capability: 'reports:submit' },
    ],
  },
  safety_officer: {
    summary: 'You run safety day to day: reviewing reports, investigating, and checking the controls work.',
    tasks: [
      { title: 'Review new reports', detail: 'Incidents lists the most serious first. Open one and do the next step shown at the top.', to: '/incidents', capability: 'incidents:view' },
      { title: 'Investigate and raise corrective actions', detail: 'Find the root cause, then give each fix an owner and a due date.', to: '/incidents', capability: 'incidents:manage' },
      { title: 'Sign permits at HSE review', detail: 'Check the hazards, controls and gas tests before you sign.', to: '/permits?status=awaiting', capability: 'permits:view' },
      { title: 'Run inspections', detail: 'Any item that fails becomes a corrective action on its own.', to: '/assets?view=inspections', capability: 'equipment:view' },
      { title: 'Run audits and training sessions', detail: 'Findings become corrective actions; passing a session issues a certificate.', to: '/audits', capability: 'compliance:manage' },
    ],
  },
  hse_manager: {
    summary: 'You own the safety system: the sign-offs, the figures and the compliance record.',
    tasks: [
      { title: 'Start each day on Home', detail: 'What needs attention, most urgent first.', to: '/', capability: 'dashboard:view' },
      { title: 'Verify finished corrective actions', detail: 'Only a manager can sign one off, so the person who did the work never checks their own.', to: '/actions?bucket=verification', capability: 'actions:manage' },
      { title: 'Approve permits', detail: 'You can sign at every stage of the approval chain.', to: '/permits?status=awaiting', capability: 'permits:view' },
      { title: 'Record hours worked each month', detail: 'Injury rates are worked out from hours worked. Without them they cannot be calculated.', to: '/performance', capability: 'analytics:view' },
      { title: 'Plan audits and keep compliance current', detail: 'Legal requirements, documents and audits in one place.', to: '/audits', capability: 'compliance:manage' },
    ],
  },
  admin: {
    summary: 'You set up the workspace and decide who can do what. You can also do everything an HSE manager does.',
    tasks: [
      { title: 'Add your sites', detail: 'Plants, yards and offices. Everything else is filed against a site.', to: '/admin?s=sites', capability: 'settings:manage' },
      { title: 'Invite your team', detail: 'Give each person the role that matches their job. Their menu follows from it.', to: '/admin?s=invitations', capability: 'settings:manage' },
      { title: 'Check the security settings', detail: 'Password rules, two-step sign-in and how long a session lasts.', to: '/admin?s=security', capability: 'settings:manage' },
      { title: 'Start each day on Home', detail: 'What needs attention, most urgent first.', to: '/', capability: 'dashboard:view' },
    ],
  },
  ceo: {
    summary: 'You see the safety picture across the company. You can read everything here and change nothing, apart from reporting what you see.',
    tasks: [
      { title: 'Read Home', detail: 'A one-line verdict, then the eight figures that matter.', to: '/', capability: 'dashboard:view' },
      { title: 'Follow the injury rates', detail: 'Trends over months, and every site compared on the same rates.', to: '/performance', capability: 'analytics:view' },
      { title: 'Read the reports', detail: 'Generated and scheduled reports for the board and for DOSH.', to: '/reports', capability: 'reports:view' },
      { title: 'Sign permits as area authority', detail: 'Some permits need the plant owner\'s signature at the last stage.', to: '/permits?status=awaiting', capability: 'permits:view' },
    ],
  },
}

export interface HowTo {
  id: string
  question: string
  /** Who this is for: the guide is shown only to a role that can do it. */
  capability: Capability
  /** Narrower than the capability, where the server decides by role. */
  forRoles?: Role[]
  to: string
  steps: string[]
  /** Anything a newcomer gets wrong the first time. */
  note?: string
}

export const HOW_TO: HowTo[] = [
  {
    id: 'near-miss',
    question: 'Report a near miss',
    capability: 'reports:submit',
    to: '/near-miss',
    steps: [
      'Open **Report a near miss** in the menu.',
      'Say what you saw, in your own words, and where it was.',
      'If it helps, tap a category and add a photo.',
      'Press **Submit near miss**. An HSE officer reviews every one.',
    ],
    note: 'No signal? The report is kept on your phone and sent as soon as there is a connection.',
  },
  {
    id: 'incident',
    question: 'Report an incident',
    capability: 'reports:submit',
    to: '/incidents/new',
    steps: [
      'Go to **Incidents** and press **Report incident**.',
      'Choose what happened, then fill in the four short steps: **What happened**, **Where & who**, **Details & evidence**, **Review & sign**.',
      'Press **Submit report**. You can follow it under **Incidents**.',
    ],
    note: 'If someone is hurt, get help first. Report afterwards.',
  },
  {
    id: 'action',
    question: 'Complete a corrective action',
    capability: 'actions:view',
    to: '/actions',
    steps: [
      'Open **Corrective actions**, or the notification that told you about it.',
      'Open the action and press **Start work**.',
      'When the work is done, press **Complete…**, say what was done and add a photo if one is asked for.',
      'A manager checks it and presses **Verify & sign off**, or sends it back with a reason.',
    ],
  },
  {
    id: 'permit-request',
    question: 'Request a permit to work',
    capability: 'permits:view',
    to: '/permits',
    steps: [
      'Go to **Permits to work** and press **Request permit**.',
      'Choose the type of work, the site, the place and the times, then press **Create draft**.',
      'In the permit, fill in the hazards, the protective equipment and the people doing the work.',
      'Press **Sign & submit for approval**.',
      'It is signed in turn at **Supervisor review**, **HSE review** and **Area authority**. Work may start only once it is approved.',
    ],
  },
  {
    id: 'permit-approve',
    question: 'Approve a permit',
    capability: 'permits:view',
    // Whoever signs a stage of the chain: STAGE_ROLES in api/src/lib/permitReview.ts.
    forRoles: ['supervisor', 'safety_officer', 'hse_manager', 'admin', 'ceo'],
    to: '/permits?status=awaiting',
    steps: [
      'Go to **Permits to work** and choose **Awaiting approval**.',
      'Open the permit. If it is your turn, a **Sign** button shows in the approval chain.',
      'Check the hazards, the controls and any gas test, then sign - or press **Return to applicant** and say what is missing.',
    ],
  },
  {
    id: 'inspection',
    question: 'Run an inspection',
    capability: 'equipment:view',
    to: '/assets?view=inspections',
    steps: [
      'Go to **Assets & inspections** and open the **Inspections** tab.',
      'Press **Run** beside the inspection that is due.',
      'Answer every item on the checklist and add photos where they help.',
      'Press **Submit inspection**. Every item that failed becomes a corrective action.',
    ],
    note: 'No **Run** button? The inspection is assigned to someone else. A safety officer or manager can run any of them.',
  },
  {
    id: 'toolbox',
    question: 'Record a toolbox meeting',
    capability: 'toolbox:view',
    to: '/toolbox',
    steps: [
      'Go to **Toolbox meetings** and press **Record meeting**.',
      'Fill in the site, when it was held, who led it and the topic.',
      'Add the hazards and controls you talked about, and how many people came from each organisation.',
      'Press **Record meeting** to save it.',
    ],
  },
  {
    id: 'visitor',
    question: 'Check a visitor in',
    capability: 'visitors:view',
    to: '/visitors',
    steps: [
      'Go to **Visitors** and press **Register visitor**. Fill in their details and press **Pre-register**.',
      'When they arrive, open them and press **Check in**. The site rules and the blacklist are checked at that moment.',
      'When they leave, press **Check out**, so the live board stays right for an emergency.',
    ],
  },
  {
    id: 'training',
    question: 'Run a training session',
    capability: 'training:view',
    to: '/training?view=sessions',
    steps: [
      'Go to **Training & competency** and press **New session**.',
      'Choose the course, date and trainer, add the people attending, and press **Schedule session**.',
      'On the day, open **Sessions** and press **Run**. Mark who attended and who passed.',
      'Press **Complete session & issue certificates**. Expiry reminders are sent on their own.',
    ],
  },
  {
    id: 'audit',
    question: 'Plan and run an audit',
    capability: 'compliance:manage',
    to: '/audits',
    steps: [
      'Go to **Audits & compliance** and press **Plan audit**. Choose the checklist, site and lead auditor, then press **Create audit**.',
      'On the day, open the audit and press **Start audit**, then **Run checklist**.',
      'Answer every item. A failed item asks for details and becomes a finding with its own corrective action.',
      'Press **Submit audit**. The audit can be closed once every finding\'s action is verified.',
    ],
  },
  {
    id: 'investigate',
    question: 'Investigate an incident',
    capability: 'incidents:manage',
    to: '/incidents',
    steps: [
      'Open the incident from **Incidents**.',
      'The card at the top says what the next step is and who can do it. Follow it.',
      'An incident moves through **Initial Assessment**, **Investigation**, **Root Cause Analysis**, **Corrective Actions**, **Manager Review** and **Verification** to **Closed**.',
      'Raise corrective actions at the root cause stage; the incident cannot close until each one is verified.',
    ],
  },
]

export interface Term {
  term: string
  meaning: string
}

/** The guides a role can follow. */
export const howTosFor = (role: Role, allowed: (c: Capability) => boolean) =>
  HOW_TO.filter((h) => allowed(h.capability) && (!h.forRoles || h.forRoles.includes(role)))

/** Alphabetical. */
export const GLOSSARY: Term[] = [
  { term: 'Area authority', meaning: 'The person in charge of the plant or area where permit work happens. Theirs is the last signature before work can start.' },
  { term: 'Audit', meaning: 'A planned check, against a checklist, that a site follows its safety rules. What it finds becomes findings.' },
  { term: 'Corrective action', meaning: 'A task that fixes the cause of a problem. It has an owner and a due date, and it stays open until a manager verifies it.' },
  { term: 'DOSH', meaning: 'The Department of Occupational Safety and Health (JKKP), which Malaysian employers report serious accidents and annual figures to.' },
  { term: 'Finding', meaning: 'Something an audit found wrong. Each finding has a corrective action.' },
  { term: 'Gas test', meaning: 'A reading of oxygen and flammable or toxic gas, taken before work in a confined space or hot work. Unsafe readings stop the permit.' },
  { term: 'HSE', meaning: 'Health, safety and environment.' },
  { term: 'Incident', meaning: 'Something that went wrong: an injury, ill health, damage, a spill or a fire.' },
  { term: 'Inspection', meaning: 'A regular check of a piece of equipment against its checklist. A failed item becomes a corrective action.' },
  { term: 'Lost time injury (LTI)', meaning: 'An injury that keeps someone off work after the day it happened.' },
  { term: 'LTI frequency rate', meaning: 'Lost time injuries for every million hours worked. Comparing rates, not counts, is fair between small and large sites.' },
  { term: 'Near miss', meaning: 'Something that could have hurt someone or caused damage, but did not. Reporting them is how the next accident is prevented.' },
  { term: 'Permit to work', meaning: 'Written permission for high-risk work, such as hot work, work at height or entering a confined space. It must be approved before work starts and closed when the area is handed back.' },
  { term: 'PPE', meaning: 'Personal protective equipment: helmets, gloves, harnesses, respirators and so on.' },
  { term: 'Root cause', meaning: 'The underlying reason something happened, found by asking "why?" until there is a cause that can be fixed. The 5-Why method asks it five times.' },
  { term: 'Severity rate', meaning: 'Days lost to injury for every million hours worked: how serious the injuries were, not just how many.' },
  { term: 'Site', meaning: 'A place where work happens. Every record belongs to one, and the site picker at the top of each page narrows what you see.' },
  { term: 'Toolbox meeting', meaning: 'A short safety briefing before work, usually at the start of a shift, about the hazards of the day.' },
  { term: 'TRIR', meaning: 'Total recordable injury rate: injuries needing more than first aid, for every 200,000 hours worked (about 100 people for a year).' },
  { term: 'Verification', meaning: 'A manager checking that a corrective action really fixed the problem before it is closed.' },
]
