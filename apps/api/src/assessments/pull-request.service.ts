import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { readPullRequestContext } from '../github-events/pull-request-context.js'
import { digest } from './assessment-plan.js'
@Injectable()
export class PullRequestService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private async repository(id: string) {
    if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new ForbiddenException('Repository is unavailable')
    const repo = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(id),
        selected: true,
        available: true,
        installation: { active: true },
      },
      include: { installation: { select: { accessRevision: true } } },
    })
    if (!repo) throw new ForbiddenException('Repository is unavailable')
    return repo
  }
  async list(id: string) {
    const repo = await this.repository(id)
    const rows = await this.prisma.repositoryPullRequest.findMany({
      where: { repositoryId: repo.id },
      orderBy: [{ number: 'desc' }],
      take: 51,
    })
    return {
      pullRequests: rows.slice(0, 50).map((row) => ({
        ...row,
        verification: this.verified(row, repo)
          ? 'RECENTLY_VERIFIED'
          : 'UNVERIFIED',
      })),
      truncated: rows.length > 50,
    }
  }
  private verified(
    row: {
      syncState: string
      verifiedAt: Date | null
      verifiedAccessRevision: number | null
      verifiedInstallationId: string | null
    },
    repo: { installationId: bigint; installation: { accessRevision: number } },
  ) {
    return (
      row.verifiedInstallationId === repo.installationId.toString() &&
      row.verifiedAccessRevision === repo.installation.accessRevision &&
      row.syncState === 'SYNCED' &&
      !!row.verifiedAt &&
      Date.now() - row.verifiedAt.getTime() >= 0 &&
      Date.now() - row.verifiedAt.getTime() < 300000
    )
  }
  async get(id: string, number: string) {
    const repo = await this.repository(id)
    if (!/^[1-9]\d{0,9}$/.test(number) || Number(number) > 2147483647)
      throw new NotFoundException('Pull request is unavailable')
    const row = await this.prisma.repositoryPullRequest.findUnique({
      where: {
        repositoryId_number: { repositoryId: repo.id, number: Number(number) },
      },
    })
    if (!row) throw new NotFoundException('Pull request is unavailable')
    const context = readPullRequestContext(row.context)
    const response = {
      pullRequest: row,
      verification: this.verified(row, repo)
        ? 'RECENTLY_VERIFIED'
        : 'UNVERIFIED',
      readiness: 'NOT_EVALUATED',
      qualityGate: null,
      prAssessment: null as { id: string; assessmentHash: string } | null,
      ciAssessment: null as { id: string; assessmentHash: string } | null,
      reason: null as string | null,
      collectionTruncated: false,
    }
    if (
      !this.verified(row, repo) ||
      !context ||
      context.base.repositoryId !== repo.githubId.toString()
    ) {
      response.reason = 'CURRENT_STATE_UNVERIFIED'
      return response
    }
    if (context.state !== 'open' || context.merged) {
      response.reason = 'PR_CLOSED'
      return response
    }
    if (context.head.repositoryId !== context.base.repositoryId) {
      response.reason = 'FORK_HEAD_UNSUPPORTED'
      return response
    }
    const selection = await this.prisma.repositoryStandardsSelection.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { revision: 'desc' },
    })
    if (!selection) {
      response.reason = 'STANDARDS_NOT_ADOPTED'
      return response
    }
    const binding = await this.prisma.repositoryCiBindings.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { revision: 'desc' },
    })
    const bindingId = binding?.selectionId === selection.id ? binding.id : null
    const candidates = await this.prisma.commitAssessment.findMany({
      where: {
        repositoryId: repo.id,
        sourceSha: context.head.sha,
        selectionId: selection.id,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 101,
    })
    response.collectionTruncated = candidates.length > 100
    for (const candidate of candidates.slice(0, 100)) {
      const request = candidate.request as any
      if (
        (request.sourceBindings?.id ?? null) !== bindingId ||
        request.installationId !== repo.installationId.toString() ||
        request.sourceSha !== context.head.sha
      )
        continue
      const isPr =
        request.subjectKind === 'PULL_REQUEST' &&
        !!request.pullRequest &&
        digest(request.pullRequest) ===
          digest({ ...context, number: row.number, objectId: row.objectId })
      const isCi =
        request.trigger === 'GITHUB_CI' && request.subjectKind === 'COMMIT'
      if (!isPr && !isCi) continue
      if (
        digest({
          request: candidate.request,
          plan: candidate.plan,
          report: candidate.report,
        }) !== candidate.assessmentHash
      )
        throw new ConflictException('Assessment integrity check failed')
      const link = {
        id: candidate.id,
        assessmentHash: candidate.assessmentHash,
      }
      if (isPr && !response.prAssessment) response.prAssessment = link
      if (isCi && !response.ciAssessment) response.ciAssessment = link
    }
    // Do not return links if a concurrently processed event or policy edit changed the read context.
    const [current, adoption, approved] = await Promise.all([
      this.prisma.repositoryPullRequest.findUnique({ where: { id: row.id } }),
      this.prisma.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      }),
      this.prisma.repositoryCiBindings.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: 'desc' },
      }),
    ])
    const access = await this.repository(id)
    if (
      !current ||
      !this.verified(current, access) ||
      current.revision !== row.revision ||
      adoption?.id !== selection.id ||
      (approved?.selectionId === selection.id ? approved.id : null) !==
        bindingId
    ) {
      response.prAssessment = null
      response.ciAssessment = null
      response.verification = 'UNVERIFIED'
      response.reason = 'CONTEXT_CHANGED'
      return response
    }
    response.reason =
      response.prAssessment || response.ciAssessment
        ? 'EXECUTION_NOT_VERIFIED'
        : 'NO_APPLICABLE_ASSESSMENT'
    return response
  }
}
