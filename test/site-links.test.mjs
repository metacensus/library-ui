import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOOTER_COLUMNS, HEADER_LINKS, LEGAL_PATH } from '../dist/site/links.js'

test('the Header carries Why, Research and Blog', () => {
  assert.deepEqual(
    HEADER_LINKS.map((link) => link.label),
    ['Why', 'Research', 'Blog'],
  )
})

test('the Footer links the legal section once and the organization on GitHub', () => {
  const hrefs = FOOTER_COLUMNS.flatMap((column) =>
    column.links.map((link) => link.href),
  )
  assert.equal(hrefs.filter((href) => href === LEGAL_PATH).length, 1)
  assert.ok(hrefs.includes('https://github.com/metacensus'))
})
