import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const sitePort = Number(process.env.HARNESS_PORT ?? 5919) + 1

test.use({ baseURL: `http://localhost:${sitePort}` })

test('the main bar has the brand at the left, links centred, actions at the right', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const box = async (locator: ReturnType<typeof page.locator>) =>
    (await locator.boundingBox())!
  const header = page.locator('header.mc-header')
  const home = await box(header.locator('a.mc-header-home'))
  const nav = await box(header.getByRole('navigation', { name: 'Primary' }))
  const login = await box(header.getByRole('link', { name: 'Log in' }))
  const join = await box(header.getByRole('link', { name: 'Join us' }))
  const links = header.getByRole('navigation', { name: 'Primary' })
  await expect(links.getByRole('link')).toHaveText(['Why', 'Research', 'Blog'])
  expect(home.x).toBeLessThan(nav.x)
  expect(nav.x + nav.width).toBeLessThan(login.x)
  expect(login.x).toBeLessThan(join.x)
  expect(Math.abs(nav.x + nav.width / 2 - 640)).toBeLessThan(120)
  expect(join.x + join.width).toBeGreaterThan(1200)
})

test('the main bar scrolls away and the section bar sticks at the top', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.evaluate(() => window.scrollTo(0, 1000))
  const header = await page.locator('header.mc-header').boundingBox()
  expect(header!.y + header!.height).toBeLessThan(0)
  const bar = await page.locator('.mc-section-bar').boundingBox()
  expect(bar!.y).toBe(0)
})

test('at 375 px the main bar is one row under 64 px, the brand a mark and the links in the Menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  const header = page.locator('header.mc-header')
  expect((await header.boundingBox())!.height).toBeLessThan(64)
  const home = (await header.locator('a.mc-header-home').boundingBox())!
  expect(home.width).toBeLessThan(40)
  const items = [
    header.locator('a.mc-header-home'),
    header.locator('.mc-nav-menu'),
    header.getByRole('link', { name: 'Log in' }),
    header.getByRole('link', { name: 'Join us' }),
  ]
  const boxes = await Promise.all(items.map((i) => i.boundingBox()))
  const tops = boxes.map((b) => b!.y + b!.height / 2)
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4)
  const last = boxes.at(-1)!
  expect(last.x + last.width).toBeLessThanOrEqual(375)
  const links = header.locator('.mc-nav-links')
  await expect(links).toBeHidden()
  await header.locator('.mc-nav-menu').click()
  await expect(links.getByRole('link')).toHaveText(['Why', 'Research', 'Blog'])
  await expect(links).toBeVisible()
})

test('the footer links the legal section once and the organization on GitHub', async ({
  page,
}) => {
  await page.goto('/')
  const footer = page.locator('footer.mc-footer')
  await expect(footer.locator('a[href="/legal/"]')).toHaveCount(1)
  await expect(footer.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/metacensus',
  )
  await expect(footer).toContainText('© 2023–2026 MetaCensus.')
})

test('the layout has no accessibility violations, light or dark', async ({
  page,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations).toEqual([])
  }
})

test('the route inventory lists each page with its links', () => {
  const routes = readFileSync(
    join(import.meta.dirname, 'site/ROUTES.md'),
    'utf8',
  )
  expect(routes).toContain('## `/`')
  expect(routes).toContain('`https://github.com/metacensus`')
})
