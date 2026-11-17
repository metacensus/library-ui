import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
} from 'pdf-lib'

/** Mostly page content, as a paper is. */
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

/** By range, unless `status` answers otherwise: `200` sends the whole file. */
function respond(bytes: Uint8Array, request: Served, status?: number) {
  if (status && status !== 200) return { status }
  const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(request.range ?? '') ?? []
  if (status === 200 || !first) {
    request.bytes = bytes.length
    return { status: 200, body: Buffer.from(bytes) }
  }
  const start = Number(first)
  const body = Buffer.from(bytes.subarray(start, Number(last) + 1))
  request.bytes = body.length
  const end = start + body.length - 1
  return {
    status: 206,
    headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
    body,
  }
}

async function serve(
  page: Page,
  bytes: Uint8Array,
  status?: (request: Served) => number | undefined,
) {
  const served: Served[] = []
  await page.route('**/file.pdf', (route) => {
    const { range, authorization } = route.request().headers()
    const request: Served = { range, authorization, bytes: 0 }
    served.push(request)
    return route.fulfill(respond(bytes, request, status?.(request)))
  })
  return served
}

async function signedLink(bytes: Uint8Array) {
  const served: Served[] = []
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range',
  }
  const server = createServer((req, res) => {
    const { range, authorization } = req.headers
    const request: Served = { range, authorization, bytes: 0 }
    if (req.method !== 'OPTIONS') served.push(request)
    const { status, headers, body } =
      req.method === 'OPTIONS' ? { status: 204 } : respond(bytes, request)
    res.writeHead(status, { ...cors, ...headers }).end(body)
  })
  await new Promise<void>((listening) =>
    server.listen(0, '127.0.0.1', listening),
  )
  const { port } = server.address() as AddressInfo
  return { served, server, url: `http://127.0.0.1:${port}/signed?sig=1` }
}

function show(
  page: Page,
  source: { hash: string } | { bytes: Uint8Array },
  showing = 1,
) {
  return page.evaluate(
    async ({ hash, bytes, showing }) => {
      let calls = 0
      const lease = window.harness.documents.open(
        bytes
          ? { data: new Uint8Array(bytes) }
          : {
              url: '/file.pdf',
              sha256: hash!,
              headers: () => ({ Authorization: `Bearer ${++calls}` }),
            },
      )
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
    {
      hash: 'hash' in source ? source.hash : undefined,
      bytes: 'bytes' in source ? [...source.bytes] : undefined,
      showing,
    },
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() =>
    window.harness.pdf.configurePdf({ assets: '/pdf-assets/' }),
  )
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
      const { documents } = window.harness
      const a = documents.open({ data: new Uint8Array(one) })
      const b = documents.open({ data: new Uint8Array(one), sha256: hash })
      const other = new Uint8Array(two)
      const c = documents.open({ data: other })
      const [fileA, fileB, fileC] = await Promise.all([
        a.document,
        b.document,
        c.document,
      ])
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
        destroyed: fileA.loadingTask.destroyed,
        reused: fileD === fileC && !fileC.loadingTask.destroyed,
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

test('a lease released twice releases once', async ({ page }) => {
  const bytes = [...(await generate(1))]
  const destroyed = await page.evaluate(async (bytes) => {
    const { documents } = window.harness
    const data = new Uint8Array(bytes)
    const [a, b] = [documents.open({ data }), documents.open({ data })]
    const file = await b.document
    const settle = () => new Promise((settled) => setTimeout(settled, 100))
    a.release()
    a.release()
    await settle()
    const kept = !file.loadingTask.destroyed
    b.release()
    await settle()
    return [kept, file.loadingTask.destroyed]
  }, bytes)
  expect(destroyed).toEqual([true, true])
})

test('page 500 of 1,000 shows after fetching under 10% of the file, by ranges with fresh headers', async ({
  page,
}) => {
  const bytes = await generate(1000)
  const served = await serve(page, bytes)
  const shown = await show(page, { hash: sha256(bytes) }, 500)
  expect(shown.pages).toBe(1000)
  expect(served.every((request) => request.range)).toBe(true)
  const fetched = served.reduce((sum, request) => sum + request.bytes, 0)
  expect(fetched).toBeLessThan(bytes.length / 10)
  const tokens = new Set(served.map((request) => request.authorization))
  expect([tokens.size, shown.calls]).toEqual([served.length, served.length])
})

test('a 302 to a signed link on another origin keeps Range and drops Authorization', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'Playwright cannot fulfill a 302 there')
  const bytes = await generate(1000)
  const signed = await signedLink(bytes)
  const hops: Served[] = []
  await page.route('**/file.pdf', (route) => {
    const { range, authorization } = route.request().headers()
    hops.push({ range, authorization, bytes: 0 })
    return route.fulfill({ status: 302, headers: { Location: signed.url } })
  })
  const shown = await show(page, { hash: sha256(bytes) }, 500)
  signed.server.close()
  expect(shown.pages).toBe(1000)
  expect(hops.every((hop) => hop.range && hop.authorization)).toBe(true)
  expect(signed.served.every((hop) => hop.range && !hop.authorization)).toBe(
    true,
  )
  expect(signed.served.length).toBe(hops.length)
  const fetched = signed.served.reduce((sum, hop) => sum + hop.bytes, 0)
  expect(fetched).toBeLessThan(bytes.length / 10)
})

test('a 401 mid-read asks for headers again and the page still shows', async ({
  page,
}) => {
  const bytes = await generate(1000)
  let n = 0
  const served = await serve(page, bytes, () => (++n === 2 ? 401 : undefined))
  const shown = await show(page, { hash: sha256(bytes) }, 500)
  expect(shown).toEqual({ calls: served.length, pages: 1000 })
})

for (const status of [500, 200]) {
  test(`a range answered ${status} after the first rejects as fetch, and a re-open loads afresh`, async ({
    page,
  }) => {
    const bytes = await generate(1000)
    let failing = true
    let n = 0
    await serve(page, bytes, () => (failing && ++n > 1 ? status : undefined))
    const hash = sha256(bytes)
    expect(await show(page, { hash }, 500)).toMatchObject({ kind: 'fetch' })
    failing = false
    expect(await show(page, { hash }, 500)).toMatchObject({ pages: 1000 })
  })
}

test('a server without ranges still opens the file', async ({ page }) => {
  const bytes = await generate(3)
  await serve(page, bytes, () => 200)
  expect((await show(page, { hash: sha256(bytes) })).pages).toBe(3)
})

test('a 401 asks for headers again and retries once', async ({ page }) => {
  const bytes = await generate(1)
  await serve(page, bytes, ({ authorization }) =>
    authorization === 'Bearer 1' ? 401 : undefined,
  )
  expect(await show(page, { hash: sha256(bytes) })).toEqual({
    calls: 2,
    pages: 1,
  })
})

test('a second 401 rejects as fetch', async ({ page }) => {
  const bytes = await generate(1)
  await serve(page, bytes, () => 401)
  expect(await show(page, { hash: sha256(bytes) })).toEqual({
    calls: 2,
    kind: 'fetch',
    status: 401,
  })
})

test('a 404 rejects as fetch with its status', async ({ page }) => {
  const bytes = await generate(1)
  await serve(page, bytes, () => 404)
  expect(await show(page, { hash: sha256(bytes) })).toEqual({
    calls: 1,
    kind: 'fetch',
    status: 404,
  })
})

test('headers() setting another header, or throwing, rejects as fetch', async ({
  page,
}) => {
  const bytes = await generate(1)
  const served = await serve(page, bytes)
  const kinds = await page.evaluate(async (hash) => {
    const kind = (headers: () => HeadersInit) =>
      window.harness.documents
        .open({ url: '/file.pdf', sha256: hash, headers })
        .document.then(
          () => 'opened',
          (error: { kind: string }) => error.kind,
        )
    return [
      await kind(() => ({ 'X-Api-Key': 'key' })),
      await kind(() => {
        throw new Error('no token')
      }),
    ]
  }, sha256(bytes))
  expect(kinds).toEqual(['fetch', 'fetch'])
  expect(served).toEqual([])
})

test('garbage, encryption, no assets and no hashing each reject typed', async ({
  page,
}) => {
  const garbage = new Uint8Array(4096).map((_, i) => (i * 7919) % 251)
  const encrypted = await generate(1, ({ context }) => {
    context.trailerInfo.Encrypt = context.register(
      context.obj({
        Filter: 'Standard',
        V: 1,
        R: 2,
        P: -4,
        O: PDFHexString.of('01'.repeat(32)),
        U: PDFHexString.of('02'.repeat(32)),
      }),
    )
  })
  const kind = async (bytes: Uint8Array) => (await show(page, { bytes })).kind
  expect(await kind(garbage)).toBe('invalid')
  expect(await kind(encrypted)).toBe('password')
  await page.evaluate(() =>
    Object.defineProperty(window.crypto, 'subtle', { value: undefined }),
  )
  expect(await kind(await generate(1))).toBe('assets')
  await page.reload()
  expect(await kind(await generate(1))).toBe('assets')
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
      JS: PDFString.of(
        "globalThis.documentScriptRan = true; app.alert('document script ran')",
      ),
    })
    file.catalog.set(PDFName.of('OpenAction'), file.context.register(script))
  })
  await serve(page, bytes)
  const hash = sha256(bytes)
  expect(await show(page, { hash })).toEqual({ calls: 1, pages: 1 })
  const after = await page.evaluate(async (hash) => {
    const lease = window.harness.documents.open({
      url: '/file.pdf',
      sha256: hash,
    })
    const actions = await (await lease.document).getJSActions()
    return {
      carried: String(actions?.get('OpenAction')).includes('ScriptRan'),
      ran: 'documentScriptRan' in window,
      violations: window.harness.violations,
    }
  }, hash)
  expect(after).toEqual({ carried: true, ran: false, violations: [] })
  expect(dialogs).toEqual([])
})
