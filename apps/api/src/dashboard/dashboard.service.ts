import { latestRepositoryIds } from '../prisma/latest-repository-rows.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Prisma } from '../generated/prisma/client.js'
import { RedisCacheService } from '../cache/redis-cache.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { readPullRequestContext } from '../github-events/pull-request-context.js'
import { PullRequestService } from '../assessments/pull-request.service.js'
import { previewGate } from '../assessments/gate-preview.js'
import { digest } from '../assessments/assessment-digest.js'
import { attentionReason, profileTechnologies } from './dashboard-summary.js'

@Injectable()
export class DashboardService {
  private readonly inFlight = new Map<string, Promise<unknown>>()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisCacheService) private readonly cache: RedisCacheService,
  ) {}

  async overview(
    actorId: string,
    rawDays: unknown = '180',
    rawRepository?: unknown,
    authorizedIds?: string[],
  ) {
    if (
      !['7', '30', '90', '180'].includes(String(rawDays)) ||
      typeof rawDays !== 'string'
    )
      throw new BadRequestException('Choose a 7, 30, 90 or 180 day period')
    if (
      rawRepository !== undefined &&
      (typeof rawRepository !== 'string' ||
        !/^[1-9]\d{0,15}$/.test(rawRepository) ||
        !Number.isSafeInteger(Number(rawRepository)))
    )
      throw new BadRequestException('Choose a valid repository')
    const now = new Date()
    const days = Number(rawDays)
    const from = new Date(now)
    from.setUTCHours(0, 0, 0, 0)
    from.setUTCDate(from.getUTCDate() - days + 1)
    // Always read live selection/access before consulting a cached display summary.
    const scope = await this.prisma.gitHubRepository.findMany({
      where: {
        ...(authorizedIds ? { id: { in: authorizedIds } } : {}),
        selected: true,
        available: true,
        installation: { active: true },
      },
      select: {
        id: true,
        githubId: true,
        fullName: true,
        updatedAt: true,
        installationId: true,
        installation: { select: { accessRevision: true } },
      },
      orderBy: { id: 'asc' },
    })
    const repositories =
      rawRepository === undefined
        ? scope
        : scope.filter((row) => row.githubId.toString() === rawRepository)
    if (rawRepository !== undefined && !repositories.length)
      throw new ForbiddenException('Repository is unavailable')
    const key =
      'dashboard:v4:' +
      createHash('sha256')
        .update(
          JSON.stringify({
            actorId,
            app: configurationValue('GITHUB_APP_ID') ?? '',
            day: now.toISOString().slice(0, 10),
            days,
            repository: rawRepository ?? null,
            scope: scope.map((row) => [
              row.id,
              row.githubId.toString(),
              row.updatedAt.toISOString(),
              row.installationId.toString(),
              row.installation.accessRevision,
            ]),
          }),
        )
        .digest('hex')
    const cached = await this.cache.get(key)
    if (cached) {
      try {
        const value = JSON.parse(cached)
        if (
          value.version === 1 &&
          value.period?.days === days &&
          value.period?.from === from.toISOString().slice(0, 10) &&
          value.metrics?.repositories === repositories.length &&
          Array.isArray(value.repositories) &&
          Array.isArray(value.activity) &&
          Array.isArray(value.attention) &&
          Array.isArray(value.choices) &&
          typeof value.generatedAt === 'string' &&
          now.getTime() - Date.parse(value.generatedAt) >= 0 &&
          now.getTime() - Date.parse(value.generatedAt) < 30000
        )
          return value
      } catch {
        /* Redis is an accelerator, not the source of truth. */
      }
    }
    const pending = this.inFlight.get(key)
    if (pending) return pending
    const build = this.build(
      repositories.map((row) => row.id),
      from,
      now,
      days,
      scope.map((row) => ({
        githubId: row.githubId.toString(),
        fullName: row.fullName,
      })),
    )
      .then(async (summary) => {
        await this.cache.set(key, JSON.stringify(summary), 30)
        return summary
      })
      .finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, build)
    return build
  }

  private async build(
    ids: string[],
    from: Date,
    now: Date,
    days: number,
    choices: { githubId: string; fullName: string }[],
  ) {
    const repositories = ids.length
      ? await this.prisma.gitHubRepository.findMany({
          where: {
            id: { in: ids },
            selected: true,
            available: true,
            installation: { active: true },
          },
          select: {
            id: true,
            githubId: true,
            fullName: true,
            installationId: true,
            installation: {
              select: {
                accessRevision: true,
                syncState: true,
                lastVerifiedAt: true,
              },
            },

          },
          orderBy: { fullName: 'asc' },
        })
      : []
    const liveRepositoryIds = repositories.map(row => row.id)
    const [standardIds, profileIds, assessmentIds] = await Promise.all([
      latestRepositoryIds(this.prisma, 'RepositoryStandardsSelection', liveRepositoryIds),
      latestRepositoryIds(this.prisma, 'RepositoryProfile', liveRepositoryIds),
      latestRepositoryIds(this.prisma, 'CommitAssessment', liveRepositoryIds, Prisma.sql`"createdAt" <= ${now}`),
    ])
    const [standards, profiles, assessments] = await Promise.all([
      this.prisma.repositoryStandardsSelection.findMany({where:{id:{in:standardIds}},select:{repositoryId:true,id:true,profile:true}}),
      this.prisma.repositoryProfile.findMany({where:{id:{in:profileIds}},select:{repositoryId:true,report:true,complete:true,sourceSha:true,branch:true}}),
      this.prisma.commitAssessment.findMany({where:{id:{in:assessmentIds}},select:{repositoryId:true,id:true,sourceSha:true,createdAt:true,request:true,plan:true,report:true,assessmentHash:true}}),
    ])
    const standardsByRepo = new Map(standards.map(row => [row.repositoryId,row]))
    const profilesByRepo = new Map(profiles.map(row => [row.repositoryId,row]))
    const assessmentsByRepo = new Map(assessments.map(row => [row.repositoryId,row]))
    const rows = repositories.map(row => ({...row,
      standards: standardsByRepo.has(row.id) ? [standardsByRepo.get(row.id)!] : [],
      profiles: profilesByRepo.has(row.id) ? [profilesByRepo.get(row.id)!] : [],
      assessments: assessmentsByRepo.has(row.id) ? [assessmentsByRepo.get(row.id)!] : [],
    }))
    // A revocation during collection must not leave its data in the response.
    const liveIds = rows.map((row) => row.id)
    const [activity, totals, pullRequests] = liveIds.length
      ? await Promise.all([
          this.prisma.$queryRaw<{ date: string; count: bigint }[]>(Prisma.sql`
        SELECT to_char("createdAt", 'YYYY-MM-DD') AS date, count(*) AS count
        FROM "CommitAssessment" WHERE "repositoryId" IN (${Prisma.join(liveIds)}) AND "createdAt" >= ${from} AND "createdAt" <= ${now}
        GROUP BY date ORDER BY date
      `),
          this.prisma.$queryRaw<
            { snapshots: bigint; prs: bigint }[]
          >(Prisma.sql`
        SELECT count(*) AS snapshots, count(DISTINCT ("repositoryId", request->'pullRequest'->>'number')) FILTER (WHERE request->>'subjectKind' = 'PULL_REQUEST' AND request->'pullRequest'->>'number' ~ '^[1-9][0-9]*$') AS prs
        FROM "CommitAssessment" WHERE "repositoryId" IN (${Prisma.join(liveIds)}) AND "createdAt" >= ${from} AND "createdAt" <= ${now}
      `),
          this.prisma.repositoryPullRequest.findMany({
            where: {
              repositoryId: { in: liveIds },
              AND: [
                { context: { path: ['state'], equals: 'open' } },
                { context: { path: ['merged'], equals: false } },
              ],
            },
            orderBy: [
              { sourceUpdatedAt: { sort: 'desc', nulls: 'last' } },
              { number: 'desc' },
            ],
            take: 11,
          }),
        ])
      : [[], [{ snapshots: 0n, prs: 0n }], []]
    const byId = new Map(rows.map((row) => [row.id, row]))
    const repositoryData = rows.map((row) => ({
      githubId: row.githubId.toString(),
      fullName: row.fullName,
      technologies: profileTechnologies(row.profiles[0]?.report),
      profileComplete: row.profiles[0]?.complete ?? null,
      profileBranch: row.profiles[0]?.branch ?? null,
      policy: row.standards[0]?.profile ?? null,
      latestAssessment: row.assessments[0]
        ? {
            id: row.assessments[0].id,
            sourceSha: row.assessments[0].sourceSha,
            createdAt: row.assessments[0].createdAt.toISOString(),
          }
        : null,
      readiness: savedMergeReview(row.assessments[0]),
      sync: {
        state: row.installation.syncState,
        verifiedAt: row.installation.lastVerifiedAt?.toISOString() ?? null,
      },
    }))
    const attention = await Promise.all(pullRequests.slice(0, 10).map(async (row) => {
      const repo = byId.get(row.repositoryId)!
      const context = readPullRequestContext(row.context)
      let reason = attentionReason(row, repo, now)
      let readiness = 'NOT_EVALUATED'
      if (reason === 'ASSESSMENT_LOOKUP_REQUIRED') {
        try {
          const detail = await new PullRequestService(this.prisma).get(repo.githubId.toString(), String(row.number))
          reason = detail.reason ?? 'NO_APPLICABLE_ASSESSMENT'
          readiness = detail.readiness
        } catch (error) {
          if (error instanceof ConflictException) { reason = 'RESULT_UNAVAILABLE'; readiness = 'UNAVAILABLE' }
          else if (error instanceof ForbiddenException) { reason = 'CONTEXT_UNAVAILABLE' }
          else throw error
        }
      }
      return { number: row.number, repositoryId: repo.githubId.toString(), repository: repo.fullName,
        headRef: context?.head.ref ?? null, headSha: context?.head.sha ?? null, draft: context?.draft ?? false,
        updatedAt: row.sourceUpdatedAt?.toISOString() ?? null, reason, readiness }
    }))
    return {
      version: 1,
      generatedAt: now.toISOString(),
      period: {
        days,
        from: from.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
        timezone: 'UTC',
      },
      choices,
      metrics: {
        repositories: rows.length,
        snapshots: Number(totals[0]?.snapshots ?? 0),
        prsAssessed: Number(totals[0]?.prs ?? 0),
        standardsAdopted: rows.filter((row) => row.standards.length).length,
        repositoriesWithSnapshots: rows.filter((row) => row.assessments.length)
          .length,
      },
      activity: activity.map((entry) => ({
        date: entry.date,
        count: Number(entry.count),
      })),
      attention: attention.filter((row) => row.readiness !== 'PASS'),
      attentionTruncated: pullRequests.length > 10,
      repositories: repositoryData,
      limitations: [
        'Snapshot counts are recorded activity, not verified execution.',
        'Merge review results describe saved assessments, not current GitHub merge permission.',
        'GitHub state is the last synchronized local state, not a live provider query.',
      ],
    }
  }
}

/** Evaluate only the same frozen, integrity-checked assessment linked in this row. */
export function savedMergeReview(snapshot?: Parameters<typeof previewGate>[0]) {
  if (!snapshot) return 'NOT_EVALUATED'
  if (digest({ request: snapshot.request, plan: snapshot.plan, report: snapshot.report }) !== snapshot.assessmentHash)
    return 'UNAVAILABLE'
  return previewGate(snapshot).status
}
