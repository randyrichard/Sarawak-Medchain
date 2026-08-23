# PILOT ONBOARDING

Taking one company from "yes, we'll try it" to using SafeOps properly.

Written to be repeatable five to ten times without thinking, because the second pilot should
cost you an hour, not a day.

> **Timing, measured rather than estimated.** Provisioning a company through the platform
> console and accepting the invitation takes under two minutes end to end — that part is
> verified. The rest is the customer's own setup, and how long it takes depends entirely on
> how many sites and people they have.

---

## What SafeOps is, in the words to use

Say this, not a feature list:

> "Every factory already does safety work — inspections, incident reports, corrective
> actions. The work gets done; the information is scattered across WhatsApp, notebooks,
> email and three spreadsheets. So nobody can answer 'has that hazard been fixed yet'
> without calling three people. SafeOps is one place where every incident, action and
> permit has an owner and a date."

## What the pilot includes

| | |
|---|---|
| Duration | 1 month, free |
| Scope | **One site.** Not the whole group |
| Users | 3–8. Enough to be real, small enough to support |
| Modules | Incidents and permits first. Leave training and audits alone initially |
| Cost | Nothing, and no obligation to continue |
| What you get | A list of what would have to change before their team could use it daily |

**Deliberately one site.** A pilot that tries to cover four plants fails for reasons that
have nothing to do with the software.

---

## Before you contact anyone

- [ ] Production deployment is live on a real domain with HTTPS
- [ ] You have signed in yourself and reported one test incident
- [ ] Email delivery works — send yourself an invitation and confirm it arrives
- [ ] A backup has been taken **and restored** at least once
- [ ] You can reach the server over SSH to issue a recovery link if asked

If any of those is unchecked, you are not ready to onboard a company.

---

## Step 1 — Create the company (you, 2 minutes)

Sign in as the platform administrator, go to **SafeOps customers**, click **New customer**.

You need from them beforehand:

| Field | Example | Why |
|---|---|---|
| Company name | Kuching Freshpack Sdn Bhd | Appears on every record and email |
| Industry | Food processing | Context only |
| First site name | Kuching Cold Store | Everything is filed against a site |
| Site city | Kuching | |
| Timezone | Asia/Kuching | Drives every "overdue" calculation |
| Administrator name | Lim Mei Ling | Usually the HSE manager |
| Administrator email | Their **work** address | The invitation goes here |

**Never use your own address as their administrator.** A SafeOps staff account cannot join
a customer workspace — the product refuses it — and that refusal exists because an account
holding both roles sees your entire customer list inside their workspace.

## Step 2 — The invitation (automatic)

Creating the company emails their administrator immediately. If email is not configured the
console shows a link instead — send it to them yourself and say plainly that it expires.

**Invitations last 7 days. Password-reset links last 30 minutes.**

## Step 3 — They accept (them, 2 minutes)

They click the link, enter their name, choose a password. Nobody at SafeOps ever holds a
working credential for their account — worth saying out loud, because it is unusual and it
is the answer to a question their IT department will ask.

## Step 4 — First-day setup (them, 20–40 minutes)

They land on a **Getting started** checklist that ticks itself off as they go:

1. **Add your sites** — beyond the one you created
2. **Invite your team** — HSE officers and supervisors
3. **Report something that happened** — a near miss from last week is ideal
4. **Raise a permit to work** — their next hot work or confined space job

The checklist disappears once all four are done. Nothing is pre-filled: an empty workspace
is honest, and inventing incidents in a safety system would be indefensible.

Sit with them for this if you can. Watching the first twenty minutes teaches you more than
any survey.

## Step 5 — First week

Ask them to do these, in this order:

- [ ] Report every incident and near miss as it happens, however small
- [ ] Take one incident all the way to closed — assessment, investigation, root cause,
      corrective action, verification
- [ ] Raise a permit for a real job and have the right person approve it
- [ ] Open the dashboard each morning and see whether it told them anything they didn't know
- [ ] Generate one report

That last one matters most commercially. "Did the dashboard tell you something you did not
already know?" is the question whose answer decides whether this is worth RM10,000 a month.

---

## Support

Tell them exactly this:

> "If something is broken, message me directly. I will answer within four hours during
> working days. If you cannot sign in, message me and I will issue you a link — do not
> wait, and do not create a second account."

Then honour it. During a pilot your responsiveness is part of the product.

The day-to-day procedures — what to do when they say "I can't sign in", "it logged me out",
"my data is missing" — are in **`PILOT_RUNBOOK.md`**. Read it before day one so you are not
reading it during an incident.

## What you must be able to do on demand

| They say | You do |
|---|---|
| "I can't sign in" | Issue a reset link from Administration → Users, or the CLI |
| "The invitation expired" | Resend it from Administration → Invitations |
| "I deleted something" | Restore from backup (`RESTORE.md`) — never improvise |
| "Is our data safe?" | Show them: their own workspace only, every action audited, daily backups |

---

## What not to do

**Do not demo from the platform account.** It lists every customer on the deployment with
their plan and your revenue figure. Use a customer login, always.

**Do not promise features.** Write the request down, say "that's the kind of thing this
month is for", and move on.

**Do not fix things silently.** If you fix a bug they reported, tell them. Visible
responsiveness is most of what they are evaluating.

**Do not skip the backup drill.** Take one before their first real week, and restore it
once. A backup you have never restored is a hypothesis.
