import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFWorker,
} from 'pdfjs-dist'
import { assets } from './assets.js'
import type { PdfError, PdfSource } from './index.js'

/** One hold on a shared document. `document` rejects with a `PdfError`. */
type Lease = {
  document: Promise<PDFDocumentProxy>
  sha256: Promise<string>
  release: () => void
}

export function open(source: PdfSource): Lease {
  const held = sha256(source).then((key) => {
    const entry = registry.get(key) ?? load(key, source)
    entry.holds++
    return entry
  })
  let released = false
  return {
    document: held.then((entry) => entry.document),
    sha256: held.then((entry) => entry.key),
    release: () => {
      if (released) return
      released = true
      void held.then(release, () => {})
    },
  }
}

type Entry = {
  key: string
  holds: number
  aborted: AbortController
  task: Promise<PDFDocumentLoadingTask>
  document: Promise<PDFDocumentProxy>
}

const registry = new Map<string, Entry>()

// A destroyed loading task never settles, so a lost range settles the document.
function load(key: string, source: PdfSource): Entry {
  let lose!: (error: PdfError) => void
  const lost = new Promise<never>((_, reject) => (lose = reject))
  const aborted = new AbortController()
  const task = start(source, aborted.signal, (error) => {
    lose(error)
    close(entry)
  })
  const entry: Entry = {
    key,
    holds: 0,
    aborted,
    task,
    document: Promise.race([task.then((task) => task.promise), lost]).catch(
      (error) => {
        close(entry)
        throw typed(error)
      },
    ),
  }
  registry.set(key, entry)
  return entry
}

// A release and a re-open within one tick, as a re-render makes, keep it open.
function release(entry: Entry) {
  entry.holds--
  setTimeout(() => {
    if (!entry.holds) close(entry)
  })
}

// A destroy cancels each range's reader before it aborts the transport, and a
// range answered between them reaches no reader. So ranges abort first.
function close(entry: Entry) {
  if (registry.get(entry.key) === entry) registry.delete(entry.key)
  entry.aborted.abort()
  void entry.task.then(
    (task) => task.destroy(),
    () => {},
  )
}

type Pdfjs = typeof import('pdfjs-dist')

async function start(
  source: PdfSource,
  signal: AbortSignal,
  lost: (error: PdfError) => void,
): Promise<PDFDocumentLoadingTask> {
  if (!assets) throw failure('assets', 'configurePdf was not called')
  const pdfjs = await import('pdfjs-dist')
  const file =
    'data' in source
      ? { data: source.data.slice() }
      : await fromUrl(pdfjs, source, signal, lost)
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
      made.destroy()
      worker = undefined
      throw failure('assets', (error as Error).message)
    }
  })()
  return worker
}

type UrlSource = Extract<PdfSource, { url: string }>

const chunk = 65536

async function fromUrl(
  pdfjs: Pdfjs,
  source: UrlSource,
  signal: AbortSignal,
  lost: (error: PdfError) => void,
) {
  const first = await get(source, `bytes=0-${chunk - 1}`)
  const length = first.status === 206 && Number(first.answer?.split('/')[1])
  if (!length)
    return {
      data: first.status === 206 ? (await get(source)).bytes : first.bytes,
    }
  const range = new pdfjs.PDFDataRangeTransport(length, first.bytes)
  range.requestDataRange = (begin, end) => {
    const asked = `${begin}-${end - 1}`
    get(source, `bytes=${asked}`, signal)
      .then(({ status, answer, bytes }) => {
        if (status !== 206 || !answer?.startsWith(`bytes ${asked}/`))
          throw failure('fetch', `range ${asked} answered ${status} ${answer}`)
        return bytes
      })
      .then((bytes) => range.onDataRange(begin, bytes), lost)
  }
  return { range }
}

async function get(source: UrlSource, range?: string, signal?: AbortSignal) {
  const request = async () => {
    const headers = new Headers(await source.headers?.())
    headers.forEach((_, name) => {
      if (name !== 'authorization')
        throw failure('fetch', `headers() may not set ${name}`)
    })
    if (range) headers.set('Range', range)
    return fetch(source.url, { headers, signal })
  }
  try {
    let response = await request()
    if (response.status === 401) response = await request()
    if (!response.ok)
      throw failure('fetch', `HTTP ${response.status}`, response.status)
    return {
      status: response.status,
      answer: response.headers.get('Content-Range'),
      bytes: new Uint8Array(await response.arrayBuffer()),
    }
  } catch (error) {
    throw 'kind' in Object(error)
      ? error
      : failure('fetch', (error as Error).message)
  }
}

// A re-render that passes the same bytes finds its hash within the tick.
const hashes = new WeakMap<Uint8Array, Promise<string>>()

async function sha256(source: PdfSource): Promise<string> {
  if ('url' in source) return source.sha256
  if (source.sha256) return source.sha256
  if (!globalThis.crypto?.subtle)
    throw failure('assets', 'hashing bytes needs a secure context')
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

export function typed(error: unknown): PdfError {
  if (error instanceof Error && 'kind' in error) return error as PdfError
  const { name, message } = Object(error) as Partial<Error>
  return failure(
    name === 'PasswordException' ? 'password' : 'invalid',
    message ?? String(error),
  )
}
