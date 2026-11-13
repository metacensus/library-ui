import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.js'

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode
  /** `alert` (the default) is the Reds' tint; `info` is the Blues'. */
  tone?: 'alert' | 'info'
}

/** A callout: a tint fill at full width, with ink and border from the tone.
 *  The guidelines' Callout pattern does not bind yet. */
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
        className,
      )}
      {...props}
    >
      {title && <p className="mc-notice-title">{title}</p>}
      {children}
    </div>
  )
}
