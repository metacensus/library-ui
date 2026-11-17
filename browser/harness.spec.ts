import { expect, test } from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

test('pdf.js paints a page in its self-hosted worker under the CSP', async ({
  page,
}) => {
  const file = await PDFDocument.create()
  const font = await file.embedFont(StandardFonts.Helvetica)
  file.addPage([200, 100]).drawText('Ink', { x: 20, y: 40, size: 40, font })
  const bytes = [...(await file.save())]

  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toContain(
    "worker-src 'self'",
  )
  const dark = await page.evaluate(async (bytes) => {
    const { getDocument, GlobalWorkerOptions } = await window.harness.pdfjs()
    GlobalWorkerOptions.workerSrc = '/pdf-assets/pdf.worker.min.mjs'
    const loading = getDocument({ data: new Uint8Array(bytes) })
    const first = await (await loading.promise).getPage(1)
    const viewport = first.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await first.render({ canvas, viewport }).promise
    const { data } = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height)
    await loading.destroy()
    return data.some((v, i) => i % 4 === 0 && v < 128)
  }, bytes)

  expect(dark).toBe(true)
  expect(await page.evaluate(() => window.harness.violations)).toEqual([])
})
