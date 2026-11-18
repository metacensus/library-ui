import { useState } from 'react'
import { Button } from '../tools/Button.js'
import { Input } from '../tools/form.js'

/** Zoom, as a multiple of fit width. */
const zooms = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export const within = (zoom: number) =>
  Math.min(zooms.at(-1)!, Math.max(zooms[0]!, zoom))

export function Toolbar({
  page,
  pages,
  zoom,
  onPage,
  onZoom,
}: {
  page: number
  pages: number
  zoom: number
  onPage: (page: number) => void
  onZoom: (zoom: number) => void
}) {
  // What the reader types, shown until they enter or leave it.
  const [typed, setTyped] = useState<string>()
  const go = () => {
    const asked = Math.round(Number(typed))
    if (asked) onPage(Math.min(pages, Math.max(1, asked)))
    setTyped(undefined)
  }
  const button = (label: string, text: string, onClick: () => void) => (
    <Button variant="secondary" aria-label={label} onClick={onClick}>
      {text}
    </Button>
  )
  return (
    <div className="mc-pdf-toolbar">
      {button('Previous page', '‹', () => onPage(Math.max(1, page - 1)))}
      {button('Next page', '›', () => onPage(Math.min(pages, page + 1)))}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          go()
        }}
      >
        <Input
          aria-label="Page"
          inputMode="numeric"
          value={typed ?? page}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={go}
        />{' '}
        of {pages}
      </form>
      {button('Zoom out', '−', () =>
        onZoom([...zooms].reverse().find((z) => z < zoom - 0.001) ?? zooms[0]!),
      )}
      <output aria-label="Zoom">{Math.round(zoom * 100)}%</output>
      {button('Zoom in', '+', () =>
        onZoom(zooms.find((z) => z > zoom + 0.001) ?? zooms.at(-1)!),
      )}
      <Button variant="secondary" onClick={() => onZoom(1)}>
        Fit width
      </Button>
    </div>
  )
}
