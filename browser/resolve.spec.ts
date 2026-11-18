import { expect, test, type Page } from '@playwright/test'
import Ajv2020 from 'ajv/dist/2020.js'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PdfAnchor, PdfMark, PdfResolution } from '../src/pdf/index.js'

// The corpus is written when the harness server starts, after tests are listed,
// so each test reads it as it runs.

type Quad = { page: number; points: number[] }
type Target = Quad & { text: string }
type Quote = { exact: string; prefix?: string; suffix?: string }

declare global {
  interface Window {
    resolved?: PdfResolution[]
  }
}

const corpus = join(import.meta.dirname, 'corpus')
// Corpus text is 24 pt.
const quarterEm = 6

/** Edition `n` of the reprinted file: its URL, hash and targets. */
function edition(n: number) {
  const name = `edition-${n}`
  const bytes = readFileSync(join(corpus, `${name}.pdf`))
  const json = readFileSync(join(corpus, `${name}.json`), 'utf8')
  return {
    url: `/corpus/${name}.pdf`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    targets: (JSON.parse(json) as { targets: Target[] }).targets,
  }
}

const anchor = (sha256: string, quads: Quad[], quote: Quote): PdfAnchor => ({
  source: { sha256 },
  selector: [
    { type: 'PdfQuadSelector', quads },
    { type: 'TextQuoteSelector', ...quote },
  ],
})

/** What a target says, where it says it. */
const quoted = (sha256: string, { text, ...at }: Target, context = {}) =>
  anchor(sha256, [at], { exact: text, ...context })

const marks = (...anchors: PdfAnchor[]): PdfMark[] =>
  anchors.map((anchor, i) => ({ id: `m${i}`, label: `mark ${i}`, anchor }))

let mounts = 0

/** Mounts page `at` of edition 2 with `marks`, and returns how they resolved. */
async function resolveOn(page: Page, marks: PdfMark[], at = 1) {
  const { url, sha256 } = edition(2)
  await page.evaluate(
    ({ url, sha256, marks, at, key }) => {
      const { pdf, h, mount } = window.harness
      pdf.configurePdf({ assets: '/pdf-assets/' })
      window.resolved = undefined
      mount(
        h(pdf.PdfPage, {
          key,
          source: { url, sha256 },
          page: at,
          marks,
          onResolve: (resolutions) => (window.resolved = resolutions),
        }),
      )
    },
    { url, sha256, marks, at, key: ++mounts },
  )
  const resolved = await page.waitForFunction(() => window.resolved)
  return (await resolved.jsonValue()) as PdfResolution[]
}

/** The anchor's quads, which a `reanchored` resolution carries. */
const quadsOf = ({ anchor }: PdfResolution): Quad[] =>
  anchor!.selector.flatMap((s) => (s.type === 'PdfQuadSelector' ? s.quads : []))

/** How far apart, in pt, the bounds of two sets of quads lie at most. */
function off(a: Quad[], b: Quad[]) {
  const bounds = (quads: Quad[]) => {
    const xs = quads.flatMap(({ points }) =>
      points.filter((_, i) => i % 2 === 0),
    )
    const ys = quads.flatMap(({ points }) =>
      points.filter((_, i) => i % 2 === 1),
    )
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  const [p, q] = [bounds(a), bounds(b)]
  return Math.max(...p.map((v, i) => Math.abs(v - q[i]!)))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('each target of edition 1 is reanchored on edition 2, within a quarter em of its truth', async ({
  page,
}) => {
  const [first, second] = [edition(1), edition(2)]
  const resolved = await resolveOn(
    page,
    marks(...first.targets.map((t) => quoted(first.sha256, t))),
    second.targets[0]!.page,
  )

  second.targets.forEach(({ text, ...truth }, i) => {
    const r = resolved[i]!
    expect.soft(r.status, text).toBe('reanchored')
    if (r.status !== 'reanchored') return
    const quads = quadsOf(r)
    expect
      .soft(new Set(quads.map((q) => q.page)), text)
      .toEqual(new Set([truth.page]))
    expect.soft(off(quads, [truth]), text).toBeLessThanOrEqual(quarterEm)
  })
  await expect(page.locator('.mc-pdf-mark')).toHaveCount(1)
  await expect(page.locator('[data-mark="m0"]')).toHaveCount(1)
})

test('a reanchored anchor is valid, names the new file, and resolves exact there', async ({
  page,
}) => {
  const [first, second] = [edition(1), edition(2)]
  const resolved = await resolveOn(
    page,
    marks(...first.targets.map((t) => quoted(first.sha256, t))),
  )
  const schema = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../src/pdf/anchor.schema.json'),
      'utf8',
    ),
  )
  const valid = new Ajv2020().compile(schema)
  for (const { anchor } of resolved) {
    expect(valid(anchor), JSON.stringify(valid.errors)).toBe(true)
    expect(anchor!.source.sha256).toBe(second.sha256)
  }

  const again = await resolveOn(page, marks(...resolved.map((r) => r.anchor!)))
  expect(again.map((r) => r.status)).toEqual(resolved.map(() => 'exact'))
})

test('a quote said twice on a page resolves by its prefix and suffix, else nearest its old quads', async ({
  page,
}) => {
  const [first, second] = [edition(1), edition(2)]
  const said = first.targets[2]!
  const red = [second.targets[2]!]
  const resolve = async (anchor: PdfAnchor) => {
    const [r] = await resolveOn(page, marks(anchor))
    expect(r!.status).toBe('reanchored')
    return quadsOf(r!)
  }

  const listed = await resolve(
    quoted(first.sha256, said, { prefix: 'list ', suffix: ' again.' }),
  )
  expect(off(listed, red)).toBeGreaterThan(4 * quarterEm)
  const quote = { exact: said.text }
  expect(
    off(
      await resolve(
        anchor(first.sha256, listed, {
          ...quote,
          prefix: 'See ',
          suffix: ' for the',
        }),
      ),
      red,
    ),
  ).toBeLessThanOrEqual(quarterEm)

  expect(await resolve(anchor(first.sha256, listed, quote))).toEqual(listed)
  expect(
    off(await resolve(quoted(first.sha256, said)), red),
  ).toBeLessThanOrEqual(quarterEm)
})

test('a quote two pages from its anchored page, or nowhere, is an orphan and not drawn', async ({
  page,
}) => {
  const first = edition(1)
  const final = first.targets[0]!
  const resolved = await resolveOn(
    page,
    marks(
      quoted(first.sha256, final),
      quoted(first.sha256, { ...final, page: final.page + 3 }),
      quoted(first.sha256, { ...final, text: 'not in this file' }),
    ),
    edition(2).targets[0]!.page,
  )

  expect(resolved.map((r) => r.status)).toEqual([
    'reanchored',
    'orphan',
    'orphan',
  ])
  await expect(page.locator('.mc-pdf-mark')).toHaveCount(1)
  await expect(page.locator('[data-mark="m0"]')).toHaveCount(1)
})
