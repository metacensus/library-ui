// Serves the harness bundle, browser/ as is, and the built dist/pdf-assets/ at
// /pdf-assets/, every response under the CSP callers set. Files answer byte
// ranges, as a caller's file store does.
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import process from 'node:process'
import { build } from 'esbuild'

const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
}

const { outputFiles } = await build({
  entryPoints: [join(import.meta.dirname, 'harness.ts')],
  bundle: true,
  splitting: true,
  format: 'esm',
  outdir: '/',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'error',
})
const bundle = new Map(outputFiles.map((file) => [file.path, file.contents]))

const fileFor = (path) =>
  path.startsWith('/pdf-assets/')
    ? join(import.meta.dirname, '../dist', path)
    : join(import.meta.dirname, path)

createServer((req, res) => {
  const path = normalize(
    req.url.replace(/\?.*/, '').replace(/\/$/, '/index.html'),
  )
  res.setHeader(
    'Content-Security-Policy',
    "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'",
  )
  res.setHeader(
    'Content-Type',
    types[extname(path)] ?? 'application/octet-stream',
  )
  if (bundle.has(path)) return res.end(bundle.get(path))
  const file = fileFor(path)
  let size
  try {
    const stats = statSync(file)
    if (!stats.isFile()) throw new Error(`${path} is not a file`)
    size = stats.size
  } catch {
    res.statusCode = 404
    return res.end()
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '')
  const start = range ? Number(range[1]) : 0
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  if (range) {
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Length', end - start + 1)
  createReadStream(file, { start, end }).pipe(res)
}).listen(Number(process.argv[2]), 'localhost')
