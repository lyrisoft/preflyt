import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Prisma } from '../generated/prisma/client.js'
import { RedisCacheService } from '../cache/redis-cache.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { readPullRequestContext } from '../github-events/pull-request-context.js'
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
    rawDays: unknown = '90',
    rawRepository?: unknown,
  ) {
    if (
      !['7', '30', '90'].includes(String(rawDays)) ||
      typeof rawDays !== 'string'
    )
      throw new BadRequestException('Choose a 7, 30 or 90 day period')
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
      'dashboard:v1:' +
      createHash('sha256')
        .update(
          JSON.stringify({
            actorId,
            app: process.env.GITHUB_APP_ID ?? '',
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
    const rows = ids.length
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
            standards: {
              orderBy: { revision: 'desc' },
              take: 1,
              select: { id: true, profile: true },
            },
            profiles: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { report: true, complete: true, sourceSha: true },
            },
            assessments: {
              where: { createdAt: { lte: now } },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { id: true, sourceSha: true, createdAt: true },
            },
          },
          orderBy: { fullName: 'asc' },
        })
      : []
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
      policy: row.standards[0]?.profile ?? null,
      latestAssessment: row.assessments[0]
        ? {
            id: row.assessments[0].id,
            sourceSha: row.assessments[0].sourceSha,
            createdAt: row.assessments[0].createdAt.toISOString(),
          }
        : null,
      readiness: 'NOT_EVALUATED',
      sync: {
        state: row.installation.syncState,
        verifiedAt: row.installation.lastVerifiedAt?.toISOString() ?? null,
      },
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
        blockedPrs: null,
        openFindings: null,
        verifiedPolicyCoverage: null,
      },
      activity: activity.map((entry) => ({
        date: entry.date,
        count: Number(entry.count),
      })),
      attention: pullRequests.slice(0, 10).map((row) => {
        const repo = byId.get(row.repositoryId)!
        const context = readPullRequestContext(row.context)
        return {
          number: row.number,
          repositoryId: repo.githubId.toString(),
          repository: repo.fullName,
          headRef: context?.head.ref ?? null,
          headSha: context?.head.sha ?? null,
          draft: context?.draft ?? false,
          updatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
          reason: attentionReason(row, repo, now),
          readiness: 'NOT_EVALUATED',
        }
      }),
      attentionTruncated: pullRequests.length > 10,
      repositories: repositoryData,
      limitations: [
        'Snapshot counts are recorded activity, not verified execution.',
        'Quality gate outcomes, findings and verified policy coverage are not implemented.',
        'GitHub state is the last synchronized local state, not a live provider query.',
      ],
    }
  }
}
