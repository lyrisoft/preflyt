import { describe, expect, it, vi } from 'vitest'
import { discoverRepositoryProfile } from '../src/github/repository-profile.js'
import { GitHubService } from '../src/github/github.service.js'
import type { GitHubProviderService } from '../src/github/github-provider.service.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'

type SavedProfile = { report: unknown; createdAt: Date; sourceSha: string }
const profile: SavedProfile = {
  report: {
    signals: [
      { id: 'languages', observations: ['TypeScript', 'JavaScript'] },
      { id: 'frameworks', observations: ['React', 'NestJS'] },
      { id: 'secrets', observations: ['private evidence must remain private'] },
    ],
    warnings: ['internal note'],
  },
  createdAt: new Date('2026-10-09T08:30:00Z'),
  sourceSha: 'a'.repeat(40),
}
function row(selected = true, profiles: SavedProfile[] = [profile]) {
  return {
    githubId: 42n,
    name: 'api',
    fullName: 'fixture/api',
    ownerLogin: 'fixture',
    defaultBranch: 'development',
    isPrivate: true,
    selected,
    installation: { accountLogin: 'fixture' },
    profiles,
  }
}
function setup(rows: ReturnType<typeof row>[]) {
  const prisma = {
    gitHubRepository: { findMany: vi.fn(async () => rows) },
    gitHubInstallation: {
      findMany: vi.fn(async () => [
        {
          id: 7n,
          accountLogin: 'fixture',
          active: true,
          syncState: 'SYNCED',
          lastVerifiedAt: new Date('2026-10-09T08:00:00Z'),
          lastSyncAttemptAt: null,
        },
      ]),
    },
  }
  const provider = {
    verifyInstallation: vi.fn(),
    listInstallationRepositories: vi.fn(),
    readRepositorySnapshot: vi.fn(),
    verifyRepositoryAccess: vi.fn(),
  }
  const service = new GitHubService(
    prisma as unknown as PrismaService,
    provider as unknown as GitHubProviderService,
  )
  return { service, prisma, provider }
}

describe('repository inventory technology projection', () => {
  it('collects one newest saved profile only within active, available repository scope', async () => {
    const { service, prisma } = setup([row()])
    await service.repositoryOverview()
    expect(prisma.gitHubRepository.findMany).toHaveBeenCalledOnce()
    expect(prisma.gitHubRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { available: true, installation: { active: true } },
        select: expect.objectContaining({
          profiles: {
            where: { repository: { selected: true } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { report: true, createdAt: true, sourceSha: true },
          },
        }),
      }),
    )
    expect(prisma.gitHubInstallation.findMany).toHaveBeenCalledOnce()
  })

  it('returns known language/framework names and exact saved revision without raw profile leakage', async () => {
    const { service } = setup([row()])
    const result = await service.repositoryOverview()
    expect(result.repositories[0]).toEqual({
      githubId: '42',
      name: 'api',
      fullName: 'fixture/api',
      ownerLogin: 'fixture',
      defaultBranch: 'development',
      isPrivate: true,
      selected: true,
      installation: { accountLogin: 'fixture' },
      technologies: ['TypeScript', 'JavaScript', 'React', 'NestJS'],
      profiledAt: profile.createdAt,
      profileSha: profile.sourceSha,
    })
    expect(JSON.stringify(result)).not.toContain('private evidence')
    expect(JSON.stringify(result)).not.toContain('internal note')
    expect(result.repositories[0]).not.toHaveProperty('report')
    expect(result.repositories[0]).not.toHaveProperty('profiles')
  })

  it('uses empty technology and null revision metadata for an unprofiled selection', async () => {
    const { service } = setup([row(true, [])])
    expect((await service.repositoryOverview()).repositories[0]).toMatchObject({
      selected: true,
      technologies: [],
      profiledAt: null,
      profileSha: null,
    })
  })

  it('withholds saved profile details for an unselected repository even if the query returns them', async () => {
    const { service } = setup([row(false)])
    expect((await service.repositoryOverview()).repositories[0]).toMatchObject({
      selected: false,
      technologies: [],
      profiledAt: null,
      profileSha: null,
    })
  })

  it('reuses bounded dashboard projection and excludes malformed or unrelated profile observations', async () => {
    const report = {
      signals: [
        {
          id: 'languages',
          observations: [
            'TypeScript',
            123,
            'x'.repeat(81),
            'JavaScript',
            'Go',
            'Rust',
            'Python',
          ],
        },
        {
          id: 'frameworks',
          observations: ['React', 'NestJS', 'Express', 'Fastify'],
        },
        { id: 'private', observations: ['never exposed'] },
      ],
    }
    const { service } = setup([row(true, [{ ...profile, report }])])
    expect(
      (await service.repositoryOverview()).repositories[0]?.technologies,
    ).toEqual(['TypeScript', 'JavaScript', 'Go', 'Rust', 'React', 'NestJS'])
  })

  it('handles malformed profile content without guessing a stack or losing saved revision metadata', async () => {
    const { service } = setup([row(true, [{ ...profile, report: null }])])
    expect((await service.repositoryOverview()).repositories[0]).toMatchObject({
      technologies: [],
      profiledAt: profile.createdAt,
      profileSha: profile.sourceSha,
    })
  })

  it('never consults the provider on normal inventory reads or triggers one request per repository', async () => {
    const { service, prisma, provider } = setup([
      row(),
      { ...row(), githubId: 43n },
    ])
    const result = await service.listRepositories()
    expect(result.repositories).toHaveLength(2)
    expect(prisma.gitHubRepository.findMany).toHaveBeenCalledOnce()
    expect(prisma.gitHubInstallation.findMany).toHaveBeenCalledOnce()
    for (const request of Object.values(provider))
      expect(request).not.toHaveBeenCalled()
  })

  it('preserves installation metadata when no repositories are available', async () => {
    const { service } = setup([])
    const result = await service.repositoryOverview()
    expect(result.repositories).toEqual([])
    expect(result.installations[0]).toMatchObject({
      id: '7',
      accountLogin: 'fixture',
      active: true,
      syncState: 'SYNCED',
    })
  })
})

it('projects discovered Terraform and YAML file hints into inventory stack without rescanning content', async () => {
  const report = discoverRepositoryProfile({
    sourceSha: profile.sourceSha,
    treeSha: 'b'.repeat(40),
    branch: 'main',
    fullName: 'fixture/iac',
    complete: true,
    warnings: [],
    files: [
      { path: 'main.tf', sha: 'c'.repeat(40), size: 1 },
      { path: 'gitops/app.yml', sha: 'd'.repeat(40), size: 1 },
    ],
  })
  const { service } = setup([row(true, [{ ...profile, report }])])
  expect(
    (await service.repositoryOverview()).repositories[0].technologies
  ).toEqual(['Terraform', 'YAML'])
})
