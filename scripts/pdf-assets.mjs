// Copies what the pinned pdf.js loads at run time into dist/pdf-assets/, which
// callers serve from their own origin.
import { cpSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'

const from = dirname(
  createRequire(import.meta.url).resolve('pdfjs-dist/package.json'),
)
const to = join(import.meta.dirname, '../dist/pdf-assets')

rmSync(to, { recursive: true, force: true })
for (const path of [
  'build/pdf.worker.min.mjs',
  'wasm',
  'cmaps',
  'standard_fonts',
]) {
  cpSync(join(from, path), join(to, basename(path)), {
    recursive: true,
  })
}
