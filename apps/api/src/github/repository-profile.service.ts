import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { resolveWebOrigin } from '../config/web-origin.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { GitHubProviderService } from './github-provider.service.js'
import {
  discoverRepositoryProfile,
  validProfileBranch,
} from './repository-profile.js'

@Injectable()
export class RepositoryProfileService {
  private readonly inFlight = new Set<string>()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GitHubProviderService)
    private readonly provider: GitHubProviderService,
  ) {}

  private async selectedRepository(rawId: string) {
    if (!/^[1-9]\d{0,15}$/.test(rawId) || !Number.isSafeInteger(Number(rawId)))
      throw new ForbiddenException('Repository is unavailable')
    const repository = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(rawId),
        selected: true,
        installation: { active: true },
      },
    })
    if (!repository)
      throw new ForbiddenException(
        'Select an available repository before inspecting its profile',
      )
    return repository
  }

  async get(rawId: string) {
    const repository = await this.selectedRepository(rawId)
    const profile = await this.prisma.repositoryProfile.findFirst({
      where: { repositoryId: repository.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return {
      repository: {
        githubId: repository.githubId.toString(),
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
      },
      profile,
      sync: await this.prisma.gitHubInstallation.findUnique({
        where: { id: repository.installationId },
        select: {
          syncState: true,
          lastVerifiedAt: true,
          lastSyncAttemptAt: true,
        },
      }),
    }
  }

  async discover(
    rawId: string,
    actorId: string,
    origin: string | undefined,
    branch?: string,
  ) {
    if (origin !== resolveWebOrigin())
      throw new ForbiddenException('Request origin is not allowed')
    const repository = await this.selectedRepository(rawId)
    if (branch !== undefined && !validProfileBranch(branch))
      throw new BadRequestException(
        'Enter a valid branch name, such as development',
      )
    if (this.inFlight.has(repository.id) || this.inFlight.size >= 4)
      throw new HttpException(
        'Repository discovery is already running; try again shortly',
        429,
      )
    this.inFlight.add(repository.id)
    try {
      const snapshot = await this.provider.readRepositorySnapshot(
        repository.installationId,
        repository.githubId,
        branch,
      )
      const report = discoverRepositoryProfile(snapshot)
      const profile = await this.prisma.$transaction(async (tx) => {
        // Lock installation then repository, matching the onboarding/reconciliation order.
        const active = await tx.gitHubInstallation.updateMany({
          where: { id: repository.installationId, active: true },
          data: { lastVerifiedAt: new Date() },
        })
        if (active.count !== 1)
          throw new ForbiddenException(
            'GitHub installation is no longer available',
          )
        const selected = await tx.gitHubRepository.updateMany({
          where: {
            id: repository.id,
            installationId: repository.installationId,
            selected: true,
          },
          data: { selected: true },
        })
        if (selected.count !== 1)
          throw new ForbiddenException(
            'Repository selection changed during discovery',
          )
        const saved = await tx.repositoryProfile.create({
          data: {
            repositoryId: repository.id,
            sourceSha: snapshot.sourceSha,
            treeSha: snapshot.treeSha,
            branch: snapshot.branch,
            fullName: snapshot.fullName,
            version: report.version,
            complete: report.complete,
            report,
          },
        })
        await tx.auditEvent.create({
          data: {
            event: 'repository_profile_discovered',
            actorId,
            metadata: {
              repositoryId: rawId,
              profileId: saved.id,
              sourceSha: snapshot.sourceSha,
              treeSha: snapshot.treeSha,
              branch: snapshot.branch,
              complete: report.complete,
            },
          },
        })
        return saved
      })
      return {
        repository: {
          githubId: rawId,
          fullName: snapshot.fullName,
          defaultBranch: repository.defaultBranch,
        },
        profile,
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new ServiceUnavailableException(
        'Repository discovery failed; the previous profile was preserved',
      )
    } finally {
      this.inFlight.delete(repository.id)
    }
  }
}
