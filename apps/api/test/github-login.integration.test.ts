import 'reflect-metadata'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { Client } from 'pg'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { AuthService } from '../src/auth/auth.service.js'
import { AuthorizationService } from '../src/auth/authorization.service.js'
import {
  GitHubLoginService,
  loginReturnPath,
} from '../src/auth/github-login.service.js'
import { GitHubIdentityProvider } from '../src/auth/github-identity-provider.js'
import { GitHubUserAccessService } from '../src/auth/github-user-access.service.js'
import { OrganizationController } from '../src/auth/organization.controller.js'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest'
const name = 'preflyt_identity_test_' + randomUUID().replaceAll('-', '')
let admin: Client,
  db: PrismaService,
  auth: AuthService,
  login: GitHubLoginService,
  access: AuthorizationService,
  userAccess: GitHubUserAccessService
let created = false,
  userId = 101n
const provider = {
  authorizationUrl: vi.fn(
    (state: string, challenge: string) =>
      `https://github.com/login/oauth/authorize?state=${state}&code_challenge=${challenge}`,
  ),
  exchange: vi.fn(async () => ({
    accessToken: 'fixture-access',
    refreshToken: 'fixture-refresh',
    accessExpiresAt: new Date(Date.now() + 28800000),
    refreshExpiresAt: new Date(Date.now() + 86400000),
  })),
  user: vi.fn(async () => ({
    id: userId,
    login: 'fixture-user',
    displayName: 'Fixture User',
    avatarUrl: null,
  })),
  installations: vi.fn(async () => [
    { id: 41n, organizationId: 201n, login: 'fixture-org' },
  ]),
  verify: vi.fn(async () => ({
    organizationId: 201n,
    login: 'fixture-org',
    owner: true,
    repositoryIds: [11n],
    installation: {
      id: 41n,
      accountId: 201n,
      accountLogin: 'fixture-org',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: { members: 'read' },
    },
  })),
  members: vi.fn(async () => [
    { id: '102', login: 'developer', avatarUrl: null },
  ]),
  resolveMember: vi.fn(async () => ({
    id: 102n,
    login: 'developer',
    displayName: 'Developer',
    avatarUrl: null,
  })),
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
async function callback() {
  const begun = await login.begin('127.0.0.1', '/repositories')
  const state = new URL(begun.url).searchParams.get('state')!
  return {
    begun,
    state,
    ...(await login.complete(state, begun.browserBinding, 'fixture-code')),
  }
}
async function onboard() {
  const result = await callback()
  const session = await login.enter(
    result.challengeToken,
    '41',
    'http://localhost:5173',
  )
  const current = await auth.currentSession(session.sessionToken)
  if (!current.authenticated) throw new Error('Session missing')
  return { result, session, current }
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Local PostgreSQL required')
  admin = new Client({ connectionString: url.toString() })
  await admin.connect()
  await admin.query(`CREATE DATABASE "${name}"`)
  created = true
  url.pathname = '/' + name
  const sql = new Client({ connectionString: url.toString() })
  await sql.connect()
  try {
    for (const entry of (await readdir('prisma/migrations'))
      .filter((n) => /^\d/.test(n))
      .sort())
      await sql.query(
        await readFile(`prisma/migrations/${entry}/migration.sql`, 'utf8'),
      )
  } finally {
    await sql.end()
  }
  vi.stubEnv('DATABASE_URL', url.toString())
  vi.stubEnv('GITHUB_LOGIN_ENABLED', 'true')
  vi.stubEnv(
    'GITHUB_LOGIN_CALLBACK_URL',
    'http://localhost:3000/auth/github/callback',
  )
  vi.stubEnv(
    'GITHUB_USER_TOKEN_ENCRYPTION_KEY',
    randomBytes(32).toString('base64'),
  )
  vi.stubEnv('GITHUB_APP_ID', '999')
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'fixture-client')
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'fixture-secret')
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY', 'fixture-key')
  for (const key of [
    'OIDC_ISSUER',
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'OIDC_REDIRECT_URI',
    'SUPER_ADMIN_USERNAME',
    'SUPER_ADMIN_PASSWORD',
  ])
    vi.stubEnv(key, '')
  db = new PrismaService()
  await db.$connect()
  auth = new AuthService(db)
  login = new GitHubLoginService(
    db,
    provider as unknown as GitHubIdentityProvider,
    auth,
  )
  login.onModuleInit()
  userAccess = new GitHubUserAccessService(
    db,
    provider as unknown as GitHubIdentityProvider,
  )
  access = new AuthorizationService(db, userAccess)
}, 30000)
beforeEach(async () => {
  await db.gitHubOnboardingChallenge.deleteMany()
  await db.gitHubLoginTransaction.deleteMany()
  await db.gitHubUserAccessEvidence.deleteMany()
  await db.gitHubUserAccount.deleteMany()
  await db.gitHubOrganizationLink.deleteMany()
  await db.gitHubRepository.deleteMany()
  await db.gitHubInstallation.deleteMany()
  await db.organization.deleteMany()
  await db.identity.deleteMany()
  await db.authThrottle.deleteMany()
  await db.auditEvent.deleteMany()
  userId = 101n
  vi.clearAllMocks()
})
afterAll(async () => {
  await db?.$disconnect()
  if (created) await admin?.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin?.end()
  vi.unstubAllEnvs()
})
it('supports GitHub-only startup and issues restricted proof without workspace access', async () => {
  const result = await callback()
  expect(await db.webSession.count()).toBe(0)
  expect(await db.organizationMembership.count()).toBe(0)
  expect(await login.organizations(result.challengeToken)).toMatchObject({
    login: 'fixture-user',
    organizations: [{ state: 'new', login: 'fixture-org' }],
  })
  const credential = await db.gitHubUserCredential.findFirstOrThrow()
  expect(credential.encryptedTokens).not.toContain('fixture-access')
  const transactionCall = provider.exchange.mock.calls[0] as unknown as [
    string,
    string,
  ]
  const challenge = provider.authorizationUrl.mock.calls[0]![1]
  expect(
    createHash('sha256').update(transactionCall[1]).digest('base64url'),
  ).toBe(challenge)
})
it('rejects missing/mismatched binding, expired state and callback replay before another token exchange', async () => {
  const begun = await login.begin('ip'),
    state = new URL(begun.url).searchParams.get('state')!
  await expect(login.complete(state, 'wrong', 'code')).rejects.toThrow()
  expect(provider.exchange).not.toHaveBeenCalled()
  await login.complete(state, begun.browserBinding, 'code')
  await expect(
    login.complete(state, begun.browserBinding, 'code'),
  ).rejects.toThrow()
  expect(provider.exchange).toHaveBeenCalledTimes(1)
  const next = await login.begin('ip2'),
    nextState = new URL(next.url).searchParams.get('state')!
  await db.gitHubLoginTransaction.updateMany({
    where: { stateHash: hash(nextState) },
    data: { expiresAt: new Date(0) },
  })
  await expect(
    login.complete(nextState, next.browserBinding, 'code'),
  ).rejects.toThrow()
})
it('creates one verified owner workspace and preserves persistent sessions across service instances', async () => {
  const { current, session, result } = await onboard()
  expect(current.role).toBe('OWNER')
  expect(session.returnPath).toBe('/repositories')
  expect(
    await new AuthService(db).currentSession(session.sessionToken),
  ).toMatchObject({
    authenticated: true,
    organizationId: current.organizationId,
  })
  expect(await db.organization.count()).toBe(1)
  await expect(
    login.enter(result.challengeToken, '41', 'http://localhost:5173'),
  ).rejects.toThrow()
  expect(
    await db.organizationMembership.count({ where: { role: 'OWNER' } }),
  ).toBe(1)
})
it('does not allow a member to bootstrap or a second GitHub owner to claim an existing workspace', async () => {
  const result = await callback()
  provider.verify.mockResolvedValueOnce({
    ...(await provider.verify()),
    owner: false,
  })
  await expect(
    login.enter(result.challengeToken, '41', 'http://localhost:5173'),
  ).rejects.toThrow('organization owner')
  expect(await db.organization.count()).toBe(0)
  await login.enter(result.challengeToken, '41', 'http://localhost:5173')
  userId = 102n
  const other = await callback()
  await expect(
    login.enter(other.challengeToken, '41', 'http://localhost:5173'),
  ).rejects.toThrow('not granted')
  expect(
    await db.organizationMembership.count({ where: { role: 'OWNER' } }),
  ).toBe(1)
})
it('serializes concurrent owner claims to one workspace and one initial owner', async () => {
  const first = await callback()
  userId = 102n
  const second = await callback()
  const results = await Promise.allSettled([
    login.enter(first.challengeToken, '41', 'http://localhost:5173'),
    login.enter(second.challengeToken, '41', 'http://localhost:5173'),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(await db.organization.count()).toBe(1)
  expect(
    await db.organizationMembership.count({ where: { role: 'OWNER' } }),
  ).toBe(1)
})
it('never migrates a legacy installation automatically', async () => {
  const result = await callback(),
    account = await db.gitHubUserAccount.findFirstOrThrow()
  const org = await db.organization.create({ data: { name: 'legacy' } })
  await db.gitHubInstallation.create({
    data: {
      id: 41n,
      organizationId: org.id,
      accountLogin: 'fixture-org',
      accountType: 'Organization',
      repositorySelection: 'selected',
      permissions: {},
      connectedById: account.identityId,
    },
  })
  await expect(
    login.enter(result.challengeToken, '41', 'http://localhost:5173'),
  ).rejects.toThrow('migrate')
  expect(await db.gitHubOrganizationLink.count()).toBe(0)
})
it('caps Owner repository reads to provider evidence and fails closed on expired evidence without deleting the session', async () => {
  const { current, session } = await onboard()
  for (const id of [11n, 12n])
    await db.gitHubRepository.create({
      data: {
        githubId: id,
        installationId: 41n,
        name: 'r' + id,
        fullName: 'fixture-org/r' + id,
        ownerLogin: 'fixture-org',
        isPrivate: true,
        selected: true,
      },
    })
  expect(
    (
      await access.repositoryScope(current.identityId, current.organizationId)
    ).map((r) => r.githubId),
  ).toEqual([11n])
  await expect(
    access.requireRepository(current, '12', 'repository.read'),
  ).rejects.toThrow()
  await expect(
    access.requireRepository(current, '11', 'repository.read'),
  ).resolves.toMatchObject({ githubId: 11n })
  const calls = provider.verify.mock.calls.length
  await access.repositoryScope(current.identityId, current.organizationId)
  expect(provider.verify.mock.calls.length).toBe(calls)
  await db.gitHubUserAccessEvidence.updateMany({
    data: { expiresAt: new Date(0) },
  })
  provider.verify.mockRejectedValueOnce(
    new ServiceUnavailableException('Provider unavailable'),
  )
  await expect(
    access.repositoryScope(current.identityId, current.organizationId),
  ).rejects.toThrow('Provider unavailable')
  expect((await auth.currentSession(session.sessionToken)).authenticated).toBe(
    true,
  )
  await db.organizationMembership.updateMany({
    where: { identityId: current.identityId },
    data: { active: false },
  })
  expect(
    await access.repositoryScope(current.identityId, current.organizationId),
  ).toEqual([])
})
it('grants verified GitHub users built-in roles without auto-linking names or granting another repository', async () => {
  const { current } = await onboard()
  await db.gitHubRepository.create({
    data: {
      githubId: 11n,
      installationId: 41n,
      name: 'r11',
      fullName: 'fixture-org/r11',
      ownerLogin: 'fixture-org',
      isPrivate: true,
      selected: true,
    },
  })
  const controller = new OrganizationController(db, access, auth, userAccess)
  const request = {
    preflytSession: current,
    headers: { origin: 'http://localhost:5173' },
  } as any
  await controller.addGitHub(
    {
      username: 'developer',
      role: 'DEVELOPER',
      active: true,
      repositoryIds: ['11'],
    },
    request,
  )
  const member = await db.organizationMembership.findFirstOrThrow({
    where: { role: 'DEVELOPER' },
    include: { identity: { include: { githubAccounts: true } } },
  })
  expect(member.identity.githubAccounts[0]?.githubUserId).toBe(102n)
  expect(member.identity.issuer).toBe('https://github.com')
  userId = 102n
  const result = await callback()
  const next = await login.enter(
    result.challengeToken,
    '41',
    'http://localhost:5173',
  )
  expect(await auth.currentSession(next.sessionToken)).toMatchObject({
    role: 'DEVELOPER',
  })
  await expect(
    controller.addGitHub(
      {
        username: 'developer',
        role: 'DEVELOPER',
        active: true,
        repositoryIds: ['12'],
      },
      request,
    ),
  ).rejects.toThrow('authorized')
  provider.resolveMember.mockRejectedValueOnce(
    new ForbiddenException('Not a member'),
  )
  await expect(
    controller.addGitHub(
      { username: 'outsider', role: 'OWNER', active: true, repositoryIds: [] },
      request,
    ),
  ).rejects.toThrow('Not a member')
})
it('blocks open redirects and throttles repeated login attempts', async () => {
  for (const value of [
    '//evil.test',
    'https://evil.test',
    '/\\evil.test',
    '/%0aevil',
    '/ bad',
  ])
    expect(() => loginReturnPath(value)).toThrow()
  expect(loginReturnPath('/repositories?tab=overview')).toBe(
    '/repositories?tab=overview',
  )
  for (let i = 0; i < 20; i++) await login.begin('limited')
  await expect(login.begin('limited')).rejects.toMatchObject({ status: 429 })
})

it('syncs the GitHub directory without granting access and reuses scoped snapshots', async () => {
  const { current } = await onboard()
  const controller = new OrganizationController(db, access, auth, userAccess)
  const req = {
    preflytSession: current,
    headers: { origin: 'http://localhost:5173' },
  } as any
  const snapshot = await controller.githubDirectory(req, 'dev', '1')
  expect(snapshot).toMatchObject({
    total: 1,
    members: [{ id: '102', login: 'developer', role: null, active: false }],
  })
  expect(await db.organizationMembership.count()).toBe(1)
  await controller.githubDirectory(req, '', '1')
  expect(provider.members).toHaveBeenCalledTimes(1)
  await controller.syncGitHubDirectory(req)
  expect(provider.members).toHaveBeenCalledTimes(2)
  expect(
    await db.auditEvent.count({
      where: { event: 'github_members_synchronized' },
    }),
  ).toBe(1)
  await db.organizationMembership.updateMany({
    where: { identityId: current.identityId },
    data: { active: false },
  })
  await expect(controller.githubDirectory(req, '', '1')).rejects.toThrow()
})

it('filters granted GitHub members before pagination and makes revoked members assignable again', async () => {
  const { current } = await onboard()
  const controller = new OrganizationController(db, access, auth, userAccess)
  const req = {
    preflytSession: current,
    headers: { origin: 'http://localhost:5173' },
  } as any
  expect(await controller.githubDirectory(req, '', '1', 'true')).toMatchObject({
    total: 1,
    members: [{ login: 'developer' }],
  })
  await controller.addGitHub(
    {
      username: 'developer',
      role: 'DEVELOPER',
      active: true,
      repositoryIds: [],
    },
    req,
  )
  expect(await controller.githubDirectory(req, '', '1', 'true')).toMatchObject({
    total: 0,
    members: [],
  })
  await db.organizationMembership.updateMany({
    where: { organizationId: current.organizationId!, role: 'DEVELOPER' },
    data: { active: false },
  })
  expect(
    await controller.githubDirectory(req, 'dev', '1', 'true'),
  ).toMatchObject({
    total: 1,
    members: [{ login: 'developer', active: false }],
  })
})

async function legacyWorkspace() {
  const identity = await db.identity.create({
    data: {
      issuer: 'https://legacy.example/',
      subject: 'old-owner',
      membership: { create: { role: 'VIEWER' } },
    },
  })
  const organization = await db.organization.create({
    data: {
      name: 'Existing workspace',
      memberships: { create: { identityId: identity.id, role: 'OWNER' } },
    },
  })
  const sessionToken = randomBytes(32).toString('base64url')
  await db.webSession.create({
    data: {
      identityId: identity.id,
      activeOrganizationId: organization.id,
      tokenHash: hash(sessionToken),
      expiresAt: new Date(Date.now() + 3600000),
    },
  })
  await db.gitHubInstallation.create({
    data: {
      id: 41n,
      organizationId: organization.id,
      connectedById: identity.id,
      accountType: 'Organization',
      accountLogin: 'fixture-org',
      repositorySelection: 'selected',
      permissions: {},
      active: true,
    },
  })
  await db.gitHubRepository.create({
    data: {
      githubId: 11n,
      installationId: 41n,
      ownerLogin: 'fixture-org',
      name: 'existing-repo',
      fullName: 'fixture-org/existing-repo',
      isPrivate: true,
      selected: true,
      available: true,
    },
  })
  return { identity, organization, sessionToken }
}
async function linkingCallback(sessionToken: string) {
  const begun = await login.begin('linking-ip', '/access-control', sessionToken)
  const state = new URL(begun.url).searchParams.get('state')!
  return login.complete(state, begun.browserBinding, 'fixture-code')
}
it('links the existing installed organization with both owner proofs and preserves repositories and identities', async () => {
  const legacy = await legacyWorkspace(),
    result = await linkingCallback(legacy.sessionToken)
  expect(await login.organizations(result.challengeToken)).toMatchObject({
    linkingWorkspace: true,
    organizations: [{ state: 'link_existing' }],
  })
  const entered = await login.enter(
    result.challengeToken,
    '41',
    'http://localhost:5173',
    legacy.sessionToken,
  )
  expect(entered.returnPath).toBe('/access-control?tab=github')
  expect(await db.organization.count()).toBe(1)
  expect(
    await db.gitHubRepository.findUnique({ where: { githubId: 11n } }),
  ).toMatchObject({ selected: true, installationId: 41n })
  expect(
    await db.gitHubOrganizationLink.findUnique({
      where: { organizationId: legacy.organization.id },
    }),
  ).toMatchObject({ githubOrganizationId: 201n })
  expect(await auth.currentSession(entered.sessionToken)).toMatchObject({
    organizationId: legacy.organization.id,
    role: 'OWNER',
  })
  expect(
    await db.identity.findUnique({ where: { id: legacy.identity.id } }),
  ).toMatchObject({ subject: 'old-owner' })
  expect(
    await db.auditEvent.count({
      where: { event: 'github_existing_workspace_linked' },
    }),
  ).toBe(1)
})
it('rejects linking when GitHub ownership, original session, or local ownership is missing', async () => {
  const legacy = await legacyWorkspace(),
    result = await linkingCallback(legacy.sessionToken)
  await expect(
    login.enter(
      result.challengeToken,
      '41',
      'http://localhost:5173',
      'other-session',
    ),
  ).rejects.toThrow('browser session')
  provider.verify.mockResolvedValueOnce({
    ...(await provider.verify()),
    owner: false,
  })
  await expect(
    login.enter(
      result.challengeToken,
      '41',
      'http://localhost:5173',
      legacy.sessionToken,
    ),
  ).rejects.toThrow('organization owner')
  expect(await db.gitHubOrganizationLink.count()).toBe(0)
  await db.organizationMembership.updateMany({
    where: { identityId: legacy.identity.id },
    data: { role: 'ADMIN' },
  })
  await expect(
    login.enter(
      result.challengeToken,
      '41',
      'http://localhost:5173',
      legacy.sessionToken,
    ),
  ).rejects.toThrow('ownership')
  expect(await db.gitHubOrganizationLink.count()).toBe(0)
})
