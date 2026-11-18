/** `anchor.schema.json` holds the constraints the type cannot. */
export type PdfAnchor = {
  source: { sha256: string }
  selector: (
    | { type: 'PdfQuadSelector'; quads: { page: number; points: number[] }[] }
    | {
        type: 'TextQuoteSelector'
        exact: string
        prefix?: string
        suffix?: string
      }
  )[]
}

/** The rect is in PDF user space. */
export function quadFromRect([x0, y0, x1, y1]: Rect): number[] {
  return [x0, y0, x1, y0, x1, y1, x0, y1].map(round)
}

/** Fractions of the displayed page, origin top-left, and pdf.js's page. */
export function quadsFromFractions(
  rects: { x: number; y: number; w: number; h: number }[],
  { view, rotate }: { view: number[]; rotate: number },
): number[][] {
  const [x0, y0, x1, y1] = view as Rect
  // The unrotated page's corners, clockwise from its top-left. Turning the
  // page 90° clockwise brings the corner before to the displayed top-left.
  const corners = [
    [x0, y1],
    [x1, y1],
    [x1, y0],
    [x0, y0],
  ] as const
  const corner = (i: number) => corners[(i + 4 - rotate / 90) % 4]!
  const [ox, oy] = corner(0)
  const [rx, ry] = corner(1)
  const [bx, by] = corner(3)
  const at = (u: number, v: number) => [
    ox + u * (rx - ox) + v * (bx - ox),
    oy + u * (ry - oy) + v * (by - oy),
  ]
  return rects.map(({ x, y, w, h }) =>
    [...at(x, y + h), ...at(x + w, y + h), ...at(x + w, y), ...at(x, y)].map(
      round,
    ),
  )
}

type Rect = [x0: number, y0: number, x1: number, y1: number]

export const round = (n: number) => Math.round(n * 100) / 100
