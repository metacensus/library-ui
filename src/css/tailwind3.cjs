// The roles as a Tailwind 3 preset, CommonJS as Tailwind 3 configs are; theme.css serves Tailwind 4.

// A role is not a channel triplet, so `/NN` mixes it with transparent. With no
// modifier Tailwind passes a variable or nothing, and the role stands alone.
const role = (name) => (opts) => {
  const alpha = Number(opts.opacityValue)
  return Number.isNaN(alpha)
    ? `var(--mc-${name})`
    : `color-mix(in srgb, var(--mc-${name}) ${+(alpha * 100).toFixed(2)}%, transparent)`
}

const roles = [
  'ground',
  'card',
  'surface',
  'hairline',
  'ink',
  'ink-secondary',
  'line-input',
  'series',
  'ink-accent',
  'line-accent',
  'fill-solid',
  'fill-emphasis',
  'action',
  'action-risk',
  'ink-on-fill',
  'alert-fill',
  'alert-ink',
  'alert-border',
  'signal',
  'tint-purple-fill',
  'tint-purple-ink',
  'tint-grey-fill',
  'tint-grey-ink',
  'tint-red-fill',
  'tint-red-ink',
  'tint-blue-fill',
  'tint-blue-ink',
]

/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  theme: {
    extend: {
      colors: { mc: Object.fromEntries(roles.map((r) => [r, role(r)])) },
      fontFamily: { sans: 'var(--mc-font-sans)' },
      borderRadius: { mc: 'var(--mc-radius)' },
      boxShadow: { mc: 'var(--mc-shadow)' },
    },
  },
}
