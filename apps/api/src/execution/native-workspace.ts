import { constants } from 'node:fs'
import { chmod, mkdir, mkdtemp, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  verifyNativeSourceBundle,
  type NativeSourceBundle,
} from './native-source.js'

/** Create a private, job-owned source tree. No supplied host path, Git hook or archive extraction. */
export async function createNativeWorkspace(
  parent: string,
  value: unknown,
  signal?: AbortSignal,
) {
  const bundle: NativeSourceBundle = verifyNativeSourceBundle(value)
  signal?.throwIfAborted()
  const root = await mkdtemp(join(parent, 'preflyt-native-'))
  const workspace = join(root, 'source')
  const cleanup = async () => {
    await chmod(workspace, 0o700).catch(() => undefined)
    for (const entry of bundle.tree.filter((entry) => entry.type === 'tree'))
      await chmod(join(workspace, entry.path), 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
  try {
    await chmod(root, 0o700)
    await mkdir(workspace, { mode: 0o700 })
    for (const entry of bundle.tree
      .filter((entry) => entry.type === 'tree')
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
      signal?.throwIfAborted()
      await mkdir(join(workspace, entry.path), { mode: 0o700 })
    }
    for (const file of bundle.files) {
      signal?.throwIfAborted()
      const handle = await open(
        join(workspace, file.path),
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      )
      try {
        await handle.writeFile(Buffer.from(file.content, 'base64'))
        await handle.sync()
        await handle.chmod(file.mode === '100755' ? 0o555 : 0o444)
      } finally {
        await handle.close()
      }
    }
    for (const entry of bundle.tree.filter((entry) => entry.type === 'tree'))
      await chmod(join(workspace, entry.path), 0o555)
    await chmod(workspace, 0o555)
    return { root, workspace, sourceHash: bundle.sourceHash, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
