import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '../tools/Button.js'
import { cn } from '../tools/cn.js'
import { open, typed } from './document.js'
import type {
  PdfAnchor,
  PdfError,
  PdfMark,
  PdfPoint,
  PdfResolution,
  PdfSource,
} from './index.js'
import { toView } from './marks.js'
import { Failed, PageView, pageName, useDrawn, type View } from './page.js'
import { quadsOn } from './resolve.js'

type Props = {
  source: PdfSource
  /** 1-based. */
  page: number
  /** Shows this anchor's quads on `page`, plus 30 pt; absent, the whole page. */
  crop?: PdfAnchor
  /** The cropped image's accessible name. */
  label?: string
  marks?: PdfMark[]
  /** A mark id, drawn heavier. */
  current?: string
  onResolve?: (resolutions: PdfResolution[]) => void
  /** Makes marks buttons. */
  onMarkActivate?: (id: string) => void
  onPageClick?: (point: PdfPoint) => void
  onError?: (error: PdfError) => void
  className?: string
}

type Loaded = {
  document: PDFDocumentProxy
  page: PDFPageProxy
  sha256: string
  printed?: string
}

/** One page of a PDF, cropped to a passage or whole, with marks on it. */
export function PdfPage({
  source,
  page,
  crop,
  label,
  marks = [],
  current,
  onResolve,
  onMarkActivate,
  onPageClick,
  onError,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const id = useId()
  const [width, setWidth] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded>()
  const [error, setError] = useState<PdfError>()
  const [expanded, setExpanded] = useState(false)
  const toggled = useRef(false)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry!.contentRect.width),
    )
    observer.observe(host.current!)
    return () => observer.disconnect()
  }, [])

  // Callers pass new objects each render, so effects key on their contents.
  const file = 'url' in source ? source.url : source.data
  useEffect(() => {
    const lease = open(source)
    let live = true
    Promise.all([lease.document, lease.sha256])
      .then(async ([document, sha256]) => {
        const [shown, labels] = await Promise.all([
          document.getPage(page),
          document.getPageLabels(),
        ])
        if (live)
          setLoaded({
            document,
            page: shown,
            sha256,
            printed: labels?.[page - 1],
          })
      })
      .catch((error) => live && fail(error))
    return () => {
      live = false
      lease.release()
      setLoaded(undefined)
    }
  }, [file, source.sha256, page, attempt])

  const fail = (error: unknown) => {
    const failure = typed(error)
    setError(failure)
    onError?.(failure)
  }

  const drawn = useDrawn(marks, loaded, onResolve, fail)
  const shown = crop && !expanded ? quadsOn(crop, page) : []
  const cropped = shown.length > 0
  const view = useMemo(
    () => (loaded && width > 0 ? fit(loaded.page, width, shown) : undefined),
    [loaded, width, JSON.stringify(shown)],
  )

  useEffect(() => {
    if (!toggled.current || !view) return
    toggled.current = false
    host
      .current!.querySelector('.mc-pdf-mark')
      ?.scrollIntoView({ block: 'nearest' })
  }, [view])

  return (
    <div
      ref={host}
      className={cn('mc-pdf-page', className)}
      aria-busy={!loaded && !error}
    >
      {error ? (
        <Failed
          onRetry={() => {
            setError(undefined)
            setAttempt((n) => n + 1)
          }}
        />
      ) : (
        <>
          <div id={id}>
            <PageView
              view={view}
              cropped={cropped}
              name={
                cropped
                  ? (label ?? `Page ${page}`)
                  : pageName(page, loaded?.printed)
              }
              marks={drawn ?? []}
              current={current}
              onMarkActivate={onMarkActivate}
              onPageClick={onPageClick}
              onError={fail}
            />
          </div>
          {crop && (
            <Button
              variant="text"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => {
                toggled.current = true
                setExpanded(!expanded)
              }}
            >
              Whole page
            </Button>
          )}
        </>
      )}
    </div>
  )
}

const margin = 30
const maxScale = 2

function fit(page: PDFPageProxy, width: number, quads: number[][]): View {
  const whole = page.getViewport({ scale: 1 })
  const [left, top, right, bottom] = quads.length
    ? around(page, whole, quads)
    : [0, 0, whole.width, whole.height]
  const scale = Math.min(maxScale, width / (right - left))
  return {
    page,
    viewport: page.getViewport({
      scale,
      offsetX: -left * scale,
      offsetY: -top * scale,
    }),
    width: (right - left) * scale,
    height: (bottom - top) * scale,
  }
}

function around(
  page: PDFPageProxy,
  whole: PageViewport,
  quads: number[][],
): [left: number, top: number, right: number, bottom: number] {
  const [x0, y0, x1, y1] = page.view as [number, number, number, number]
  const xs = quads.flatMap((q) => q.filter((_, i) => i % 2 === 0))
  const ys = quads.flatMap((q) => q.filter((_, i) => i % 2 === 1))
  const l = Math.max(x0, Math.min(...xs) - margin)
  const b = Math.max(y0, Math.min(...ys) - margin)
  const r = Math.min(x1, Math.max(...xs) + margin)
  const t = Math.min(y1, Math.max(...ys) + margin)
  const corners = toView(whole, [l, b, r, b, r, t, l, t])
  const cxs = corners.map(([x]) => x)
  const cys = corners.map(([, y]) => y)
  return [
    Math.min(...cxs),
    Math.min(...cys),
    Math.max(...cxs),
    Math.max(...cys),
  ]
}
