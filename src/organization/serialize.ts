import { organization as org } from './facts.js'

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: org.url,
    logo: org.logo,
    email: org.email,
    ...(org.people.length > 0 && {
      employee: org.people.map(({ name, role }) => ({
        '@type': 'Person',
        name,
        jobTitle: role,
      })),
    }),
  }
}

/** The JSON-LD as the body of a `<script>`: `<` is escaped so no value can close it. */
export function organizationJsonLdScript() {
  return JSON.stringify(organizationJsonLd()).replace(/</g, '\\u003c')
}

/** Ends in a newline. */
export function humansTxt() {
  return [
    ...(org.people.length > 0
      ? [
          '/* TEAM */',
          ...org.people.map(({ name, role }) => `${role}: ${name}`),
          '',
        ]
      : []),
    '/* SITE */',
    `Organization: ${org.name}`,
    `URL: ${org.url}`,
    `Contact: ${org.email}`,
    '',
  ].join('\n')
}
