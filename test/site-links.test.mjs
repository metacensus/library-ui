import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOOTER_COLUMNS, LEGAL_PATH } from '../dist/site/links.js'

test('the Footer links the legal section once and the organization on GitHub', () => {
  const hrefs = FOOTER_COLUMNS.flatMap((column) =>
    column.links.map((link) => link.href),
  )
  assert.equal(hrefs.filter((href) => href === LEGAL_PATH).length, 1)
  assert.ok(hrefs.includes('https://github.com/metacensus'))
})
