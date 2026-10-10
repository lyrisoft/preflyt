import { GitHubCredentialService } from './github-credential.service.js'
import { createHash, randomBytes } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthService } from './auth.service.js'
import {
  GitHubIdentityProvider,
  githubLoginCallback,
  githubLoginEnabled,
} from './github-identity-provider.js'
import {
  encryptGitHubUserTokens,
  githubUserTokenEncryptionKey,
} from './github-token-cipher.js'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const opaque = () => randomBytes(32).toString('base64url')
export function loginReturnPath(raw?: string) {
  if (!raw) return '/'
  if (
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/u.test(raw) ||
    /%0[ad]|%5c/i.test(raw) ||
    raw.length > 2048
  )
    throw new ForbiddenException('Invalid sign-in return path')
  const parsed = new URL(raw, 'https://preflyt.invalid')
  if (parsed.origin !== 'https://preflyt.invalid')
    throw new ForbiddenException('Invalid sign-in return path')
  return parsed.pathname + parsed.search + parsed.hash
}
@Injectable()
export class GitHubLoginService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(GitHubIdentityProvider)
    private readonly provider: GitHubIdentityProvider,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  onModuleInit() {
    if (!githubLoginEnabled()) return
    githubLoginCallback()
    githubUserTokenEncryptionKey()
    if (
      !/^[1-9]\d*$/.test(process.env.GITHUB_APP_ID ?? '') ||
      !process.env.GITHUB_APP_CLIENT_ID ||
      !process.env.GITHUB_APP_CLIENT_SECRET ||
      !process.env.GITHUB_APP_PRIVATE_KEY
    )
      throw new Error(
        'GitHub login requires the App ID, client ID, client secret and private key',
      )
  }
  get enabled() {
    return githubLoginEnabled()
  }
  get transactionCookie() {
    return this.auth.secureCookie
      ? '__Host-preflyt.github-login'
      : 'preflyt.github-login'
  }
  get onboardingCookie() {
    return this.auth.secureCookie
      ? '__Host-preflyt.github-onboarding'
      : 'preflyt.github-onboarding'
  }
  private requireEnabled() {
    if (!this.enabled)
      throw new ServiceUnavailableException('GitHub sign-in is not enabled')
  }
  async begin(ip: string, rawReturn?: string, linkingSessionToken?: string) {
    this.requireEnabled()
    const returnPath = loginReturnPath(rawReturn)
    let linking:
      | {
          linkingOrganizationId: string
          linkingOwnerId: string
          linkingSessionHash: string
        }
      | undefined
    if (linkingSessionToken !== undefined) {
      const session = await this.auth.currentSession(linkingSessionToken)
      if (!session.authenticated || !session.organizationId)
        throw new ForbiddenException(
          'Sign in to the workspace you want to link first',
        )
      const owner = await this.db.organizationMembership.findUnique({
        where: {
          organizationId_identityId: {
            organizationId: session.organizationId,
            identityId: session.identityId,
          },
        },
      })
      if (!owner?.active || owner.role !== 'OWNER')
        throw new ForbiddenException(
          'A Preflyt workspace Owner must start organization linking',
        )
      // Super Admin sessions resolve a workspace through membership until a scope is chosen.
      // Persist that verified scope before binding the OAuth request to this session.
      const pinned = await this.db.webSession.updateMany({
        where: {
          tokenHash: hash(linkingSessionToken),
          identityId: owner.identityId,
          expiresAt: { gt: new Date() },
          OR: [{ activeOrganizationId: null }, { activeOrganizationId: owner.organizationId }],
        },
        data: { activeOrganizationId: owner.organizationId },
      })
      if (pinned.count !== 1)
        throw new ForbiddenException('Your workspace changed. Start linking again from Access Control.')
      linking = {
        linkingOrganizationId: owner.organizationId,
        linkingOwnerId: owner.identityId,
        linkingSessionHash: hash(linkingSessionToken),
      }
    }
    const windowStart = new Date(Math.floor(Date.now() / 600000) * 600000)
    const throttle = await this.db.authThrottle.upsert({
      where: {
        action_keyHash_windowStart: {
          action: 'github_login',
          keyHash: hash(ip),
          windowStart,
        },
      },
      create: {
        action: 'github_login',
        keyHash: hash(ip),
        windowStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
    })
    if (throttle.count > 20)
      throw new HttpException(
        'Too many sign-in attempts. Try again later.',
        429,
      )
    const state = opaque(),
      browserBinding = opaque(),
      codeVerifier = opaque()
    await this.db.gitHubLoginTransaction.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    })
    await this.db.gitHubOnboardingChallenge.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    })
    await this.db.gitHubUserCredential.deleteMany({
      where: { refreshExpiresAt: { lte: new Date() } },
    })
    await this.db.gitHubLoginTransaction.create({
      data: {
        ...linking,
        stateHash: hash(state),
        browserBindingHash: hash(browserBinding),
        codeVerifier,
        returnPath,
        expiresAt: new Date(Date.now() + 300000),
      },
    })
    return {
      browserBinding,
      url: this.provider.authorizationUrl(
        state,
        createHash('sha256').update(codeVerifier).digest('base64url'),
      ),
    }
  }
  async complete(state: string, binding: string | undefined, code: string) {
    this.requireEnabled()
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !binding ||
      !code ||
      code.length > 512
    )
      throw new UnauthorizedException('GitHub sign-in expired. Start again.')
    const transaction = await this.db.gitHubLoginTransaction.findUnique({
      where: { stateHash: hash(state) },
    })
    if (
      !transaction ||
      transaction.browserBindingHash !== hash(binding) ||
      transaction.expiresAt <= new Date()
    )
      throw new UnauthorizedException('GitHub sign-in expired. Start again.')
    const consumed = await this.db.gitHubLoginTransaction.deleteMany({
      where: {
        id: transaction.id,
        browserBindingHash: hash(binding),
        expiresAt: { gt: new Date() },
      },
    })
    if (consumed.count !== 1)
      throw new UnauthorizedException('GitHub sign-in has already been used')
    const tokens = await this.provider.exchange(code, transaction.codeVerifier)
    const user = await this.provider.user(tokens.accessToken)
    const challengeToken = opaque()
    await this.db.$transaction(async (tx) => {
      const existing = await tx.gitHubUserAccount.findUnique({
        where: {
          host_githubUserId: { host: 'github.com', githubUserId: user.id },
        },
      })
      let identityId = existing?.identityId
      if (!identityId) {
        // Numeric GitHub subject only. Email/login are never used to link OIDC identities.
        const identity = await tx.identity.upsert({
          where: {
            issuer_subject: {
              issuer: 'https://github.com',
              subject: user.id.toString(),
            },
          },
          create: {
            issuer: 'https://github.com',
            subject: user.id.toString(),
            displayName: user.displayName,
            membership: { create: { role: 'VIEWER' } },
          },
          update: {},
        })
        identityId = identity.id
      }
      const account = await tx.gitHubUserAccount.upsert({
        where: {
          host_githubUserId: { host: 'github.com', githubUserId: user.id },
        },
        create: {
          host: 'github.com',
          githubUserId: user.id,
          identityId,
          login: user.login,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          verifiedAt: new Date(),
        },
        update: {
          login: user.login,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          verifiedAt: new Date(),
        },
      })
      const data = {
        encryptedTokens: encryptGitHubUserTokens(account.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        }),
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      }
      await tx.gitHubUserCredential.upsert({
        where: { accountId: account.id },
        create: { accountId: account.id, ...data },
        update: data,
      })
      await tx.gitHubUserAccessEvidence.deleteMany({
        where: { accountId: account.id },
      })
      await tx.gitHubOnboardingChallenge.create({
        data: {
          linkingOrganizationId: transaction.linkingOrganizationId,
          linkingOwnerId: transaction.linkingOwnerId,
          linkingSessionHash: transaction.linkingSessionHash,
          accountId: account.id,
          tokenHash: hash(challengeToken),
          returnPath: transaction.returnPath,
          expiresAt: new Date(Date.now() + 600000),
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'github_identity_verified',
          actorId: account.identityId,
          metadata: { githubUserId: user.id.toString() },
        },
      })
    })
    return { challengeToken, linkingWorkspace: !!transaction.linkingOrganizationId }
  }
  async isWorkspaceLinkCallback(state: string, binding?: string) {
    if (!state || state.length > 512 || !binding || binding.length > 512) return false
    const transaction = await this.db.gitHubLoginTransaction.findUnique({
      where: { stateHash: hash(state) },
    })
    return !!transaction?.linkingOrganizationId && transaction.browserBindingHash === hash(binding)
  }
  async cancelWorkspaceLink(raw: string | undefined, sessionToken: string | undefined) {
    if (!raw || raw.length > 512 || !sessionToken) return
    await this.db.gitHubOnboardingChallenge.deleteMany({
      where: { tokenHash: hash(raw), linkingSessionHash: hash(sessionToken), linkingOrganizationId: { not: null } },
    })
  }
  private async assertLinkSession(
    challenge: { linkingOrganizationId: string | null; linkingOwnerId: string | null; linkingSessionHash: string | null },
    sessionToken?: string,
  ) {
    if (!sessionToken || hash(sessionToken) !== challenge.linkingSessionHash)
      throw new ForbiddenException('This link request belongs to another session. Start linking again from Access Control.')
    const current = await this.auth.currentSession(sessionToken)
    if (!current.authenticated || current.identityId !== challenge.linkingOwnerId || current.organizationId !== challenge.linkingOrganizationId || current.role !== 'OWNER')
      throw new ForbiddenException('Workspace ownership changed. Start linking again from Access Control.')
  }
  private async challenge(raw?: string) {
    this.requireEnabled()
    if (!raw || raw.length > 512)
      throw new UnauthorizedException('GitHub sign-in expired. Start again.')
    const challenge = await this.db.gitHubOnboardingChallenge.findUnique({
      where: { tokenHash: hash(raw) },
      include: { account: { include: { credential: true } } },
    })
    if (
      !challenge ||
      challenge.expiresAt <= new Date() ||
      !challenge.account.credential
    )
      throw new UnauthorizedException('GitHub sign-in expired. Start again.')
    return {
      challenge,
      token: (await new GitHubCredentialService(this.db, this.provider).access(challenge.accountId, challenge.account.credential)).token,
    }
  }
  async organizations(raw?: string, existingSessionToken?: string) {
    const { challenge, token } = await this.challenge(raw)
    if (challenge.linkingOrganizationId) await this.assertLinkSession(challenge, existingSessionToken)
    const installations = await this.provider.installations(token)
    return {
      login: challenge.account.login,
      linkingWorkspace: !!challenge.linkingOrganizationId,
      organizations: await Promise.all(
        installations.map(async (item) => {
          const link = await this.db.gitHubOrganizationLink.findUnique({
            where: {
              host_githubOrganizationId: {
                host: 'github.com',
                githubOrganizationId: item.organizationId,
              },
            },
          })
          const existing = await this.db.gitHubInstallation.findUnique({
            where: { id: item.id },
          })
          const grant =
            link &&
            (await this.db.organizationMembership.findUnique({
              where: {
                organizationId_identityId: {
                  organizationId: link.organizationId,
                  identityId: challenge.account.identityId,
                },
              },
            }))
          return {
            installationId: item.id.toString(),
            login: item.login,
            state: challenge.linkingOrganizationId
              ? existing?.organizationId === challenge.linkingOrganizationId &&
                existing.active &&
                (!link ||
                  link.organizationId === challenge.linkingOrganizationId)
                ? 'link_existing'
                : 'unavailable'
              : link
                ? grant?.active
                  ? 'existing'
                  : 'no_access'
                : existing
                  ? 'migration_required'
                  : 'new',
          }
        }),
      ),
    }
  }
  async enter(
    raw: string | undefined,
    installationId: string,
    origin?: string,
    existingSessionToken?: string,
  ) {
    this.auth.assertOrigin(origin)
    if (!/^[1-9]\d{0,15}$/.test(installationId))
      throw new ForbiddenException('Invalid GitHub installation')
    const { challenge, token } = await this.challenge(raw)
    if (challenge.linkingOrganizationId) await this.assertLinkSession(challenge, existingSessionToken)
    const verified = await this.provider.verify(
      token,
      BigInt(installationId),
      challenge.account.githubUserId,
    )
    const sessionToken = opaque(),
      expiresAt = new Date(
        Math.min(
          Date.now() + 28800000,
          challenge.account.credential!.accessExpiresAt.getTime(),
        ),
      )
    try {
      await this.db.$transaction(async (tx) => {
        // Serialize first-owner claims by stable organization ID across API instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${verified.organizationId})`
        const consumed = await tx.gitHubOnboardingChallenge.deleteMany({
          where: { id: challenge.id, expiresAt: { gt: new Date() } },
        })
        if (consumed.count !== 1)
          throw new UnauthorizedException(
            'GitHub sign-in has already been used',
          )
        const existing = await tx.gitHubInstallation.findUnique({
          where: { id: verified.installation.id },
        })
        let link = await tx.gitHubOrganizationLink.findUnique({
          where: {
            host_githubOrganizationId: {
              host: 'github.com',
              githubOrganizationId: verified.organizationId,
            },
          },
        })
        if (challenge.linkingOrganizationId) {
          if (
            !verified.owner ||
            !existing?.active ||
            existing.organizationId !== challenge.linkingOrganizationId ||
            existing.accountType !== 'Organization'
          )
            throw new ForbiddenException(
              'Linking requires the GitHub organization owner and this workspace’s existing active installation',
            )
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${challenge.linkingOrganizationId} FOR UPDATE`
          const localOwner = await tx.organizationMembership.findUnique({
            where: {
              organizationId_identityId: {
                organizationId: challenge.linkingOrganizationId,
                identityId: challenge.linkingOwnerId!,
              },
            },
          })
          const boundSession = await tx.webSession.findUnique({
            where: { tokenHash: challenge.linkingSessionHash! },
          })
          const boundOrganizationId = boundSession?.activeOrganizationId ?? (
            boundSession && await tx.organizationMembership.findFirst({
              where: { identityId: boundSession.identityId, active: true },
              orderBy: { createdAt: 'asc' },
            })
          )?.organizationId
          if (
            !localOwner?.active ||
            localOwner.role !== 'OWNER' ||
            !boundSession ||
            boundSession.identityId !== localOwner.identityId ||
            boundOrganizationId !== localOwner.organizationId ||
            boundSession.expiresAt <= new Date()
          )
            throw new ForbiddenException(
              'Workspace ownership or the original session is no longer valid',
            )
          const organizationLink = await tx.gitHubOrganizationLink.findUnique({
            where: { organizationId: challenge.linkingOrganizationId },
          })
          if (
            (link && link.organizationId !== challenge.linkingOrganizationId) ||
            (organizationLink &&
              organizationLink.githubOrganizationId !== verified.organizationId)
          )
            throw new ConflictException(
              'This organization is already linked to another workspace',
            )
          if (!link)
            link = await tx.gitHubOrganizationLink.create({
              data: {
                host: 'github.com',
                githubOrganizationId: verified.organizationId,
                organizationId: challenge.linkingOrganizationId,
                login: verified.login,
                verifiedAt: new Date(),
              },
            })
          await tx.organizationMembership.upsert({
            where: {
              organizationId_identityId: {
                organizationId: challenge.linkingOrganizationId,
                identityId: challenge.account.identityId,
              },
            },
            create: {
              organizationId: challenge.linkingOrganizationId,
              identityId: challenge.account.identityId,
              role: 'OWNER',
              active: true,
            },
            update: { role: 'OWNER', active: true },
          })
          await tx.gitHubInstallation.update({
            where: { id: existing.id },
            data: {
              lastVerifiedAt: new Date(),
              accountLogin: verified.login,
              permissions: verified.installation.permissions,
            },
          })
          await tx.auditEvent.create({
            data: {
              event: 'github_existing_workspace_linked',
              actorId: localOwner.identityId,
              metadata: {
                organizationId: challenge.linkingOrganizationId,
                githubOrganizationId: verified.organizationId.toString(),
                githubOwnerIdentityId: challenge.account.identityId,
                installationId: existing.id.toString(),
              },
            },
          })
        }
        if (!link) {
          if (existing)
            throw new ConflictException(
              'This organization already has a Preflyt connection. Ask its Owner to migrate it to GitHub login.',
            )
          if (!verified.owner)
            throw new ForbiddenException(
              'A GitHub organization owner must connect this workspace first',
            )
          const organization = await tx.organization.create({
            data: { name: verified.login },
          })
          link = await tx.gitHubOrganizationLink.create({
            data: {
              host: 'github.com',
              githubOrganizationId: verified.organizationId,
              organizationId: organization.id,
              login: verified.login,
              verifiedAt: new Date(),
            },
          })
          await tx.organizationMembership.create({
            data: {
              organizationId: organization.id,
              identityId: challenge.account.identityId,
              role: 'OWNER',
            },
          })
          await tx.gitHubInstallation.create({
            data: {
              id: verified.installation.id,
              organizationId: organization.id,
              accountLogin: verified.login,
              accountType: 'Organization',
              repositorySelection: verified.installation.repositorySelection,
              permissions: verified.installation.permissions,
              connectedById: challenge.account.identityId,
              active: true,
              lastVerifiedAt: new Date(),
            },
          })
          await tx.auditEvent.create({
            data: {
              event: 'github_organization_owner_claimed',
              actorId: challenge.account.identityId,
              metadata: {
                organizationId: organization.id,
                githubOrganizationId: verified.organizationId.toString(),
              },
            },
          })
        } else if (
          !existing?.active ||
          existing.organizationId !== link.organizationId
        )
          throw new ForbiddenException(
            'GitHub installation access is unavailable for this workspace',
          )
        const member = await tx.organizationMembership.findUnique({
          where: {
            organizationId_identityId: {
              organizationId: link.organizationId,
              identityId: challenge.account.identityId,
            },
          },
        })
        if (!member?.active)
          throw new ForbiddenException(
            'Your administrator has not granted you Preflyt access yet',
          )
        const installation = await tx.gitHubInstallation.findUniqueOrThrow({
          where: { id: verified.installation.id },
        })
        const evidence = {
          installationId: installation.id,
          accessRevision: installation.accessRevision,
          repositoryGithubIds: verified.repositoryIds,
          verifiedAt: new Date(),
          expiresAt: new Date(
            Math.min(Date.now() + 300000, expiresAt.getTime()),
          ),
        }
        await tx.gitHubUserAccessEvidence.upsert({
          where: {
            accountId_organizationId: {
              accountId: challenge.accountId,
              organizationId: link.organizationId,
            },
          },
          create: {
            accountId: challenge.accountId,
            organizationId: link.organizationId,
            ...evidence,
          },
          update: evidence,
        })
        await tx.webSession.create({
          data: {
            identityId: challenge.account.identityId,
            activeOrganizationId: link.organizationId,
            tokenHash: hash(sessionToken),
            expiresAt,
          },
        })
        await tx.auditEvent.create({
          data: {
            event: 'github_login_succeeded',
            actorId: challenge.account.identityId,
            metadata: {
              organizationId: link.organizationId,
              role: member.role,
            },
          },
        })
      })
    } catch (error) {
      await this.db.auditEvent.create({
        data: {
          event: 'github_login_denied',
          actorId: challenge.account.identityId,
          metadata: {
            reason:
              error instanceof ForbiddenException
                ? 'access_denied'
                : 'onboarding_failed',
          },
        },
      })
      throw error
    }
    return {
      sessionToken,
      expiresAt,
      returnPath: challenge.linkingOrganizationId
        ? '/access-control?tab=github'
        : challenge.returnPath,
    }
  }
}
