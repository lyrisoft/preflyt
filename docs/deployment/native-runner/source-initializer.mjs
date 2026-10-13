// Image-owned Kubernetes init step. It never executes repository files.
import { mkdir, readdir, open, chmod, lstat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyMountedNativeSource } from './source-verification.mjs'
const safe = path => typeof path === 'string' && path && Buffer.byteLength(path) <= 512 && path.normalize('NFC') === path && !/[\\\x00-\x1f\x7f]/.test(path) &&
  path.split('/').length <= 32 && path.split('/').every(p => p && p !== '.' && p !== '..' && p.toLowerCase() !== '.git' && !p.includes(':') && Buffer.byteLength(p) <= 255)
export async function initializeNativeSource(root, bundle, scope) {
  const directory = await lstat(root)
  if (!directory.isDirectory() || directory.isSymbolicLink() || (process.getuid && directory.uid !== process.getuid())) throw new Error('Invalid source directory')
  if (resolve(root) !== root || (await readdir(root)).length || !bundle || bundle.version !== 1 ||
      bundle.repositoryId !== scope.repositoryId || bundle.sourceSha !== scope.sourceSha || bundle.sourceHash !== scope.sourceHash ||
      !Array.isArray(bundle.files) || bundle.files.length > 2000 || Buffer.byteLength(JSON.stringify(bundle)) > 524288) throw new Error('Invalid source initialization')
  const names = new Set(), directories = new Set([root]); let bytes = 0
  // Validate every path before creating anything; init and check containers never run concurrently.
  for (const file of bundle.files) {
    if (!safe(file.path) || names.has(file.path.toLowerCase()) || !['100644', '100755'].includes(file.mode) ||
        !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 2097152 || typeof file.content !== 'string') throw new Error('Invalid source file')
    names.add(file.path.toLowerCase()); bytes += file.size
    if (bytes > 20971520) throw new Error('Source exceeds bounds')
    const content = Buffer.from(file.content, 'base64')
    if (content.length !== file.size || content.toString('base64') !== file.content) throw new Error('Invalid source encoding')
  }
  for (const file of bundle.files) {
    const path = join(root, file.path), parent = dirname(path)
    await mkdir(parent, { recursive: true, mode: 0o755 })
    let directory = parent
    while (directory !== root) { directories.add(directory); directory = dirname(directory) }
    const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, file.mode === '100755' ? 0o555 : 0o444)
    try { await handle.writeFile(Buffer.from(file.content, 'base64')) } finally { await handle.close() }
  }
  await verifyMountedNativeSource(root, scope)
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) await chmod(directory, 0o555)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handle = await open('/source-bundle/bundle.json', constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 524288) throw new Error('Source delivery exceeds bounds')
    const buffer = Buffer.alloc(524289), { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead !== stat.size || bytesRead > 524288) throw new Error('Source delivery changed')
    await mkdir('/source-workspace/tree', { mode: 0o755 })
    await initializeNativeSource('/source-workspace/tree', JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')), {
      repositoryId: process.env.PREFLYT_SOURCE_REPOSITORY, sourceSha: process.env.PREFLYT_SOURCE_SHA, sourceHash: process.env.PREFLYT_SOURCE_HASH,
    })
  } finally { await handle.close() }
}
