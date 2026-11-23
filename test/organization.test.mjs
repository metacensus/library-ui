import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { humansTxt, organizationJsonLd } from '../dist/organization/index.js'

const expected = (name) =>
  readFileSync(join(import.meta.dirname, 'expected', name), 'utf8')

test('the Organization JSON-LD matches the committed file', () => {
  assert.equal(
    JSON.stringify(organizationJsonLd(), null, 2) + '\n',
    expected('organization.jsonld'),
  )
})

test('humans.txt matches the committed file', () => {
  assert.equal(humansTxt(), expected('humans.txt'))
})
