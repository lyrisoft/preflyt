import { RedisCacheService } from '../cache/redis-cache.service.js'
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { GitHubIdentityProvider } from './github-identity-provider.js'
import { decryptGitHubUserTokens } from './github-token-cipher.js'
@Injectable()
export class GitHubUserAccessService {
  private readonly refreshes = new Map<string, Promise<bigint[]>>()
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(GitHubIdentityProvider)
    private readonly provider: GitHubIdentityProvider,
    @Optional()
    @Inject(RedisCacheService)
    private readonly cache?: RedisCacheService
  ) {}
  private readonly directories = new Map<
    string,
    {
      syncedAt: string
      members: { id: string; login: string; avatarUrl: string | null }[]
    }
  >()
  private readonly directoryRefreshes = new Map<
    string,
    Promise<{
      syncedAt: string
      members: { id: string; login: string; avatarUrl: string | null }[]
    }>
  >()
  async directory(identityId: string, organizationId: string, refresh = false) {
    await this.repositoryIds(identityId, organizationId, refresh)
    const account = await this.db.gitHubUserAccount.findUnique({
      where: { identityId_host: { identityId, host: 'github.com' } },
      include: { credential: true },
    })
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId },
    })
    const installation = await this.db.gitHubInstallation.findFirst({
      where: { organizationId, active: true },
    })
    if (!account?.credential || !link || !installation)
      throw new ForbiddenException(
        'Sign in with GitHub in a linked organization to sync members'
      )
    const key = `github-member-directory:${organizationId}:${link.githubOrganizationId}:${account.id}:${installation.id}:${installation.accessRevision}`
    let snapshot = this.directories.get(key)
    if (!snapshot) {
      const cached = await this.cache?.get(key)
      if (cached) {
        try {
          snapshot = JSON.parse(cached)
        } catch {}
      }
    }
    if (
      !refresh &&
      snapshot &&
      Array.isArray(snapshot.members) &&
      Date.parse(snapshot.syncedAt) > Date.now() - 300000
    )
      return snapshot
    const pending = this.directoryRefreshes.get(key)
    if (pending) return pending
    const request = (async () => {
      const members = await this.provider.members(
        decryptGitHubUserTokens(account.id, account.credential!.encryptedTokens)
          .accessToken,
        link.login
      )
      // Membership/installation checks still protect provider data fetched during a concurrent revocation.
      await this.repositoryIds(identityId, organizationId, true)
      const current = await this.db.gitHubInstallation.findUnique({
        where: { id: installation.id },
      })
      if (
        !current?.active ||
        current.organizationId !== organizationId ||
        current.accessRevision !== installation.accessRevision
      )
        throw new ForbiddenException(
          'GitHub access changed during sync. Try again.'
        )
      const result = { syncedAt: new Date().toISOString(), members }
      if (this.directories.size >= 128) this.directories.clear()
      this.directories.set(key, result)
      await this.cache?.set(key, JSON.stringify(result), 300)
      return result
    })().finally(() => this.directoryRefreshes.delete(key))
    this.directoryRefreshes.set(key, request)
    return request
  }
  async resolveMember(
    identityId: string,
    organizationId: string,
    username: string
  ) {
    await this.repositoryIds(identityId, organizationId, true)
    const account = await this.db.gitHubUserAccount.findUnique({
      where: { identityId_host: { identityId, host: 'github.com' } },
      include: { credential: true },
    })
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId },
    })
    if (!account?.credential || !link)
      throw new ForbiddenException(
        'Sign in with GitHub to grant GitHub member access'
      )
    return this.provider.resolveMember(
      decryptGitHubUserTokens(account.id, account.credential.encryptedTokens)
        .accessToken,
      link.login,
      link.githubOrganizationId,
      username
    )
  }
  async repositoryIds(
    identityId: string,
    organizationId: string,
    fresh = false
  ): Promise<bigint[] | undefined> {
    const account = await this.db.gitHubUserAccount.findUnique({
      where: { identityId_host: { identityId, host: 'github.com' } },
      include: { credential: true },
    })
    if (!account) return undefined // Existing OIDC/Super Admin compatibility only.
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId },
    })
    const installation =
      link &&
      (await this.db.gitHubInstallation.findFirst({
        where: { organizationId, active: true },
      }))
    if (!link || !installation)
      throw new ForbiddenException(
        'This organization has no active GitHub connection'
      )
    if (!account.credential || account.credential.accessExpiresAt <= new Date())
      throw new ServiceUnavailableException(
        'Your GitHub authorization has expired. Sign in with GitHub again.'
      )
    const evidence = await this.db.gitHubUserAccessEvidence.findUnique({
      where: {
        accountId_organizationId: { accountId: account.id, organizationId },
      },
    })
    if (
      !fresh &&
      evidence &&
      evidence.installationId === installation.id &&
      evidence.accessRevision === installation.accessRevision &&
      evidence.expiresAt > new Date()
    )
      return evidence.repositoryGithubIds
    const key = `${account.id}:${organizationId}:${installation.id}:${installation.accessRevision}`
    const pending = this.refreshes.get(key)
    if (pending) return pending
    const refresh = (async () => {
      try {
        const token = decryptGitHubUserTokens(
          account.id,
          account.credential!.encryptedTokens
        ).accessToken
        const verified = await this.provider.verify(
          token,
          installation.id,
          account.githubUserId
        )
        if (verified.organizationId !== link.githubOrganizationId)
          throw new ForbiddenException('GitHub organization identity changed')
        const current = await this.db.gitHubInstallation.findUnique({
          where: { id: installation.id },
        })
        if (
          !current?.active ||
          current.accessRevision !== installation.accessRevision ||
          current.organizationId !== organizationId
        )
          throw new ForbiddenException(
            'GitHub installation access changed. Try again.'
          )
        const data = {
          installationId: installation.id,
          accessRevision: installation.accessRevision,
          repositoryGithubIds: verified.repositoryIds,
          verifiedAt: new Date(),
          expiresAt: new Date(
            Math.min(
              Date.now() + 300000,
              account.credential!.accessExpiresAt.getTime()
            )
          ),
        }
        await this.db.gitHubUserAccessEvidence.upsert({
          where: {
            accountId_organizationId: { accountId: account.id, organizationId },
          },
          create: { accountId: account.id, organizationId, ...data },
          update: data,
        })
        return verified.repositoryIds
      } catch (error) {
        await this.db.gitHubUserAccessEvidence.deleteMany({
          where: { accountId: account.id, organizationId },
        })
        if (
          error instanceof ForbiddenException ||
          error instanceof ServiceUnavailableException
        )
          throw error
        throw new ServiceUnavailableException(
          'GitHub access verification is temporarily unavailable. Try again.'
        )
      }
    })().finally(() => this.refreshes.delete(key))
    this.refreshes.set(key, refresh)
    return refresh
  }
}
