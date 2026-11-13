// The mark and the arrow as round-capped strokes of one weight in one space:
// the mark's ink box, `MARK_VIEWBOX`. Each bar is a rect whose `rx` is half its
// height, so it is a segment with round caps, and the two marks interpolate
// stroke for stroke. The arrow's ink box is centred on the mark's.

export const STROKE_WIDTH = 17.2
export const CAP_RADIUS = STROKE_WIDTH / 2
export const MARK_VIEWBOX = '0 0 185.9 155'

// The lockup's space, and the box its bars fill within it. The mark is scaled
// by 27 / 185.9 into the box, which holds the lockup's bar paths.
export const LOCKUP_VIEWBOX = '0 0 159 23'
export const LOCKUP_MARK_BOX = { x: 0, y: 0, width: 27, height: 22.5 }

// The wordmark alone: the lockup's own frame from the first letter on, so it
// sits at the same height and scale as in the lockup.
export const WORDMARK_VIEWBOX = '34.4348 0 124.5652 23'

export type Segment = { x1: number; y1: number; x2: number; y2: number }

// The six bars, top to bottom.
export const BAR_RECTS = [
  { x: 76.1, y: 0, w: 33.8 },
  { x: 59.2, y: 27.6, w: 76.1 },
  { x: 0, y: 55.1, w: 117.1 },
  { x: 67.6, y: 82.7, w: 118.3 },
  { x: 33.8, y: 110.2, w: 93 },
  { x: 76.1, y: 137.8, w: 33.8 },
]

export const BARS: Segment[] = BAR_RECTS.map((b) => ({
  x1: b.x + CAP_RADIUS,
  y1: b.y + CAP_RADIUS,
  x2: b.x + b.w - CAP_RADIUS,
  y2: b.y + CAP_RADIUS,
}))

// The arrow: a shaft and two barbs. The head's depth is also its half-height,
// which holds the barbs at 45 degrees.
const CENTRE_Y = 77.5
const TIP_X = 171
const TAIL_X = 15
const HEAD_DEPTH = 42

export const ARROW = {
  shaft: { x1: TAIL_X, y1: CENTRE_Y, x2: TIP_X, y2: CENTRE_Y },
  headUp: {
    x1: TIP_X - HEAD_DEPTH,
    y1: CENTRE_Y - HEAD_DEPTH,
    x2: TIP_X,
    y2: CENTRE_Y,
  },
  headDown: {
    x1: TIP_X - HEAD_DEPTH,
    y1: CENTRE_Y + HEAD_DEPTH,
    x2: TIP_X,
    y2: CENTRE_Y,
  },
} satisfies Record<string, Segment>

// The arrow's ink box, caps included, and its strokes rebased onto it.
const INK_X = TAIL_X - CAP_RADIUS
const INK_Y = CENTRE_Y - HEAD_DEPTH - CAP_RADIUS
export const ARROW_VIEWBOX = `0 0 ${TIP_X - TAIL_X + STROKE_WIDTH} ${2 * HEAD_DEPTH + STROKE_WIDTH}`

export const ARROW_SEGMENTS: Segment[] = Object.values(ARROW).map((s) => ({
  x1: s.x1 - INK_X,
  y1: s.y1 - INK_Y,
  x2: s.x2 - INK_X,
  y2: s.y2 - INK_Y,
}))

// Converge, then launch. All six bars pool onto the shaft in one shared
// window. The two mid bars collapse to the tip, hidden under the shaft, and
// grow back out along the barbs, so the head extends from the point. The two
// smallest bars have no counterpart: they shrink to a point on the shaft's
// centreline, where a zero-length round cap draws a dot the shaft covers.
// Nothing fades.
const POOL_POINT: Segment = { x1: 93, y1: CENTRE_Y, x2: 93, y2: CENTRE_Y }
const TIP_POINT: Segment = { x1: TIP_X, y1: CENTRE_Y, x2: TIP_X, y2: CENTRE_Y }

type Role = {
  land: Segment // where the bar lands when the converge ends
  becomes: Segment | null // the barb it grows into, for the two reused bars
}

const ROLES: Role[] = [
  { land: POOL_POINT, becomes: null },
  { land: ARROW.shaft, becomes: ARROW.headUp },
  { land: ARROW.shaft, becomes: null },
  { land: ARROW.shaft, becomes: null },
  { land: ARROW.shaft, becomes: ARROW.headDown },
  { land: POOL_POINT, becomes: null },
]

// Phase ends as fractions of the run: the converge carries two thirds, being
// the part that has to read as a gesture.
const CONVERGE_END = 0.65
const RETRACT_END = 0.69

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const window01 = (t: number, a: number, b: number) =>
  clamp01((t - a) / (b - a))
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpSegment = (a: Segment, b: Segment, t: number): Segment => ({
  x1: lerp(a.x1, b.x1, t),
  y1: lerp(a.y1, b.y1, t),
  x2: lerp(a.x2, b.x2, t),
  y2: lerp(a.y2, b.y2, t),
})

// Where bar `index` is at progress `p`: 0 is the mark, 1 is the arrow.
export function barAt(index: number, p: number): Segment {
  const role = ROLES[index]
  const bar = BARS[index]
  if (!role || !bar) throw new RangeError(`no bar ${index}`)

  let segment = lerpSegment(bar, role.land, easeInOut(window01(p, 0, CONVERGE_END)))
  if (role.becomes) {
    const retract = easeInOut(window01(p, CONVERGE_END, RETRACT_END))
    segment = lerpSegment(segment, TIP_POINT, retract)
    const extend = easeOutQuint(window01(p, RETRACT_END, 1))
    segment = lerpSegment(segment, role.becomes, extend)
  }
  return segment
}
