import {disposableDatabase} from './disposable-database.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
import 'reflect-metadata'
import { createHmac, randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { GitHubWebhookService } from '../src/github-events/github-webhook.service.js'
import { GitHubSyncService } from '../src/github/github-sync.service.js'
import { GitHubProviderService } from '../src/github/github-provider.service.js'
import { RepositoryProfileService } from '../src/github/repository-profile.service.js'
let prisma: PrismaService
const secret = 'lifecycle-test-secret-'.repeat(3)
const info = {
  id: 500n,
  accountLogin: 'fixture',
  accountType: 'Organization',
  repositorySelection: 'selected',
  permissions: { contents: 'read' },
}
const repository = {
  id: 501n,
  name: 'app',
  fullName: 'fixture/app',
  ownerLogin: 'fixture',
  defaultBranch: 'main',
  isPrivate: true,
}
const provider = {
  verifyInstallation: vi.fn(),
  listInstallationRepositories: vi.fn(),
}
beforeAll(async () => {
  fixture = await disposableDatabase('githubsync')
  prisma = fixture.prisma
})
afterAll(async () => {
  await fixture.close()
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  await fixture.reset()
  await prisma.gitHubAccessDelivery.deleteMany()
  await prisma.gitHubWebhookDelivery.deleteMany()
  await prisma.gitHubRepository.deleteMany()
  await prisma.gitHubInstallation.deleteMany()
  await prisma.gitHubSetupTransaction.deleteMany()
  await prisma.identity.deleteMany()
  await prisma.auditEvent.deleteMany()
  const actor = await prisma.identity.create({
    data: { issuer: 'fixture', subject: 'sync' },
  })
  const organizationId = (await prisma.organization.create({data: {name: 'Sync fixture'}})).id
  await prisma.gitHubInstallation.create({
    data: { organizationId, ...info, connectedById: actor.id, permissions: info.permissions },
  })
  await prisma.gitHubRepository.create({
    data: {
      githubId: repository.id,
      installationId: 500n,
      name: repository.name,
      fullName: repository.fullName,
      ownerLogin: repository.ownerLogin,
      isPrivate: true,
      selected: true,
    },
  })
  provider.verifyInstallation.mockReset().mockResolvedValue(info)
  provider.listInstallationRepositories
    .mockReset()
    .mockResolvedValue([repository])
  vi.stubEnv('GITHUB_EVENTS_ENABLED', 'true')
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret)
})
async function event(
  action: string,
  event = 'installation',
  extra: object = {},
  id = randomUUID(),
) {
  const body = { action, installation: { id: 500 }, ...extra },
    raw = Buffer.from(JSON.stringify(body)),
    signature =
      'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')
  return new GitHubWebhookService(prisma).receive(
    raw,
    signature,
    id,
    event,
    body,
  )
}
it('accepts signed removal without a selected repository, revokes access atomically, and replays once', async () => {
  const id = randomUUID()
  await event(
    'removed',
    'installation_repositories',
    { repositories_removed: [{ id: 501 }], repository_selection: 'selected' },
    id,
  )
  expect(
    (
      await prisma.gitHubRepository.findUniqueOrThrow({
        where: { githubId: 501n },
      })
    ).selected,
  ).toBe(false)
  const before = await prisma.gitHubInstallation.findUniqueOrThrow({
    where: { id: 500n },
  })
  await expect(
    event(
      'removed',
      'installation_repositories',
      { repositories_removed: [{ id: 501 }], repository_selection: 'selected' },
      id,
    ),
  ).resolves.toMatchObject({ duplicate: true })
  expect(
    (await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }))
      .accessRevision,
  ).toBe(before.accessRevision)
  expect(await prisma.gitHubAccessDelivery.count()).toBe(1)
  await expect(event('suspend', 'installation', {}, id)).rejects.toThrow(
    'reused',
  )
  await expect(
    new RepositoryProfileService(prisma, provider as any).get('501'),
  ).rejects.toThrow()
})
it('pauses installation access on suspension and on all-to-selected changes with omitted removals', async () => {
  await event('suspend')
  expect(
    (await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }))
      .active,
  ).toBe(false)
  await prisma.gitHubInstallation.update({
    where: { id: 500n },
    data: { active: true, repositorySelection: 'all' },
  })
  await prisma.gitHubRepository.updateMany({ data: { selected: true } })
  await event('added', 'installation_repositories', {
    repositories_removed: [],
    repository_selection: 'selected',
  })
  expect(
    (await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }))
      .active,
  ).toBe(false)
  expect(
    (
      await prisma.gitHubRepository.findUniqueOrThrow({
        where: { githubId: 501n },
      })
    ).selected,
  ).toBe(false)
})
it('never reactivates on an unsuspend webhook alone; synchronization must verify access', async () => {
  await event('suspend')
  await event('unsuspend')
  expect(
    (await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }))
      .active,
  ).toBe(false)
  await new GitHubSyncService(prisma, provider as any).sync(500n)
  expect(
    await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }),
  ).toMatchObject({ active: true, syncState: 'OK' })
  expect(
    (
      await prisma.gitHubRepository.findUniqueOrThrow({
        where: { githubId: 501n },
      })
    ).selected,
  ).toBe(false)
})
it('does not restore selection or metadata from a synchronization started before revocation', async () => {
  provider.listInstallationRepositories.mockImplementationOnce(async () => {
    await event('suspend')
    return [repository]
  })
  await new GitHubSyncService(prisma, provider as any).sync(500n)
  expect(
    (await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }))
      .active,
  ).toBe(false)
  expect(
    (
      await prisma.gitHubRepository.findUniqueOrThrow({
        where: { githubId: 501n },
      })
    ).selected,
  ).toBe(false)
})
it('retains saved data on rate/outage failures and marks sync state instead of fabricating revocation', async () => {
  provider.verifyInstallation.mockRejectedValueOnce(new Error('offline'))
  await expect(
    new GitHubSyncService(prisma, provider as any).sync(500n),
  ).rejects.toThrow()
  expect(
    await prisma.gitHubInstallation.findUniqueOrThrow({ where: { id: 500n } }),
  ).toMatchObject({ active: true, syncState: 'ERROR', syncLeaseUntil: null })
  expect(
    (
      await prisma.gitHubRepository.findUniqueOrThrow({
        where: { githubId: 501n },
      })
    ).selected,
  ).toBe(true)
})
it('removes access during reconciliation while retaining repository history records', async () => {
  provider.listInstallationRepositories.mockResolvedValueOnce([])
  await new GitHubSyncService(prisma, provider as any).reconcile()
  expect(
    (
      await prisma.gitHubRepository.findUniqueOrThrow({
        where: { githubId: 501n },
      })
    ).selected,
  ).toBe(false)
})
it('rejects forged lifecycle payloads and ignores unknown installations', async () => {
  const service = new GitHubWebhookService(prisma),
    raw = Buffer.from('{}')
  await expect(
    service.receive(
      raw,
      'sha256=' + 'a'.repeat(64),
      randomUUID(),
      'installation',
      {},
    ),
  ).rejects.toThrow('signature')
  await expect(
    event('removed', 'installation_repositories', {
      repositories_removed: [{ id: 'bad' }],
    }),
  ).rejects.toThrow('Invalid')
  const body = { action: 'deleted', installation: { id: 999 } },
    bytes = Buffer.from(JSON.stringify(body))
  expect(
    await service.receive(
      bytes,
      'sha256=' + createHmac('sha256', secret).update(bytes).digest('hex'),
      randomUUID(),
      'installation',
      body,
    ),
  ).toMatchObject({ accepted: false })
})
