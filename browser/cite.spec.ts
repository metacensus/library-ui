import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const mount = (page: Page) =>
  page.evaluate(() => {
    const { ui, h, mount } = window.harness
    mount(
      h(
        'main',
        null,
        h('h1', null, 'Cite'),
        h(ui.CiteThisPage, {
          citation: {
            title: 'A page',
            authors: ['Doe, Jane'],
            date: '2026-11-10',
            publisher: 'MetaCensus',
            url: 'https://metacensus.org/c/abc',
          },
          risHref: '/a.ris',
          bibHref: '/a.bib',
        }),
        h(ui.DisplayControls),
        h('a', { href: '#' }, 'Elsewhere'),
      ),
    )
  })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await mount(page)
})

const button = (page: Page) =>
  page.getByRole('button', { name: 'Cite this page' })

test('the button sits at the left edge, vertically centred, 2.75rem round, panel closed', async ({
  page,
}) => {
  const box = (await button(page).boundingBox())!
  const view = page.viewportSize()!
  expect(box.x).toBeLessThan(24)
  expect(box.width).toBe(44)
  expect(box.height).toBe(44)
  expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(2)
  await expect(page.getByRole('link', { name: 'Download RIS' })).toBeHidden()
})

test('hover, focus or a tap opens the panel; Escape, leaving or a tap elsewhere closes it', async ({
  page,
}) => {
  const ris = page.getByRole('link', { name: 'Download RIS' })
  await expect(page.getByText('Doe, Jane (2026-11-10)')).toBeHidden()

  await button(page).hover()
  await expect(ris).toBeVisible()
  await expect(page.getByText('Doe, Jane (2026-11-10)')).toBeVisible()
  await ris.hover()
  await expect(ris).toBeVisible()
  await page.mouse.move(600, 100)
  await expect(ris).toBeHidden()

  await button(page).focus()
  await expect(ris).toBeVisible()
  await ris.focus()
  await page.keyboard.press('Escape')
  await expect(ris).toBeHidden()
  await expect(button(page)).toBeFocused()
  await page.getByRole('link', { name: 'Elsewhere' }).focus()
  await expect(ris).toBeHidden()

  await button(page).dispatchEvent('click')
  await expect(ris).toBeVisible()
  await page.mouse.click(600, 100)
  await expect(ris).toBeHidden()
})

test('the open panel sits beside the button, inside a 320 px viewport, clear of the display button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await button(page).focus()
  const panel = (await page.locator('.mc-cite .mc-float-panel').boundingBox())!
  const btn = (await button(page).boundingBox())!
  const display = (await page
    .getByRole('button', { name: 'Display' })
    .boundingBox())!
  expect(panel.x).toBeGreaterThanOrEqual(btn.x + btn.width)
  expect(panel.x + panel.width).toBeLessThanOrEqual(320)
  expect(panel.y).toBeGreaterThanOrEqual(0)
  expect(panel.y + panel.height).toBeLessThanOrEqual(display.y)
})

test('the open panel has no accessibility violations in light and dark', async ({
  page,
}) => {
  await button(page).focus()
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.evaluate(() => {
      document.body.style.background = 'var(--mc-ground)'
      document.body.style.color = 'var(--mc-ink)'
    })
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
})
