import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubProviderService } from '../src/github/github-provider.service.js'

const sourceSha = 'a'.repeat(40)
const treeSha = 'b'.repeat(40)
const content = '{"dependencies":{"react":"1"}}'
const blobSha = createHash('sha1')
  .update(`blob ${Buffer.byteLength(content)}\0`)
  .update(content)
  .digest('hex')
const setup = (
  options: {
    truncated?: boolean
    size?: number
    invalidBlob?: boolean
    denied?: boolean
    wrongRef?: boolean
    missingBranch?: boolean
    mismatchedCommit?: boolean
  } = {},
) => {
  vi.stubEnv('GITHUB_APP_ID', '123')
  const provider = new GitHubProviderService()
  vi.spyOn(provider, 'verifyInstallation').mockResolvedValue({
    id: 1n,
    accountLogin: 'fixture',
    accountType: 'Organization',
    repositorySelection: 'selected',
    permissions: { contents: 'read' },
  })
  const tokenRequest = vi.fn(async () => ({
    status: 201,
    headers: {},
    data: {
      token: 'short-lived-token',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
  }))
  Object.assign(provider, { app: { octokit: { request: tokenRequest } } })
  const fetchMock = vi.fn(async (url: string) => {
    if (
      options.denied ||
      (options.missingBranch && url.includes('/git/ref/heads/'))
    )
      return new Response('{}', { status: 404 })
    let body: unknown
    if (url.endsWith('/repositories/2'))
      body = {
        id: 2,
        name: 'app',
        full_name: 'fixture/app',
        owner: { login: 'fixture' },
        default_branch: 'feature/work',
      }
    else if (
      url.endsWith('/git/ref/heads/development') ||
      url.endsWith('/git/ref/heads/feature%2Fother')
    )
      body = {
        ref: options.wrongRef
          ? 'refs/tags/development'
          : url.endsWith('/development')
            ? 'refs/heads/development'
            : 'refs/heads/feature/other',
        object: { type: 'commit', sha: sourceSha },
      }
    else if (
      url.endsWith(`/commits/${sourceSha}`) ||
      url.endsWith('/commits/feature%2Fwork')
    )
      body = {
        sha: options.mismatchedCommit ? 'f'.repeat(40) : sourceSha,
        commit: { tree: { sha: treeSha } },
      }
    else if (url.endsWith(`/git/trees/${treeSha}?recursive=1`))
      body = {
        sha: treeSha,
        truncated: options.truncated ?? false,
        tree: [
          {
            path: 'package.json',
            mode: '100644',
            type: 'blob',
            sha: blobSha,
            size: options.size ?? Buffer.byteLength(content),
          },
          {
            path: '.env',
            mode: '100644',
            type: 'blob',
            sha: 'c'.repeat(40),
            size: 50,
          },
        ],
      }
    else if (url.endsWith(`/git/blobs/${blobSha}`))
      body = {
        sha: blobSha,
        size: Buffer.byteLength(content),
        encoding: 'base64',
        content: Buffer.from(
          options.invalidBlob ? 'changed content' : content,
        ).toString('base64'),
      }
    else throw new Error('Unexpected GitHub endpoint: ' + url)
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { provider, tokenRequest, fetchMock }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('bounded GitHub snapshot reader', () => {
  it('scopes token to the repository and reads content only by pinned tree/blob hashes', async () => {
    const { provider, tokenRequest, fetchMock } = setup()
    const snapshot = await provider.readRepositorySnapshot(1n, 2n)
    expect(snapshot).toMatchObject({
      sourceSha,
      treeSha,
      branch: 'feature/work',
      complete: true,
    })
    expect(snapshot.files[0]?.content).toBe(content)
    expect(tokenRequest).toHaveBeenCalledWith(
      'POST /app/installations/{installation_id}/access_tokens',
      expect.objectContaining({
        repository_ids: [2],
        permissions: { metadata: 'read', contents: 'read' },
      }),
    )
    expect(fetchMock.mock.calls.map(([url]) => url)).toHaveLength(4)
    expect(fetchMock.mock.calls.some(([url]) => url.includes('.env'))).toBe(
      false,
    )
  })
  it('retains partial-tree state, refuses oversized blobs and detects corrupted content', async () => {
    let fixtures = setup({ truncated: true, size: 262145 })
    let snapshot = await fixtures.provider.readRepositorySnapshot(1n, 2n)
    expect(snapshot.complete).toBe(false)
    expect(snapshot.files[0]?.contentError).toBe('size_limit')
    expect(fixtures.fetchMock).toHaveBeenCalledTimes(3)
    fixtures = setup({ invalidBlob: true })
    snapshot = await fixtures.provider.readRepositorySnapshot(1n, 2n)
    expect(snapshot.files[0]?.content).toBeUndefined()
    expect(snapshot.files[0]?.contentError).toBe('unavailable_or_invalid')
  })
  it('blocks cached and fresh reads when repository access is denied', async () => {
    const { provider } = setup({ denied: true })
    await expect(provider.verifyRepositoryAccess(1n, 2n)).rejects.toThrow(
      'access is unavailable',
    )
    await expect(provider.readRepositorySnapshot(1n, 2n)).rejects.toThrow(
      'access is unavailable',
    )
  })
})

it.each(['development', 'feature/other'])(
  'inspects exact branch %s through a pinned commit instead of the default branch',
  async (branch) => {
    const { provider, fetchMock } = setup()
    const snapshot = await provider.readRepositorySnapshot(1n, 2n, branch)
    expect(snapshot.branch).toBe(branch)
    expect(snapshot.sourceSha).toBe(sourceSha)
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(
      urls.some((url) =>
        url.endsWith('/git/ref/heads/' + encodeURIComponent(branch)),
      ),
    ).toBe(true)
    expect(urls.some((url) => url.endsWith('/commits/' + sourceSha))).toBe(true)
    expect(urls.some((url) => url.endsWith('/commits/feature%2Fwork'))).toBe(
      false,
    )
  },
)
it.each([
  'refs/tags/v1',
  'refs/heads/main',
  '../main',
  'feature*',
  'main.lock',
  '',
  '@',
  42,
  null,
])('rejects invalid branch input %s before GitHub reads', async (branch) => {
  const { provider, fetchMock } = setup()
  await expect(
    provider.readRepositorySnapshot(1n, 2n, branch as string),
  ).rejects.toThrow('valid branch name')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('refuses missing branches, tag refs and mismatched branch commits', async () => {
  for (const [options, message] of [
    [{ missingBranch: true }, 'branch is unavailable'],
    [{ wrongRef: true }, 'invalid branch revision'],
    [{ mismatchedCommit: true }, 'different branch revision'],
  ] as const) {
    const { provider } = setup(options)
    await expect(
      provider.readRepositorySnapshot(1n, 2n, 'development'),
    ).rejects.toThrow(message)
  }
})
