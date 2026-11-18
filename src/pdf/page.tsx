import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Button } from '../tools/Button.js'
import { Notice } from '../tools/Notice.js'
import type { PdfMark, PdfPoint } from './index.js'
import { hit, Marks, place } from './marks.js'
import { enqueue, watch } from './queue.js'

/** What a page shows: `viewport` drawn into `width` by `height` CSS px. */
export type View = {
  page: PDFPageProxy
  viewport: PageViewport
  width: number
  height: number
}

/** A whole page's accessible name, with its printed label when that differs. */
export const pageName = (page: number, printed?: string) =>
  printed && printed !== String(page)
    ? `Page ${page}, printed page ${printed}`
    : `Page ${page}`

export const Failed = ({ onRetry }: { onRetry: () => void }) => (
  <Notice title="This PDF could not be shown.">
    <Button variant="secondary" onClick={onRetry}>
      Retry
    </Button>
  </Notice>
)

/** The iOS limit on one canvas; past it a page renders softer. */
const maxPixels = 16_777_216

export function PageView({
  view,
  cropped,
  name,
  marks,
  current,
  onMarkActivate,
  onPageClick,
  onError,
  root,
}: {
  view?: View
  cropped: boolean
  name: string
  marks: PdfMark[]
  current?: string
  onMarkActivate?: (id: string) => void
  onPageClick?: (point: PdfPoint) => void
  onError: (error: unknown) => void
  /** The box the page scrolls in; absent, the window. */
  root?: Element
}) {
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const placed = useMemo(
    () => (view ? place(marks, view.page.pageNumber, view.viewport) : []),
    [marks, view],
  )

  useEffect(() => watch(frame.current!, setNear, root), [root])

  useEffect(() => {
    if (!near || !view) return
    const layer = cropped ? undefined : text.current!
    return enqueue(
      frame.current!,
      (signal) =>
        draw(view, canvas.current!, layer, signal).catch((error) => {
          if (!signal.aborted) onError(error)
        }),
      root,
    )
  }, [near, view, cropped, root])

  useEffect(() => {
    if (near) return
    canvas.current!.width = 0
    text.current?.replaceChildren()
    view?.page.cleanup()
  }, [near, view])

  useEffect(() => {
    const shown = canvas.current!
    return () => {
      shown.width = 0
    }
  }, [])

  const click = (event: MouseEvent<HTMLDivElement>) => {
    if (!view || !getSelection()?.isCollapsed) return
    const { left, top } = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - left, event.clientY - top]
    const under = hit(placed, point)
    if (under) return onMarkActivate?.(under.mark.id)
    const [x, y] = view.viewport.convertToPdfPoint(...point) as [number, number]
    onPageClick?.({ page: view.page.pageNumber, x, y })
  }

  const size = view && { width: view.width, height: view.height }
  return (
    <div
      ref={frame}
      className="mc-pdf-view"
      role={cropped ? undefined : 'region'}
      aria-label={cropped ? undefined : name}
      style={size}
      onClick={click}
    >
      <canvas
        ref={canvas}
        role={cropped ? 'img' : undefined}
        aria-label={cropped ? name : undefined}
        aria-hidden={cropped ? undefined : true}
        width={0}
        height={0}
        style={size}
      />
      {!cropped && <div ref={text} />}
      {view && (
        <Marks
          placed={placed}
          width={view.width}
          height={view.height}
          current={current}
          onActivate={onMarkActivate}
        />
      )}
    </div>
  )
}

// Both layers are built detached and swapped in at once, so the page shown
// stays until its replacement is ready.
async function draw(
  { page, viewport, width, height }: View,
  canvas: HTMLCanvasElement,
  text: HTMLElement | undefined,
  signal: AbortSignal,
) {
  const scale = Math.min(
    devicePixelRatio,
    Math.sqrt(maxPixels / (width * height)),
  )
  const raster = document.createElement('canvas')
  raster.width = Math.round(width * scale)
  raster.height = Math.round(height * scale)
  try {
    const task = page.render({
      canvas: raster,
      viewport,
      transform: [scale, 0, 0, scale, 0, 0],
    })
    signal.addEventListener('abort', () => task.cancel())
    await task.promise
    const layer = text && document.createElement('div')
    if (layer) {
      const { TextLayer } = await import('pdfjs-dist')
      if (signal.aborted) return
      layer.className = 'mc-pdf-text'
      layer.style.setProperty(
        '--total-scale-factor',
        String(viewport.scale * viewport.userUnit),
      )
      const built = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport,
      })
      signal.addEventListener('abort', () => built.cancel())
      await built.render()
    }
    if (signal.aborted) return
    canvas.width = raster.width
    canvas.height = raster.height
    canvas.getContext('2d')!.drawImage(raster, 0, 0)
    if (layer) text!.replaceChildren(layer)
  } finally {
    raster.width = 0
  }
}
