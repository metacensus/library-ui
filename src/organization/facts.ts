export interface Organization {
  name: string
  /** No trailing slash. */
  url: string
  logo: string
  email: string
  /** The footer's copyright years. */
  copyrightYears: string
  people: readonly { name: string; role: string }[]
}

export const organization: Organization = {
  name: 'MetaCensus',
  url: 'https://www.metacensus.org',
  logo: 'https://raw.githubusercontent.com/metacensus/library-ui/main/marks/mark.svg',
  email: 'brand@metacensus.io',
  copyrightYears: '2023–2026',
  people: [],
}
