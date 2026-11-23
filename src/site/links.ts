export interface SiteLink {
  label: string
  href: string
}

export const JOIN_PATH = '/partner/'

/** The legal pages' section, which has its own sub-navigation. */
export const LEGAL_PATH = '/legal/'

const BLOG_LINK: SiteLink = { label: 'Blog', href: '/blog/' }

export const HEADER_LINKS: readonly SiteLink[] = [
  { label: 'Why', href: '/' },
  { label: 'Research', href: 'https://research.metacensus.org/' },
  BLOG_LINK,
]

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
    label: 'Explore',
    links: [
      ...SECTION_LINKS,
      BLOG_LINK,
      { label: 'The full team', href: '/stewards/' },
    ],
  },
  {
    label: 'Get involved',
    links: [
      { label: 'Join us', href: JOIN_PATH },
      {
        label: 'Request early access',
        href: '/partner/?interest=early-access',
      },
      { label: 'Careers', href: '/careers/' },
    ],
  },
  {
    label: 'About',
    links: [
      { label: 'GitHub', href: 'https://github.com/metacensus' },
      { label: 'Legal', href: LEGAL_PATH },
    ],
  },
]
