import { organization, type Organization } from './facts.js'

/** The organization's schema.org JSON-LD. */
export function organizationJsonLd(org: Organization = organization) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: org.url,
    logo: org.logo,
    email: org.email,
    employee: org.people.map(({ name, role }) => ({
      '@type': 'Person',
      name,
      jobTitle: role,
    })),
  }
}

/** The organization's `humans.txt`, ending in a newline. */
export function humansTxt(org: Organization = organization) {
  return [
    '/* TEAM */',
    ...org.people.map(({ name, role }) => `${role}: ${name}`),
    '',
    '/* SITE */',
    `Organization: ${org.name}`,
    `URL: ${org.url}`,
    `Contact: ${org.email}`,
    '',
  ].join('\n')
}
