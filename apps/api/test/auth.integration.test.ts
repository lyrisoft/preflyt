import { NestFactory } from '@nestjs/core'
import { AuthController } from '../src/auth/auth.controller.js'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { exportJWK, SignJWT, type KeyLike } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Request } from 'express'
import { AuthService } from '../src/auth/auth.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

const clientId = 'preflyt-test-client'
const clientSecret = 'test-client-secret'
const bootstrapToken = 'test-bootstrap-token-value-000000000000'
const superAdminPassword = 'preflyt-test-super-admin-password-value'
const webOrigin = 'http://localhost:5173'
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const { privateKey: badPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const kid = 'preflyt-test-signing-key'
const codes = new Map<
  string,
  { nonce: string; challenge: string; sub: string; invalid?: string }
>()
let server: Server
let issuer: string
let jwk: Record<string, unknown>
let prisma: PrismaService

async function json(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown
) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

beforeAll(async () => {
  const exported = await exportJWK(publicKey)
  jwk = { ...exported, kid, use: 'sig', alg: 'RS256' }
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', issuer)
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer,
        authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token',
        jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
        grant_types_supported: ['authorization_code'],
      })
    }
    if (url.pathname === '/jwks') return json(res, 200, { keys: [jwk] })
    if (url.pathname === '/token' && req.method === 'POST') {
      let body = ''
      for await (const chunk of req) body += chunk
      const form = new URLSearchParams(body)
      const entry = codes.get(form.get('code') ?? '')
      if (!entry || form.get('code_verifier') === null) {
        return json(res, 400, { error: 'invalid_grant' })
      }
      const computed = createHash('sha256')
        .update(form.get('code_verifier')!)
        .digest('base64url')
      if (computed !== entry.challenge) {
        return json(res, 400, { error: 'invalid_grant' })
      }
      let tokenKey: KeyLike = privateKey
      let tokenKid = kid
      let tokenIssuer = issuer
      let audience = clientId
      let nonce = entry.nonce
      if (entry.invalid === 'signature') {
        tokenKey = badPrivateKey
      }
      if (entry.invalid === 'issuer') tokenIssuer = issuer + '/wrong'
      if (entry.invalid === 'audience') audience = 'wrong-client'
      if (entry.invalid === 'nonce') nonce = 'wrong-nonce'
      const idToken = await new SignJWT({
        nonce,
        email: 'owner@example.test',
        name: 'Preflyt Test Owner',
      })
        .setProtectedHeader({ alg: 'RS256', kid: tokenKid })
        .setIssuer(tokenIssuer)
        .setAudience(audience)
        .setSubject(entry.sub)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(tokenKey)
      const deliveredIdToken =
        entry.invalid === 'signature'
          ? idToken
              .split('.')
              .map((part, index) =>
                index === 2 ? 'A'.repeat(part.length) : part
              )
              .join('.')
          : idToken
      return json(res, 200, {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: deliveredIdToken,
        scope: 'openid profile email',
      })
    }
    return json(res, 404, { error: 'not_found' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  issuer = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
  process.env.OIDC_ISSUER = issuer
  process.env.SUPER_ADMIN_USERNAME = 'preflyt-admin'
  process.env.SUPER_ADMIN_PASSWORD = superAdminPassword
  prisma = new PrismaService()
  await prisma.$connect()
})

beforeEach(async () => {
  await prisma.authThrottle.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.gitHubRepository.deleteMany()
  await prisma.gitHubInstallation.deleteMany()
  await prisma.gitHubSetupTransaction.deleteMany()
  await prisma.webSession.deleteMany()
  await prisma.superAdminCredential.deleteMany()
  await prisma.bootstrapChallenge.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.identity.deleteMany()
  await prisma.loginTransaction.deleteMany()
  await prisma.bootstrapState.deleteMany()
  codes.clear()
})

afterAll(async () => {
  await prisma?.$disconnect()
  await new Promise<void>((resolve) => server?.close(() => resolve()))
})

async function newAuthService() {
  const service = new AuthService(prisma)
  await service.onModuleInit()
  return service
}

async function startLogin(service: AuthService, invalid?: string) {
  const started = await service.beginLogin('127.0.0.1')
  const authorization = new URL(started.url)
  const code = 'one-use-code-' + crypto.randomUUID()
  codes.set(code, {
    nonce: authorization.searchParams.get('nonce')!,
    challenge: authorization.searchParams.get('code_challenge')!,
    sub: 'sub-' + crypto.randomUUID(),
    invalid,
  })
  const request = {
    query: { state: authorization.searchParams.get('state'), code },
  } as unknown as Request
  return { started, request }
}

describe('OIDC and server-side identity sessions', () => {
  it('preserves sessions and the password hash across repeated startup without extending expiry', async () => {
    const service = await newAuthService()
    const session = await service.loginSuperAdmin(
      'preflyt-admin',
      superAdminPassword,
      '127.0.0.20',
      webOrigin
    )
    const credential = await prisma.superAdminCredential.findUniqueOrThrow({
      where: { id: 'primary' }
    })
    const restarts = await Promise.all([newAuthService(), newAuthService()])
    for (const restarted of restarts) {
      expect(
        await restarted.currentSession(session.sessionToken)
      ).toMatchObject({ authenticated: true, role: 'SUPER_ADMIN' })
    }
    expect(
      (
        await prisma.superAdminCredential.findUniqueOrThrow({
          where: { id: 'primary' }
        })
      ).passwordHash
    ).toBe(credential.passwordHash)
    const saved = await prisma.webSession.findFirstOrThrow({
      where: { identityId: session.identityId }
    })
    expect(saved.expiresAt).toEqual(session.expiresAt)
    const expiredAt = new Date(Date.now() - 1000)
    await prisma.webSession.update({
      where: { id: saved.id },
      data: { expiresAt: expiredAt }
    })
    const restarted = await newAuthService()
    expect(await restarted.currentSession(session.sessionToken)).toEqual({
      authenticated: false
    })
    expect(
      (await prisma.webSession.findUniqueOrThrow({ where: { id: saved.id } }))
        .expiresAt
    ).toEqual(expiredAt)
  })
  it.each(['username', 'password'])(
    'revokes existing sessions when the configured admin %s changes',
    async (field) => {
      const service = await newAuthService()
      const session = await service.loginSuperAdmin(
        'preflyt-admin',
        superAdminPassword,
        '127.0.0.21',
        webOrigin
      )
      const key =
        field === 'username' ? 'SUPER_ADMIN_USERNAME' : 'SUPER_ADMIN_PASSWORD'
      const original = process.env[key]
      process.env[key] =
        field === 'username' ? 'rotated-admin' : superAdminPassword + '-rotated'
      try {
        const restarted = await newAuthService()
        expect(await restarted.currentSession(session.sessionToken)).toEqual({
          authenticated: false
        })
        expect(
          await prisma.webSession.count({
            where: { identityId: session.identityId }
          })
        ).toBe(0)
        const replacement = await restarted.loginSuperAdmin(
          process.env.SUPER_ADMIN_USERNAME!,
          process.env.SUPER_ADMIN_PASSWORD!,
          '127.0.0.22',
          webOrigin
        )
        expect(
          await restarted.currentSession(replacement.sessionToken)
        ).toMatchObject({ authenticated: true })
      } finally {
        if (original === undefined) delete process.env[key]
        else process.env[key] = original
      }
    }
  )
  it('revokes existing sessions when local admin access is disabled', async () => {
    const service = await newAuthService()
    const session = await service.loginSuperAdmin(
      'preflyt-admin',
      superAdminPassword,
      '127.0.0.23',
      webOrigin
    )
    delete process.env.SUPER_ADMIN_USERNAME
    delete process.env.SUPER_ADMIN_PASSWORD
    try {
      const restarted = await newAuthService()
      expect(await restarted.currentSession(session.sessionToken)).toEqual({
        authenticated: false
      })
      expect(await prisma.superAdminCredential.count()).toBe(0)
    } finally {
      process.env.SUPER_ADMIN_USERNAME = 'preflyt-admin'
      process.env.SUPER_ADMIN_PASSWORD = superAdminPassword
    }
  })

  it('starts in Super Admin-only mode when OIDC settings are absent', async () => {
    const oidcKeys = [
      'OIDC_ISSUER',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
      'BOOTSTRAP_TOKEN_SHA256',
    ] as const
    const previous = Object.fromEntries(
      oidcKeys.map((key) => [key, process.env[key]])
    )
    oidcKeys.forEach((key) => delete process.env[key])

    try {
      const service = await newAuthService()
      expect(service.superAdminEnabled).toBe(true)
      await expect(service.beginLogin('127.0.0.11')).rejects.toThrow(
        'Organization OIDC sign-in is not configured'
      )
      expect(
        await prisma.superAdminCredential.findUnique({
          where: { id: 'primary' },
        })
      ).not.toBeNull()
    } finally {
      for (const key of oidcKeys) {
        const value = previous[key]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }

    delete process.env.OIDC_CLIENT_ID
    expect(() => new AuthService(prisma)).toThrow('must be configured together')
    process.env.OIDC_CLIENT_ID = 'preflyt-test-client'
  })

  it('authenticates only the configured Super Admin on the separate local path', async () => {
    const service = await newAuthService()
    expect(service.superAdminEnabled).toBe(true)
    const seeded = await prisma.superAdminCredential.findUnique({
      where: { id: 'primary' },
      include: { identity: { include: { membership: true } } },
    })
    expect(seeded?.username).toBe('preflyt-admin')
    expect(seeded?.passwordHash).not.toContain(superAdminPassword)
    expect(seeded?.identity.membership?.role).toBe('SUPER_ADMIN')
    await expect(
      service.loginSuperAdmin(
        'preflyt-admin',
        superAdminPassword,
        '127.0.0.10',
        'https://attacker.example'
      )
    ).rejects.toThrow()

    await expect(
      service.loginSuperAdmin(
        'another-admin',
        superAdminPassword,
        '127.0.0.10',
        webOrigin
      )
    ).rejects.toThrow('Invalid username or password')
    expect(await prisma.identity.count()).toBe(1)

    const session = await service.loginSuperAdmin(
      ' PREFLYT-ADMIN ',
      superAdminPassword,
      '127.0.0.10',
      webOrigin
    )
    expect(session.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      24 * 60 * 60 * 1000
    )
    expect(await service.currentSession(session.sessionToken)).toMatchObject({
      authenticated: true,
      identityId: session.identityId,
      email: null,
      role: 'SUPER_ADMIN',
    })
    expect(
      await prisma.webSession.findUnique({
        where: {
          tokenHash: createHash('sha256')
            .update(session.sessionToken)
            .digest('hex'),
        },
      })
    ).not.toBeNull()
    expect(
      await prisma.auditEvent.findFirst({
        where: { event: 'super_admin_login_succeeded' },
      })
    ).not.toBeNull()
  })

  it('binds a single-use callback to browser state and PKCE', async () => {
    const service = await newAuthService()
    const { started, request } = await startLogin(service)
    const authUrl = new URL(started.url)
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authUrl.searchParams.get('scope')).toContain('openid')
    await expect(
      service.completeLogin(request, 'different-browser')
    ).rejects.toThrow()
    const result = await service.completeLogin(request, started.browserBinding)
    expect(result.kind).toBe('bootstrap')
    await expect(
      service.completeLogin(request, started.browserBinding)
    ).rejects.toThrow()
  })

  it.each(['signature', 'issuer', 'audience', 'nonce'])(
    'rejects an ID token with invalid %s',
    async (invalid) => {
      const service = await newAuthService()
      const { started, request } = await startLogin(service, invalid)
      await expect(
        service.completeLogin(request, started.browserBinding)
      ).rejects.toThrow()
      expect(
        await prisma.identity.count({
          where: { issuer: { not: 'preflyt://local' } },
        })
      ).toBe(0)
      expect(
        await prisma.auditEvent.findFirst({
          where: {
            event: 'login_denied',
            metadata: { path: ['reason'], equals: 'oidc_validation_failed' },
          },
        })
      ).not.toBeNull()
    }
  )

  it('bootstraps exactly one Owner, issues a hashed opaque session, and revokes it on logout', async () => {
    const service = await newAuthService()
    const { started, request } = await startLogin(service)
    const login = await service.completeLogin(request, started.browserBinding)
    expect(login.kind).toBe('bootstrap')
    if (login.kind !== 'bootstrap')
      throw new Error('Expected bootstrap challenge')

    await expect(
      service.bootstrapOwner(
        bootstrapToken,
        login.challengeToken,
        'https://attacker.example',
        '127.0.0.2'
      )
    ).rejects.toThrow()

    await expect(
      service.bootstrapOwner(
        'incorrect-bootstrap-token-value-000000000000',
        login.challengeToken,
        webOrigin,
        '127.0.0.2'
      )
    ).rejects.toThrow()

    const created = await service.bootstrapOwner(
      bootstrapToken,
      login.challengeToken,
      webOrigin,
      '127.0.0.2'
    )
    expect(created.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(
      await prisma.webSession.findUnique({
        where: {
          tokenHash: createHash('sha256')
            .update(created.sessionToken)
            .digest('hex'),
        },
      })
    ).not.toBeNull()
    expect(await service.currentSession(created.sessionToken)).toMatchObject({
      authenticated: true,
      role: 'OWNER',
      email: 'owner@example.test',
    })

    await expect(
      service.bootstrapOwner(
        bootstrapToken,
        login.challengeToken,
        webOrigin,
        '127.0.0.2'
      )
    ).rejects.toThrow()
    await service.logout(created.sessionToken, webOrigin)
    expect(await service.currentSession(created.sessionToken)).toEqual({
      authenticated: false,
    })
    const bootstrapState = await prisma.bootstrapState.findUnique({
      where: { id: 1 },
    })
    expect(bootstrapState?.consumedAt).toBeInstanceOf(Date)
  })

  it('denies an OIDC identity without a local membership after an Owner exists', async () => {
    const service = await newAuthService()
    const first = await startLogin(service)
    const firstLogin = await service.completeLogin(
      first.request,
      first.started.browserBinding
    )
    if (firstLogin.kind !== 'bootstrap') throw new Error('Expected bootstrap')
    await service.bootstrapOwner(
      bootstrapToken,
      firstLogin.challengeToken,
      webOrigin,
      '127.0.0.3'
    )

    const second = await startLogin(service)
    await expect(
      service.completeLogin(second.request, second.started.browserBinding)
    ).rejects.toThrow()
  })
})

it('sets a persistent 24-hour admin cookie and prevents caching session decisions', async () => {
  const service = await newAuthService()
  const app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    },
    { logger: false },
  )
  app.use(cookieParser())
  await app.init()
  try {
    const login = await request(app.getHttpServer())
      .post('/auth/super-admin/login')
      .set('Origin', webOrigin)
      .send({ username: 'preflyt-admin', password: superAdminPassword })
    expect(login.status).toBe(201)
    const cookie = login.headers['set-cookie'][0]
    expect(cookie).toMatch(/Max-Age=86[0-9]{3}/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    const checked = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', cookie.split(';')[0])
    expect(checked.headers['cache-control']).toBe('no-store')
    expect(checked.body).toMatchObject({
      authenticated: true,
      role: 'SUPER_ADMIN',
    })
    const restarted = await newAuthService()
    expect(
      await restarted.currentSession(cookie.split(';')[0].split('=')[1]),
    ).toMatchObject({ authenticated: true })
    const loggedOut = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', webOrigin)
      .set('Cookie', cookie.split(';')[0])
    expect(loggedOut.status).toBe(204)
    expect(
      (
        await request(app.getHttpServer())
          .get('/auth/session')
          .set('Cookie', cookie.split(';')[0])
      ).body,
    ).toEqual({ authenticated: false })
  } finally {
    await app.close()
  }
})
