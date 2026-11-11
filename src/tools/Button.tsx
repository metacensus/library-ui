import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { cn } from './cn.js'

type Own = { variant?: 'primary' | 'secondary' | 'text' }

type ButtonProps = Own &
  (
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
  )

/** An action: Garnet solid for the primary, a Charcoal outline for the
 *  secondary, bare text for the third. One primary per view. With an `href` it
 *  renders a link. The guidelines' Actions pattern does not bind yet. */
export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  const classes = cn('mc-button', `mc-button-${variant}`, className)
  if (props.href !== undefined) return <a className={classes} {...props} />
  return <button type="button" className={classes} {...props} />
}
