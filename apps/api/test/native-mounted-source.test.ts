import { mkdtemp, chmod, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  readPinnedNativeSource,
  gitObjectHash,
} from '../src/execution/native-source.js'
import { createNativeWorkspace } from '../src/execution/native-workspace.js'
const moduleUrl = new URL(
  '../../../docs/deployment/native-runner/source-verification.mjs',
  import.meta.url,
).href
const { verifyMountedNativeSource } = await import(/* @vite-ignore */ moduleUrl)
let directory: string,
  workspace: Awaited<ReturnType<typeof createNativeWorkspace>>
afterEach(async () => {
  await workspace?.cleanup()
  if (directory) await rm(directory, { recursive: true, force: true })
})
async function fixture() {
  directory = await mkdtemp(join(tmpdir(), 'preflyt-mounted-source-'))
  const content = Buffer.from([0, 1, 255, 128]),
    blob = gitObjectHash('blob', content)
  const nested = gitObjectHash(
    'tree',
    Buffer.concat([
      Buffer.from('100755 binary.bin\0'),
      Buffer.from(blob, 'hex'),
    ]),
  )
  const root = gitObjectHash(
    'tree',
    Buffer.concat([Buffer.from('40000 src\0'), Buffer.from(nested, 'hex')]),
  )
  const bundle = await readPinnedNativeSource(
    async (path: string) =>
      path.includes('/commits/')
        ? { sha: 'a'.repeat(40), tree: { sha: root } }
        : path.includes('/trees/')
          ? {
              sha: root,
              truncated: false,
              tree: [
                { path: 'src', type: 'tree', mode: '040000', sha: nested },
                {
                  path: 'src/binary.bin',
                  type: 'blob',
                  mode: '100755',
                  sha: blob,
                  size: content.length,
                },
              ],
            }
          : {
              sha: blob,
              size: content.length,
              encoding: 'base64',
              content: content.toString('base64'),
            },
    '/repos/fixture/mounted',
    '51',
    'a'.repeat(40),
  )
  workspace = await createNativeWorkspace(directory, bundle)
  const scope = {
    repositoryId: bundle.repositoryId,
    sourceSha: bundle.sourceSha,
    sourceHash: bundle.sourceHash,
  }
  return { bundle, scope }
}
it('reconstructs the exact canonical source manifest from binary bytes, nested Git trees and executable bits', async () => {
  const { bundle, scope } = await fixture()
  expect(await verifyMountedNativeSource(workspace.workspace, scope)).toBe(
    bundle.sourceHash,
  )
})
it('rejects a wrong remote filesystem even when its absolute path and metadata scope match', async () => {
  const { scope } = await fixture()
  await chmod(join(workspace.workspace, 'src/binary.bin'), 0o755)
  await writeFile(join(workspace.workspace, 'src/binary.bin'), 'different code')
  await expect(
    verifyMountedNativeSource(workspace.workspace, scope),
  ).rejects.toThrow('differs from admission')
})
it('rejects extra files, source symlinks and mode changes rather than hashing an approved subset', async () => {
  const { scope } = await fixture()
  await chmod(workspace.workspace, 0o700)
  await writeFile(join(workspace.workspace, 'extra.js'), 'unexpected')
  await expect(
    verifyMountedNativeSource(workspace.workspace, scope),
  ).rejects.toThrow()
  await rm(join(workspace.workspace, 'extra.js'))
  await symlink('/etc/passwd', join(workspace.workspace, 'linked'))
  await expect(
    verifyMountedNativeSource(workspace.workspace, scope),
  ).rejects.toThrow('symlink')
  await rm(join(workspace.workspace, 'linked'))
  await chmod(join(workspace.workspace, 'src/binary.bin'), 0o444)
  await expect(
    verifyMountedNativeSource(workspace.workspace, scope),
  ).rejects.toThrow()
})
it('rejects altered repository, commit or expected source hash', async () => {
  const { scope } = await fixture()
  for (const patch of [
    { repositoryId: '52' },
    { sourceSha: 'b'.repeat(40) },
    { sourceHash: 'b'.repeat(64) },
  ])
    await expect(
      verifyMountedNativeSource(workspace.workspace, { ...scope, ...patch }),
    ).rejects.toThrow()
})
