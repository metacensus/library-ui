import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef } from 'react'
import type { PdfAnchor } from './anchor.js'
import { pageTexts, quadsBetween, type PageText } from './text.js'

const context = 32

/** Ms after its last change that a selection ends, unless an input's release
 *  ends it first. */
const settling = 250

export function useSelect(
  root: Element | null,
  loaded: { document: PDFDocumentProxy; sha256: string } | undefined,
  onSelect: ((anchor: PdfAnchor | null) => void) | undefined,
  onError: (error: unknown) => void,
) {
  const latest = useRef(onSelect)
  latest.current = onSelect
  const listening = !!onSelect
  useEffect(() => {
    if (!root || !loaded || !listening) return
    const text = pageTexts(loaded.document)
    let pressed = false
    let shifted = false
    let changed = false
    let given = 'null'
    let asked = 0
    let waiting: ReturnType<typeof setTimeout> | undefined
    const give = (anchor: PdfAnchor | null) => {
      const said = JSON.stringify(anchor)
      if (said === given) return
      given = said
      latest.current?.(anchor)
    }
    const settle = () => {
      clearTimeout(waiting)
      if (!changed || pressed || shifted) return
      changed = false
      const ask = ++asked
      anchorOf(root, text, loaded.sha256)
        .then((anchor) => ask === asked && give(anchor))
        .catch((error) => ask === asked && onError(error))
    }
    const selected = () => {
      clearTimeout(waiting)
      changed = !getSelection()!.isCollapsed
      if (changed) waiting = setTimeout(settle, settling)
      else {
        asked++
        give(null)
      }
    }
    const input = (event: Event) => {
      if (event.type === 'pointerdown') pressed = true
      else if (!event.type.startsWith('key')) pressed = false
      shifted = 'shiftKey' in event && !!event.shiftKey
      settle()
    }
    const inputs = [
      'pointerdown',
      'pointerup',
      'pointercancel',
      'contextmenu',
      'keydown',
      'keyup',
    ]
    document.addEventListener('selectionchange', selected)
    for (const type of inputs) document.addEventListener(type, input, true)
    addEventListener('blur', input)
    return () => {
      asked++
      clearTimeout(waiting)
      document.removeEventListener('selectionchange', selected)
      for (const type of inputs) document.removeEventListener(type, input, true)
      removeEventListener('blur', input)
      give(null)
    }
  }, [root, loaded, listening])
}

export const inSelection = (node: Node | null) => {
  const selection = getSelection()
  return (
    !!node &&
    !!selection?.rangeCount &&
    selection.getRangeAt(0).intersectsNode(node)
  )
}

/** A place in a text layer. `run` counts its spans, one per run with text. */
type Place = { page: number; run: number; at: number }

async function anchorOf(
  root: Element,
  text: (page: number) => Promise<PageText>,
  sha256: string,
): Promise<PdfAnchor | null> {
  const selection = getSelection()!
  if (!selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null
  const spans = Array.from(root.querySelectorAll('.mc-pdf-text > span')).filter(
    (span) => range.intersectsNode(span),
  )
  const [first, last] = [spans[0], spans.at(-1)]
  if (!first || !last) return null
  const from = place(first, range.startContainer, range.startOffset, 0)
  const to = place(last, range.endContainer, range.endOffset, Infinity)

  const pages = await Promise.all(
    Array.from({ length: to.page - from.page + 1 }, (_, i) =>
      text(from.page + i),
    ),
  )
  const offset = ({ run, at }: Place, { runs }: PageText) => {
    const { start, str } = runs.filter((run) => run.str)[run]!
    return start + Math.min(at, str.length)
  }
  const start = offset(from, pages[0]!)
  const end = offset(to, pages.at(-1)!)
  const parts = pages.map((page, i) => {
    const a = i ? 0 : start
    const b = i < pages.length - 1 ? page.text.length : end
    return {
      quads: quadsBetween(page.runs, a, b),
      exact: page.text.slice(a, b),
    }
  })
  const quads = parts.flatMap((part) => part.quads)
  if (!quads.length) return null
  const prefix = pages[0]!.text.slice(Math.max(0, start - context), start)
  const suffix = pages.at(-1)!.text.slice(end, end + context)
  return {
    source: { sha256 },
    selector: [
      { type: 'PdfQuadSelector', quads },
      {
        type: 'TextQuoteSelector',
        exact: parts.map((part) => part.exact).join('\n'),
        ...(prefix && { prefix }),
        ...(suffix && { suffix }),
      },
    ],
  }
}

function place(
  span: Element,
  node: Node,
  offset: number,
  outside: number,
): Place {
  const layer = span.parentElement!
  // A boundary on the span itself lies before or after its one text node.
  const inside = node === span && offset ? Infinity : offset
  return {
    page: Number(layer.dataset.page),
    run: Array.from(layer.querySelectorAll(':scope > span')).indexOf(span),
    at: span.contains(node) ? inside : outside,
  }
}
