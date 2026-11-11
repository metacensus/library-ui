import { useId } from 'react'
import { cn } from '../tools/cn.js'

export type NavLink = { href: string; label: string; current?: boolean }

/** Links in a row; on a narrow screen a Menu button opens them. The disclosure
 *  is a checkbox and CSS, so it works without JS. */
export function Nav({
  links,
  label = 'Main',
  className,
}: {
  links: NavLink[]
  label?: string
  className?: string
}) {
  const id = useId()
  return (
    <nav aria-label={label} className={cn('mc-nav', className)}>
      <input id={id} type="checkbox" className="mc-nav-toggle" />
      <label htmlFor={id} className="mc-nav-menu">
        Menu
      </label>
      <ul className="mc-nav-links">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              aria-current={link.current ? 'page' : undefined}
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
