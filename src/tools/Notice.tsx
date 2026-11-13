import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.js'

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode
  tone?: 'alert' | 'info' | 'success'
}

/** A callout: a tint fill at full width. The guidelines' Callout pattern
 *  does not bind yet. */
export function Notice({
  title,
  tone = 'alert',
  children,
  className,
  ...props
}: NoticeProps) {
  return (
    <div
      role="note"
      className={cn(
        'mc-notice',
        tone === 'info' && 'mc-notice-info',
        tone === 'success' && 'mc-notice-success',
        className,
      )}
      {...props}
    >
      {title && <p className="mc-notice-title">{title}</p>}
      {children}
    </div>
  )
}
