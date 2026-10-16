import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Client } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PrismaClient } from '../src/generated/prisma/client.js'
import {
  decryptGitHubUserTokens,
  encryptGitHubUserTokens,
} from '../src/auth/github-token-cipher.js'

const migration = '20261009100000_github_identity_links'
const name = 'preflyt_identity_test_' + randomUUID().replaceAll('-', '')
let admin: Client | undefined, db: PrismaClient | undefined
let created = false
const verifiedAt = new Date('2026-10-09T00:00:00Z')
const identity = (id: string) =>
  db!.identity.create({
    data: { id, issuer: 'https://fixture-oidc.test', subject: id },
  })
const account = (id: string, userId: bigint, login = 'fixture-user') =>
  db!.gitHubUserAccount.create({
    data: {
      host: 'github.com',
      githubUserId: userId,
      identityId: id,
      login,
      verifiedAt,
    },
  })

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
    const migrations = (await readdir('prisma/migrations'))
      .filter((entry) => /^\d/.test(entry))
      .sort()
    for (const entry of migrations.filter((entry) => entry < migration))
      await sql.query(
        await readFile(`prisma/migrations/${entry}/migration.sql`, 'utf8'),
      )
    // Real pre-migration rows: sessions, local recovery, scopes, source ownership and audit.
    await sql.query(`
      INSERT INTO "Identity" (id, issuer, subject, "updatedAt") VALUES ('legacy', 'oidc', 'owner', NOW()), ('recovery', 'local', 'admin', NOW());
      INSERT INTO "OrganizationMembership" (id, "organizationId", "identityId", role, "updatedAt") VALUES ('legacy-member', 'preflyt-default', 'legacy', 'OWNER', NOW());
      INSERT INTO "SuperAdminCredential" (id, username, "passwordHash", "identityId", "updatedAt") VALUES ('recovery', 'admin', 'fixture-hash', 'recovery', NOW());
      INSERT INTO "WebSession" (id, "tokenHash", "identityId", "expiresAt", "activeOrganizationId") VALUES ('session', 'fixture-session-hash', 'legacy', '2027-01-01', 'preflyt-default');
      INSERT INTO "GitHubInstallation" (id, "accountLogin", "accountType", "repositorySelection", permissions, "connectedById", "updatedAt") VALUES (41, 'fixture', 'Organization', 'selected', '{}', 'legacy', NOW());
      INSERT INTO "GitHubRepository" (id, "githubId", "installationId", name, "fullName", "ownerLogin", "isPrivate", selected, "updatedAt") VALUES ('repository', 42, 41, 'app', 'fixture/app', 'fixture', true, true, NOW());
      INSERT INTO "RepositoryGrant" (id, "membershipId", "repositoryId") VALUES ('grant', 'legacy-member', 'repository');
      INSERT INTO "AuditEvent" (id, event, "actorId") VALUES ('legacy-audit', 'fixture', 'legacy');
    `)
    await sql.query(
      await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'),
    )
  } finally {
    await sql.end()
  }
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  })
  await db.$connect()
}, 30000)
afterAll(async () => {
  await db?.$disconnect()
  if (created) await admin?.query(`DROP DATABASE "${name}" WITH (FORCE)`)
  await admin?.end()
})
it('preserves existing identity, sessions, recovery, grants, installations and audit without auto-linking', async () => {
  expect(
    await db!.webSession.findUnique({ where: { id: 'session' } }),
  ).toMatchObject({
    identityId: 'legacy',
    tokenHash: 'fixture-session-hash',
    activeOrganizationId: 'preflyt-default',
  })
  expect(
    await db!.superAdminCredential.findUnique({ where: { id: 'recovery' } }),
  ).toMatchObject({ identityId: 'recovery', passwordHash: 'fixture-hash' })
  expect(
    await db!.repositoryGrant.findUnique({ where: { id: 'grant' } }),
  ).toMatchObject({
    membershipId: 'legacy-member',
    repositoryId: 'repository',
  })
  expect(
    await db!.gitHubInstallation.findUnique({
      where: { id: 41n },
      // This fixture deliberately stops at the identity-link migration. Do not
      // select columns introduced by later migrations with the current client.
      select: { organizationId: true, connectedById: true },
    }),
  ).toMatchObject({
    organizationId: 'preflyt-default',
    connectedById: 'legacy',
  })
  expect(
    await db!.auditEvent.findUnique({ where: { id: 'legacy-audit' } }),
  ).toMatchObject({ actorId: 'legacy' })
  expect(await db!.gitHubUserAccount.count()).toBe(0)
  expect(await db!.gitHubOrganizationLink.count()).toBe(0)
})
it('keeps renamed accounts linked and denies duplicate stable IDs or a second account on one identity/host', async () => {
  await identity('user-a')
  await identity('user-b')
  const a = await account('user-a', 101n)
  await db!.gitHubUserAccount.update({
    where: { id: a.id },
    data: { login: 'renamed-user' },
  })
  expect(
    await db!.gitHubUserAccount.findUnique({
      where: { host_githubUserId: { host: 'github.com', githubUserId: 101n } },
    }),
  ).toMatchObject({ id: a.id, identityId: 'user-a', login: 'renamed-user' })
  await expect(account('user-b', 101n)).rejects.toMatchObject({
    code: 'P2002',
  })
  await expect(account('user-a', 102n)).rejects.toMatchObject({
    code: 'P2002',
  })
  expect((await account('user-b', 102n)).identityId).toBe('user-b')
  await expect(
    db!.identity.delete({ where: { id: 'user-a' } }),
  ).rejects.toMatchObject({ code: 'P2003' })
})
it('links existing organization IDs explicitly and prevents duplicate or conflicting workspace links', async () => {
  const link = await db!.gitHubOrganizationLink.create({
    data: {
      host: 'github.com',
      githubOrganizationId: 201n,
      organizationId: 'preflyt-default',
      login: 'fixture',
      verifiedAt,
    },
  })
  await db!.gitHubOrganizationLink.update({
    where: { id: link.id },
    data: { login: 'renamed-org' },
  })
  const other = await db!.organization.create({
    data: { name: 'Other workspace' },
  })
  await expect(
    db!.gitHubOrganizationLink.create({
      data: {
        host: 'github.com',
        githubOrganizationId: 201n,
        organizationId: other.id,
        login: 'renamed-org',
        verifiedAt,
      },
    }),
  ).rejects.toMatchObject({ code: 'P2002' })
  await expect(
    db!.gitHubOrganizationLink.create({
      data: {
        host: 'github.com',
        githubOrganizationId: 202n,
        organizationId: 'preflyt-default',
        login: 'other',
        verifiedAt,
      },
    }),
  ).rejects.toMatchObject({ code: 'P2002' })
  expect(
    await db!.gitHubInstallation.findUnique({
      where: { id: 41n },
      // This fixture deliberately stops at the identity-link migration. Do not
      // select columns introduced by later migrations with the current client.
      select: { organizationId: true, connectedById: true },
    }),
  ).toMatchObject({ organizationId: 'preflyt-default' })
})
it('rejects invalid provider keys at the database boundary', async () => {
  await identity('invalid')
  await expect(account('invalid', 0n)).rejects.toThrow()
  await expect(
    db!.gitHubUserAccount.create({
      data: {
        host: 'GitHub.com',
        githubUserId: 103n,
        identityId: 'invalid',
        login: 'fixture',
        verifiedAt,
      },
    }),
  ).rejects.toThrow()
})
it('stores account-bound encrypted tokens and expiry metadata, rejects plaintext and cascades credential removal only', async () => {
  await identity('tokens')
  const a = await account('tokens', 301n)
  const key = process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY
  process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY =
    randomBytes(32).toString('base64')
  try {
    const tokens = {
      accessToken: 'fixture-access',
      refreshToken: 'fixture-refresh',
    }
    const encryptedTokens = encryptGitHubUserTokens(a.id, tokens)
    const expiry = {
      accessExpiresAt: new Date('2026-10-09T08:00:00Z'),
      refreshExpiresAt: new Date('2027-01-01T00:00:00Z'),
    }
    await expect(
      db!.gitHubUserCredential.create({
        data: {
          accountId: a.id,
          encryptedTokens: tokens.accessToken,
          ...expiry,
        },
      }),
    ).rejects.toThrow()
    await db!.gitHubUserCredential.create({
      data: { accountId: a.id, encryptedTokens, ...expiry },
    })
    const stored = await db!.gitHubUserCredential.findUniqueOrThrow({
      where: { accountId: a.id },
    })
    expect(decryptGitHubUserTokens(a.id, stored.encryptedTokens)).toEqual(
      tokens,
    )
    expect(stored.accessExpiresAt).toEqual(expiry.accessExpiresAt)
    await db!.gitHubUserAccount.delete({ where: { id: a.id } })
    expect(
      await db!.gitHubUserCredential.findUnique({ where: { accountId: a.id } }),
    ).toBeNull()
    expect(
      await db!.identity.findUnique({ where: { id: 'tokens' } }),
    ).not.toBeNull()
  } finally {
    if (key === undefined) delete process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY
    else process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY = key
  }
})
