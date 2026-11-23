export interface Organization {
  name: string
  /** The public site, with no trailing slash. */
  url: string
  /** An absolute URL of the mark. */
  logo: string
  /** Where a reader writes to the organization. */
  email: string
  /** Credited by name and the title they hold at the organization. */
  people: readonly { name: string; role: string }[]
}

export const organization: Organization = {
  name: 'MetaCensus',
  url: 'https://www.metacensus.io',
  logo: 'https://raw.githubusercontent.com/metacensus/library-ui/main/marks/mark.svg',
  email: 'brand@metacensus.io',
  people: [
    { name: 'Ryan Nelson', role: 'Executive Director' },
    { name: 'Jacob Barzee', role: 'Director of Engineering' },
    { name: 'Erik Forsman', role: 'Founding Engineer' },
    { name: 'Michael K.B. Ford', role: 'Applied AI Engineer' },
  ],
}
