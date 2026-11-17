import { expect, test } from '@playwright/test'

test('inkBox finds red ink and nothing else', async ({ page }) => {
  await page.goto('/')
  // Blank, white, blue, and half red.
  const boxes = await page.evaluate(() =>
    (
      [
        ['red', 0],
        ['white', 40],
        ['blue', 40],
        ['red', 20],
      ] as const
    ).map(([fill, width]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 20
      const context = canvas.getContext('2d')!
      context.fillStyle = fill
      context.fillRect(0, 0, width, 20)
      return window.harness.ink.inkBox(canvas, [255, 0, 0])
    }),
  )
  expect(boxes).toEqual([
    null,
    null,
    null,
    { left: 0, top: 0, right: 20, bottom: 20 },
  ])
})
