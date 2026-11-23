import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

type Opts = { open: boolean; title?: string; label?: string }

/** Mounts a page with a trigger and a Dialog whose `onClose` is logged and
 *  closes it, as a parent would. */
async function show(page: Page, opts: Opts) {
  await page.evaluate((opts) => {
    const { ui, h, mount } = window.harness
    window.calls = []
    const render = (open: boolean) =>
      mount(
        h(
          'main',
          null,
          h('h1', null, 'Page'),
          h('button', { id: 'opener', onClick: () => render(true) }, 'Open'),
          h(
            ui.Dialog,
            {
              ...opts,
              open,
              onClose: () => {
                window.calls.push(['close'])
                render(false)
              },
            } as never,
            h('p', null, 'Body'),
            h('input', { id: 'inside', 'aria-label': 'Inside' }),
          ),
        ),
      )
    render(opts.open)
  }, opts)
}

const calls = (page: Page) => page.evaluate(() => window.calls.length)
const dialog = (page: Page) => page.locator('dialog')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('it opens from the trigger, and Escape closes it and returns focus', async ({
  page,
}) => {
  await show(page, { open: false, title: 'Note' })
  await expect(dialog(page)).toBeHidden()
  await page.locator('#opener').focus()
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Note' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('#opener')).toBeFocused()
  await expect.poll(() => calls(page)).toBe(1)
})

test('the background is inert, and focus starts on the close control', async ({
  page,
}) => {
  await show(page, { open: true, title: 'Note' })
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.locator('#opener').focus()
  await expect(page.locator('#opener')).not.toBeFocused()
})

test('the close control closes it once', async ({ page }) => {
  await show(page, { open: true, label: 'Source' })
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect.poll(() => calls(page)).toBe(1)
})

test('a press on the backdrop closes it; a drag out from inside does not', async ({
  page,
}) => {
  await show(page, { open: true, title: 'Note' })
  const box = (await dialog(page).boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height - 20)
  await page.mouse.down()
  await page.mouse.move(2, 2)
  await page.mouse.up()
  await expect(dialog(page)).toBeVisible()
  await expect.poll(() => calls(page)).toBe(0)
  await page.mouse.click(2, 2)
  await expect(dialog(page)).toBeHidden()
  await expect.poll(() => calls(page)).toBe(1)
})

test('parent closing it does not call onClose', async ({ page }) => {
  await show(page, { open: true, title: 'Note' })
  await page.evaluate(() => {
    const { ui, h, mount } = window.harness
    mount(h(ui.Dialog, { open: false, title: 'Note', onClose() {} }))
  })
  await expect(dialog(page)).toBeHidden()
  await expect.poll(() => calls(page)).toBe(0)
})

test('it stays inside a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await show(page, { open: true, title: 'Note' })
  const box = (await dialog(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  expect(box.y + box.height).toBeLessThanOrEqual(480)
})

for (const scheme of ['light', 'dark'] as const)
  for (const naming of [{ title: 'Note' }, { label: 'Source' }])
    test(`it passes axe open in ${scheme}, named by ${Object.keys(naming)[0]}`, async ({
      page,
    }) => {
      await page.evaluate(
        (s) => document.documentElement.classList.add(s),
        scheme,
      )
      await show(page, { open: true, ...naming })
      await expect(dialog(page)).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    })
