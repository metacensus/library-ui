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
  level: number
  /** The bio, clamped to the card and shown whole while it is hovered or
   *  focused. */
  children?: ReactNode
}

type Rect = { top: number; left: number; width: number }

/** A person who contributes: photo or initials, name, role, flavor and bio,
 *  in a fixed 18rem by 12rem footprint. Hovered or focused, the card floats
 *  over the page at full height, so it needs a `client:` directive to grow. */
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
  const Name = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  const shellRef = useRef<HTMLDivElement>(null)
  const [floatRect, setFloatRect] = useState<Rect | null>(null)
  const floating = floatRect !== null

  const measure = () => {
    const rect = shellRef.current?.getBoundingClientRect()
    if (rect)
      setFloatRect({ top: rect.top, left: rect.left, width: rect.width })
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

  const card = (style?: CSSProperties) => (
    <div
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
            alt={name}
            width={48}
            height={48}
            loading="lazy"
            className="mc-contributor-photo"
          />
        ) : (
          <div className="mc-contributor-photo mc-contributor-initials">
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
      onMouseEnter={measure}
      onMouseLeave={() => setFloatRect(null)}
      onFocusCapture={measure}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFloatRect(null)
      }}
    >
      {card()}
      {/* A transformed ancestor, such as a marquee, would hold a fixed card
          inside it; the portal sets it against the viewport. */}
      {floatRect &&
        createPortal(card({ ...floatRect, zIndex: 50 }), document.body)}
    </div>
  )
}
