import type { HTMLAttributes } from 'react'
import { cn } from './cn.js'

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  family?: 'purple' | 'grey' | 'red' | 'blue'
}

/** A small label in a family's tint fill, with its bold ink and border. */
export function Chip({ family = 'purple', className, ...props }: ChipProps) {
  return (
    <span
      className={cn('mc-chip', `mc-chip-${family}`, className)}
      {...props}
    />
  )
}
