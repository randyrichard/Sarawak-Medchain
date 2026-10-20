# Working a permit with no signal

A permit to work is signed at the job. On a plant that means a confined space behind a bund,
a flare line, a pump house two hundred metres inside the fence — places with no coverage and
no wifi. This describes what SafeChain does there, and, just as importantly, what it refuses
to do there.

## The rule

**Authority is granted online. What happens under an authority already granted is recorded
wherever the work is.**

That line is the whole design. It is drawn where it is because of what a device cannot know
when it is offline.

An approval is somebody saying the work may start. Given on a phone with no signal, that
phone cannot see that the area authority suspended the permit twenty minutes ago, that a
simultaneous operation was raised on the next flange, or that the nominated gas tester's
certificate lapsed this morning. The crew would enter on an authority the plant has already
withdrawn, and the app would have told them it was fine. That is the failure permits exist to
prevent — and it is the same reasoning that took permits out of browser storage in the first
place (`SERVER_PERMITS` in `web/src/api/client.ts`): a permit board that disagrees with the
plant is worse than no board at all.

A gas reading, a toolbox talk, a man entering a vessel, a tag going onto a valve — those
already happened. The server hearing about them four hours later is a reporting delay.
Refusing to record them is how a site ends up reconstructing a confined-space entry log from
memory at the end of a shift, which is both a worse record and exactly what the paper system
did.

And stopping work is always allowed offline, because suspension is restrictive: accepting it
late can only ever close work down, never open it up. A supervisor who sees something wrong
is never told to go and find signal first.

## What can be recorded offline

| Recorded offline | Why it is safe |
|---|---|
| Gas test | A reading already taken. Filed at the time on the detector. |
| Precaution confirmed | Confirmed by walking up to it and looking. |
| Isolation applied / released | Physical acts carried out under an authority granted earlier. |
| Toolbox talk held, and acknowledged | Held at the job, in front of the work. |
| PPE acknowledged | A person confirming what they are wearing. |
| Person signed in / out of the work area | The occupancy record an emergency response reads. |
| JSA row amended, or a new row added | The walk-down case: the control written at the desk does not match the job, or the hazard in front of the crew is not on the analysis at all. Lands as an amendment — it bumps the permit version. |
| Photographs and documents | Evidence, kept as bytes rather than as a promise about bytes. |
| **Work suspended** | Restrictive. Can only close work down. |
| Permit closed and handed back | A shift ends at the job, not at a desk. |

## What is refused offline

Each refusal says what the person can do instead, and none of them reads like a receipt — a
message that sounded like confirmation would be the worst possible outcome here, because
somebody would believe a permit had been approved.

| Refused offline | Why |
|---|---|
| Submit for review | The reviewers would not see it. |
| Approve / issue | The device cannot check for a suspension, a conflicting job, or a lapsed certificate. |
| Reject | The applicant would not be told. |
| Start work (activate) | Starting means checking the permit is still live. |
| Resume after suspension | Resuming re-opens work; whoever suspended it may know something this device does not. |
| Advance or return the review chain | The next reviewer would not be notified. |
| Request or approve an extension | A queued extension would imply validity the permit does not have. It still lapses at the time printed on it. |

The refusals are enforced on the client, in
`web/src/features/permits/offlineOps.ts` (`ONLINE_ONLY`), and tested as a rule in
`offlineOps.test.ts` so that a screen added later cannot quietly queue an approval. The
endpoints for those operations also simply never accept the offline fields, so a hand-rolled
request cannot route an approval through the offline path either.

## How it works

### The app loads at all — `web/public/sw.js`

Before this, the outbox could hold an incident report that failed to send, but only if the
app was already running. A worker who locked the phone walking to the job and opened it again
at the worksite got the browser's "no internet" page: nothing to queue into, nothing to read,
no permit on the screen.

A service worker now caches the app shell. Navigations are network-first so a deploy is
picked up as soon as there is signal, falling back to the cached shell; hashed assets under
`/assets/` are cache-first because their bytes never change.

**One online visit is enough.** At install the worker reads the asset URLs out of
`index.html` and caches the entry bundle, because registration happens *after* the first page
has already fetched its own scripts — so without that step nothing would have cached them,
and a phone taken offline straight after its first visit would load the shell and then fail
on every chunk. The lazily-loaded page chunks are not precached: they are cached as screens
are visited, and pulling all 109 of them over a site connection before anybody asked for one
would be worse than the problem. A screen never opened on a device is therefore not available
on it offline.

**Two things that cost a working build, both found by driving a real browser rather than by
a test.** A response must be `clone()`d *before* it is returned, not inside the `then` that
writes it to the cache — by then the page has started reading the body and `clone()` throws,
silently, so the fetch succeeds and nothing is ever cached. And cache lookups pass
`ignoreVary`, because the server compresses and so answers `Vary: Accept-Encoding`, while
`Accept-Encoding` is set by the network stack and is absent from the Request a worker sees:
without it every asset request missed a cache it was sitting in. Both bugs are invisible
while the server is up.

**Nothing from the API is ever cached**, for two reasons that both outrank the convenience:

- *Privacy.* Site phones are shared between a shift. API responses carry named workers'
  medical expiry, injury detail and disciplinary context, and a cache keyed by URL has no
  idea who is signed in — so a cached response outlives the session that was allowed to see
  it. The outbox is keyed per user for exactly this reason; a response cache cannot be.
- *Correctness.* See the rule above.

So offline, the app loads, says plainly what it cannot reach, and lets the field record what
happened.

A device that has never loaded the app with a connection gets a plain page explaining that it
needs one first, rather than a browser error that reads as "SafeChain is broken".

`/sw.js` is served `no-store` (`web/nginx.conf.template`). A cached service worker pins a
returning phone to an old deploy's shell logic, and a worker is sticky in a way `index.html`
is not.

### Records survive the walk back — `web/src/lib/fieldOutbox/`

IndexedDB, where the incident outbox used `localStorage`, and the difference is the point:

- `localStorage` holds strings. An incident queued offline kept its text and had to drop its
  photographs — `docs/MOBILE.md` records that hole, where a worker photographed a scene and
  was told the photos were kept when only the filenames were. IndexedDB stores Blobs.
- The quota. `localStorage` is about 5 MB per origin for the whole app; one site photograph
  is 2–4 MB. A single permit's evidence would exhaust it and take the queued incident reports
  with it.

**Incident reports are queued here too**, which is what closed that hole: a report filed in a
yard with no signal now carries the bytes of its photographs, and they are uploaded when the
report lands. `web/src/features/incidents/outbox.ts` is a thin adapter over this store — it
owns only what is specific to a report, which is how one is replayed against the API and the
move of any queue an older build left in `localStorage`. That move happens once per user, on
first read: the old entries are written into the store **before** the old key is cleared, so
an injury report somebody has sitting on a phone survives the upgrade rather than being lost
to it. Each entry keeps its own `clientRef`, so a migration interrupted halfway and run again
overwrites rather than duplicates.

`store.ts` is the storage. `queue.ts` holds the rules — what is retried, what is shown to a
person, in what order — written against a narrow interface so they are testable in CI without
a database. The rules are shared by both queues, so a gas test and an injury report cannot
come to disagree about how long "stuck" takes:

- only transport failures are retried; a 400 means the server looked at the record and
  refused it, and retrying that on a timer hides something that needs a person;
- a 401 is retried, because a session can come back and a supervisor should not lose a
  recorded gas test to a token that expired in a pocket;
- after 48 hours the queue stops retrying on its own and asks a human;
- a refused record is kept, not deleted, and shown as needing attention.

Records are sent oldest-first and sequentially, and for a permit the drain **stops at the
first transport failure** rather than working through the rest. A permit's records are not
independent of each other: they are a sequence on one permit, and the server refuses a record
that arrives before the one it depends on. Incident reports are independent — separate events,
often by separate people — so that queue passes `independent` and every entry gets its
attempt; one report failing is no reason to leave the next injury unsent.

**One drain per user at a time, for the whole tab** (`inFlight` in `queue.ts`). Each caller
already guarded itself against overlapping with itself, and that was not enough: a hook
mounted twice — which React does on purpose in development — holds two separate guards, so
two drains read the same queue and send every record in it twice. The idempotency key covers
most of that, because the server answers the second copy with the first one's result. It does
not cover a **file upload**, which has no key of its own. Found by driving a browser rather
than by a test: a near miss filed offline with one photograph landed as two attachments
155 ms apart. The queued entry also forgets each photo as soon as it lands, so a tab closed
mid-drain does not attach the rest again on the next one.

**One store, two queues, and each feature sees only the kinds it owns** (`queueFor` in
`store.ts`; `PERMIT_OP_KINDS` in `offlineOps.ts`, written so that adding a `PermitOp` without
listing it does not compile). This is not tidiness. `sendPermitOp` has no case for an incident
report, so an unscoped permit drain would hand it to that dispatch, get nothing back, see
nothing thrown, take the report as delivered — and delete it. An unreported injury, removed by
the permit queue. The dispatch now also throws on a kind it does not know, because returning
quietly is what made silent deletion possible.

Each queue is keyed per user, so signing out on a shared site phone cannot expose or send
what the last person recorded.

If IndexedDB is unavailable — a locked-down device, a private window — the queue falls back
to memory and **the UI says so**, because "saved on this device" has to be true to be worth
printing. The report screens say it too: "Report saved" there comes with the warning that it
is held only while the tab stays open, instead of the usual "it is safe to close the app". And
if the store refuses the write outright, the screen says the report was *not* saved and leaves
the draft where it is, because a confirmation would be the worst possible lie to tell about an
injury report.

### A row can be written before the server knows it exists — `web/src/features/permits/localJsaIds.ts`

Everything else recorded offline is a change to something the server already has: a gas test
on a permit, an acknowledgement by a named attendee, a tag on an isolation that exists. A
hazard found at the job is not. The crew gets to the work, finds an unguarded opening or a
line nobody knew was still live, and the row that names it and names its control has to be
created — and then filled in, cell by cell, with no signal between any of it.

Every cell edit on a JSA is addressed by the row's server id, which exists only once the row
does. So the device names the row instead: `jsa-add` carries a `clientId` it generated, the
server stores that name beside the id it generates, and the amendments queued behind the add
address the row by the local name until there is a better answer.

The server does **not** adopt the name as the row's primary key. Ids stay server-generated,
so a device cannot reach into an id space shared by every tenant. What the name buys is an
exact replay: `PermitJsaStep` is unique on `(permitId, clientId)`, and a second copy of the
add is answered with the row the first one created. That replaces a stopgap — the old code
recognised a replayed add by matching its *hazard text*, which is a guess twice over. Two
genuinely different steps of a job are free to name the same hazard, and a row created
offline is usually edited after it was created, so by the time a replay arrives the text on
the server is no longer the text in the queued copy. A JSA with one hazard listed twice reads
as two exposures with two controls, on the document an approver signed.

The translation from local name to server id is kept in `localStorage`, deliberately outside
the outbox. Rewriting the queued amendments as the add drains would cover the ordinary case
— the queue drains oldest-first, so the add always goes before its edits — but not the
one after it: the add lands, its queue entry is gone, the table on screen still shows the row
under the device's name, and the next cell a supervisor corrects is addressed by a name no
queue entry can translate any more. That correction is to a control, and it is not a thing to
lose. An amendment that still cannot be translated at the moment of sending — which means
the add was *refused*, not merely unsent — is itself refused, as a payload no retry will
fix, so it reaches a person with the text still legible.

Two further properties the rest of the system depends on:

- **The permit version is bumped, exactly as it is for a row typed at the desk.** This is
  what makes a late row safe rather than merely convenient: an approver who signed an
  analysis without this hazard has not signed the one with it, the version says so, and the
  timeline says when it changed. A row that arrived quietly on an approved permit would be a
  worse outcome than refusing to record it at all. A *replay* bumps nothing, because nothing
  changed.
- **Sequence stays the sequence of the job.** The position is read inside the transaction,
  and the transaction takes the permit row first — under read-committed, reading inside the
  transaction is not on its own enough, since both snapshots predate either commit. A phone
  draining a row written an hour ago while the permit desk adds one on a laptop is ordinary,
  and two steps sharing a position sort arbitrarily, which puts a control under the wrong
  step. A row from the field lands at the end of the analysis as it stands when it arrives,
  not where the device was showing it: of the steps the permit has, it is the one added last.

The table marks a row that is still only on this device, because the difference matters to
whoever reads the analysis next — the hazard is on the crew's copy and not yet on the one
the permit desk and the approver can see. A row in that state can also be withdrawn, which
is the one undo the field has, and its queued amendments go with it. Once the add has landed
there is no undo: removing the row is a deletion with a timeline entry behind it.

### A record lands once, at the time it was made — `api/src/lib/fieldRecord.ts`

Two problems the client cannot solve.

**The same record arrives twice.** A phone regaining signal with the app open in two tabs
drains the queue twice; a request interrupted mid-flight leaves the device unable to know
whether it landed. A duplicate suspension is harmless. A duplicate gas test is a reading
nobody took. A duplicate entry record puts one man into a confined space twice in the log
whose only job is to say who is in there.

Incidents solved this with a `clientRef` column on `Incident`, which works because an
incident is a row that either exists or does not. Permit records are mostly transitions and
appends on a permit that already exists, so the key is claimed in a table of its own —
`FieldRecord`, unique on `(companyId, clientRef)` — **in the same transaction as the work**.
Claim-then-work would lose a record if the process died in between; work-then-claim would
duplicate it. One transaction has neither failure.

A replay is answered with the permit as it stands. The replay check runs **before the state
checks**, and that ordering is load-bearing: the first copy of a suspension leaves the permit
no longer active, so "only an active permit can be suspended" would refuse the second — and
the queue reads a refusal as a payload the server will never accept, marks it blocked, and
puts a successful stop-work order in front of somebody as a failure.

**The record is about a moment that has passed.** A gas test taken at 09:15 and synced at
14:00 is a 09:15 test. Filed at 14:00 it becomes a re-test that never happened, and the hours
the space went unmonitored vanish — which is the specific thing a confined-space audit looks
for. So `recordedAt` travels with the record and is written to the real column (`testedAt`,
`enteredAt`, `toolboxAckAt`, the timeline's `at`).

The device is the only witness to that time and also the least trustworthy thing in the
system: a site phone's clock is set by whoever holds it. So the claim is validated, never
trusted — refused if it is in the future beyond ten minutes of skew, more than a week old, or
dated before the permit it belongs to, and clamped to now inside the tolerated skew. A
refusal is a 400, so the queue stops the timer and shows the person a device with a wrong
clock. There is a CHECK constraint under all of it, so no other path — a script, a manual
fix, a future endpoint — can write a record claiming to come from the future.

`FieldRecord` carries tenant isolation like every other tenant table, and the key is scoped
to the company: it is generated on a device, and two tenants' devices are free to collide.

## Testing it

```bash
# the rules, no database needed
cd safeops-platform/web && npx vitest run src/lib/fieldOutbox src/features/permits/offlineOps.test.ts \
  src/features/permits/offlineJsa.test.ts src/features/incidents/outbox.test.ts
cd safeops-platform/api && npx vitest run src/lib/fieldRecord.test.ts

# replay and field timestamps, against real Postgres
cd safeops-platform/api && npm run db:start && npx prisma migrate deploy
npx vitest run src/lib/offlinePermit.integration.test.ts
```

By hand, which is the only way to see the shell cache work:

1. `cd safeops-platform/web && npm run build && npm run preview` — the service worker is
   registered in production builds only. In development Vite serves unbundled modules whose
   URLs change on every edit, and a shell cache in front of that serves a developer stale
   code.
2. Open the app, sign in, open a permit.
3. In DevTools → Network, set **Offline**.
4. Reload. The app still loads. (Stopping the preview server entirely is a sharper test
   than DevTools' Offline box, and is how the two bugs above were found.)
5. Record a gas test. It is accepted and listed as waiting on the device.
6. Go back online. It sends, and the reading carries the time you entered it, not the time it
   synced.
7. With Offline set, try **Approve & Issue**. It is refused, with the reason, and nothing is
   queued.
