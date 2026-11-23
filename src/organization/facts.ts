import { cofounders, contributors } from './stewards.js'

export interface Organization {
  name: string
  /** No trailing slash. */
  url: string
  logo: string
  email: string
  copyrightYears: string
  /** The cofounders, then the contributors; the advisory board is not credited. */
  people: readonly { name: string; role: string; kind: 'founder' | 'member' }[]
}

export const organization: Organization = {
  name: 'MetaCensus',
  url: 'https://www.metacensus.org',
  logo: 'https://raw.githubusercontent.com/metacensus/library-ui/main/marks/mark.svg',
  email: 'brand@metacensus.io',
  copyrightYears: '2023–2026',
  people: [
    ...cofounders.map(({ name, role }) => ({
      name,
      role,
      kind: 'founder' as const,
    })),
    ...contributors.map(({ name, role }) => ({
      name,
      role,
      kind: 'member' as const,
    })),
  ],
}
