import { digest } from '../assessments/assessment-digest.js'
import type { Prisma } from '../generated/prisma/client.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
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
import { loginReturnPath } from './auth-return-path.js'
import {
  GitHubIdentityProvider,
  githubLoginCallback,
  githubLoginEnabled,
} from './github-identity-provider.js'
import {
  encryptGitHubUserTokens,
  githubUserTokenEncryptionKey,
} from './github-token-cipher.js'
export { loginReturnPath } from './auth-return-path.js'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const opaque = () => randomBytes(32).toString('base64url')
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
      !/^[1-9]\d*$/.test(configurationValue('GITHUB_APP_ID') ?? '') ||
      !configurationValue('GITHUB_APP_CLIENT_ID') ||
      !configurationValue('GITHUB_APP_CLIENT_SECRET') ||
      !configurationValue('GITHUB_APP_PRIVATE_KEY')
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
  async begin(ip: string, rawReturn?: string, linkingSessionToken?: string, identitySessionToken?: string) {
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
    let identityLink: { linkingIdentity: true; linkingOwnerId: string; linkingSessionHash: string } | undefined
    if (identitySessionToken !== undefined) {
      if (linkingSessionToken !== undefined) throw new ForbiddenException('Choose one account linking action')
      const session = await this.recentLegacySession(identitySessionToken)
      identityLink = { linkingIdentity: true, linkingOwnerId: session.identityId, linkingSessionHash: hash(identitySessionToken) }
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
        ...identityLink,
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
    const returnPath = loginReturnPath(transaction.returnPath)
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
          linkingIdentity: transaction.linkingIdentity,
          linkingOrganizationId: transaction.linkingOrganizationId,
          linkingOwnerId: transaction.linkingOwnerId,
          linkingSessionHash: transaction.linkingSessionHash,
          accountId: account.id,
          tokenHash: hash(challengeToken),
          returnPath,
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
    return { challengeToken, linkingWorkspace: !!transaction.linkingOrganizationId, linkingIdentity: transaction.linkingIdentity }
  }
  private async recentLegacySession(sessionToken: string, db: Prisma.TransactionClient = this.db) {
    const session = await db.webSession.findFirst({
      where: { tokenHash: hash(sessionToken), expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - 300000) } },
      include: { identity: { include: { membership: true, githubAccounts: true } } },
    })
    if (!session || !session.identity.membership?.active || session.identity.membership.role === 'SUPER_ADMIN' ||
      ['https://github.com', 'preflyt://local'].includes(session.identity.issuer) || session.identity.githubAccounts.length)
      throw new ForbiddenException('Sign in again with your organization account, then link GitHub within five minutes. Super Admin stays separate.')
    return session
  }
  private async identityLinkPreview(raw: string | undefined, sessionToken: string | undefined, db: Prisma.TransactionClient = this.db) {
    if (!sessionToken) throw new UnauthorizedException('Sign in with your organization account first')
    const session = await this.recentLegacySession(sessionToken, db)
    if (!raw || raw.length > 512) throw new UnauthorizedException('Account linking expired. Start again.')
    const challenge = await db.gitHubOnboardingChallenge.findUnique({ where: { tokenHash: hash(raw) }, include: { account: { include: { identity: { include: { membership: true } } } } } })
    if (!challenge?.linkingIdentity || challenge.expiresAt <= new Date() || challenge.linkingOwnerId !== session.identityId || challenge.linkingSessionHash !== hash(sessionToken))
      throw new ForbiddenException('This account link belongs to another sign-in session or has expired')
    if (challenge.account.identityId === session.identityId || challenge.account.identity.issuer !== 'https://github.com' || challenge.account.identity.membership?.role === 'SUPER_ADMIN')
      throw new ConflictException('This GitHub account cannot be linked to your organization account')
    if (await db.identityLoginLink.count({ where: { OR: [
      { sourceIdentityId: { in: [session.identityId, challenge.account.identityId] } },
      { targetIdentityId: { in: [session.identityId, challenge.account.identityId] } },
    ] } })) throw new ConflictException('One of these accounts is already linked')
    const oldGrants = await db.organizationMembership.findMany({ where: { identityId: challenge.account.identityId, active: true }, orderBy: { id: 'asc' }, take: 101, select: { id: true, organizationId: true, role: true, updatedAt: true } })
    if (oldGrants.length > 100) throw new ConflictException('Too many existing access records to link safely')
    const targetGrants = await db.organizationMembership.findMany({ where: { identityId: session.identityId, active: true }, orderBy: { id: 'asc' }, take: 101, select: { id: true, organizationId: true, role: true, updatedAt: true } })
    if (targetGrants.length > 100) throw new ConflictException('Too many existing access records to link safely')
    for (const grant of oldGrants.filter(grant => grant.role === 'OWNER')) {
      const remainingOwner = await db.organizationMembership.count({ where: { organizationId: grant.organizationId, role: 'OWNER', active: true, identityId: { not: challenge.account.identityId } } })
      if (!remainingOwner) throw new ConflictException('Assign another workspace Owner before linking this account')
    }
    const details = { accountId: challenge.accountId, sourceIdentityId: challenge.account.identityId, targetIdentityId: session.identityId, githubUserId: challenge.account.githubUserId.toString(), login: challenge.account.login, oldGrants, targetGrants }
    return { session, challenge, details, previewHash: digest(details) }
  }
  async identityLinkStatus(sessionToken?: string) {
    const session = await this.auth.currentSession(sessionToken)
    if (!session.authenticated) throw new UnauthorizedException('Sign in first')
    const identity = await this.db.identity.findUniqueOrThrow({ where: { id: session.identityId }, include: { githubAccounts: true } })
    return { linked: !!identity.githubAccounts.length, canLink: this.enabled && !session.platformAdmin && identity.issuer !== 'https://github.com' && !identity.githubAccounts.length }
  }
  async identityLinkDetails(raw?: string, sessionToken?: string) {
    const { details, previewHash } = await this.identityLinkPreview(raw, sessionToken)
    return { login: details.login, previousAccessCount: details.oldGrants.length, retainedAccessCount: details.targetGrants.length, previewHash }
  }
  async confirmIdentityLink(raw: string | undefined, sessionToken: string | undefined, expectedHash: string, origin?: string) {
    this.auth.assertOrigin(origin)
    const { challenge } = await this.identityLinkPreview(raw, sessionToken)
    // Revalidate the provider credential before applying either proof; no browser identity claim is accepted.
    const { token } = await this.challenge(raw)
    const user = await this.provider.user(token)
    if (user.id !== challenge.account.githubUserId) throw new ForbiddenException('GitHub account changed. Start again.')
    await this.db.$transaction(async tx => {
      const ids = [challenge.account.identityId, challenge.linkingOwnerId!].sort()
      for (const id of ids) await tx.$queryRaw`SELECT id FROM "Identity" WHERE id = ${id} FOR UPDATE`
      const proof = await this.identityLinkPreview(raw, sessionToken, tx)
      if (proof.previewHash !== expectedHash) throw new ConflictException('Account access changed. Review the link again.')
      const used = await tx.gitHubOnboardingChallenge.deleteMany({ where: { id: proof.challenge.id, expiresAt: { gt: new Date() } } })
      if (used.count !== 1) throw new ConflictException('Account link has already been used')
      await tx.identityLoginLink.create({ data: { sourceIdentityId: proof.details.sourceIdentityId, targetIdentityId: proof.details.targetIdentityId, githubUserId: user.id } })
      await tx.gitHubUserAccount.update({ where: { id: proof.challenge.accountId }, data: { identityId: proof.session.identityId } })
      // Keep the legacy account's approved grants. Do not union two accounts' permissions.
      await tx.organizationMembership.updateMany({ where: { identityId: proof.details.sourceIdentityId, active: true }, data: { active: false } })
      await tx.membership.updateMany({ where: { identityId: proof.details.sourceIdentityId }, data: { active: false } })
      await tx.webSession.deleteMany({ where: { identityId: proof.details.sourceIdentityId } })
      await tx.gitHubUserAccessEvidence.deleteMany({ where: { accountId: proof.challenge.accountId } })
      await tx.auditEvent.create({ data: { event: 'github_identity_linked', actorId: proof.session.identityId, metadata: { sourceIdentityId: proof.details.sourceIdentityId, githubUserId: user.id.toString(), previousAccessCount: proof.details.oldGrants.length, retainedAccessCount: proof.details.targetGrants.length } } })
    }, { isolationLevel: 'Serializable' })
    return { linked: true }
  }
  async cancelIdentityLink(raw?: string, sessionToken?: string) {
    if (!raw || !sessionToken || raw.length > 512) return
    await this.db.gitHubOnboardingChallenge.deleteMany({ where: { tokenHash: hash(raw), linkingIdentity: true, linkingSessionHash: hash(sessionToken) } })
  }
  async isIdentityLinkCallback(state: string, binding?: string) {
    if (!state || state.length > 512 || !binding || binding.length > 512) return false
    const transaction = await this.db.gitHubLoginTransaction.findUnique({ where: { stateHash: hash(state) } })
    return !!transaction?.linkingIdentity && transaction.browserBindingHash === hash(binding)
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
    const credential = await new GitHubCredentialService(this.db, this.provider).access(challenge.accountId, challenge.account.credential)
    return { challenge, token: credential.token, accessExpiresAt: credential.expiresAt }
  }
  async organizations(raw?: string, existingSessionToken?: string) {
    const { challenge, token } = await this.challenge(raw)
    if (challenge.linkingIdentity) throw new ForbiddenException('Confirm account linking in Settings')
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
                ? await this.db.organizationMembership.count({ where: { organizationId: link.organizationId, role: 'OWNER', active: true } }) === 0 ? 'recovery_available' : grant?.active ? 'existing' : 'no_access'
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
    recoverOwner = false,
  ) {
    this.auth.assertOrigin(origin)
    if (!/^[1-9]\d{0,15}$/.test(installationId))
      throw new ForbiddenException('Invalid GitHub installation')
    const { challenge, token, accessExpiresAt } = await this.challenge(raw)
    if (challenge.linkingIdentity) throw new ForbiddenException('Confirm account linking in Settings')
    if (challenge.linkingOrganizationId) await this.assertLinkSession(challenge, existingSessionToken)
    const returnPath = loginReturnPath(
      challenge.linkingOrganizationId
        ? '/access-control?tab=github'
        : challenge.returnPath,
    )
    const verified = await this.provider.verify(
      token,
      BigInt(installationId),
      challenge.account.githubUserId,
    )
    const sessionToken = opaque(),
      expiresAt = new Date(
        Math.min(
          Date.now() + 28800000,
          accessExpiresAt.getTime(),
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
        if (recoverOwner) {
          await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${link.organizationId} FOR UPDATE`
          const owners = await tx.organizationMembership.count({ where: { organizationId: link.organizationId, role: 'OWNER', active: true } })
          if (!verified.owner || owners || challenge.linkingOrganizationId) throw new ForbiddenException('Recovery requires a verified GitHub organization owner and a workspace with no active Owner')
          if (!owners) {
            await tx.organizationMembership.upsert({
              where: { organizationId_identityId: { organizationId: link.organizationId, identityId: challenge.account.identityId } },
              create: { organizationId: link.organizationId, identityId: challenge.account.identityId, role: 'OWNER', active: true },
              update: { role: 'OWNER', active: true },
            })
            await tx.auditEvent.create({ data: { event: 'github_owner_recovered', actorId: challenge.account.identityId, metadata: { organizationId: link.organizationId, githubOrganizationId: verified.organizationId.toString(), installationId } } })
          }
        }
        const currentMember = await tx.organizationMembership.findUnique({ where: { organizationId_identityId: { organizationId: link.organizationId, identityId: challenge.account.identityId } } })
        if (!currentMember?.active)
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
              role: currentMember.role,
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
      returnPath,
    }
  }
}
