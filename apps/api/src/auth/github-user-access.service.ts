import { RedisCacheService } from '../cache/redis-cache.service.js'
import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { GitHubIdentityProvider } from './github-identity-provider.js'
import { GitHubCredentialService } from './github-credential.service.js'
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
      include: { credential: true }
    })
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId }
    })
    const installation = await this.db.gitHubInstallation.findFirst({
      where: { organizationId, active: true }
    })
    if (!link || !installation)
      throw new ForbiddenException(
        'Link this workspace to an active GitHub organization before syncing members'
      )
    if (!account) await this.requireDirectoryAdmin(identityId, organizationId)
    const key = `github-member-directory:${organizationId}:${link.githubOrganizationId}:${account?.id ?? `installation-admin-${identityId}`}:${installation.id}:${installation.accessRevision}`
    let snapshot = this.directories.get(key)
    if (!snapshot) {
      const cached = await this.cache?.get(key)
      if (cached) {
        try {
          snapshot = JSON.parse(cached)
        } catch {
          snapshot = undefined
        }
      }
    }
    if (
      !refresh &&
      snapshot &&
      Array.isArray(snapshot.members) &&
      Date.parse(snapshot.syncedAt) > Date.now() - 300000
    ) {
      await this.assertDirectoryContext(
        identityId,
        organizationId,
        link.githubOrganizationId,
        installation.id,
        installation.accessRevision,
        !account
      )
      return snapshot
    }
    const pending = this.directoryRefreshes.get(key)
    if (pending) {
      const result = await pending
      await this.assertDirectoryContext(
        identityId,
        organizationId,
        link.githubOrganizationId,
        installation.id,
        installation.accessRevision,
        !account
      )
      return result
    }
    const request = (async () => {
      const members = account
        ? await this.provider.members(
            (await new GitHubCredentialService(this.db, this.provider).access(account.id)).token,
            link.login
          )
        : await this.provider.installationMembers(
            installation.id,
            link.githubOrganizationId
          )
      // Membership/installation checks still protect provider data fetched during a concurrent revocation.
      await this.repositoryIds(identityId, organizationId, true)
      const current = await this.db.gitHubInstallation.findUnique({
        where: { id: installation.id }
      })
      if (
        !current?.active ||
        current.organizationId !== organizationId ||
        current.accessRevision !== installation.accessRevision
      )
        throw new ForbiddenException(
          'GitHub access changed during sync. Try again.'
        )
      await this.assertDirectoryContext(
        identityId,
        organizationId,
        link.githubOrganizationId,
        installation.id,
        installation.accessRevision,
        !account
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
      include: { credential: true }
    })
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId }
    })
    const installation = await this.db.gitHubInstallation.findFirst({
      where: { organizationId, active: true }
    })
    if (!link || !installation)
      throw new ForbiddenException(
        'Link this workspace to an active GitHub organization before assigning members'
      )
    if (!account) {
      await this.requireDirectoryAdmin(identityId, organizationId)
      const user = await this.provider.resolveInstallationMember(
        installation.id,
        link.githubOrganizationId,
        username
      )
      await this.assertDirectoryContext(
        identityId,
        organizationId,
        link.githubOrganizationId,
        installation.id,
        installation.accessRevision,
        true
      )
      return user
    }
    if (!account.credential)
      throw new ServiceUnavailableException(
        'Your GitHub authorization has expired. Sign in with GitHub again.'
      )
    return this.provider.resolveMember(
      (await new GitHubCredentialService(this.db, this.provider).access(account.id)).token,
      link.login,
      link.githubOrganizationId,
      username
    )
  }
  private async requireDirectoryAdmin(
    identityId: string,
    organizationId: string
  ) {
    const member = await this.db.organizationMembership.findUnique({
      where: { organizationId_identityId: { organizationId, identityId } }
    })
    if (!member?.active || !['OWNER', 'ADMIN'].includes(member.role))
      throw new ForbiddenException(
        'An active workspace Owner or Admin role is required to manage GitHub members'
      )
  }
  private async assertDirectoryContext(
    identityId: string,
    organizationId: string,
    githubOrganizationId: bigint,
    installationId: bigint,
    accessRevision: number,
    admin: boolean
  ) {
    if (admin) await this.requireDirectoryAdmin(identityId, organizationId)
    const link = await this.db.gitHubOrganizationLink.findUnique({
      where: { organizationId }
    })
    const installation = await this.db.gitHubInstallation.findUnique({
      where: { id: installationId }
    })
    if (
      link?.githubOrganizationId !== githubOrganizationId ||
      !installation?.active ||
      installation.organizationId !== organizationId ||
      installation.accessRevision !== accessRevision
    )
      throw new ForbiddenException(
        'GitHub access changed during sync. Try again.'
      )
  }
  private lastReconciliation = 0
  private reconciliationCursor: string | undefined
  async reconcile() {
    if (process.env.GITHUB_LOGIN_ENABLED !== 'true' || Date.now() - this.lastReconciliation < 60000) return
    this.lastReconciliation = Date.now()
    const rows = await this.db.gitHubUserAccessEvidence.findMany({
      where: { expiresAt: { lte: new Date() } }, orderBy: { id: 'asc' }, take: 10,
      ...(this.reconciliationCursor ? { cursor: { id: this.reconciliationCursor }, skip: 1 } : {}),
      include: { account: true },
    })
    this.reconciliationCursor = rows.at(-1)?.id
    for (const row of rows) {
      const member = await this.db.organizationMembership.findUnique({ where: { organizationId_identityId: { organizationId: row.organizationId, identityId: row.account.identityId } } })
      if (!member?.active) {
        await this.db.gitHubUserAccessEvidence.deleteMany({ where: { id: row.id } })
        continue
      }
      // Failure never extends stale authorization evidence or deletes local sessions.
      await this.repositoryIds(row.account.identityId, row.organizationId, true).catch(() => undefined)
    }
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
    const credential = await new GitHubCredentialService(this.db, this.provider).access(account.id, account.credential)
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
        const token = credential.token
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
              credential.expiresAt.getTime()
            )
          ),
        }
        await this.db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "GitHubUserAccount" WHERE "id" = ${account.id} FOR UPDATE`
          await tx.$queryRaw`SELECT "accountId" FROM "GitHubUserCredential" WHERE "accountId" = ${account.id} FOR UPDATE`
          const live = await tx.gitHubUserCredential.findUnique({ where: { accountId: account.id } })
          if (!live || live.accessExpiresAt <= new Date() || decryptGitHubUserTokens(account.id, live.encryptedTokens).accessToken !== token)
            throw new ForbiddenException('GitHub authorization changed during verification. Try again.')
          await tx.gitHubUserAccessEvidence.upsert({
            where: { accountId_organizationId: { accountId: account.id, organizationId } },
            create: { accountId: account.id, organizationId, ...data }, update: data,
          })
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
