import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import {
  createContext,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { quadsOf } from './anchor.js'
import type { PdfMark } from './index.js'
import { quadsOn } from './resolve.js'

type Point = [x: number, y: number]

/** User space to CSS px. */
export const toView = (viewport: PageViewport, points: number[]): Point[] =>
  [0, 2, 4, 6].map(
    (i) => viewport.convertToViewportPoint(points[i]!, points[i + 1]!) as Point,
  )

/** A mark's own axes in CSS px: along its first quad's text, and down. */
type Frame = { along: Point; down: Point }

/** Bounds in a frame: `start` to `end` along, `top` to `bottom` down. */
type Box = { start: number; end: number; top: number; bottom: number }

type Placed = {
  mark: PdfMark
  page: number
  frame: Frame
  first: Box
  hits: Box[]
  shape: string
  ring: string
  badge: Point
  tag: Point
  angle: number
}

// CSS px off the ink.
const pad = { fill: 1, outline: 4, dashed: 4, underline: 0 }
const ring = 7
const underline = { gap: 2, width: 3 }

/** The marks with quads on `page`, in reading order. */
export function place(
  marks: PdfMark[],
  page: number,
  viewport: PageViewport,
): Placed[] {
  return marks
    .flatMap((mark) => {
      const quads = quadsOn(mark.anchor, page).map((q) => toView(viewport, q))
      if (!quads.length) return []
      const [[x1, y1], [x2, y2]] = quads[0] as [Point, Point]
      const length = Math.hypot(x2 - x1, y2 - y1)
      const along: Point = length
        ? [(x2 - x1) / length, (y2 - y1) / length]
        : [1, 0]
      const frame = { along, down: [-along[1], along[0]] as Point }
      const boxes = quads
        .map((quad) => bounds(quad.map((p) => project(frame, p))))
        .sort((a, b) => a.top - b.top || a.start - b.start)
      const lines = join(boxes)
      const look = mark.look ?? 'fill'
      const { hits, shape } = draw(look, frame, boxes, lines)
      const top = grow(lines[0]!, pad[look])
      return [
        {
          mark,
          page,
          frame,
          first: lines[0]!,
          hits,
          shape,
          ring: outline(
            frame,
            lines.map((line) => grow(line, ring)),
          ),
          badge: unproject(frame, top.start, top.top),
          tag: unproject(frame, top.end, top.top),
          angle: (Math.atan2(along[1], along[0]) * 180) / Math.PI,
        },
      ]
    })
    .sort(({ first: a }, { first: b }) =>
      level(a, b) ? a.start - b.start : a.top - b.top,
    )
}

function draw(
  look: keyof typeof pad,
  frame: Frame,
  quads: Box[],
  lines: Box[],
): { hits: Box[]; shape: string } {
  if (look === 'fill') {
    const hits = quads.map((quad) => grow(quad, pad.fill))
    return {
      hits,
      shape: hits.map((box) => path(frame, corners(box))).join(''),
    }
  }
  if (look === 'underline')
    return {
      hits: lines.map((line) => ({
        ...line,
        bottom: line.bottom + underline.gap + underline.width,
      })),
      shape: lines
        .map(({ start, end, bottom }) => {
          const y = bottom + underline.gap + underline.width / 2
          return `M${at(frame, start, y)}L${at(frame, end, y)}`
        })
        .join(''),
    }
  const hits = lines.map((line) => grow(line, pad[look]))
  return { hits, shape: outline(frame, hits) }
}

export const firstPage = (mark?: PdfMark) => {
  const pages = mark && quadsOf(mark.anchor).map(({ page }) => page)
  return pages?.length ? Math.min(...pages) : undefined
}

/** Each mark once, on the first page it is on: by page, then as `place`
 *  orders a page's marks once that page is fetched. */
export function readingOrder(
  marks: PdfMark[],
  fetched: Record<number, PDFPageProxy>,
): { id: string; page: number }[] {
  const pages = new Map<number, PdfMark[]>()
  for (const mark of marks) {
    const page = firstPage(mark)
    if (page) pages.set(page, [...(pages.get(page) ?? []), mark])
  }
  return [...pages]
    .sort(([a], [b]) => a - b)
    .flatMap(([page, here]) => {
      const proxy = fetched[page]
      const ordered = proxy
        ? place(here, page, proxy.getViewport({ scale: 1 })).map(
            ({ mark }) => mark,
          )
        : here
      return ordered.map(({ id }) => ({ id, page }))
    })
}

export type Roving = {
  isStop: (id: string, page: number) => boolean
  focused: (id: string) => void
  /** Focuses the mark `key` moves to from `id`; false for a key that moves none. */
  move: (id: string, key: string) => boolean
}

/** A reader's stop over every page's marks; absent, each page keeps its own. */
export const ReaderRoving = createContext<Roving | undefined>(undefined)

export function step(key: string, i: number, count: number) {
  const to = {
    ArrowRight: i + 1,
    ArrowDown: i + 1,
    ArrowLeft: i - 1,
    ArrowUp: i - 1,
    Home: 0,
    End: count - 1,
  }[key]
  return to === undefined ? undefined : Math.max(0, Math.min(to, count - 1))
}

function usePageRoving(
  placed: Placed[],
  current: string | undefined,
  svg: RefObject<SVGSVGElement | null>,
): Roving {
  const [focused, setFocused] = useState<string>()
  const ids = placed.map(({ mark }) => mark.id)
  const stop = [focused, current].find((id) => id && ids.includes(id)) ?? ids[0]
  return {
    isStop: (id) => id === stop,
    focused: setFocused,
    move: (from, key) => {
      const to = step(key, ids.indexOf(from), ids.length)
      if (to === undefined) return false
      svg.current!.querySelectorAll<SVGGElement>('.mc-pdf-mark')[to]!.focus()
      return true
    },
  }
}

/** The topmost mark under `point`, in CSS px. */
export function hit(placed: Placed[], point: Point): Placed | undefined {
  return [...placed].reverse().find(({ frame, hits }) => {
    const [a, b] = project(frame, point)
    return hits.some(
      (h) => h.start <= a && a <= h.end && h.top <= b && b <= h.bottom,
    )
  })
}

export function Marks({
  placed,
  width,
  height,
  current,
  onActivate,
}: {
  placed: Placed[]
  width: number
  height: number
  current?: string
  onActivate?: (id: string) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const own = usePageRoving(placed, current, svg)
  const { isStop, focused, move } = useContext(ReaderRoving) ?? own

  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    const id = (event.target as SVGElement).dataset.mark!
    if (move(id, event.key)) event.preventDefault()
    else if (onActivate && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onActivate(id)
    }
  }

  return (
    <>
      <svg
        ref={svg}
        className="mc-pdf-marks"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onKeyDown={key}
        onFocus={(event) => focused((event.target as SVGElement).dataset.mark!)}
      >
        {placed.map(({ mark, page, shape, ring }) => (
          <g
            key={mark.id}
            data-mark={mark.id}
            className={`mc-pdf-mark mc-pdf-${mark.look ?? 'fill'}`}
            role={onActivate ? 'button' : 'img'}
            aria-label={mark.label}
            aria-current={mark.id === current || undefined}
            tabIndex={isStop(mark.id, page) ? 0 : -1}
            style={tint(mark.color)}
          >
            <path className="mc-pdf-ring" d={ring} />
            <path className="mc-pdf-shape" d={shape} />
          </g>
        ))}
      </svg>
      {placed.flatMap(({ mark, badge, tag, angle }) =>
        (
          [
            ['badge', mark.badge, badge],
            ['tag', mark.tag, tag],
          ] as const
        ).map(
          ([kind, text, [left, top]]) =>
            text && (
              <span
                key={`${mark.id} ${kind}`}
                className={`mc-pdf-${kind}`}
                aria-hidden="true"
                style={{
                  left,
                  top,
                  rotate: `${angle}deg`,
                  ...tint(mark.color),
                }}
              >
                {text}
              </span>
            ),
        ),
      )}
    </>
  )
}

const tint = (color?: string) =>
  color ? ({ '--mc-pdf-mark': color } as CSSProperties) : undefined

const project = ({ along, down }: Frame, [x, y]: Point): Point => [
  x * along[0] + y * along[1],
  x * down[0] + y * down[1],
]

const unproject = ({ along, down }: Frame, a: number, b: number): Point => [
  a * along[0] + b * down[0],
  a * along[1] + b * down[1],
]

const bounds = (points: Point[]): Box => {
  const as = points.map(([a]) => a)
  const bs = points.map(([, b]) => b)
  return {
    start: Math.min(...as),
    end: Math.max(...as),
    top: Math.min(...bs),
    bottom: Math.max(...bs),
  }
}

const grow = ({ start, end, top, bottom }: Box, by: number): Box => ({
  start: start - by,
  end: end + by,
  top: top - by,
  bottom: bottom + by,
})

const corners = ({ start, end, top, bottom }: Box): Point[] => [
  [start, top],
  [end, top],
  [end, bottom],
  [start, bottom],
]

const shorter = (a: Box, b: Box) => Math.min(a.bottom - a.top, b.bottom - b.top)

const level = (a: Box, b: Box) =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= shorter(a, b) / 2

const oneLine = (a: Box, b: Box) =>
  level(a, b) && Math.max(b.start - a.end, a.start - b.end) < shorter(a, b)

const join = (boxes: Box[]): Box[] =>
  boxes.reduce<Box[]>((lines, box) => {
    const line = lines.at(-1)
    if (line && oneLine(line, box))
      lines[lines.length - 1] = bounds([...corners(line), ...corners(box)])
    else lines.push(box)
    return lines
  }, [])

// The union of boxes stacked down the page, as one path: each run of boxes that
// touch is traced down its end side and back up its start side.
function outline(frame: Frame, boxes: Box[]): string {
  const runs: Box[][] = []
  for (const box of boxes) {
    const last = runs.at(-1)?.at(-1)
    if (
      last &&
      box.top <= last.bottom &&
      box.start < last.end &&
      last.start < box.end
    )
      runs.at(-1)!.push(box)
    else runs.push([box])
  }
  return runs
    .map((run) => {
      const end: Point[] = []
      const start: Point[] = []
      run.forEach((box, i) => {
        const prev = run[i - 1]
        const next = run[i + 1]
        end.push(
          [box.end, prev && prev.end > box.end ? prev.bottom : box.top],
          [box.end, next && box.end <= next.end ? next.top : box.bottom],
        )
        start.push(
          [box.start, prev && prev.start < box.start ? prev.bottom : box.top],
          [box.start, next && next.start < box.start ? next.top : box.bottom],
        )
      })
      return path(frame, [...end, ...start.reverse()])
    })
    .join('')
}

const path = (frame: Frame, points: Point[]) =>
  `M${points.map(([a, b]) => at(frame, a, b)).join('L')}Z`

const at = (frame: Frame, a: number, b: number) =>
  unproject(frame, a, b)
    .map((n) => Math.round(n * 100) / 100)
    .join(',')
