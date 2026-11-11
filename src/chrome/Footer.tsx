import type { ReactNode } from 'react'
import { MetaCensusLockup } from '../marks/Marks.js'
import { cn } from '../tools/cn.js'

/** The lockup and `tagline`, then the consumer's link columns as `children`. */
export function Footer({
  homeHref = '/',
  tagline,
  children,
  className,
}: {
  homeHref?: string
  tagline?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <footer className={cn('mc-footer', className)}>
      <div className="mc-footer-brand">
        <a href={homeHref}>
          <MetaCensusLockup />
        </a>
        {tagline && <p className="mc-footer-tagline">{tagline}</p>}
      </div>
      {children && <div className="mc-footer-columns">{children}</div>}
    </footer>
  )
}
