// One render queue and one pair of observers per window, shared by every page.

type Job = { element: Element; run: () => Promise<void> }

const pending = new Set<Job>()
let running = 0

/** Runs `draw` in its turn, nearest the viewport first. Returns its cancel. */
export function enqueue(
  element: Element,
  draw: (signal: AbortSignal) => Promise<void>,
): () => void {
  const aborted = new AbortController()
  const job = { element, run: () => draw(aborted.signal) }
  pending.add(job)
  pump()
  return () => {
    pending.delete(job)
    aborted.abort()
  }
}

function pump() {
  while (running < 2 && pending.size) {
    const job = [...pending].reduce((a, b) =>
      distance(b.element) < distance(a.element) ? b : a,
    )
    pending.delete(job)
    running++
    void job.run().finally(() => {
      running--
      pump()
    })
  }
}

function distance(element: Element) {
  const { top, bottom } = element.getBoundingClientRect()
  return Math.max(0, top - innerHeight, -bottom)
}

const watched = new Map<Element, (near: boolean) => void>()
let observers: IntersectionObserver[] | undefined

/** Calls `set(true)` within one screen of the viewport, `set(false)` beyond three. */
export function watch(
  element: Element,
  set: (near: boolean) => void,
): () => void {
  if (!observers) {
    observers = [observer('100%', true), observer('300%', false)]
    // Released pages render again to print.
    addEventListener('beforeprint', () => watched.forEach((set) => set(true)))
  }
  watched.set(element, set)
  observers.forEach((o) => o.observe(element))
  return () => {
    watched.delete(element)
    observers!.forEach((o) => o.unobserve(element))
  }
}

// Inside its margin, the near observer sets near; outside, the far one clears it.
function observer(margin: string, near: boolean) {
  return new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries)
        if (isIntersecting === near) watched.get(target)?.(near)
    },
    { rootMargin: `${margin} 0px` },
  )
}
