import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { exportDependencies } from './package-runtime.mjs'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'preflyt-runtime-'))
  async function pkg(name, data = {}, content = 'module.exports = 42') {
    const directory = join(root, 'source/node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...data }))
    await writeFile(join(directory, 'index.js'), content)
    await writeFile(join(directory, 'LICENSE'), 'upstream notice')
  }
  try { await run(root, pkg) } finally { await rm(root, { recursive: true, force: true }) }
}
test('exports transitive dependencies, required peers and notices with working relocated links', async () => fixture(async (root, pkg) => {
  await pkg('@scope/root', { dependencies: { child: '*' }, peerDependencies: { peer: '*' } }, "module.exports = require('child') + require('peer')")
  await pkg('child', {}, 'module.exports = 2'); await pkg('peer', {}, 'module.exports = 3'); await pkg('unused')
  const output = join(root, 'output')
  await exportDependencies(join(root, 'source'), output, ['@scope/root'])
  assert.equal(createRequire(join(output, 'package.json'))('@scope/root'), 5)
  assert.equal(await readFile(join(output, 'node_modules/@scope/root/LICENSE'), 'utf8'), 'upstream notice')
  const rows = JSON.parse(await readFile(join(output, 'runtime-dependencies.json'), 'utf8'))
  assert.equal(rows.length, 3); assert(!rows.some(row => row.name === 'unused'))
}))
test('omits only Prisma client optional generator peers and retains required client runtime', async () => fixture(async (root, pkg) => {
  await pkg('@prisma/client', { dependencies: { runtime: '*' }, peerDependencies: { prisma: '*', typescript: '*' }, peerDependenciesMeta: { prisma: { optional: true }, typescript: { optional: true } } })
  await pkg('runtime'); await pkg('prisma'); await pkg('typescript')
  await exportDependencies(join(root, 'source'), join(root, 'output'), ['@prisma/client'])
  const rows = JSON.parse(await readFile(join(root, 'output/runtime-dependencies.json'), 'utf8'))
  assert.deepEqual(rows.map(row => row.name).sort(), ['@prisma/client', 'runtime'])
}))
test('fails on missing required dependencies but accepts unavailable optional dependencies', async () => fixture(async (root, pkg) => {
  await pkg('root', { dependencies: { missing: '*' } })
  await assert.rejects(exportDependencies(join(root, 'source'), join(root, 'failed'), ['root']), /Missing runtime dependency: missing/)
  await pkg('root', { optionalDependencies: { missing: '*' } })
  await exportDependencies(join(root, 'source'), join(root, 'output'), ['root'])
}))
