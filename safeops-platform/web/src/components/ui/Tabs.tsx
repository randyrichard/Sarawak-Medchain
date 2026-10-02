import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string = string> {
  value: T
  label: string
  badge?: ReactNode
  disabled?: boolean
}

/** The ids that tie a tab to its panel. Shared by Tabs and TabPanel. */
// Values are free text ("Roles & Permissions" would be legal), so they are reduced to
// characters an id reference can carry.
const safe = (value: string) => value.replace(/[^\w-]/g, '_')
const tabId = (base: string, value: string) => `${base}-tab-${safe(value)}`
const panelId = (base: string, value: string) => `${base}-panel-${safe(value)}`

/**
 * A row of tabs, following the WAI-ARIA tabs pattern.
 *
 * - **One tab stop.** Only the selected tab is in the Tab order (roving tabindex), so a
 *   keyboard user passes a ten-tab row in one keystroke instead of ten.
 * - **Arrow keys** move between tabs and select as they go; Home and End jump to the ends.
 *   Disabled tabs are skipped. This is "automatic activation", right for tabs whose panels
 *   render without a request each.
 * - **Panels, optionally.** Pass `id` and wrap each view in `<TabPanel tabsId={id} value=…>`
 *   to get `aria-controls` and a labelled `tabpanel`, so a screen reader can say which tab
 *   a region belongs to and jump to it. Without `id` the tabs still work; `aria-controls`
 *   is left off rather than pointing at a panel that does not exist.
 *
 *     <Tabs id="org" label="Organization views" items={tabs} value={view} onChange={setView} />
 *     <TabPanel tabsId="org" value="people" selected={view}>…</TabPanel>
 */
export function Tabs<T extends string>({
  items, value, onChange, className, id, label,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  /** Base id that links tabs to `TabPanel`s. Only needed when panels are used. */
  id?: string
  /** Names the tab row for assistive technology, when the page heading does not. */
  label?: string
}) {
  const autoId = useId()
  const base = id ?? autoId
  const listRef = useRef<HTMLDivElement>(null)

  // If the value matches no tab, the first enabled one keeps the row reachable by Tab.
  const focusable = items.some((i) => i.value === value && !i.disabled)
    ? value
    : items.find((i) => !i.disabled)?.value

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled)
    if (enabled.length === 0) return
    const at = enabled.findIndex((i) => i.value === value)
    let next: number
    switch (e.key) {
      case 'ArrowRight': next = (at + 1) % enabled.length; break
      case 'ArrowLeft': next = (at - 1 + enabled.length) % enabled.length; break
      case 'Home': next = 0; break
      case 'End': next = enabled.length - 1; break
      default: return
    }
    e.preventDefault()
    const target = enabled[next].value
    onChange(target)
    const el = listRef.current?.ownerDocument.getElementById(tabId(base, target))
    el?.focus()
    // A scrolled row on a phone brings the newly selected tab into view.
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  return (
    /*
     * `min-w-0 overflow-x-auto` so a tab row that does not fit scrolls instead of
     * overflowing.
     *
     * This was a bare flex row, so on a 375px phone the later tabs simply rendered past the
     * edge of a container that clipped them: "Analytics" on the equipment page sat at x=420
     * in a 333px row with no way to reach it. Not a cosmetic overflow - a tab you cannot
     * scroll to is a part of the product a phone user cannot open at all.
     *
     * `min-w-0` is again the half that matters. The parent rows are flex containers, and a
     * flex item refuses to shrink below its content without it, so `overflow-x-auto` alone
     * would have had nothing to scroll within.
     */
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn('flex min-w-0 items-center gap-1 overflow-x-auto border-b', className)}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={tabId(base, item.value)}
            aria-selected={active}
            aria-controls={id ? panelId(base, item.value) : undefined}
            tabIndex={item.value === focusable ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors coarse:min-h-11 coarse:px-4',
              'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--accent)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-[var(--accent)] text-ink'
                : 'border-transparent text-muted hover:text-ink-2',
            )}
          >
            {item.label}
            {item.badge}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The region a tab shows. Renders nothing unless its tab is selected, so inactive views do
 * not fetch or hold state; pass `keepMounted` to hide instead, for a view that is costly to
 * rebuild.
 */
export function TabPanel<T extends string>({
  tabsId, value, selected, children, keepMounted = false, className,
}: {
  /** The `id` given to the matching `Tabs`. */
  tabsId: string
  value: T
  selected: T
  children: ReactNode
  keepMounted?: boolean
  className?: string
}) {
  const active = value === selected
  if (!active && !keepMounted) return null
  return (
    <div
      role="tabpanel"
      id={panelId(tabsId, value)}
      aria-labelledby={tabId(tabsId, value)}
      hidden={!active}
      // Focusable so a keyboard user can move from the tab straight into its content, as
      // the pattern expects when the panel starts with text rather than a control.
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  )
}
