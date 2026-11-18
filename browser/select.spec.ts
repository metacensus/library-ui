import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { quadsOf } from '../src/pdf/anchor.js'
import type { PdfAnchor, PdfMark } from '../src/pdf/index.js'
import {
  corpus,
  quadsOff,
  quarterEm,
  sha256,
  targets,
  valid,
} from './targets.js'

type Shown = {
  url: string
  sha256: string
  /** `PdfPage`'s. */
  page?: number
  width: number
  height?: number
  marks?: PdfMark[]
}

let mounts = 0

/** Mounts `component` on `url` in a `main` `width` by `height` px, its
 *  `onSelect` and `onResolve` logged to `window.calls`, and waits for React to
 *  commit it. Called again with the same `key`, it updates the component. */
async function mount(
  page: Page,
  component: 'PdfPage' | 'PdfReader',
  shown: Shown,
  key?: number,
) {
  const id = ++mounts
  await page.evaluate(
    ({
      component,
      shown: { url, sha256, width, height, ...props },
      id,
      key,
    }) => {
      const { pdf, h, mount } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      const calls: unknown[][] = (window.calls = [])
      mount(
        h(
          'main',
          {
            'data-mount': id,
            style: {
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              width: `${width}px`,
              height: height && `${height}px`,
            },
          },
          h('h1', null, component),
          h(pdf[component], {
            key,
            page: 1,
            ...props,
            source: { url, sha256 },
            onSelect: (anchor) => calls.push(['select', anchor]),
            onResolve: (resolutions) => calls.push(['resolve', resolutions]),
          }),
        ),
      )
    },
    { component, shown, id, key: key ?? id },
  )
  await page.locator(`main[data-mount="${id}"]`).waitFor()
  return key ?? id
}

/** What the first `n` calls to `name` were given, once there are `n`. */
async function given<T = PdfAnchor | null>(
  page: Page,
  n: number,
  name = 'select',
) {
  const handle = await page.waitForFunction(
    ({ n, name }) => {
      const args = window.calls.flatMap(([called, arg]) =>
        called === name ? [arg] : [],
      )
      return args.length >= n && args
    },
    { n, name },
  )
  return (await handle.jsonValue()) as T[]
}

const quoteOf = (anchor: PdfAnchor) =>
  anchor.selector.find((s) => s.type === 'TextQuoteSelector')!

/** Where `text` starts in the first text-layer span saying it, and points just
 *  before its first character and after its last. */
const find = async (page: Page, text: string) => {
  const found = await page.waitForFunction((text) => {
    const span = Array.from(
      document.querySelectorAll('.mc-pdf-text > span'),
    ).find((span) => span.textContent!.includes(text))
    if (!span) return
    const node = span.firstChild!
    const at = span.textContent!.indexOf(text)
    const centre = (i: number) => {
      const range = document.createRange()
      range.setStart(node, at + i)
      range.setEnd(node, at + i + 1)
      const { left, top, width, height } = range.getBoundingClientRect()
      return [left + width / 2, top + height / 2] as const
    }
    // A character's pitch along the run, whatever its rotation.
    const [x0, y0] = centre(0)
    const [x1, y1] = centre(text.length - 1)
    const [dx, dy] = [x1 - x0, y1 - y0].map(
      (d) => (0.4 * d) / (text.length - 1),
    ) as [number, number]
    return {
      at,
      before: { x: x0 - dx, y: y0 - dy },
      after: { x: x1 + dx, y: y1 + dy },
    }
  }, text)
  return (await found.jsonValue())!
}

async function dragAcross(page: Page, text: string) {
  const { before, after } = await find(page, text)
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(after.x, after.y, { steps: 4 })
  await page.mouse.up()
}

// A caret is not moved by keys outside editable text, so the first
// character is selected as Shift goes down, and arrows extend it.
async function shiftAcross(page: Page, text: string) {
  const { at } = await find(page, text)
  await page.keyboard.down('Shift')
  await page.evaluate(
    ({ text, at }) => {
      const node = Array.from(
        document.querySelectorAll('.mc-pdf-text > span'),
      ).find((span) => span.textContent!.includes(text))!.firstChild!
      getSelection()!.setBaseAndExtent(node, at, node, at + 1)
    },
    { text, at },
  )
  for (let i = 1; i < text.length; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
}

/** Mounts `anchor` as a mark on `shown`, and expects it drawn and `exact`. */
async function resolvesExact(
  page: Page,
  component: 'PdfPage' | 'PdfReader',
  shown: Shown,
  anchor: PdfAnchor,
) {
  const mark = { id: 'selected', label: 'selected', anchor }
  await mount(page, component, { ...shown, marks: [mark] })
  const [resolutions] = await given<unknown>(page, 1, 'resolve')
  expect(resolutions).toEqual([{ id: 'selected', status: 'exact' }])
  await expect(page.locator('[data-mark="selected"]')).not.toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

const selected = async () =>
  (await targets()).filter(
    ({ url, text }) =>
      /rotate|crop-box|user-unit/.test(url) ||
      (url.endsWith('edition-1.pdf') && text === 'final') ||
      (url.endsWith('edition-2.pdf') && text.startsWith('pages')),
  )

test('a target selected by mouse or by keyboard gives its quote and quads once, and null once cleared', async ({
  page,
}) => {
  for (const t of await selected()) {
    const name = `${t.url} ${t.text}`
    const anchors: PdfAnchor[] = []
    for (const select of [dragAcross, shiftAcross]) {
      await mount(page, 'PdfPage', t)
      await select(page, t.text)
      await given(page, 1)
      await page.mouse.click(1, 1)
      const [anchor, ...rest] = await given(page, 2)
      expect(rest, name).toEqual([null])
      anchors.push(anchor!)
    }
    const [anchor, byKeyboard] = anchors as [PdfAnchor, PdfAnchor]
    expect(byKeyboard, name).toEqual(anchor)
    expect(valid(anchor), JSON.stringify(valid.errors)).toBe(true)
    expect(anchor.source.sha256, name).toBe(t.sha256)
    expect(quoteOf(anchor).exact, name).toBe(t.text)
    const quads = quadsOf(anchor)
    expect(new Set(quads.map((q) => q.page)), name).toEqual(new Set([t.page]))
    for (const quad of quads)
      expect(quadsOff([quad], [t]), name).toBeLessThanOrEqual(quarterEm)
    await resolvesExact(page, 'PdfPage', t, anchor)
  }
})

test('a quote carries up to 32 characters either side', async ({ page }) => {
  const t = (await selected()).find(({ url }) => url.endsWith('edition-2.pdf'))!
  await mount(page, 'PdfPage', t)
  await dragAcross(page, t.text)
  const [anchor] = await given(page, 1)
  const { prefix, suffix } = quoteOf(anchor!)
  expect(prefix).toMatch(/See $/)
  expect(suffix).toHaveLength(32)
  expect(suffix).toMatch(/^ for the\s+notes on each/)
})

test('a selection that ends outside the component gives nothing', async ({
  page,
}) => {
  const t = (await selected())[0]!
  await mount(page, 'PdfPage', t)
  const { before } = await find(page, t.text)
  const heading = await page.getByRole('heading').boundingBox()
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(heading!.x + 4, heading!.y + 4, { steps: 4 })
  await page.mouse.up()
  expect(await page.evaluate(() => getSelection()!.toString())).not.toBe('')

  // Off the selection, so the next press starts a selection, not a drag.
  await page.mouse.click(1, 1)
  await dragAcross(page, t.text)
  const [anchor] = await given(page, 1)
  expect(quoteOf(anchor!).exact).toBe(t.text)
})

test('a selection gives null once its source changes', async ({ page }) => {
  const [t, other] = await selected()
  const key = await mount(page, 'PdfPage', t!)
  await dragAcross(page, t!.text)
  await given(page, 1)
  await mount(page, 'PdfPage', other!, key)
  expect(await given(page, 1)).toEqual([null])
})

test('a selectionchange after the pointer is released gives no second call', async ({
  page,
}) => {
  const t = (await selected())[0]!
  await mount(page, 'PdfPage', t)
  await dragAcross(page, t.text)
  await given(page, 1)
  await page.clock.install()
  await page.evaluate(() =>
    document.dispatchEvent(new Event('selectionchange')),
  )
  await page.clock.runFor(1000)
  // A second call would be logged by now, as the page's text is already read.
  expect(await given(page, 1)).toHaveLength(1)
})

test('a selection from page 3 to 5 keeps their text layers, and gives quads on each while 4 is far from view', async ({
  page,
}) => {
  const file = 'edition-2.pdf'
  const shown = {
    url: `/corpus/${file}`,
    sha256: sha256(readFileSync(join(corpus, file))),
    width: 400,
    height: 1700,
  }
  const slot = (n: number) => page.locator('.mc-pdf-slot').nth(n - 1)
  const canvas = (n: number) =>
    slot(n)
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.width)
  const scroll = (to: 'top' | 'bottom') =>
    page
      .locator('.mc-pdf-scroll')
      .evaluate(
        (box, to) => (box.scrollTop = to === 'top' ? 0 : box.scrollHeight),
        to,
      )
  const said = () => page.evaluate(() => getSelection()!.toString())
  const key = await mount(page, 'PdfReader', shown)
  for (const n of [3, 4, 5])
    await expect(slot(n).locator('.mc-pdf-text > span')).not.toHaveCount(0)
  const across = (end?: number) =>
    page.evaluate((end) => {
      const slots = document.querySelectorAll('.mc-pdf-slot')
      const spans = (n: number) =>
        slots[n - 1]!.querySelectorAll('.mc-pdf-text > span')
      const first = spans(3)[0]!.firstChild!
      const last = Array.from(spans(5)).at(-1)!.firstChild!
      const selection = getSelection()!
      if (end === undefined)
        selection.setBaseAndExtent(first, 0, last, last.textContent!.length)
      else selection.extend(last, end)
    }, end)
  const pages = (anchor?: PdfAnchor) =>
    new Set(quadsOf(anchor!).map((q) => q.page))

  await across()
  const [whole] = (await given(page, 1)) as PdfAnchor[]
  expect(pages(whole)).toEqual(new Set([3, 4, 5]))
  expect(quoteOf(whole!).exact).toMatch(
    /^Its .held. ratio rose\.[^]*See pages 3–5 for the[^]*its place\.$/,
  )

  // A short view at the top leaves pages 3 to 5 over 3 screens away.
  await mount(page, 'PdfReader', { ...shown, height: 270 }, key)
  await scroll('top')
  for (const n of [3, 4, 5]) await expect.poll(() => canvas(n)).toBe(0)
  for (const n of [3, 4, 5])
    await expect(slot(n).locator('.mc-pdf-text > span')).not.toHaveCount(0)

  await across(3)
  const [shorter] = (await given(page, 1)) as PdfAnchor[]
  expect(pages(shorter)).toEqual(new Set([3, 4, 5]))
  expect(quoteOf(shorter!).exact).toMatch(/\nits$/)

  // Back in view, a kept layer is not drawn again, so the selection stands.
  const before = await said()
  await scroll('bottom')
  await expect.poll(() => canvas(5)).toBeGreaterThan(0)
  expect(await said()).toBe(before)

  // Cleared, the selection keeps no layer on a page far from view.
  await page.evaluate(() => getSelection()!.removeAllRanges())
  for (const n of [3, 4])
    await expect(slot(n).locator('.mc-pdf-text')).toHaveCount(0)

  for (const anchor of [whole!, shorter!]) {
    expect(valid(anchor), JSON.stringify(valid.errors)).toBe(true)
    await resolvesExact(page, 'PdfReader', shown, anchor)
  }
})
