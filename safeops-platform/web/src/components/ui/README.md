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
| Layout | `PageHeader`, `Card` / `CardHeader` / `CardBody`, `Tabs` / `TabPanel`, `Breadcrumbs` |
| Data | `DataTable`, `Badge`, `StatusPill`, `Avatar` |
| Feedback | `Alert`, `Dialog`, `EmptyState`, `ErrorState`, `Loading`, `Skeleton*`, `Spinner`, `FullPageSpinner` |
| Async | `useAsync` (hook), `AsyncContent` (renders its states) |

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

## Adding or changing a component

1. Check this inventory first. A variant of an existing primitive is better than a new
   near-duplicate.
2. Follow the API conventions above: controlled state, native props passed through, a prop for
   each state, tokens only.
3. Add it to `index.ts` and show it on the styleguide page with each of its states.
4. Test its behaviour in `components.dom.test.tsx`: keyboard, focus, what it announces, and an
   axe pass. Write each test name as what a person would lose if the test failed.
5. Run `npm test`, `npm run typecheck` and `npm run build`.
