import { githubLoginEnabled } from './github-identity-provider.js'
import { rolePermissions } from './authorization.service.js'
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
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
import * as oidc from 'openid-client'
import type { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service.js'

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const opaque = () => randomBytes(32).toString('base64url')
const sessionTtlMs = 8 * 60 * 60 * 1000
const superAdminSessionTtlMs = 24 * 60 * 60 * 1000
const shortTtlMs = 5 * 60 * 1000
const superAdminIssuer = 'preflyt://local'
const superAdminSubject = 'super-admin'
const superAdminCredentialId = 'primary'
const superAdminScryptCost = 32768
const superAdminScryptBlockSize = 8
const superAdminScryptParallelization = 1
const superAdminScryptKeyLength = 64
const superAdminScryptMaxMemory = 64 * 1024 * 1024

type ParsedScryptHash = { salt: Buffer; key: Buffer }

const parseScryptHash = (value: string): ParsedScryptHash => {
  const parts = value.split('$')
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== String(superAdminScryptCost) ||
    parts[2] !== String(superAdminScryptBlockSize) ||
    parts[3] !== String(superAdminScryptParallelization)
  ) {
    throw new Error(
      'Stored Super Admin password hash has an unsupported format'
    )
  }
  const salt = Buffer.from(parts[4]!, 'base64url')
  const key = Buffer.from(parts[5]!, 'base64url')
  if (
    salt.length !== 16 ||
    key.length !== superAdminScryptKeyLength ||
    salt.toString('base64url') !== parts[4] ||
    key.toString('base64url') !== parts[5]
  ) {
    throw new Error(
      'Stored Super Admin password hash has an unsupported format'
    )
  }
  return { salt, key }
}

const deriveScryptKey = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      superAdminScryptKeyLength,
      {
        N: superAdminScryptCost,
        r: superAdminScryptBlockSize,
        p: superAdminScryptParallelization,
        maxmem: superAdminScryptMaxMemory,
      },
      (error, key) => (error ? reject(error) : resolve(key as Buffer))
    )
  })

@Injectable()
export class AuthService implements OnModuleInit {
  private config?: oidc.Configuration
  private readonly issuer?: URL
  private readonly clientId?: string
  private readonly clientSecret?: string
  private readonly redirectUri?: URL
  private readonly webOrigin: string
  private readonly bootstrapHash?: string
  private readonly superAdminUsername?: string
  private readonly superAdminPassword?: string

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const issuer = process.env.OIDC_ISSUER
    const clientId = process.env.OIDC_CLIENT_ID
    const clientSecret = process.env.OIDC_CLIENT_SECRET
    const redirectUri = process.env.OIDC_REDIRECT_URI
    const webOrigin = process.env.WEB_ORIGIN
    const bootstrapHash = process.env.BOOTSTRAP_TOKEN_SHA256
    const superAdminUsername =
      process.env.SUPER_ADMIN_USERNAME?.trim().toLowerCase()
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD
    if (Boolean(superAdminUsername) !== Boolean(superAdminPassword)) {
      throw new Error(
        'SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD must be configured together'
      )
    }
    if (
      superAdminUsername &&
      !/^[^\s\u0000-\u001f\u007f]{1,320}$/u.test(superAdminUsername)
    ) {
      throw new Error(
        'SUPER_ADMIN_USERNAME must be 1-320 characters without whitespace or control characters'
      )
    }
    if (
      superAdminPassword &&
      (superAdminPassword.length < 24 || superAdminPassword.length > 128)
    ) {
      throw new Error(
        'SUPER_ADMIN_PASSWORD must be between 24 and 128 characters'
      )
    }
    this.superAdminUsername = superAdminUsername || undefined
    this.superAdminPassword = superAdminPassword || undefined

    const oidcSettings = [issuer, clientId, clientSecret, redirectUri]
    const oidcHasAnySettings = oidcSettings.some(Boolean)
    const oidcIsConfigured = oidcSettings.every(Boolean)
    if (oidcHasAnySettings && !oidcIsConfigured) {
      throw new Error(
        'OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI must be configured together'
      )
    }
    if (!oidcIsConfigured && !this.superAdminEnabled && !githubLoginEnabled()) {
      throw new Error(
        'Configure GitHub login, OIDC or a Super Admin username and password to start Preflyt'
      )
    }

    const resolvedWebOrigin =
      webOrigin ??
      (process.env.NODE_ENV !== 'production'
        ? 'http://localhost:5173'
        : undefined)
    if (!resolvedWebOrigin) {
      throw new Error('WEB_ORIGIN is required in production')
    }
    this.webOrigin = new URL(resolvedWebOrigin).origin

    if (oidcIsConfigured) {
      if (!bootstrapHash || !/^[a-f0-9]{64}$/i.test(bootstrapHash)) {
        throw new Error(
          'BOOTSTRAP_TOKEN_SHA256 must be a SHA-256 hex digest when OIDC is configured'
        )
      }
      this.issuer = new URL(issuer!)
      if (
        this.issuer.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(this.issuer.hostname)
        )
      ) {
        throw new Error('OIDC_ISSUER must use HTTPS except for a local issuer')
      }
      this.redirectUri = new URL(redirectUri!)
      if (
        this.redirectUri.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(
            this.redirectUri.hostname
          )
        )
      ) {
        throw new Error('OIDC_REDIRECT_URI must use HTTPS except on localhost')
      }
      if (this.redirectUri.search || this.redirectUri.hash) {
        throw new Error('OIDC_REDIRECT_URI cannot contain query or fragment')
      }
      this.clientId = clientId
      this.clientSecret = clientSecret
      this.bootstrapHash = bootstrapHash.toLowerCase()
    }
  }

  async onModuleInit() {
    if (!this.issuer) {
      await this.seedSuperAdmin()
      return
    }
    const localDevelopmentIssuer =
      process.env.NODE_ENV !== 'production' &&
      this.issuer.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(this.issuer.hostname)
    const execute: Array<(config: oidc.Configuration) => void> = [
      oidc.enableNonRepudiationChecks,
    ]
    if (localDevelopmentIssuer) execute.push(oidc.allowInsecureRequests)
    this.config = await oidc.discovery(
      this.issuer,
      this.clientId!,
      this.clientSecret!,
      undefined,
      { execute }
    )
    if (
      new URL(this.config.serverMetadata().issuer).href !== this.issuer.href
    ) {
      throw new Error('OIDC discovery issuer mismatch')
    }
    await this.seedSuperAdmin()
  }

  async beginLogin(ip: string) {
    await this.rateLimit('login', ip, 20)
    const config = this.requireConfig()
    const state = oidc.randomState()
    const nonce = oidc.randomNonce()
    const codeVerifier = oidc.randomPKCECodeVerifier()
    const challenge = await oidc.calculatePKCECodeChallenge(codeVerifier)
    const browserBinding = opaque()
    await this.prisma.loginTransaction.create({
      data: {
        stateHash: digest(state),
        browserBinding: digest(browserBinding),
        codeVerifier,
        nonce,
        expiresAt: new Date(Date.now() + shortTtlMs),
      },
    })
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri!.href,
      scope: 'openid profile email',
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    })
    return { url: authorizationUrl.href, browserBinding }
  }

  get superAdminEnabled() {
    return Boolean(this.superAdminUsername && this.superAdminPassword)
  }

  async loginSuperAdmin(
    username: string,
    password: string,
    ip: string,
    origin: string | undefined
  ) {
    this.assertOrigin(origin)
    const normalizedUsername = username.trim().toLowerCase()
    await this.rateLimit('super_admin_login_ip', ip, 20)
    await this.rateLimit('super_admin_login_account', normalizedUsername, 5)

    const credential = await this.prisma.superAdminCredential.findUnique({
      where: { id: superAdminCredentialId },
    })
    const verificationHash = credential
      ? parseScryptHash(credential.passwordHash)
      : {
          salt: Buffer.from('preflyt-super-admin-dummy-salt'),
          key: Buffer.alloc(superAdminScryptKeyLength),
        }
    const derivedKey = await deriveScryptKey(password, verificationHash.salt)
    const passwordMatches = timingSafeEqual(derivedKey, verificationHash.key)
    const usernameMatches =
      this.superAdminEnabled && normalizedUsername === credential?.username
    if (!usernameMatches || !passwordMatches || !credential) {
      await this.audit('super_admin_login_denied', null, {
        reason: 'invalid_credentials',
      })
      throw new UnauthorizedException('Invalid username or password')
    }

    const sessionToken = opaque()
    const expiresAt = new Date(Date.now() + superAdminSessionTtlMs)
    await this.prisma.$transaction(async (tx) => {
      await tx.webSession.create({
        data: {
          tokenHash: digest(sessionToken),
          identityId: credential.identityId,
          expiresAt,
        },
      })
      await tx.auditEvent.create({
        data: {
          event: 'super_admin_login_succeeded',
          actorId: credential.identityId,
        },
      })
    })
    return { sessionToken, expiresAt, identityId: credential.identityId }
  }

  private async seedSuperAdmin() {
    const identity = await this.prisma.identity.upsert({
      where: {
        issuer_subject: {
          issuer: superAdminIssuer,
          subject: superAdminSubject,
        },
      },
      create: {
        issuer: superAdminIssuer,
        subject: superAdminSubject,
        displayName: this.superAdminUsername ?? 'Preflyt Super Admin',
      },
      update: {
        displayName: this.superAdminUsername ?? 'Preflyt Super Admin',
      },
    })

    if (!this.superAdminEnabled) {
      await this.prisma.$transaction([
        this.prisma.superAdminCredential.deleteMany({
          where: { id: superAdminCredentialId },
        }),
        this.prisma.webSession.deleteMany({
          where: { identityId: identity.id },
        }),
        this.prisma.membership.updateMany({
          where: { identityId: identity.id },
          data: { active: false },
        }),
      ])
      return
    }

    await this.prisma.$transaction(async (tx) => {
      // The membership upsert serializes concurrent startup seeds for this identity.
      await tx.membership.upsert({
        where: { identityId: identity.id },
        create: { identityId: identity.id, role: 'SUPER_ADMIN', active: true },
        update: { role: 'SUPER_ADMIN', active: true },
      })
      const existing = await tx.superAdminCredential.findUnique({
        where: { id: superAdminCredentialId },
      })
      if (
        existing &&
        existing.username === this.superAdminUsername &&
        existing.identityId === identity.id
      ) {
        const stored = parseScryptHash(existing.passwordHash)
        const configured = await deriveScryptKey(
          this.superAdminPassword!,
          stored.salt
        )
        if (timingSafeEqual(configured, stored.key)) return
      }
      const salt = randomBytes(16)
      const key = await deriveScryptKey(this.superAdminPassword!, salt)
      const passwordHash = [
        'scrypt',
        superAdminScryptCost,
        superAdminScryptBlockSize,
        superAdminScryptParallelization,
        salt.toString('base64url'),
        key.toString('base64url'),
      ].join('$')
      await tx.webSession.deleteMany({ where: { identityId: identity.id } })
      await tx.superAdminCredential.upsert({
        where: { id: superAdminCredentialId },
        create: {
          id: superAdminCredentialId,
          username: this.superAdminUsername!,
          passwordHash,
          identityId: identity.id,
        },
        update: {
          username: this.superAdminUsername!,
          passwordHash,
          identityId: identity.id,
        },
      })
    })
  }

  async completeLogin(request: Request, browserBinding?: string) {
    const state =
      typeof request.query.state === 'string' ? request.query.state : ''
    if (!state || !browserBinding) {
      await this.audit('login_denied', null, { reason: 'invalid_transaction' })
      throw new UnauthorizedException('Invalid sign-in transaction')
    }
    const transaction = await this.prisma.loginTransaction.findFirst({
      where: {
        stateHash: digest(state),
        browserBinding: digest(browserBinding),
        expiresAt: { gt: new Date() },
      },
    })
    if (!transaction) {
      await this.audit('login_denied', null, { reason: 'expired_or_replayed' })
      throw new UnauthorizedException('Sign-in expired or already used')
    }
    const consumed = await this.prisma.loginTransaction.deleteMany({
      where: {
        id: transaction.id,
        browserBinding: digest(browserBinding),
        expiresAt: { gt: new Date() },
      },
    })
    if (consumed.count !== 1) {
      await this.audit('login_denied', null, {
        reason: 'replayed_transaction',
      })
      throw new UnauthorizedException('Sign-in expired or already used')
    }

    const callbackUrl = new URL(this.redirectUri!.href)
    for (const key of ['code', 'state', 'iss', 'error', 'error_description']) {
      const value = request.query[key]
      if (typeof value === 'string') callbackUrl.searchParams.set(key, value)
    }
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>
    try {
      tokens = await oidc.authorizationCodeGrant(
        this.requireConfig(),
        callbackUrl,
        {
          pkceCodeVerifier: transaction.codeVerifier,
          expectedState: state,
          expectedNonce: transaction.nonce,
        }
      )
    } catch (error) {
      await this.audit('login_denied', null, {
        reason: 'oidc_validation_failed',
      })
      throw error
    }
    const claims = tokens.claims()
    if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
      await this.audit('login_denied', null, { reason: 'subject_missing' })
      throw new UnauthorizedException('OIDC subject is missing')
    }

    const identity = await this.prisma.identity.upsert({
      where: {
        issuer_subject: {
          issuer: this.issuer!.href,
          subject: claims.sub,
        },
      },
      create: {
        issuer: this.issuer!.href,
        subject: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
        displayName: typeof claims.name === 'string' ? claims.name : null,
      },
      update: {
        email: typeof claims.email === 'string' ? claims.email : undefined,
        displayName: typeof claims.name === 'string' ? claims.name : undefined,
      },
      include: { membership: true },
    })

    if (identity.membership) {
      if (!identity.membership.active) {
        await this.audit('login_denied', identity.id, {
          reason: 'membership_inactive',
        })
        throw new ForbiddenException('Preflyt membership is inactive')
      }
      const session = await this.createSession(identity.id)
      await this.audit('login_succeeded', identity.id, {
        role: identity.membership.role,
      })
      return { kind: 'session' as const, ...session }
    }

    const owners = await this.prisma.membership.count({
      where: { role: 'OWNER', active: true },
    })
    if (owners > 0) {
      await this.audit('login_denied', identity.id, {
        reason: 'not_provisioned',
      })
      throw new ForbiddenException('This identity has no Preflyt membership')
    }
    const challengeToken = opaque()
    await this.prisma.bootstrapChallenge.create({
      data: {
        tokenHash: digest(challengeToken),
        identityId: identity.id,
        expiresAt: new Date(Date.now() + shortTtlMs),
      },
    })
    return { kind: 'bootstrap' as const, challengeToken }
  }

  async bootstrapOwner(
    token: string,
    challengeToken: string,
    origin: string | undefined,
    ip: string
  ) {
    this.assertOrigin(origin)
    if (!this.bootstrapHash) {
      throw new ServiceUnavailableException(
        'Owner bootstrap requires organization OIDC configuration'
      )
    }
    await this.rateLimit('bootstrap', ip, 8)
    const suppliedHash = Buffer.from(digest(token), 'hex')
    const expectedHash = Buffer.from(this.bootstrapHash, 'hex')
    if (!timingSafeEqual(suppliedHash, expectedHash)) {
      await this.audit('bootstrap_denied', null, { reason: 'invalid_token' })
      throw new UnauthorizedException('Invalid or expired bootstrap token')
    }
    const challenge = await this.prisma.bootstrapChallenge.findFirst({
      where: {
        tokenHash: digest(challengeToken),
        expiresAt: { gt: new Date() },
      },
    })
    if (!challenge) throw new UnauthorizedException('Bootstrap session expired')

    const rawSession = opaque()
    const expiresAt = new Date(Date.now() + sessionTtlMs)
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.bootstrapState.upsert({
            where: { id: 1 },
            create: { id: 1 },
            update: {},
          })
          const state = await tx.bootstrapState.findUniqueOrThrow({
            where: { id: 1 },
          })
          if (state.consumedAt) {
            throw new ConflictException('First-owner bootstrap is closed')
          }
          if (
            await tx.membership.count({
              where: { role: 'OWNER', active: true },
            })
          ) {
            throw new ConflictException('An Owner already exists')
          }
          const claimed = await tx.bootstrapState.updateMany({
            where: { id: 1, consumedAt: null },
            data: { consumedAt: new Date() },
          })
          if (claimed.count !== 1) {
            throw new ConflictException('First-owner bootstrap is closed')
          }
          await tx.membership.create({
            data: { identityId: challenge.identityId, role: 'OWNER' },
          })
          await tx.organizationMembership.create({
            data: {
              organizationId: 'preflyt-default',
              identityId: challenge.identityId,
              role: 'OWNER',
            },
          })
          await tx.bootstrapChallenge.delete({ where: { id: challenge.id } })
          await tx.webSession.create({
            data: {
              tokenHash: digest(rawSession),
              identityId: challenge.identityId,
              expiresAt,
            },
          })
          await tx.auditEvent.create({
            data: {
              event: 'owner_bootstrapped',
              actorId: challenge.identityId,
            },
          })
        },
        { isolationLevel: 'Serializable' }
      )
    } catch (error) {
      if (error instanceof ConflictException) throw error
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('First-owner bootstrap is closed')
      }
      throw error
    }
    return { sessionToken: rawSession, expiresAt }
  }

  async currentSession(token?: string) {
    if (!token) return { authenticated: false as const }
    const session = await this.prisma.webSession.findFirst({
      where: {
        tokenHash: digest(token),
        expiresAt: { gt: new Date() },
        identity: { membership: { is: { active: true } } },
      },
      include: { identity: { include: { membership: true } } },
    })
    if (!session?.identity.membership) {
      return { authenticated: false as const }
    }
    const activeOrganizationId =
      session.activeOrganizationId ??
      (
        await this.prisma.organizationMembership.findFirst({
          where: { identityId: session.identity.id, active: true },
          orderBy: { createdAt: 'asc' },
        })
      )?.organizationId ??
      null
    const scopedMember = activeOrganizationId
      ? await this.prisma.organizationMembership.findFirst({
          where: {
            identityId: session.identity.id,
            organizationId: activeOrganizationId ?? undefined,
            active: true,
          },
          include: {
            grants: { include: { repository: { select: { githubId: true } } } },
          },
        })
      : null
    return {
      authenticated: true as const,
      permissions: scopedMember ? rolePermissions[scopedMember.role] : [],
      organizationWide:
        !!scopedMember && ['OWNER', 'ADMIN'].includes(scopedMember.role),
      repositoryGrants:
        scopedMember?.grants.map((g) => g.repository.githubId.toString()) ?? [],
      identityId: session.identity.id,
      subject: session.identity.subject,
      email: session.identity.email,
      role:
        scopedMember?.role ??
        (session.identity.membership.role === 'SUPER_ADMIN'
          ? 'SUPER_ADMIN'
          : 'VIEWER'),
      organizationId: activeOrganizationId,
      platformAdmin: session.identity.membership.role === 'SUPER_ADMIN',
    }
  }

  async logout(token: string | undefined, origin: string | undefined) {
    this.assertOrigin(origin)
    if (token) {
      const result = await this.prisma.webSession.deleteMany({
        where: { tokenHash: digest(token) },
      })
      if (result.count) await this.audit('logout', null, {})
    }
  }

  get oidcEnabled() {
    return Boolean(this.issuer)
  }

  get sessionCookieName() {
    return this.secureCookie ? '__Host-preflyt.sid' : 'preflyt.sid'
  }
  get transactionCookieName() {
    return this.secureCookie ? '__Host-preflyt.oidc' : 'preflyt.oidc'
  }
  get challengeCookieName() {
    return this.secureCookie ? '__Host-preflyt.setup' : 'preflyt.setup'
  }
  get secureCookie() {
    return !(
      process.env.COOKIE_SECURE === 'false' &&
      process.env.NODE_ENV !== 'production'
    )
  }
  get frontendOrigin() {
    return this.webOrigin
  }

  assertOrigin(origin?: string) {
    if (!origin || origin !== this.webOrigin) {
      throw new ForbiddenException('Request origin is not allowed')
    }
  }

  private requireConfig() {
    if (!this.config) {
      throw new ServiceUnavailableException(
        'Organization OIDC sign-in is not configured for this deployment'
      )
    }
    return this.config
  }

  private async createSession(identityId: string) {
    const raw = opaque()
    const expiresAt = new Date(Date.now() + sessionTtlMs)
    await this.prisma.webSession.create({
      data: { tokenHash: digest(raw), identityId, expiresAt },
    })
    return { sessionToken: raw, expiresAt }
  }

  private async audit(
    event: string,
    actorId: string | null,
    metadata: Record<string, string>
  ) {
    await this.prisma.auditEvent.create({ data: { event, actorId, metadata } })
  }

  private async rateLimit(action: string, ip: string, limit: number) {
    const now = new Date()
    const windowStart = new Date(Math.floor(now.getTime() / 600_000) * 600_000)
    const result = await this.prisma.authThrottle.upsert({
      where: {
        action_keyHash_windowStart: {
          action,
          keyHash: digest(ip || 'unknown'),
          windowStart,
        },
      },
      create: {
        action,
        keyHash: digest(ip || 'unknown'),
        windowStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
    })
    if (result.count > limit) {
      throw new HttpException('Too many authentication attempts', 429)
    }
  }
}
