import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const mount = (page: Page) =>
  page.evaluate(() => {
    const { ui, h, mount } = window.harness
    new Function(ui.displayScript)()
    mount(
      h(
        'main',
        null,
        h('h1', null, 'Display'),
        h(ui.DisplayControls),
        h('a', { href: '#' }, 'Elsewhere'),
      ),
    )
  })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

const classes = (page: Page) =>
  page.evaluate(() => Array.from(document.documentElement.classList))

test('the button sits at the bottom-left corner, 2.75rem square, panel closed', async ({
  page,
}) => {
  await mount(page)
  const button = page.getByRole('button', { name: 'Display' })
  const box = (await button.boundingBox())!
  expect(box.x).toBeLessThan(24)
  expect(page.viewportSize()!.height - (box.y + box.height)).toBeLessThan(24)
  expect(box.width).toBe(44)
  expect(box.height).toBe(44)
  await expect(page.getByRole('group', { name: 'Theme' })).toBeHidden()
})

test('hover, focus or a tap opens the panel; Escape, leaving or a tap elsewhere closes it', async ({
  page,
}) => {
  await mount(page)
  const button = page.getByRole('button', { name: 'Display' })
  const panel = page.getByRole('group', { name: 'Theme' })

  await button.hover()
  await expect(panel).toBeVisible()
  await panel.getByRole('radio', { name: 'Light' }).hover()
  await expect(panel).toBeVisible()
  await page.mouse.move(400, 100)
  await expect(panel).toBeHidden()

  await button.focus()
  await expect(panel).toBeVisible()
  await panel.getByRole('radio', { name: 'System' }).focus()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(button).toBeFocused()
  const elsewhere = page.getByRole('link', { name: 'Elsewhere' })
  await elsewhere.focus()
  await button.focus()
  await expect(panel).toBeVisible()
  await elsewhere.focus()
  await expect(panel).toBeHidden()

  await button.dispatchEvent('click')
  await expect(panel).toBeVisible()
  await page.mouse.click(400, 100)
  await expect(panel).toBeHidden()
})

test('the panel stays inside a 320 px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await mount(page)
  await page.getByRole('button', { name: 'Display' }).focus()
  const box = (await page.locator('.mc-float-panel').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  expect(box.y).toBeGreaterThanOrEqual(0)
})

test('the theme follows the system until chosen, and the choice is kept', async ({
  page,
}) => {
  await mount(page)
  await page.getByRole('button', { name: 'Display' }).focus()
  await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()
  expect(await classes(page)).toEqual([])
  await page.getByRole('radio', { name: 'Dark' }).check()
  expect(await classes(page)).toEqual(['dark'])
  await page.reload()
  await mount(page)
  expect(await classes(page)).toEqual(['dark'])
  await page.getByRole('button', { name: 'Display' }).focus()
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked()
  await page.getByRole('radio', { name: 'System' }).check()
  expect(await classes(page)).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('mc-theme'))).toBeNull()
})

test('stopping animations sets .still, is kept, and can override the OS either way', async ({
  page,
}) => {
  await mount(page)
  await page.getByRole('button', { name: 'Display' }).focus()
  const stop = page.getByRole('checkbox', { name: 'Stop animations' })
  await expect(stop).not.toBeChecked()
  await stop.check()
  expect(await classes(page)).toEqual(['still'])
  await page.reload()
  await mount(page)
  expect(await classes(page)).toEqual(['still'])

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await mount(page)
  expect(await classes(page)).toEqual(['still'])
  await page.getByRole('button', { name: 'Display' }).focus()
  await expect(
    page.getByRole('checkbox', { name: 'Stop animations' }),
  ).toBeChecked()
  await page.getByRole('checkbox', { name: 'Stop animations' }).uncheck()
  await page.reload()
  await mount(page)
  expect(await classes(page)).toEqual([])
})

test('every control is reachable by Tab and its focus ring shows on both grounds', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Safari tabs to links, not controls')
  await mount(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.evaluate(() => {
      document.body.style.background = 'var(--mc-ground)'
      document.body.style.color = 'var(--mc-ink)'
    })
    await page.getByRole('button', { name: 'Display' }).focus()
    for (const type of ['radio', 'checkbox']) {
      await page.keyboard.press('Tab')
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement
        const s = getComputedStyle(el)
        return [el.type, s.outlineStyle, s.outlineWidth]
      })
      expect(ring, scheme).toEqual([type, 'solid', '2px'])
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
})

test('under .still the moving halo is hidden and the still one shown', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => {
    const { ui, h, mount } = window.harness
    mount(h('main', null, h(ui.MetaCensusMark), h(ui.DisplayControls)))
  })
  const shown = (layer: string) =>
    page
      .locator(`.${layer}`)
      .evaluate((el) => getComputedStyle(el).display !== 'none')
  expect(await shown('mc-halo-moving')).toBe(true)
  await page.getByRole('button', { name: 'Display' }).focus()
  await page.getByRole('checkbox', { name: 'Stop animations' }).check()
  expect(await shown('mc-halo-moving')).toBe(false)
  expect(await shown('mc-halo-still')).toBe(true)
})
