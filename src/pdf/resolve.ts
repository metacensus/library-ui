import type { PDFDocumentProxy } from 'pdfjs-dist'
import { quadsOf, type PdfAnchor, type Quad, type Quote } from './anchor.js'
import type { PdfMark, PdfResolution } from './index.js'
import {
  fold,
  pageTexts,
  quadsBetween,
  slice,
  type PageText,
  type Run,
} from './text.js'

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
  const text = pageTexts(document)
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
  const old = quadsOf(anchor)
  if (!quote || !old.length) return
  for (const reach of [0, 1]) {
    const window = [
      ...new Set(old.flatMap(({ page }) => [page - reach, page, page + reach])),
    ]
      .filter((page) => page >= 1 && page <= pages)
      .sort((a, b) => a - b)
    let joined = ''
    const runs: Run[] = []
    for (const [i, page] of (await Promise.all(window.map(text))).entries()) {
      // A NUL, in no quote, keeps a match off pages that are not adjacent.
      if (i && window[i]! > window[i - 1]! + 1) joined += '\0'
      const offset = joined.length
      runs.push(
        ...page.runs.map((run) => ({ ...run, start: run.start + offset })),
      )
      joined += `${page.text}\n`
    }
    const found = locate(joined, runs, quote, old)
    if (found) return found
  }
}

type Nearness = { pages: number; distance: number }
const nearer = (a: Nearness, b: Nearness) =>
  a.pages - b.pages || a.distance - b.distance

/** The quote's occurrence in `joined` whose neighbours agree most with its
 *  `prefix` and `suffix`, then the one nearest any of the `old` quads. */
function locate(
  joined: string,
  runs: Run[],
  quote: Quote,
  old: Quad[],
): Quad[] | undefined {
  const { folded, spans } = fold(joined)
  const key = (text = '') => fold(text).folded
  const [exact, prefix, suffix] = [
    key(quote.exact),
    key(quote.prefix),
    key(quote.suffix),
  ]
  if (!exact) return
  const runAt = (at: number) =>
    runs.find((run) => at < run.start + run.str.length)!
  const occurrences: number[] = []
  for (let i = folded.indexOf(exact); i >= 0; i = folded.indexOf(exact, i + 1))
    occurrences.push(i)
  const [best] = occurrences
    .map((i) => {
      const start = spans[i]![0]
      const run = runAt(start)
      const [x, y] = slice(run, start - run.start, start - run.start) as [
        number,
        number,
      ]
      const [near] = old
        .map(({ page, points: [ox, oy] }) => ({
          pages: Math.abs(run.page - page),
          distance: Math.hypot(x - ox!, y - oy!),
        }))
        .sort(nearer)
      const after = i + exact.length
      return {
        i,
        context:
          agree(prefix.length, (n) => prefix.at(-1 - n) === folded[i - 1 - n]) +
          agree(suffix.length, (n) => suffix[n] === folded[after + n]),
        ...near!,
      }
    })
    .sort((a, b) => b.context - a.context || nearer(a, b))
  if (!best) return
  return quadsBetween(
    runs,
    spans[best.i]![0],
    spans[best.i + exact.length - 1]![1],
  )
}

/** How many of the first `length` characters agree, when at least half do. */
function agree(length: number, same: (n: number) => boolean): number {
  let n = 0
  while (n < length && same(n)) n++
  return 2 * n >= length ? n : 0
}

/** The anchor's quads on the 1-based `page`. */
export const quadsOn = (anchor: PdfAnchor, page: number): number[][] =>
  quadsOf(anchor)
    .filter((q) => q.page === page)
    .map((q) => q.points)
