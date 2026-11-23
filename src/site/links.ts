export interface SiteLink {
  label: string
  href: string
}

export const LOGIN_PATH = '/log-in'
export const JOIN_PATH = '/partner/'

/** The legal pages' section, which has its own sub-navigation. */
export const LEGAL_PATH = '/legal/'

const BLOG_LINK: SiteLink = { label: 'Blog', href: '/blog/' }

/** The Header's links, centred in the main bar on every page. */
export const HEADER_LINKS: readonly SiteLink[] = [
  { label: 'Why', href: '/' },
  { label: 'Research', href: 'https://research.metacensus.org/' },
  BLOG_LINK,
]

/** The front page's argument in four beats, for its section bar. */
export const SECTION_LINKS: readonly SiteLink[] = [
  { label: 'The problem', href: '/#problem' },
  { label: 'The cost', href: '/#cost' },
  { label: 'The solution', href: '/#solution' },
  { label: 'The people', href: '/#stewards' },
]

export const FOOTER_COLUMNS: readonly {
  label: string
  links: readonly SiteLink[]
}[] = [
  {
    label: 'Sections',
    links: [
      ...SECTION_LINKS,
      BLOG_LINK,
      { label: 'The full team', href: '/stewards/' },
    ],
  },
  {
    label: 'Join us',
    links: [
      { label: 'Join us', href: JOIN_PATH },
      {
        label: 'Request early access',
        href: '/partner/?interest=early-access',
      },
      { label: 'Careers', href: '/careers/' },
      { label: 'Log in', href: LOGIN_PATH },
    ],
  },
  {
    label: 'Open source',
    links: [{ label: 'GitHub', href: 'https://github.com/metacensus' }],
  },
  { label: 'About this site', links: [{ label: 'Legal', href: LEGAL_PATH }] },
]
