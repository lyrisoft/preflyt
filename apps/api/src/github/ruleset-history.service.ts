import { GitHubRateLimitError } from './github-rate-limit.js';
import { readPageSize } from '../pagination.js'
import { configurationValue } from '../configuration/runtime-configuration.js'
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma, type GitHubRuleSuiteSnapshot } from "../generated/prisma/client.js";
import { digest } from "../assessments/assessment-digest.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GitHubProviderService } from "./github-provider.service.js";
import { attributedSuite, summarizeRulesetSuites, type RulesetSuite } from "./ruleset-insights.js";
export function insightsHistoryEnabled() {
  return configurationValue('RULESET_INSIGHTS_SYNC_ENABLED') === "true";
}
export function insightsRetentionDays() {
  const value = Number(configurationValue('RULESET_INSIGHTS_RETENTION_DAYS') ?? "90");
  if (!Number.isInteger(value) || value < 30 || value > 365)
    throw new Error("Ruleset history retention must be 30–365 days");
  return value;
}
export function snapshotDetail(raw: Record<string, any>, repositoryId: string) {
  if (
    JSON.stringify(raw).length > 262144 ||
    !Array.isArray(raw.rule_evaluations)
  )
    throw new ServiceUnavailableException("Invalid ruleset history detail");
  attributedSuite(raw, repositoryId, 0);
  const ids: number[] = [];
  for (const rule of raw.rule_evaluations) {
    if (rule.rule_source?.type !== "ruleset") continue;
    const id = rule.rule_source.id;
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ServiceUnavailableException("Invalid ruleset source");
    if (!ids.includes(id)) ids.push(id);
  }
  for (const id of ids) attributedSuite(raw, repositoryId, id);
  if (
    typeof raw.actor_name !== "string" ||
    raw.actor_name.length > 100 ||
    typeof raw.ref !== "string" ||
    raw.ref.length > 255
  )
    throw new ServiceUnavailableException("Invalid evaluation identity");
  return {
    suiteId: BigInt(raw.id),
    rulesetIds: ids.map(BigInt),
    actor: raw.actor_name as string,
    ref: raw.ref as string,
    sourceSha: raw.after_sha as string,
    pushedAt: new Date(raw.pushed_at),
    raw: raw as Prisma.InputJsonObject,
    digest: digest(raw),
  };
}
@Injectable()
export class RulesetHistoryService {
  private stopped = false;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GitHubProviderService)
    private readonly provider: GitHubProviderService,
  ) {}
  close() {
    this.stopped = true;
  }
  async linkAssessments(repositoryId: string, suites: RulesetSuite[]) {
    return Promise.all(suites.map(async suite => {
      const records = await this.prisma.commitAssessment.findMany({
        where: { repositoryId, sourceSha: suite.sourceSha },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 6,
      });
      for (const record of records) {
        if (digest({ request: record.request, plan: record.plan, report: record.report }) !== record.assessmentHash)
          throw new ServiceUnavailableException('Saved assessment could not be verified');
      }
      return { ...suite, assessments: records.slice(0, 5).map(record => ({ id: record.id, createdAt: record.createdAt.toISOString() })), moreAssessments: records.length > 5 };
    }));
  }
  private verifiedSuite(row: GitHubRuleSuiteSnapshot, githubId: bigint, rulesetId: number, result?: string) {
    if (digest(row.raw) !== row.digest) throw new ServiceUnavailableException('Retained evaluation could not be verified');
    const checked = snapshotDetail(row.raw as Record<string, any>, githubId.toString());
    if (checked.suiteId !== row.suiteId || checked.sourceSha !== row.sourceSha || checked.actor !== row.actor || checked.ref !== row.ref || checked.pushedAt.getTime() !== row.pushedAt.getTime())
      throw new ServiceUnavailableException('Retained evaluation identity changed');
    const suite = attributedSuite(row.raw as Record<string, any>, githubId.toString(), rulesetId);
    if (!suite) throw new ServiceUnavailableException('Retained ruleset attribution changed');
    const rules = result && result !== 'all' ? suite.rules.filter(rule => rule.result === result) : suite.rules;
    return rules.length ? [{ ...suite, rules }] : [];
  }
  async reconcile() {
    if (!insightsHistoryEnabled() || this.stopped) return;
    const retention = insightsRetentionDays();
    await this.prisma.gitHubRuleSuiteSnapshot.deleteMany({
      where: { pushedAt: { lt: new Date(Date.now() - retention * 86400000) } },
    });
    const now = new Date();
    const repos = await this.prisma.gitHubRepository.findMany({
      where: {
        selected: true,
        available: true,
        installation: { active: true },
        OR: [
          { insightsSync: null },
          {
            insightsSync: {
              nextRunAt: { lte: now },
              OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
            },
          },
        ],
      },
      orderBy: [{ insightsSync: { nextRunAt: "asc" } }, { id: "asc" }],
      take: 5,
      select: { id: true },
    });
    for (const repo of repos) {
      if (this.stopped) break;
      await this.sync(repo.id);
    }
  }
  async sync(repositoryId: string) {
    if (!insightsHistoryEnabled() || this.stopped) return;
    const retention = insightsRetentionDays();
    const repository = await this.prisma.gitHubRepository.findUnique({
      where: { id: repositoryId },
      include: { installation: true },
    });
    if (
      !repository?.selected ||
      !repository.available ||
      !repository.installation.active
    )
      return;
    await this.prisma.gitHubInsightsSync.upsert({
      where: { repositoryId },
      create: { repositoryId },
      update: {},
    });
    const before = await this.prisma.gitHubInsightsSync.findUniqueOrThrow({
      where: { repositoryId },
    });
    const now = new Date(),
      leaseId = randomUUID();
    const claim = await this.prisma.gitHubInsightsSync.updateMany({
      where: {
        repositoryId,
        nextPage: before.nextPage,
        nextRunAt: before.nextRunAt,
        AND: [{ nextRunAt: { lte: now } }],
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { leaseId, leaseUntil: new Date(now.getTime() + 300000) },
    });
    if (!claim.count) return;
    try {
      const page = await this.provider.readRepositoryRuleSuites(
        repository.installationId,
        repository.githubId,
        { page: before.nextPage, period: "month" },
      );
      if (before.nextPage === 1000 && page.details.length === 20) throw new Error('History sweep reached the bounded page limit');
      const snapshots = page.details.map((raw) =>
        snapshotDetail(raw, repository.githubId.toString()),
      );
      const fetchedAt = new Date(page.fetchedAt);
      if (!Number.isFinite(fetchedAt.getTime()) || this.stopped)
        throw new Error("History collection stopped");
      await this.prisma.$transaction(async (tx) => {
        const installation = await tx.gitHubInstallation.updateMany({
          where: {
            id: repository.installationId,
            active: true,
            accessRevision: repository.installation.accessRevision,
          },
          data: { active: true },
        });
        const repo = await tx.gitHubRepository.updateMany({
          where: {
            id: repositoryId,
            selected: true,
            available: true,
            installationId: repository.installationId,
          },
          data: { selected: true },
        });
        if (!installation.count || !repo.count)
          throw new Error("Repository access changed");
        const owned = await tx.gitHubInsightsSync.updateMany({
          where: { repositoryId, leaseId, leaseUntil: { gt: new Date() } },
          data: {
            leaseId: null,
            leaseUntil: null,
            nextPage: page.hasMore ? before.nextPage + 1 : 1,
            nextRunAt: new Date(Date.now() + (page.hasMore ? 5000 : 300000)),
            lastFetchedAt: fetchedAt,
            ...(page.hasMore ? {} : { lastSweepAt: fetchedAt }),
            error: false,
          },
        });
        if (!owned.count) throw new Error("History lease expired");
        for (const snapshot of snapshots) {
          await tx.gitHubRuleSuiteSnapshot.createMany({
            data: [{ ...snapshot, repositoryId, fetchedAt }],
            skipDuplicates: true,
          });
          const stored = await tx.gitHubRuleSuiteSnapshot.findUniqueOrThrow({
            where: {
              repositoryId_suiteId: { repositoryId, suiteId: snapshot.suiteId },
            },
          });
          if (
            stored.digest !== snapshot.digest ||
            digest(stored.raw) !== stored.digest
          )
            throw new Error(
              "Provider history changed; retained evidence preserved",
            );
        }
        await tx.gitHubRuleSuiteSnapshot.deleteMany({
          where: {
            repositoryId,
            pushedAt: { lt: new Date(Date.now() - retention * 86400000) },
          },
        });
      });
    } catch (error) {
      const limited = error instanceof GitHubRateLimitError;
      await this.prisma.gitHubInsightsSync.updateMany({
        where: { repositoryId, leaseId },
        data: {
          leaseId: null,
          leaseUntil: null,
          nextRunAt: limited ? new Date((error.getResponse() as {retryAt: string}).retryAt) : new Date(Date.now() + 300000),
          error: !limited,
        },
      });
    }
  }
  async read(
    repositoryId: string,
    githubId: bigint,
    rulesetId: number,
    repositoryName: string,
    options: {
      page: number; pageSize?: number;
      period: string;
      ref?: string;
      actor?: string;
      result?: string;
    },
  ) {
    const pageSize = readPageSize(options.pageSize);
    const days: Record<string, number> = {
        hour: 1 / 24,
        day: 1,
        week: 7,
        month: 30,
        quarter: 90,
      },
      retention = insightsRetentionDays();
    const now = new Date();
    const duration = days[options.period] * 86400000;
    const cutoff = new Date(now.getTime() - Math.min(days[options.period], retention) * 86400000);
    const previousSince = new Date(Math.max(now.getTime() - duration * 2, now.getTime() - retention * 86400000));
    const where = {
      repositoryId,
      rulesetIds: { has: BigInt(rulesetId) },
      pushedAt: { gte: cutoff, lte: now },
      ...(options.ref ? { ref: options.ref } : {}),
      ...(options.actor ? { actor: options.actor } : {}),
    };
    const [rows, sync, trendRows] = await Promise.all([
      this.prisma.gitHubRuleSuiteSnapshot.findMany({
        where,
        orderBy: [{ pushedAt: "desc" }, { suiteId: "desc" }],
        skip: (options.page - 1) * pageSize,
        take: pageSize + 1,
      }),
      this.prisma.gitHubInsightsSync.findUnique({ where: { repositoryId } }),
      this.prisma.gitHubRuleSuiteSnapshot.findMany({
        where: { ...where, pushedAt: { gte: previousSince, lte: now } },
        orderBy: [{ pushedAt: 'desc' }, { suiteId: 'desc' }], take: 1001,
      }),
    ]);
    const suites = rows.slice(0, pageSize).flatMap(row => this.verifiedSuite(row, githubId, rulesetId, options.result));
    const checkedTrend = trendRows.slice(0, 1000).flatMap(row => this.verifiedSuite(row, githubId, rulesetId, options.result));
    const current = checkedTrend.filter(suite => new Date(suite.pushedAt) >= cutoff);
    const previous = checkedTrend.filter(suite => new Date(suite.pushedAt) < cutoff);
    const buckets = new Map<string, RulesetSuite[]>();
    for (const suite of current) {
      const day = suite.pushedAt.slice(0, 10);
      buckets.set(day, [...(buckets.get(day) ?? []), suite]);
    }
    const trend = {
      scope: 'BOUNDED_COLLECTED_EVALUATIONS', counting: 'MATCHED_RULE_OCCURRENCES',
      since: cutoff.toISOString(), until: now.toISOString(),
      previousSince: previousSince.toISOString(), previousUntil: cutoff.toISOString(),
      previousWindowLimitedByRetention: previousSince.getTime() > now.getTime() - duration * 2,
      limit: 1000, truncated: trendRows.length > 1000,
      scannedSuites: Math.min(trendRows.length, 1000),
      current: summarizeRulesetSuites(current), previous: summarizeRulesetSuites(previous),
      days: [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([day, suites]) => ({ day, ...summarizeRulesetSuites(suites) })),
    };
    return {
      source: "RETAINED_GITHUB_RULE_SUITES",
      scope: "CURRENT_RETAINED_PAGE",
      counting: "MATCHED_RULE_OCCURRENCES",
      page: options.page,
      period: options.period,
      hasMore: rows.length > pageSize,
      scannedSuites: Math.min(rows.length, pageSize),
      suites,
      trend,
      summary: summarizeRulesetSuites(suites),
      fetchedAt: sync?.lastFetchedAt?.toISOString() ?? null,
      repositoryName,
      rulesetId,
      collection: {
        enabled: insightsHistoryEnabled(),
        error: sync?.error ?? false,
        lastSweepAt: sync?.lastSweepAt?.toISOString() ?? null,
        retentionDays: retention,
        since: cutoff.toISOString(),
        coverage: "COLLECTED_EVALUATIONS_ONLY",
      },
    };
  }
}
