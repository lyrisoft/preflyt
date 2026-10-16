import { PrismaService } from '../prisma/prisma.service.js'
import {
  GitHubProviderService,
  GitHubInstallationRevokedError,
} from './github-provider.service.js'
/** Background-only GitHub read model repair. Leases limit duplicate upstream work; revisions prevent stale restoration. */
export class GitHubSyncService {
  private stopped = false
  close() {
    this.stopped = true
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: GitHubProviderService,
  ) {}
  async reconcile() {
    const due = await this.prisma.gitHubInstallation.findMany({
      where: {
        OR: [
          { syncState: 'PENDING' },
          { lastSyncAttemptAt: null },
          { lastSyncAttemptAt: { lt: new Date(Date.now() - 300000) } },
        ],
      },
      orderBy: { lastSyncAttemptAt: 'asc' },
      take: 20,
      select: { id: true },
    })
    for (const installation of due) {
      if (this.stopped) break
      try {
        await this.sync(installation.id)
      } catch {
        /* Recorded below; retry on the next interval. */
      }
    }
  }
  async sync(id: bigint) {
    if (this.stopped) return
    const before = await this.prisma.gitHubInstallation.findUnique({
      where: { id },
    })
    if (!before) return
    const lease = new Date(Date.now() + 300000)
    const claimed = await this.prisma.gitHubInstallation.updateMany({
      where: {
        id,
        accessRevision: before.accessRevision,
        OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: new Date() } }],
      },
      data: { syncLeaseUntil: lease, lastSyncAttemptAt: new Date() },
    })
    if (!claimed.count) return
    try {
      const info = await this.provider.verifyInstallation(id)
      const repositories = await this.provider.listInstallationRepositories(id)
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.gitHubInstallation.updateMany({
          where: {
            id,
            accessRevision: before.accessRevision,
            syncLeaseUntil: lease,
          },
          data: {
            active: true,
            accountLogin: info.accountLogin,
            accountType: info.accountType,
            repositorySelection: info.repositorySelection,
            permissions: info.permissions,
            lastVerifiedAt: new Date(),
            syncState: 'OK',
            syncLeaseUntil: null,
          },
        })
        if (!current.count) return
        for (const repo of repositories) {
          const existing = await tx.gitHubRepository.findUnique({
            where: { githubId: repo.id },
          })
          // Never move a repository from another installation as a background side effect.
          if (existing && existing.installationId !== id) continue
          await tx.gitHubRepository.upsert({
            where: { githubId: repo.id },
            create: {
              githubId: repo.id,
              installationId: id,
              selected: before.repositoryTracking === 'INSTALLATION',
              ...{
                name: repo.name,
                fullName: repo.fullName,
                ownerLogin: repo.ownerLogin,
                defaultBranch: repo.defaultBranch,
                isPrivate: repo.isPrivate,
              },
            },
            update: {
              available: true,
              name: repo.name,
              fullName: repo.fullName,
              ownerLogin: repo.ownerLogin,
              defaultBranch: repo.defaultBranch,
              isPrivate: repo.isPrivate,
            },
          })
        }
        await tx.gitHubRepository.updateMany({
          where: {
            installationId: id,
            githubId: { notIn: repositories.map((repo) => repo.id) },
          },
          data: { selected: false, available: false },
        })
        await tx.auditEvent.create({
          data: {
            event: 'github_sync_completed',
            actorId: null,
            metadata: {
              installationId: id.toString(),
              repositoryCount: repositories.length,
            },
          },
        })
      })
    } catch (error) {
      await this.prisma.$transaction(async (tx) => {
        const revoked = error instanceof GitHubInstallationRevokedError
        const changed = await tx.gitHubInstallation.updateMany({
          where: {
            id,
            accessRevision: before.accessRevision,
            syncLeaseUntil: lease,
          },
          data: {
            syncLeaseUntil: null,
            syncState: revoked ? 'REVOKED' : 'ERROR',
            ...(revoked
              ? { active: false, accessRevision: { increment: 1 } }
              : {}),
          },
        })
        if (changed.count && revoked) {
          await tx.gitHubRepository.updateMany({
            where: { installationId: id },
            data: { selected: false, available: false },
          })
          await tx.auditEvent.create({
            data: {
              event: 'github_installation_unavailable',
              actorId: null,
              metadata: { installationId: id.toString() },
            },
          })
        }
      })
      throw error
    } finally {
      await this.prisma.gitHubInstallation.updateMany({
        where: { id, syncLeaseUntil: lease },
        data: { syncLeaseUntil: null },
      })
    }
  }
}
