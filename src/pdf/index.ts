import type { PdfAnchor } from './anchor.js'

export { quadFromRect, quadsFromFractions, type PdfAnchor } from './anchor.js'
export { configurePdf } from './assets.js'

export type PdfSource =
  | {
      url: string
      sha256: string
      /** `Authorization` only, which fetch drops at a cross-origin redirect. */
      headers?: () => HeadersInit | Promise<HeadersInit>
    }
  | {
      data: Uint8Array
      /** Hashed on open when absent. */
      sha256?: string
    }

export type PdfMark = {
  id: string
  anchor: PdfAnchor
  /** The accessible name, e.g. "value 12.5, candidate 2". */
  label: string
  /** Default `fill`. */
  look?: 'fill' | 'outline' | 'dashed' | 'underline'
  /** Any CSS colour. Default `var(--mc-pdf-mark)`. */
  color?: string
  /** Up to 3 characters, at the start-top corner. */
  badge?: string
  /** A short word, at the end-top corner. */
  tag?: string
}

export type PdfTarget = { page: number } | { mark: string }

/** A point in PDF user space. */
export type PdfPoint = { page: number; x: number; y: number }

/** `anchor` is present when `reanchored`, for the caller to store. */
export type PdfResolution = {
  id: string
  status: 'exact' | 'reanchored' | 'orphan'
  anchor?: PdfAnchor
}

export type PdfError = {
  kind: 'fetch' | 'invalid' | 'password' | 'assets'
  status?: number
  message: string
}
