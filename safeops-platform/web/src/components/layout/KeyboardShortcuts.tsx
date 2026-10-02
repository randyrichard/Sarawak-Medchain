import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui'
import { isTypingTarget, modKey, OPEN_SHORTCUTS_EVENT } from '@/lib/shortcuts'

/**
 * The keyboard shortcuts, listed - opened with "?", as on GitHub, Gmail, Jira and Slack.
 *
 * Every shortcut here is one people already know from those products (Jakob's law): nothing
 * to learn, only something to discover. That is also why there are so few. A product-
 * specific chord like "g then i" would be one more thing to memorise for a tool people
 * open a few times a shift.
 */
export const SHORTCUT_GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['/'], label: 'Search' },
      { keys: [modKey('K')], label: 'Search (also works while typing)' },
      { keys: ['?'], label: 'Show this list' },
      { keys: ['Esc'], label: 'Close a dialog, menu or search' },
    ],
  },
  {
    title: 'Lists and tables',
    items: [
      { keys: ['Enter'], label: 'Open the focused record' },
      { keys: [modKey('click')], label: 'Open a record in a new tab' },
      { keys: ['Click a column title'], label: 'Sort by it; click again to reverse' },
    ],
  },
  {
    title: 'Tabs and menus',
    items: [
      { keys: ['←', '→'], label: 'Previous or next tab' },
      { keys: ['↑', '↓'], label: 'Move through a menu' },
      { keys: ['Home', 'End'], label: 'First or last tab or item' },
    ],
  },
]

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onRequest = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_SHORTCUTS_EVENT, onRequest)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, onRequest)
    }
  }, [])

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="The same keys you use in Gmail, GitHub and most web apps."
    >
      <div className="space-y-4">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">{group.title}</h3>
            <dl className="divide-y">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-sm text-ink-2">{item.label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {item.keys.map((k) => (
                      <kbd key={k} className="rounded border bg-sunken px-1.5 py-0.5 font-mono text-2xs text-ink">{k}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
