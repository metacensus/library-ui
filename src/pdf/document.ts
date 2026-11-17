import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFWorker,
} from 'pdfjs-dist'
import { assets } from './assets.js'
import type { PdfError, PdfSource } from './index.js'

/** One hold on a shared document. Release it once. */
export type Lease = {
  /** Rejects with a `PdfError`. */
  document: Promise<PDFDocumentProxy>
  release: () => void
}

export function open(source: PdfSource): Lease {
  const held = sha256(source).then((key) => {
    const entry = documents.get(key) ?? load(key, source)
    entry.holds++
    return entry
  })
  return {
    document: held.then((entry) => entry.document),
    release: () => void held.then(release, () => {}),
  }
}

type Entry = {
  key: string
  holds: number
  task: Promise<PDFDocumentLoadingTask>
  document: Promise<PDFDocumentProxy>
}

const documents = new Map<string, Entry>()

function load(key: string, source: PdfSource): Entry {
  const task = start(source, () => close(entry))
  const entry: Entry = {
    key,
    holds: 0,
    task,
    document: task
      .then((task) => task.promise)
      .catch((error) => {
        close(entry)
        throw typed(error)
      }),
  }
  documents.set(key, entry)
  return entry
}

// A release and a re-open within one tick, as a re-render makes, keep it open.
function release(entry: Entry) {
  entry.holds--
  setTimeout(() => {
    if (!entry.holds) close(entry)
  })
}

function close(entry: Entry) {
  if (documents.get(entry.key) === entry) documents.delete(entry.key)
  void entry.task.then(
    (task) => task.destroy(),
    () => {},
  )
}

type Pdfjs = typeof import('pdfjs-dist')

async function start(
  source: PdfSource,
  lost: () => void,
): Promise<PDFDocumentLoadingTask> {
  if (!assets) throw failure('assets', 'configurePdf was not called')
  const pdfjs = await import('pdfjs-dist')
  const file =
    'data' in source
      ? { data: source.data.slice() }
      : await fromUrl(pdfjs, source, lost)
  return pdfjs.getDocument({
    ...file,
    worker: await shared(pdfjs),
    cMapUrl: `${assets}cmaps/`,
    iccUrl: `${assets}iccs/`,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    enableXfa: false,
    maxImageSize: 2 ** 26,
    disableAutoFetch: true,
    disableStream: true,
  })
}

let worker: Promise<PDFWorker> | undefined

function shared(pdfjs: Pdfjs): Promise<PDFWorker> {
  worker ??= (async () => {
    pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`
    const made = new pdfjs.PDFWorker()
    try {
      await made.promise
      return made
    } catch (error) {
      worker = undefined
      throw failure('assets', (error as Error).message)
    }
  })()
  return worker
}

type UrlSource = Extract<PdfSource, { url: string }>

const chunk = 65536

async function fromUrl(pdfjs: Pdfjs, source: UrlSource, lost: () => void) {
  const first = await get(source, `bytes=0-${chunk - 1}`)
  const length =
    first.status === 206 &&
    Number(first.headers.get('Content-Range')?.split('/')[1])
  if (!length) {
    const whole = first.status === 206 ? await get(source) : first
    return { data: new Uint8Array(await whole.arrayBuffer()) }
  }
  const range = new pdfjs.PDFDataRangeTransport(
    length,
    new Uint8Array(await first.arrayBuffer()),
  )
  const aborted = new AbortController()
  range.abort = () => aborted.abort()
  range.requestDataRange = (begin, end) =>
    get(source, `bytes=${begin}-${end - 1}`, aborted.signal)
      .then((response) => response.arrayBuffer())
      .then((bytes) => range.onDataRange(begin, new Uint8Array(bytes)), lost)
  return { range }
}

async function get(
  source: UrlSource,
  range?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const request = async () => {
    const headers = new Headers(await source.headers?.())
    if (range) headers.set('Range', range)
    return fetch(source.url, { headers, signal }).catch((error: Error) => {
      throw failure('fetch', error.message)
    })
  }
  let response = await request()
  if (response.status === 401) response = await request()
  if (!response.ok)
    throw failure('fetch', `HTTP ${response.status}`, response.status)
  return response
}

// A re-render that passes the same bytes finds its hash within the tick.
const hashes = new WeakMap<Uint8Array, Promise<string>>()

async function sha256(source: PdfSource): Promise<string> {
  if ('url' in source) return source.sha256
  if (source.sha256) return source.sha256
  let hash = hashes.get(source.data)
  if (!hash) {
    hash = crypto.subtle
      .digest('SHA-256', source.data as Uint8Array<ArrayBuffer>)
      .then((digest) =>
        [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      )
    hashes.set(source.data, hash)
  }
  return hash
}

const failure = (
  kind: PdfError['kind'],
  message: string,
  status?: number,
): PdfError => Object.assign(new Error(message), { kind, status })

function typed(error: unknown): PdfError {
  if (error instanceof Error && 'kind' in error) return error as PdfError
  const { name, message } = error as Error
  return failure(name === 'PasswordException' ? 'password' : 'invalid', message)
}
