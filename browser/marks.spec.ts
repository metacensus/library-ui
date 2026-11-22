import { expect, test, type Locator, type Page } from '@playwright/test'

// On dark grounds the halo lifts an `auto` mark's median edge to 3:1 (WCAG
// 1.4.11). Where glyphs nearly touch, the gap stays below it under every
// tuning, so the median is what is judged.
const PURPLE = [0x3b, 0x0e, 0x75] as const
const GROUNDS = { page: '#121318', footer: '#262932' } as const
const MARKS = [
  'MetaCensusMark',
  'MetaCensusLockup',
  'MetaCensusWordmark',
] as const

async function mount(page: Page, ground: string, scheme?: 'light' | 'dark') {
  await page.goto('/')
  await page.evaluate(
    ([ground, marks, scheme]) => {
      const { ui, h, mount } = window.harness
      mount(
        h(
          'main',
          {
            className: scheme,
            style: { background: ground, padding: '48px' },
          },
          marks.map((name) =>
            h(
              'div',
              { key: name, style: { padding: '24px' } },
              h(ui[name], { className: 'tested' }),
            ),
          ),
        ),
      )
    },
    [ground, MARKS, scheme] as const,
  )
  await page.addStyleTag({ content: '.tested { height: 96px }' })
}

/** The contrast between the mark's ink and the colour just outside it, at
 *  each edge pixel of a screenshot of `locator`. */
async function edgeRatios(page: Page, locator: Locator) {
  const png = (await locator.screenshot()).toString('base64')
  return page.evaluate(
    async ([png, purple]) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      )
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const { data, width, height } = context.getImageData(
        0,
        0,
        bitmap.width,
        bitmap.height,
      )
      const at = (x: number, y: number) => {
        const i = 4 * (y * width + x)
        return [data[i]!, data[i + 1]!, data[i + 2]!]
      }
      const ink = (x: number, y: number) =>
        at(x, y).every((c, k) => Math.abs(c - purple[k]!) <= 2)
      const luminance = (rgb: number[]) =>
        rgb
          .map((s) => s / 255)
          .map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
          .reduce((sum, c, k) => sum + c * [0.2126, 0.7152, 0.0722][k]!, 0)
      const inkL = luminance([...purple])
      const ratios: number[] = []
      for (let y = 4; y < height - 4; y++)
        for (let x = 4; x < width - 4; x++) {
          if (!ink(x, y)) continue
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            if (ink(x + dx, y + dy)) continue
            let L = 0
            for (let d = 1; d <= 4; d++)
              L = Math.max(L, luminance(at(x + dx * d, y + dy * d)))
            ratios.push((L + 0.05) / (inkL + 0.05))
          }
        }
      return ratios
    },
    [png, PURPLE] as const,
  )
}

for (const [name, ground] of Object.entries(GROUNDS))
  for (const reducedMotion of ['no-preference', 'reduce'] as const)
    test(`auto marks clear 3:1 on the ${name} ground in dark, motion ${reducedMotion}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion })
      await mount(page, ground)
      const marks = page.locator('.tested')
      // The moving halo is judged across its breathing and ring, its edges
      // pooled from frames 1.2 s apart; screenshots of it are slow.
      test.slow(reducedMotion === 'no-preference')
      const frames = reducedMotion === 'reduce' ? 1 : 3
      for (let i = 0; i < MARKS.length; i++) {
        const ratios: number[] = []
        for (let f = 0; f < frames; f++) {
          if (f) await page.waitForTimeout(1200)
          ratios.push(...(await edgeRatios(page, marks.nth(i).locator('..'))))
        }
        ratios.sort((a, b) => a - b)
        const median = ratios[Math.floor(ratios.length / 2)]!
        expect(median, MARKS[i]).toBeGreaterThanOrEqual(3)
      }
    })

const haloShown = (page: Page) =>
  page
    .locator('.tested .mc-halo')
    .evaluateAll((halos) =>
      halos.map((halo) => getComputedStyle(halo).display !== 'none'),
    )

test('the halo renders on a dark scheme, from the OS or a .dark ancestor', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await mount(page, GROUNDS.page)
  expect(await haloShown(page)).toEqual(MARKS.map(() => true))
  await page.emulateMedia({ colorScheme: 'light' })
  await mount(page, GROUNDS.page, 'dark')
  expect(await haloShown(page)).toEqual(MARKS.map(() => true))
})

test('the halo is not rendered on a light scheme, from the OS or a .light ancestor', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await mount(page, '#ffffff')
  expect(await haloShown(page)).toEqual(MARKS.map(() => false))
  await page.emulateMedia({ colorScheme: 'dark' })
  await mount(page, '#ffffff', 'light')
  expect(await haloShown(page)).toEqual(MARKS.map(() => false))
})

test('under reduced motion the still halo replaces the moving one', async ({
  page,
}) => {
  const shown = (layer: string) =>
    page
      .locator(`.tested .${layer}`)
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).display !== 'none'),
      )
  for (const [reducedMotion, still] of [
    ['no-preference', false],
    ['reduce', true],
  ] as const) {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion })
    await mount(page, GROUNDS.page)
    expect(await shown('mc-halo-moving')).toEqual(MARKS.map(() => !still))
    expect(await shown('mc-halo-still')).toEqual(MARKS.map(() => still))
  }
})
