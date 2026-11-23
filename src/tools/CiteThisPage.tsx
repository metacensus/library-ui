import { formatCitationText, type Citation } from './cite.js'
import { Button } from './Button.js'
import { cn } from './cn.js'
import { Float } from './Float.js'

type CiteThisPageProps = {
  citation: Citation
  /** Where the page serves its RIS file, from `formatRis`. */
  risHref: string
  /** Where the page serves its BibTeX file, from `formatBibtex`. */
  bibHref: string
  className?: string
}

/** A round `Cite this page` button fixed at the viewport's bottom-right
 *  corner. Hover, focus or a tap opens a panel above it with the citation as
 *  text and a download link to each file; Escape, moving away or a tap
 *  elsewhere closes it. It formats what the page gives it and renders nothing
 *  without a url. Render it once per page, from the layout; hydrate it alone. */
export function CiteThisPage({
  citation,
  risHref,
  bibHref,
  className,
}: CiteThisPageProps) {
  if (!citation.url?.trim()) return null
  return (
    <Float
      className={cn('mc-cite', className)}
      label="Cite this page"
      icon={
        /* Lucide's `quote`, under the ISC license in LICENSES/ISC.txt. */
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
          <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
        </svg>
      }
    >
      <p className="mc-cite-text">{formatCitationText(citation)}</p>
      <p className="mc-cite-downloads">
        <Button variant="secondary" href={risHref} download>
          Download RIS
        </Button>
        <Button variant="secondary" href={bibHref} download>
          Download BibTeX
        </Button>
      </p>
    </Float>
  )
}
