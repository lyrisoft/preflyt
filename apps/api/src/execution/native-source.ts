import { createHash } from 'node:crypto'
import { digest } from '../assessments/assessment-digest.js'
export const sourceLimits = Object.freeze({
  entries: 20000,
  files: 8000,
  fileBytes: 2 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  pathBytes: 512,
  depth: 32,
})
export type GitSourceEntry = {
  path: string
  type: 'blob' | 'tree'
  mode: '100644' | '100755' | '040000'
  sha: string
  size?: number
}
export type NativeSourceFile = {
  path: string
  mode: '100644' | '100755'
  blobSha: string
  sha256: string
  size: number
  content: string
}
export type NativeSourceBundle = {
  version: 1
  repositoryId: string
  sourceSha: string
  treeSha: string
  tree: GitSourceEntry[]
  files: NativeSourceFile[]
  totalBytes: number
  sourceHash: string
}
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v)
function fail(): never {
  throw new Error(
    'Source cannot be verified completely within the safe checkout limits',
  )
}
export function safeSourcePath(path: unknown): path is string {
  if (
    typeof path !== 'string' ||
    !path ||
    Buffer.byteLength(path) > sourceLimits.pathBytes ||
    path.normalize('NFC') !== path ||
    /[\\\x00-\x1f\x7f]/.test(path)
  )
    return false
  const parts = path.split('/')
  return (
    parts.length <= sourceLimits.depth &&
    parts.every(
      (p) =>
        !!p &&
        p !== '.' &&
        p !== '..' &&
        p.toLowerCase() !== '.git' &&
        Buffer.byteLength(p) <= 255 &&
        !p.includes(':'),
    )
  )
}
export function gitObjectHash(type: 'blob' | 'tree', bytes: Buffer) {
  return createHash('sha1')
    .update(`${type} ${bytes.length}\0`)
    .update(bytes)
    .digest('hex')
}
/** Verify every directory, not just a root SHA echoed by the provider. */
export function validateSourceTree(
  body: unknown,
  expectedTreeSha: string,
): GitSourceEntry[] {
  if (!body || typeof body !== 'object') fail()
  const value = body as { sha: unknown; truncated: unknown; tree: unknown }
  if (
    value.sha !== expectedTreeSha ||
    !sha(expectedTreeSha) ||
    value.truncated !== false ||
    !Array.isArray(value.tree) ||
    value.tree.length > sourceLimits.entries
  )
    fail()
  const entries = value.tree as GitSourceEntry[]
  const paths = new Set<string>(),
    folded = new Set<string>()
  let total = 0,
    fileCount = 0
  const directories = new Map<string, GitSourceEntry[]>([['', []]])
  for (const entry of entries) {
    if (
      !entry ||
      !safeSourcePath(entry.path) ||
      !sha(entry.sha) ||
      paths.has(entry.path) ||
      folded.has(entry.path.toLowerCase()) ||
      !(
        (entry.type === 'tree' && entry.mode === '040000') ||
        (entry.type === 'blob' && ['100644', '100755'].includes(entry.mode))
      )
    )
      fail()
    paths.add(entry.path)
    folded.add(entry.path.toLowerCase())
    if (entry.type === 'tree') directories.set(entry.path, [])
    else {
      if (
        !Number.isSafeInteger(entry.size) ||
        entry.size! < 0 ||
        entry.size! > sourceLimits.fileBytes
      )
        fail()
      total += entry.size!
      fileCount++
      if (total > sourceLimits.totalBytes || fileCount > sourceLimits.files)
        fail()
    }
  }
  for (const entry of entries) {
    const index = entry.path.lastIndexOf('/'),
      parent = index < 0 ? '' : entry.path.slice(0, index)
    const children = directories.get(parent)
    if (!children) fail()
    children.push(entry)
  }
  const entryHashes = new Map(entries.map((entry) => [entry.path, entry.sha]))
  for (const [directory, children] of directories) {
    const name = (entry: GitSourceEntry) =>
      entry.path.slice(directory ? directory.length + 1 : 0)
    children.sort((a, b) =>
      Buffer.compare(
        Buffer.from(name(a) + (a.type === 'tree' ? '/' : '')),
        Buffer.from(name(b) + (b.type === 'tree' ? '/' : '')),
      ),
    )
    const bytes = Buffer.concat(
      children.map((entry) =>
        Buffer.concat([
          Buffer.from(`${entry.mode.replace(/^0+/, '')} ${name(entry)}\0`),
          Buffer.from(entry.sha, 'hex'),
        ]),
      ),
    )
    const expected = directory ? entryHashes.get(directory)! : expectedTreeSha
    if (gitObjectHash('tree', bytes) !== expected) fail()
  }
  return [...entries].sort((a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)),
  )
}
export function validateSourceBlob(
  body: unknown,
  file: GitSourceEntry,
): NativeSourceFile {
  if (!body || typeof body !== 'object' || file.type !== 'blob') fail()
  const blob = body as {
    sha: unknown
    size: unknown
    encoding: unknown
    content: unknown
  }
  if (
    blob.sha !== file.sha ||
    blob.encoding !== 'base64' ||
    blob.size !== file.size ||
    typeof blob.content !== 'string' ||
    blob.content.length > Math.ceil((sourceLimits.fileBytes * 4) / 3) + 65536
  )
    fail()
  const encoded = blob.content.replace(/\n/g, '')
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    fail()
  const bytes = Buffer.from(encoded, 'base64')
  if (
    bytes.toString('base64') !== encoded ||
    bytes.length !== file.size ||
    gitObjectHash('blob', bytes) !== file.sha ||
    bytes
      .subarray(0, 128)
      .toString()
      .startsWith('version https://git-lfs.github.com/spec/v1')
  )
    fail()
  return {
    path: file.path,
    mode: file.mode as '100644' | '100755',
    blobSha: file.sha,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    content: encoded,
  }
}
export async function readPinnedNativeSource(
  request: <T>(path: string) => Promise<T>,
  base: string,
  repositoryId: string,
  sourceSha: string,
  signal?: AbortSignal,
): Promise<NativeSourceBundle> {
  if (
    !/^[1-9]\d{0,15}$/.test(repositoryId) ||
    !sha(sourceSha) ||
    !/^\/repos\/[a-zA-Z0-9_.%-]+\/[a-zA-Z0-9_.%-]+$/.test(base)
  )
    fail()
  const check = () => signal?.throwIfAborted()
  check()
  const commit = await request<{ sha: string; tree: { sha: string } }>(
    `${base}/git/commits/${sourceSha}`,
  )
  check()
  if (commit.sha !== sourceSha || !sha(commit.tree?.sha)) fail()
  const entries = validateSourceTree(
    await request(`${base}/git/trees/${commit.tree.sha}?recursive=1`),
    commit.tree.sha,
  )
  const files = entries.filter((e) => e.type === 'blob')
  const output: NativeSourceFile[] = []
  let cursor = 0,
    stopped = false
  const worker = async () => {
    try {
      while (!stopped && cursor < files.length) {
        check()
        const file = files[cursor++]
        const blob = await request(`${base}/git/blobs/${file.sha}`)
        check()
        output.push(validateSourceBlob(blob, file))
      }
    } catch (error) {
      stopped = true
      throw error
    }
  }
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(4, files.length) }, worker),
  )
  const failed = settled.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failed) throw failed.reason
  check()
  output.sort((a, b) =>
    Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)),
  )
  if (output.length !== files.length) fail()
  const manifest = {
    version: 1 as const,
    repositoryId,
    sourceSha,
    treeSha: commit.tree.sha,
    tree: entries.map(({ path, type, mode, sha, size }) => ({
      path,
      type,
      mode,
      sha,
      ...(type === 'blob' ? { size } : {}),
    })),
    files: output.map(({ content, ...file }) => file),
    totalBytes: output.reduce((sum, f) => sum + f.size, 0),
  }
  return { ...manifest, files: output, sourceHash: digest(manifest) }
}

/** Used by the credential-free receiver; never trust broker transport alone. */
export function verifyNativeSourceBundle(value: unknown): NativeSourceBundle {
  if (!value || typeof value !== 'object') fail()
  const bundle = value as NativeSourceBundle
  if (
    Object.keys(bundle).sort().join(',') !==
      'files,repositoryId,sourceHash,sourceSha,totalBytes,tree,treeSha,version' ||
    bundle.version !== 1 ||
    typeof bundle.repositoryId !== 'string' ||
    !/^[1-9]\d{0,15}$/.test(bundle.repositoryId) ||
    !sha(bundle.sourceSha) ||
    !Array.isArray(bundle.files) ||
    bundle.files.length > sourceLimits.files ||
    typeof bundle.sourceHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(bundle.sourceHash)
  )
    fail()
  const tree = validateSourceTree(
    { sha: bundle.treeSha, truncated: false, tree: bundle.tree },
    bundle.treeSha,
  )
  const blobs = tree.filter((e) => e.type === 'blob')
  if (bundle.files.length !== blobs.length) fail()
  const files = bundle.files.map((file, index) => {
    if (
      !file ||
      Object.keys(file).sort().join(',') !==
        'blobSha,content,mode,path,sha256,size' ||
      typeof file.content !== 'string' ||
      file.path !== blobs[index].path
    )
      fail()
    const verified = validateSourceBlob(
      {
        sha: file.blobSha,
        encoding: 'base64',
        size: file.size,
        content: file.content,
      },
      blobs[index],
    )
    if (digest(file) !== digest(verified)) fail()
    return verified
  })
  const manifest = {
    version: 1 as const,
    repositoryId: bundle.repositoryId,
    sourceSha: bundle.sourceSha,
    treeSha: bundle.treeSha,
    tree: tree.map(({ path, type, mode, sha, size }) => ({
      path,
      type,
      mode,
      sha,
      ...(type === 'blob' ? { size } : {}),
    })),
    files: files.map(({ content, ...file }) => file),
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
  }
  if (
    manifest.totalBytes !== bundle.totalBytes ||
    digest(manifest) !== bundle.sourceHash
  )
    fail()
  return { ...manifest, files, sourceHash: bundle.sourceHash }
}
