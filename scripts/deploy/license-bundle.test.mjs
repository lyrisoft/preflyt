import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installedGraph, writeLicenseBundle } from './license-bundle.mjs'

test('collects transitive and nested notices deterministically without following unrelated symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'preflyt-notices-'))
  try {
    const app = join(root, 'app'), dependency = join(app, 'node_modules/dep'), child = join(app, 'node_modules/child')
    await mkdir(join(dependency, 'vendor'), { recursive: true }); await mkdir(child, { recursive: true })
    await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { dep: '1' } }))
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'dep', version: '1.0.0', license: 'MIT', dependencies: { child: '1' }, optionalDependencies: { absent: '1' } }))
    await writeFile(join(dependency, 'LICENSE'), 'Copyright fixture\nMIT text')
    await writeFile(join(dependency, 'vendor/NOTICE.txt'), 'Bundled component attribution')
    await symlink(root, join(dependency, 'outside'))
    await writeFile(join(child, 'package.json'), JSON.stringify({ name: 'child', version: '2.0.0' }))
    const directories = await installedGraph(app)
    const result = await writeLicenseBundle(directories, join(root, 'out'), 'fixture')
    assert.equal(result.packages.length, 2)
    assert.deepEqual(result.reviewRequired, ['child@2.0.0'])
    const bundle = await readFile(join(root, 'out/third-party-licenses.txt'), 'utf8')
    assert.match(bundle, /Copyright fixture/); assert.match(bundle, /Bundled component attribution/)
    assert(!JSON.stringify(result).includes(root))
    const repeated = await writeLicenseBundle(directories.reverse(), join(root, 'again'), 'fixture')
    assert.deepEqual(result, repeated)
    await writeFile(join(dependency, 'package.json'), JSON.stringify({ name: 'dep', dependencies: { missing: '1' } }))
    await assert.rejects(installedGraph(app), /Missing installed dependency/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
