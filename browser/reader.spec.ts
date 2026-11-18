import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { PdfMark, PdfTarget } from '../src/pdf/index.js'
import { anchor, corpus, off, sha256, shown, targets } from './targets.js'

type Shown = {
  url?: string
  sha256?: string
  bytes?: number[]
  marks?: PdfMark[]
  target?: PdfTarget
  jump?: number
}

const thousand = {
  url: '/corpus/thousand-pages.pdf',
  sha256: sha256(readFileSync(join(corpus, 'thousand-pages.pdf'))),
}

/** Shows a `PdfReader` in a frame `width` by `height` px, its callbacks logged
 *  to `window.calls`, and waits for its pages or its Notice. Called again on
 *  the same URL, it updates the reader. */
async function show(page: Page, props: Shown, width = 800, height = 600) {
  await page.evaluate(
    ({ props: { url, sha256, bytes, ...props }, width, height }) => {
      const { pdf, h, mount } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      const calls = (window.calls ??= [])
      mount(
        h(
          'main',
          {
            style: {
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              width: `${width}px`,
              height: `${height}px`,
            },
          },
          h('h1', null, 'PdfReader'),
          h(pdf.PdfReader, {
            ...props,
            source: bytes
              ? { data: new Uint8Array(bytes) }
              : { url: url!, sha256: sha256! },
            onPageChange: (shown) => calls.push(['page', shown]),
            onResolve: (resolutions) => calls.push(['resolve', resolutions]),
            onMarkActivate: (id) => calls.push(['activate', id]),
            onPageClick: (point) => calls.push(['click', point]),
            onError: ({ kind, status }) => calls.push(['error', kind, status]),
          }),
        ),
      )
    },
    { props, width, height },
  )
  await page.locator('.mc-pdf-slot, [role="note"]').first().waitFor()
}

/** The page at the top of the view, and how far down it the top is. */
const top = (page: Page) =>
  page.evaluate(() => {
    const view = document.querySelector('.mc-pdf-scroll')!
    const y = view.getBoundingClientRect().top
    const slots = Array.from(document.querySelectorAll('.mc-pdf-slot'))
    let i = slots.length - 1
    while (i > 0 && slots[i]!.getBoundingClientRect().top > y) i--
    const slot = slots[i]!.getBoundingClientRect()
    return { page: i + 1, fraction: (y - slot.top) / slot.height }
  })

/** How far `selector`'s middle is from the view's, in CSS px. */
const fromMiddle = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const view = document.querySelector('.mc-pdf-scroll')!
    const box = document.querySelector(selector)?.getBoundingClientRect()
    if (!box) return Infinity
    const { top } = view.getBoundingClientRect()
    return Math.abs(box.top + box.height / 2 - (top + view.clientHeight / 2))
  }, selector)

/** Waits for page `n`'s top to be within 1 px of the view's. */
const atTop = (page: Page, n: number) =>
  expect
    .poll(() =>
      page.evaluate((n) => {
        const view = document.querySelector('.mc-pdf-scroll')!
        const slot = document.querySelectorAll('.mc-pdf-slot')[n - 1]!
        const { top } = slot.getBoundingClientRect()
        return Math.abs(top - view.getBoundingClientRect().top)
      }, n),
    )
    .toBeLessThanOrEqual(1)

/** Scrolls the view so page `n` is `fraction` of the way past its top. */
const scrollTo = async (page: Page, n: number, fraction: number) => {
  await page.evaluate(
    ({ n, fraction }) => {
      const view = document.querySelector('.mc-pdf-scroll')!
      const slot = document.querySelectorAll('.mc-pdf-slot')[n - 1]!
      const { top, height } = slot.getBoundingClientRect()
      view.scrollTop +=
        top - view.getBoundingClientRect().top + fraction * height
    },
    { n, fraction },
  )
  await expect.poll(async () => (await top(page)).page).toBe(n)
}

const level = (page: Page) => page.locator('output')

async function zoomTo(page: Page, percent: number) {
  for (;;) {
    const at = parseInt(await level(page).innerText())
    if (at === percent) return
    await page
      .getByRole('button', { name: at < percent ? 'Zoom in' : 'Zoom out' })
      .click()
    await expect(level(page)).not.toHaveText(`${at}%`)
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('page 1 paints before any page past 3 is fetched', async ({ page }) => {
  // Logs each page asked of the document, and whether page 1 had painted.
  await page.evaluate(async (source) => {
    window.harness.pdf.configurePdf({ assets: '/pdf-assets/' })
    const shared = await window.harness.documents.open(source).document
    const proto = Object.getPrototypeOf(shared)
    const getPage = proto.getPage
    const asked: [number, boolean][] = []
    Object.assign(window, { asked })
    proto.getPage = function (n: number) {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas')
      asked.push([n, (canvas?.width ?? 0) > 0])
      return getPage.call(this, n)
    }
  }, thousand)
  await show(page, thousand)
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('canvas')?.width ?? 0),
    )
    .toBeGreaterThan(0)
  await page.waitForTimeout(500)
  await show(page, { ...thousand, target: { page: 500 } })
  await expect(page.getByRole('region', { name: 'Page 500' })).toBeVisible()

  const asked = await page.evaluate(
    () => (window as unknown as { asked: [number, boolean][] }).asked,
  )
  expect(asked[0]).toEqual([1, false])
  const far = asked.filter(([n]) => n > 3)
  expect(far.length).toBeGreaterThan(0)
  for (const [n, painted] of far) expect(painted, `page ${n}`).toBe(true)
})

test('a placeholder corrected above the page in view does not move it', async ({
  page,
}) => {
  const url = '/corpus/mixed-sizes.pdf'
  const file = {
    url,
    sha256: sha256(readFileSync(join(corpus, 'mixed-sizes.pdf'))),
  }
  // Page 2, twice page 1's height, arrives after the jump to page 3.
  await page.evaluate(async (source) => {
    window.harness.pdf.configurePdf({ assets: '/pdf-assets/' })
    const shared = await window.harness.documents.open(source).document
    const proto = Object.getPrototypeOf(shared)
    const getPage = proto.getPage
    proto.getPage = function (n: number) {
      const page = getPage.call(this, n)
      return n === 2 ? new Promise((r) => setTimeout(() => r(page), 500)) : page
    }
  }, file)
  // Logs page 3's top each frame.
  await page.evaluate(() => {
    const tops: number[] = []
    Object.assign(window, { tops })
    const frame = () => {
      const view = document.querySelector('.mc-pdf-scroll')
      const slot = document.querySelectorAll('.mc-pdf-slot')[2]
      if (view && slot)
        tops.push(
          slot.getBoundingClientRect().top - view.getBoundingClientRect().top,
        )
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  await show(page, { ...file, target: { page: 3 } })
  const placeholder = await page.evaluate(
    () =>
      document.querySelector('.mc-pdf-slot')!.getBoundingClientRect().height,
  )
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelectorAll('.mc-pdf-slot')[1]!.getBoundingClientRect()
            .height,
      ),
    )
    .toBeGreaterThan(placeholder * 1.5)
  await page.waitForTimeout(200)

  const tops = await page.evaluate(
    () => (window as unknown as { tops: number[] }).tops,
  )
  const jumped = tops.findIndex((t) => Math.abs(t) <= 1)
  expect(jumped).toBeGreaterThanOrEqual(0)
  for (const t of tops.slice(jumped)) expect(Math.abs(t)).toBeLessThanOrEqual(1)
})

test('a target scrolls to its mark or page, again on jump, and never on resize or zoom', async ({
  page,
}) => {
  const marks = await thousandMarks()
  await show(page, { ...thousand, marks, target: { mark: '500' } })
  await expect
    .poll(() => fromMiddle(page, '[data-mark="500"] .mc-pdf-shape'))
    .toBeLessThanOrEqual(1)

  await show(page, { ...thousand, marks, target: { page: 700 } })
  await atTop(page, 700)

  await scrollTo(page, 20, 0.5)
  await show(page, { ...thousand, marks, target: { page: 700 }, jump: 1 })
  await atTop(page, 700)

  await scrollTo(page, 20, 0.5)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(level(page)).toHaveText('125%')
  await show(page, { ...thousand, marks, target: { page: 700 }, jump: 1 }, 600)
  await page.waitForTimeout(500)
  expect((await top(page)).page).toBe(20)
})

test('the toolbar works by keyboard, and the page is reported and announced', async ({
  page,
  browserName,
}) => {
  await show(page, thousand)
  await expect(level(page)).toHaveText('100%')
  await page.evaluate(() => {
    const said = document.querySelector('.mc-pdf-said')!
    Object.assign(window, { says: 0 })
    new MutationObserver(
      () => (window as unknown as { says: number }).says++,
    ).observe(said, { childList: true, characterData: true, subtree: true })
  })
  const says = () =>
    page.evaluate(() => (window as unknown as { says: number }).says)
  const said = page.locator('.mc-pdf-said')
  await expect(said).toHaveAttribute('aria-live', 'polite')
  await expect(said).toHaveText('Page 1 of 1000')
  const before = await says()

  const focused = () =>
    page.evaluate(
      () =>
        document.activeElement!.getAttribute('aria-label') ??
        document.activeElement!.textContent,
    )
  const order = [
    'Previous page',
    'Next page',
    'Page',
    'Zoom out',
    'Zoom in',
    'Fit width',
  ]
  for (const name of order) {
    // WebKit tabs to buttons only with Alt.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    expect(await focused()).toBe(name)
  }

  const next = page.getByRole('button', { name: 'Next page' })
  await next.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
  await expect(said).toHaveText('Page 4 of 1000')
  await page.waitForTimeout(800)
  expect(await says()).toBe(before + 1)
  expect(
    await page.evaluate(() => window.calls.filter(([kind]) => kind === 'page')),
  ).toEqual([1, 2, 3, 4].map((index) => ['page', { index }]))
  await atTop(page, 4)

  await page.getByRole('button', { name: 'Previous page' }).focus()
  await page.keyboard.press('Space')
  await atTop(page, 3)

  const field = page.getByRole('textbox', { name: 'Page' })
  await field.selectText()
  await page.keyboard.type('40')
  await page.keyboard.press('Enter')
  await atTop(page, 40)
  await expect(field).toHaveValue('40')
  await expect(page.getByText('of 1000', { exact: true })).toBeVisible()

  for (const [name, after] of [
    ['Zoom out', '75%'],
    ['Zoom in', '100%'],
    ['Zoom in', '125%'],
    ['Fit width', '100%'],
  ]) {
    await page.getByRole('button', { name }).focus()
    await page.keyboard.press('Enter')
    await expect(level(page), name).toHaveText(after!)
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('a page is reported with its printed label', async ({ page }) => {
  const file = await PDFDocument.create()
  for (let i = 0; i < 3; i++) file.addPage([300, 200])
  file.catalog.set(
    PDFName.of('PageLabels'),
    file.context.obj({ Nums: [0, { S: PDFName.of('r') }] }),
  )
  await show(page, { bytes: [...(await file.save())] })
  await expect(
    page.getByRole('region', { name: 'Page 2, printed page ii' }),
  ).toBeAttached()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.calls.filter(([kind]) => kind === 'page').at(-1),
      ),
    )
    .toEqual(['page', { index: 2, label: 'ii' }])
})

test('zoom, ctrl+wheel, pinch and resize keep the page and fraction at the top', async ({
  page,
  browserName,
}) => {
  await show(page, thousand)
  await scrollTo(page, 300, 0.4)
  const place = await top(page)
  const kept = async (how: string) => {
    await page.waitForTimeout(300)
    const now = await top(page)
    expect(now.page, how).toBe(place.page)
    expect(Math.abs(now.fraction - place.fraction), how).toBeLessThanOrEqual(
      0.01,
    )
  }

  for (const name of [
    'Zoom in',
    'Zoom in',
    'Zoom out',
    'Zoom out',
    'Zoom out',
    'Fit width',
  ]) {
    const was = await level(page).innerText()
    await page.getByRole('button', { name }).click()
    await expect(level(page)).not.toHaveText(was)
    await kept(name)
  }

  const view = (await page.locator('.mc-pdf-scroll').boundingBox())!
  await page.mouse.move(view.x + view.width / 3, view.y + view.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await expect(level(page)).not.toHaveText('100%')
  await kept('ctrl+wheel')

  await show(page, thousand, 500)
  await expect
    .poll(() => page.locator('.mc-pdf-scroll').evaluate((v) => v.clientWidth))
    .toBeLessThanOrEqual(500)
  await kept('resize')

  if (browserName === 'chromium') {
    const was = await level(page).innerText()
    const cdp = await page.context().newCDPSession(page)
    const [x, y] = [view.x + 200, view.y + 300]
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      apart: number,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          type === 'touchEnd'
            ? []
            : [
                { x: x - apart, y },
                { x: x + apart, y },
              ],
      })
    await touch('touchStart', 20)
    for (const apart of [30, 40, 50]) await touch('touchMove', apart)
    await touch('touchEnd', 0)
    await expect(level(page)).not.toHaveText(was)
    await kept('pinch')
  }
})

test('at 360 px wide and 400% only the reader scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 700 })
  await page.evaluate(() => (document.body.style.margin = '0'))
  await show(page, thousand, 360, 600)
  await zoomTo(page, 400)
  const sizes = await page.evaluate(() => {
    const view = document.querySelector('.mc-pdf-scroll')!
    return {
      document: document.documentElement.scrollWidth,
      view: view.scrollWidth - view.clientWidth,
    }
  })
  expect(sizes.document).toBeLessThanOrEqual(360)
  expect(sizes.view).toBeGreaterThan(0)
})

const thousandMarks = async () =>
  (await targets())
    .filter(({ url }) => url === thousand.url)
    .map((t) => ({
      id: t.text,
      label: `page ${t.text}`,
      anchor: anchor(t.sha256, t.page, t.points),
    }))

/** Holds back page `n` of the shared document by `ms`. */
const delayPage = (page: Page, n: number, ms: number) =>
  page.evaluate(
    async ({ source, n, ms }) => {
      window.harness.pdf.configurePdf({ assets: '/pdf-assets/' })
      const shared = await window.harness.documents.open(source).document
      const proto = Object.getPrototypeOf(shared)
      const getPage = proto.getPage
      proto.getPage = function (asked: number) {
        const got = getPage.call(this, asked)
        return asked === n
          ? new Promise((r) => setTimeout(() => r(got), ms))
          : got
      }
    },
    { source: thousand, n, ms },
  )

test('a mark target scrolls once its marks arrive after the document', async ({
  page,
}) => {
  await show(page, { ...thousand, target: { mark: '500' } })
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector('canvas')?.width ?? 0),
    )
    .toBeGreaterThan(0)
  await show(page, {
    ...thousand,
    marks: await thousandMarks(),
    target: { mark: '500' },
  })
  await expect
    .poll(() => fromMiddle(page, '[data-mark="500"] .mc-pdf-shape'))
    .toBeLessThanOrEqual(1)
})

test('a scroll drops a mark jump still waiting for its page', async ({
  page,
}) => {
  await delayPage(page, 500, 1500)
  await show(page, {
    ...thousand,
    marks: await thousandMarks(),
    target: { mark: '500' },
  })
  await expect
    .poll(() =>
      page.evaluate(() => window.calls.some(([kind]) => kind === 'resolve')),
    )
    .toBe(true)
  await scrollTo(page, 20, 0.5)
  await page.waitForTimeout(2000)
  expect((await top(page)).page).toBe(20)
})

// Pages 100 and 1000 give their right half first, against reading order.
const crossMarks = async () =>
  (await thousandMarks()).flatMap((mark) => {
    const { quads } = mark.anchor.selector[0]!
    const { page, points } = quads[0]!
    if (page === 1) quads.push({ page: 2, points })
    if (page === 200) quads[0]!.points = points.map((n, i) => n - (i % 2) * 115)
    if (page !== 100 && page !== 1000) return [mark]
    const xs = points.filter((_, i) => i % 2 === 0)
    const ys = points.filter((_, i) => i % 2)
    const [l, r, b, t] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ]
    const m = (l + r) / 2
    return (
      [
        ['b', m, r],
        ['a', l, m],
      ] as const
    ).map(([half, from, to]) => ({
      id: mark.id + half,
      label: mark.label + half,
      anchor: anchor(mark.anchor.source.sha256, page, [
        from,
        b,
        to,
        b,
        to,
        t,
        from,
        t,
      ]),
    }))
  })

test('one tab stop covers every page, and arrows cross pages in reading order', async ({
  page,
}) => {
  await show(page, { ...thousand, marks: await crossMarks() })
  await expect(page.locator('[data-mark="1"]')).toHaveCount(2)
  const focused = () =>
    page.evaluate(() => (document.activeElement as HTMLElement).dataset.mark)
  const stops = page.locator('.mc-pdf-mark[tabindex="0"]')
  const tabIn = async () => {
    await page.locator('.mc-pdf-scroll').focus()
    await page.keyboard.press('Tab')
  }

  await tabIn()
  expect(await focused()).toBe('1')
  await expect(stops).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(page.locator('.mc-pdf-reader :focus')).toHaveCount(0)

  await tabIn()
  for (const [key, id] of [
    ['ArrowRight', '100a'],
    ['ArrowDown', '100b'],
    ['ArrowRight', '200'],
    ['End', '1000b'],
    ['ArrowLeft', '1000a'],
    ['ArrowUp', '900'],
    ['Home', '1'],
    ['ArrowRight', '100a'],
  ]) {
    await page.keyboard.press(key!)
    await expect.poll(focused, key).toBe(id)
    await expect(page.locator(':focus'), key).toBeInViewport()
    await expect(stops).toHaveCount(1)
  }

  await scrollTo(page, 300, 0.5)
  await expect
    .poll(() =>
      page
        .getByRole('region', { name: 'Page 100', exact: true })
        .locator('canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBe(0)
  await tabIn()
  expect(await focused()).toBe('100a')
  await expect(page.locator(':focus')).toBeInViewport()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('a scroll drops an arrow move still waiting for its page', async ({
  page,
}) => {
  await delayPage(page, 100, 1500)
  await show(page, { ...thousand, marks: await crossMarks() })
  const view = page.locator('.mc-pdf-scroll')
  await view.focus()
  await page.keyboard.press('Tab')
  const one = page.locator('[data-mark="1"]:focus')
  await expect(one).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  // Mark 1 stays in view, since WebKit may scroll back to reveal it.
  await view.evaluate((view) => (view.scrollTop += 100))
  await expect(
    page.getByRole('region', { name: 'Page 100', exact: true }),
  ).toBeAttached()
  expect(await view.evaluate((view) => view.scrollTop)).toBeCloseTo(100, 0)
  await expect(one).toHaveCount(1)
})

test('pages more than 3 screens away release their canvases', async ({
  page,
}) => {
  await show(page, thousand)
  await scrollTo(page, 60, 0.5)
  const canvases = () =>
    page.evaluate(() => {
      const view = document
        .querySelector('.mc-pdf-scroll')!
        .getBoundingClientRect()
      return Array.from(
        document.querySelectorAll<HTMLCanvasElement>('.mc-pdf-view > canvas'),
      ).map((canvas) => {
        const { top, bottom } = canvas.getBoundingClientRect()
        const away = Math.max(top - view.bottom, view.top - bottom, 0)
        return { width: canvas.width, screens: away / view.height }
      })
    })
  await expect
    .poll(async () =>
      (await canvases())
        .filter(({ screens }) => screens === 0)
        .every(({ width }) => width > 0),
    )
    .toBe(true)
  await expect
    .poll(async () =>
      (await canvases())
        .filter(({ screens }) => screens > 3)
        .map(({ width }) => width),
    )
    .toEqual(expect.arrayContaining([0]))
  await expect
    .poll(async () =>
      (await canvases()).every(({ screens, width }) => screens <= 3 || !width),
    )
    .toBe(true)
})

test('a failed load shows a Notice whose Retry loads it, and tells onError once', async ({
  page,
}) => {
  let fail = true
  await page.route(`**${thousand.url}`, (route) =>
    fail ? route.fulfill({ status: 404 }) : route.continue(),
  )
  await show(page, thousand)
  const retry = page.getByRole('button', { name: 'Retry' })
  await expect(retry).toBeVisible()
  await page.waitForTimeout(500)
  expect(
    await page.evaluate(() =>
      window.calls.filter(([kind]) => kind === 'error'),
    ),
  ).toEqual([['error', 'fetch', 404]])
  fail = false
  await retry.click()
  await expect(page.getByRole('region', { name: 'Page 1' })).toBeVisible()
  await expect(retry).toHaveCount(0)
})

// The alignment and access checks of page.spec.ts, inside the reader.
for (const zoom of [50, 100, 400]) {
  test.describe(`at ${zoom}%`, () => {
    test('every mark lands on its truth', async ({ page }) => {
      test.setTimeout(180_000)
      const all = await targets()
      for (const url of new Set(all.map((t) => t.url))) {
        const here = all.filter((t) => t.url === url)
        const marks = here.map((t) => ({
          id: `t${all.indexOf(t)}`,
          label: t.text,
          anchor: anchor(t.sha256, t.page, t.points),
        }))
        const file = { url, sha256: here[0]!.sha256, marks }
        await show(page, file)
        await zoomTo(page, zoom)
        for (const [i, t] of here.entries()) {
          const id = marks[i]!.id
          await show(page, { ...file, target: { mark: id } })
          const shape = `[data-mark="${id}"] .mc-pdf-shape`
          const measured = await page.waitForFunction((shape) => {
            const drawn = document.querySelector(shape)
            if (!drawn) return
            const view = drawn.closest('.mc-pdf-view')!.getBoundingClientRect()
            const box = drawn.getBoundingClientRect()
            return {
              width: view.width,
              mark: {
                left: box.left - view.left,
                top: box.top - view.top,
                right: box.right - view.left,
                bottom: box.bottom - view.top,
              },
            }
          }, shape)
          const { width, mark } = (await measured.jsonValue())!
          const where = `${url} page ${t.page} "${t.text}" at ${zoom}%`
          expect
            .soft(off(mark, shown(t.screen, [0, 0], width / t.width)), where)
            .toBeLessThanOrEqual(1)
        }
      }
    })

    test('marks are reached by Tab, moved by arrows in reading order, and activated by Enter or a click', async ({
      page,
    }) => {
      const t = (await targets()).find(({ text }) => text === 'turned0')!
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
      const file = {
        ...t,
        marks: [mark('c', 2), mark('a', 0), orphan, mark('b', 1)],
      }
      await show(page, file)
      await zoomTo(page, zoom)
      await show(page, { ...file, target: { mark: 'b' } })
      await expect(page.locator('.mc-pdf-mark')).toHaveCount(3)

      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
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
      await page.locator('.mc-pdf-scroll').focus()
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
      await show(page, { ...file, target: { mark: 'b' }, jump: 1 })
      const b = await page
        .locator('[data-mark="b"] .mc-pdf-shape')
        .boundingBox()
      await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2)
      const calls = await page.evaluate(() =>
        window.calls.filter(([kind]) => kind === 'activate'),
      )
      expect(calls).toEqual([
        ['activate', 'b'],
        ['activate', 'b'],
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
      const file = {
        ...t,
        marks: [
          half('right', 'outline', [middle, x1], 0.3),
          half('left', 'fill', [x0, middle], 0),
        ],
      }
      await show(page, file)
      await zoomTo(page, zoom)
      await expect(page.locator('.mc-pdf-mark')).toHaveCount(2)
      const focused = () =>
        page.evaluate(() => (document.activeElement as SVGElement).dataset.mark)
      await page.locator('.mc-pdf-scroll').focus()
      await page.keyboard.press('Tab')
      expect(await focused()).toBe('left')
      await page.keyboard.press('ArrowRight')
      expect(await focused()).toBe('right')
    })

    test('a click off the marks reports its point in user space', async ({
      page,
    }) => {
      const turned = (await targets()).filter(({ url }) =>
        url.endsWith('rotate.pdf'),
      )
      await show(page, turned[0]!)
      await zoomTo(page, zoom)
      for (const t of turned) {
        await show(page, { ...t, target: { page: t.page } })
        const region = page.getByRole('region', { name: `Page ${t.page}` })
        await expect(region).toBeInViewport()
        const { left, top, right, bottom } = t.screen
        // Brings the truth's middle to the view's, then clicks it.
        const at = await region.evaluate(
          (view, { x, y, width }) => {
            const scale = view.getBoundingClientRect().width / width
            const scroll = document.querySelector('.mc-pdf-scroll')!
            const frame = scroll.getBoundingClientRect()
            const box = view.getBoundingClientRect()
            scroll.scrollBy(
              box.left + x * scale - (frame.left + scroll.clientWidth / 2),
              box.top + y * scale - (frame.top + scroll.clientHeight / 2),
            )
            const moved = view.getBoundingClientRect()
            return { x: moved.left + x * scale, y: moved.top + y * scale }
          },
          { x: (left + right) / 2, y: (top + bottom) / 2, width: t.width },
        )
        await page.mouse.click(at.x, at.y)
        const [, point] = (await page.evaluate(() =>
          window.calls.filter(([kind]) => kind === 'click').at(-1),
        ))! as [string, { page: number; x: number; y: number }]
        expect(point.page).toBe(t.page)
        expect(
          Math.abs(point.x - (t.points[0]! + t.points[4]!) / 2),
          `${t.text} x`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(point.y - (t.points[1]! + t.points[5]!) / 2),
          `${t.text} y`,
        ).toBeLessThanOrEqual(1)
      }
    })
  })
}
