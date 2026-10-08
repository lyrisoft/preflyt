import { PrismaService } from '../prisma/prisma.service.js'
import { GitHubProviderService } from './github-provider.service.js'
export class GitHubPrSyncService {
  private stopped = false
  close() {
    this.stopped = true
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: GitHubProviderService,
  ) {}
  async reconcile() {
    const due = await this.prisma.repositoryPullRequest.findMany({
      where: {
        repository: {
          selected: true,
          available: true,
          installation: { active: true },
        },
        OR: [
          { lastSyncAttemptAt: null },
          { lastSyncAttemptAt: { lt: new Date(Date.now() - 300000) } },
        ],
      },
      orderBy: { lastSyncAttemptAt: 'asc' },
      take: 20,
    })
    for (const row of due) {
      if (this.stopped) break
      await this.sync(row.id)
    }
  }
  async sync(id: string) {
    if (this.stopped) return
    const before = await this.prisma.repositoryPullRequest.findUnique({
      where: { id },
      include: { repository: { include: { installation: true } } },
    })
    if (
      !before ||
      !before.repository.selected ||
      !before.repository.available ||
      !before.repository.installation.active
    )
      return
    const claimed = await this.prisma.repositoryPullRequest.updateMany({
      where: {
        id,
        revision: before.revision,
        lastSyncAttemptAt: before.lastSyncAttemptAt,
      },
      data: { lastSyncAttemptAt: new Date() },
    })
    if (!claimed.count) return
    try {
      const result = await this.provider.readPullRequest(
        before.repository.installationId,
        before.repository.githubId,
        before.number,
      )
      if (this.stopped) return
      if (result.sourceObjectId !== before.objectId || !result.sourceUpdatedAt)
        throw new Error('PR identity unavailable')
      await this.prisma.$transaction(async (tx) => {
        const installation = await tx.gitHubInstallation.updateMany({
          where: {
            id: before.repository.installationId,
            active: true,
            accessRevision: before.repository.installation.accessRevision,
          },
          data: { active: true },
        })
        const repo = await tx.gitHubRepository.updateMany({
          where: {
            id: before.repositoryId,
            selected: true,
            available: true,
            installationId: before.repository.installationId,
          },
          data: { selected: true },
        })
        if (!installation.count || !repo.count) return
        await tx.repositoryPullRequest.updateMany({
          where: { id, revision: before.revision },
          data: {
            context: result.context,
            sourceUpdatedAt: result.sourceUpdatedAt,
            revision: { increment: 1 },
            syncState: 'SYNCED',
            verifiedAt: new Date(),
            verifiedInstallationId: before.repository.installationId.toString(),
            verifiedAccessRevision:
              before.repository.installation.accessRevision,
          },
        })
      })
    } catch {
      await this.prisma.repositoryPullRequest.updateMany({
        where: { id, revision: before.revision },
        data: { syncState: 'ERROR', verifiedAt: null },
      })
    }
  }
}
