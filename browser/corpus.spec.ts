import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// The corpus is written when the harness server starts, after tests are listed,
// so each test reads it as it runs.

type Box = { left: number; top: number; right: number; bottom: number }
type Target = { page: number; text: string; screen: Box }

const corpus = join(import.meta.dirname, 'corpus')
const scales = [0.5, 1, 2]

// pt beyond the 1 device px antialiasing blurs: how each engine rasterises the
// outlines truth bounds, worst for WebKit's rotated text.
const tolerance = 0.25

for (const dpr of [1, 2, 3]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr })

    test('every target inks on its truth', async ({ page }) => {
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
      const inks = await page.evaluate(
        async ({ files, scales }) => {
          const { getDocument, GlobalWorkerOptions } =
            await window.harness.pdfjs()
          GlobalWorkerOptions.workerSrc = '/pdf-assets/pdf.worker.min.mjs'
          const inks = []
          for (const { name, targets } of files) {
            const loading = getDocument({
              url: `/corpus/${name}`,
              standardFontDataUrl: '/pdf-assets/standard_fonts/',
              useSystemFonts: false,
            })
            const pdf = await loading.promise
            for (const { page } of targets) {
              const at = await pdf.getPage(page)
              for (const scale of scales) {
                const viewport = at.getViewport({
                  scale: scale * devicePixelRatio,
                })
                const canvas = document.createElement('canvas')
                canvas.width = Math.ceil(viewport.width)
                canvas.height = Math.ceil(viewport.height)
                await at.render({ canvas, viewport }).promise
                inks.push(window.harness.ink.inkBox(canvas, [255, 0, 0]))
                canvas.width = 0
              }
            }
            await loading.destroy()
          }
          return inks
        },
        { files, scales },
      )

      const expected = files.flatMap(({ name, targets }) =>
        targets.flatMap(({ page, text, screen }) =>
          scales.map((scale) => ({
            where: `${name} page ${page} "${text}" at scale ${scale}`,
            screen,
            px: scale * dpr,
          })),
        ),
      )
      expect(inks).toHaveLength(expected.length)
      expected.forEach(({ where, screen, px }, i) => {
        const ink = inks[i]
        expect.soft(ink, `${where}: no red ink`).not.toBeNull()
        if (!ink) return
        const off = Math.max(
          ...(['left', 'top', 'right', 'bottom'] as const).map((edge) =>
            Math.abs(ink[edge] - screen[edge] * px),
          ),
        )
        expect
          .soft(
            off,
            `${where}: ink off truth ${JSON.stringify({ ink, screen })}`,
          )
          .toBeLessThanOrEqual(tolerance * px + 1)
      })
    })
  })
}
