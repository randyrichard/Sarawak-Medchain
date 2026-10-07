# Browser compatibility

What has actually been opened in a browser, and what has not. Three markings only:

- **Verified** — executed here, with the result recorded.
- **Cannot verify locally** — the browser is not available on this machine.
- **Requires customer device** — needs hardware or an OS this machine does not have.

Nothing is marked Verified on the basis of "it uses standard APIs".

## What was available

One engine: the in-app Chromium browser.

```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.x
```

Chromium-family, so results transfer to Chrome and Edge with reasonable confidence and to
Firefox and Safari with none.

## Desktop

| Browser | Status | Evidence |
|---|---|---|
| **Chromium (this engine)** | **Verified** | Every module opened and driven: incident lifecycle to Closed, permit lifecycle including both refusals and auto-suspend, inspection with an auto-raised defect, audit close gate, training, notifications, tenant switching. Console clean on a fresh load |
| **Chrome** | Cannot verify locally | Not installed. Same engine family as the above; the risk is low but it is untested |
| **Edge** | Cannot verify locally | Not installed. Chromium-based; low risk, untested |
| **Firefox** | Cannot verify locally | Not installed. **Different engine (Gecko).** Moderate risk — see below |
| **Safari (macOS)** | Requires customer device | No macOS here. **Different engine (WebKit).** Highest risk — see below |

## Mobile

| Browser | Status | Evidence |
|---|---|---|
| **Viewport 375×812 (mobile)** | **Verified** | `/incidents` at 375 px: no horizontal overflow, `scrollWidth == clientWidth == 375`, no element extends past the viewport, 111 rows render |
| **Viewport 768×1024 (tablet)** | **Verified** | No horizontal overflow |
| **Mobile Safari (iOS)** | Requires customer device | No iOS device or simulator. **The highest-risk target** |
| **Android Chrome** | Requires customer device | No Android device or emulator. Chromium-based; low risk |

A viewport is not a device. Emulating 375×812 in a desktop engine proves the layout
reflows; it proves nothing about touch handling, iOS Safari's viewport units, on-screen
keyboard behaviour, or how the platform treats cookies.

## Why Safari is the one to test

Not a general caution — a specific one.

SafeOps keeps the refresh token in an httpOnly cookie with `SameSite=Strict` and `Secure`,
and holds the access token in memory only. Safari, and Mobile Safari especially, is the
strictest mainstream browser about cookies:

- **Intelligent Tracking Prevention** can cap or purge cookie lifetimes in ways other
  browsers do not, particularly where the API is on a different subdomain from the app.
- **`SameSite=Strict` with cross-subdomain navigation** behaves differently enough between
  engines to be worth confirming rather than assuming.
- **Private browsing** has historically restricted storage in ways that break session
  restoration.

The application is most opinionated exactly where Safari is most opinionated. If one
browser is going to reveal a session bug, it is this one.

The concrete failure to look for: sign in, then reload the page. If the user is thrown back
to the login screen, the refresh cookie is not reaching `/auth/refresh`.

## What to run on each untested browser

Fifteen minutes each. In order, because a failure early makes the rest moot.

1. **Sign in.** Then **reload the page.** You must stay signed in. This is the cookie test
   and it is the one that matters.
2. Open Mission Control. The priority queue and KPI tiles populate.
3. Open the incident register, then one incident. Tabs switch, the timeline renders.
4. Open the permit board. Countdowns tick and update.
5. Report an incident through all four steps of the form, including the date-time picker —
   `datetime-local` support and presentation differ most between engines.
6. Open the competency matrix. It is the widest table in the product.
7. Print a permit (the print sheet opens a new window and writes into it — popup blocking
   and `document.write` behaviour differ).
8. Leave it idle for 20 minutes, then act. The access token expires at 15 and must refresh
   silently.
9. Sign out, sign back in.

On mobile, add: rotate the device, open a drawer, and check the on-screen keyboard does not
cover the field being typed into.

## Supported versions

| Browser | Minimum |
|---|---|
| Safari on iPhone and iPad | iOS 15.4 |
| Safari on macOS | 15.4 |
| Chrome, Edge (desktop and Android) | 98 |
| Firefox | 94 |

These are the versions that have every feature the app uses (`Object.hasOwn`,
`structuredClone`, `Array.prototype.at`). Below them, `public/compat.js` shows a page
saying the browser is too old and how to update it, instead of an app that fails part-way.
It is a plain script in old JavaScript, so it runs in the browsers it is checking for.

## Safari: what was checked without a device

There is no Safari engine on this machine, so the built app was read against what iOS
Safari supports. Three problems were found and fixed:

| Problem | Fix | Test |
|---|---|---|
| Both report forms called `crypto.randomUUID()` when they opened. It does not exist before iOS 15.4, nor on a page served over plain `http://`. The form would not open at all. | `lib/uuid.ts` falls back to `crypto.getRandomValues`, which exists in both cases | `uuid.test.ts` |
| Eleven downloads (CSV exports, report PDFs, attachments, backup codes) revoked the file's address immediately after starting the download. Safari can cancel such a download. | `lib/saveBlob.ts` waits 60 seconds before revoking | `safariCompat.dom.test.ts` fails if the pattern returns |
| On Safari 15.0 to 15.3 the charts would fail: their library uses `Object.hasOwn` and `structuredClone`. | The 15.4 floor above, with a clear message below it | `safariCompat.dom.test.ts`; also checked in Chromium with both features removed, in light and dark mode at 320px |

Also checked, and fine below the floor: CSS `:has()` and `:focus-visible` only refine
focus rings and layout, and fall back gracefully. Vite builds for Safari 14 syntax.

What this does **not** prove: anything about cookies, the camera, HEIC photos, the
keyboard or real downloads. Those are the device steps in `GO_LIVE.md` §3.

## Known engine-sensitive areas

Where a difference would show up first, so a tester knows where to look.

| Area | Why |
|---|---|
| Session persistence across reload | `SameSite=Strict` httpOnly cookie |
| `datetime-local` inputs | Presentation and parsing vary; Firefox and Safari differ from Chromium |
| Print sheets | `window.open` + `document.write`; popup blockers and timing differ |
| Wide tables | The competency matrix relies on `overflow-x` containment |
| Sticky headers | Long registers use sticky positioning |
| CSS custom properties in inline `style` | Used for status colours throughout |
| Photo picker and HEIC | Inspection, audit and action photos; iPhone cameras save HEIC by default |
| File downloads | Exports and attachments are saved from in-page data (`lib/saveBlob.ts`) |

## Honest summary

**Two of six targets verified, and only in one engine.** The layout is sound at three
viewports and every workflow works in Chromium.

Firefox, Safari, Mobile Safari and Android Chrome are **untested**. This is not a defect —
it is a limit of the machine the work was done on. Half a day with the four browsers
closes it, and the Safari half-hour is the part worth doing first.
