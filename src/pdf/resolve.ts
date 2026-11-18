import type { PdfAnchor, PdfMark, PdfResolution } from './index.js'

/** `exact` on the file its quads were measured on, else `orphan`. */
export function resolve(marks: PdfMark[], sha256: string): PdfResolution[] {
  return marks.map(({ id, anchor }) => ({
    id,
    status: anchor.source.sha256 === sha256 ? 'exact' : 'orphan',
  }))
}

/** The anchor's quads on the 1-based `page`. */
export const quadsOn = (anchor: PdfAnchor, page: number): number[][] =>
  anchor.selector.flatMap((selector) =>
    selector.type === 'PdfQuadSelector'
      ? selector.quads.filter((q) => q.page === page).map((q) => q.points)
      : [],
  )
