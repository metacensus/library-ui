// Renders the package as an Astro page would at build time: on the server, with
// no client directive and no browser. Runs against the built `dist`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'

// A browser global read while rendering throws.
for (const name of [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'matchMedia',
]) {
  Object.defineProperty(globalThis, name, {
    get() {
      throw new Error(`${name} read during render`)
    },
  })
}

const ui = await import('../dist/index.js')
const read = (path) => readFileSync(join(import.meta.dirname, path), 'utf8')

const nav = h(ui.Nav, {
  links: [
    { href: '/a', label: 'A', current: true },
    { href: '/b', label: 'B' },
  ],
})

test('marks and chrome render to static HTML with no script', () => {
  const html = renderToString(
    h(
      'div',
      null,
      h(ui.Header, { nav, actions: h(ui.Button, { href: '/go' }, 'Go') }),
      h(ui.MetaCensusMark),
      h(ui.MetaCensusLockup, { variant: 'gradient' }),
      h(ui.MetaCensusArrow),
      h(ui.LogoArrowMorph, { progress: 0.5 }),
      h(ui.Footer, { tagline: 'Tag' }, h('a', { href: '/c' }, 'C')),
    ),
  )
  assert.doesNotMatch(html, /<script|<text/)
  assert.match(html, /<header[^>]*>.*<nav[^>]*aria-label="Main"/s)
  assert.match(html, /aria-current="page"/)
  assert.match(html, /<footer/)
})

test('the nav disclosure is a checkbox its label controls', () => {
  const html = renderToString(nav)
  const id = /<input id="([^"]+)" type="checkbox"/.exec(html)?.[1]
  assert.ok(id)
  assert.ok(html.includes(`for="${id}"`))
})

test('the tools render on the server', () => {
  const html = renderToString(
    h(
      'form',
      null,
      h(
        ui.Field,
        { error: 'Required' },
        h(ui.Label, null, 'Name'),
        h(ui.Input),
      ),
      h(ui.Textarea),
      h(ui.Select, null, h('option', null, 'One')),
      h(ui.Checkbox, { label: 'Agree' }),
      h(ui.RadioGroup, {
        legend: 'Pick',
        name: 'pick',
        options: [{ value: 'a', label: 'A' }],
        defaultValue: 'a',
      }),
      h(ui.Notice, { title: 'Heads up' }, 'Body'),
      h(ui.Chip, { family: 'blue' }, 'Chip'),
      h(ui.Button, { variant: 'secondary' }, 'Save'),
      h(ui.Button, { variant: 'danger' }, 'Delete'),
      h(ui.ThemeToggle),
    ),
  )
  for (const c of [
    'mc-field',
    'mc-control',
    'mc-choice',
    'mc-radio-group',
    'mc-notice',
    'mc-chip-blue',
    'mc-button-secondary',
    'mc-button-danger',
    'mc-theme-toggle',
  ])
    assert.ok(html.includes(c), c)
})

test('a Field wires its label, control and error together', () => {
  const html = renderToString(
    h(ui.Field, { error: 'Bad' }, h(ui.Label, null, 'N'), h(ui.Input)),
  )
  const id = /<input[^>]* id="([^"]+)"/.exec(html)?.[1]
  assert.ok(id)
  assert.ok(html.includes(`for="${id}"`))
  assert.ok(html.includes(`aria-describedby="${id}-error"`))
  assert.ok(html.includes('aria-invalid="true"'))
})

test('the head script puts a stored theme on the root and never throws', () => {
  const classes = new Set()
  const run = (storage) =>
    new Function('localStorage', 'document', ui.themeScript)(storage, {
      documentElement: { classList: { add: (c) => classes.add(c) } },
    })
  run({ getItem: () => 'dark' })
  assert.deepEqual([...classes], ['dark'])
  classes.clear()
  run({ getItem: () => 'nonsense' })
  run({
    getItem: () => {
      throw new Error('blocked')
    },
  })
  assert.equal(classes.size, 0)
})

test('the morph is the mark at 0 and the arrow at 1', () => {
  const { BARS, ARROW, barAt } = ui
  assert.deepEqual(barAt(2, 0), BARS[2])
  assert.deepEqual(barAt(2, 1), ARROW.shaft)
  assert.deepEqual(barAt(1, 1), ARROW.headUp)
  assert.deepEqual(barAt(4, 1), ARROW.headDown)
})

test('the geometry matches the reserved marks', () => {
  const mark = [
    ...read('../marks/mark.svg').matchAll(
      /d="[Mm]\s*([\d.]+),([\d.]+)[^"]*?\bh\s*([\d.]+)/g,
    ),
  ]
  assert.equal(mark.length, ui.BAR_RECTS.length)
  mark.forEach(([, x, y, w], i) => {
    const bar = ui.BAR_RECTS[i]
    assert.ok(Math.abs(bar.x - x) < 0.01)
    assert.ok(Math.abs(bar.y + ui.CAP_RADIUS - y) < 0.01)
    assert.ok(Math.abs(bar.w - (Number(w) + ui.STROKE_WIDTH)) < 0.01)
  })
  const lines = [
    ...read('../marks/arrow.svg').matchAll(
      /<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g,
    ),
  ]
  assert.equal(lines.length, ui.ARROW_SEGMENTS.length)
  lines.forEach((line, i) => {
    const s = ui.ARROW_SEGMENTS[i]
    const want = [s.x1, s.y1, s.x2, s.y2]
    line.slice(1).forEach((v, j) => assert.ok(Math.abs(v - want[j]) < 0.01))
  })
})

test('the lockup draws the reserved outlines', () => {
  const html = renderToString(h(ui.MetaCensusLockup))
  const file = read('../marks/wordmark-lockup.svg')
  const ds = [...file.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
  assert.equal(ds.length, 16)
  for (const d of ds) assert.ok(html.includes(`d="${d}"`))
})

test('styles.css prefixes every class and scopes nothing to a site', () => {
  const css = read('../src/css/styles.css')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{[^{}]*\}/g, '{}')
  const classes = css.match(/\.[a-z][\w-]*/g) ?? []
  assert.ok(classes.length > 0)
  for (const c of classes) assert.match(c, /^\.mc-/)
  assert.doesNotMatch(css, /marketing-site/)
})

test('a primary Button fills Purple and a danger Button Garnet', () => {
  const tokens = read('../src/css/tokens.css')
  const styles = read('../src/css/styles.css')
  // Follows `var(--x)` chains to a hex colour; both roles are constant in
  // both colour schemes, so a single value resolves each.
  const resolve = (value) => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value)
    if (!ref) return value
    return resolve(new RegExp(`${ref[1]}:\\s*([^;]+?);`).exec(tokens)[1])
  }
  const background = (variant) => {
    const rule = new RegExp(`\\.mc-button-${variant} \\{([^}]*)\\}`).exec(
      styles,
    )
    return resolve(/background:\s*([^;]+);/.exec(rule[1])[1]).toUpperCase()
  }
  const html = renderToString(
    h(
      'div',
      null,
      h(ui.Button, null, 'P'),
      h(ui.Button, { variant: 'danger' }, 'D'),
    ),
  )
  assert.ok(html.includes('mc-button-primary'))
  assert.ok(html.includes('mc-button-danger'))
  assert.equal(background('primary'), '#3B0E75')
  assert.equal(background('danger'), '#91042A')
})

test('every role in tokens.css has a Tailwind colour in theme.css', () => {
  const roles = [
    ...read('../src/css/tokens.css')
      .split('/* Roles. */')[1]
      .split('/* Gradients')[0]
      .matchAll(/^ {2}--mc-([\w-]+):/gm),
  ].map((m) => m[1])
  const theme = read('../src/css/theme.css')
  assert.ok(roles.length > 0)
  for (const role of roles) {
    assert.ok(
      theme.includes(`--color-mc-${role}: var(--mc-${role});`),
      `theme.css maps no colour for --mc-${role}`,
    )
  }
})

const tokens = read('../src/css/tokens.css')
const styles = read('../src/css/styles.css')
const resolve = (value) => {
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  if (!ref) return value
  return resolve(new RegExp(`${ref[1]}:\\s*([^;]+?);`).exec(tokens)[1])
}
const luminance = (short) => {
  const hex =
    short.length === 4
      ? `#${[...short.slice(1)].map((c) => c + c).join('')}`
      : short
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('buttons read the on-fill ink, which holds 4.5:1 on every fill it covers', () => {
  const ink = resolve('var(--mc-ink-on-fill)')
  for (const variant of ['primary', 'danger']) {
    const rule = new RegExp(`\\.mc-button-${variant} \\{([^}]*)\\}`).exec(
      styles,
    )[1]
    assert.equal(/color:\s*([^;]+);/.exec(rule)[1], 'var(--mc-ink-on-fill)')
  }
  for (const fill of ['fill-solid', 'action', 'action-risk']) {
    assert.ok(contrast(ink, resolve(`var(--mc-${fill})`)) >= 4.5, fill)
  }
})

test('a control outline reads the input-border role, 3:1 on the card in light and dark', () => {
  const rule = /\.mc-control \{([^}]*)\}/.exec(styles)[1]
  assert.equal(
    /border:\s*1px solid ([^;]+);/.exec(rule)[1],
    'var(--mc-line-input)',
  )
  const line = resolve('var(--mc-line-input)')
  const night = resolve('var(--mc-night)')
  const bold = resolve('var(--mc-grey-bold)')
  const mix = (i) =>
    parseInt(bold.slice(i, i + 2), 16) * 0.25 +
    parseInt(night.slice(i, i + 2), 16) * 0.75
  const darkCard = `#${[1, 3, 5].map((i) => Math.round(mix(i)).toString(16).padStart(2, '0')).join('')}`
  assert.ok(contrast(line, resolve('var(--mc-white)')) >= 3, 'light')
  assert.ok(contrast(line, darkCard) >= 3, 'dark')
})
