import { createHash } from 'node:crypto'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { RedisCacheService } from '../src/cache/redis-cache.service.js'
import { GitHubService } from '../src/github/github.service.js'
import {
  GitHubInstallationRevokedError,
  GitHubProviderService,
} from '../src/github/github-provider.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { OwnerAdminGuard } from '../src/auth/session.guard.js'

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
let prisma: PrismaService
let identityId: string
let provider: {
  createInstallationUrl: ReturnType<typeof vi.fn>
  createUserAuthorizationUrl: ReturnType<typeof vi.fn>
  verifyInstallation: ReturnType<typeof vi.fn>
  exchangeUserCode: ReturnType<typeof vi.fn>
  userCanAccessInstallation: ReturnType<typeof vi.fn>
  revokeUserToken: ReturnType<typeof vi.fn>
  verifyRepositoryAccess: ReturnType<typeof vi.fn>
  listInstallationRepositories: ReturnType<typeof vi.fn>
}

beforeAll(async () => {
  prisma = new PrismaService()
  await prisma.$connect()
  process.env.WEB_ORIGIN = 'http://localhost:5173'
})

afterAll(async () => {
  await prisma?.$disconnect()
})

beforeEach(async () => {
  await prisma.gitHubRepository.deleteMany()
  await prisma.gitHubInstallation.deleteMany()
  await prisma.gitHubSetupTransaction.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.identity.deleteMany()
  const identity = await prisma.identity.create({
    data: {
      issuer: 'https://issuer.example.test',
      subject: 'github-admin-subject',
      membership: { create: { role: 'OWNER' } },
    },
  })
  identityId = identity.id
  await prisma.organization.upsert({
    where: { id: 'preflyt-default' },
    create: { id: 'preflyt-default', name: 'Test workspace' },
    update: {},
  })
  await prisma.organizationMembership.create({
    data: { organizationId: 'preflyt-default', identityId, role: 'OWNER' },
  })
  provider = {
    createInstallationUrl: vi.fn(
      async (state: string) =>
        `https://github.com/apps/preflyt/installations/new?state=${state}`,
    ),
    createUserAuthorizationUrl: vi.fn(
      async (state: string, challenge: string) =>
        `https://github.com/login/oauth/authorize?state=${state}&code_challenge=${challenge}`,
    ),
    verifyInstallation: vi.fn(async (id: bigint) => ({
      id,
      accountLogin: 'lyrisoft-fixtures',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: { metadata: 'read', contents: 'read' },
    })),
    exchangeUserCode: vi.fn(async (code: string, verifier: string) => {
      expect(code).toBe('oauth-code')
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
      return 'ephemeral-user-token'
    }),
    userCanAccessInstallation: vi.fn(async () => undefined),
    revokeUserToken: vi.fn(async () => undefined),
    verifyRepositoryAccess: vi.fn(async () => ({
      fullName: 'lyrisoft-fixtures/fixture-service',
      branch: 'main',
    })),
    listInstallationRepositories: vi.fn(async () => [
      {
        id: 88001n,
        name: 'fixture-service',
        fullName: 'lyrisoft-fixtures/fixture-service',
        ownerLogin: 'lyrisoft-fixtures',
        defaultBranch: 'main',
        isPrivate: true,
      },
    ]),
  }
})

describe('GitHub App installation and repository selection', () => {
  it('authorizes an existing-installation update only through a valid state-bound setup flow', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const state = new URL(started.url).searchParams.get('state')!
    await expect(
      service.beginUserAuthorization(state, 'wrong-browser', '8800', 'update'),
    ).rejects.toThrow()
    await expect(
      service.beginUserAuthorization(
        state,
        started.browserBinding,
        '8800',
        'delete',
      ),
    ).rejects.toThrow('flow is invalid')
    const url = await service.beginUserAuthorization(
      state,
      started.browserBinding,
      '8800',
      'update',
    )
    await service.completeUserAuthorization(
      new URL(url).searchParams.get('state')!,
      started.browserBinding,
      'oauth-code',
    )
    expect(provider.verifyInstallation).toHaveBeenCalledWith(8800n)
    expect(provider.userCanAccessInstallation).toHaveBeenCalledWith(
      'ephemeral-user-token',
      8800n,
    )
    expect(await prisma.gitHubInstallation.count()).toBe(1)
    await expect(
      service.beginUserAuthorization(
        state,
        started.browserBinding,
        '8800',
        'update',
      ),
    ).rejects.toThrow()
  })
  it('binds both GitHub redirects to one browser and single-use server state', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const installState = new URL(started.url).searchParams.get('state')!
    const transaction = await prisma.gitHubSetupTransaction.findFirstOrThrow()
    expect(transaction.stateHash).toBe(digest(installState))
    expect(transaction.browserBindingHash).toBe(digest(started.browserBinding))

    await expect(
      service.beginUserAuthorization(
        installState,
        'wrong-browser',
        '8800',
        'install',
      ),
    ).rejects.toThrow()

    const oauthUrl = await service.beginUserAuthorization(
      installState,
      started.browserBinding,
      '8800',
      'install',
    )
    const oauthState = new URL(oauthUrl).searchParams.get('state')!
    const authorization = await prisma.gitHubSetupTransaction.findFirstOrThrow()
    expect(authorization.phase).toBe('USER_AUTHORIZATION')
    expect(authorization.stateHash).toBe(digest(oauthState))
    expect(authorization.installationId).toBe(8800n)
    expect(authorization.codeVerifier).toBeTruthy()
    await expect(
      service.beginUserAuthorization(
        installState,
        started.browserBinding,
        '8800',
        'install',
      ),
    ).rejects.toThrow()
  })

  it('verifies the installing GitHub user, limits access, and persists unselected repositories', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const installState = new URL(started.url).searchParams.get('state')!
    const oauthUrl = await service.beginUserAuthorization(
      installState,
      started.browserBinding,
      '8800',
      'install',
    )
    const oauthState = new URL(oauthUrl).searchParams.get('state')!
    const result = await service.completeUserAuthorization(
      oauthState,
      started.browserBinding,
      'oauth-code',
    )

    expect(result).toEqual({
      accountLogin: 'lyrisoft-fixtures',
      repositoryCount: 1,
    })
    expect(provider.userCanAccessInstallation).toHaveBeenCalledWith(
      'ephemeral-user-token',
      8800n,
    )
    expect(provider.revokeUserToken).toHaveBeenCalledWith(
      'ephemeral-user-token',
    )
    expect(provider.listInstallationRepositories).toHaveBeenCalledWith(8800n)
    expect(
      await prisma.gitHubInstallation.findUnique({ where: { id: 8800n } }),
    ).toMatchObject({
      accountLogin: 'lyrisoft-fixtures',
      permissions: { metadata: 'read', contents: 'read' },
      connectedById: identityId,
    })
    expect(
      await prisma.gitHubRepository.findUnique({ where: { githubId: 88001n } }),
    ).toMatchObject({
      fullName: 'lyrisoft-fixtures/fixture-service',
      selected: false,
      isPrivate: true,
    })
    const listing = await service.listRepositories(true)
    expect(listing.repositories).toHaveLength(1)
    expect(listing.repositories[0]?.githubId).toBe('88001')
    expect(listing.installations).toMatchObject([
      { id: '8800', accountLogin: 'lyrisoft-fixtures', active: true },
    ])
    expect(
      await prisma.auditEvent.findFirst({
        where: { event: 'github_installation_connected' },
      }),
    ).not.toBeNull()
    expect(await prisma.gitHubSetupTransaction.count()).toBe(0)
  })

  it('rejects an installation the authorizing GitHub user cannot access and revokes the temporary token', async () => {
    provider.userCanAccessInstallation.mockRejectedValueOnce(
      new Error('not accessible'),
    )
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const installState = new URL(started.url).searchParams.get('state')!
    const oauthUrl = await service.beginUserAuthorization(
      installState,
      started.browserBinding,
      '8800',
      'install',
    )
    const oauthState = new URL(oauthUrl).searchParams.get('state')!

    await expect(
      service.completeUserAuthorization(
        oauthState,
        started.browserBinding,
        'oauth-code',
      ),
    ).rejects.toThrow('not accessible')
    expect(provider.revokeUserToken).toHaveBeenCalledWith(
      'ephemeral-user-token',
    )
    expect(await prisma.gitHubInstallation.count()).toBe(0)
    expect(
      await prisma.auditEvent.findFirst({
        where: { event: 'github_installation_denied' },
      }),
    ).not.toBeNull()
  })

  it('does not persist an installation when temporary-token revocation fails', async () => {
    provider.revokeUserToken.mockRejectedValueOnce(
      new Error('revocation failed'),
    )
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const installState = new URL(started.url).searchParams.get('state')!
    const oauthUrl = await service.beginUserAuthorization(
      installState,
      started.browserBinding,
      '8800',
      'install',
    )
    const oauthState = new URL(oauthUrl).searchParams.get('state')!

    await expect(
      service.completeUserAuthorization(
        oauthState,
        started.browserBinding,
        'oauth-code',
      ),
    ).rejects.toThrow('revocation failed')
    expect(await prisma.gitHubInstallation.count()).toBe(0)
  })

  it('requires same-origin Owner/Admin selection and rejects repositories outside the installation', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const installState = new URL(started.url).searchParams.get('state')!
    const oauthUrl = await service.beginUserAuthorization(
      installState,
      started.browserBinding,
      '8800',
      'install',
    )
    await service.completeUserAuthorization(
      new URL(oauthUrl).searchParams.get('state')!,
      started.browserBinding,
      'oauth-code',
    )

    await expect(
      service.setRepositorySelected(
        identityId,
        '88001',
        true,
        'https://attacker.test',
      ),
    ).rejects.toThrow()
    await expect(
      service.setRepositorySelected(
        identityId,
        '99999',
        true,
        'http://localhost:5173',
      ),
    ).rejects.toThrow()
    await service.setRepositorySelected(
      identityId,
      '88001',
      true,
      'http://localhost:5173',
    )
    expect(
      await prisma.gitHubRepository.findUnique({ where: { githubId: 88001n } }),
    ).toMatchObject({
      selected: true,
    })
    expect(
      await prisma.auditEvent.findFirst({
        where: { event: 'github_repository_selection_changed' },
      }),
    ).not.toBeNull()

    const guard = new OwnerAdminGuard()
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ preflytSession: { role: 'VIEWER' } }),
        }),
      } as never),
    ).toThrow('Owner or Admin role required')
  })

  it('clears repository selection when GitHub reports a revoked installation', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const installState = new URL(started.url).searchParams.get('state')!
    const oauthUrl = await service.beginUserAuthorization(
      installState,
      started.browserBinding,
      '8800',
      'install',
    )
    await service.completeUserAuthorization(
      new URL(oauthUrl).searchParams.get('state')!,
      started.browserBinding,
      'oauth-code',
    )
    await service.setRepositorySelected(
      identityId,
      '88001',
      true,
      'http://localhost:5173',
    )

    provider.verifyInstallation.mockRejectedValueOnce(
      new GitHubInstallationRevokedError(),
    )
    const listing = await service.listRepositories(true)

    expect(listing.repositories).toEqual([])
    expect(listing.installations).toMatchObject([{ id: '8800', active: false }])
    expect(
      await prisma.gitHubRepository.findUnique({ where: { githubId: 88001n } }),
    ).toMatchObject({
      selected: false,
    })
    expect(
      await prisma.auditEvent.findFirst({
        where: { event: 'github_installation_unavailable' },
      }),
    ).not.toBeNull()
    await expect(
      service.setRepositorySelected(
        identityId,
        '88001',
        true,
        'http://localhost:5173',
      ),
    ).rejects.toThrow()
  })
})

describe('local inventory reads and explicit upstream synchronization', () => {
  async function setup() {
    await prisma.gitHubInstallation.create({
      data: {
        id: 8800n,
        accountLogin: 'lyrisoft-fixtures',
        accountType: 'Organization',
        repositorySelection: 'selected',
        permissions: { metadata: 'read', contents: 'read' },
        connectedById: identityId,
        active: true,
        lastVerifiedAt: new Date(),
      },
    })
    const entries = new Map<string, string>()
    const cache = {
      get: vi.fn(async (key: string) => entries.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        entries.set(key, value)
      }),
      delete: vi.fn(async (key: string) => {
        entries.delete(key)
      }),
    }
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
      cache as unknown as RedisCacheService,
    )
    return { service, cache, entries }
  }

  it('reads saved inventory and current selection without upstream verification', async () => {
    const { service } = await setup()
    await service.listRepositories(true)
    await service.setRepositorySelected(
      identityId,
      '88001',
      true,
      'http://localhost:5173',
    )
    provider.verifyInstallation.mockClear()
    provider.listInstallationRepositories.mockClear()
    const listing = await service.listRepositories()
    expect(listing.repositories[0]?.selected).toBe(true)
    expect(provider.verifyInstallation).not.toHaveBeenCalled()
    expect(provider.listInstallationRepositories).not.toHaveBeenCalled()
  })
  it('explicit refresh bypasses inventory and reconciles removals', async () => {
    const { service } = await setup()
    await service.listRepositories(true)
    provider.listInstallationRepositories.mockResolvedValueOnce([])
    expect((await service.listRepositories(true)).repositories).toEqual([])
    expect(provider.listInstallationRepositories).toHaveBeenCalledTimes(2)
  })

  it('never enables a cached repository when current upstream access is denied', async () => {
    const { service } = await setup()
    await service.listRepositories(true)
    provider.verifyRepositoryAccess.mockRejectedValueOnce(
      new Error('Repository unavailable'),
    )
    await expect(
      service.setRepositorySelected(
        identityId,
        '88001',
        true,
        'http://localhost:5173',
      ),
    ).rejects.toThrow('Repository unavailable')
    expect(
      (
        await prisma.gitHubRepository.findUnique({
          where: { githubId: 88001n },
        })
      )?.selected,
    ).toBe(false)
  })

  it('does not serve cached inventory on live verification or explicit refresh failure', async () => {
    const { service } = await setup()
    await service.listRepositories(true)
    provider.verifyInstallation.mockRejectedValueOnce(
      new Error('GitHub offline'),
    )
    await expect(service.listRepositories(true)).rejects.toThrow(
      'temporarily unavailable',
    )
    provider.listInstallationRepositories.mockRejectedValueOnce(
      new Error('GitHub offline'),
    )
    await expect(service.listRepositories(true)).rejects.toThrow(
      'temporarily unavailable',
    )
  })
})

describe('cache invalidation and selection races', () => {
  it('invalidates the installation inventory after authorized reconnect', async () => {
    const cache = { delete: vi.fn(async () => undefined) }
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
      cache as unknown as RedisCacheService,
    )
    const started = await service.beginInstallation(identityId)
    const state = new URL(started.url).searchParams.get('state')!
    const authorization = await service.beginUserAuthorization(
      state,
      started.browserBinding,
      '8800',
      'update',
    )
    await service.completeUserAuthorization(
      new URL(authorization).searchParams.get('state')!,
      started.browserBinding,
      'oauth-code',
    )
    expect(cache.delete).toHaveBeenCalledWith(
      expect.stringContaining('installation:8800:repositories'),
    )
  })

  it('blocks selection if the installation becomes inactive during the live access check', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const authorization = await service.beginUserAuthorization(
      new URL(started.url).searchParams.get('state')!,
      started.browserBinding,
      '8800',
      'install',
    )
    await service.completeUserAuthorization(
      new URL(authorization).searchParams.get('state')!,
      started.browserBinding,
      'oauth-code',
    )
    provider.verifyRepositoryAccess.mockImplementationOnce(async () => {
      await prisma.gitHubInstallation.update({
        where: { id: 8800n },
        data: { active: false },
      })
    })
    await expect(
      service.setRepositorySelected(
        identityId,
        '88001',
        true,
        'http://localhost:5173',
      ),
    ).rejects.toThrow('Repository access changed')
    expect(
      (
        await prisma.gitHubRepository.findUnique({
          where: { githubId: 88001n },
        })
      )?.selected,
    ).toBe(false)
  })
})

describe('dashboard reads last synced local state without upstream latency', () => {
  it('loads while GitHub is unavailable, reflects current selection, and excludes inactive installations', async () => {
    const service = new GitHubService(
      prisma,
      provider as unknown as GitHubProviderService,
    )
    const started = await service.beginInstallation(identityId)
    const authorization = await service.beginUserAuthorization(
      new URL(started.url).searchParams.get('state')!,
      started.browserBinding,
      '8800',
      'install',
    )
    await service.completeUserAuthorization(
      new URL(authorization).searchParams.get('state')!,
      started.browserBinding,
      'oauth-code',
    )
    await prisma.gitHubRepository.update({
      where: { githubId: 88001n },
      data: { selected: true },
    })
    provider.verifyInstallation
      .mockReset()
      .mockRejectedValue(new Error('GitHub offline'))
    provider.listInstallationRepositories
      .mockReset()
      .mockRejectedValue(new Error('GitHub offline'))
    const overview = await service.repositoryOverview()
    expect(overview.repositories).toMatchObject([
      { githubId: '88001', selected: true },
    ])
    expect(provider.verifyInstallation).not.toHaveBeenCalled()
    expect(provider.listInstallationRepositories).not.toHaveBeenCalled()
    await prisma.gitHubRepository.update({
      where: { githubId: 88001n },
      data: { selected: false },
    })
    expect((await service.repositoryOverview()).repositories[0]?.selected).toBe(
      false,
    )
    await prisma.gitHubInstallation.update({
      where: { id: 8800n },
      data: { active: false },
    })
    expect((await service.repositoryOverview()).repositories).toEqual([])
  })
})
