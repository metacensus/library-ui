import { useId, type ReactNode } from 'react'
import { cn } from '../tools/cn.js'
import {
  ARROW_SEGMENTS,
  ARROW_VIEWBOX,
  BARS,
  BAR_RECTS,
  CAP_RADIUS,
  LOCKUP_VIEWBOX,
  MARK_VIEWBOX,
  STROKE_WIDTH,
  WORDMARK_VIEWBOX,
  barAt,
} from './geometry.js'
import { LOCKUP_PATHS } from './lockupPaths.js'

// `auto` is the solid mark on every ground, haloed on dark.
type Variant = 'auto' | 'solid' | 'reversed'

type MarkProps = {
  variant?: Variant
  className?: string
  title?: string
}

const fillClass = (variant: Variant) => `mc-fill-${variant}`

/** A DOM id unique to this render, safe inside `url(#…)`. */
const useSvgId = (prefix: string) =>
  `${prefix}-${useId().replace(/[^\w-]/g, '')}`

/** Draws `children` over the dark-ground halo: Soft Lavender, diffused,
 *  rippling like water, with a thin still rim beneath the mark; still under
 *  reduced motion. Its numbers are in the lockup's units, 23 tall; `height`
 *  scales them to the viewBox. styles.css renders it on dark grounds only. */
function Haloed({
  viewBox,
  children,
}: {
  viewBox: string
  children: ReactNode
}) {
  const id = useSvgId('mc-halo')
  const [x, y, w, h] = viewBox.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
  ]
  const u = h / 23
  const pad = 24 * u
  const region = {
    filterUnits: 'userSpaceOnUse',
    x: x - pad,
    y: y - pad,
    width: w + 2 * pad,
    height: h + 2 * pad,
  } as const
  const period = region.width / 2
  const edge = (
    <>
      <feMorphology in="SourceAlpha" operator="dilate" radius={2.1 * u} />
      <feGaussianBlur stdDeviation={6 * u} result="edge" />
    </>
  )
  /** Floods Soft Lavender through the `mask` result at alpha `slope`. */
  const tint = (mask: string, slope: number, breathing?: ReactNode) => (
    <>
      <feFlood className="mc-halo-flood" />
      <feComposite in2={mask} operator="in" />
      <feComponentTransfer result="tinted">
        <feFuncA type="linear" slope={slope}>
          {breathing}
        </feFuncA>
      </feComponentTransfer>
    </>
  )
  // Laid over the tinted halo, after its breathing, so it does not breathe.
  const rim = (
    <>
      <feMorphology in="SourceAlpha" operator="dilate" radius={0.8 * u} />
      <feGaussianBlur stdDeviation={0.8 * u} />
      <feComponentTransfer result="rim">
        <feFuncA type="linear" slope="0.40" />
      </feComponentTransfer>
      <feFlood className="mc-halo-flood" />
      <feComposite in2="rim" operator="in" />
      <feComposite in2="tinted" operator="over" />
    </>
  )
  return (
    <>
      <defs>
        <filter id={`${id}-moving`} {...region}>
          {edge}
          {/* The water flows one way: a stitched tile of noise, half the
              region wide, slides left by one period and wraps seamlessly.
              The tile starts at the viewBox's origin: started at the
              region's, Chromium shows seams where the tiles meet. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={`${0.06 / u} ${0.155 / u}`}
            stitchTiles="stitch"
            x={x}
            width={period}
          />
          <feTile x={region.x} width={region.width} />
          <feOffset x={region.x} width={period}>
            <animate
              attributeName="dx"
              values={`0;${-period}`}
              dur="12s"
              repeatCount="indefinite"
            />
          </feOffset>
          <feTile x={region.x} width={region.width} />
          <feDisplacementMap
            in="edge"
            scale={7.5 * u}
            xChannelSelector="R"
            yChannelSelector="G"
            result="water"
          />
          <feMorphology in="SourceAlpha" operator="dilate" radius={1.5 * u}>
            <animate
              attributeName="radius"
              values={`${1.5 * u};${10.5 * u}`}
              dur="4.1s"
              repeatCount="indefinite"
            />
          </feMorphology>
          <feGaussianBlur stdDeviation={3 * u} />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.35">
              <animate
                attributeName="slope"
                values="0.35;0"
                dur="4.1s"
                repeatCount="indefinite"
              />
            </feFuncA>
          </feComponentTransfer>
          <feComposite in2="edge" operator="in" />
          <feComposite in2="water" operator="over" result="halo" />
          {tint(
            'halo',
            0.48,
            <animate
              attributeName="slope"
              values="0.48;0.64;0.48"
              dur="4.9s"
              repeatCount="indefinite"
            />,
          )}
          {rim}
        </filter>
        <filter id={`${id}-still`} {...region}>
          {edge}
          {tint('edge', 0.64)}
          {rim}
        </filter>
        <g id={id}>{children}</g>
      </defs>
      <g className="mc-halo">
        <use
          href={`#${id}`}
          filter={`url(#${id}-moving)`}
          className="mc-halo-moving"
        />
        <use
          href={`#${id}`}
          filter={`url(#${id}-still)`}
          className="mc-halo-still"
        />
      </g>
      <use href={`#${id}`} />
    </>
  )
}

/** The marks' shapes, haloed when `auto`. */
const drawn = (
  variant: Variant,
  viewBox: string,
  shapes: ReactNode,
) =>
  variant === 'auto' ? <Haloed viewBox={viewBox}>{shapes}</Haloed> : shapes

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
      {drawn(
        variant,
        MARK_VIEWBOX,
        BAR_RECTS.map((b) => (
          <rect
            key={b.y}
            x={b.x}
            y={b.y}
            width={b.w}
            height={STROKE_WIDTH}
            rx={CAP_RADIUS}
          />
        )),
      )}
    </svg>
  )
}

/** The mark and wordmark, outlined. */
export function MetaCensusLockup({
  variant = 'auto',
  className,
  title = 'MetaCensus',
}: MarkProps) {
  return (
    <svg
      viewBox={LOCKUP_VIEWBOX}
      className={cn('mc-lockup', fillClass(variant), className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {drawn(
        variant,
        LOCKUP_VIEWBOX,
        LOCKUP_PATHS.map((d) => <path key={d} d={d} />),
      )}
    </svg>
  )
}

/** The wordmark alone: the lockup's letters, outlined, without the bars. */
export function MetaCensusWordmark({
  variant = 'auto',
  className,
  title = 'MetaCensus',
}: MarkProps) {
  return (
    <svg
      viewBox={WORDMARK_VIEWBOX}
      className={cn('mc-wordmark', fillClass(variant), className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {drawn(
        variant,
        WORDMARK_VIEWBOX,
        LOCKUP_PATHS.slice(BAR_RECTS.length).map((d) => (
          <path key={d} d={d} />
        )),
      )}
    </svg>
  )
}

/** The arrow. Decorative unless given a `title`. It may be rotated to follow
 *  reading direction; nothing else of the brand may. */
export function MetaCensusArrow({
  variant = 'auto',
  className,
  title,
}: MarkProps) {
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
}: MarkProps & { progress: number }) {
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
