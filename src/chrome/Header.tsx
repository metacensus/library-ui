import type { ReactNode } from 'react'
import { MetaCensusLockup } from '../marks/Marks.js'
import { cn } from '../tools/cn.js'

/** The lockup, then the consumer's `nav` and `actions`. */
export function Header({
  homeHref = '/',
  nav,
  actions,
  className,
}: {
  homeHref?: string
  nav?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mc-header', className)}>
      <a href={homeHref} className="mc-header-home">
        <MetaCensusLockup />
      </a>
      {nav && <div className="mc-header-nav">{nav}</div>}
      {actions && <div className="mc-header-actions">{actions}</div>}
    </header>
  )
}
