import type { PageViewport } from 'pdfjs-dist'

type Box = { left: number; top: number; right: number; bottom: number }

/** The bounds of the pixels on `canvas` at least half `rgb` over black. */
export function inkBox(
  canvas: HTMLCanvasElement,
  [r, g, b]: readonly [number, number, number],
): Box | null {
  const { width, height } = canvas
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, width, height)
  const norm = r * r + g * g + b * b
  const box = { left: width, top: height, right: 0, bottom: 0 }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const pr = data[i]!
      const pg = data[i + 1]!
      const pb = data[i + 2]!
      // How much of `rgb` the pixel holds, and how far it strays from that.
      const coverage = (pr * r + pg * g + pb * b) / norm
      const off =
        (pr - coverage * r) ** 2 +
        (pg - coverage * g) ** 2 +
        (pb - coverage * b) ** 2
      if (coverage < 0.5 || off > norm / 64) continue
      box.left = Math.min(box.left, x)
      box.top = Math.min(box.top, y)
      box.right = Math.max(box.right, x + 1)
      box.bottom = y + 1
    }
  return box.right ? box : null
}

/** A quad's bounds on `viewport`, in its px. */
export function truthBox(viewport: PageViewport, quad: readonly number[]): Box {
  const corners = [0, 2, 4, 6].map((i) =>
    viewport.convertToViewportPoint(quad[i]!, quad[i + 1]!),
  )
  const xs = corners.map(([x]) => x!)
  const ys = corners.map(([, y]) => y!)
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  }
}
