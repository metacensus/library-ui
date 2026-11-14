import type { DetailsHTMLAttributes } from 'react'
import { formatCitationText, type Citation } from './cite.js'
import { Button } from './Button.js'
import { cn } from './cn.js'

type CiteThisPageProps = Omit<
  DetailsHTMLAttributes<HTMLDetailsElement>,
  'children'
> & {
  citation: Citation
  /** Where the page serves its RIS file, from `formatRis`. */
  risHref: string
  /** Where the page serves its BibTeX file, from `formatBibtex`. */
  bibHref: string
}

/** A `Cite this page` disclosure: the citation as text and a download link to
 *  each file. It formats what the page gives it and renders nothing without a
 *  url. It needs no JS. */
export function CiteThisPage({
  citation,
  risHref,
  bibHref,
  className,
  ...props
}: CiteThisPageProps) {
  if (!citation.url) return null
  return (
    <details className={cn('mc-cite', className)} {...props}>
      <summary className="mc-cite-summary">Cite this page</summary>
      <p className="mc-cite-text">{formatCitationText(citation)}</p>
      <p className="mc-cite-downloads">
        <Button variant="secondary" href={risHref} download>
          Download RIS
        </Button>
        <Button variant="secondary" href={bibHref} download>
          Download BibTeX
        </Button>
      </p>
    </details>
  )
}
