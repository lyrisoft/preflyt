import { latestRepositoryIds } from '../prisma/latest-repository-rows.js'
import { RepositoryHealthService } from '../health/repository-health.service.js'
import { RepositoryProfileService } from './repository-profile.service.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
import { createHash, randomBytes } from 'node:crypto'
import {
  ForbiddenException,
  ConflictException,
  Inject,
  ServiceUnavailableException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common'
import { GitHubSyncService } from './github-sync.service.js'
import { GitHubRateLimitError } from './github-rate-limit.js'
import { RedisCacheService } from '../cache/redis-cache.service.js'
import { resolveWebOrigin } from '../config/web-origin.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { profileTechnologies } from '../dashboard/dashboard-summary.js'
import {
  GitHubInstallationRevokedError,
  GitHubProviderService,
  type GitHubInstallationInfo,
} from './github-provider.service.js'

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const opaque = () => randomBytes(32).toString('base64url')
const transactionTtlMs = 10 * 60 * 1000
const tokenPermissions = { metadata: 'read', contents: 'read' }

@Injectable()
export class GitHubService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GitHubProviderService)
    private readonly provider: GitHubProviderService,
    @Optional()
    @Inject(RedisCacheService)
    private readonly cache?: RedisCacheService,
    @Optional() @Inject(RepositoryProfileService) private readonly profiles?: RepositoryProfileService,
    @Optional() @Inject(RepositoryHealthService) private readonly health?: RepositoryHealthService,
  ) {}

  async beginInstallation(identityId: string,
    organizationId = 'preflyt-default',
  ) {
    const state = opaque()
    const browserBinding = opaque()
    await this.prisma.gitHubSetupTransaction.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    })
    await this.prisma.gitHubSetupTransaction.create({
      data: {
        stateHash: digest(state),
        browserBindingHash: digest(browserBinding),
        identityId,
        organizationId,
        expiresAt: new Date(Date.now() + transactionTtlMs),
      },
    })
    return {
      url: await this.provider.createInstallationUrl(state),
      browserBinding,
    }
  }

  async beginUserAuthorization(
    state: string,
    browserBinding: string | undefined,
    rawInstallationId: string,
    setupAction: string | undefined,
  ) {
    const transaction = await this.findTransaction(
      state,
      browserBinding,
      'INSTALLATION',
    )
    if (setupAction !== 'install' && setupAction !== 'update') {
      await this.audit('github_installation_denied', transaction.identityId, {
        reason: 'unexpected_setup_action',
      })
      throw new UnauthorizedException('GitHub installation flow is invalid')
    }
    const installationId = this.parseInstallationId(rawInstallationId)
    let installation: GitHubInstallationInfo
    try {
      installation = await this.provider.verifyInstallation(installationId)
    } catch (error) {
      await this.audit('github_installation_denied', transaction.identityId, {
        reason: 'installation_not_owned_by_configured_app',
      })
      throw error
    }
    const oauthState = opaque()
    const codeVerifier = opaque()
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
    const changed = await this.prisma.gitHubSetupTransaction.updateMany({
      where: {
        id: transaction.id,
        stateHash: digest(state),
        browserBindingHash: digest(browserBinding!),
        phase: 'INSTALLATION',
        expiresAt: { gt: new Date() },
      },
      data: {
        stateHash: digest(oauthState),
        phase: 'USER_AUTHORIZATION',
        installationId: installation.id,
        codeVerifier,
      },
    })
    if (changed.count !== 1) {
      await this.audit('github_installation_denied', transaction.identityId, {
        reason: 'replayed_installation_callback',
      })
      throw new UnauthorizedException('GitHub installation flow expired')
    }
    return this.provider.createUserAuthorizationUrl(oauthState, codeChallenge)
  }

  async completeUserAuthorization(
    state: string,
    browserBinding: string | undefined,
    code: string,
  ) {
    const transaction = await this.findTransaction(
      state,
      browserBinding,
      'USER_AUTHORIZATION',
    )
    if (!transaction.installationId || !transaction.codeVerifier) {
      throw new UnauthorizedException(
        'GitHub authorization transaction is invalid',
      )
    }
    const consumed = await this.prisma.gitHubSetupTransaction.deleteMany({
      where: {
        id: transaction.id,
        stateHash: digest(state),
        browserBindingHash: digest(browserBinding!),
        phase: 'USER_AUTHORIZATION',
        expiresAt: { gt: new Date() },
      },
    })
    if (consumed.count !== 1) {
      await this.audit('github_installation_denied', transaction.identityId, {
        reason: 'replayed_user_authorization',
      })
      throw new UnauthorizedException(
        'GitHub authorization transaction expired',
      )
    }

    const beforeAccess = await this.prisma.gitHubInstallation.findUnique({
      where: { id: transaction.installationId },
      select: { accessRevision: true },
    })
    const installation = await this.provider.verifyInstallation(
      transaction.installationId,
    )
    let userToken: string
    try {
      userToken = await this.provider.exchangeUserCode(
        code,
        transaction.codeVerifier,
      )
    } catch (error) {
      await this.audit('github_installation_denied', transaction.identityId, {
        reason: 'user_authorization_failed',
      })
      throw error
    }
    try {
      await this.provider.userCanAccessInstallation(
        userToken,
        transaction.installationId,
      )
    } catch (error) {
      await this.audit('github_installation_denied', transaction.identityId, {
        reason: 'installer_cannot_access_installation',
      })
      throw error
    } finally {
      await this.provider.revokeUserToken(userToken)
    }

    const repositories = await this.provider.listInstallationRepositories(
      transaction.installationId,
    )
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.organizationMembership.findFirst({
        where: {
          identityId: transaction.identityId,
          organizationId: transaction.organizationId,
          active: true,
          role: { in: ['OWNER', 'ADMIN', 'ENGINEERING_LEAD'] },
        },
      })
      if (!member)
        throw new ForbiddenException(
          'Organization connection permission was revoked',
        )
      const existingInstallation = await tx.gitHubInstallation.findUnique({
        where: { id: installation.id },
      })
      if (
        existingInstallation &&
        existingInstallation.organizationId !== transaction.organizationId
      )
        throw new ForbiddenException(
          'Installation belongs to another organization',
        )
      if (beforeAccess) {
        const locked = await tx.gitHubInstallation.updateMany({
          where: {
            id: installation.id,
            accessRevision: beforeAccess.accessRevision,
          },
          data: { accessRevision: { increment: 0 } },
        })
        if (!locked.count)
          throw new ConflictException(
            'GitHub access changed during connection; retry setup',
          )
      }
      const current = await tx.gitHubInstallation.findUnique({
        where: { id: installation.id },
        select: { accessRevision: true },
      })
      if (current?.accessRevision !== beforeAccess?.accessRevision)
        throw new ConflictException(
          'GitHub access changed during connection; retry setup',
        )
      await tx.gitHubInstallation.upsert({
        where: { id: installation.id },
        create: {
          id: installation.id,
          organizationId: transaction.organizationId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          repositorySelection: installation.repositorySelection,
          permissions: tokenPermissions,
          connectedById: transaction.identityId,
          active: true,
          lastVerifiedAt: new Date(),
          syncState: 'OK',
          lastSyncAttemptAt: new Date(),
        },
        update: {
          accessRevision: { increment: 1 },
          syncLeaseUntil: null,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          repositorySelection: installation.repositorySelection,
          permissions: tokenPermissions,
          connectedById: transaction.identityId,
          active: true,
          lastVerifiedAt: new Date(),
          syncState: 'OK',
          lastSyncAttemptAt: new Date(),
        },
      })
      for (const repository of repositories) {
        await tx.gitHubRepository.upsert({
          where: { githubId: repository.id },
          create: {
            githubId: repository.id,
            name: repository.name,
            fullName: repository.fullName,
            ownerLogin: repository.ownerLogin,
            defaultBranch: repository.defaultBranch,
            isPrivate: repository.isPrivate,
            installationId: installation.id,
          },
          update: {
            name: repository.name,
            fullName: repository.fullName,
            ownerLogin: repository.ownerLogin,
            defaultBranch: repository.defaultBranch,
            isPrivate: repository.isPrivate,
            installationId: installation.id,
            available: true,
          },
        })
      }
      const repositoryIds = repositories.map((repository) => repository.id)
      if (repositoryIds.length) {
        await tx.gitHubRepository.updateMany({
          where: {
            installationId: installation.id,
            githubId: { notIn: repositoryIds },
            selected: true,
          },
          data: { selected: false },
        })
        await tx.gitHubRepository.deleteMany({
          where: {
            installationId: installation.id,
            githubId: { notIn: repositoryIds },
            selected: false,
          },
        })
      } else {
        await tx.gitHubRepository.updateMany({
          where: { installationId: installation.id, selected: true },
          data: { selected: false },
        })
        await tx.gitHubRepository.deleteMany({
          where: { installationId: installation.id, selected: false },
        })
      }
      await tx.auditEvent.create({
        data: {
          event: 'github_installation_connected',
          actorId: transaction.identityId,
          metadata: {
            installationId: installation.id.toString(),
            repositoryCount: repositories.length,
          },
        },
      })
    })
    await this.cache?.delete(this.inventoryKey(installation.id))
    return {
      accountLogin: installation.accountLogin,
      repositoryCount: repositories.length,
    }
  }

  async listRepositories(refresh = false,
    scope?: bigint[],
    organizationId?: string,
    organizationAdmin = false,
  ) {
    if (!refresh) return this.repositoryOverview(scope, organizationId, organizationAdmin)
    const installations = await this.prisma.gitHubInstallation.findMany({
      where: { ...(organizationId ? { organizationId } : {}) },
      select: { id: true },
    })
    const sync = new GitHubSyncService(this.prisma, this.provider)
    for (const installation of installations) {
      try {
        await sync.sync(installation.id)
      } catch (error) {
        if (error instanceof GitHubRateLimitError) throw error
        if (!(error instanceof GitHubInstallationRevokedError))
          throw new ServiceUnavailableException(
            'GitHub is temporarily unavailable; repository access was not changed',
          )
      }
    }

    // Refreshing inventory never widens the caller's verified repository scope.
    return this.repositoryOverview(scope, organizationId, organizationAdmin)
  }

  // Last-synced display data only. No upstream calls and no permission grants.
  async repositoryOverview(scope?: bigint[],
    organizationId?: string,
    organizationAdmin = false,
  ) {
    const [repositories, allInstallations] = await Promise.all([
      this.prisma.gitHubRepository.findMany({
        where: { ...(scope ? { githubId: { in: scope } } : {}),
          available: true, installation: { active: true ,
            ...(organizationId ? { organizationId } : {}),
          },
        },
        select: {
          id: true,
          githubId: true,
          name: true,
          fullName: true,
          ownerLogin: true,
          defaultBranch: true,
          isPrivate: true,
          selected: true,
          installation: { select: { accountLogin: true } },

        },
        orderBy: [{ ownerLogin: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.gitHubInstallation.findMany({
        where: {
          ...(organizationId ? { organizationId } : {}),
          ...(scope && !organizationAdmin
            ? { repositories: { some: { githubId: { in: scope } } } }
            : {}),
        },
        select: {
          id: true,
          accountLogin: true,
          active: true,
          syncState: true,
          lastVerifiedAt: true,
          lastSyncAttemptAt: true,
        },
        orderBy: { accountLogin: 'asc' },
      }),
    ])
    const profileIds = await latestRepositoryIds(this.prisma, 'RepositoryProfile', repositories.filter(r => r.selected).map(r => r.id))
    const profiles = await this.prisma.repositoryProfile.findMany({where: {id: {in: profileIds}}, select: {repositoryId:true,report:true,createdAt:true,sourceSha:true}})
    const byRepository = new Map(profiles.map(row => [row.repositoryId, row]))
    return {
      installations: allInstallations.map((installation) => ({
        id: installation.id.toString(),
        syncState: installation.syncState,
        lastVerifiedAt: installation.lastVerifiedAt,
        lastSyncAttemptAt: installation.lastSyncAttemptAt,
        accountLogin: installation.accountLogin,
        active: installation.active,
      })),
      repositories: repositories.map(({ id, ...repository }) => {
        const profile = repository.selected ? byRepository.get(id) : undefined
        return {
          ...repository,
          githubId: repository.githubId.toString(),
          technologies: profileTechnologies(profile?.report),
          profiledAt: profile?.createdAt ?? null,
          profileSha: profile?.sourceSha ?? null,
        }
      }),
    }
  }

  async setRepositorySelected(
    identityId: string,
    rawRepositoryId: string,
    selected: boolean,
    origin: string | undefined,
    organizationId?: string,
  ) {
    this.assertOrigin(origin)
    const repositoryId = this.parseInstallationId(rawRepositoryId)
    const repository = await this.prisma.gitHubRepository.findUnique({
      where: { githubId: repositoryId },
      include: { installation: { select: { active: true } } },
    })
    if (!repository || !repository.installation.active) {
      throw new ForbiddenException(
        'Repository is not available to a GitHub App installation',
      )
    }
    if (selected) {
      // Cached inventory is discovery metadata, never permission to select a repository.
      await this.provider.verifyRepositoryAccess(
        repository.installationId,
        repositoryId,
      )
    }
    const updateSelection = async (tx: typeof this.prisma) => {
      const member = organizationId ? await tx.organizationMembership.findUnique({
        where: { organizationId_identityId: { organizationId, identityId } },
      }) : null
      if (organizationId && (!member?.active || !['OWNER', 'ADMIN', 'ENGINEERING_LEAD'].includes(member.role)))
        throw new ForbiddenException('Repository management permission changed. Reload repositories.')
      const changed = await tx.gitHubRepository.updateMany({
        where: { githubId: repositoryId, installationId: repository.installationId,
          available: true, installation: { active: true, ...(organizationId ? { organizationId } : {}) } },
        data: { selected },
      })
      if (changed.count !== 1) throw new ForbiddenException('Repository access changed; reload repositories')
      // Selecting a repository grants its Engineering Lead access to that
      // repository only; it never makes the role organization-wide.
      if (selected && member?.role === 'ENGINEERING_LEAD') {
        await tx.repositoryGrant.upsert({
          where: { membershipId_repositoryId: { membershipId: member.id, repositoryId: repository.id } },
          create: { membershipId: member.id, repositoryId: repository.id }, update: {},
        })
        await tx.auditEvent.create({ data: { event: 'repository_selection_access_granted', actorId: identityId,
          metadata: { organizationId, repositoryId: rawRepositoryId, membershipId: member.id } } })
      }
    }
    if (organizationId) await this.prisma.$transaction(tx => updateSelection(tx as typeof this.prisma), { isolationLevel: 'Serializable' })
    else await updateSelection(this.prisma)
    if (!selected) await this.prisma.contributorSyncState.updateMany({where:{repositoryId:repository.id},data:{state:'QUEUED',attempts:0,nextAttemptAt:new Date(),leaseToken:null,leaseUntil:null,failureCode:null}})
    await this.audit('github_repository_selection_changed', identityId, {
      repositoryId: repositoryId.toString(),
      selected: String(selected),
    })
    if (selected && this.health) {
      try {
        const assessment = await this.health.initial(identityId, rawRepositoryId)
        return { inspection: ['QUEUED','RUNNING'].includes(assessment.state) ? 'QUEUED' : 'READY', message: 'Repository selected. Open Health to follow its assessment.' }
      } catch {
        return { inspection: 'RETRY', message: 'Repository selected. Health could not be queued; open Health and start an assessment.' }
      }
    }
    if (selected && this.profiles) {
      try {
        const existing = await this.prisma.repositoryProfile.findFirst({ where: { repositoryId: repository.id }, select: { id: true } })
        if (!existing) await this.profiles.discover(rawRepositoryId, identityId, origin)
      } catch { return { inspection: 'RETRY', message: 'Repository selected. Inspection could not finish; open the repository and retry Refresh profile.' } }
    }
    return { inspection: selected ? 'READY' : null }
  }

  private inventoryKey(installationId: bigint) {
    return `github:${configurationValue('GITHUB_APP_ID') ?? 'unconfigured'}:installation:${installationId}:repositories`
  }

  get setupCookieName() {
    return this.secureCookie ? '__Host-preflyt.github' : 'preflyt.github'
  }

  get secureCookie() {
    return !(
      process.env.COOKIE_SECURE === 'false' &&
      process.env.NODE_ENV !== 'production'
    )
  }

  get frontendOrigin() {
    return resolveWebOrigin()
  }

  private async findTransaction(
    state: string,
    browserBinding: string | undefined,
    phase: 'INSTALLATION' | 'USER_AUTHORIZATION',
  ) {
    if (!state || !browserBinding) {
      throw new UnauthorizedException(
        'GitHub installation transaction is invalid',
      )
    }
    const transaction = await this.prisma.gitHubSetupTransaction.findFirst({
      where: {
        stateHash: digest(state),
        browserBindingHash: digest(browserBinding),
        phase,
        expiresAt: { gt: new Date() },
      },
    })
    if (!transaction) {
      await this.audit('github_installation_denied', null, {
        reason: 'invalid_state_or_browser_binding',
      })
      throw new UnauthorizedException(
        'GitHub installation transaction expired or already used',
      )
    }
    return transaction
  }

  private parseInstallationId(raw: string) {
    if (!/^\d{1,19}$/.test(raw)) {
      throw new UnauthorizedException(
        'GitHub installation or repository ID is invalid',
      )
    }
    const id = BigInt(raw)
    if (id <= 0n || BigInt(Number(id)) !== id) {
      throw new UnauthorizedException(
        'GitHub installation or repository ID is invalid',
      )
    }
    return id
  }

  private assertOrigin(origin: string | undefined) {
    if (!origin || origin !== this.frontendOrigin) {
      throw new ForbiddenException('Request origin is not allowed')
    }
  }

  private async audit(
    event: string,
    actorId: string | null,
    metadata: Record<string, string | number>,
  ) {
    await this.prisma.auditEvent.create({ data: { event, actorId, metadata } })
  }
}
