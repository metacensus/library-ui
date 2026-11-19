// One render queue per window, and one pair of observers per scroll root,
// shared by every page.

type Job = { element: Element; root?: Element; run: () => Promise<void> }

const pending = new Set<Job>()
let running = 0

/** Runs `draw` in its turn, nearest the viewport first. Returns its cancel. */
export function enqueue(
  element: Element,
  draw: (signal: AbortSignal) => Promise<void>,
  root?: Element,
): () => void {
  const aborted = new AbortController()
  const job = { element, root, run: () => draw(aborted.signal) }
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
      distance(b) < distance(a) ? b : a,
    )
    pending.delete(job)
    running++
    void job.run().finally(() => {
      running--
      pump()
    })
  }
}

function distance({ element, root }: Job) {
  const { top, bottom } = element.getBoundingClientRect()
  const view = root?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight }
  return Math.max(0, top - view.bottom, view.top - bottom)
}

const watched = new Map<Element, (near: boolean) => void>()
const observers = new WeakMap<Element | Document, IntersectionObserver[]>()
let listening = false

/** Calls `set(true)` within one screen of `root`, `set(false)` beyond three. */
export function watch(
  element: Element,
  set: (near: boolean) => void,
  root?: Element,
): () => void {
  if (!listening) {
    listening = true
    // Every watched page draws to print, released or never opened.
    addEventListener('beforeprint', () => watched.forEach((set) => set(true)))
  }
  const key = root ?? document
  const pair = observers.get(key) ?? [
    observer('100%', true, root),
    observer('300%', false, root),
  ]
  observers.set(key, pair)
  watched.set(element, set)
  pair.forEach((o) => o.observe(element))
  return () => {
    watched.delete(element)
    pair.forEach((o) => o.unobserve(element))
  }
}

function observer(margin: string, near: boolean, root?: Element) {
  return new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries)
        if (isIntersecting === near) watched.get(target)?.(near)
    },
    { root, rootMargin: `${margin} 0px` },
  )
}
