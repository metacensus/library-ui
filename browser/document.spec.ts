import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
} from 'pdf-lib'

/** Each page carries a block of digits, so the file is mostly page content. */
async function generate(pages: number, edit?: (file: PDFDocument) => void) {
  const file = await PDFDocument.create()
  const font = await file.embedFont(StandardFonts.Helvetica)
  let seed = pages
  const digit = () => (seed = (seed * 48271) % 2147483647) % 10
  for (let n = 1; n <= pages; n++) {
    const block = Array.from({ length: 100 }, () =>
      Array.from({ length: 80 }, digit).join(''),
    )
    const page = file.addPage([300, 400])
    page.drawText(`Page ${n}`, { x: 20, y: 370, size: 20, font })
    page.drawText(block.join('\n'), { x: 10, y: 350, size: 3, font })
  }
  edit?.(file)
  return file.save()
}

const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

type Served = { range?: string; authorization?: string; bytes: number }

/**
 * Serves `bytes` at /file.pdf, by range unless `ranges` is false. `refuse`
 * answers a request with a status of its own.
 */
async function serve(
  page: Page,
  bytes: Uint8Array,
  {
    ranges = true,
    refuse,
  }: {
    ranges?: boolean
    refuse?: (request: Served) => number | undefined
  } = {},
) {
  const served: Served[] = []
  await page.route('**/file.pdf', (route) => {
    const { range, authorization } = route.request().headers()
    const request: Served = { range, authorization, bytes: 0 }
    served.push(request)
    const status = refuse?.(request)
    if (status) return route.fulfill({ status })
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range ?? '') ?? []
    if (!ranges || !start) {
      request.bytes = bytes.length
      return route.fulfill({ body: Buffer.from(bytes) })
    }
    const body = bytes.subarray(Number(start), Number(end) + 1)
    request.bytes = body.length
    return route.fulfill({
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
      body: Buffer.from(body),
    })
  })
  return served
}

/** Opens the URL source, counting calls to `headers()`, and settles. */
function openUrl(page: Page, hash: string, showing = 1) {
  return page.evaluate(
    async ({ hash, showing }) => {
      const { pdf, documents } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      let calls = 0
      const lease = documents.open({
        url: '/file.pdf',
        sha256: hash,
        headers: () => ({ Authorization: `Bearer ${++calls}` }),
      })
      try {
        const file = await lease.document
        const shown = await file.getPage(showing)
        const viewport = shown.getViewport({ scale: 1 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        await shown.render({ canvas, viewport }).promise
        return { calls, pages: file.numPages }
      } catch (error) {
        const { kind, status } = error as { kind: string; status?: number }
        return { calls, kind, status }
      }
    },
    { hash, showing },
  )
}

/** Opens bytes and settles to the error's kind, or to `opened`. */
function openBytes(page: Page, bytes: Uint8Array, configure = true) {
  return page.evaluate(
    async ({ bytes, configure }) => {
      const { pdf, documents } = window.harness
      if (configure) pdf.configurePdf({ assets: '/pdf-assets/' })
      return documents.open({ data: new Uint8Array(bytes) }).document.then(
        () => 'opened',
        (error: { kind: string }) => error.kind,
      )
    },
    { bytes: [...bytes], configure },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('one worker serves every file, and one document every open of a hash', async ({
  page,
}) => {
  const one = [...(await generate(1))]
  const two = [...(await generate(2))]
  const held = await page.evaluate(
    async ({ one, two, hash }) => {
      let workers = 0
      window.Worker = class extends window.Worker {
        constructor(...args: ConstructorParameters<typeof Worker>) {
          super(...args)
          workers++
        }
      }
      const { pdf, documents } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      const a = documents.open({ data: new Uint8Array(one) })
      const b = documents.open({ data: new Uint8Array(one), sha256: hash })
      const other = new Uint8Array(two)
      const c = documents.open({ data: other })
      const [fileA, fileB, fileC] = await Promise.all(
        [a, b, c].map((lease) => lease.document),
      )
      a.release()
      b.release()
      c.release()
      const d = documents.open({ data: other })
      const fileD = await d.document
      await new Promise((settled) => setTimeout(settled, 100))
      return {
        workers,
        shared: fileA === fileB,
        distinct: fileA !== fileC,
        intact: other.byteLength === two.length,
        destroyed: fileA!.loadingTask.destroyed,
        reused: fileD === fileC && !fileC!.loadingTask.destroyed,
      }
    },
    { one, two, hash: sha256(new Uint8Array(one)) },
  )
  expect(held).toEqual({
    workers: 1,
    shared: true,
    distinct: true,
    intact: true,
    destroyed: true,
    reused: true,
  })
})

test('page 500 of 1,000 shows after fetching under 10% of the file, by ranges with fresh headers', async ({
  page,
}) => {
  const bytes = await generate(1000)
  const served = await serve(page, bytes)
  const opened = await openUrl(page, sha256(bytes), 500)
  expect(opened.pages).toBe(1000)
  expect(served.every((request) => request.range)).toBe(true)
  const fetched = served.reduce((sum, request) => sum + request.bytes, 0)
  expect(fetched).toBeLessThan(bytes.length / 10)
  const tokens = new Set(served.map((request) => request.authorization))
  expect([tokens.size, opened.calls]).toEqual([served.length, served.length])
})

test('a range failing after open drops the document, so a re-open loads afresh', async ({
  page,
}) => {
  const bytes = await generate(1000)
  let failing = false
  await serve(page, bytes, { refuse: () => (failing ? 500 : undefined) })
  const url = { url: '/file.pdf', sha256: sha256(bytes) }
  const first = await page.evaluateHandle((url) => {
    window.harness.pdf.configurePdf({ assets: '/pdf-assets/' })
    return window.harness.documents.open(url).document
  }, url)
  failing = true
  const shown = await first.evaluate((file) =>
    file
      .getPage(500)
      .then((shown) => {
        const viewport = shown.getViewport({ scale: 1 })
        const canvas = document.createElement('canvas')
        return shown.render({ canvas, viewport }).promise
      })
      .then(
        () => 'shown',
        () => 'lost',
      ),
  )
  failing = false
  const fresh = await first.evaluate(
    async (file, url) =>
      (await window.harness.documents.open(url).document) !== file,
    url,
  )
  expect([shown, fresh]).toEqual(['lost', true])
})

test('a server without ranges still opens the file', async ({ page }) => {
  const bytes = await generate(3)
  await serve(page, bytes, { ranges: false })
  expect((await openUrl(page, sha256(bytes))).pages).toBe(3)
})

test('a 401 asks for headers again and retries once', async ({ page }) => {
  const bytes = await generate(1)
  await serve(page, bytes, {
    refuse: ({ authorization }) =>
      authorization === 'Bearer 1' ? 401 : undefined,
  })
  expect(await openUrl(page, sha256(bytes))).toEqual({ calls: 2, pages: 1 })
})

test('a second 401 rejects as fetch', async ({ page }) => {
  const bytes = await generate(1)
  await serve(page, bytes, { refuse: () => 401 })
  expect(await openUrl(page, sha256(bytes))).toEqual({
    calls: 2,
    kind: 'fetch',
    status: 401,
  })
})

test('a 404 rejects as fetch with its status', async ({ page }) => {
  const bytes = await generate(1)
  await serve(page, bytes, { refuse: () => 404 })
  expect(await openUrl(page, sha256(bytes))).toEqual({
    calls: 1,
    kind: 'fetch',
    status: 404,
  })
})

test('garbage rejects as invalid, encryption as password, and no assets as assets', async ({
  page,
}) => {
  const garbage = new Uint8Array(4096).map((_, i) => (i * 7919) % 251)
  const encrypted = await generate(1, (file) => {
    const { context } = file
    context.trailerInfo.Encrypt = context.register(
      context.obj({
        Filter: 'Standard',
        V: 1,
        R: 2,
        Length: 40,
        P: -4,
        O: PDFHexString.of('01'.repeat(32)),
        U: PDFHexString.of('02'.repeat(32)),
      }),
    )
    context.trailerInfo.ID = context.obj([
      PDFHexString.of('03'.repeat(16)),
      PDFHexString.of('03'.repeat(16)),
    ])
  })
  expect(await openBytes(page, garbage)).toBe('invalid')
  expect(await openBytes(page, encrypted)).toBe('password')
  await page.reload()
  expect(await openBytes(page, await generate(1), false)).toBe('assets')
})

test('document JavaScript never runs, under the CSP', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  const bytes = await generate(1, (file) => {
    const script = file.context.obj({
      S: 'JavaScript',
      JS: PDFString.of('app.alert("document script ran")'),
    })
    file.catalog.set(PDFName.of('OpenAction'), file.context.register(script))
  })
  await serve(page, bytes)
  expect(await openUrl(page, sha256(bytes))).toEqual({ calls: 1, pages: 1 })
  expect(await page.evaluate(() => window.harness.violations)).toEqual([])
  expect(dialogs).toEqual([])
})
