# PILOT PRICING NOTES

**The prices here are hypotheses and should not be quoted to a customer yet.** The pilot
exists to replace them with evidence. Until at least three companies have used SafeChain for
a month and answered "what would you pay?", every number on this page is a guess.

The *shape* of the offer, however, is now real — see below.

---

## What the product actually enforces

Two plans, and the difference between them is enforced in code rather than described in a
sales sentence. `api/src/lib/planCatalog.ts` is the only place any of it is written down.

| | Standard — RM10,000/mo | Premium — RM15,000/mo |
|---|---|---|
| Active sites | unlimited | unlimited |
| Every HSE module, every user, scheduled report delivery | yes | yes |
| API keys and webhooks | — | reserved, **but not working yet** |

**Quote Standard. There is nothing to sell Premium on yet.** Standard used to cap at three
sites, which contradicted the customer this pricing is aimed at (500–2,000 people across
two or more sites): the RM10,000 figure was one most of them could not actually buy. The
cap is gone. The site-allowance machinery stays, tested, so a cap is one number in
`planCatalog.ts` if the pilot argues for one.

That leaves API keys and webhooks as Premium's only difference, and the capability behind
them is unfinished: nothing authenticates an issued `sk_live_` key, and no webhook has ever
left the server — `testWebhook` records a success without making a request, on purpose,
because firing at an operator-supplied URL from inside the network is an SSRF primitive.
Quoting either as a Premium benefit today would be selling something that does not exist.
The gate is kept because the line is in the right place and moving it later, once
customers sit on both sides, is the expensive version.

Both axes come from the reasoning further down this page: sites drive value and support
load more than headcount does, and integrations are the work that does not scale. Email
delivery is deliberately *not* an axis — it costs almost nothing and removes manual work
on both sides, so every tier gets it.

Three rules the implementation holds to, and they matter more than the numbers:

1. **Limits apply when something is created, never when something is read.** A workspace
   over its allowance keeps every site, key and record it has, and keeps them visible. A
   safety system that hides incident history over a billing state has done something far
   worse than fail to collect.
2. **Turning something off is never gated.** Deactivating a site or revoking a key is how a
   customer gets back under a limit.
3. **Legacy and unrecognised plans get everything.** Companies that predate plans carry
   `enterprise`; a plan key somebody typed by hand resolves to the same. A bookkeeping
   mistake must not become that customer's outage.

Changing what is on offer means editing that one file. It should not mean editing anything
else.

## What is still not implemented

**There is no billing.** No payment, no invoice, no self-serve upgrade, no pricing page
anywhere in the product. The plan is set by you in the platform console when you provision
a company, and changed by you through the API. `subscriptionStatus` and `billingReference`
exist on the company row so a payment provider added later has somewhere to write, and
nothing reads them.

Building billing before knowing the price would mean building it twice.

---

## A three-tier shape to test against the two that exist

Not what is built. Standard and Premium above are the two the product enforces today; this
is the shape worth *asking pilot customers about*, because a three-tier ladder is easier to
sell against and the middle of it is roughly where Standard sits now.

### Starter
One site. A single HSE team. Incidents, permits, corrective actions, basic reporting.
Email support.

**Fits:** a 200–500 person manufacturer with one plant and one HSE manager.

### Enterprise
Multiple sites. Full module set — training, audits, contractors, visitors, equipment.
Scheduled reporting. Priority support with a response commitment.

**Fits:** 500–2,000 employees across two or more sites.

### Custom
Everything above, plus integrations, data migration, custom reporting, onboarding
delivered on site, and a named contact.

**Fits:** a group that has already tried an enterprise suite and found it too slow.

---

## Working assumption, to be tested

The figure in mind is **RM10,000–RM15,000 per month**, varying with:

- number of employees
- number of sites
- which modules
- support level and response time
- reporting and integration requirements
- how much onboarding you deliver in person

**This is unvalidated.** No company has been asked to pay it. Do not present it as a price
list, and do not tell a prospect "others pay this" — no one does.

## What has to be true before charging it

| Question | How the pilot answers it |
|---|---|
| Does anyone use it unprompted? | Weekly login and reporting counts |
| Does it replace manual work? | "What are you still doing on paper?" |
| Would going back feel worse? | Final review, question 15 |
| Does management look at it? | "Did anyone ask to see anything from it?" |
| What can a site justify? | Ask them for a number before naming yours |

If the honest answer to the first is no, the price is zero however good the software is.

---

## Things that will change the number

**Onboarding is real work.** Provisioning takes two minutes; getting a customer's sites,
people and history in takes days. That is either bundled and priced in, or a separate
one-off fee. Decide before the second customer.

**Support response is part of the product.** A four-hour response commitment is a cost, and
it is also one of the few things a small vendor can offer that a global suite cannot.

**Per-site pricing is probably the honest axis.** Sites drive both the value and your
support load far more than headcount does.

**Email delivery costs almost nothing** and removes a large part of your manual work. It
should be standard on every tier, not an upsell.

---

## What to do with this file after the pilot

Replace every heading here with what customers actually said. Specifically:

1. The price each pilot named, unprompted
2. What they said they were replacing
3. What they said would stop them renewing
4. Whether anyone outside HSE used it

Then write the real pricing page, once, from evidence.
