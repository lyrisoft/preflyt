import { createHash, generateKeyPairSync } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import {
  exportJWK,
  SignJWT,
  type KeyLike,
} from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Request } from 'express'
import { AuthService } from '../src/auth/auth.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

const clientId = 'preflyt-test-client'
const clientSecret = 'test-client-secret'
const bootstrapToken = 'test-bootstrap-token-value-000000000000'
const webOrigin = 'http://localhost:5173'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const { privateKey: badPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const kid = 'preflyt-test-signing-key'
const codes = new Map<string, { nonce: string; challenge: string; sub: string; invalid?: string }>()
let server: Server
let issuer: string
let jwk: Record<string, unknown>
let prisma: PrismaService

async function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
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
      const deliveredIdToken = entry.invalid === 'signature'
        ? idToken.split('.').map((part, index) => index === 2 ? 'A'.repeat(part.length) : part).join('.')
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
  it('binds a single-use callback to browser state and PKCE', async () => {
    const service = await newAuthService()
    const { started, request } = await startLogin(service)
    const authUrl = new URL(started.url)
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authUrl.searchParams.get('scope')).toContain('openid')
    await expect(service.completeLogin(request, 'different-browser')).rejects.toThrow()
    const result = await service.completeLogin(request, started.browserBinding)
    expect(result.kind).toBe('bootstrap')
    await expect(service.completeLogin(request, started.browserBinding)).rejects.toThrow()
  })

  it.each(['signature', 'issuer', 'audience', 'nonce'])(
    'rejects an ID token with invalid %s',
    async (invalid) => {
      const service = await newAuthService()
      const { started, request } = await startLogin(service, invalid)
      await expect(
        service.completeLogin(request, started.browserBinding),
      ).rejects.toThrow()
      expect(await prisma.identity.count()).toBe(0)
      expect(await prisma.auditEvent.findFirst({
        where: { event: 'login_denied', metadata: { path: ['reason'], equals: 'oidc_validation_failed' } },
      })).not.toBeNull()
    },
  )

  it('bootstraps exactly one Owner, issues a hashed opaque session, and revokes it on logout', async () => {
    const service = await newAuthService()
    const { started, request } = await startLogin(service)
    const login = await service.completeLogin(request, started.browserBinding)
    expect(login.kind).toBe('bootstrap')
    if (login.kind !== 'bootstrap') throw new Error('Expected bootstrap challenge')

    await expect(
      service.bootstrapOwner(
        bootstrapToken,
        login.challengeToken,
        'https://attacker.example',
        '127.0.0.2',
      ),
    ).rejects.toThrow()

    await expect(
      service.bootstrapOwner(
        'incorrect-bootstrap-token-value-000000000000',
        login.challengeToken,
        webOrigin,
        '127.0.0.2',
      ),
    ).rejects.toThrow()

    const created = await service.bootstrapOwner(
      bootstrapToken,
      login.challengeToken,
      webOrigin,
      '127.0.0.2',
    )
    expect(created.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await prisma.webSession.findUnique({
      where: { tokenHash: createHash('sha256').update(created.sessionToken).digest('hex') },
    })).not.toBeNull()
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
        '127.0.0.2',
      ),
    ).rejects.toThrow()
    await service.logout(created.sessionToken, webOrigin)
    expect(await service.currentSession(created.sessionToken)).toEqual({
      authenticated: false,
    })
    const bootstrapState = await prisma.bootstrapState.findUnique({ where: { id: 1 } })
    expect(bootstrapState?.consumedAt).toBeInstanceOf(Date)
  })

  it('denies an OIDC identity without a local membership after an Owner exists', async () => {
    const service = await newAuthService()
    const first = await startLogin(service)
    const firstLogin = await service.completeLogin(first.request, first.started.browserBinding)
    if (firstLogin.kind !== 'bootstrap') throw new Error('Expected bootstrap')
    await service.bootstrapOwner(
      bootstrapToken,
      firstLogin.challengeToken,
      webOrigin,
      '127.0.0.3',
    )

    const second = await startLogin(service)
    await expect(
      service.completeLogin(second.request, second.started.browserBinding),
    ).rejects.toThrow()
  })
})
