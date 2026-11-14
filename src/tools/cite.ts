/** What a page says about itself. `authors` are written as the citation should
 *  print them, as `Family, Given`; `date` is ISO, `2026`, `2026-11` or
 *  `2026-11-10`. The page owns the url and its permanence. */
export type Citation = {
  title: string
  authors: string[]
  date: string
  publisher: string
  url: string
}

const DATE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/

/** One line of text: a newline in a value would end its RIS field. */
const flat = (value: string) => value.replace(/\s+/g, ' ').trim()

const ris = (tag: string, value: string) =>
  value ? [`${tag}  - ${flat(value)}`] : []

/** The citation as RIS: type `ELEC`, one `AU` per author, ending `ER  - `. */
export function formatRis(c: Citation): string {
  const [, year, month, day] = DATE.exec(c.date) ?? []
  const date = [year, month, day].filter(Boolean).join('/')
  return [
    'TY  - ELEC',
    ...ris('TI', c.title),
    ...c.authors.flatMap((a) => ris('AU', a)),
    ...ris('PY', year ?? ''),
    ...ris('DA', date),
    ...ris('PB', c.publisher),
    ...ris('UR', c.url),
    'ER  - ',
  ].join('\n')
}

const TEX: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '%': '\\%',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
}
const tex = (value: string) =>
  flat(value).replace(/[\\{}%&#_]/g, (c) => TEX[c]!)

/** The key: the first author's family name and the year, as `doe2026`. */
function bibKey(c: Citation, year: string | undefined) {
  const family = (c.authors[0] ?? '').split(',')[0]!.split(' ').pop()!
  return (
    (family + (year ?? '')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'cite'
  )
}

/** The citation as one BibTeX `@misc` entry. */
export function formatBibtex(c: Citation): string {
  const [, year, month] = DATE.exec(c.date) ?? []
  const fields: [string, string][] = [
    ['title', tex(c.title)],
    ['author', c.authors.map(tex).join(' and ')],
    ['year', year ?? ''],
    ['month', month ? String(Number(month)) : ''],
    ['publisher', tex(c.publisher)],
    ['url', tex(c.url)],
    ['howpublished', c.url ? `\\url{${tex(c.url)}}` : ''],
  ]
  const body = fields
    .filter(([, value]) => value)
    .map(([name, value]) => `  ${name} = {${value}}`)
    .join(',\n')
  return `@misc{${bibKey(c, year)},\n${body}\n}\n`
}

/** Authors as a sentence: `A`, `A and B`, `A, B, and C`. */
const names = (authors: string[]) =>
  authors.length < 3
    ? authors.join(' and ')
    : `${authors.slice(0, -1).join(', ')}, and ${authors.at(-1)}`

/** The citation as the sentence a page shows: authors (date). Title.
 *  Publisher. url */
export function formatCitationText(c: Citation): string {
  const who = names(c.authors.map(flat).filter(Boolean))
  const when = flat(c.date)
  const lead = [who, when && `(${when})`].filter(Boolean).join(' ')
  const sentence = (part: string) => (part.endsWith('.') ? part : `${part}.`)
  return [lead, c.title, c.publisher]
    .map(flat)
    .filter(Boolean)
    .map(sentence)
    .concat(flat(c.url))
    .filter(Boolean)
    .join(' ')
}
