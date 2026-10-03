# SafeOps UI system

The primitives every SafeOps screen is built from. Import them from one place:

```tsx
import { Button, Card, CardHeader, DataTable, Dialog, AsyncContent } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
```

You can see every component working, in both themes, at **`/design`** (the styleguide page). If a
component looks wrong there, it is wrong on every page that uses it, so fix the component and
not the page.

## Architecture

```
styles/index.css         design tokens: CSS variables, light and dark (the only hex values)
tailwind.config.js       maps tokens to utilities: bg-accent, text-muted, bg-critical-solid
components/ui/*          primitives: consume tokens, own behaviour and accessibility
lib/useAsync.ts          the data-loading contract: status, data, error, reload
features/**              pages: compose primitives, own data and copy
```

Dependencies only go downward. Pages use primitives; primitives use tokens. A page never
hard-codes a colour or spacing value, and it never rebuilds a primitive's behaviour by hand
(no `<tr onClick>`, no hand-rolled menus, no effect with its own `cancelled` flag).

**What a primitive owns:**
- keyboard behaviour;
- focus;
- ARIA (accessibility attributes);
- loading, empty and error states;
- responsive behaviour.

**What a page owns:**
- what to fetch;
- what to call things;
- what happens on success.

### Inventory

| Area | Components |
|---|---|
| Actions | `Button`, `LinkButton`, `Dropdown` / `DropdownItem` / `DropdownLabel` / `DropdownSeparator` |
| Forms | `Input`, `PasswordInput`, `Textarea`, `Select`, `SuggestSelect`, `Checkbox`, `Switch`, `FieldShell`, `fieldA11y` |
| Layout | `FormStack` / `FormRow` / `FormSection` / `FormSections`, `PageHeader`, `Card` / `CardHeader` / `CardBody`, `Tabs` / `TabPanel`, `Breadcrumbs` |
| Data | `DataTable`, `Badge`, `StatusPill`, `Avatar` |
| Feedback | `AttentionIcon` / `attentionOf` / `attentionStripe`, `Alert`, `Dialog`, `EmptyState`, `ErrorState`, `Loading`, `Skeleton*`, `Spinner`, `FullPageSpinner` |
| Async | `useAsync` (hook), `AsyncContent` (renders its states) |
| Conventions | `useUrlState`, `useUnsavedChangesWarning`, `lib/shortcuts.ts`, `KeyboardShortcuts` |

## API conventions

These rules apply to every component, so a developer who has learned one component can predict
how the others work.

1. **Controlled by default.** A component takes `value` and `onChange`, and the page holds the
   state. (`Tabs`, `Switch`, `SuggestSelect` and `Dialog`'s `open` all work this way.) Purely
   visual state, such as whether a dropdown is open or a password is revealed, stays inside
   the component.
2. **Native props pass through.** Form controls and `Button` extend their HTML element's props
   and forward refs, so `type`, `autoComplete`, `name`, `aria-*` and `data-*` work without
   extra wiring. The component adds its own attributes alongside yours and never drops
   yours. For example, `aria-describedby` is merged, not replaced.
3. **`className` adjusts layout. It is not for restyling.** Use it for margins, width and grid
   placement. To change how something looks, add a variant to the primitive.
4. **Every state is a prop.** `loading`, `error`, `empty`, `disabled`, `required`. The page
   says which state it is in, and the primitive knows how to draw it. Pages never
   hand-assemble a "loading" or "failed" layout.
5. **Names are required when there is no visible text.** An icon-only button needs an
   `aria-label`. A table should be given a `caption`. A tab row that is not under a heading
   should be given a `label`.
6. **Tokens only.** Use `bg-surface`, `text-ink-2`, `bg-accent-solid` and so on. White text
   goes on a `*-solid` fill (`bg-accent-solid`, `bg-critical-solid`), because the plain
   `accent` and `critical` tokens are tuned for text and fail 4.5:1 under white in dark mode.

## Loading, empty and error states

All data that a page fetches goes through `useAsync`:

```tsx
const employees = useAsync(
  () => api.listEmployees(companyId!),  // receives an AbortSignal, for clients that accept one
  [companyId],                          // reload when these change, as with useEffect
  { enabled: Boolean(companyId) },      // wait until the input exists
)
```

The hook guarantees the following:

| Concern | How it is handled |
|---|---|
| Races | Only the latest request can update state, so switching company quickly never shows the old company's rows. |
| Cancellation | The `AbortSignal` is aborted when the inputs change and when the component unmounts. |
| Failure | A failed request ends in `status: 'error'`, never in an endless skeleton. `reload()` retries it. |
| Refresh | A reload keeps the current data on screen and sets `refreshing` while the new data loads. |
| Optimistic update | `setData(prev => …)` updates the data straight after a successful mutation. |

**To render a list or a block of content**, use `AsyncContent`:

```tsx
<AsyncContent
  state={employees}
  loadingLabel="Loading employees…"            // read aloud by screen readers
  loading={<SkeletonRows rows={6} />}           // shaped like the content
  errorTitle="Couldn't load employees"
  isEmpty={(rows) => rows.length === 0}
  empty={<EmptyState icon={Users} title="No employees yet">Import a CSV to start.</EmptyState>}
>
  {(rows) => <EmployeeList rows={rows} />}
</AsyncContent>
```

**To render a table**, pass the states straight to `DataTable`, so the header stays in place
while rows load:

```tsx
<DataTable
  caption="Employees"
  columns={columns}
  rows={employees.data ?? []}
  rowKey={(e) => e.id}
  loading={employees.data === undefined && employees.status !== 'error'}
  error={employees.status === 'error' ? employees.error : undefined}
  onRetry={employees.reload}
  empty={<EmptyState title="No employees yet" />}
  onRowClick={(e) => navigate(`/employees/${e.id}`)}
  rowLabel={(e) => `Open ${e.name}`}
/>
```

`OrganizationPage` (`features/org`) is the reference migration: the Structure view uses
`AsyncContent`, and the People view uses `DataTable`'s states.

### Rules for each state

**Loading**
- Draw skeletons shaped like the final layout, wrapped in `Loading` (or provided by
  `AsyncContent` or `DataTable`), so that screen readers hear what is loading.
- Never leave a bare spinner in the middle of a page.

**Empty**
- Use `EmptyState`. Say what this space will show and how to fill it, and give the next
  action when the person can take one.
- "No records" is a last resort.

**Error**
- Use `ErrorState` (or the states built into `AsyncContent` and `DataTable`). Say what failed
  and always offer **Try again**.
- If a reload fails, keep the old data on screen and show the error above it.

**Edge cases**
- Long names truncate (`min-w-0 truncate`).
- Numbers use tabular figures.
- A value that is not in a select's list keeps the field editable rather than blanking it
  (see `SuggestSelect`).

## Accessibility contract

All of this is tested in a real DOM (`components.dom.test.tsx`), including an automated axe
audit. The live app was also audited across eight pages, in both themes, at 375px and 1366px.

**Tabs** follow the WAI-ARIA tabs pattern:
- One tab stop for the whole row.
- ←/→ move between tabs and select as they go. Home and End jump to the first and last tab.
  Disabled tabs are skipped.
- Pass `id` to Tabs and use `TabPanel` to get `aria-controls` and a labelled panel.

**Dropdown** follows the menu-button pattern:
- `aria-haspopup` and `aria-expanded` are set on the trigger.
- Opening the menu moves focus to the first item. ↑/↓, Home/End and type-ahead move between
  items.
- Esc closes the menu and returns focus to the trigger. Tab closes it and moves on.
- Every interactive element inside a menu must have `role="menuitem"`.

**Dialog**
- It is labelled by its title and described by its subtitle.
- When it opens, focus moves to:
  1. the element marked `data-autofocus`, if there is one;
  2. otherwise the first form field;
  3. otherwise the dialog panel itself. This is right for confirmations, because nothing is
     then one Enter away from happening.
- Focus is trapped inside, Esc closes it, the page behind does not scroll, and focus returns
  to whatever opened it.

**Fields**
- `label` is linked to the control with `htmlFor`.
- The hint or error is announced with the field (`aria-describedby`), and an error sets
  `aria-invalid`.
- The required star is visual only, because the `required` attribute already tells
  assistive technology.

**DataTable**
- Clickable rows stay rows: they are not turned into buttons, so the table keeps its
  structure for screen readers.
- Rows are focusable, and Enter or Space activates one.
- `rowLabel` says what activating a row does.
- `caption` names the table and makes a sideways-scrolling table reachable from the
  keyboard.

**Contrast and other rules**
- Text meets 4.5:1 in both themes. White text only goes on `*-solid` fills.
- Status is never shown by colour alone: pills carry both an icon and a label.
- Card titles are `h2` under the page's `h1`. Pass `CardHeader as="h3"` when the card is
  nested inside another section.
- Touch targets grow to 44px on coarse pointers, using the `coarse:` variant.

## Responsive design

- Design for 375px first. No page may scroll sideways. A table hides secondary columns with
  `visibility: 'hidden md:table-cell'` before it falls back to scrolling inside its own box.
- A flex child that has to shrink needs `min-w-0` on **every** element between the flex
  container and the text (see the note in `Dropdown.tsx`).
- Dialogs never grow taller than the window: the body scrolls, and the header and footer stay
  pinned (see `DIALOG_LAYOUT`).

## Familiar conventions (Jakob's law)

People spend most of their working day in other products, such as Gmail, GitHub, Jira, Excel
and their bank's website, and they come to SafeOps expecting it to work the same way. A
convention they already know costs them nothing to learn, and one SafeOps invents costs every
person who uses it. So when a familiar pattern exists, use it, and keep anything new for the
safety work itself.

| People expect | SafeOps does | How |
|---|---|---|
| The logo goes home | The sidebar logo links to Mission Control | `AppShell` |
| The URL is the view: Back, refresh and a shared link keep the tab and filters | Tabs, admin sections and register filters live in the query string | `useUrlState('tab', default, allowed)` |
| Records are links: hover shows the address, Ctrl/Cmd-click or middle-click opens a new tab, right-click copies the address | Table rows that open a page use `rowHref`, so the main cell is a real link and a click anywhere on the row follows it | `DataTable rowHref` |
| Anything that goes somewhere is a link, not a button | Navigation actions use `LinkButton`; `Button` is for actions that do something | `LinkButton` |
| Click a column title to sort, click again to reverse, with an arrow for the direction | Columns with `sortValue` sort that way and say so with `aria-sort` | `Column.sortValue`, `defaultSort`, controlled `sort` |
| `/` or Ctrl K (⌘K on a Mac) to search, `?` for the list of shortcuts | Both, shown with the right modifier for the platform | `lib/shortcuts.ts`, `KeyboardShortcuts` |
| Leaving a half-written form asks first | The near-miss form asks; the incident report autosaves a draft, as Gmail does | `useUnsavedChangesWarning(dirty)` |
| Esc closes, arrow keys move through tabs and menus, Enter opens | Built into `Dialog`, `Dropdown`, `Tabs` and `DataTable` | see *Accessibility contract* |

**Rules for new screens**

- **Opens a page:** a link (`rowHref`, `LinkButton`, `<Link>`), never `onClick={() => navigate(...)}`.
- **Opens a drawer or dialog on the same page:** `onRowClick` / `onClick` is right, because
  there is no address to open in a new tab.
- **Can be shared or refreshed** (a tab, a filter, a sort, a search): keep it in the URL with
  `useUrlState`, and use `{ replace: true }` for anything that changes on every keystroke.
- **Shortcuts:** use one people already know, and leave single-key shortcuts alone while the
  person is typing (`isTypingTarget`). Never invent a product-only chord.
- **Forms people may abandon by accident:** keep a draft, or call
  `useUnsavedChangesWarning`.

## Keeping choices small (Hick's law)

Hick's law (Hick 1952, Hyman 1953) says the time to choose grows with the number of options:
`T = a + b·log₂(n + 1)`. Three findings shape how SafeOps applies it:

- **The cost is in uncertainty, not raw count.** Hyman showed that decision time tracks the
  entropy of the choice. A sensible default or an obviously likely option makes a choice
  fast even when the list is long, while equal-looking options make it slow.
- **The log curve only holds for options people know.** For a list nobody has memorised,
  people read items one by one, and time grows linearly with the length. Sorting, grouping
  and search bring that back down.
- **Fewer is not automatically better.** Hiding an option people need just moves the cost to
  a hunt or a support call. Group the options, or move rare ones one step away; don't
  remove them.

| Where | Before | Now |
|---|---|---|
| Sidebar (administrator) | 17 items in one column | 3 everyday items at the top, then 5 labelled groups of ≤ 4. Roles that see ≤ 7 items keep a flat list (`GROUP_NAV_ABOVE`) |
| Incident type, report form | 17 equal tiles, in storage order | 4 groups by what happened ("Someone was hurt…"), ≤ 7 types each, commonest first (`INCIDENT_TYPE_GROUPS`) |
| Incident type filter | 17 options in one flat list | The same 4 groups, as `<optgroup>`s |
| Incident status filter | 8 chips, every visit | The 4 everyday ones (Open, the default; High risk; Overdue; All), with the 4 workflow states under "More…" |
| Site switcher | Server order | Alphabetical, so a letter key (type-ahead) jumps to the site |
| Incident severity, report form | Pre-filled "Minor": the fastest answer, so the one a hurried reporter kept | No default; the reporter must choose (4 options). A default is the strongest nudge a form has, and an under-classified incident skips the escalation it needs |

**Rules for new screens**

- **More than about seven options:** group them under labels people can answer at a
  glance, or move the rarely used ones behind "More". The `hicksLaw.test.ts` tests hold
  these limits.
- **Grouping must not lose anything.** Every option appears exactly once, and the tests
  check that. An option that falls out of every group cannot be chosen at all.
- **Give the likely answer** as the default or at the top. Never default a field whose answer
  needs a person's judgement, such as severity, to the convenient value.
- **Sort long lists** (alphabetically for names, by frequency for actions), and offer search
  or type-ahead once a list stops fitting on screen.
- **Split a complex decision into steps** (the incident report is four) instead of putting
  everything on one screen.

## Spacing that groups (law of proximity)

The law of proximity is the Gestalt finding (Wertheimer, 1923) that people see things which
sit close together as belonging together. Spacing does this on its own, before colour, borders
or boxes come into play, so in SafeOps spacing is the main way to show what belongs with what.
The rule is a ratio: **the space inside a group must be clearly smaller than the space between
groups.** A label that sits equally far from two fields belongs to neither, and people slow
down or fill in the wrong one.

| Inside a field (`FieldShell`) | Between fields (`FormStack`, `FormRow`) | Between sections (`FormSection`) |
|---|---|---|
| label → control → hint/error: **6px** | **20px**, stacked or side by side | **32px**; the heading sits **8px** above its own fields |

What was changed, and why:

| Where | Before | Now |
|---|---|---|
| Dialog submit errors (37 dialogs) | At the top of a scrolling body, while Save is pinned at the bottom. On long forms the refusal appeared off-screen, so the click seemed to do nothing | `Dialog error={...}`: pinned directly above the footer buttons, always in view |
| Form fields in dialogs and settings | 12, 14 or 16px apart depending on the file, barely more than the 6px from a label to its own field | 20px (`FORM_SPACING`), measured on the live app: every field pair now meets the ratio |
| Report scope panel | 8px between rows, so "Year" read as the caption of Month | 20px |
| Employee, contractor and worker drawers | Delete 8px from "Edit details", read as one group of routine actions | Delete pushed to the far end of the footer |
| Incident header | Archive right beside Summary | A rule and space between them |

**Rules for new screens**

- Build forms from `FormStack`, `FormRow` and `FormSection` (or `FORM_SPACING`). Don't pick
  ad-hoc `space-y-*` values.
- A hint or error goes directly under its own field (`FieldShell` does this). A form-level
  error goes in `Dialog error`, next to the buttons.
- Put actions next to the thing they act on. Put destructive actions away from constructive
  ones (`ml-auto`, or a divider).
- Use whitespace first. Reach for a border or a box only when space alone can't separate
  groups.

`proximity.dom.test.tsx` holds the spacing ratios and the error placement, and fails if a
dialog puts its submit error back in the body.

## Not making people remember (Miller's law)

Miller (1956) found that people can hold about **7 ± 2** chunks in short-term memory. Cowan
(2001) put it nearer **4** when people can't rehearse or group the items. The real insight is
**chunking**: the limit counts meaningful groups, not raw items.

The law is about *memory*, not about what is on screen. "Menus must have at most seven items"
is a misreading: options in view are recognised, not recalled, and grouping them is Hick's law
(see above). In SafeOps, Miller's law applies wherever a person has to **hold something in
their head**:

| Where | Before | Now |
|---|---|---|
| Incident report, steps 2–3 | Type, severity, title and time entered on step 1 were hidden, so writing "What happened?" meant remembering them or going back | A **"You are reporting"** summary (`ReportingSummary`) with an Edit link, on the steps in between |
| Register asset (16 fields), Register a visit (15 fields) | One unbroken column, so keeping track of what was done and what was left | Named `FormSection`s of 2–5 fields (5 sections and 4 sections) |
| IC numbers (visitor drawer, blacklist) | 12 digits in one run, compared by eye against a card | `formatIdNumber`: `900101-13-5678`, the printed MyKad form. Display only; matching uses the stored value |
| MFA setup key | Already chunked in fours | Now through the shared `chunk()` |

Already right, and kept that way:
- Recovery codes are short and chunked.
- Code fields accept `123 456` with a space, as authenticator apps show it.
- Every destructive confirmation names its target ("Delete Jane Doe?"), so nothing has to be
  remembered from the screen behind it.

**Rules for new screens**

- **Never ask people to recall what they entered earlier.** Carry it forward: a summary line, or
  the record's name in the dialog title.
- **Long codes, IDs and numbers that people read, compare or retype** go through `chunk()` or a
  domain formatter. Codes that are only copied (API keys, links) need a copy button, not
  chunking.
- **A form with more than about 8 fields** gets named `FormSection`s of 5 or fewer, inside
  `FormSections`. `millersLaw.dom.test.tsx` fails any dialog of 12 or more fields without
  sections, and any section with more than 5 fields.
- **Don't cap visible options to seven in Miller's name.** Group them instead (see Hick's law).

## Targets that are easy to hit (Fitts's law)

Fitts (1954), in the Shannon form (MacKenzie 1992, ISO 9241-9), says the time to hit a target is
`T = a + b·log₂(D/W + 1)`. Small, distant targets are slow and error-prone. Enlarging a *tiny*
target helps a lot; enlarging an already large one helps little. A fingertip is a far blunter
pointer than a cursor, so the sizes differ by input:

| Pointer | Minimum | Source |
|---|---|---|
| Mouse / trackpad | **24×24 px**, or smaller only if spaced so a 24px circle around it hits nothing else | WCAG 2.2 SC 2.5.8 (AA) |
| Touch (`coarse:` variant) | **44×44 px** | Apple HIG 44pt, Material 48dp, WCAG 2.5.5 (AAA) |

`coarse:` is `(pointer: coarse)`. It checks *how* someone points, not the screen width, so a
desktop keeps its density and a touch laptop gets touch sizes.

Measured on 12 pages, every visible interactive element, before and after:

| | Mouse (WCAG 2.5.8) | Touch (44px) |
|---|---|---|
| Before | 0 failing | **103 of 258** too small |
| After | 0 failing | **0 of 242** |

What was too small:
- Every form field (`FieldShell` and 29 hand-built selects and inputs, 36px).
- The user-row ⋯ menus (28px).
- The alert dismiss × (**18px**, even with a mouse).
- The account avatar (32px).
- Report-period toggles (25px), near-miss tags (36px) and incident-type tiles (38px).
- The site switcher and admin section tabs (35–37px).
- The sortable column headers (17px).

Where the whole area should respond, it now does:
- Search boxes with an icon are `<label>`s, so a tap on the icon or the padding focuses the
  field.
- Table rows are links (`rowHref`).
- Checkboxes are hit through their label.

**Rules for new screens**

- Use the primitives (`Button`, `Input`, `Select`…), which already size for both pointers. A
  hand-built control with a fixed height also needs its `coarse:` size: `h-9 coarse:h-11`.
  `fittsLaw.test.ts` fails any 36px select, input or button without one.
- Icon-only buttons are at least `h-6 w-6`, and `coarse:min-h-11 coarse:min-w-11` on touch. A
  negative margin can keep the larger hit area from changing the layout.
- Make the whole thing the target: a label around its field, a link around its row or card.
- Put frequent actions where the pointer or thumb already is. The near-miss form pins Submit to
  the bottom edge on a phone, and dialog actions sit at the bottom of the dialog.

## One thing stands out (Von Restorff effect)

Hedwig von Restorff (1933) showed that, among items that look alike, the one that differs is the
one people notice and remember. Two conditions come with it:

1. **The standouts must stay outnumbered.** If everything stands out, nothing does, and overused
   emphasis gets tuned out, like banner ads.
2. **The difference can't be colour alone.** About one man in twelve has a red-green colour
   vision deficiency, and a site tablet in sunlight washes colour out (WCAG 1.4.1). Pair colour
   with shape, an icon or words.

SafeOps spends distinctiveness on one thing: **what needs action.**

| Where | Before | Now |
|---|---|---|
| KPI tiles (8 implementations across Actions, Training, Audits, Assets, Permits, CAPA analytics, Admin security and Admin overview) | An alarming value was a red or amber number; nothing else differed | `AttentionIcon` beside the value, words for screen readers, and for **critical only** a stripe down the card's edge (`attentionStripe`) |
| Warnings vs critical | (no distinction beyond hue) | Warnings get the icon. Critical gets icon **and** stripe, so in a row with several marked tiles the one needing action now is still the standout |
| Incident register, overdue "Days open" | Red "18d" plus a hover-only tooltip | Icon, plus "Overdue:" for screen readers |
| Permits status chips | The selected chip used the same solid blue as "Request permit", so two equal standouts | Selected chips are tinted with an accent border. The page has one solid primary |
| Near-miss tags | Each selected tag was solid blue, so three tags plus Submit made four standouts | Tinted with a check mark (the non-colour cue). "Submit near miss" is the only solid button |

Measured after the change, every page has **at most one** solid primary action, and no warning
is signalled by red alone.

**Rules for new screens**

- **One solid-accent primary per view.** Selected chips, tabs and toggles use the tint and
  border style, never `bg-accent-solid`.
- **Colour a value only when it is asking for something**, and then add `AttentionIcon`.
  Reserve the stripe for critical.
- **Don't decorate with emphasis.** Badges, colour and motion that mean nothing take attention
  from the things that do.
- `vonRestorff.dom.test.tsx` fails a coloured KPI value without an icon, and a pressed toggle
  in the primary fill.

## Adding or changing a component

1. Check this inventory first. A variant of an existing primitive is better than a new
   near-duplicate.
2. Follow the API conventions above: controlled state, native props passed through, a prop for
   each state, tokens only.
3. Add it to `index.ts` and show it on the styleguide page with each of its states.
4. Test its behaviour in `components.dom.test.tsx`: keyboard, focus, what it announces, and an
   axe pass. Write each test name as what a person would lose if the test failed.
5. Run `npm test`, `npm run typecheck` and `npm run build`.
