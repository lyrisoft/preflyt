import 'reflect-metadata'
import { ForbiddenException } from '@nestjs/common'
import { GitHubCredentialService } from '../src/auth/github-credential.service.js'
import { beforeEach, expect, it, vi } from 'vitest'
import { GitHubUserAccessService } from '../src/auth/github-user-access.service.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'
import type { GitHubIdentityProvider } from '../src/auth/github-identity-provider.js'
const link = { githubOrganizationId: 201n, login: 'fixture' }
const installation = {
  id: 41n,
  organizationId: 'org',
  active: true,
  accessRevision: 1,
}
const db = {
  gitHubUserAccount: { findUnique: vi.fn() },
  gitHubOrganizationLink: { findUnique: vi.fn() },
  gitHubInstallation: { findFirst: vi.fn(), findUnique: vi.fn() },
  organizationMembership: { findUnique: vi.fn() },
}
const provider = {
  installationMembers: vi.fn(),
  resolveInstallationMember: vi.fn(),
  members: vi.fn(),
}
const service = () =>
  new GitHubUserAccessService(
    db as unknown as PrismaService,
    provider as unknown as GitHubIdentityProvider,
  )
beforeEach(() => {
  vi.resetAllMocks()
  db.gitHubUserAccount.findUnique.mockResolvedValue(null)
  db.gitHubOrganizationLink.findUnique.mockResolvedValue(link)
  db.gitHubInstallation.findFirst.mockResolvedValue(installation)
  db.gitHubInstallation.findUnique.mockResolvedValue(installation)
  db.organizationMembership.findUnique.mockResolvedValue({
    active: true,
    role: 'OWNER',
  })
  provider.installationMembers.mockResolvedValue([
    { id: '102', login: 'developer', avatarUrl: null },
  ])
  provider.resolveInstallationMember.mockResolvedValue({
    id: 102n,
    login: 'developer',
  })
})
it('syncs linked organization members from an authorized compatibility admin without a user token or granting access', async () => {
  expect(await service().directory('admin', 'org', true)).toMatchObject({
    members: [{ login: 'developer' }],
  })
  expect(provider.installationMembers).toHaveBeenCalledWith(41n, 201n)
  expect(provider.members).not.toHaveBeenCalled()
})
it('allows the same admin to resolve a selected member for assignment', async () => {
  expect(
    await service().resolveMember('admin', 'org', 'developer'),
  ).toMatchObject({ id: 102n })
  expect(provider.resolveInstallationMember).toHaveBeenCalledWith(
    41n,
    201n,
    'developer',
  )
})
it.each(['VIEWER', 'DEVELOPER', 'POLICY_MANAGER'])(
  'denies %s before reading the organization directory',
  async (role) => {
    db.organizationMembership.findUnique.mockResolvedValue({
      active: true,
      role,
    })
    await expect(service().directory('actor', 'org', true)).rejects.toThrow(
      'Owner or Admin',
    )
    expect(provider.installationMembers).not.toHaveBeenCalled()
  },
)
it('rejects authority revoked while GitHub is being read', async () => {
  provider.installationMembers.mockImplementationOnce(async () => {
    db.organizationMembership.findUnique.mockResolvedValue({
      active: false,
      role: 'OWNER',
    })
    return []
  })
  await expect(service().directory('admin', 'org', true)).rejects.toThrow(
    'Owner or Admin',
  )
})
it('rejects organization links changed during directory or member resolution', async () => {
  provider.resolveInstallationMember.mockImplementationOnce(async () => {
    db.gitHubOrganizationLink.findUnique.mockResolvedValue({
      ...link,
      githubOrganizationId: 999n,
    })
    return { id: 102n }
  })
  await expect(
    service().resolveMember('admin', 'org', 'developer'),
  ).rejects.toThrow('access changed')
})
it('does not fall back to App authority when GitHub refresh authorization has expired', async () => {
  db.gitHubUserAccount.findUnique.mockResolvedValue({
    id: 'account',
    credential: { accessExpiresAt: new Date(0) },
  })
  const access = vi
    .spyOn(GitHubCredentialService.prototype, 'access')
    .mockRejectedValue(new ForbiddenException('GitHub authorization expired'))
  try {
    await expect(service().directory('user', 'org', true)).rejects.toThrow(
      'expired',
    )
  } finally {
    access.mockRestore()
  }
  expect(provider.installationMembers).not.toHaveBeenCalled()
})
it('requires an explicit organization link even for an admin', async () => {
  db.gitHubOrganizationLink.findUnique.mockResolvedValue(null)
  await expect(service().directory('admin', 'org', true)).rejects.toThrow(
    'Link this workspace',
  )
  expect(provider.installationMembers).not.toHaveBeenCalled()
})
it('restricts directory tokens to read-only members on the verified organization', async () => {
  const app = new GitHubProviderService()
  vi.spyOn(app, 'verifyInstallation').mockResolvedValue({
    id: 41n,
    accountId: 201n,
    accountType: 'Organization',
    accountLogin: 'fixture',
    repositorySelection: 'selected',
    permissions: { members: 'read' },
  })
  const internal = app as unknown as {
    installationToken: (
      id: bigint,
      repo: bigint | undefined,
      permission: string,
    ) => Promise<string>
  }
  const mint = vi
    .spyOn(internal, 'installationToken')
    .mockResolvedValue('internal-fixture-token')
  const read = vi.fn(async () => ['member'])
  expect(await app.withOrganizationMembers(41n, 201n, read)).toEqual(['member'])
  expect(mint).toHaveBeenCalledWith(41n, undefined, 'members')
  await expect(app.withOrganizationMembers(41n, 999n, read)).rejects.toThrow(
    'does not match',
  )
  expect(mint).toHaveBeenCalledTimes(1)
  vi.spyOn(app, 'verifyInstallation').mockResolvedValue({
    id: 41n,
    accountId: 201n,
    accountType: 'Organization',
    accountLogin: 'fixture',
    repositorySelection: 'selected',
    permissions: {},
  })
  await expect(app.withOrganizationMembers(41n, 201n, read)).rejects.toThrow(
    'Members: Read-only',
  )
  expect(mint).toHaveBeenCalledTimes(1)
})
