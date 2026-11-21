import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('mc-theme')
    const { ui, h, mount } = window.harness
    mount(h('main', null, h('h1', null, 'Theme'), h(ui.ThemeToggle)))
  })
})

test('a click cycles system, light, dark and back, on the root and the label', async ({
  page,
}) => {
  const rootTheme = () =>
    page.evaluate(
      () =>
        ['light', 'dark'].find((t) =>
          document.documentElement.classList.contains(t),
        ) ?? 'system',
    )
  for (const [name, next, theme] of [
    ['System', 'Light', 'system'],
    ['Light', 'Dark', 'light'],
    ['Dark', 'System', 'dark'],
    ['System', 'Light', 'system'],
  ] as const) {
    const button = page.getByRole('button', {
      name: `Theme: ${name}. Switch to ${next}`,
    })
    await expect(button).toHaveText(name)
    expect(await rootTheme()).toBe(theme)
    await button.click()
  }
  await page.locator('.mc-theme-toggle').focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Theme: Dark. Switch to System' }),
  ).toBeVisible()
})

test('it floats at the bottom and shows its name only on hover or focus', async ({
  page,
}) => {
  const button = page.locator('.mc-theme-toggle')
  const name = page.locator('.mc-theme-toggle-name')
  const viewport = page.viewportSize()!
  const box = (await button.boundingBox())!
  expect(viewport.height - (box.y + box.height)).toBeLessThan(24)
  expect(box.width).toBe(box.height)
  expect((await name.boundingBox())?.width ?? 0).toBe(0)

  const widened = () =>
    expect
      .poll(async () => (await name.boundingBox())!.width)
      .toBeGreaterThan(20)
  await button.hover()
  await widened()
  await page.mouse.move(0, 0)
  await expect.poll(async () => (await name.boundingBox())!.width).toBe(0)
  await button.focus()
  await widened()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('with reduced motion the name shows without a transition', async ({
  page,
}) => {
  const duration = () =>
    page
      .locator('.mc-theme-toggle-name')
      .evaluate((el) => getComputedStyle(el).transitionDuration)
  expect(await duration()).not.toMatch(/^0s(, 0s)*$/)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await duration()).toMatch(/^0s(, 0s)*$/)
})
