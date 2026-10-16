import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// Exercise the dependency Docusaurus actually resolves, not a separate fixture.
const docs = createRequire(resolve('apps/docs/package.json'))
const core = createRequire(docs.resolve('@docusaurus/core/package.json'))
const utilities = createRequire(core.resolve('@docusaurus/utils/package.json'))
const micromatch = utilities('micromatch')
const braces = createRequire(utilities.resolve('micromatch'))('braces')
const rejected = error => error instanceof SyntaxError && error.message.includes('maximum nesting depth')

test('rejects deeply nested brace and parenthesis patterns before stack exhaustion', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    for (const input of [open.repeat(4000) + 'a,b' + close.repeat(4000), open.repeat(4000) + 'a,b']) {
      for (const method of ['parse', 'compile', 'expand', 'stringify']) assert.throws(() => braces[method](input), rejected, method)
    }
  }
  assert.throws(() => micromatch.braces('{'.repeat(4000) + 'a,b' + '}'.repeat(4000)), rejected)
})

test('bounds caller-provided ASTs and cyclic child graphs before recursive traversal', () => {
  let ast = { type: 'text', value: 'x' }
  for (let i = 0; i < 10000; i++) ast = { type: 'root', nodes: [ast] }
  const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle)
  for (const value of [ast, cycle]) for (const method of ['compile', 'expand', 'stringify']) assert.throws(() => braces[method](value), rejected)
})

test('preserves ordinary globs, ranges, escaped literals and long shallow patterns', () => {
  assert.deepEqual(braces.expand('src/{api,web}/*.{ts,tsx}'), ['src/api/*.ts', 'src/api/*.tsx', 'src/web/*.ts', 'src/web/*.tsx'])
  assert.deepEqual(braces.expand('file-{1..3}'), ['file-1', 'file-2', 'file-3'])
  assert.equal(braces.compile('a/{b,c}/d'), 'a/(b|c)/d')
  assert.deepEqual(braces.expand('file-\\{literal\\}'), ['file-{literal}'])
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d')
  assert.equal(braces.compile('a'.repeat(8000)), 'a'.repeat(8000))
  assert.deepEqual(micromatch(['src/a.ts', 'src/b.tsx', 'test/a.js'], ['src/*.{ts,tsx}']), ['src/a.ts', 'src/b.tsx'])
})
