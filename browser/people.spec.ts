import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const { ui, h, mount } = window.harness
    mount(
      h(
        'main',
        null,
        h('h1', null, 'People'),
        h(
          ui.ContributorCard,
          {
            name: 'Ada Example',
            href: '#ada',
            role: 'Engineer',
            metacensusTitle: true,
            flavor: 'both',
            level: 2,
          },
          h('p', null, 'A bio with ', h('a', { href: '#more' }, 'a link'), '.'),
        ),
        h('a', { href: '#after' }, 'After'),
        h(
          'p',
          null,
          ui.AUDIENCES.map((audience) =>
            h(ui.AudienceIcon, { audience, key: audience }),
          ),
        ),
      ),
    )
  })
})

const floating = '.mc-contributor-floating'

/** Points at the card. Not `hover()`: the copy floats over the shell as the
 *  pointer arrives, and its hit check would see the shell covered. */
async function point(page: Page) {
  const box = (await page.locator('.mc-contributor-shell').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
}

test('the card floats into body on hover or focus, until both end or Escape', async ({
  page,
}) => {
  const copy = page.locator(floating)
  await expect(copy).toHaveCount(0)

  await point(page)
  await expect(copy).toHaveCount(1)
  expect(await copy.evaluate((el) => el.parentElement === document.body)).toBe(
    true,
  )
  await page.keyboard.press('Escape')
  await expect(copy).toHaveCount(0)

  await page.getByRole('link', { name: 'Ada Example' }).focus()
  await expect(copy).toHaveCount(1)
  // The pointer crossing and leaving does not close a focused card.
  await point(page)
  await page.mouse.move(0, 0)
  await expect(copy).toHaveCount(1)
  // The copy is out of the tab order, and blur closes the card.
  for (const link of await copy.locator('a').all())
    await expect(link).toHaveAttribute('tabindex', '-1')
  await page.getByRole('link', { name: 'After' }).focus()
  await expect(copy).toHaveCount(0)
})

test('the card, floating, and the audience icons pass axe', async ({
  page,
}) => {
  await point(page)
  await expect(page.locator(floating)).toHaveAttribute('aria-hidden', 'true')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (const label of [
    'Engineers',
    'Regulators and guideline groups',
    'Contributors',
  ])
    await expect(page.getByRole('img', { name: label })).toBeVisible()
})
