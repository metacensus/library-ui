// Renders the package as an Astro page would at build time: on the server, with
// no client directive and no browser. Runs against the built `dist`.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
      h(ui.Button, { variant: 'inverse' }, 'Join'),
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
    'mc-button-inverse',
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

test('styles.css is one `@layer mc` block', () => {
  const css = read('../src/css/styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
  // Every top-level statement, cut at depth 0: a rule outside the layer
  // would beat any layered utility whatever its specificity.
  const top = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) {
      top.push(css.slice(start, i + 1).trim())
      start = i + 1
    }
  }
  assert.equal(depth, 0)
  assert.equal(css.slice(start).trim(), '')
  assert.equal(top.length, 1)
  assert.match(top[0], /^@layer mc \{/)
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

test('the tailwind3 preset builds bg-mc-card with and without a modifier', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mc-tw3-'))
  writeFileSync(join(dir, 'in.html'), '<i class="bg-mc-card bg-mc-card/50">')
  writeFileSync(join(dir, 'in.css'), '@tailwind utilities;')
  writeFileSync(
    join(dir, 'tailwind.config.cjs'),
    `module.exports = {
  presets: [require('${join(import.meta.dirname, '../src/css/tailwind3.cjs')}')],
  content: ['${join(dir, 'in.html')}'],
}`,
  )
  const css = execFileSync(
    join(import.meta.dirname, '../node_modules/.bin/tailwindcss'),
    ['-c', join(dir, 'tailwind.config.cjs'), '-i', join(dir, 'in.css')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  assert.ok(css.includes('background-color: var(--mc-card)'))
  assert.ok(css.includes('color-mix(in srgb, var(--mc-card) 50%, transparent)'))
})

test('styles.css wraps the Header and keeps control labels on one line', () => {
  const declares = (selector, declaration) =>
    new RegExp(`\\n  \\.${selector} \\{[^}]*${declaration}`).test(styles)
  assert.ok(declares('mc-header', 'flex-wrap: wrap'))
  assert.ok(declares('mc-header-actions', 'flex-wrap: wrap'))
  assert.ok(declares('mc-button', 'white-space: nowrap'))
  assert.ok(declares('mc-theme-toggle', 'white-space: nowrap'))
})

test('every role in tokens.css has a Tailwind colour in theme.css and the tailwind3 preset', () => {
  const roles = [
    ...read('../src/css/tokens.css')
      .split('/* Roles. */')[1]
      .split('/* Gradients')[0]
      .matchAll(/^ {2}--mc-([\w-]+):/gm),
  ].map((m) => m[1])
  const theme = read('../src/css/theme.css')
  const mc = createRequire(import.meta.url)('../src/css/tailwind3.cjs').theme
    .extend.colors.mc
  assert.ok(roles.length > 0)
  assert.deepEqual(Object.keys(mc).sort(), [...roles].sort())
  for (const role of roles) {
    assert.ok(
      theme.includes(`--color-mc-${role}: var(--mc-${role});`),
      `theme.css maps no colour for --mc-${role}`,
    )
  }
})

const tokens = read('../src/css/tokens.css')
const styles = read('../src/css/styles.css')
const split = (args) => {
  const parts = []
  let depth = 0
  let from = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '(') depth++
    if (args[i] === ')') depth--
    if (args[i] === ',' && depth === 0) {
      parts.push(args.slice(from, i).trim())
      from = i + 1
    }
  }
  return [...parts, args.slice(from).trim()]
}
const resolve = (value, dark = false) => {
  const v = value.trim()
  const ref = /^var\((--[\w-]+)\)$/.exec(v)
  if (ref) {
    const def = new RegExp(`${ref[1]}:\\s*([^;]+?);`).exec(tokens)[1]
    return resolve(def, dark)
  }
  const fn = /^([\w-]+)\(([\s\S]*)\)$/.exec(v)
  if (!fn) return v
  const args = split(fn[2])
  if (fn[1] === 'light-dark') return resolve(args[dark ? 1 : 0], dark)
  if (fn[1] === 'color-mix') {
    const [x, px] = args[1].split(/\s+(?=[\d.]+%$)/)
    const colours = [resolve(x, dark), resolve(args[2].split(/\s+/)[0], dark)]
    const w = parseFloat(px) / 100
    const channel = (i) =>
      Math.round(
        parseInt(colours[0].slice(i, i + 2), 16) * w +
          parseInt(colours[1].slice(i, i + 2), 16) * (1 - w),
      )
        .toString(16)
        .padStart(2, '0')
    return `#${channel(1)}${channel(3)}${channel(5)}`
  }
  throw new Error(`cannot resolve ${v}`)
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

test('a control borders with --mc-line-input, 3:1 on --mc-card in light and dark', () => {
  const rule = /\.mc-control \{([^}]*)\}/.exec(styles)[1]
  assert.equal(
    /border:\s*1px solid ([^;]+);/.exec(rule)[1],
    'var(--mc-line-input)',
  )
  for (const dark of [false, true]) {
    const line = resolve('var(--mc-line-input)', dark)
    const card = resolve('var(--mc-card)', dark)
    assert.ok(contrast(line, card) >= 3, dark ? 'dark' : 'light')
  }
})

test('the series role holds 3:1 on the card in light and dark', () => {
  for (const dark of [false, true]) {
    const series = resolve('var(--mc-series)', dark)
    const card = resolve('var(--mc-card)', dark)
    assert.ok(contrast(series, card) >= 3, dark ? 'dark' : 'light')
  }
})

test('an inverse Button is white on Purple ink, 3:1 on Purple and night, label 4.5:1', () => {
  const rule = /\.mc-button-inverse \{([^}]*)\}/.exec(styles)[1]
  const fill = resolve(/background:\s*([^;]+);/.exec(rule)[1])
  const label = resolve(/color:\s*([^;]+);/.exec(rule)[1])
  const hover = resolve(
    /\.mc-button-inverse:hover:not\(:disabled\) \{[^}]*background:\s*([^;]+);/.exec(
      styles,
    )[1],
  )
  assert.equal(fill.toUpperCase(), '#FFF')
  assert.equal(label, resolve('var(--mc-purple-bold)'))
  assert.equal(hover, resolve('var(--mc-purple-tint)'))
  const ring = resolve(
    /\.mc-button-inverse:focus-visible \{[^}]*outline-color:\s*([^;]+);/.exec(
      styles,
    )[1],
  )
  // The hero gradient runs Purple bold to Purple mid: both stops hold 3:1.
  for (const ground of ['fill-solid', 'night', 'purple-mid']) {
    const g = resolve(`var(--mc-${ground})`)
    assert.ok(contrast(fill, g) >= 3, ground)
    assert.ok(contrast(ring, g) >= 3, `ring on ${ground}`)
  }
  assert.ok(contrast(label, fill) >= 4.5, 'label on white')
  assert.ok(contrast(label, hover) >= 4.5, 'label on hover')
})
