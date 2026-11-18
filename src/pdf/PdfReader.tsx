import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '../tools/cn.js'
import { open, typed } from './document.js'
import type {
  PdfError,
  PdfMark,
  PdfPoint,
  PdfResolution,
  PdfSource,
  PdfTarget,
} from './index.js'
import { toView } from './marks.js'
import { Failed, PageView, pageName } from './page.js'
import { watch } from './queue.js'
import { quadsOn, resolve } from './resolve.js'
import { pageAt, placeOf, restore, type Place } from './scroll.js'
import { Toolbar, within } from './toolbar.js'

type Props = {
  source: PdfSource
  marks?: PdfMark[]
  /** A mark id, drawn heavier. */
  current?: string
  /** Scrolled to on load, when its page or mark changes, and when `jump` does. */
  target?: PdfTarget
  jump?: number
  /** The page under the middle of the view. */
  onPageChange?: (page: { index: number; label?: string }) => void
  onResolve?: (resolutions: PdfResolution[]) => void
  /** Makes marks buttons. */
  onMarkActivate?: (id: string) => void
  onPageClick?: (point: PdfPoint) => void
  onError?: (error: PdfError) => void
  /** The frame, which sets the reader's height. */
  className?: string
}

type Loaded = {
  document: PDFDocumentProxy
  sha256: string
  labels: string[] | null
  /** False once released, when its renders end in errors that are no failure. */
  live: () => boolean
}

type Goal = { page: number; mark?: string }

/** CSS px around and between pages. */
const gap = 8

/** A whole PDF that scrolls inside its frame, with marks on its pages. */
export function PdfReader({
  source,
  marks = [],
  current,
  target,
  jump,
  onPageChange,
  onResolve,
  onMarkActivate,
  onPageClick,
  onError,
  className,
}: Props) {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded>()
  const [error, setError] = useState<PdfError>()
  const [fetched, setFetched] = useState<Record<number, PDFPageProxy>>({})
  const [zoom, setZoom] = useState(1)
  const [shown, setShown] = useState(1)
  const [said, setSaid] = useState('')
  const [goal, setGoal] = useState<Goal>()
  const reached = useRef<Goal>()
  const place = useRef<Place>()
  // Where the view stood when `place` was last set; any scroll away is a person's.
  const scrolledTo = useRef<{ top: number; left: number }>()

  const fail = (error: unknown) => {
    const failure = typed(error)
    setError(failure)
    onError?.(failure)
  }
  const failOpen = (error: unknown) => loaded?.live() && fail(error)

  // Callers pass new objects each render, so effects key on their contents.
  const file = 'url' in source ? source.url : source.data
  useEffect(() => {
    const lease = open(source)
    let live = true
    Promise.all([lease.document, lease.sha256])
      .then(async ([document, sha256]) => {
        const [first, labels] = await Promise.all([
          document.getPage(1),
          document.getPageLabels(),
        ])
        if (!live) return
        setFetched({ 1: first })
        setLoaded({ document, sha256, labels, live: () => live })
      })
      .catch((error) => live && fail(error))
    return () => {
      live = false
      lease.release()
      place.current = undefined
      setLoaded(undefined)
      setFetched({})
    }
  }, [file, source.sha256, attempt])

  // Page 1 comes with the document; the rest are fetched as they near the view.
  const fetch = useMemo(() => {
    if (!loaded) return
    const asked = new Set([1])
    return (n: number) => {
      if (asked.has(n)) return
      asked.add(n)
      loaded.document
        .getPage(n)
        .then(
          (page) =>
            loaded.live() && setFetched((all) => ({ ...all, [n]: page })),
          failOpen,
        )
    }
  }, [loaded])

  const [resolved, setResolved] = useState<[Loaded, PdfResolution[]]>()
  const resolutions = resolved?.[0] === loaded ? resolved?.[1] : undefined
  const anchors = JSON.stringify(marks.map(({ id, anchor }) => [id, anchor]))
  useEffect(() => {
    if (!loaded) return
    let live = true
    Promise.resolve(resolve(marks, loaded.sha256))
      .then((resolutions) => live && setResolved([loaded, resolutions]))
      .catch((error) => live && fail(error))
    return () => {
      live = false
    }
  }, [loaded, anchors])
  useEffect(() => {
    if (resolutions) onResolve?.(resolutions)
  }, [JSON.stringify(resolutions)])
  const drawn = useMemo(() => {
    const placed = new Map(resolutions?.map((r) => [r.id, r]))
    return marks.flatMap((mark) => {
      const { status, anchor = mark.anchor } = placed.get(mark.id) ?? {}
      return status && status !== 'orphan' ? [{ ...mark, anchor }] : []
    })
  }, [marks, resolutions])

  const now = useRef({ zoom, scale: 0 })
  const capture = (at?: number) => {
    if (!box || !now.current.scale) return
    place.current = placeOf(box, now.current.scale, at)
    scrolledTo.current = { top: box.scrollTop, left: box.scrollLeft }
  }
  // A scroll the reader did not make sets the place, even one whose event has
  // yet to fire, so it is read here, before this render changes any size.
  const follow = () => {
    const to = scrolledTo.current
    if (
      box &&
      to &&
      Math.abs(box.scrollTop - to.top) <= 1 &&
      Math.abs(box.scrollLeft - to.left) <= 1
    )
      return
    capture()
  }
  follow()

  const base = useMemo(() => fetched[1]?.getViewport({ scale: 1 }), [fetched])
  const scale = base && width ? (zoom * (width - 2 * gap)) / base.width : 0
  now.current = { zoom, scale }

  useEffect(() => {
    if (!box) return
    // Only the width sets the scale, so a scrollbar's coming or going is no
    // reason to measure the place afresh.
    let wide = 0
    const observer = new ResizeObserver(([entry]) => {
      const { width } = entry!.contentRect
      if (width === wide) return
      wide = width
      capture()
      setWidth(width)
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box])

  const go = (page: number, mark?: string) => {
    if (!loaded || !fetch) return
    const n = Math.min(loaded.document.numPages, Math.max(1, page))
    fetch(n)
    setGoal({ page: n, mark })
  }

  // A mark is found once the marks resolve.
  const targeted =
    target &&
    ('page' in target ? `page ${target.page}` : resolutions && target.mark)
  useEffect(() => {
    if (!target || !targeted || !loaded) return
    if ('page' in target) return go(target.page)
    const mark = drawn.find(({ id }) => id === target.mark)
    const pages = mark?.anchor.selector.flatMap((selector) =>
      selector.type === 'PdfQuadSelector'
        ? selector.quads.map(({ page }) => page)
        : [],
    )
    if (pages?.length) go(Math.min(...pages), target.mark)
  }, [loaded, targeted, jump])

  // Before paint, after every change of size: to a goal, once its mark's page
  // is fetched, else back to the reader's place.
  useLayoutEffect(() => {
    if (!box || !scale) return
    const page = goal && fetched[goal.page]
    if (goal && goal !== reached.current && (page || !goal.mark)) {
      reached.current = goal
      place.current = aim(box, goal, scale, drawn, page)
    }
    if (place.current) restore(box, place.current, scale)
    place.current ??= placeOf(box, scale)
    scrolledTo.current = { top: box.scrollTop, left: box.scrollLeft }
    setShown(pageAt(box, box.clientHeight / 2))
  }, [box, scale, fetched, goal])

  const scrolled = () => {
    if (!box || !scale) return
    follow()
    setShown(pageAt(box, box.clientHeight / 2))
  }

  useEffect(() => {
    if (!loaded) return
    onPageChange?.({ index: shown, label: loaded.labels?.[shown - 1] })
    const settled = setTimeout(
      () => setSaid(`Page ${shown} of ${loaded.document.numPages}`),
      500,
    )
    return () => clearTimeout(settled)
  }, [shown, loaded])

  const zoomTo = useCallback(
    (to: number, at?: number) => {
      capture(at)
      setZoom(within(to))
    },
    [box],
  )

  // Pinch and ctrl+wheel scale the pages by a transform, from the view's top,
  // then zoom once the gesture ends.
  useEffect(() => {
    if (!box) return
    let ratio = 1
    let at = 0
    let span = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    const preview = (by: number, from: number) => {
      const { zoom } = now.current
      ratio = within(zoom * by) / zoom
      at = from
      const pages = sheet.current!
      pages.style.transformOrigin = `${box.scrollLeft + at}px ${box.scrollTop}px`
      pages.style.transform = `scale(${ratio})`
    }
    const commit = () => {
      sheet.current!.style.transform = ''
      zoomTo(now.current.zoom * ratio, at)
      ratio = 1
    }
    const left = (x: number) => x - box.getBoundingClientRect().left
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !sheet.current) return
      event.preventDefault()
      preview(ratio * Math.exp(-event.deltaY / 200), left(event.clientX))
      clearTimeout(idle)
      idle = setTimeout(commit, 200)
    }
    const touch = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]]
      if (a && b && !event.touches[2] && sheet.current) {
        event.preventDefault()
        const apart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        if (span) preview(apart / span, left((a.clientX + b.clientX) / 2))
        else span = apart
      } else if (span) {
        span = 0
        commit()
      }
    }
    const touches = ['touchstart', 'touchmove', 'touchend', 'touchcancel']
    box.addEventListener('wheel', wheel, { passive: false })
    for (const type of touches)
      box.addEventListener(type, touch as EventListener, { passive: false })
    return () => {
      clearTimeout(idle)
      box.removeEventListener('wheel', wheel)
      for (const type of touches)
        box.removeEventListener(type, touch as EventListener)
    }
  }, [box, zoomTo])

  const pages = loaded?.document.numPages ?? 0
  return (
    <div
      className={cn('mc-pdf-reader', className)}
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
          {loaded && (
            <Toolbar
              page={shown}
              pages={pages}
              zoom={zoom}
              onPage={go}
              onZoom={zoomTo}
            />
          )}
          <div
            ref={setBox}
            className="mc-pdf-scroll"
            tabIndex={0}
            onScroll={scrolled}
          >
            {box && base && scale > 0 && fetch && (
              <div
                ref={sheet}
                className="mc-pdf-pages"
                style={{ padding: gap, gap }}
              >
                {Array.from({ length: pages }, (_, i) => (
                  <Slot
                    key={i}
                    page={i + 1}
                    fetched={fetched[i + 1]}
                    base={base}
                    scale={scale}
                    fetch={fetch}
                    root={box}
                    name={pageName(i + 1, loaded!.labels?.[i])}
                    marks={drawn}
                    current={current}
                    onMarkActivate={onMarkActivate}
                    onPageClick={onPageClick}
                    onError={failOpen}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="mc-pdf-said" aria-live="polite">
            {said}
          </div>
        </>
      )}
    </div>
  )
}

/** Where the view goes for `goal`: a mark's centre to the view's, once its
 *  page is fetched, else the page's top to the view's top. */
function aim(
  box: Element,
  { page: n, mark: id }: Goal,
  scale: number,
  marks: PdfMark[],
  page?: PDFPageProxy,
): Place {
  const mark = marks.find((mark) => mark.id === id)
  if (!mark || !page) return { page: n, x: 0, y: 0, at: 0, scale }
  const viewport = page.getViewport({ scale })
  const points = quadsOn(mark.anchor, n).flatMap((quad) =>
    toView(viewport, quad),
  )
  const middle = (values: number[]) =>
    (Math.min(...values) + Math.max(...values)) / 2
  return {
    page: n,
    x: middle(points.map(([x]) => x)),
    y: middle(points.map(([, y]) => y)) - box.clientHeight / 2,
    at: box.clientWidth / 2,
    scale,
  }
}

/** One page: a placeholder at page 1's size until it nears the view, then the
 *  page itself. */
function Slot({
  page,
  fetched,
  base,
  scale,
  fetch,
  root,
  ...shown
}: {
  page: number
  fetched?: PDFPageProxy
  base: PageViewport
  scale: number
  fetch: (page: number) => void
  root: Element
  name: string
  marks: PdfMark[]
  current?: string
  onMarkActivate?: (id: string) => void
  onPageClick?: (point: PdfPoint) => void
  onError: (error: unknown) => void
}) {
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!fetched)
      return watch(slot.current!, (near) => near && fetch(page), root)
  }, [fetched, fetch, root, page])
  const view = useMemo(() => {
    if (!fetched) return
    const viewport = fetched.getViewport({ scale })
    return {
      page: fetched,
      viewport,
      width: viewport.width,
      height: viewport.height,
    }
  }, [fetched, scale])
  const size = view ?? {
    width: base.width * scale,
    height: base.height * scale,
  }
  return (
    <div
      ref={slot}
      className="mc-pdf-slot"
      style={{ width: size.width, height: size.height }}
    >
      {view && <PageView view={view} cropped={false} root={root} {...shown} />}
    </div>
  )
}
