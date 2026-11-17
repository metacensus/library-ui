import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { typed } from './document.js'
import type { PdfError, PdfMark, PdfPoint } from './index.js'
import { hit, Marks, place } from './marks.js'
import { enqueue, watch } from './queue.js'

/** What a page shows: `viewport` drawn into `width` by `height` CSS px. */
export type View = { viewport: PageViewport; width: number; height: number }

/** The iOS limit on one canvas; past it a page renders softer. */
const maxPixels = 16_777_216

/** One page: canvas, the text layer unless cropped, and marks, under one viewport. */
export function PageView({
  page,
  view,
  cropped,
  name,
  marks,
  current,
  onMarkActivate,
  onPageClick,
  onError,
}: {
  page?: PDFPageProxy
  view?: View
  cropped: boolean
  name: string
  marks: PdfMark[]
  current?: string
  onMarkActivate?: (id: string) => void
  onPageClick?: (point: PdfPoint) => void
  onError: (error: PdfError) => void
}) {
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const placed = useMemo(
    () => (page && view ? place(marks, page.pageNumber, view.viewport) : []),
    [marks, page, view],
  )

  useEffect(() => watch(frame.current!, setNear), [])

  useEffect(() => {
    if (!near || !page || !view) return
    const layer = cropped ? undefined : text.current!
    return enqueue(frame.current!, (signal) =>
      draw(page, view, canvas.current!, layer, signal).catch((error) => {
        if (!signal.aborted) onError(typed(error))
      }),
    )
  }, [near, page, view, cropped])

  useEffect(() => {
    if (near) return
    canvas.current!.width = 0
    text.current?.replaceChildren()
    page?.cleanup()
  }, [near, page])

  const click = (event: MouseEvent<HTMLDivElement>) => {
    if (!view || !page || !getSelection()?.isCollapsed) return
    const { left, top } = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - left, event.clientY - top]
    const under = hit(placed, point)
    if (under) return onMarkActivate?.(under.mark.id)
    const [x, y] = view.viewport.convertToPdfPoint(...point) as [number, number]
    onPageClick?.({ page: page.pageNumber, x, y })
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
      {!cropped && (
        <div
          ref={text}
          className="mc-pdf-text"
          style={
            view &&
            ({
              '--total-scale-factor':
                view.viewport.scale * view.viewport.userUnit,
            } as CSSProperties)
          }
        />
      )}
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

async function draw(
  page: PDFPageProxy,
  { viewport, width, height }: View,
  canvas: HTMLCanvasElement,
  text: HTMLElement | undefined,
  signal: AbortSignal,
) {
  const scale = Math.min(
    devicePixelRatio,
    Math.sqrt(maxPixels / (width * height)),
  )
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const task = page.render({
    canvas,
    viewport,
    transform: [scale, 0, 0, scale, 0, 0],
  })
  signal.addEventListener('abort', () => task.cancel())
  await task.promise
  if (!text || signal.aborted) return
  const { TextLayer } = await import('pdfjs-dist')
  text.replaceChildren()
  const layer = new TextLayer({
    textContentSource: page.streamTextContent(),
    container: text,
    viewport,
  })
  signal.addEventListener('abort', () => layer.cancel())
  await layer.render()
}
