// The corpus is written when the harness server starts, after tests are listed,
// so each test reads it as it runs.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, PDFNumber, PDFName } from 'pdf-lib'

type Box = { left: number; top: number; right: number; bottom: number }
type Target = { page: number; points: number[]; text: string; screen: Box }

export const corpus = join(import.meta.dirname, 'corpus')
export const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

/** Every corpus target, with its page's size and unit at scale 1 in CSS px. */
export async function targets() {
  const files = readdirSync(corpus).filter((name) => name.endsWith('.pdf'))
  return (
    await Promise.all(
      files.map(async (name) => {
        const bytes = readFileSync(join(corpus, name))
        const pages = (await PDFDocument.load(bytes)).getPages()
        const json = readFileSync(join(corpus, name.replace(/pdf$/, 'json')))
        return (JSON.parse(String(json)) as { targets: Target[] }).targets.map(
          (target) => {
            const page = pages[target.page - 1]!
            const crop = page.getCropBox()
            const unit =
              (
                page.node.get(PDFName.of('UserUnit')) as PDFNumber
              )?.asNumber() ?? 1
            const turned = page.getRotation().angle % 180 !== 0
            return {
              ...target,
              url: `/corpus/${name}`,
              sha256: sha256(bytes),
              unit,
              width: (turned ? crop.height : crop.width) * unit,
              height: (turned ? crop.width : crop.height) * unit,
            }
          },
        )
      }),
    )
  ).flat()
}

export const anchor = (sha256: string, page: number, ...quads: number[][]) => ({
  source: { sha256 },
  selector: [
    {
      type: 'PdfQuadSelector' as const,
      quads: quads.map((points) => ({ page, points })),
    },
  ],
})

export const off = (a: Box, b: Box) =>
  Math.max(
    ...(['left', 'top', 'right', 'bottom'] as const).map((edge) =>
      Math.abs(a[edge] - b[edge]),
    ),
  )

export const grow = ({ left, top, right, bottom }: Box, by: number): Box => ({
  left: left - by,
  top: top - by,
  right: right + by,
  bottom: bottom + by,
})

/** `box` from `origin`, at `scale`, padded 1 px as a fill is. */
export const shown = (box: Box, [x, y]: [number, number], scale: number) =>
  grow(
    {
      left: (box.left - x) * scale,
      top: (box.top - y) * scale,
      right: (box.right - x) * scale,
      bottom: (box.bottom - y) * scale,
    },
    1,
  )
