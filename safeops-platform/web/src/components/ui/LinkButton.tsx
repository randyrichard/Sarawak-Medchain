import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonClasses, type Size, type Variant } from './Button'

/*
 * A link that looks like a button.
 *
 * It exists because "go somewhere" and "do something" are different, and the difference is
 * not cosmetic. An anchor can be middle-clicked into a new tab, copied, opened in a new
 * window and dragged to a bookmark bar; a button can do none of that. A screen reader
 * announces "link" rather than "button", which tells someone whether they are about to
 * navigate or to commit. Neither survives being rendered as the wrong element.
 *
 * The previous shape - <Link><Button>…</Button></Link> - produced <a><button>, which the
 * HTML spec forbids outright: interactive content cannot nest. Browsers recover from it
 * differently, and both the anchor and the button are exposed to assistive technology, so a
 * keyboard user tabs through two controls that look like one.
 *
 * `external` switches to a plain <a> for anything off the client-side router, with the
 * rel that a target="_blank" link needs to stop the opened page reaching back through
 * window.opener.
 */
export function LinkButton({
  to, children, variant = 'primary', size = 'md', className, icon, external, ...rest
}: {
  to: string
  children: ReactNode
  variant?: Variant
  size?: Size
  className?: string
  icon?: ReactNode
  external?: boolean
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>) {
  const cls = buttonClasses(variant, size, className)

  if (external) {
    return (
      <a href={to} className={cls} rel="noopener noreferrer" {...rest}>
        {icon}
        {children}
      </a>
    )
  }

  return (
    <Link to={to} className={cls} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
