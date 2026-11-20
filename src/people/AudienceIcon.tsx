import { useId, type ReactNode, type SVGProps } from 'react'
import { cn } from '../tools/cn.js'

/** Who a piece of work is for, in the order a page lists them. */
export const AUDIENCES = [
  'engineers',
  'researchers',
  'regulators',
  'funders',
  'partners',
  'contributors',
] as const

export type Audience = (typeof AUDIENCES)[number]

export const AUDIENCE_LABELS: Record<Audience, string> = {
  engineers: 'Engineers',
  researchers: 'Researchers',
  regulators: 'Regulators and guideline groups',
  funders: 'Funders',
  partners: 'Partners',
  contributors: 'Contributors',
}

/** `</>` on a 24-unit square, as strokes: the engineering flavor's glyph and
 *  the engineers' symbol. */
export const CODE_PATH = 'M18 16l4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16'

/* A person is a solid head and shoulders with a symbol beside the head that
   names the audience; the bare person carries none. `cut` is knocked out of
   the person and the symbol, and `ink` is drawn back over the cut. */
type Drawing = { cut?: ReactNode; ink?: ReactNode; symbol?: ReactNode }

const rule = (d: string, width: number) => (
  <path
    d={d}
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
)

const SHIRT = <path d="M-2.6 3L0 6.8 2.6 3l.5 6.8h-6.2z" />
const TIE = <path d="M-.95 6.1L0 5.1l.95 1-.33 3.7h-1.24z" />

const DRAWINGS: Record<Audience, Drawing> = {
  engineers: {
    symbol: (
      <g transform="translate(-16.2 -11.6) scale(.35)">
        {rule(CODE_PATH, 3.7)}
      </g>
    ),
  },
  researchers: {
    cut: (
      <>
        <path d="M-2.6 1.6l.7 2.1-.9.8.9.8.7 4.5h2.4l.7-4.5.9-.8-.9-.8.7-2.1z" />
        {rule('M-6.1 8.4h2.6', 1.05)}
        {rule('M-5.5 8.4V6.6m.8 1.8V7.2', 0.85)}
      </>
    ),
    symbol: (
      <>
        {rule('M-12.8-11.3v4.1L-15-3.5h6l-2.2-3.7v-4.1', 1.3)}
        {rule('M-13.3-11.3h2.6', 1.3)}
      </>
    ),
  },
  regulators: {
    cut: SHIRT,
    ink: TIE,
    symbol: (
      <>
        <path d="M-12-11.2l4 2.7q.4.4-.2.7h-7.6q-.6-.3-.2-.7z" />
        {rule('M-14.4-7.5v3m2.4-3v3m2.4-3v3', 1.3)}
        {rule('M-15.4-3.9h6.8', 1.6)}
      </>
    ),
  },
  funders: {
    cut: (
      <>
        {SHIRT}
        <circle cx={-12} cy={-6.9} r={1.4} />
      </>
    ),
    ink: TIE,
    symbol: <rect x={-16.4} y={-9.7} width={8.8} height={5.6} rx={0.8} />,
  },
  partners: {
    cut: SHIRT,
    ink: TIE,
    symbol: (
      <>
        {rule('M-13.6-9.6v-1.5h3.2v1.5', 1.3)}
        <rect x={-16.1} y={-9.6} width={8.2} height={5.9} rx={0.8} />
      </>
    ),
  },
  contributors: {},
}

const BOX = { x: -16.5, y: -12.75, size: 24 }

type AudienceIconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  audience: Audience
}

/** A person marked for one audience and labelled with its name, in the text
 *  colour at 1.5em. */
export function AudienceIcon({
  audience,
  className,
  ...props
}: AudienceIconProps) {
  const id = `mc-audience-${useId().replace(/:/g, '')}`
  const { cut, ink, symbol } = DRAWINGS[audience]
  const label = AUDIENCE_LABELS[audience]
  const box = { x: BOX.x, y: BOX.y, width: BOX.size, height: BOX.size }
  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      className={cn('mc-audience-icon', className)}
      role="img"
      aria-label={label}
      fill="currentColor"
      {...props}
    >
      <title>{label}</title>
      <mask id={id} maskUnits="userSpaceOnUse" {...box}>
        <rect {...box} fill="white" />
        <g fill="black" color="black">
          {cut}
        </g>
      </mask>
      <g mask={`url(#${id})`}>
        <path d="M-7.4 9.8c0-10.15 14.8-10.15 14.8 0z" />
        <circle cx={0} cy={-3.2} r={4} />
        {symbol}
      </g>
      {ink}
    </svg>
  )
}
