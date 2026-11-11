import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.js'

type NoticeProps = HTMLAttributes<HTMLDivElement> & { title?: ReactNode }

/** A callout: the Reds' tint fill at full width, bold ink and border. The
 *  guidelines' Callout pattern does not bind yet. */
export function Notice({ title, children, className, ...props }: NoticeProps) {
  return (
    <div role="note" className={cn('mc-notice', className)} {...props}>
      {title && <p className="mc-notice-title">{title}</p>}
      {children}
    </div>
  )
}
