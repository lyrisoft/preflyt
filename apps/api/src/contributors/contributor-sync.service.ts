import { ForbiddenException, HttpException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { GitHubProviderService } from "../github/github-provider.service.js";
import { GitHubRateLimitError } from "../github/github-rate-limit.js";
import { normalizeContributorEvent } from "../github-events/contributor-event.js";
import { captureContributors } from "./capture.js";

type Claim = {
  repositoryId: string;
  installationId: string;
  accessRevision: number;
  attempts: number;
  leaseToken: string;
};
export class ContributorSyncService {
  constructor(
    private readonly db: PrismaService,
    private readonly github: GitHubProviderService,
  ) {}
  async enqueue(repositoryId: string, actorId: string) {
    return this.db.$transaction(async (tx) => {
      const repo = await tx.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          selected: true,
          available: true,
          installation: { active: true },
        },
        include: { installation: true },
      });
      if (!repo) throw new ForbiddenException("Repository is unavailable");
      const old = await tx.contributorSyncState.findUnique({
        where: { repositoryId },
      });
      if (old?.leaseUntil && old.leaseUntil > new Date())
        return { state: old.state, truncated: old.truncated };
      if (
        old?.lastAttemptAt &&
        Date.now() - old.lastAttemptAt.getTime() < 300000
      )
        throw new HttpException(
          "Recent contributor sync requested; retry after five minutes",
          429,
        );
      await tx.authThrottle.deleteMany({
        where: {
          action: "contributors-backfill",
          windowStart: { lt: new Date(Date.now() - 600000) },
        },
      });
      const windowStart = new Date(Math.floor(Date.now() / 300000) * 300000);
      const throttle = await tx.authThrottle.upsert({
        where: {
          action_keyHash_windowStart: {
            action: "contributors-backfill",
            keyHash: `contributors-backfill:${repo.id}`,
            windowStart,
          },
        },
        create: {
          action: "contributors-backfill",
          keyHash: `contributors-backfill:${repo.id}`,
          windowStart,
          count: 1,
        },
        update: { count: { increment: 1 } },
      });
      if (throttle.count > 1)
        throw new HttpException(
          "Recent contributor sync requested; retry after five minutes",
          429,
        );
      await tx.contributorSyncState.upsert({
        where: { repositoryId },
        create: {
          repositoryId,
          installationId: String(repo.installationId),
          accessRevision: repo.installation.accessRevision,
        },
        update: {
          state: "QUEUED",
          attempts: 0,
          nextAttemptAt: new Date(),
          failureCode: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          event: "contributors_sync_requested",
          actorId,
          metadata: {
            organizationId: repo.installation.organizationId,
            repositoryId: repo.githubId.toString(),
          },
        },
      });
      return { state: "QUEUED", truncated: false };
    });
  }
  async reconcile() {
    // One bounded repository per tick/worker. An atomic upsert claims a durable
    // lease; parallel workers cannot import the same repository simultaneously.
    await this.db.contributorSyncState.updateMany({
      where: {
        state: "RUNNING",
        attempts: { gte: 5 },
        leaseUntil: { lt: new Date() },
      },
      data: {
        state: "FAILED",
        failureCode: "WORKER_INTERRUPTED",
        leaseToken: null,
        leaseUntil: null,
      },
    });
    const token = randomUUID();
    const claims = await this.db.$queryRaw<Claim[]>`
   WITH candidate AS (
    SELECT r.id, r."installationId"::text AS installation, i."accessRevision" AS revision
    FROM "GitHubRepository" r JOIN "GitHubInstallation" i ON i.id=r."installationId"
    LEFT JOIN "ContributorSyncState" s ON s."repositoryId"=r.id
    WHERE r.selected AND r.available AND i.active
      AND (s."leaseUntil" IS NULL OR s."leaseUntil" < CURRENT_TIMESTAMP)
      AND (s."repositoryId" IS NULL OR s."installationId"<>r."installationId"::text OR s."accessRevision"<>i."accessRevision"
       OR (s.state IN ('QUEUED','RETRY','RUNNING') AND s."nextAttemptAt"<=CURRENT_TIMESTAMP))
    ORDER BY CASE WHEN s.state='QUEUED' THEN 0 ELSE 1 END, COALESCE(s."nextAttemptAt",r."createdAt"),r.id LIMIT 1
   )
   INSERT INTO "ContributorSyncState" ("repositoryId","installationId","accessRevision",state,attempts,"leaseToken","leaseUntil","lastAttemptAt","nextAttemptAt","updatedAt")
   SELECT id,installation,revision,'RUNNING',1,${token},CURRENT_TIMESTAMP+INTERVAL '20 minutes',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM candidate
   ON CONFLICT ("repositoryId") DO UPDATE SET state='RUNNING',"leaseToken"=${token},"leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '20 minutes',"lastAttemptAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP,
    "installationId"=EXCLUDED."installationId","accessRevision"=EXCLUDED."accessRevision",
    attempts=CASE WHEN "ContributorSyncState"."accessRevision"<>EXCLUDED."accessRevision" OR "ContributorSyncState"."installationId"<>EXCLUDED."installationId" THEN 1 ELSE "ContributorSyncState".attempts+1 END,
    "failureCode"=NULL
   WHERE ("ContributorSyncState"."leaseUntil" IS NULL OR "ContributorSyncState"."leaseUntil"<CURRENT_TIMESTAMP)
    AND ("ContributorSyncState"."installationId"<>EXCLUDED."installationId" OR "ContributorSyncState"."accessRevision"<>EXCLUDED."accessRevision" OR ("ContributorSyncState".state IN ('QUEUED','RETRY','RUNNING') AND "ContributorSyncState"."nextAttemptAt"<=CURRENT_TIMESTAMP))
   RETURNING "repositoryId","installationId","accessRevision",attempts,"leaseToken"
  `;
    if (!claims[0]) return;
    const claim = claims[0];
    const current = () =>
      this.db.gitHubRepository.findFirst({
        where: {
          id: claim.repositoryId,
          installationId: BigInt(claim.installationId),
          selected: true,
          available: true,
          installation: { active: true, accessRevision: claim.accessRevision },
        },
        include: { installation: { select: { organizationId: true } } },
      });
    try {
      const repo = await current();
      if (!repo) throw new ForbiddenException("Repository access changed");
      const result = await this.github.readContributorBackfill(
        repo.installationId,
        repo.githubId,
      );
      if (!(await current()))
        throw new ForbiddenException("Repository access changed");
      let importedRecords = 0;
      for (const item of result.observations) {
        const normalized = normalizeContributorEvent(item.event, item.body);
        if (!normalized) continue;
        if (
          normalized.installationId !== repo.installationId ||
          normalized.repositoryGithubId !== repo.githubId
        )
          throw new ForbiddenException(
            "Contributor source does not match repository",
          );
        const payloadHash = createHash("sha256")
          .update(
            JSON.stringify(normalized, (_key, value) =>
              typeof value === "bigint" ? value.toString() : value,
            ),
          )
          .digest("hex");
        const captured = await captureContributors(
          this.db,
          `backfill:${payloadHash}`,
          payloadHash,
          normalized.installationId,
          normalized.repositoryGithubId,
          normalized.activities,
          { token: claim.leaseToken, accessRevision: claim.accessRevision },
        );
        if (!captured.accepted)
          throw new ForbiddenException("Contributor sync context changed");
        if (!captured.duplicate)
          importedRecords += normalized.activities.length;
      }
      // Completion must also be fenced, including imports with zero observations.
      await this.db.$transaction(async (tx) => {
        const live = await tx.gitHubRepository.updateMany({
          where: {
            id: repo.id,
            selected: true,
            available: true,
            installationId: repo.installationId,
            installation: {
              active: true,
              accessRevision: claim.accessRevision,
            },
          },
          data: { selected: true },
        });
        if (!live.count)
          throw new ForbiddenException("Repository access changed");
        const done = await tx.contributorSyncState.updateMany({
          where: {
            repositoryId: repo.id,
            leaseToken: claim.leaseToken,
            leaseUntil: { gt: new Date() },
          },
          data: {
            state: result.truncated ? "PARTIAL" : "SYNCED",
            lastSyncedAt: new Date(),
            truncated: result.truncated,
            leaseToken: null,
            leaseUntil: null,
            failureCode: null,
          },
        });
        if (!done.count)
          throw new ForbiddenException("Contributor sync lease changed");
        await tx.auditEvent.create({
          data: {
            event: "contributors_backfilled",
            metadata: {
              organizationId: repo.installation.organizationId,
              repositoryId: repo.githubId.toString(),
              automatic: true,
              importedRecords,
              truncated: result.truncated,
              limits: result.limits,
            },
          },
        });
      });
    } catch (error) {
      const limited = error instanceof GitHubRateLimitError;
      const response = limited
        ? (error.getResponse() as { retryAt?: string })
        : null;
      const retryAt = response?.retryAt
        ? new Date(response.retryAt)
        : new Date(
            Date.now() +
              Math.min(3600000, 30000 * 2 ** Math.min(claim.attempts - 1, 7)),
          );
      await this.db.contributorSyncState.updateMany({
        where: {
          repositoryId: claim.repositoryId,
          leaseToken: claim.leaseToken,
        },
        data: {
          state: claim.attempts >= 5 && !limited ? "FAILED" : "RETRY",
          nextAttemptAt: retryAt,
          leaseToken: null,
          leaseUntil: null,
          failureCode: limited
            ? "GITHUB_RATE_LIMITED"
            : error instanceof ForbiddenException
              ? "ACCESS_CHANGED"
              : "IMPORT_FAILED",
        },
      });
    }
  }
}
