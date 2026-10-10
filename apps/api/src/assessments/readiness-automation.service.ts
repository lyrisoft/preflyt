import { configurationValue } from '../configuration/runtime-configuration.js'
import { recordReadinessNotification } from "../notifications/notification-event.js";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import { readPullRequestContext } from "../github-events/pull-request-context.js";
import { AssessmentService } from "./assessment.service.js";
import { CheckPublicationService } from "./check-publication.service.js";
import { digest } from "./assessment-digest.js";
import { readinessCheck } from "../github/ruleset-draft.js";
export const automationEnabled = () =>
  configurationValue('GITHUB_CHECK_PUBLICATION_ENABLED') === "true" &&
  configurationValue('AUTOMATIC_CHECK_PUBLICATION_ENABLED') === "true";
export function automaticExternalId(
  repositoryId: string,
  prNumber: number,
  sourceSha: string,
) {
  return digest({
    kind: "AUTOMATIC_READINESS",
    repositoryId,
    prNumber,
    sourceSha,
  });
}
@Injectable()
export class ReadinessAutomationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
    @Inject(AssessmentService) private readonly assessments: AssessmentService,
    @Inject(CheckPublicationService)
    private readonly checks: CheckPublicationService,
  ) {}
  async list(session: AuthenticatedSession, githubId: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException("Invalid page");
    const repo = await this.access.requireRepository(
      session,
      githubId,
      "policy.read",
    );
    const [settings, tasks] = await Promise.all([
      this.prisma.readinessAutomation.findUnique({
        where: { repositoryId: repo.id },
      }),
      this.prisma.readinessTask.findMany({
        where: { repositoryId: repo.id },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 21,
      }),
    ]);
    return {
      available: automationEnabled(),
      settings: settings ?? { enabled: false, revision: 0 },
      page,
      hasMore: tasks.length > 20,
      tasks: tasks
        .slice(0, 20)
        .map(({ leaseToken, leaseUntil, ...task }) => task),
    };
  }
  async configure(
    session: AuthenticatedSession,
    githubId: string,
    enabled: boolean,
    expectedRevision: number,
  ) {
    if (
      typeof enabled !== "boolean" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0
    )
      throw new BadRequestException("Invalid automation settings");
    const repo = await this.access.requireRepository(
      session,
      githubId,
      "policy.publish",
    );
    if (enabled && !automationEnabled())
      throw new ServiceUnavailableException(
        "Enable automatic publication on the API and worker before enabling this repository",
      );
    if (enabled) await this.github.checkPublicationAccess(repo.installationId);
    return this.prisma.$transaction(async (tx) => {
      // Serialize configuration with deployments; disabling a required publisher is prohibited.
      await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${repo.id} FOR UPDATE`;
      await new AuthorizationService(tx as PrismaService).requireRepository(
        session,
        githubId,
        "policy.publish",
      );
      if (
        !enabled &&
        (await tx.gitHubRulesetDeployment.count({
          where: {
            repositoryId: repo.id,
            state: {
              in: ["ACTIVE", "DEPLOYING", "UNKNOWN", "DRIFTED", "ROLLING_BACK"],
            },
          },
        }))
      )
        throw new ConflictException(
          "Roll back the managed ruleset before disabling automatic checks",
        );
      const previous = await tx.readinessAutomation.findUnique({
        where: { repositoryId: repo.id },
      });
      if ((previous?.revision ?? 0) !== expectedRevision)
        throw new ConflictException("Settings changed. Refresh and try again");
      const data = {
        enabled,
        actorId: session.identityId,
        organizationId: session.organizationId!,
        revision: expectedRevision + 1,
      };
      const row = await tx.readinessAutomation.upsert({
        where: { repositoryId: repo.id },
        create: { repositoryId: repo.id, ...data },
        update: data,
      });
      await tx.readinessTask.updateMany({
        where: { repositoryId: repo.id },
        data: { nextAttemptAt: new Date(), revision: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          event: "github.readiness_automation_changed",
          actorId: session.identityId,
          metadata: {
            repositoryGithubId: githubId,
            enabled,
            revision: row.revision,
          },
        },
      });
      return row;
    });
  }
  private async invalidate(
    repo: { id: string; githubId: bigint; installationId: bigint },
    prNumber: number,
    sourceSha: string,
    reason: string,
  ) {
    return this.github.publishReadinessCheck(
      repo.installationId,
      repo.githubId,
      {
        name: readinessCheck,
        head_sha: sourceSha,
        external_id: automaticExternalId(repo.id, prNumber, sourceSha),
        status: "completed",
        conclusion: "action_required",
        output: {
          title: "Engineering readiness needs verification",
          summary: reason,
        },
      },
      false,
      true,
    );
  }
  /** Database jobs survive restarts. Discovery and processing are bounded and independently retryable. */
  async reconcile() {
    const configs = await this.prisma.readinessAutomation.findMany({
      where: {
        enabled: true,
        repository: {
          available: true,
          selected: true,
          installation: { active: true },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
      include: { repository: true },
    });
    for (const config of configs) {
      try {
        const prs = await this.github.readOpenReadinessPullRequests(
          config.repository.installationId,
          config.repository.githubId,
        );
        for (const pr of prs) {
          if (
            pr.headRepositoryId !== config.repository.githubId.toString() ||
            pr.draft
          )
            continue;
          await this.prisma.readinessTask.upsert({
            where: {
              repositoryId_prNumber: {
                repositoryId: config.repositoryId,
                prNumber: pr.number,
              },
            },
            create: { repositoryId: config.repositoryId, prNumber: pr.number },
            update: {},
          });
        }
      } catch {
        /* Existing tasks still run when inventory is temporarily unavailable. */
      }
      await this.prisma.readinessAutomation.updateMany({
        where: { repositoryId: config.repositoryId, revision: config.revision },
        data: { updatedAt: new Date() },
      });
    }
    const tasks = await this.prisma.readinessTask.findMany({
      where: {
        nextAttemptAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    for (const task of tasks) await this.process(task.id);
  }
  async process(id: string) {
    const leaseToken = randomUUID();
    const claim = await this.prisma.readinessTask.updateMany({
      where: {
        id,
        nextAttemptAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        leaseToken,
        leaseUntil: new Date(Date.now() + 300_000),
        state: "PROCESSING",
      },
    });
    if (!claim.count) return;
    const task = await this.prisma.readinessTask.findUniqueOrThrow({
      where: { id },
      include: { repository: { include: { installation: true } } },
    });
    const repo = task.repository;
    const finish = async (
      data: Record<string, any>,
      db: Pick<PrismaService, "readinessTask"> = this.prisma,
    ) =>
      db.readinessTask.updateMany({
        where: { id, leaseToken, revision: task.revision },
        data: { ...data, leaseToken: null, leaseUntil: null },
      });
    try {
      const config = await this.prisma.readinessAutomation.findUnique({
        where: { repositoryId: repo.id },
      });
      if (!repo.available || !repo.selected || !repo.installation.active)
        throw new Error("Repository access changed");
      const remote = await this.github.readPullRequest(
        repo.installationId,
        repo.githubId,
        task.prNumber,
      );
      const context = readPullRequestContext(remote.context);
      if (!context) throw new Error("Pull request unavailable");
      const active =
        config?.enabled &&
        automationEnabled() &&
        context.state === "open" &&
        !context.merged &&
        !context.draft &&
        context.head.repositoryId === repo.githubId.toString() &&
        context.base.repositoryId === repo.githubId.toString();
      // Revoke any former green result before authorization, assessment, or provider failures.
      if (task.sourceSha && (!active || task.sourceSha !== context.head.sha))
        await this.invalidate(
          repo,
          task.prNumber,
          task.sourceSha,
          "This result is no longer current. Automatic checks must be enabled for an open pull request.",
        );
      if (!active) {
        await finish({
          state: "DISABLED",
          conclusion: "action_required",
          nextAttemptAt: new Date(Date.now() + 60_000),
          message:
            "Automatic checks are disabled or this pull request is not eligible",
        });
        return;
      }
      const sourceSha = context.head.sha;
      const pending = await this.invalidate(
        repo,
        task.prNumber,
        sourceSha,
        "Preflyt is checking the current policy and CI evidence. Missing evidence never counts as passing.",
      );
      await this.prisma.readinessTask.updateMany({
        where: { id, leaseToken },
        data: {
          sourceSha,
          ...pending,
          conclusion: "action_required",
          verifiedAt: new Date(),
        },
      });
      const session: AuthenticatedSession = {
        authenticated: true,
        identityId: config.actorId,
        subject: config.actorId,
        email: null,
        role: "USER",
        organizationId: config.organizationId,
      };
      await this.access.requireRepository(
        session,
        repo.githubId.toString(),
        "policy.publish",
      );
      const selection =
        await this.prisma.repositoryStandardsSelection.findFirst({
          where: { repositoryId: repo.id },
          orderBy: { revision: "desc" },
        });
      if (!selection)
        throw new ConflictException(
          "Save engineering standards before enabling readiness checks",
        );
      const assessment = await this.assessments.createAutomatic(
        repo.githubId.toString(),
        sourceSha,
        selection.id,
        `auto:${id}:${leaseToken}`,
        config.actorId,
        { ...context, number: task.prNumber, objectId: remote.sourceObjectId },
      );
      const plan = await this.checks.plan(
        session,
        repo.githubId.toString(),
        task.prNumber,
        assessment.assessment.id,
        "policy.publish",
      );
      const latest = await this.checks.plan(
        session,
        repo.githubId.toString(),
        task.prNumber,
        assessment.assessment.id,
        "policy.publish",
      );
      const current = await this.prisma.readinessAutomation.findUniqueOrThrow({
        where: { repositoryId: repo.id },
      });
      const owner = await this.prisma.readinessTask.findUniqueOrThrow({
        where: { id },
      });
      if (
        !current.enabled ||
        !automationEnabled() ||
        current.revision !== config.revision ||
        owner.leaseToken !== leaseToken ||
        owner.revision !== task.revision ||
        latest.previewHash !== plan.previewHash
      )
        throw new ConflictException(
          "Policy, evidence, or automation changed during evaluation",
        );
      const receipt = await this.github.publishReadinessCheck(
        repo.installationId,
        repo.githubId,
        {
          ...plan.payload,
          external_id: automaticExternalId(repo.id, task.prNumber, sourceSha),
        },
        !!plan.policyEvaluation,
        true,
      );
      // A changed setting or PR immediately after publication must not leave an old green result.
      const after = await this.github.readPullRequest(
        repo.installationId,
        repo.githubId,
        task.prNumber,
      );
      await this.access.requireRepository(
        session,
        repo.githubId.toString(),
        "policy.publish",
      );
      const finalConfig =
        await this.prisma.readinessAutomation.findUniqueOrThrow({
          where: { repositoryId: repo.id },
        });
      if (
        digest(readPullRequestContext(after.context)) !== digest(context) ||
        !finalConfig.enabled ||
        !automationEnabled() ||
        finalConfig.revision !== config.revision
      )
        throw new ConflictException(
          "Pull request or authorization changed during publication",
        );
      await this.prisma.$transaction(async (tx) => {
        const saved = await finish(
          {
            state: "PUBLISHED",
            ...receipt,
            assessmentId: assessment.assessment.id,
            sourceSha,
            branchRef: `refs/heads/${context.base.ref}`,
            externalId: automaticExternalId(repo.id, task.prNumber, sourceSha),
            policyId: plan.policy?.id ?? null,
            policyHash: plan.policy?.definitionHash ?? null,
            evaluationHash: plan.policyEvaluation?.evaluationHash ?? null,
            conclusion: plan.payload.conclusion,
            verifiedAt: new Date(),
            attempts: 0,
            message: null,
            nextAttemptAt: new Date(Date.now() + 60_000),
          },
          tx,
        );
        if (!saved.count)
          throw new ConflictException("Publication ownership changed");
        await tx.auditEvent.create({
          data: {
            event: "github.automatic_readiness_verified",
            actorId: config.actorId,
            metadata: {
              taskId: id,
              repositoryGithubId: repo.githubId.toString(),
              sourceSha,
              policyId: plan.policy?.id ?? null,
              evaluationHash: plan.policyEvaluation?.evaluationHash ?? null,
              conclusion: plan.payload.conclusion,
              ...receipt,
            },
          },
        });
        await recordReadinessNotification(
          tx,
          repo,
          repo.installation.organizationId,
          config.actorId,
          task.prNumber,
          sourceSha,
          plan.policy?.definitionHash ?? null,
          plan.policyEvaluation?.status ?? "INCOMPLETE",
        );
      });
    } catch {
      const current = await this.prisma.readinessTask.findUnique({
        where: { id },
      });
      let invalidated = false;
      if (current?.sourceSha && repo.installation.active && repo.available) {
        try {
          await this.invalidate(
            repo,
            task.prNumber,
            current.sourceSha,
            "Preflyt could not verify current policy or evidence. The check requires attention.",
          );
          invalidated = true;
        } catch {
          /* UNKNOWN remains visible until read-back recovery succeeds. */
        }
      }
      await finish({
        state: invalidated ? "INCOMPLETE" : "UNKNOWN",
        conclusion: invalidated
          ? "action_required"
          : (current?.conclusion ?? null),
        message:
          "Current policy or GitHub evidence could not be verified. Retrying automatically.",
        attempts: { increment: 1 },
        nextAttemptAt: new Date(
          Date.now() +
            Math.min(300_000, 15_000 * 2 ** Math.min(task.attempts, 5)),
        ),
      });
    } finally {
      // A configuration generation change may prevent finish; release only our own lease.
      await this.prisma.readinessTask.updateMany({
        where: { id, leaseToken },
        data: { leaseToken: null, leaseUntil: null },
      });
    }
  }
}
