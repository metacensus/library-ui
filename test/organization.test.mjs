import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  humansTxt,
  organizationJsonLd,
  organizationJsonLdScript,
} from '../dist/organization/index.js'

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

test('the script body has no `<` and parses back to the JSON-LD', () => {
  const script = organizationJsonLdScript()
  assert.ok(!script.includes('<'))
  assert.deepEqual(JSON.parse(script), organizationJsonLd())
})
