import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../tools/cn.js'
import { CODE_PATH } from './AudienceIcon.js'

/** Which kind of work someone contributes; `both` merges the two chips. */
export type ContributorFlavor = 'engineering' | 'quantitative' | 'both'

const FLAVORS = {
  engineering: {
    label: 'Engineering',
    glyph: (
      <svg
        viewBox="0 0 24 24"
        className="mc-flavor-glyph"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={CODE_PATH} />
      </svg>
    ),
  },
  quantitative: {
    label: 'Quantitative science',
    // σ²: variance, not summation. Text, so it takes the page's face.
    glyph: <span className="mc-flavor-sigma">σ²</span>,
  },
} as const

function FlavorChip({ flavor }: { flavor: ContributorFlavor }) {
  if (flavor === 'both') {
    const { engineering, quantitative } = FLAVORS
    return (
      <span
        role="img"
        aria-label={`${engineering.label} and ${quantitative.label}`}
        className="mc-flavor-pair"
      >
        <span className="mc-flavor mc-flavor-engineering">
          {engineering.glyph}
        </span>
        <span className="mc-flavor mc-flavor-quantitative">
          {quantitative.glyph}
        </span>
      </span>
    )
  }
  const { label, glyph } = FLAVORS[flavor]
  return (
    <span
      role="img"
      aria-label={label}
      className={cn('mc-flavor', `mc-flavor-${flavor}`)}
    >
      {glyph}
    </span>
  )
}

/** What each flavor chip means, shown once where a roster is introduced. */
export function ContributorFlavorKey({ className }: { className?: string }) {
  const entries: [ContributorFlavor, string][] = [
    ['engineering', FLAVORS.engineering.label],
    ['quantitative', FLAVORS.quantitative.label],
    ['both', 'Both'],
  ]
  return (
    <ul
      aria-label="Contributor flavors"
      className={cn('mc-flavor-key', className)}
    >
      {entries.map(([flavor, word]) => (
        <li key={flavor}>
          <span aria-hidden>
            <FlavorChip flavor={flavor} />
          </span>
          {word}
        </li>
      ))}
    </ul>
  )
}

type ContributorCardProps = {
  name: string
  href?: string
  image?: string
  role?: string
  /** `role` is a MetaCensus title, set in the accent. */
  metacensusTitle?: boolean
  flavor?: ContributorFlavor
  /** The heading level of the name. */
  level: 1 | 2 | 3 | 4 | 5 | 6
  /** The bio, clamped to the card and shown whole while it is hovered or
   *  focused. */
  children?: ReactNode
}

type Rect = { top: number; left: number; width: number }

/** The floated copy repeats the resting card, which keeps focus and the
 *  accessible content: hide the copy from assistive tech and the tab order,
 *  and keep its bottom on screen. */
const settle = (copy: HTMLDivElement | null) => {
  if (!copy) return
  copy
    .querySelectorAll<HTMLElement>('a, button, [tabindex]')
    .forEach((el) => (el.tabIndex = -1))
  const over = copy.getBoundingClientRect().bottom - window.innerHeight
  if (over > 0)
    copy.style.top = `${Math.max(0, parseFloat(copy.style.top) - over)}px`
}

/** A person who contributes: photo or initials, name, role, flavor and bio,
 *  in a fixed 18rem by 12rem footprint. Hovered or focused, the card floats
 *  over the page at full height until both end or Escape is pressed, so it
 *  needs a `client:` directive to grow. */
export function ContributorCard({
  name,
  href,
  image,
  role,
  metacensusTitle,
  flavor,
  level,
  children,
}: ContributorCardProps) {
  const Name = `h${level}` as const
  const shellRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // Escape holds the card down until a new focus, or until hover and focus
  // have both ended: removing the copy can fire a fresh mouseenter.
  const [dismissed, setDismissed] = useState(false)
  if (dismissed && !hovered && !focused) setDismissed(false)
  const floating = rect !== null && (hovered || focused) && !dismissed

  const measure = () => {
    const r = shellRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.top, left: r.left, width: r.width })
  }

  // Keep the floating card on its shell while the page scrolls.
  useEffect(() => {
    if (!floating) return
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [floating])

  // From mount, so an Escape that follows the hover at once is not lost.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const card = (style?: CSSProperties) => (
    <div
      ref={style && ((copy) => settle(copy))}
      aria-hidden={style && true}
      className={cn(
        'mc-contributor',
        style ? 'mc-contributor-floating' : 'mc-contributor-resting',
        children != null && 'mc-contributor-with-bio',
      )}
      style={style}
    >
      {flavor && (
        <span className="mc-contributor-flavor">
          <FlavorChip flavor={flavor} />
        </span>
      )}
      <div className="mc-contributor-head">
        {image ? (
          <img
            src={image}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            className="mc-contributor-photo"
          />
        ) : (
          <div
            className="mc-contributor-photo mc-contributor-initials"
            aria-hidden
          >
            {name
              .split(' ')
              .slice(0, 2)
              .map((word) => word[0] ?? '')
              .join('')}
          </div>
        )}
        <div
          className={cn(
            'mc-contributor-names',
            flavor && `mc-contributor-names-${flavor === 'both' ? 2 : 1}`,
          )}
        >
          <Name className="mc-contributor-name">
            {href ? <a href={href}>{name}</a> : name}
          </Name>
          {role && (
            <p
              className={cn(
                'mc-contributor-role',
                metacensusTitle && 'mc-contributor-title',
              )}
            >
              {role}
            </p>
          )}
        </div>
      </div>
      {children != null && <div className="mc-contributor-bio">{children}</div>}
    </div>
  )

  return (
    <div
      ref={shellRef}
      className="mc-contributor-shell"
      onMouseEnter={() => {
        measure()
        setHovered(true)
      }}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => {
        measure()
        setFocused(true)
        setDismissed(false)
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false)
      }}
    >
      {card()}
      {/* A transformed ancestor, such as a marquee, would hold a fixed card
          inside it; the portal sets it against the viewport. */}
      {floating && createPortal(card({ ...rect, zIndex: 50 }), document.body)}
    </div>
  )
}
