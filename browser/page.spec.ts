import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import type { PdfAnchor, PdfMark } from '../src/pdf/index.js'
import { anchor, corpus, grow, off, sha256, shown, targets } from './targets.js'

type Card = {
  url?: string
  bytes?: number[]
  sha256?: string
  page: number
  crop?: PdfAnchor
  label?: string
  marks?: PdfMark[]
}

let mounts = 0

/** Mounts a `PdfPage` per card in a `main` `width` px wide, its callbacks
 *  logged to `window.calls`, and waits for React to commit it. */
async function mount(page: Page, cards: Card[], width: number, above = 0) {
  const id = String(++mounts)
  await page.evaluate(
    ({ cards, width, above, id }) => {
      const { pdf, h, mount } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      const calls: unknown[][] = (window.calls = [])
      mount(
        h(
          'main',
          {
            'data-mount': id,
            style: { width: `${width}px`, paddingTop: `${above}px` },
          },
          h('h1', null, 'PdfPage'),
          cards.map(({ url, bytes, sha256, ...card }, i) =>
            h(pdf.PdfPage, {
              key: `${id} ${i}`,
              ...card,
              source: bytes
                ? { data: new Uint8Array(bytes) }
                : { url: url!, sha256: sha256! },
              onResolve: (resolutions) => calls.push(['resolve', resolutions]),
              onMarkActivate: (id) => calls.push(['activate', id]),
              onPageClick: (point) => calls.push(['click', point]),
              onError: ({ kind, status }) =>
                calls.push(['error', kind, status]),
            }),
          ),
        ),
      )
    },
    { cards, width, above, id },
  )
  await page.locator(`main[data-mount="${id}"]`).waitFor()
}

const marksDrawn = (page: Page, count: number) =>
  page.waitForFunction(
    (count) => document.querySelectorAll('.mc-pdf-mark').length === count,
    count,
  )

/** Each view's size, and its marks' shapes' bounds inside it. */
const measure = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.mc-pdf-view')).map((view) => {
      const v = view.getBoundingClientRect()
      return {
        width: v.width,
        height: v.height,
        marks: Array.from(view.querySelectorAll('.mc-pdf-shape')).map(
          (shape) => {
            const r = shape.getBoundingClientRect()
            return {
              left: r.left - v.left,
              top: r.top - v.top,
              right: r.right - v.left,
              bottom: r.bottom - v.top,
            }
          },
        ),
      }
    }),
  )

const margin = 30

for (const dpr of [1, 2, 3]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr })

    test('every mark lands on its truth, cropped, whole and expanded', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      const all = await targets()
      await page.goto('/')
      for (const width of [360, 800, 1600]) {
        const cards = all.flatMap((t) => {
          const at = anchor(t.sha256, t.page, t.points)
          const mark = { id: t.text, anchor: at, label: t.text }
          return [
            { ...t, crop: at, label: t.text, marks: [mark] },
            { ...t, marks: [mark] },
          ]
        })
        await mount(page, cards, width)
        await marksDrawn(page, cards.length)

        const whole = all.map((t) => {
          const scale = Math.min(2, width / t.width)
          return {
            where: `${t.url} page ${t.page} "${t.text}" at ${width} px`,
            width: t.width * scale,
            mark: shown(t.screen, [0, 0], scale),
          }
        })
        const cropped = all.map((t, i) => {
          const pad = margin * t.unit
          const left = Math.max(0, t.screen.left - pad)
          const top = Math.max(0, t.screen.top - pad)
          const right = Math.min(t.width, t.screen.right + pad)
          const bottom = Math.min(t.height, t.screen.bottom + pad)
          const scale = Math.min(2, width / (right - left))
          return {
            where: `${whole[i]!.where}, cropped`,
            width: (right - left) * scale,
            height: (bottom - top) * scale,
            mark: shown(t.screen, [left, top], scale),
          }
        })

        const views = await measure(page)
        cropped.forEach(({ where, width: w, height, mark }, i) => {
          const view = views[2 * i]!
          expect
            .soft(Math.abs(view.width - w), `${where}: width`)
            .toBeLessThanOrEqual(1)
          expect
            .soft(Math.abs(view.height - height), `${where}: height`)
            .toBeLessThanOrEqual(1)
          expect
            .soft(view.width, `${where}: wider than its host`)
            .toBeLessThanOrEqual(width)
          expect
            .soft(off(view.marks[0]!, mark), `${where}: mark`)
            .toBeLessThanOrEqual(1)
        })
        whole.forEach(({ where, width: w, mark }, i) => {
          const view = views[2 * i + 1]!
          expect
            .soft(Math.abs(view.width - w), `${where}: width`)
            .toBeLessThanOrEqual(1)
          expect
            .soft(off(view.marks[0]!, mark), `${where}: mark`)
            .toBeLessThanOrEqual(1)
        })

        for (const toggle of await page
          .getByRole('button', { name: 'Whole page' })
          .all())
          await toggle.click()
        await expect(page.locator('[aria-expanded="true"]')).toHaveCount(
          all.length,
        )
        const expanded = await measure(page)
        whole.forEach(({ where, mark }, i) =>
          expect
            .soft(off(expanded[2 * i]!.marks[0]!, mark), `${where}, expanded`)
            .toBeLessThanOrEqual(1),
        )
      }
    })
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('a crop is an image named by its label, and expands to a page region with its text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 300 })
  const t = (await targets()).find(
    ({ url, page }) => url.endsWith('mixed-sizes.pdf') && page === 3,
  )!
  const at = anchor(t.sha256, t.page, t.points)
  await mount(
    page,
    [
      {
        ...t,
        crop: at,
        label: 'the word sized',
        marks: [{ id: 'm', anchor: at, label: 'm' }],
      },
    ],
    600,
    1000,
  )
  await marksDrawn(page, 1)
  await expect(page.getByRole('img', { name: 'the word sized' })).toBeVisible()
  await expect(page.locator('.mc-pdf-text')).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  const toggle = page.getByRole('button', { name: 'Whole page' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.mc-pdf-mark')).toBeInViewport()

  const region = page.getByRole('region', { name: 'Page 3' })
  await expect(region).toContainText('sized')
  const selected = await region.evaluate((view) => {
    getSelection()!.selectAllChildren(view.querySelector('.mc-pdf-text')!)
    return getSelection()!.toString()
  })
  expect(selected).toContain('sized')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('img', { name: 'the word sized' })).toBeVisible()
})

// Three lines of red ink on black, each 12 pt tall and 4 pt apart, the first
// indented, as a paragraph's start.
const lines: [x0: number, y0: number, x1: number, y1: number][] = [
  [40, 150, 260, 162],
  [20, 134, 260, 146],
  [20, 118, 120, 130],
]

/** A card per look, each marking all three lines of the paragraph. */
async function paragraph(mark: Partial<PdfMark>) {
  const file = await PDFDocument.create()
  const page = file.addPage([300, 200])
  page.drawRectangle({ width: 300, height: 200, color: rgb(0, 0, 0) })
  for (const [x0, y0, x1, y1] of lines)
    page.drawRectangle({
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
      color: rgb(1, 0, 0),
    })
  const bytes = await file.save()
  const at = anchor(
    sha256(bytes),
    1,
    ...lines.map(([x0, y0, x1, y1]) => [x0, y0, x1, y0, x1, y1, x0, y1]),
  )
  return (['fill', 'outline', 'dashed', 'underline'] as const).map((look) => ({
    bytes: [...bytes],
    page: 1,
    marks: [{ id: look, anchor: at, label: look, look, ...mark }],
  }))
}

/** Each line's ink in CSS px at `scale` on the 300 by 200 pt page. */
const inks = (scale: number) =>
  lines.map(([x0, y0, x1, y1]) => ({
    left: x0 * scale,
    top: (200 - y1) * scale,
    right: x1 * scale,
    bottom: (200 - y0) * scale,
  }))

test('each look draws as the Decision states, with labels of at least 11 px', async ({
  page,
}) => {
  await mount(page, await paragraph({ badge: '12', tag: 'value' }), 600)
  await marksDrawn(page, 4)
  const ink = inks(2)

  const drawn = await page.evaluate(() =>
    Array.from(document.querySelectorAll<SVGPathElement>('.mc-pdf-shape')).map(
      (shape) => {
        const style = getComputedStyle(shape)
        return {
          d: shape.getAttribute('d')!,
          opacity: style.fillOpacity,
          blend: style.mixBlendMode,
          stroke: style.strokeWidth,
          dashes: style.strokeDasharray,
        }
      },
    ),
  )
  const [fill, outline, dashed, underline] = drawn
  expect(fill).toMatchObject({ opacity: '0.3', blend: 'multiply' })
  expect(outline).toMatchObject({ stroke: '2px', dashes: 'none' })
  expect(dashed!.dashes).not.toBe('none')
  expect(underline!.stroke).toBe('3px')

  // Each subpath of the fill is a line's ink padded 1 px; the underline runs
  // 2 px below each line, its centre half its 3 px further.
  const subpaths = (d: string) =>
    d
      .split('M')
      .filter(Boolean)
      .map((sub) =>
        sub
          .replace('Z', '')
          .split('L')
          .map((p) => p.split(',').map(Number) as [number, number]),
      )
  subpaths(fill!.d).forEach((points, i) => {
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    expect(
      off(
        {
          left: Math.min(...xs),
          top: Math.min(...ys),
          right: Math.max(...xs),
          bottom: Math.max(...ys),
        },
        grow(ink[i]!, 1),
      ),
    ).toBeLessThanOrEqual(0.01)
  })
  subpaths(underline!.d).forEach((points, i) => {
    const [[x0, y0], [x1, y1]] = points as [[number, number], [number, number]]
    expect([x0, x1, y0, y1]).toEqual([
      ink[i]!.left,
      ink[i]!.right,
      ink[i]!.bottom + 3.5,
      ink[i]!.bottom + 3.5,
    ])
  })

  // The outline is one path around all three lines, its 2 px stroke at least
  // 3 px off the ink on every side.
  for (const { d } of [outline!, dashed!]) {
    expect(subpaths(d)).toHaveLength(1)
    const [points] = subpaths(d)
    const segments = points!.map(
      (p, i) => [p, points![(i + 1) % points!.length]!] as const,
    )
    for (const box of ink)
      for (const [[x0, y0], [x1, y1]] of segments) {
        const dx = Math.max(
          0,
          Math.min(x0, x1) - box.right,
          box.left - Math.max(x0, x1),
        )
        const dy = Math.max(
          0,
          Math.min(y0, y1) - box.bottom,
          box.top - Math.max(y0, y1),
        )
        expect(Math.hypot(dx, dy) - 1).toBeGreaterThanOrEqual(3)
      }
  }
  const within = await page.evaluate((ink) => {
    const shape = document.querySelectorAll<SVGPathElement>(
      '.mc-pdf-outline .mc-pdf-shape',
    )[0]!
    return ink.every(({ left, top, right, bottom }) =>
      [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ].every(([x, y]) => shape.isPointInFill(new DOMPoint(x, y))),
    )
  }, ink)
  expect(within).toBe(true)

  for (const label of await page.locator('.mc-pdf-badge, .mc-pdf-tag').all())
    expect(
      parseFloat(await label.evaluate((e) => getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(11)
  await expect(page.locator('.mc-pdf-badge').first()).toHaveText('12')
  await expect(page.locator('.mc-pdf-tag').first()).toHaveText('value')
})

for (const media of [{ media: 'print' }, { forcedColors: 'active' }] as const)
  test(`marks show under ${JSON.stringify(media)}`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      'forcedColors' in media && browserName === 'webkit',
      'WebKit does not emulate forced-colors',
    )
    await mount(page, await paragraph({ color: '#00ff00' }), 600)
    await marksDrawn(page, 4)
    await page.emulateMedia(media)
    for (const view of await page.locator('.mc-pdf-view').all()) {
      const shown = await view.screenshot()
      await view.evaluate(
        (v) =>
          (v.querySelector<SVGElement>('.mc-pdf-marks')!.style.visibility =
            'hidden'),
      )
      expect(await view.screenshot()).not.toEqual(shown)
    }
  })

test('marks are reached by Tab, moved by arrows in reading order, and activated by Enter or a click', async ({
  page,
}) => {
  const t = (await targets()).find(({ text }) => text === 'turned0')!
  // The word's thirds, out of order.
  const [x0, y0, x1, y1] = [
    t.points[0]!,
    t.points[1]!,
    t.points[2]!,
    t.points[5]!,
  ]
  const third = (x1 - x0) / 3
  const mark = (id: string, i: number) => ({
    id,
    label: `third ${id}`,
    anchor: anchor(t.sha256, 1, [
      x0 + i * third,
      y0,
      x0 + (i + 1) * third,
      y0,
      x0 + (i + 1) * third,
      y1,
      x0 + i * third,
      y1,
    ]),
  })
  const orphan = {
    ...mark('lost', 0),
    anchor: anchor('f'.repeat(64), 1, t.points),
  }
  await mount(
    page,
    [{ ...t, marks: [mark('c', 2), mark('a', 0), orphan, mark('b', 1)] }],
    600,
  )
  await marksDrawn(page, 3)

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await expect(page.locator('[data-mark="lost"]')).toHaveCount(0)
  expect(await page.evaluate(() => window.calls)).toContainEqual([
    'resolve',
    [
      { id: 'c', status: 'exact' },
      { id: 'a', status: 'exact' },
      { id: 'lost', status: 'orphan' },
      { id: 'b', status: 'exact' },
    ],
  ])

  const focused = () =>
    page.evaluate(() => (document.activeElement as SVGElement).dataset.mark)
  await page.keyboard.press('Tab')
  expect(await focused()).toBe('a')
  await expect(page.locator('.mc-pdf-mark[tabindex="0"]')).toHaveCount(1)
  for (const [key, id] of [
    ['ArrowRight', 'b'],
    ['ArrowDown', 'c'],
    ['ArrowRight', 'c'],
    ['Home', 'a'],
    ['End', 'c'],
    ['ArrowLeft', 'b'],
  ])
    expect(await page.keyboard.press(key!).then(focused), key).toBe(id)
  await page.keyboard.press('Enter')
  const a = await page.locator('[data-mark="a"] .mc-pdf-shape').boundingBox()
  await page.mouse.click(a!.x + a!.width / 2, a!.y + a!.height / 2)
  const calls = await page.evaluate(() =>
    window.calls.filter(([kind]) => kind !== 'resolve'),
  )
  expect(calls).toEqual([
    ['activate', 'b'],
    ['activate', 'a'],
  ])
})

test('reading order holds across looks on one line', async ({ page }) => {
  const t = (await targets()).find(({ text }) => text === 'turned0')!
  const [x0, y0, x1, y1] = [
    t.points[0]!,
    t.points[1]!,
    t.points[2]!,
    t.points[5]!,
  ]
  const middle = (x0 + x1) / 2
  // The right half sits a fraction of a point higher, as another run's quad can.
  const half = (
    id: string,
    look: 'fill' | 'outline',
    [l, r]: number[],
    up: number,
  ) => ({
    id,
    label: id,
    look,
    anchor: anchor(t.sha256, 1, [
      l!,
      y0 + up,
      r!,
      y0 + up,
      r!,
      y1 + up,
      l!,
      y1 + up,
    ]),
  })
  await mount(
    page,
    [
      {
        ...t,
        marks: [
          half('right', 'outline', [middle, x1], 0.3),
          half('left', 'fill', [x0, middle], 0),
        ],
      },
    ],
    600,
  )
  await marksDrawn(page, 2)
  await page.keyboard.press('Tab')
  const focused = () =>
    page.evaluate(() => (document.activeElement as SVGElement).dataset.mark)
  expect(await focused()).toBe('left')
  await page.keyboard.press('ArrowRight')
  expect(await focused()).toBe('right')
})

test('a click off the marks reports its point in user space', async ({
  page,
}) => {
  for (const t of (await targets()).filter(({ url }) =>
    url.endsWith('rotate.pdf'),
  )) {
    await mount(page, [t], 400 + t.page)
    const view = page.getByRole('region', { name: `Page ${t.page}` })
    await expect(view).toHaveAttribute('style', /width/)
    const box = (await view.boundingBox())!
    const scale = box.width / t.width
    const { left, top, right, bottom } = t.screen
    await page.mouse.click(
      box.x + ((left + right) / 2) * scale,
      box.y + ((top + bottom) / 2) * scale,
    )
    const [, point] = (await page.evaluate(() =>
      window.calls.find(([kind]) => kind === 'click'),
    ))! as [string, { page: number; x: number; y: number }]
    const [x0, y0, x1, y1] = [
      t.points[0]!,
      t.points[1]!,
      t.points[4]!,
      t.points[5]!,
    ]
    expect(point.page).toBe(t.page)
    expect(
      Math.abs(point.x - (x0 + x1) / 2),
      `${t.text} x`,
    ).toBeLessThanOrEqual(1)
    expect(
      Math.abs(point.y - (y0 + y1) / 2),
      `${t.text} y`,
    ).toBeLessThanOrEqual(1)
  }
})

test('a page far from view imports pdf.js and fetches nothing until scrolled near', async ({
  page,
}) => {
  const files = [
    ...new Map((await targets()).map((t) => [t.url, t])).values(),
  ].slice(0, 3)
  const asked: string[] = []
  page.on('request', (request) => asked.push(new URL(request.url()).pathname))
  // Each page three screens below the last, so one in view has none near.
  await page.evaluate((files) => {
    const { pdf, h, mount } = window.harness
    pdf.configurePdf({ assets: '/pdf-assets/' })
    mount(
      h(
        'main',
        null,
        files.map(({ url, sha256, page }) =>
          h(
            'div',
            { key: url, style: { paddingTop: '300vh' } },
            h(pdf.PdfPage, { source: { url, sha256 }, page }),
          ),
        ),
      ),
    )
  }, files)
  await expect(page.locator('.mc-pdf-page')).toHaveCount(3)
  await page.waitForTimeout(500)
  expect(asked.filter((path) => path !== '/favicon.ico')).toEqual([])
  expect(page.workers()).toEqual([])

  await page.locator('.mc-pdf-page').nth(1).scrollIntoViewIfNeeded()
  await expect(page.locator('.mc-pdf-page[aria-busy="false"]')).toHaveCount(1)
  await page.waitForTimeout(500)
  expect(new Set(asked.filter((path) => path.endsWith('.pdf')))).toEqual(
    new Set([files[1]!.url]),
  )
  expect(page.workers()).toHaveLength(1)
})

test('200 pages on one file open it once, render two at a time, and release far canvases', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const url = '/corpus/thousand-pages.pdf'
  const hash = sha256(readFileSync(join(corpus, 'thousand-pages.pdf')))
  let opened = 0
  await page.route(`**${url}`, (route) => {
    if (route.request().headers().range === 'bytes=0-65535') opened++
    return route.continue()
  })
  // Counts the renders in flight on the document every page shares.
  await page.evaluate(
    async ({ url, hash }) => {
      window.harness.pdf.configurePdf({ assets: '/pdf-assets/' })
      const shared = await window.harness.documents.open({ url, sha256: hash })
        .document
      const proto = Object.getPrototypeOf(await shared.getPage(1))
      const render = proto.render
      const w = window as unknown as { active: number; most: number }
      w.active = w.most = 0
      proto.render = function (...args: unknown[]) {
        const task = render.apply(this, args)
        w.most = Math.max(w.most, ++w.active)
        task.promise.finally(() => w.active--).catch(() => {})
        return task
      }
    },
    { url, hash },
  )
  await mount(
    page,
    Array.from({ length: 200 }, (_, i) => ({ url, sha256: hash, page: i + 1 })),
    300,
  )
  const drawn = () =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll<HTMLCanvasElement>('.mc-pdf-view > canvas'),
      ).map((canvas) => {
        const { top, bottom } = canvas.getBoundingClientRect()
        return {
          width: canvas.width,
          screens: Math.max(top - innerHeight, -bottom) / innerHeight,
        }
      }),
    )
  await expect.poll(async () => (await drawn())[0]!.width).toBeGreaterThan(0)
  for (let y = 0; y < 200 * 200; y += 2000) {
    await page.evaluate((y) => scrollTo(0, y), y)
    await page.waitForTimeout(100)
  }
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await expect
    .poll(async () => (await drawn()).at(-1)!.width)
    .toBeGreaterThan(0)

  const canvases = await drawn()
  expect(canvases.filter(({ screens }) => screens > 3).length).toBeGreaterThan(
    100,
  )
  for (const { width, screens } of canvases)
    if (screens > 3) expect(width).toBe(0)
  expect(opened).toBe(1)
  const most = await page.evaluate(
    () => (window as unknown as { most: number }).most,
  )
  expect(most).toBeGreaterThan(0)
  expect(most).toBeLessThanOrEqual(2)
})

test('a failed load shows a Notice whose Retry loads it, and tells onError once', async ({
  page,
}) => {
  const t = (await targets())[0]!
  let fail = true
  await page.route(`**${t.url}`, (route) =>
    fail ? route.fulfill({ status: 404 }) : route.continue(),
  )
  await mount(page, [t], 400)
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.calls)).toEqual([
    ['error', 'fetch', 404],
  ])
  fail = false
  await retry.click()
  await expect(
    page.getByRole('region', { name: `Page ${t.page}` }),
  ).toBeVisible()
  await expect(retry).toHaveCount(0)
})

test('a source changed mid-render shows the new page, with no Notice and no onError', async ({
  page,
}) => {
  const all = await targets()
  const [from, to] = ['scan.pdf', 'rotate.pdf'].map((name) =>
    all.find(({ url }) => url.endsWith(name))!,
  )
  // `to` replaces `from` as its first render starts. That render is then
  // cancelled as `from`'s closing document cancels it, a task before its
  // abort, as a late commit orders them.
  await page.evaluate(
    async ({ from, to }) => {
      const { pdf, h, mount, documents } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      const calls: unknown[][] = (window.calls = [])
      const show = ({ url, sha256, page }: typeof from) =>
        mount(
          h(
            'main',
            null,
            h(pdf.PdfPage, {
              key: 'swapped',
              source: { url, sha256 },
              page,
              onError: ({ kind, status }) =>
                calls.push(['error', kind, status]),
            }),
          ),
        )
      const lease = documents.open(to)
      const proto = Object.getPrototypeOf(
        await (await lease.document).getPage(1),
      )
      lease.release()
      const render = proto.render
      proto.render = function (...args: unknown[]) {
        proto.render = render
        const task = render.apply(this, args)
        const abort = AbortController.prototype.abort
        AbortController.prototype.abort = function () {
          AbortController.prototype.abort = abort
          task.cancel()
          setTimeout(() => abort.call(this))
        }
        show(to)
        return task
      }
      show(from)
    },
    { from: from!, to: to! },
  )
  await expect
    .poll(() =>
      page
        .locator('.mc-pdf-view > canvas')
        .evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(0)
  await page.waitForTimeout(500)
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  expect(await page.evaluate(() => window.calls)).toEqual([])
})
