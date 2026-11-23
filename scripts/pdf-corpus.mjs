// Writes the PDFs that gate pdf.js upgrades to browser/corpus/, or to the
// directory given, each beside its truth: page, quad and text for every target
// word. Targets are pure red on a black page, so their ink can be found.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  beginText,
  concatTransformationMatrix,
  degrees,
  drawObject,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  showText,
} from 'pdf-lib'

const out = process.argv[2] ?? join(import.meta.dirname, '../browser/corpus')

// pdf.js draws Helvetica with the Liberation Sans it ships, and the TrueType
// files embed that font, so its outlines bound every word's ink.
const trueType = readFileSync(
  createRequire(import.meta.url).resolve(
    'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',
  ),
)
const liberation = fontkit.create(trueType)

const round = (n) => Math.round(n * 100) / 100

// A target bounds the boxes [x0, y0, x1, y1] its word inks.
const target = (page, text, boxes) => ({
  page,
  text,
  rect: [0, 1, 2, 3].map((i) =>
    (i < 2 ? Math.min : Math.max)(...boxes.map((b) => b[i])),
  ),
})

// A target's truth: its quad, counter-clockwise from start-bottom as the
// anchor's, and `screen`, its box as the page shows it at scale 1 in CSS px from
// the top left, worked out here rather than by pdf.js.
const truth = ({ page, text, rect: [x0, y0, x1, y1] }) => {
  const crop = page.getCropBox()
  const unit = page.node.get(PDFName.of('UserUnit'))?.asNumber() ?? 1
  const [w, h] = [crop.width * unit, crop.height * unit]
  const [left, right] = [x0, x1].map((x) => (x - crop.x) * unit)
  const [top, bottom] = [y1, y0].map((y) => (crop.y + crop.height - y) * unit)
  const [l, t, r, b] = {
    0: [left, top, right, bottom],
    90: [h - bottom, left, h - top, right],
    180: [w - right, h - bottom, w - left, h - top],
    270: [top, w - right, bottom, w - left],
  }[page.getRotation().angle].map(round)
  return {
    page: page.doc.getPages().indexOf(page) + 1,
    points: [x0, y0, x1, y0, x1, y1, x0, y1].map(round),
    text,
    screen: { left: l, top: t, right: r, bottom: b },
  }
}

const size = 24

const blackPage = (doc, size) => {
  const page = doc.addPage(size)
  const { x, y, width, height } = page.getMediaBox()
  page.drawRectangle({ x, y, width, height, color: rgb(0, 0, 0) })
  return page
}

// Draws `text` in red from (x, y) on its baseline.
const word = (page, text, x, y, font) => {
  page.drawText(text, { x, y, font, size, color: rgb(1, 0, 0) })
  const unit = size / liberation.unitsPerEm
  let pen = x
  const boxes = liberation.layout(text).glyphs.map(({ bbox, advanceWidth }) => {
    const box = [
      pen + bbox.minX * unit,
      y + bbox.minY * unit,
      pen + bbox.maxX * unit,
      y + bbox.maxY * unit,
    ]
    pen += advanceWidth * unit
    return box
  })
  return target(page, text, boxes)
}

// Writes `lines` down the page in white but for the parts in [brackets], which
// are red, and returns the target they make together.
const prose = (doc, font, lines) => {
  const page = blackPage(doc, [400, 300])
  const red = lines.flatMap((text, i) => {
    const y = page.getHeight() - 60 - i * 30
    let x = 30
    return text.split(/[[\]]/).flatMap((part, j) => {
      const at = x
      x += font.widthOfTextAtSize(part, size)
      if (j % 2) return [word(page, part, at, y, font)]
      page.drawText(part, { x: at, y, font, size, color: rgb(1, 1, 1) })
      return []
    })
  })
  return target(
    page,
    red.map(({ text }) => text).join(''),
    red.map(({ rect }) => rect),
  )
}

// Capitals built of rectangles [x, y, width, height] in a 1000-unit em: the
// Type3 font's glyphs, and the letters of the scanned page.
const em = { advance: 600, cap: 700 }
const capitals = {
  E: [
    [80, 0, 120, 700],
    [80, 580, 440, 120],
    [80, 300, 360, 120],
    [80, 0, 440, 120],
  ],
  F: [
    [80, 0, 120, 700],
    [80, 580, 440, 120],
    [80, 300, 360, 120],
  ],
  I: [[240, 0, 120, 700]],
  L: [
    [80, 0, 120, 700],
    [80, 0, 440, 120],
  ],
  T: [
    [240, 0, 120, 700],
    [60, 580, 480, 120],
  ],
}

// Each rectangle of `text` in capitals from (x, y), as [x0, y0, x1, y1].
const capitalRects = (text, x, y, size) =>
  [...text].flatMap((c, i) =>
    capitals[c].map(([rx, ry, rw, rh]) =>
      [i * em.advance + rx, ry, i * em.advance + rx + rw, ry + rh].map(
        (v, j) => (j % 2 ? y : x) + (v * size) / 1000,
      ),
    ),
  )

const type3 = (doc) => {
  const codes = Object.keys(capitals).map((c) => c.charCodeAt(0))
  const first = Math.min(...codes)
  const last = Math.max(...codes)
  const procs = Object.fromEntries(
    Object.entries(capitals).map(([c, rects]) => [
      c,
      doc.context.register(
        doc.context.flateStream(
          [
            `${em.advance} 0 0 0 ${em.advance} ${em.cap} d1`,
            ...rects.map((r) => `${r.join(' ')} re`),
            'f',
          ].join('\n'),
        ),
      ),
    ]),
  )
  return doc.context.register(
    doc.context.obj({
      Type: 'Font',
      Subtype: 'Type3',
      FontBBox: [0, 0, em.advance, em.cap],
      FontMatrix: [0.001, 0, 0, 0.001, 0, 0],
      CharProcs: procs,
      Encoding: {
        Type: 'Encoding',
        Differences: codes.flatMap((c) => [c, String.fromCharCode(c)]),
      },
      FirstChar: first,
      LastChar: last,
      Widths: Array(last - first + 1).fill(em.advance),
      Resources: {},
    }),
  )
}

const image = (page, ref, [x, y, width, height]) =>
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(width, 0, 0, height, x, y),
    drawObject(page.node.newXObject('Im', ref)),
    popGraphicsState(),
  )

// Its truth bounds the image's red pixels, as an OCR engine's would.
const scan = (doc, text, [width, height], x, y, size) => {
  const dpi = 2 // image pixels per pt
  const [w, h] = [width * dpi, height * dpi]
  const pixels = new Uint8Array(w * h * 3)
  const rects = capitalRects(text, x, y, size).map((rect) =>
    rect.map((v) => Math.round(v * dpi) / dpi),
  )
  for (const [x0, y0, x1, y1] of rects)
    for (let r = (height - y1) * dpi; r < (height - y0) * dpi; r++)
      for (let c = x0 * dpi; c < x1 * dpi; c++) pixels[(r * w + c) * 3] = 255
  const page = doc.addPage([width, height])
  const ref = doc.context.register(
    doc.context.flateStream(pixels, {
      Type: 'XObject',
      Subtype: 'Image',
      Width: w,
      Height: h,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
    }),
  )
  image(page, ref, [0, 0, width, height])
  return target(page, text, rects)
}

// 4 KB of dark noise, which no compression shrinks, so each page carries
// weight and reading one page is a small part of reading the file.
const ballast = (doc, seed) => {
  const bytes = new Uint8Array(64 * 64)
  let s = seed
  for (let i = 0; i < bytes.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    bytes[i] = s >>> 26
  }
  return doc.context.register(
    doc.context.stream(bytes, {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 64,
      Height: 64,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
    }),
  )
}

const files = {
  'rotate.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    return [0, 90, 180, 270].map((turn) => {
      const page = blackPage(doc, [300, 200])
      page.setRotation(degrees(turn))
      return word(page, `turned${turn}`, 30, 130, font)
    })
  },
  'crop-box.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = blackPage(doc, [612, 792])
    page.setCropBox(150, 300, 300, 200)
    return [word(page, 'cropped', 180, 420, font)]
  },
  'user-unit.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = blackPage(doc, [300, 200])
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
    return [word(page, 'doubled', 30, 130, font)]
  },
  'mixed-sizes.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    return [
      [300, 200],
      [200, 400],
      [612, 792],
    ].map(([width, height]) =>
      word(blackPage(doc, [width, height]), 'sized', 30, height - 70, font),
    )
  },
  'truetype.pdf': async (doc) => {
    const font = await doc.embedFont(trueType, { subset: true })
    return [word(blackPage(doc, [300, 200]), 'embedded', 30, 130, font)]
  },
  // U+FB01 is one glyph for two letters, read as "fi".
  'ligature.pdf': async (doc) => {
    const font = await doc.embedFont(trueType, { subset: true })
    const found = word(blackPage(doc, [300, 200]), 'ﬁnd', 30, 130, font)
    return [{ ...found, text: found.text.normalize('NFKC') }]
  },
  'type3.pdf': async (doc) => {
    const page = blackPage(doc, [300, 200])
    const text = 'LIFT'
    const [x, y, size] = [30, 130, 40]
    page.pushOperators(
      pushGraphicsState(),
      setFillingRgbColor(1, 0, 0),
      beginText(),
      setFontAndSize(page.node.newFontDictionary('T3', type3(doc)), size),
      moveText(x, y),
      showText(PDFString.of(text)),
      endText(),
      popGraphicsState(),
    )
    return [target(page, text, capitalRects(text, x, y, size))]
  },
  'scan.pdf': async (doc) => [scan(doc, 'TILE', [300, 200], 30, 100, 60)],
  'thousand-pages.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const targets = []
    for (let n = 1; n <= 1000; n++) {
      const page = blackPage(doc, [300, 200])
      image(page, ballast(doc, n), [216, 20, 64, 64])
      if (n === 1 || n % 100 === 0)
        targets.push(word(page, `${n}`, 30, 130, font))
    }
    return targets
  },
  'edition-1.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    return [
      ['The [final] count held,', 'as the ledger shows.'],
      ['Its ["held"] ratio rose.'],
      ['See [pages 3-5] for the', 'notes on each.'],
      ['Every [highlighted] word', 'keeps its place.'],
    ].map((lines) => prose(doc, font, lines))
  },
  // Edition 1 reset: each target a page later and lower, in the embedded font
  // with a ligature, curly quotes, an en dash and a word broken at a line end.
  // Page 4 says its target twice.
  'edition-2.pdf': async (doc) => {
    const font = await doc.embedFont(trueType, { subset: true })
    prose(doc, font, ['Second edition'])
    return [
      ['Revised:', 'the [ﬁnal] count held,', 'as the ledger shows.'],
      ['', 'Its [“held”] ratio rose.'],
      [
        '',
        'See [pages 3–5] for the',
        'notes on each, and',
        'list pages 3–5 again.',
      ],
      ['', 'Every [high-]', '[lighted] word keeps', 'its place.'],
    ].map((lines) => {
      const found = prose(doc, font, lines)
      return { ...found, text: found.text.normalize('NFKC') }
    })
  },
  'script.pdf': async (doc) => {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    doc.catalog.set(
      PDFName.of('OpenAction'),
      doc.context.obj({
        S: 'JavaScript',
        JS: PDFString.of(
          "globalThis.documentScriptRan = true; app.alert('document script ran')",
        ),
      }),
    )
    return [word(blackPage(doc, [300, 200]), 'inert', 30, 130, font)]
  },
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const [name, build] of Object.entries(files)) {
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.registerFontkit(fontkit)
  const targets = (await build(doc)).map(truth)
  writeFileSync(join(out, name), await doc.save())
  writeFileSync(
    join(out, name.replace(/\.pdf$/, '.json')),
    `${JSON.stringify({ targets }, null, 2)}\n`,
  )
}
