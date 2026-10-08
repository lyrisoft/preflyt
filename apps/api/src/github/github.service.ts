import { createHash, randomBytes } from 'node:crypto'
import {
  ForbiddenException,
  Inject,
  ServiceUnavailableException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
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
  ) {}

  async beginInstallation(identityId: string) {
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
    if (setupAction !== 'install') {
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
      throw new UnauthorizedException('GitHub authorization transaction is invalid')
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
      throw new UnauthorizedException('GitHub authorization transaction expired')
    }

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
      await tx.gitHubInstallation.upsert({
        where: { id: installation.id },
        create: {
          id: installation.id,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          repositorySelection: installation.repositorySelection,
          permissions: tokenPermissions,
          connectedById: transaction.identityId,
          active: true,
          lastVerifiedAt: new Date(),
        },
        update: {
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          repositorySelection: installation.repositorySelection,
          permissions: tokenPermissions,
          connectedById: transaction.identityId,
          active: true,
          lastVerifiedAt: new Date(),
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
    return { accountLogin: installation.accountLogin, repositoryCount: repositories.length }
  }

  async listRepositories() {
    const installations = await this.prisma.gitHubInstallation.findMany({
      where: { active: true },
    })
    for (const installation of installations) {
      try {
        await this.provider.verifyInstallation(installation.id)
        const currentRepositories =
          await this.provider.listInstallationRepositories(installation.id)
        await this.prisma.$transaction(async (tx) => {
          await tx.gitHubInstallation.update({
            where: { id: installation.id },
            data: { lastVerifiedAt: new Date() },
          })
          for (const repository of currentRepositories) {
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
              },
            })
          }
          const currentIds = currentRepositories.map((repository) => repository.id)
          if (currentIds.length) {
            await tx.gitHubRepository.updateMany({
              where: {
                installationId: installation.id,
                githubId: { notIn: currentIds },
                selected: true,
              },
              data: { selected: false },
            })
            await tx.gitHubRepository.deleteMany({
              where: {
                installationId: installation.id,
                githubId: { notIn: currentIds },
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
        })
      } catch (error) {
        if (!(error instanceof GitHubInstallationRevokedError)) {
          throw new ServiceUnavailableException(
            'GitHub is temporarily unavailable; repository access was not changed',
          )
        }
        await this.prisma.$transaction(async (tx) => {
          await tx.gitHubInstallation.update({
            where: { id: installation.id },
            data: { active: false, lastVerifiedAt: new Date() },
          })
          await tx.gitHubRepository.updateMany({
            where: { installationId: installation.id, selected: true },
            data: { selected: false },
          })
          await tx.auditEvent.create({
            data: {
              event: 'github_installation_unavailable',
              actorId: null,
              metadata: { installationId: installation.id.toString() },
            },
          })
        })
      }
    }

    const [repositories, allInstallations] = await Promise.all([
      this.prisma.gitHubRepository.findMany({
        where: { installation: { active: true } },
        select: {
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
        select: { id: true, accountLogin: true, active: true },
        orderBy: { accountLogin: 'asc' },
      }),
    ])
    return {
      installations: allInstallations.map((installation) => ({
        id: installation.id.toString(),
        accountLogin: installation.accountLogin,
        active: installation.active,
      })),
      repositories: repositories.map((repository) => ({
        ...repository,
        githubId: repository.githubId.toString(),
      })),
    }
  }

  async setRepositorySelected(
    identityId: string,
    rawRepositoryId: string,
    selected: boolean,
    origin: string | undefined,
  ) {
    this.assertOrigin(origin)
    const repositoryId = this.parseInstallationId(rawRepositoryId)
    const repository = await this.prisma.gitHubRepository.findUnique({
      where: { githubId: repositoryId },
      include: { installation: { select: { active: true } } },
    })
    if (!repository || !repository.installation.active) {
      throw new ForbiddenException('Repository is not available to a GitHub App installation')
    }
    await this.prisma.gitHubRepository.update({
      where: { githubId: repositoryId },
      data: { selected },
    })
    await this.audit('github_repository_selection_changed', identityId, {
      repositoryId: repositoryId.toString(),
      selected: String(selected),
    })
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
    const origin = process.env.WEB_ORIGIN
    if (!origin) throw new Error('WEB_ORIGIN is not configured')
    return new URL(origin).origin
  }

  private async findTransaction(
    state: string,
    browserBinding: string | undefined,
    phase: 'INSTALLATION' | 'USER_AUTHORIZATION',
  ) {
    if (!state || !browserBinding) {
      throw new UnauthorizedException('GitHub installation transaction is invalid')
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
      throw new UnauthorizedException('GitHub installation transaction expired or already used')
    }
    return transaction
  }

  private parseInstallationId(raw: string) {
    if (!/^\d{1,19}$/.test(raw)) {
      throw new UnauthorizedException('GitHub installation or repository ID is invalid')
    }
    const id = BigInt(raw)
    if (id <= 0n || BigInt(Number(id)) !== id) {
      throw new UnauthorizedException('GitHub installation or repository ID is invalid')
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
