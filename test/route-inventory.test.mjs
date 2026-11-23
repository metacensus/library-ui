import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import routeInventory from '../src/inventory/routes.mjs'

/** Runs the integration's hooks over a built `/` page that links to `hrefs`. */
async function build({ entries, hrefs = [], deniedLinks }) {
  const root = mkdtempSync(join(tmpdir(), 'mc-routes-'))
  mkdirSync(join(root, 'src/inventory'), { recursive: true })
  mkdirSync(join(root, 'dist'))
  writeFileSync(
    join(root, 'src/inventory/routes.json'),
    JSON.stringify(entries),
  )
  const file = join(root, 'dist/index.html')
  writeFileSync(file, hrefs.map((href) => `<a href="${href}">x</a>`).join(''))
  const { hooks } = routeInventory({ deniedLinks })
  hooks['astro:config:done']({
    config: { base: '/', root: pathToFileURL(`${root}/`) },
  })
  await hooks['astro:build:done']({
    dir: pathToFileURL(`${root}/dist/`),
    assets: new Map([['/', [pathToFileURL(file)]]]),
  })
  return readFileSync(join(root, 'ROUTES.md'), 'utf8')
}

const entry = { audience: 'Anyone', purpose: 'Read' }

test('ROUTES.md lists each page with its links', async () => {
  const routes = await build({ entries: { '/': entry }, hrefs: ['/b', '/a'] })
  assert.match(routes, /## `\/`/)
  assert.match(routes, /Links: `\/a`, `\/b`/)
})

test('a route with no entry fails the build', async () => {
  await assert.rejects(build({ entries: {} }), /missing \/;/)
})

test('an entry with no route fails the build', async () => {
  await assert.rejects(
    build({ entries: { '/': entry, '/gone': entry } }),
    /no such route \/gone/,
  )
})

test('a link deniedLinks denies fails the build', async () => {
  await assert.rejects(
    build({
      entries: { '/': entry },
      hrefs: ['/ok', '/no'],
      deniedLinks: (hrefs) => hrefs.filter((href) => href === '/no'),
    }),
    /links \/no/,
  )
})
