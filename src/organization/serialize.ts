import { organization as org } from './facts.js'

function person(kind: 'founder' | 'member') {
  const people = org.people.filter((p) => p.kind === kind)
  return people.length > 0
    ? {
        [kind]: people.map(({ name, role }) => ({
          '@type': 'Person',
          name,
          jobTitle: role,
        })),
      }
    : {}
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    url: org.url,
    logo: org.logo,
    email: org.email,
    ...person('founder'),
    ...person('member'),
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
