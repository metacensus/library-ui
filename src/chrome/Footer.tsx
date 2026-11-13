import type { ReactNode } from 'react'
import { MetaCensusLockup } from '../marks/Marks.js'
import { cn } from '../tools/cn.js'

/** The `brand`, default the linked lockup, and `tagline`, then the consumer's link columns as `children`. A given `brand` replaces the link, so the consumer owns it. */
export function Footer({
  homeHref = '/',
  brand,
  tagline,
  children,
  className,
}: {
  homeHref?: string
  brand?: ReactNode
  tagline?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <footer className={cn('mc-footer', className)}>
      <div className="mc-footer-brand">
        {brand ?? (
          <a href={homeHref}>
            <MetaCensusLockup />
          </a>
        )}
        {tagline && <p className="mc-footer-tagline">{tagline}</p>}
      </div>
      {children && <div className="mc-footer-columns">{children}</div>}
    </footer>
  )
}
