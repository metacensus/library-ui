import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PdfAnchor, PdfMark, PdfResolution } from './index.js'
import { fold, pageText, slice, type PageText, type Run } from './text.js'

type Quad = { page: number; points: number[] }

/**
 * Each mark on `document`: `exact` on the file its quads were measured on,
 * `reanchored` where its quote is found on its pages or one page either side,
 * else `orphan`.
 */
export async function resolve(
  marks: PdfMark[],
  document: PDFDocumentProxy,
  sha256: string,
): Promise<PdfResolution[]> {
  const texts = new Map<number, Promise<PageText>>()
  const text = (page: number) => {
    if (!texts.has(page)) texts.set(page, document.getPage(page).then(pageText))
    return texts.get(page)!
  }
  return Promise.all(
    marks.map(async ({ id, anchor }): Promise<PdfResolution> => {
      if (anchor.source.sha256 === sha256) return { id, status: 'exact' }
      const quads = await reanchor(anchor, document.numPages, text)
      if (!quads) return { id, status: 'orphan' }
      const selector = anchor.selector.map((s) =>
        s.type === 'PdfQuadSelector' ? { ...s, quads } : s,
      )
      return {
        id,
        status: 'reanchored',
        anchor: { source: { sha256 }, selector },
      }
    }),
  )
}

async function reanchor(
  anchor: PdfAnchor,
  pages: number,
  text: (page: number) => Promise<PageText>,
): Promise<Quad[] | undefined> {
  const quote = anchor.selector.find((s) => s.type === 'TextQuoteSelector')
  const old = anchor.selector.flatMap((s) =>
    s.type === 'PdfQuadSelector' ? s.quads : [],
  )
  if (!quote || !old.length) return
  const anchored = old.map(({ page }) => page)
  for (const reach of [0, 1]) {
    const from = Math.max(1, Math.min(...anchored) - reach)
    const to = Math.min(pages, Math.max(...anchored) + reach)
    const window = Array.from(
      { length: Math.max(0, to - from + 1) },
      (_, i) => from + i,
    )
    let joined = ''
    const runs: Run[] = []
    for (const page of await Promise.all(window.map(text))) {
      const offset = joined.length
      runs.push(
        ...page.runs.map((run) => ({ ...run, start: run.start + offset })),
      )
      joined += `${page.text}\n`
    }
    const found = nearest(joined, runs, quote, old[0]!)
    if (found) return found
  }
}

/** The quote's occurrence in `joined` whose neighbours agree most with its
 *  `prefix` and `suffix`, then the one nearest `old`. */
function nearest(
  joined: string,
  runs: Run[],
  quote: { exact: string; prefix?: string; suffix?: string },
  old: Quad,
): Quad[] | undefined {
  const { folded, spans } = fold(joined)
  const key = (text = '') => fold(text).folded
  const [exact, prefix, suffix] = [
    key(quote.exact),
    key(quote.prefix),
    key(quote.suffix),
  ]
  if (!exact) return
  const starts: number[] = []
  for (let i = folded.indexOf(exact); i >= 0; i = folded.indexOf(exact, i + 1))
    starts.push(i)
  return starts
    .map((i) => {
      const after = i + exact.length
      const start = spans[i]![0]
      const end = spans[after - 1]![1]
      const quads = runs.flatMap((run) => {
        const from = Math.max(0, start - run.start)
        const to = Math.min(run.str.length, end - run.start)
        return to > from
          ? [{ page: run.page, points: slice(run, from, to) }]
          : []
      })
      const { page, points } = quads[0]!
      return {
        quads,
        context:
          agree(prefix.length, (n) => prefix.at(-1 - n) === folded[i - 1 - n]) +
          agree(suffix.length, (n) => suffix[n] === folded[after + n]),
        pages: Math.abs(page - old.page),
        distance: Math.hypot(
          points[0]! - old.points[0]!,
          points[1]! - old.points[1]!,
        ),
      }
    })
    .sort(
      (a, b) =>
        b.context - a.context || a.pages - b.pages || a.distance - b.distance,
    )[0]?.quads
}

/** How many of the first `length` characters agree. */
function agree(length: number, same: (n: number) => boolean): number {
  let n = 0
  while (n < length && same(n)) n++
  return n
}

/** The anchor's quads on the 1-based `page`. */
export const quadsOn = (anchor: PdfAnchor, page: number): number[][] =>
  anchor.selector.flatMap((selector) =>
    selector.type === 'PdfQuadSelector'
      ? selector.quads.filter((q) => q.page === page).map((q) => q.points)
      : [],
  )
