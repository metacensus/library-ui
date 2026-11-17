import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

test('the PDF corpus is the same bytes on every run', (t) => {
  const script = join(import.meta.dirname, '../scripts/pdf-corpus.mjs')
  const [a, b] = [0, 1].map(() => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-corpus-'))
    t.after(() => rmSync(dir, { recursive: true }))
    execFileSync(process.execPath, [script, dir])
    return dir
  })
  const names = readdirSync(a)
  assert.deepEqual(readdirSync(b), names)
  for (const name of names)
    assert.ok(
      readFileSync(join(a, name)).equals(readFileSync(join(b, name))),
      name,
    )
})
