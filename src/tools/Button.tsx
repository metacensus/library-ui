import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { cn } from './cn.js'

type Own = { variant?: 'primary' | 'secondary' | 'text' | 'danger' | 'inverse' }

type ButtonProps = Own &
  (
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
  )

/** An action: Royal Purple solid for the primary, a Charcoal outline for the
 *  secondary, bare text for the third. One primary per view. A solid Garnet
 *  fill, `danger`, marks only a risky action: one that destroys, discards,
 *  revokes or cannot be undone. A white fill, `inverse`, is the action on a
 *  Purple or night ground, where `primary` matches it. With an `href` it
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
