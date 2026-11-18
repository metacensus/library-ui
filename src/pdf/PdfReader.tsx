import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import {
  type ComponentProps,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '../tools/cn.js'
import { open } from './document.js'
import type { PdfMark, PdfTarget } from './index.js'
import {
  firstPage,
  ReaderRoving,
  readingOrder,
  step,
  toView,
  type Roving,
} from './marks.js'
import type { PdfPage } from './PdfPage.js'
import { Failed, PageView, pageName, useAttempt, useDrawn } from './page.js'
import { watch } from './queue.js'
import { quadsOn } from './resolve.js'
import { pageAt, placeOf, restore, type Place } from './scroll.js'
import { Toolbar, within } from './toolbar.js'

type Props = Omit<
  ComponentProps<typeof PdfPage>,
  'page' | 'crop' | 'label' | 'className'
> & {
  /** Scrolled to on load, when its page or mark changes, and when `jump` does. */
  target?: PdfTarget
  jump?: number
  /** The page under the middle of the view. */
  onPageChange?: (page: { index: number; label?: string }) => void
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
  const [loaded, setLoaded] = useState<Loaded>()
  const { attempt, error, fail, retry } = useAttempt(onError)
  const [fetched, setFetched] = useState<Record<number, PDFPageProxy>>({})
  const [zoom, setZoom] = useState(1)
  const [shown, setShown] = useState(1)
  const [said, setSaid] = useState('')
  const [goal, setGoal] = useState<Goal>()
  const reached = useRef<Goal>()
  const wanted = useRef<Goal>()
  const place = useRef<Place>()
  // Where the view stood when `place` was last set; any scroll away is a person's.
  const scrolledTo = useRef<{ top: number; left: number }>()

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

  const drawn = useDrawn(marks, loaded, onResolve, fail)

  const now = useRef({ zoom, scale: 0 })
  // A pinch or ctrl+wheel in progress: the pages wear a transform until the
  // zoom it ends at is drawn, so no rect is read while it is set.
  const gesture = useRef<{ ratio: number; at: number; done?: boolean }>()
  // A new place supersedes a jump still waiting for its page.
  const capture = (at?: number) => {
    if (!box || !now.current.scale) return
    place.current = placeOf(box, now.current.scale, at)
    scrolledTo.current = { top: box.scrollTop, left: box.scrollLeft }
    reached.current = wanted.current
  }
  // A scroll the reader did not make sets the place, even one whose event has
  // yet to fire, so it is read here, before this render changes any size.
  const follow = () => {
    const to = scrolledTo.current
    if (!box || !to || gesture.current) return
    if (
      Math.abs(box.scrollTop - to.top) > 1 ||
      Math.abs(box.scrollLeft - to.left) > 1
    )
      capture()
  }
  follow()

  const first = fetched[1]
  const base = useMemo(() => first?.getViewport({ scale: 1 }), [first])
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
    wanted.current = { page: n, mark }
    setGoal(wanted.current)
  }

  // A mark's page is known once the marks resolve.
  const mark = target && 'mark' in target ? target.mark : undefined
  const to =
    target && 'page' in target
      ? target.page
      : firstPage(drawn?.find(({ id }) => id === mark))
  useEffect(() => {
    if (loaded && to) go(to, mark)
  }, [loaded, mark, to, jump])

  // Before paint, after every change of size: to a goal, once its mark's page
  // is fetched, else back to the reader's place.
  useLayoutEffect(() => {
    if (!box || !scale || (gesture.current && !gesture.current.done)) return
    const page = goal && fetched[goal.page]
    if (goal && goal !== reached.current && (page || !goal.mark)) {
      reached.current = goal
      place.current = aim(box, goal, scale, drawn ?? [], page)
    }
    if (gesture.current) {
      sheet.current!.style.transform = ''
      gesture.current = undefined
    }
    if (place.current) restore(box, place.current, scale)
    place.current ??= placeOf(box, scale)
    scrolledTo.current = { top: box.scrollTop, left: box.scrollLeft }
    setShown(pageAt(box, box.clientHeight / 2))
  }, [box, scale, fetched, goal])

  // After the effect above, so a mark's focus scrolls from the restored place.
  const roving = useRoving(drawn, fetched, current, box, go)

  const scrolled = () => {
    if (!box || !scale || gesture.current) return
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

  const zoomTo = (to: number) => {
    capture()
    setZoom(within(to))
  }

  // Pinch and ctrl+wheel scale the pages by a transform, from the view's top,
  // then zoom once the gesture ends.
  useEffect(() => {
    if (!box) return
    let span = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    const preview = (by: number, at: number) => {
      if (gesture.current?.done) return
      if (!gesture.current) capture(at)
      const { zoom } = now.current
      const ratio = within(zoom * by) / zoom
      gesture.current = { ratio, at }
      const pages = sheet.current!
      pages.style.transformOrigin = `${box.scrollLeft + at}px ${box.scrollTop}px`
      pages.style.transform = `scale(${ratio})`
    }
    // The layout effect drawing the new zoom takes the transform off.
    const commit = () => {
      const { zoom } = now.current
      const to = within(zoom * gesture.current!.ratio)
      if (to === zoom) {
        sheet.current!.style.transform = ''
        gesture.current = undefined
      } else {
        gesture.current!.done = true
        setZoom(to)
      }
    }
    const left = (x: number) => x - box.getBoundingClientRect().left
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !sheet.current) return
      event.preventDefault()
      preview(
        (gesture.current?.ratio ?? 1) * Math.exp(-event.deltaY / 200),
        left(event.clientX),
      )
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
  }, [box])

  const pages = loaded?.document.numPages ?? 0
  return (
    <div
      className={cn('mc-pdf-reader', className)}
      aria-busy={!loaded && !error}
    >
      {error ? (
        <Failed onRetry={retry} />
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
            role="region"
            aria-label="Document"
            tabIndex={0}
            onScroll={scrolled}
          >
            {box && base && scale > 0 && fetch && (
              <div
                ref={sheet}
                className="mc-pdf-pages"
                style={{ padding: gap, gap }}
              >
                <ReaderRoving.Provider value={roving}>
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
                      marks={drawn ?? []}
                      current={current}
                      onMarkActivate={onMarkActivate}
                      onPageClick={onPageClick}
                      onError={failOpen}
                    />
                  ))}
                </ReaderRoving.Provider>
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

/** One tab stop over every page's marks, kept on a fetched page, since only
 *  those are in the DOM. A move onto a page not yet fetched goes there first. */
function useRoving(
  marks: PdfMark[] | undefined,
  fetched: Record<number, PDFPageProxy>,
  current: string | undefined,
  box: Element | null,
  go: (page: number) => void,
): Roving {
  const [focused, setFocused] = useState<string>()
  const [seek, setSeek] = useState<number>()
  const order = useMemo(
    () => readingOrder(marks ?? [], fetched),
    [marks, fetched],
  )
  const stop = [focused, current]
    .map((id) => order.find((mark) => mark.id === id))
    .concat(order)
    .find((mark) => mark && fetched[mark.page])

  useLayoutEffect(() => {
    const to = seek === undefined ? undefined : order[seek]
    if (!box || !to || !fetched[to.page]) return
    setSeek(undefined)
    const slot = box.querySelectorAll('.mc-pdf-slot')[to.page - 1]!
    slot
      .querySelector<SVGGElement>(`[data-mark="${CSS.escape(to.id)}"]`)!
      .focus()
  }, [box, seek, order])

  return {
    isStop: (id, page) => id === stop?.id && page === stop.page,
    focused: setFocused,
    move: (from, key) => {
      const to = step(
        key,
        order.findIndex(({ id }) => id === from),
        order.length,
      )
      if (to === undefined) return false
      if (!fetched[order[to]!.page]) go(order[to]!.page)
      setSeek(to)
      return true
    },
  }
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
}: Omit<ComponentProps<typeof PageView>, 'view' | 'cropped' | 'root'> & {
  page: number
  fetched?: PDFPageProxy
  base: PageViewport
  scale: number
  fetch: (page: number) => void
  root: Element
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
