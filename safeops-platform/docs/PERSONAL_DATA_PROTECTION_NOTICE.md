# Personal Data Protection Notice — SafeChain

> **DRAFT. NOT LEGAL ADVICE. NOT YET REVIEWED BY A LAWYER.**
>
> This was written from the database schema, so the inventory below is accurate to what the
> software actually stores. That is the part a lawyer cannot get from anywhere else, and the
> part most notices get wrong.
>
> What it is not is a compliant notice. Before any of it is shown to a customer it needs:
>
> 1. **Review by a Malaysian lawyer** familiar with the PDPA 2010 as amended in 2024.
> 2. **A checked Bahasa Malaysia translation.** Section 7(3) requires the notice in both
>    Bahasa Malaysia and English; an English-only notice does not satisfy the section. A
>    Malay version now exists and is shown beside the English one in the product, with a
>    language switch that carries a `lang` attribute so a screen reader pronounces it
>    correctly. It was written to be accurate and readable, **not** certified: a translator
>    still has to confirm the two versions say the same thing, and that the PDPA terms of
>    art are the ones the Act uses.
> 3. **The blanks filled in** — every `[SQUARE BRACKET]` below is a fact only you can supply.
> 4. **A decision on the retention periods**, which the software does not currently enforce.
>    See "How long we keep it".
> 5. **TLS actually running** in front of the deployment that serves the notice. See the
>    Security section.
>
> Publishing this as-is would be worse than publishing nothing, because it would be a set of
> statements a customer could hold you to.

---

## Who this notice is from

**[REGISTERED COMPANY NAME]** (`[COMPANY REGISTRATION NUMBER]`), trading as SafeChain, of
**[REGISTERED ADDRESS]**.

Contact for anything in this notice: **[EMAIL]** · **[PHONE]**

---

## The two roles, which are not the same

This distinction runs through everything below and is the thing most notices get wrong.

**For your own account, SafeChain is the data controller.** Your name, work email and sign-in
history exist because you use the product. We decide what to collect and why.

**For your organisation's safety records, SafeChain is a data processor.** Employee records,
incident reports, medical fitness dates, visitor logs — your employer decides what goes in
and why. We hold it on their instructions. If you want your incident record corrected or
removed, your employer decides; we act on what they tell us.

Under the Personal Data Protection (Amendment) Act 2024, obligations fall directly on
processors as well as controllers, so both roles carry duties.

---

## What we collect

Taken from the database schema, not from memory. Everything here is a field the software
actually stores.

### Your SafeChain account — we are the controller

| Data | Why |
|---|---|
| Name, work email, job title, department | Identify you, address you, route notifications |
| Password (stored only as an Argon2id hash, never the password itself) | Authenticate you |
| Sign-in history: time, outcome, IP address, browser and device string | Detect unauthorised access to your account |
| Account state: last sign-in, failed attempt count, lockout time | Lock an account under attack |
| Administrative actions you take, with your name, role, IP and device, and the before and after values of what you changed | The audit trail your employer relies on, and which a regulator may ask for |

### Your organisation's records — your employer is the controller

| Data | Contains |
|---|---|
| **Workforce register** | Name, employee number, position, department, site, work email, phone, hire date |
| **Fitness-to-work data** | Medical certificate expiry date, blood group, medical restriction notes |
| **Incident records** | Who was involved and in what capacity, injury type, body part affected, treatment given, days lost, and written witness statements |
| **Contractor workers** | Name, worker number, **IC or passport number**, position, medical and induction expiry, emergency contact name, phone and relationship |
| **Visitors** | Name, **identity document number**, nationality, employer, phone, email, vehicle registration, who they were visiting, purpose, arrival and departure times |
| **Training records** | Courses, attendance, competency status, certificates and expiry |
| **Permits to work** | Who applied, who authorised, who attended the briefing, signatures |
| **Uploaded files** | Photographs and documents attached to incidents, permits, assets and visitors |

### Sensitive personal data

Three categories above are **sensitive personal data** under section 4 of the PDPA, being
information about physical or mental health:

- medical certificate expiry dates and medical restriction notes, for employees and
  contractor workers;
- blood group;
- injury type, body part, treatment and days lost, recorded on an incident.

Sensitive personal data requires **explicit consent**, not the ordinary consent that covers
the rest. Where SafeChain is the processor, obtaining that consent is your employer's
responsibility — we provide the record of it, we do not obtain it for them.

---

## Where it comes from

- **Directly from you**, when you sign in, report an incident, or complete a form.
- **From your employer**, who creates workforce, contractor and training records, and who
  invited you to the product in the first place.
- **From your device**, automatically: IP address, browser and device string, on sign-in and
  on administrative actions. We do not use advertising trackers or third-party analytics.

---

## Why we process it

1. To provide the product your employer has engaged us for.
2. To keep accounts secure, and to detect and investigate unauthorised access.
3. To maintain the audit trail your employer and their regulator rely on.
4. To send operational messages — an invitation, a password reset, a scheduled report.
5. To meet legal obligations, including those under the Occupational Safety and Health Act
   1994 as amended in 2022, which is generally why your employer keeps these records at all.

We do **not** sell personal data, and we do not use it to train machine-learning models.

---

## Who we share it with

| Who | What | Why |
|---|---|---|
| Your employer, and the colleagues they authorise | Records in their own workspace, subject to the role restrictions below | It is their data |
| **[HOSTING PROVIDER]**, `[COUNTRY]` | Everything, at rest | Servers |
| **[EMAIL PROVIDER, e.g. Resend]** | Recipient name and email address, and the message | Sending invitations, password resets and scheduled reports |
| A regulator, court or law enforcement | Only what is lawfully required | Legal obligation |

We do not share with anyone else. There are no advertising or analytics recipients.

---

## Role restrictions inside your organisation

Not everyone at your employer can see everything, and this is enforced by the software
rather than by policy:

- **Medical detail** — certificate expiry dates, blood group and restriction notes — is
  visible only to Administrators, HSE Managers and Safety Officers. Other roles see whether
  a certificate is valid, expiring or expired, and not the underlying data.
- Users assigned to particular sites see only those sites' records.
- Employees see the incidents they reported themselves, not their colleagues'.
- An anonymous report withholds the reporter's identity from everyone below HSE Manager.

---

## Where it is stored

Hosted at **[HOSTING PROVIDER]** in **[COUNTRY / REGION]**.

> **This must be filled in before publication, and the answer changes what else the notice
> must say.** If the servers are outside Malaysia, section 129 as amended on 1 April 2025
> applies: the transfer needs the destination to have substantially similar law or to ensure
> adequate protection, and the guidelines expect the controller to run a Transfer Impact
> Assessment. Hosting in Malaysia removes that step entirely.

---

## How long we keep it

> **Unresolved, and it must be resolved before publication.**
>
> The software currently enforces one retention rule: how many restore points are kept.
> Audit log retention and closed incident retention are recorded as your organisation's
> stated policy and **nothing deletes anything on that basis**. Records are kept until
> deleted deliberately.
>
> A notice must state a retention period. Stating one the software does not apply is worse
> than stating none, so either the periods below get implemented or this section must
> describe the position honestly. See `docs/PRODUCTION_CHECKLIST.md`.

| Data | Proposed period | Enforced today |
|---|---|---|
| Incident and permit records | `[PERIOD]` — commonly 7 years, and safety records are sometimes needed far longer | **No** |
| Audit trail | `[PERIOD]` | **No** |
| Sign-in history | `[PERIOD]` | **No** |
| Restore points | The number your administrator sets | **Yes** |
| Everything, after your employer ends their agreement | `[PERIOD]` after termination | **No — manual** |

---

## Your rights

Under the PDPA you may:

- **Ask what we hold about you** and receive a copy.
- **Correct it** if it is wrong or incomplete.
- **Withdraw consent**, and ask us to limit or stop processing. Some records cannot simply
  be removed — an incident report is a safety and legal record your employer may be required
  to keep, and removing someone from it would falsify it.
- **Complain** to the Personal Data Protection Commissioner.

**Where the data belongs to your organisation, ask your employer first** — they decide, and
we act on their instruction. Where it is your SafeChain account, contact us at **[EMAIL]** and
we will respond within **[NUMBER]** days.

Your employer can export their entire workspace at any time, from Administration → Backup &
Recovery. It produces a spreadsheet for every register plus every uploaded file, readable
without SafeChain.

---

## Is providing it optional?

Mostly no, and it is worth being plain about that. If your employer uses SafeChain to run its
safety obligations, your workforce record and your fitness-to-work dates are how it does
that. You cannot be inducted onto a site, hold a permit or be recorded as competent without
them. Declining means your employer cannot record you as fit to work — that is a matter
between you and your employer, not between you and us.

---

## Security

- Passwords are stored as Argon2id hashes and are never recoverable, by us or anyone else.
- Sessions use short-lived signed tokens; the long-lived part is an HTTP-only cookie that
  page scripts cannot read.
- The software requires the connection to be encrypted: it refuses to start in production
  unless its public address is HTTPS, because every invitation and password-reset link
  carries a single-use credential in the URL.
- Access is checked on every request, on the server, against your role and your sites.
- Uploaded files are stored under server-generated names, recorded with a SHA-256 digest so
  a changed or corrupted file can be detected, and served only to people authorised for the
  record they belong to.

> **Do not publish this section until TLS is actually terminating in front of the
> deployment.** This previously read "Traffic is encrypted with TLS", stated flatly, while
> the pilot stack was serving plain HTTP with no certificate and no proxy in front of it. A
> privacy notice asserting encryption that is not there is the one kind of inaccuracy that
> is worse than a gap, because a reader acts on it. The wording above describes what the
> software requires, which is true of the software; whether a given deployment does it is a
> property of that deployment and belongs in the checklist at the top of this file.

No system is perfectly secure, and we do not claim otherwise.

---

## If there is a breach

Since 1 June 2025 a data breach must be notified to the Commissioner **within 72 hours** of
becoming aware of it, and to affected individuals where significant harm is likely.

> **[A written breach procedure does not yet exist and must, before the first customer.
> Who decides it is a breach, who notifies, within what time, and how affected people are
> contacted.]**

---

## Data Protection Officer

> **[The 2024 amendment introduced a DPO appointment obligation for qualifying controllers
> and processors. Whether SafeChain qualifies needs a legal view. If one is appointed, their
> contact details belong here.]**

---

## Changes

We will post any change here and tell your organisation's administrator before it takes
effect.

**Version:** DRAFT · **Last updated:** [DATE] · **Effective:** [NOT YET IN EFFECT]
