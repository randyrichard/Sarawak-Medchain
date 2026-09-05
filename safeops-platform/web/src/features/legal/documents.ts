/**
 * The customer-facing text of the privacy notice and terms.
 *
 * A condensed reading version of `docs/PERSONAL_DATA_PROTECTION_NOTICE.md` and
 * `docs/TERMS_OF_SERVICE.md`, which remain the source of truth and hold the parts still to
 * be settled. Kept in the bundle rather than fetched so the page renders on a cold load with
 * no API — the state somebody following a link out of an invitation email is in.
 *
 * `draft: true` puts a banner on the page saying it is not in force. It stays until a lawyer
 * has reviewed the text and the placeholders in the source documents are filled in. Removing
 * the flag is the act of publishing, so it should be a deliberate decision by somebody who
 * knows that.
 */

export interface LegalSection {
  heading: string
  body: string[]
  list?: string[]
}

export interface LegalDocument {
  title: string
  version: string
  updated: string
  draft: boolean
  sourceFile: string
  sections: LegalSection[]
}

export const PRIVACY_NOTICE: LegalDocument = {
  title: 'Personal Data Protection Notice',
  version: 'Draft',
  updated: 'Not yet published',
  draft: true,
  sourceFile: 'PERSONAL_DATA_PROTECTION_NOTICE.md',
  sections: [
    {
      heading: 'Two different roles',
      body: [
        'For your SafeOps account — your name, work email and sign-in history — SafeOps is the data controller. We decide what to collect and why, because it exists so you can use the product.',
        'For your organisation’s safety records — employee details, incidents, medical fitness dates, visitor logs — your employer is the controller and SafeOps is the processor. They decide what goes in and why; we hold it on their instructions. If you want an incident record corrected, your employer decides.',
      ],
    },
    {
      heading: 'What we hold about you',
      body: ['Your account:'],
      list: [
        'Name, work email, job title and department',
        'Your password, stored only as an Argon2id hash — never the password itself',
        'Sign-in history: time, outcome, IP address, browser and device',
        'Administrative actions you take, with the values you changed',
      ],
    },
    {
      heading: 'What your employer holds in SafeOps',
      body: ['Depending on your role at their organisation, this may include:'],
      list: [
        'Workforce record: employee number, position, department, site, contact details, hire date',
        'Fitness-to-work: medical certificate expiry, blood group, medical restriction notes',
        'Incident records: injury type, body part, treatment, days lost and written statements',
        'Contractor workers: IC or passport number, emergency contact, medical and induction expiry',
        'Visitors: identity document number, nationality, vehicle registration, who they visited',
        'Training, competency and certificates; permits you applied for, authorised or attended',
        'Photographs and documents uploaded against any of the above',
      ],
    },
    {
      heading: 'Health information',
      body: [
        'Medical certificate expiry dates, medical restriction notes, blood group, and the injury details recorded on an incident are sensitive personal data under the Personal Data Protection Act 2010. Sensitive personal data requires explicit consent rather than ordinary consent.',
        'Where SafeOps is the processor, obtaining that consent is your employer’s responsibility. We hold the record of it; we do not obtain it for them.',
      ],
    },
    {
      heading: 'Who can see it inside your organisation',
      body: ['Not everyone, and this is enforced by the software rather than by policy:'],
      list: [
        'Medical detail is visible only to Administrators, HSE Managers and Safety Officers. Other roles see whether a certificate is valid, expiring or expired — not the underlying data',
        'People assigned to particular sites see only those sites’ records',
        'Employees see the incidents they reported themselves, not their colleagues’',
        'An anonymous report withholds the reporter’s identity from everyone below HSE Manager',
      ],
    },
    {
      heading: 'Who else it goes to',
      body: [
        'Your employer and the colleagues they authorise. Our hosting provider, which stores it. Our email provider, which receives a recipient’s name and address in order to send an invitation, a password reset or a scheduled report. A regulator, court or law enforcement where lawfully required.',
        'We do not sell personal data, we do not use it to train machine-learning models, and there are no advertising or analytics recipients.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'You may ask what we hold about you and receive a copy, ask us to correct it, withdraw consent, or complain to the Personal Data Protection Commissioner.',
        'Where the data belongs to your organisation, ask your employer first — they decide and we act on their instruction. Some records cannot simply be removed: an incident report is a safety and legal record your employer may be required to keep, and removing someone from it would falsify it.',
        'Your employer can export their entire workspace at any time, as spreadsheets plus every uploaded file, readable without SafeOps.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'Passwords are stored as Argon2id hashes and are not recoverable by anyone, including us. Sessions use short-lived signed tokens, with the long-lived part in a cookie page scripts cannot read. Traffic is encrypted with TLS. Access is checked on the server on every request, against your role and your sites. Uploaded files are stored under server-generated names and served only to people authorised for the record they belong to.',
        'No system is perfectly secure and we do not claim otherwise.',
      ],
    },
    {
      heading: 'Still to be settled',
      body: [
        'Retention periods, the hosting location, the breach notification procedure and whether a Data Protection Officer is required are recorded in the source document and are not yet decided. They must be, before this notice is published — a stated retention period the software does not apply would be worse than none.',
      ],
    },
  ],
}

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Terms of Service',
  version: 'Draft',
  updated: 'Not yet published',
  draft: true,
  sourceFile: 'TERMS_OF_SERVICE.md',
  sections: [
    {
      heading: 'What the service is',
      body: [
        'SafeOps is a hosted health-and-safety management system: incident reporting and investigation, permits to work, corrective actions, equipment and inspections, contractor and visitor management, training records and reporting.',
        'It is software for keeping records. It is not safety advice and it is not a substitute for a competent safety professional. It does not tell you whether work is safe. Whether to issue a permit, whether a worker is fit, and whether a site can operate remain your decisions.',
      ],
    },
    {
      heading: 'Pilot',
      body: [
        'Where you are using SafeOps under a free pilot: it is free, no payment is due, either side may end it at any time, and you may export everything at any point during or after. Nothing in a pilot is a commitment by either side to continue.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'Your administrator controls who has access and what they can do, and is responsible for removing people who should no longer have it.',
        'Do not share credentials between people. The audit trail records who did what, and it is only as truthful as the assumption that one account is one person — which matters to you more than it does to us.',
      ],
    },
    {
      heading: 'Your data is yours',
      body: [
        'We claim no ownership of anything you put into SafeOps. You can export your entire workspace at any time without asking us — a spreadsheet for every register plus every uploaded file, readable in Excel with no SafeOps account.',
        'We do not sell it and we do not use it to train machine-learning models.',
      ],
    },
    {
      heading: 'Backups, and what they do not cover',
      body: [
        'We take a nightly database backup and a copy of uploaded files, kept off the server they protect. A backup is a recovery mechanism, not a guarantee against loss: up to a day of work could be lost in a total failure, and recovery time is a target that has not yet been measured on a live deployment.',
        'The in-product restore point is an undo button for a bad import. It does not capture incident timelines, permit precaution checklists, gas tests, isolations, signatures or attachments, and it is stored inside the database it protects. It is not disaster recovery, and the product says so where the button is.',
        'Keep your own export. You can produce one in a click, and it is the only copy entirely within your control.',
      ],
    },
    {
      heading: 'Limits',
      body: [
        'SafeOps records safety decisions; it does not make them. If a permit is issued that should not have been, that was a decision a person made.',
        'The full liability, indemnity and governing-law terms are in the source document and are not yet settled.',
      ],
    },
  ],
}
