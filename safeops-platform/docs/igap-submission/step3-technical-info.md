# iG@P Step 3 of 6 : Technical Info

Copy each block into the matching field. Nothing here claims a figure that has not been
measured, a customer that does not exist, or a certification that is not held.

---

## Technology / Product Description *

SafeChain is a workplace safety and health management platform, supplied as a hosted
subscription service and used in a web browser with nothing to install.

One deployment serves many customer organisations, each separated from every other. Within
an organisation the work is structured as projects, the sites that belong to them, and the
safety activity recorded at each site. A user's access can be narrowed to named sites, so a
contractor or a site supervisor sees only their own.

The platform covers incident reporting and investigation, corrective action tracking,
permits to work, asset and equipment inspections, training and competency records,
contractor and visitor control, toolbox meetings, audits and compliance findings, and
consolidated safety reporting. Permissions are enforced at the server across six roles, from
employee through supervisor, safety officer, HSE manager and administrator to chief
executive, so each person sees the work that is theirs to do.

It runs as a containerised stack with a PostgreSQL database behind a TLS terminating proxy,
generates reports as PDF documents on the server, and keeps an audit trail separately from
the records it describes.

---

## Target Application

Organisations that operate more than one site, employ their own workforce alongside
contractors, and carry statutory duties under the Occupational Safety and Health Act 1994
and its regulations. In practice: oil and gas services, construction, marine and
engineering, plantation operations, and manufacturing.

The users within those organisations are the safety officer or HSE executive who runs the
system daily, supervisors who report incidents and request permits, line managers who
approve and verify corrective actions, and the HSE manager or director who needs a defensible
month end position.

The platform suits operations of roughly 50 to 2,000 people across two or more sites. Below
that, paper is usually still workable. Above it, an enterprise system is generally already
in place.

---

## Problem / Issues That It Solved

Safety management in much of Malaysian industry still runs on paper forms, spreadsheets and
shared folders. Five consequences follow, and SafeChain is built to address each.

**Records cannot be retrieved.** An incident is written on a form and filed. Producing a
specific record months later, for an audit, a claim or a regulator, means searching folders
and hoping the copy was filed.

**Corrective actions are invisible.** An action is assigned verbally or by message. Nobody
holds a reliable list of what is overdue, who owns it, or whether the work was verified by
somebody other than the person who did it.

**Permits leave no reliable trail.** A permit to work is issued on a pad. Whether it was
closed, whether its controls were in place, and who approved each stage, survive only if
somebody filed the paper.

**Competencies expire unnoticed.** Certificates lapse quietly, and a worker can be assigned
to work he is no longer certified to perform. The gap is usually found during an audit
rather than before the shift.

**Month end reporting is assembled by hand.** A safety officer spends most of a day
collecting figures from several places. The result cannot be checked afterwards, cannot be
reproduced identically, and describes a position that has already moved.

---

## The Solution (how the product/technology works)

Every record is entered once, into one system, and everything downstream is derived from it
rather than re-entered.

**Structure.** An organisation contains projects; projects contain sites; all safety activity
hangs off a site. A user's membership may name specific sites, which narrows every register
they can see. This is enforced when the server queries, not by hiding things in the browser.

**Incidents.** A report is raised from a phone or a desk, then moves through eight recorded
stages: reported, initial assessment, investigation, root cause analysis, corrective actions,
manager review, verification, closed. Each stage records who acted and when. Evidence and
witnesses attach to the record.

**Corrective actions.** Each carries an owner, a due date and a priority. Overdue items are
surfaced rather than discovered. Completion and verification are deliberately separate: the
person who did the work cannot also sign it off.

**Permits to work.** Hot work, confined space entry, work at height and lifting operations,
each with its approval chain and its controls recorded against the permit. A live board shows
what is open, what is awaiting review, and what expires today.

**Assets and inspections.** Equipment records with scheduled inspections; a failed inspection
raises a corrective action automatically rather than relying on somebody to remember.

**Training and competency.** Certificates with expiry dates, a competency matrix by role, and
visibility of what lapses within 30, 60 and 90 days.

**Reporting.** The monthly safety report is generated on the server from the same records, as
a PDF document, cut to the site's own timezone. It can be produced on a schedule and
delivered by email. Because it is generated rather than assembled, it is reproducible and can
be checked against the underlying records.

**Audit trail.** Actions are logged separately from the records they describe and cannot be
edited from within the product.

---

## Background of the Product/Technology (if any)

SafeChain was designed and written by the founder, Randy Richard, who is studying for a
Diploma in Occupational Safety and Health at Fajar International College in Miri.

MedChain Enterprise was registered on 30 June 2026 for an earlier project, a
medical certificate verification prototype which anchors a cryptographic fingerprint of each
certificate on a public blockchain so an employer can tell a genuine certificate from an
altered one. That prototype is deployed to the Ethereum Sepolia public test network and
remains a demonstrator rather than a commercial service. SafeChain grew out of that work and
is now the business's product; the registered name is unchanged.

The platform is proprietary to MedChain Enterprise and was not developed under any
employment contract, grant or commissioning agreement.

---

## Advantages of the proposed Technology against conventional practice *

Measured against the paper, spreadsheet and shared folder practice it is intended to replace:

**A record can be found.** Any incident, permit, certificate or action is retrievable by
number, site, person or date, instead of by searching folders.

**One record, not copies.** The register, the investigation, the corrective actions and the
monthly report all read the same underlying record, so they cannot disagree with each other.

**Overdue work is surfaced, not discovered.** Open and overdue actions appear on the screen
a manager opens each morning, rather than at the next audit.

**Sign-off integrity is structural.** Verification is a separate act from completion, so an
action cannot be closed on the word of the person who was asked to do it.

**Expiry is a warning, not a finding.** Certificates and inspections raise notice before they
lapse rather than being caught afterwards.

**The month end report is generated, not compiled.** It is produced from the same records on
demand, is reproducible, and can be traced back to the rows behind every figure.

**Access follows the site.** A contractor or a site supervisor sees their own site only,
enforced at the server, which paper filing cannot do at all.

**The trail survives the people.** Who did what and when is logged independently of the
record and cannot be edited from the product, which matters when a file is examined after an
incident.

No claim is made here that SafeChain is cheaper, faster or more complete than any other
commercial safety software. The comparison above is against manual practice.

---

## Limitations of the proposed Technology *

Stated in full, because a reviewer will establish these anyway and the list is short enough
to be honest about.

**No pilot has yet been run.** The platform has not operated at a live site with real users.
Everything demonstrable today runs on invented sample data.

**Not yet hosted in production.** Encryption at rest is a property of the hosting and is not
configured, because the system does not yet run on hosted infrastructure. TLS in transit is
configured.

**No external assessment or certification.** No ISO 27001, no SOC 2, no independent
penetration test, and no assessed statement of compliance with the Personal Data Protection
Act 2010.

**Database level tenant isolation is implemented but not yet active.** Row level security
policies exist in the schema and bind a restricted database login that has not been
configured. Separation at the application layer is active today and is currently the only
line.

**Multi factor sign in is not yet enabled**, pending key generation.

**No integrations.** There is no connection to ERP, maintenance management, access control or
existing permit systems. Application programming interface keys and webhooks are reserved to
a higher plan and are not functional.

**No native mobile application.** The platform is a responsive web application. It installs
to a phone's home screen and runs without a connection once it has been opened with one.

**Offline capture is limited to recording, not authorising.** With no signal the application
records what has happened under a permit already issued: gas test readings, precautions
confirmed, isolations applied and released, toolbox talks and their acknowledgements, PPE
acknowledgements, people signing in and out of the work area, job safety analysis steps
added and amended, photographs and documents, suspension of work, and handback. Each is
filed under the time the field recorded it, not the time it reaches the server, and each is
sent once however many times the device retries.

Issuing authority is not available offline, by design. A permit cannot be submitted,
approved, rejected, activated, resumed or extended without a connection, because the device
cannot verify that the permit is still live, that no conflicting work has been raised on the
same equipment, or that the named people's certificates remain valid. The application refuses
those steps and states the reason rather than queuing them. See `docs/OFFLINE.md`.

**No predictive analytics, artificial intelligence, machine learning or equipment telemetry.**
The platform records and organises what people enter; it does not forecast.

**Single founder business.** Support, development and continuity presently rest on one
person. This is a genuine risk for a customer to weigh, and is addressed in the commercial
discussion rather than disguised.

**English only.** No Bahasa Malaysia interface at present.

---

## Key Achievement(s) to Date *

**A complete and working system, not a prototype.** Thirteen functional areas are built and
usable: incidents, incident board, corrective actions, assets and inspections, permits to
work, visitors, toolbox meetings, training and competency, employees, contractors, HSE
performance, reports, and audits and compliance.

**Publicly demonstrable without an appointment.** A demonstration carrying sample data runs
at safechain.schain.workers.dev and can be opened and used by any reviewer immediately.

**Engineered as a production system.** A six service containerised deployment comprising
database, scheduled worker, backup service, application programming interface, web
application and reverse proxy, on PostgreSQL, with server generated PDF reporting and an
independent audit trail.

**Separation of customer data designed at two levels**, in the application and in the
database schema, rather than relying on application code alone.

**An automated test suite of more than 1,700 tests** across the service and web layers, run
against a real PostgreSQL database rather than mocks.

**An earlier delivered project.** The MedChain medical certificate verification prototype is
deployed to the Ethereum Sepolia public test network.

**Business registered** on 30 June 2026 in Miri, Sarawak.

To be clear about what is not yet an achievement: there are no customers, no completed
pilots, no revenue and no written expressions of interest to date.

---

## Value Creation of Technology / Product

**Tick: Cost Savings and Cost Avoidance.** Leave Resource Addition, New Revenue and
Sustainable Element unticked. See the note at the end of this file for why.

### Value Creation Writeup

SafeChain is intended to create value in two ways, and no figure is claimed for either
because none has been measured.

**Cost savings, through time returned to the safety function.** The month end safety report
is generated rather than assembled by hand, and records are retrieved by search rather than
by looking through files. The hours a safety officer currently spends compiling and searching
are the saving, and they are measurable at a site by timing the same two tasks before and
during a pilot.

**Cost avoidance, through work that does not fall through.** Corrective actions with owners,
due dates and visible overdue status, permits with a recorded approval chain, and
competencies that warn before they lapse, are all controls against the failures that produce
incidents, stoppages, regulatory findings and claims. The value is the cost of what does not
happen, which is why it is described as avoidance rather than saving and why it cannot be
asserted as a number in advance.

We have deliberately not attached a calculation. Any figure produced today would rest on
assumed inputs rather than observed ones. The pilot described in our proposal is designed to
establish both measures at one site, against a baseline taken before deployment, so that any
number we later quote can be traced to something that actually happened.

---

## What is the most relevant key metric this technology can improve *

**Select: Mitigation of HSE Risk**

## Please elaborate on the key metric chosen above *

SafeChain mitigates HSE risk by closing the gaps through which a known hazard goes
unaddressed. It does not predict risk or score it. It removes the ways in which risks that
somebody has already identified are subsequently lost track of.

**Corrective actions cannot quietly fail.** Every action carries a named owner, a due date
and a priority. Overdue items appear on the screens that supervisors, safety officers and
managers open each day, rather than surfacing at the next audit. Completion and verification
are separate acts, so an action cannot be closed on the word of the person who was asked to
do it.

**High risk work is authorised rather than assumed.** Permits for hot work, confined space
entry, work at height and lifting each carry an approval chain and a record of the controls
in place. A live board shows what is open, what awaits review and what expires today, so a
permit cannot lapse unnoticed while the work continues.

**Nobody works uncertified.** Training and competency records give notice before certificates
expire, at 30, 60 and 90 days, instead of the lapse being found during an audit or after an
incident.

**Findings become actions without depending on memory.** A failed equipment inspection or an
audit finding raises a corrective action in the same system, so the distance between
identifying a problem and assigning it to a person is closed automatically.

**An investigation cannot skip its stages.** An incident moves through reported, initial
assessment, investigation, root cause analysis, corrective actions, manager review,
verification and closure, each recorded against a person and a time. A record cannot reach
closure without a root cause and a verified action behind it.

How we propose to measure this during a pilot, taken from the system's own records and
compared against a baseline established before deployment:

- the proportion of corrective actions closed by their due date, and the median age of those
  still open
- the proportion of permits closed correctly against those issued
- the proportion of the workforce holding current mandatory certificates
- the near miss reporting rate, as an indicator of whether reporting rises when reporting is
  made easy

We predict no figure for any of these and we do not claim a reduction in incidents.
Establishing them at one site is the purpose of the pilot.

---

## Notes on the judgement calls

**Why Mitigation of HSE Risk, out of the five options.** It is the only one that describes
what the product is for. *Performance Improvement* is true but vague, and invites a demand for
a productivity figure that has not been measured. *Reliability and Integrity Improvement* belongs
to asset integrity and inspection engineering; SafeChain records inspections but does not
assess the condition of equipment, and claiming that ground would be answering a question
about a discipline the product does not practise. *Immediate Mitigation of Project Schedule*
and *Immediate Avoidance of Facility Shutdown* both turn on the word immediate, and describe
interventions that prevent a specific imminent event. A safety management system reduces the
likelihood of such events over time; it does not avert one on the day. Claiming either would
be the easiest thing in the form to disprove.

**Why only two value creation boxes.** Resource Addition and New Revenue do not apply: the
platform does not add resources to a customer or generate revenue for them. Sustainable
Element is arguable on the basis of removing paper, but it is a thin claim and ticking it
invites a question that cannot be answered substantively. Two defensible boxes read better
than five with one that collapses.

**Why nothing is attached for the value creation calculation.** That field is optional. A
spreadsheet built on invented inputs is worse than no spreadsheet, and a reviewer who tests
the assumptions will find them unsupported. Saying the pilot is designed to produce the
figures is both true and stronger.

**The limitations field is the one worth getting right.** Most applicants write something
evasive there. A specific, complete list signals that everything else in the submission can
be believed, and none of the items above would surprise a technical reviewer who looked at
the system properly.
