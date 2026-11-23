// The reader's place, kept as a point on a page rather than a scroll offset, so
// it holds while pages above it change size.

/** The view's top `y` CSS px below page `page`'s top, and its point `at` px from
 *  the left `x` px right of that page's left, measured at `scale`. */
export type Place = {
  page: number
  x: number
  y: number
  at: number
  scale: number
}

const pages = (box: Element) => box.firstElementChild!.children

/** A page's top left in the box's scrolled content. */
function corner(box: Element, page: number) {
  const view = box.getBoundingClientRect()
  const { top, left } = pages(box)[page - 1]!.getBoundingClientRect()
  return {
    top: top - view.top - box.clientTop + box.scrollTop,
    left: left - view.left - box.clientLeft + box.scrollLeft,
  }
}

/** The 1-based page `y` px below the view's top: the last that starts above it. */
export function pageAt(box: Element, y: number): number {
  const at = box.scrollTop + y
  let [low, high] = [1, pages(box).length]
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (corner(box, mid).top <= at) low = mid
    else high = mid - 1
  }
  return low
}

export function placeOf(
  box: Element,
  scale: number,
  at = box.clientWidth / 2,
): Place {
  const page = pageAt(box, 0)
  const { top, left } = corner(box, page)
  return {
    page,
    x: box.scrollLeft + at - left,
    y: box.scrollTop - top,
    at,
    scale,
  }
}

// A scroll that moves nothing is skipped, since some touch browsers end a
// fling at any scroll a page makes.
export function restore(box: Element, place: Place, scale: number): void {
  const { top, left } = corner(box, place.page)
  const ratio = scale / place.scale
  const x = clamp(
    left + place.x * ratio - place.at,
    box.scrollWidth - box.clientWidth,
  )
  const y = clamp(top + place.y * ratio, box.scrollHeight - box.clientHeight)
  if (Math.abs(x - box.scrollLeft) >= 0.5 || Math.abs(y - box.scrollTop) >= 0.5)
    box.scrollTo(x, y)
}

const clamp = (n: number, most: number) =>
  Math.min(Math.max(0, most), Math.max(0, n))
