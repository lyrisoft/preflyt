import { configurationValue } from '../configuration/runtime-configuration.js'
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { digest } from "../assessments/assessment-digest.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GitHubProviderService } from "./github-provider.service.js";
import { attributedSuite, summarizeRulesetSuites } from "./ruleset-insights.js";
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
    } catch {
      await this.prisma.gitHubInsightsSync.updateMany({
        where: { repositoryId, leaseId },
        data: {
          leaseId: null,
          leaseUntil: null,
          nextRunAt: new Date(Date.now() + 300000),
          error: true,
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
      page: number;
      period: string;
      ref?: string;
      actor?: string;
      result?: string;
    },
  ) {
    const days: Record<string, number> = {
        hour: 1 / 24,
        day: 1,
        week: 7,
        month: 30,
        quarter: 90,
      },
      retention = insightsRetentionDays();
    const cutoff = new Date(
      Date.now() - Math.min(days[options.period], retention) * 86400000,
    );
    const where = {
      repositoryId,
      rulesetIds: { has: BigInt(rulesetId) },
      pushedAt: { gte: cutoff },
      ...(options.ref ? { ref: options.ref } : {}),
      ...(options.actor ? { actor: options.actor } : {}),
    };
    const [rows, sync] = await Promise.all([
      this.prisma.gitHubRuleSuiteSnapshot.findMany({
        where,
        orderBy: [{ pushedAt: "desc" }, { suiteId: "desc" }],
        skip: (options.page - 1) * 20,
        take: 21,
      }),
      this.prisma.gitHubInsightsSync.findUnique({ where: { repositoryId } }),
    ]);
    const suites = rows.slice(0, 20).flatMap((row) => {
      if (digest(row.raw) !== row.digest)
        throw new ServiceUnavailableException(
          "Retained evaluation could not be verified",
        );
      const checked = snapshotDetail(
        row.raw as Record<string, any>,
        githubId.toString(),
      );
      if (
        checked.suiteId !== row.suiteId ||
        checked.sourceSha !== row.sourceSha ||
        checked.actor !== row.actor ||
        checked.ref !== row.ref ||
        checked.pushedAt.getTime() !== row.pushedAt.getTime()
      )
        throw new ServiceUnavailableException(
          "Retained evaluation identity changed",
        );
      const suite = attributedSuite(
        row.raw as Record<string, any>,
        githubId.toString(),
        rulesetId,
      );
      if (!suite)
        throw new ServiceUnavailableException(
          "Retained ruleset attribution changed",
        );
      const rules =
        options.result && options.result !== "all"
          ? suite.rules.filter((rule) => rule.result === options.result)
          : suite.rules;
      return rules.length ? [{ ...suite, rules }] : [];
    });
    return {
      source: "RETAINED_GITHUB_RULE_SUITES",
      scope: "CURRENT_RETAINED_PAGE",
      counting: "MATCHED_RULE_OCCURRENCES",
      page: options.page,
      period: options.period,
      hasMore: rows.length > 20,
      scannedSuites: Math.min(rows.length, 20),
      suites,
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
