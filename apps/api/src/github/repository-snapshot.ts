import { posix } from 'node:path'
import { createHash } from 'node:crypto'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { GitHubRateLimitError } from './github-rate-limit.js'
import { wantsProfileContent, omittedProfileChecks, type RepositorySnapshot, type RepositoryFile } from './repository-profile.js'

/** Shared profile interpretation. Git callers provide local object reads, never a checkout. */
export async function repositorySnapshotFromTree(
  request: <T>(path: string) => Promise<T>,
  base: string,
  metadata: { full_name: string },
  inspectedBranch: string,
  commit: { sha: string },
  tree: { sha: string; truncated: boolean; tree: Array<{path:string;type:string;mode:string;sha:string;size?:number}> },
): Promise<RepositorySnapshot> {
  const shaPattern = /^[a-f0-9]{40}$/
  const complete = !tree.truncated && tree.tree.length <= 10_000
  const warnings: string[] = []
  if (!complete) warnings.push('Repository tree is partial; discovery is limited to 10,000 entries. Absence cannot be established.')
  const omittedPaths: NonNullable<RepositorySnapshot['omittedPaths']> = []
  const entries = tree.tree.slice(0, 10_000)
  const byPath = new Map(entries.map((entry) => [entry.path, entry]))
  let linkReads = 0
  for (const entry of entries.filter((item) => item.type === 'commit' || item.mode === '120000')) {
    if (typeof entry.path !== 'string' || entry.path.length > 4096 || !shaPattern.test(entry.sha)) throw new ServiceUnavailableException('GitHub returned invalid omitted path evidence')
    if (entry.type === 'commit') { omittedPaths.push({ path: entry.path, kind: 'submodule', scope: 'directory', reason: 'Submodule content is not traversed.' }); continue }
    let scope: 'file' | 'directory' | 'unknown' = 'unknown'
    let reason = 'Symlink target could not be classified without following it.'
    let affectedChecks: string[] | undefined
    // Read only the link blob, never its target or external filesystem content.
    if (linkReads++ < 32 && entry.size !== undefined && entry.size > 0 && entry.size <= 4096) {
      try {
        const blob = await request<{ sha: string; size: number; encoding: string; content: string }>(`${base}/git/blobs/${entry.sha}`)
        if (blob.sha !== entry.sha || blob.encoding !== 'base64' || blob.size !== entry.size || typeof blob.content !== 'string' || blob.content.length > 6000) throw new Error('Invalid link blob')
        const bytes = Buffer.from(blob.content, 'base64')
        if (bytes.length !== entry.size || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== entry.sha) throw new Error('Invalid link integrity')
        const target = bytes.toString('utf8')
        const resolved = posix.normalize(posix.join(posix.dirname(entry.path), target))
        if (!target || posix.isAbsolute(target) || /[\x00-\x1f\x7f]/.test(target) || resolved === '..' || resolved.startsWith('../')) throw new Error('Unresolved link target')
        const destination = byPath.get(resolved)
        if (destination?.type === 'blob' && ['100644','100755'].includes(destination.mode)) { scope = 'file'; reason = 'Symlink to a repository file is not followed; only its supported path hints may be affected.' }
        else if (destination?.type === 'tree') {
          scope = 'directory'; reason = 'Symlinked directory content is not traversed.'
          if (complete) {
            affectedChecks = [...new Set(entries.filter((child) => child.path.startsWith(resolved + '/') && child.type !== 'tree').flatMap((child) => omittedProfileChecks(posix.join(entry.path, child.path.slice(resolved.length + 1)), child.type === 'blob' && ['100644','100755'].includes(child.mode) ? 'file' : 'unknown')))]
            reason = 'Symlinked directory is not followed; its supported check paths were classified from the complete repository tree.'
          }
        }
      } catch (error) { if (error instanceof ForbiddenException || error instanceof GitHubRateLimitError) throw error }
    }
    omittedPaths.push({ path: entry.path, kind: 'symlink', scope, reason, ...(affectedChecks ? { affectedChecks } : {}) })
  }
  const files: RepositoryFile[] = tree.tree
    .slice(0, 10_000)
    .filter(
      (entry) =>
        entry.type === 'blob' && ['100644', '100755'].includes(entry.mode),
    )
    .map((entry) => {
      if (
        typeof entry.path !== 'string' ||
        entry.path.length > 4096 ||
        !shaPattern.test(entry.sha)
      )
        throw new ServiceUnavailableException(
          'GitHub returned invalid file evidence',
        )
      return { path: entry.path, sha: entry.sha, size: entry.size ?? -1 }
    })
  const candidates = files
    .filter((file) => wantsProfileContent(file.path))
    .sort((a, b) => a.path.localeCompare(b.path))
  if (candidates.length > 32)
    warnings.push(
      'Manifest/workflow content inspection is limited to 32 files. Unread files remain unknown.',
    )
  let cursor = 0, stopped = false
  const worker = async () => {
    while (!stopped && cursor < Math.min(candidates.length, 32)) {
      const file = candidates[cursor++]!
      if (file.size < 0 || file.size > 262_144) {
        file.contentError = 'size_limit'
        continue
      }
      try {
        const blob = await request<{
          sha: string
          size: number
          encoding: string
          content: string
        }>(`${base}/git/blobs/${file.sha}`)
        if (
          blob.sha !== file.sha ||
          blob.encoding !== 'base64' ||
          blob.size !== file.size ||
          typeof blob.content !== 'string' ||
          blob.content.length > 360_000
        )
          throw new Error('Invalid blob')
        const bytes = Buffer.from(blob.content, 'base64')
        const hash = createHash('sha1')
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest('hex')
        if (bytes.length !== file.size || hash !== file.sha)
          throw new Error('Blob integrity failed')
        file.content = bytes.toString('utf8')
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          error instanceof GitHubRateLimitError
        ) { stopped = true; throw error }
        file.contentError = 'unavailable_or_invalid'
      }
    }
  }
  const readers = await Promise.allSettled(Array.from({ length: 4 }, () => worker()))
  const failure = readers.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return {
    sourceSha: commit.sha,
    treeSha: tree.sha,
    branch: inspectedBranch,
    fullName: metadata.full_name,
    complete,
    files,
    warnings,
    omittedPaths,
  }
}
