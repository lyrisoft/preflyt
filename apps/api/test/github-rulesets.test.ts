import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { AuthorizationService } from '../src/auth/authorization.service.js'
import type { AuthenticatedSession } from '../src/auth/session.guard.js'
import type { RedisCacheService } from '../src/cache/redis-cache.service.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import { rulesetSummary, rulesetDetail } from '../src/github/github-ruleset.js'
import { GitHubRulesetService } from '../src/github/github-ruleset.service.js'

const summary = {
  id: 42,
  name: 'Development protection',
  source_type: 'Organization',
  source: 'fixture',
  target: 'branch',
  enforcement: 'disabled',
}
const detail = {
  ...summary,
  conditions: {
    ref_name: { include: ['refs/heads/development'], exclude: [] },
    repository_name: { include: ['private-other-repository'] },
  },
  rules: [
    {
      type: 'pull_request',
      parameters: { required_approving_review_count: 1 },
    },
    {
      type: 'required_status_checks',
      parameters: {
        required_status_checks: [
          { context: 'Preflyt / Engineering Readiness', integration_id: 123 },
        ],
      },
    },
  ],
  bypass_actors: [{ actor_id: 99, actor_type: 'Team' }],
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
describe('ruleset normalization', () => {
  it('preserves GitHub state and inherited scope without leaking other repository targets or bypass actors', () => {
    const result = rulesetDetail(detail, 'fixture/app', 42)
    expect(result.enforcement).toBe('disabled')
    expect(result.sourceType).toBe('Organization')
    expect(result.branches.include).toEqual(['refs/heads/development'])
    expect(result.rules[0].requiredApprovals).toBe(1)
    expect(result.rules[1].checks).toEqual([
      { context: 'Preflyt / Engineering Readiness', integrationId: 123 },
    ])
    expect(JSON.stringify(result)).not.toContain('private-other-repository')
    expect(result).not.toHaveProperty('bypass_actors')
  })
  it('retains evaluate mode and ignores untrusted provider links', () => {
    expect(
      rulesetSummary(
        {
          ...summary,
          enforcement: 'evaluate',
          _links: { html: { href: 'javascript:alert(1)' } },
        },
        'fixture/app',
      ).htmlUrl,
    ).toBe('https://github.com/fixture/app/rules/42')
  })
  it.each([
    { ...summary, id: 0 },
    { ...summary, enforcement: 'pull_request' },
    { ...summary, source_type: 'Unknown' },
  ])('rejects malformed summaries', (row) =>
    expect(() => rulesetSummary(row, 'fixture/app')).toThrow('invalid ruleset'),
  )
  it('rejects mismatched detail IDs and malformed branch patterns', () => {
    expect(() => rulesetDetail(detail, 'fixture/app', 43)).toThrow(
      'invalid ruleset',
    )
    expect(() =>
      rulesetDetail(
        {
          ...detail,
          conditions: { ref_name: { include: 'main', exclude: [] } },
        },
        'fixture/app',
        42,
      ),
    ).toThrow('invalid ruleset')
  })
})
function setupProvider(rows: unknown = [summary]) {
  vi.stubEnv('GITHUB_APP_ID', '123')
  const values = new Map<string, string>()
  const cache = {
    githubPermit: vi.fn(async () => 0),
    githubRemainingCooldown: vi.fn(async () => 0),
    githubCooldown: vi.fn(async () => undefined),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value)
    }),
  }
  const provider = new GitHubProviderService(
    cache as unknown as RedisCacheService,
  )
  const verify = vi.spyOn(provider, 'verifyInstallation').mockResolvedValue({
    id: 1n,
    accountLogin: 'fixture',
    accountType: 'Organization',
    repositorySelection: 'selected',
    permissions: { metadata: 'read' },
  })
  const tokenRequest = vi.fn(async () => ({
    status: 201,
    headers: {},
    data: {
      token: 'fixture-token',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    },
  }))
  Object.assign(provider, { app: { octokit: { request: tokenRequest } } })
  const fetchMock = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/repositories/2')
            ? {
                id: 2,
                name: 'app',
                full_name: 'fixture/app',
                owner: { login: 'fixture' },
                default_branch: 'main',
              }
            : url.includes('/rulesets/42?')
              ? detail
              : rows,
        ),
        { status: 200 },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return { provider, verify, tokenRequest, fetchMock, cache }
}
describe('ruleset GitHub reader', () => {
  it('uses metadata-only, repository-limited tokens and requests inherited rulesets with bounded pagination', async () => {
    const { provider, tokenRequest, fetchMock } = setupProvider()
    const result = await provider.listRepositoryRulesets(1n, 2n, 2)
    expect(result.page).toBe(2)
    expect(result.hasMore).toBe(false)
    expect(result.rulesets[0].sourceType).toBe('Organization')
    expect(tokenRequest.mock.calls[0]).toEqual([
      'POST /app/installations/{installation_id}/access_tokens',
      expect.objectContaining({
        repository_ids: [2],
        permissions: { metadata: 'read' },
      }),
    ])
    expect(
      fetchMock.mock.calls.some(([url]) =>
        url.endsWith('/rulesets?includes_parents=true&per_page=20&page=2'),
      ),
    ).toBe(true)
  })
  it('reads one inherited ruleset through the repository endpoint', async () => {
    const { provider } = setupProvider()
    expect(
      (await provider.getRepositoryRuleset(1n, 2n, 42)).ruleset.rules,
    ).toHaveLength(2)
  })
  it('rechecks upstream access on cache hits and rejects revocation instead of serving cached rules', async () => {
    const { provider, verify, fetchMock } = setupProvider()
    const first = await provider.listRepositoryRulesets(1n, 2n)
    const second = await provider.listRepositoryRulesets(1n, 2n)
    expect(second.fetchedAt).toBe(first.fetchedAt)
    expect(
      fetchMock.mock.calls.filter(([url]) => url.includes('/rulesets?')),
    ).toHaveLength(1)
    verify.mockRejectedValue(new Error('Revoked'))
    await expect(provider.listRepositoryRulesets(1n, 2n)).rejects.toThrow(
      'could not be verified',
    )
  })
  it('keeps pagination incomplete when a full page is returned', async () => {
    const { provider } = setupProvider(
      Array.from({ length: 20 }, (_, i) => ({ ...summary, id: i + 1 })),
    )
    expect((await provider.listRepositoryRulesets(1n, 2n)).hasMore).toBe(true)
  })
  it('fails on invalid payloads rather than claiming no protection', async () => {
    const { provider } = setupProvider({ message: 'unavailable' })
    await expect(provider.listRepositoryRulesets(1n, 2n)).rejects.toThrow(
      'invalid ruleset list',
    )
  })
  it('rejects invalid pages before upstream calls', async () => {
    const { provider, verify } = setupProvider()
    await expect(provider.listRepositoryRulesets(1n, 2n, 0)).rejects.toThrow(
      'Invalid ruleset page',
    )
    expect(verify).not.toHaveBeenCalled()
  })
})
describe('ruleset authorization', () => {
  const session = {
    authenticated: true,
    identityId: 'actor',
    organizationId: 'org',
    subject: 'actor',
    email: null,
    role: 'DEVELOPER',
  } as AuthenticatedSession
  function setup() {
    const requireRepository = vi
      .fn()
      .mockResolvedValue({ installationId: 1n, githubId: 2n })
    const listRepositoryRulesets = vi
      .fn()
      .mockResolvedValue({ rulesets: [], page: 1, hasMore: false })
    const getRepositoryRuleset = vi.fn().mockResolvedValue({ ruleset: detail })
    const service = new GitHubRulesetService(
      { requireRepository } as unknown as AuthorizationService,
      {
        listRepositoryRulesets,
        getRepositoryRuleset,
      } as unknown as GitHubProviderService,
    )
    return {
      service,
      requireRepository,
      listRepositoryRulesets,
      getRepositoryRuleset,
    }
  }
  it('checks selected repository policy access before and after loading', async () => {
    const { service, requireRepository } = setup()
    await service.list(session, '2', 1)
    expect(requireRepository).toHaveBeenCalledTimes(2)
    expect(requireRepository).toHaveBeenCalledWith(session, '2', 'policy.read')
  })
  it('denies unauthorized scope before provider reads', async () => {
    const { service, requireRepository, listRepositoryRulesets } = setup()
    requireRepository.mockRejectedValue(new ForbiddenException())
    await expect(service.list(session, '2', 1)).rejects.toThrow()
    expect(listRepositoryRulesets).not.toHaveBeenCalled()
  })
  it('rejects access revoked during a detail read', async () => {
    const { service, requireRepository, getRepositoryRuleset } = setup()
    requireRepository
      .mockResolvedValueOnce({ installationId: 1n, githubId: 2n })
      .mockRejectedValueOnce(new ForbiddenException())
    await expect(service.detail(session, '2', 42)).rejects.toThrow()
    expect(getRepositoryRuleset).toHaveBeenCalledOnce()
  })
})

describe('ruleset route permission mapping', () => {
  it('requires policy.read at the request guard for list and detail paths', async () => {
    const { AuthorizationService } =
      await import('../src/auth/authorization.service.js')
    const access = new AuthorizationService({} as never)
    const requireRepository = vi
      .spyOn(access, 'requireRepository')
      .mockResolvedValue({} as never)
    const session = {
      authenticated: true,
      identityId: 'actor',
      organizationId: 'org',
      subject: 'actor',
      email: null,
      role: 'DEVELOPER',
    } as AuthenticatedSession
    for (const path of [
      '/github/repositories/2/rulesets',
      '/github/repositories/2/rulesets/42',
    ]) {
      await access.authorizeRequest({ path, method: 'GET' } as never, session)
    }
    expect(requireRepository).toHaveBeenCalledTimes(2)
    expect(requireRepository).toHaveBeenCalledWith(
      session,
      '2',
      'policy.read',
      true,
    )
  })
  it('denies a repository outside the current organization with the real authorization service', async () => {
    const { AuthorizationService } =
      await import('../src/auth/authorization.service.js')
    const findFirst = vi.fn().mockResolvedValue(null)
    const audit = vi.fn().mockResolvedValue({})
    const access = new AuthorizationService({
      organizationMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'member',
          role: 'DEVELOPER',
          organizationId: 'org',
        }),
      },
      gitHubRepository: { findFirst },
      auditEvent: { create: audit },
    } as never)
    const session = {
      authenticated: true,
      identityId: 'actor',
      organizationId: 'org',
      subject: 'actor',
      email: null,
      role: 'DEVELOPER',
    } as AuthenticatedSession
    await expect(
      access.authorizeRequest(
        { path: '/github/repositories/2/rulesets', method: 'GET' } as never,
        session,
      ),
    ).rejects.toThrow('You do not have access to this resource. Ask your administrator for access.')
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          selected: true,
          available: true,
          installation: { active: true, organizationId: 'org' },
          repositoryGrants: { some: { membershipId: 'member' } },
        }),
      }),
    )
    expect(audit).toHaveBeenCalledOnce()
  })
})

describe('resolved branch protection', () => {
  it('verifies the branch, includes inherited active requirements and keeps legacy 404 unknown', async () => {
    const { provider, fetchMock } = setupProvider()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repositories/2')) return Response.json({ id: 2, name: 'app', full_name: 'fixture/app', owner: { login: 'fixture' }, default_branch: 'main' })
      if (url.endsWith('/branches/main')) return Response.json({ name: 'main' })
      if (url.includes('/rules/branches/main?')) return Response.json([{ type: 'required_status_checks', ruleset_id: 42, ruleset_source_type: 'Organization', ruleset_source: 'fixture', parameters: { required_status_checks: [{ context: 'test', integration_id: 123 }] } }])
      return new Response('{}', { status: 404 })
    })
    const result = await provider.readBranchProtection(1n, 2n, 'main')
    expect(result.rules[0]).toMatchObject({ sourceType: 'Organization', rulesetId: 42, checks: [{ context: 'test', integrationId: 123 }] })
    expect(result.legacy.status).toBe('unavailable')
    expect(result).not.toHaveProperty('unprotected')
  })
  it('returns verified legacy requirements without bypass identities', async () => {
    const { provider, fetchMock } = setupProvider()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repositories/2')) return Response.json({ id: 2, name: 'app', full_name: 'fixture/app', owner: { login: 'fixture' }, default_branch: 'main' })
      if (url.endsWith('/branches/main')) return Response.json({ name: 'main' })
      if (url.includes('/rules/branches/main?')) return Response.json([])
      return Response.json({ required_pull_request_reviews: { required_approving_review_count: 2, bypass_pull_request_allowances: { users: ['private-user'] } }, required_status_checks: { contexts: ['build'] }, enforce_admins: { enabled: true } })
    })
    const result = await provider.readBranchProtection(1n, 2n, 'main')
    expect(result.legacy).toEqual({ status: 'verified', requiredApprovals: 2, checks: ['build'], enforceAdmins: true })
    expect(JSON.stringify(result)).not.toContain('private-user')
  })
  it('rejects nonexistent branches and malformed active rules', async () => {
    const { provider, fetchMock } = setupProvider()
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/repositories/2') ? Response.json({ id: 2, name: 'app', full_name: 'fixture/app', owner: { login: 'fixture' } }) : new Response('{}', { status: 404 }))
    await expect(provider.readBranchProtection(1n, 2n, 'missing')).rejects.toThrow('access is unavailable')
    await expect(provider.readBranchProtection(1n, 2n, '../main')).rejects.toThrow('Invalid branch')
  })
  it('rejects malformed inherited rules rather than omitting requirements', async () => {
    const { provider, fetchMock } = setupProvider()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repositories/2')) return Response.json({ id: 2, name: 'app', full_name: 'fixture/app', owner: { login: 'fixture' } })
      if (url.endsWith('/branches/main')) return Response.json({ name: 'main' })
      return Response.json([{ type: 'required_status_checks', ruleset_id: 42, ruleset_source_type: 'Organization', ruleset_source: 'fixture', parameters: { required_status_checks: [{ context: 'test', integration_id: -1 }] } }])
    })
    await expect(provider.readBranchProtection(1n, 2n, 'main')).rejects.toThrow('invalid ruleset')
  })
  it('does not return results when upstream repository access is revoked during the read', async () => {
    const { provider, fetchMock } = setupProvider()
    let opens = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/repositories/2')) return ++opens === 4 ? new Response('{}', { status: 403 }) : Response.json({ id: 2, name: 'app', full_name: 'fixture/app', owner: { login: 'fixture' } })
      if (url.endsWith('/branches/main')) return Response.json({ name: 'main' })
      if (url.includes('/rules/branches/main?')) return Response.json([])
      return Response.json({ enforce_admins: { enabled: true } })
    })
    await expect(provider.readBranchProtection(1n, 2n, 'main')).rejects.toThrow('access is unavailable')
  })
  it('rechecks current repository permission after the provider read', async () => {
    const access = { requireRepository: vi.fn().mockResolvedValueOnce({ installationId: 1n, githubId: 2n }).mockRejectedValueOnce(new ForbiddenException()) }
    const provider = { readBranchProtection: vi.fn().mockResolvedValue({ rules: [], legacy: { status: 'unavailable' } }) }
    const service = new GitHubRulesetService(access as unknown as AuthorizationService, provider as unknown as GitHubProviderService)
    await expect(service.protection({} as AuthenticatedSession, 'repo', 'main', 1)).rejects.toThrow(ForbiddenException)
    expect(access.requireRepository).toHaveBeenCalledTimes(2)
  })
})
