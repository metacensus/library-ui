import type { PDFPageProxy } from 'pdfjs-dist'
import type { TextItem, TextStyle } from 'pdfjs-dist/types/src/display/api'
import { round } from './anchor.js'

/** One text run as pdf.js extracts it, at `start` in its page's text. */
export type Run = {
  page: number
  start: number
  str: string
  /** User space, in the anchor's corner order, from the font's ascent and descent. */
  quad: number[]
  /** The CSS family pdf.js names for its text layer, to measure in. */
  font: string
}

/** A page's text, a line break after each line, and the runs it is made of. */
export type PageText = { text: string; runs: Run[] }

export async function pageText(page: PDFPageProxy): Promise<PageText> {
  const { items, styles } = await page.getTextContent()
  let text = ''
  const runs: Run[] = []
  for (const item of items) {
    if (!('str' in item)) continue
    const style = styles[item.fontName]!
    runs.push({
      page: page.pageNumber,
      start: text.length,
      str: item.str,
      quad: quadOf(item, style),
      font: style.fontFamily,
    })
    text += item.str + (item.hasEOL ? '\n' : '')
  }
  return { text, runs }
}

function quadOf({ transform, width }: TextItem, style: TextStyle): number[] {
  const [a, b, c, d, e, f] = transform
  // pdf.js's text layer takes 0.8 when a font gives no ascent.
  const ascent = style.ascent || 0.8
  const descent = style.descent || ascent - 1
  const [ax, ay] = [a, b].map((v) => (v * width) / Math.hypot(a, b))
  const [x1, y1] = [e + c * descent, f + d * descent]
  const [x4, y4] = [e + c * ascent, f + d * ascent]
  return [x1, y1, x1 + ax, y1 + ay, x4 + ax, y4 + ay, x4, y4]
}

let context: OffscreenCanvasRenderingContext2D | undefined

/** The quad of `run.str` from `from` to `to`, placed as the text layer's
 *  glyphs are: by measuring in `run.font`, scaled to the run's width. */
export function slice(run: Run, from: number, to: number): number[] {
  context ??= new OffscreenCanvas(0, 0).getContext('2d')!
  context.font = `100px ${run.font}`
  const width = (s: string) => context!.measureText(s).width
  const whole = width(run.str)
  const [s, e] = [from, to].map((i) =>
    whole ? width(run.str.slice(0, i)) / whole : i / run.str.length,
  ) as [number, number]
  const q = run.quad
  const at = (p: number, r: number, t: number) => [
    q[p]! + t * (q[r]! - q[p]!),
    q[p + 1]! + t * (q[r + 1]! - q[p + 1]!),
  ]
  return [...at(0, 2, s), ...at(0, 2, e), ...at(6, 4, e), ...at(6, 4, s)].map(
    round,
  )
}

const graphemes = new Intl.Segmenter()
const lineEnd = /[^\S\n]*(?:\n|$)/y

/**
 * `text` as quotes are matched: NFKC, curly quotes and dashes folded, and
 * hyphens ending a line or the text, soft hyphens and whitespace removed.
 * `spans[i]` is where in `text` the character that became `folded[i]` lies.
 */
export function fold(text: string): {
  folded: string
  spans: [start: number, end: number][]
} {
  let folded = ''
  const spans: [number, number][] = []
  for (const { segment, index } of graphemes.segment(text)) {
    const end = index + segment.length
    lineEnd.lastIndex = end
    const kept = segment
      .normalize('NFKC')
      .replace(/[\u2018-\u201b]/g, "'")
      .replace(/[\u201c-\u201f]/g, '"')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[\s\u00ad]/g, '')
      .replace(/^-$/, (hyphen) => (lineEnd.test(text) ? '' : hyphen))
    folded += kept
    for (let i = 0; i < kept.length; i++) spans.push([index, end])
  }
  return { folded, spans }
}
