import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  HttpException,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuthorizationService } from '../auth/authorization.service.js'
import type { AuthenticatedSession } from '../auth/session.guard.js'
import { GitHubProviderService } from '../github/github-provider.service.js'
import { normalizeContributorEvent } from '../github-events/contributor-event.js'
import { captureContributors } from './capture.js'

@Injectable()
export class ContributorsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
  ) {}
  async read(
    session: AuthenticatedSession,
    query: Record<string, unknown>,
    contributorId?: string,
  ) {
    const days = Number(query.days ?? 30),
      page = Number(query.page ?? 1),
      kind = String(query.kind ?? 'all'),
      relationship = String(query.relationship ?? 'all'),
      search = String(query.q ?? '')
        .trim()
        .toLowerCase()
    if (
      ![7, 30, 90, 180].includes(days) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !['all', 'HUMAN', 'BOT', 'UNKNOWN'].includes(kind) ||
      ![
        'all',
        'PR_AUTHOR',
        'REVIEWER',
        'COMMIT_AUTHOR',
        'COMMITTER',
        'MERGE_ACTOR',
      ].includes(relationship) ||
      search.length > 100
    )
      throw new BadRequestException('Invalid contributor filters')
    await this.access.requireOrganization(session, 'contributors.read')
    const scope = await this.access.repositoryScope(
      session.identityId,
      session.organizationId,
      'contributors.read',
    )
    const repositories =
      query.repository === undefined
        ? scope
        : scope.filter((r) => r.githubId.toString() === query.repository)
    if (query.repository !== undefined && !repositories.length)
      throw new ForbiddenException('Repository is unavailable')
    const from = new Date()
    from.setUTCHours(0, 0, 0, 0)
    from.setUTCDate(from.getUTCDate() - days + 1)
    const now = new Date()
    const member = await this.access.membership(
      session.identityId,
      session.organizationId,
    )
    const activityAllowed =
      !!member &&
      (
        await this.access.repositoryScope(
          session.identityId,
          session.organizationId,
          'contributors.activity.read',
        )
      ).length > 0
    if (contributorId && !activityAllowed)
      throw new ForbiddenException('Contributor activity permission required')
    const rows = await this.db.contributorObservation.findMany({
      where: {
        repositoryId: { in: repositories.map((r) => r.id) },
        observedAt: { gte: from, lte: now },
        ...(relationship === 'all' ? {} : { relationship }),
        ...(contributorId ? { contributorId } : {}),
        contributor: {
          ...(kind === 'all' ? {} : { kind }),
          ...(search
            ? { login: { contains: search, mode: 'insensitive' } }
            : {}),
        },
      },
      include: { contributor: true },
      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
      take: 5001,
    })
    if (contributorId && !rows.length)
      throw new ForbiddenException(
        'Contributor is unavailable in this scope or period',
      )
    const truncated = rows.length > 5000,
      observations = rows.slice(0, 5000)
    const repoById = new Map(repositories.map((r) => [r.id, r]))
    const seen = new Map<string, typeof observations>()
    for (const row of observations) {
      const group = seen.get(row.contributorId) ?? []
      group.push(row)
      seen.set(row.contributorId, group)
    }
    // Deduplicate PRs/reviews/commits by stable source object, independent of webhook redelivery and backfill.
    const unique = (group: typeof observations, rel: string) => {
      const result = new Map<string, (typeof observations)[number]>()
      for (const r of group.filter((r) => r.relationship === rel)) {
        const key = `${r.repositoryId}:${r.sourceObjectId}`
        if (!result.has(key)) result.set(key, r)
      }
      return result
    }
    const assessmentAllowed =
      !!member &&
      (
        await this.access.repositoryScope(
          session.identityId,
          session.organizationId,
          'contributors.policy_evidence.read',
        )
      ).length > 0
    const assessments = assessmentAllowed
      ? await this.db.commitAssessment.findMany({
          where: {
            repositoryId: { in: repositories.map((r) => r.id) },
            sourceSha: {
              in: [
                ...new Set(
                  observations
                    .filter((r) => r.relationship === 'PR_AUTHOR')
                    .map((r) => r.sourceSha),
                ),
              ],
            },
          },
          select: {
            id: true,
            repositoryId: true,
            sourceSha: true,
            createdAt: true,
            selectionId: true,
            request: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5001,
        })
      : []
    const associated = (r: (typeof observations)[number]) =>
      assessments.filter(
        (a) =>
          a.repositoryId === r.repositoryId &&
          a.sourceSha === r.sourceSha &&
          (a.request as any)?.pullRequest?.number === r.pullRequestNumber,
      )
    const allPrs = unique(observations, 'PR_AUTHOR')
    const data = [...seen.values()]
      .map((group) => {
        const c = group[0].contributor,
          prs = unique(group, 'PR_AUTHOR'),
          reviews = unique(group, 'REVIEWER'),
          commits = unique(group, 'COMMIT_AUTHOR')
        return {
          id: c.id,
          login: c.login,
          githubUserId: c.githubUserId,
          kind: c.kind,
          profileUrl: `https://github.com/${encodeURIComponent(c.login)}`,
          avatarUrl: `https://avatars.githubusercontent.com/u/${c.githubUserId}?s=80`,
          membership: 'UNLINKED',
          repositoryCount: new Set(group.map((r) => r.repositoryId)).size,
          authoredPrs: activityAllowed ? prs.size : null,
          mergedPrs: activityAllowed
            ? [...prs.values()].filter((r) => r.merged).length
            : null,
          reviews: activityAllowed ? reviews.size : null,
          commits: activityAllowed ? commits.size : null,
          lastObservedAt: group[0].observedAt.toISOString(),
        }
      })
      .sort((a, b) => a.login.localeCompare(b.login))
    const activity = new Map<string, Set<string>>()
    for (const r of observations) {
      const day = r.observedAt.toISOString().slice(0, 10)
      const ids = activity.get(day) ?? new Set()
      ids.add(`${r.repositoryId}:${r.relationship}:${r.sourceObjectId}`)
      activity.set(day, ids)
    }
    const snapshotPrs = [...allPrs.values()].filter(
      (r) => associated(r).length,
    ).length
    const summary = {
      contributors: data.length,
      repositories: new Set(observations.map((r) => r.repositoryId)).size,
      authoredPrs: activityAllowed ? allPrs.size : null,
      prsWithSnapshots: assessmentAllowed ? snapshotPrs : null,
      completeAssessmentCoverage: null,
      firstPassAdherence: null,
      finalAdherence: null,
      findings: null,
    }
    const receipt = await this.db.contributorDelivery.findFirst({
      where: { repositoryId: { in: repositories.map((r) => r.id) } },
      orderBy: { receivedAt: 'desc' },
    })
    await this.db.auditEvent.create({
      data: {
        event: 'contributors_accessed',
        actorId: session.identityId,
        metadata: {
          organizationId: session.organizationId!,
          detail: !!contributorId,
          repositoryCount: repositories.length,
          days,
        },
      },
    })
    return {
      choices: scope.map((r) => ({
        githubId: r.githubId.toString(),
        fullName: r.fullName,
      })),
      period: { days, from: from.toISOString(), to: now.toISOString() },
      scope: repositories.map((r) => ({
        githubId: r.githubId.toString(),
        fullName: r.fullName,
      })),
      summary,
      activity: activityAllowed
        ? [...activity]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, ids]) => ({ date, count: ids.size }))
        : [],
      assessmentActivity: assessmentAllowed
        ? [
            { name: 'Snapshot recorded', count: snapshotPrs },
            { name: 'No matching snapshot', count: allPrs.size - snapshotPrs },
          ]
        : [],
      permissions: {
        activity: activityAllowed,
        policyEvidence: assessmentAllowed,
      },
      page,
      pageSize: 20,
      total: data.length,
      truncated: truncated || assessments.length > 5000,
      contributors: contributorId
        ? data
        : data.slice((page - 1) * 20, page * 20),
      lastReceivedAt: receipt?.receivedAt.toISOString() ?? null,
      collectionEnabled: process.env.GITHUB_EVENTS_ENABLED === 'true' && (process.env.GITHUB_WEBHOOK_SECRET?.length ?? 0) >= 32,
      limitations: [
        'Counts describe observed activity, not employee productivity.',
        'Only selected, authorized installed repositories are included.',
        'Membership is unlinked; private organization membership is not inferred.',
        'Identities are installation-scoped; an account seen in multiple installations may appear more than once.',
        'Historical backfill is bounded; coverage can be partial. Push author names are not stable identities.',
        'Co-authors are not inferred from commit messages.',
        'Policy gates and confirmed findings are not implemented; adherence and complete-evidence coverage are unavailable.',
      ],
      ...(contributorId
        ? {
            observations: observations.map((r) => ({
              id: r.id,
              relationship: r.relationship,
              sourceSha: r.sourceSha,
              sourceObjectId: r.sourceObjectId,
              pullRequestNumber: r.pullRequestNumber,
              action: r.action,
              state: r.state,
              merged: r.merged,
              observedAt: r.observedAt.toISOString(),
              deliveryId: r.deliveryId,
              repositoryId: repoById.get(r.repositoryId)!.githubId.toString(),
              repository: repoById.get(r.repositoryId)!.fullName,
              sourceUrl: r.pullRequestNumber
                ? `https://github.com/${repoById.get(r.repositoryId)!.fullName}/pull/${r.pullRequestNumber}`
                : `https://github.com/${repoById.get(r.repositoryId)!.fullName}/commit/${r.sourceSha}`,
              assessments: assessmentAllowed
                ? associated(r).map((a) => ({
                    id: a.id,
                    sourceSha: a.sourceSha,
                    selectionId: a.selectionId,
                    createdAt: a.createdAt.toISOString(),
                  }))
                : [],
            })),
          }
        : {}),
    }
  }
  async backfill(session: AuthenticatedSession, id: string) {
    const repo = await this.access.requireRepository(
      session,
      id,
      'repository.manage',
    )
    // Durable cooldown prevents reloads/repeated clicks or multiple API replicas from repeating backfill.
    const cooldownKey = `contributors-backfill:${repo.id}`
    const windowStart = new Date(Math.floor(Date.now() / 300000) * 300000)
    const lease = await this.db.authThrottle.upsert({
      where: {
        action_keyHash_windowStart: {
          action: 'contributors-backfill',
          keyHash: cooldownKey,
          windowStart,
        },
      },
      create: {
        action: 'contributors-backfill',
        keyHash: cooldownKey,
        windowStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
    })
    if (lease.count > 1)
      throw new HttpException(
        'Recent contributor import already requested; retry after five minutes',
        429,
      )
    let result: Awaited<
      ReturnType<GitHubProviderService['readContributorBackfill']>
    >
    try {
      result = await this.github.readContributorBackfill(
        repo.installationId,
        repo.githubId,
      )
    } catch (error) {
      await this.db.authThrottle.deleteMany({ where: { id: lease.id } })
      throw error
    }
    await this.db.authThrottle.deleteMany({
      where: {
        action: 'contributors-backfill',
        windowStart: { lt: new Date(Date.now() - 600000) },
      },
    })
    // Access is checked again after upstream requests before committing an administrative sync.
    await this.access.requireRepository(session, id, 'repository.manage')
    for (const item of result.observations) {
      const normalized = normalizeContributorEvent(item.event, item.body)
      if (!normalized) continue
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify(normalized, (_key, v) =>
            typeof v === 'bigint' ? v.toString() : v,
          ),
        )
        .digest('hex')
      await captureContributors(
        this.db,
        `backfill:${payloadHash}`,
        payloadHash,
        normalized.installationId,
        normalized.repositoryGithubId,
        normalized.activities,
      )
    }
    await this.db.auditEvent.create({
      data: {
        event: 'contributors_backfilled',
        actorId: session.identityId,
        metadata: {
          organizationId: session.organizationId!,
          repositoryId: id,
          truncated: result.truncated,
          limits: result.limits,
        },
      },
    })
    return {
      observations: result.observations.length,
      truncated: result.truncated,
      limits: result.limits,
    }
  }
}
