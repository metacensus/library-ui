import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef } from 'react'
import type { PdfAnchor } from './anchor.js'
import { pageTexts, quadsBetween, type PageText } from './text.js'

const context = 32

/**
 * Gives `onSelect` each selection with both ends in `root`'s text, once the
 * pointer or Shift making it is released, and null once the one it gave is gone.
 */
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
    let given = false
    let asked = 0
    const give = (anchor: PdfAnchor | null) => {
      if (!anchor && !given) return
      given = !!anchor
      latest.current?.(anchor)
    }
    const settle = () => {
      if (!changed || pressed || shifted) return
      changed = false
      const ask = ++asked
      anchorOf(getSelection()!, root, text, loaded.sha256)
        .then((anchor) => ask === asked && give(anchor))
        .catch((error) => ask === asked && onError(error))
    }
    const selected = () => {
      const selection = getSelection()
      changed = !!selection?.rangeCount && !selection.isCollapsed
      if (changed) return settle()
      asked++
      give(null)
    }
    const input = (event: PointerEvent | KeyboardEvent) => {
      if (event.type.startsWith('pointer'))
        pressed = event.type === 'pointerdown'
      shifted = event.shiftKey
      settle()
    }
    const inputs = [
      'pointerdown',
      'pointerup',
      'pointercancel',
      'keydown',
      'keyup',
    ]
    document.addEventListener('selectionchange', selected)
    for (const type of inputs)
      document.addEventListener(type, input as EventListener, true)
    return () => {
      asked++
      document.removeEventListener('selectionchange', selected)
      for (const type of inputs)
        document.removeEventListener(type, input as EventListener, true)
    }
  }, [root, loaded, listening])
}

/** Whether the selection, an end of it or the text between, lies in `node`. */
export const holds = (node: Node | null) => {
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
  selection: Selection,
  root: Element,
  text: (page: number) => Promise<PageText>,
  sha256: string,
): Promise<PdfAnchor | null> {
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
