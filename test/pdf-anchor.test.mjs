import assert from 'node:assert/strict'
import { test } from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { quadFromRect, quadsFromFractions } from '../dist/pdf/index.js'
import schema from '../src/pdf/anchor.schema.json' with { type: 'json' }

test('quadFromRect runs counter-clockwise from the start-bottom', () => {
  assert.deepEqual(
    quadFromRect([72, 700.5, 180.25, 712]),
    [72, 700.5, 180.25, 700.5, 180.25, 712, 72, 712],
  )
})

test('quadsFromFractions matches pdf.js under each /Rotate and an offset crop box', async () => {
  const file = await PDFDocument.create()
  for (const rotation of [0, 90, 180, 270]) {
    const page = file.addPage([600, 800])
    page.setCropBox(30, 40, 500, 700)
    page.setRotation(degrees(rotation))
  }
  const loading = getDocument({ data: await file.save() })
  const doc = await loading.promise
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.05 }
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const [quad] = quadsFromFractions([rect], page)
    // Start-bottom, end-bottom, end-top, start-top, as displayed.
    const want = [
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y],
    ].flatMap(([u, v]) =>
      viewport.convertToPdfPoint(u * viewport.width, v * viewport.height),
    )
    quad.forEach((got, i) =>
      assert.ok(Math.abs(got - want[i]) <= 0.01, `/Rotate ${page.rotate}`),
    )
  }
  await loading.destroy()
})

const valid = new Ajv2020().compile(schema)
const anchor = () => ({
  source: {
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  selector: [
    {
      type: 'PdfQuadSelector',
      quads: [
        { page: 12, points: [72, 700.5, 180.25, 700.5, 180.25, 712, 72, 712] },
      ],
    },
    {
      type: 'TextQuoteSelector',
      exact: 'the quick brown fox',
      prefix: 'and then ',
      suffix: ' jumped',
    },
  ],
})

test('the schema accepts an anchor with both selectors', () => {
  assert.ok(valid(anchor()), JSON.stringify(valid.errors))
})

test('the schema rejects a malformed anchor', () => {
  const edits = {
    'a short hash': (a) => (a.source.sha256 = a.source.sha256.slice(1)),
    'an uppercase hash': (a) =>
      (a.source.sha256 = a.source.sha256.toUpperCase()),
    'a quad of 6 numbers': (a) => a.selector[0].quads[0].points.splice(6),
    'page 0': (a) => (a.selector[0].quads[0].page = 0),
    'a selector with no type': (a) => delete a.selector[1].type,
  }
  for (const [name, edit] of Object.entries(edits)) {
    const broken = anchor()
    edit(broken)
    assert.ok(!valid(broken), name)
  }
})
