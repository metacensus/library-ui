import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Ink in truth: pdf.js alone paints each target's red inside its truth quad.
// The corpus is written when the harness server starts, after tests are listed,
// so each test reads it as it runs.

type Target = { page: number; points: number[]; text: string }

const corpus = join(import.meta.dirname, 'corpus')

for (const dpr of [1, 2, 3]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr })

    test('every target inks inside its truth at scale 0.5, 1 and 2', async ({
      page,
    }) => {
      const files = readdirSync(corpus)
        .filter((name) => name.endsWith('.pdf'))
        .map((name) => ({
          name,
          targets: (
            JSON.parse(
              readFileSync(join(corpus, name.replace(/pdf$/, 'json')), 'utf8'),
            ) as { targets: Target[] }
          ).targets,
        }))

      await page.goto('/')
      const found = await page.evaluate(async (files) => {
        const { getDocument, GlobalWorkerOptions } =
          await window.harness.pdfjs()
        const { inkBox, truthBox } = window.harness.ink
        GlobalWorkerOptions.workerSrc = '/pdf-assets/pdf.worker.min.mjs'
        const found = []
        for (const { name, targets } of files) {
          const loading = getDocument({
            url: `/corpus/${name}`,
            standardFontDataUrl: '/pdf-assets/standard_fonts/',
            useSystemFonts: false,
          })
          const pdf = await loading.promise
          for (const { page, points, text } of targets) {
            const at = await pdf.getPage(page)
            for (const scale of [0.5, 1, 2]) {
              const viewport = at.getViewport({ scale })
              const canvas = document.createElement('canvas')
              canvas.width = Math.ceil(viewport.width * devicePixelRatio)
              canvas.height = Math.ceil(viewport.height * devicePixelRatio)
              await at.render({
                canvas,
                viewport,
                transform: [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
              }).promise
              found.push({
                where: `${name} page ${page} "${text}" at scale ${scale}`,
                ink: inkBox(canvas, [255, 0, 0]),
                truth: truthBox(viewport, points),
                dpr: devicePixelRatio,
              })
              canvas.width = 0
            }
          }
          await loading.destroy()
        }
        return found
      }, files)

      expect(found.length).toBeGreaterThan(0)
      for (const { where, ink, truth, dpr: shown } of found) {
        expect(shown).toBe(dpr)
        expect.soft(ink, `${where}: no red ink`).not.toBeNull()
        if (!ink) continue
        // How far, in device pixels, the ink strays past the truth.
        const stray = Math.max(
          truth.left * dpr - ink.left,
          truth.top * dpr - ink.top,
          ink.right - truth.right * dpr,
          ink.bottom - truth.bottom * dpr,
        )
        expect
          .soft(
            stray,
            `${where}: ink past truth ${JSON.stringify({ ink, truth })}`,
          )
          .toBeLessThanOrEqual(1)
      }
    })
  })
}
