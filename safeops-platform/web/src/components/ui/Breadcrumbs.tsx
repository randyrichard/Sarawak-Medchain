import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export type Crumb = { label: string; to?: string }

/*
 * The trail back out of a deep page.
 *
 * Two decisions worth keeping.
 *
 * It renders nothing below two entries. Most of this product is one level deep, and a
 * breadcrumb reading only "Incidents" on the incidents page is decoration that costs a row
 * of vertical space and tells nobody anything. A trail earns its place when there is
 * somewhere to go back to.
 *
 * The last crumb is not a link. It marks itself `aria-current="page"`, because a link to
 * the page you are already on is a dead control - a keyboard user tabs to it, activates it,
 * and nothing happens. Screen readers announce the current position from that attribute.
 *
 * The <nav aria-label> matters too: a page can hold several navigation landmarks, and
 * without a name they are announced as an indistinguishable list of "navigation".
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length < 2) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((crumb, i) => {
          const last = i === items.length - 1
          return (
            <Fragment key={`${crumb.to ?? 'current'}-${crumb.label}`}>
              {i > 0 && <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-muted" />}
              <li className="min-w-0">
                {last || !crumb.to ? (
                  <span aria-current="page" className="font-semibold text-ink">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    className="inline-flex items-center rounded font-medium text-accent transition-colors
                               hover:text-ink hover:underline focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-accent coarse:min-h-11"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
