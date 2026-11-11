import { useId } from 'react'
import { cn } from '../tools/cn.js'
import {
  ARROW_SEGMENTS,
  ARROW_VIEWBOX,
  BARS,
  BAR_RECTS,
  CAP_RADIUS,
  MARK_VIEWBOX,
  STROKE_WIDTH,
  barAt,
} from './geometry.js'
import { LOCKUP_PATHS, LOCKUP_VIEWBOX } from './lockupPaths.js'

// `auto` is the solid mark on light and the reversed mark on dark.
type Variant = 'auto' | 'solid' | 'reversed'

type MarkProps = {
  variant?: Variant
  className?: string
  title?: string
}

const fillClass = (variant: Variant) => `mc-fill-${variant}`

/** The primary mark: the six bars of the forest plot. */
export function MetaCensusMark({
  variant = 'auto',
  className,
  title = 'MetaCensus',
}: MarkProps) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={cn('mc-mark', fillClass(variant), className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {BAR_RECTS.map((b) => (
        <rect
          key={b.y}
          x={b.x}
          y={b.y}
          width={b.w}
          height={STROKE_WIDTH}
          rx={CAP_RADIUS}
        />
      ))}
    </svg>
  )
}

/** The mark and wordmark, outlined. `gradient` is the canonical lockup and
 *  needs a white or very light ground. */
export function MetaCensusLockup({
  variant = 'auto',
  className,
  title = 'MetaCensus',
}: Omit<MarkProps, 'variant'> & { variant?: Variant | 'gradient' }) {
  const gradientId = `mc-lockup-${useId().replace(/:/g, '')}`
  const gradient = variant === 'gradient'
  return (
    <svg
      viewBox={LOCKUP_VIEWBOX}
      className={cn(
        'mc-lockup',
        !gradient && fillClass(variant),
        className,
      )}
      fill={gradient ? `url(#${gradientId})` : undefined}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {gradient && (
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            x2="158.055"
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#37128A" />
            <stop offset="1" stopColor="#AB82EC" />
          </linearGradient>
        </defs>
      )}
      {LOCKUP_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

type StrokeProps = {
  variant?: Variant
  className?: string
  title?: string
}

/** The arrow. Decorative unless given a `title`. It may be rotated to follow
 *  reading direction; nothing else of the brand may. */
export function MetaCensusArrow({
  variant = 'auto',
  className,
  title,
}: StrokeProps) {
  return (
    <svg
      viewBox={ARROW_VIEWBOX}
      className={cn('mc-arrow', `mc-stroke-${variant}`, className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
    >
      {title && <title>{title}</title>}
      {ARROW_SEGMENTS.map((s) => (
        <line key={s.y1} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
      ))}
    </svg>
  )
}

/** The mark drawn between itself and the arrow: a pure function of `progress`,
 *  0 the mark and 1 the arrow. It holds no clock; whatever places it owns the
 *  timing. Keep it horizontal in every layout. */
export function LogoArrowMorph({
  progress,
  variant = 'auto',
  className,
  title = 'Evidence becomes consensus',
}: StrokeProps & { progress: number }) {
  const p = Math.min(1, Math.max(0, progress))
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={cn('mc-mark', `mc-stroke-${variant}`, className)}
      role="img"
      aria-label={title}
      fill="none"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
    >
      <title>{title}</title>
      {BARS.map((bar, i) => {
        const s = barAt(i, p)
        return <line key={bar.y1} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
      })}
    </svg>
  )
}
