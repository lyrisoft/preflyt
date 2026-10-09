import { recordRulesetNotification } from "../notifications/notification-event.js";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { GitHubProviderService } from "./github-provider.service.js";
import { GovernanceProvider } from "./governance-provider.js";
import { CheckPublicationService } from "../assessments/check-publication.service.js";
import {
  automationEnabled,
  automaticExternalId,
} from "../assessments/readiness-automation.service.js";
import { digest } from "../assessments/assessment-digest.js";
import { draftHash, readinessCheck } from "./ruleset-draft.js";
export const governanceEnabled = () =>
  process.env.GITHUB_RULESET_ACTIVATION_ENABLED === "true";
@Injectable()
export class RulesetDeploymentService {
  private readonly governance = new GovernanceProvider();
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
    @Inject(CheckPublicationService)
    private readonly checks: CheckPublicationService,
  ) {}
  private async authorize(session: AuthenticatedSession, id: string) {
    const repo = await this.access.requireRepository(
      session,
      id,
      "github.ruleset.manage",
    );
    await this.access.requireRepository(
      session,
      id,
      "policy.enforcement.manage",
    );
    return repo;
  }
  async list(session: AuthenticatedSession, id: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new BadRequestException("Invalid deployment page");
    const repo = await this.access.requireRepository(
      session,
      id,
      "policy.read",
    );
    const rows = await this.prisma.gitHubRulesetDeployment.findMany({
      where: { repositoryId: repo.id, organizationId: session.organizationId! },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 21,
    });
    return {
      enabled: governanceEnabled(),
      page,
      hasMore: rows.length > 20,
      deployments: rows
        .slice(0, 20)
        .map(({ leaseToken, leaseUntil, ...row }) => row),
    };
  }
  private async preflight(
    session: AuthenticatedSession,
    id: string,
    draftId: string,
    name: string,
  ) {
    if (!governanceEnabled() || !automationEnabled())
      throw new ServiceUnavailableException(
        "Enable automatic publication and ruleset activation on this deployment",
      );
    const repo = await this.authorize(session, id);
    const [draft, selection, automation] = await Promise.all([
      this.prisma.gitHubRulesetDraft.findFirst({
        where: {
          id: draftId,
          repositoryId: repo.id,
          organizationId: session.organizationId!,
        },
      }),
      this.prisma.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: "desc" },
      }),
      this.prisma.readinessAutomation.findUnique({
        where: { repositoryId: repo.id },
      }),
    ]);
    if (
      !draft ||
      !selection ||
      draft.selectionId !== selection.id ||
      !automation?.enabled
    )
      throw new ConflictException(
        "Save current standards, update the ruleset draft, and enable automatic checks first",
      );
    const raw = draft.definition as Record<string, any>;
    if (
      draftHash({
        definition: raw,
        selectionId: draft.selectionId,
        packs: draft.packs,
      }) !== draft.definitionHash
    )
      throw new ConflictException(
        "Save this draft again to refresh its verification hash",
      );
    if (
      digest(raw.conditions?.repository_id?.repository_ids) !==
        digest([Number(id)]) ||
      raw.target !== "branch" ||
      raw.enforcement !== "disabled" ||
      raw.bypass_actors?.length ||
      raw.conditions?.ref_name?.exclude?.length
    )
      throw new ConflictException(
        "Only an exact single-repository draft without bypasses is supported",
      );
    const refs = raw.conditions?.ref_name?.include;
    if (
      !Array.isArray(refs) ||
      !refs.length ||
      refs.length > 20 ||
      refs.some(
        (ref: unknown) =>
          typeof ref !== "string" ||
          !ref.startsWith("refs/heads/") ||
          /[~*?\[]/.test(ref),
      )
    )
      throw new ConflictException("Choose explicit target branches");
    const { appId } = await this.github.checkPublicationAccess(
      repo.installationId,
    );
    await this.github.assertNoReadinessMergeQueue(
      repo.installationId,
      repo.githubId,
    );
    const connection = await this.governance.open(repo.fullName);
    const definition = {
      ...raw,
      name,
      enforcement: "active",
      rules: raw.rules.map((rule: Record<string, any>) =>
        rule.type === "required_status_checks"
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                required_status_checks: [
                  { context: readinessCheck, integration_id: Number(appId) },
                ],
              },
            }
          : rule,
      ),
    };
    if (
      !definition.rules.some(
        (r: Record<string, any>) => r.type === "required_status_checks",
      )
    )
      throw new ConflictException(
        "The ruleset must require the Preflyt readiness check",
      );
    const prs = await this.github.readOpenReadinessPullRequests(
      repo.installationId,
      repo.githubId,
    );
    const impacts: Record<string, any>[] = [];
    const policies: Record<string, any>[] = [];
    for (const ref of refs) {
      const branch = ref.slice("refs/heads/".length);
      // Resolving the branch to a commit also verifies it exists, independently of cached lists.
      await this.github.verifyReadinessBranch(
        repo.installationId,
        repo.githubId,
        branch,
      );
      const policy = await this.prisma.gatePolicyRevision.findFirst({
        where: {
          repositoryId: repo.id,
          organizationId: session.organizationId!,
          branchRef: ref,
          state: "PUBLISHED",
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      });
      if (!policy || policy.selectionId !== selection.id)
        throw new ConflictException(
          `Publish a policy for ${branch} using the current standards first`,
        );
      policies.push({
        branchRef: ref,
        id: policy.id,
        hash: policy.definitionHash,
      });
      let passing = false;
      for (const pr of prs.filter(
        (pr) => pr.baseBranch === branch && !pr.draft,
      )) {
        if (pr.headRepositoryId !== id)
          throw new ConflictException(
            "Fork pull requests are not supported by the managed gate yet",
          );
        const task = await this.prisma.readinessTask.findUnique({
          where: {
            repositoryId_prNumber: {
              repositoryId: repo.id,
              prNumber: pr.number,
            },
          },
        });
        let conclusion = "action_required";
        if (
          task?.state === "PUBLISHED" &&
          task.sourceSha === pr.headSha &&
          task.policyId === policy.id &&
          task.policyHash === policy.definitionHash &&
          task.verifiedAt &&
          Date.now() - task.verifiedAt.getTime() < 120_000 &&
          task.assessmentId &&
          task.checkRunId
        ) {
          const plan = await this.checks.plan(
            session,
            id,
            pr.number,
            task.assessmentId,
            "github.ruleset.manage",
          );
          const live = await this.github.readPublishedReadinessCheck(
            repo.installationId,
            repo.githubId,
            task.checkRunId,
            pr.headSha,
          );
          if (
            plan.policyEvaluation?.evaluationHash === task.evaluationHash &&
            plan.payload.conclusion === live.conclusion &&
            live.externalId ===
              automaticExternalId(repo.id, pr.number, pr.headSha) &&
            digest(live.output?.summary) ===
              digest(plan.payload.output.summary) &&
            live.output?.title === plan.payload.output.title
          )
            conclusion = live.conclusion;
        }
        if (conclusion === "success") passing = true;
        impacts.push({
          prNumber: pr.number,
          sourceSha: pr.headSha,
          branchRef: ref,
          conclusion,
        });
      }
      if (!passing)
        throw new ConflictException(
          `A current automatically published passing PR check is required on ${branch} before activation`,
        );
    }
    const preview = {
      draftHash: draft.definitionHash,
      selectionId: selection.id,
      automationRevision: automation.revision,
      appId,
      governanceAppId: connection.config.appId,
      governanceInstallationId: connection.config.installationId.toString(),
      definition,
      policies,
      impacts: impacts.sort((a, b) => a.prNumber - b.prNumber),
    };
    return {
      repo,
      draft,
      connection,
      definition,
      preview,
      previewHash: digest(preview),
    };
  }
  async preview(
    session: AuthenticatedSession,
    id: string,
    draftId: string,
    expectedDraftHash: string,
  ) {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(draftId) ||
      !/^[a-f0-9]{64}$/.test(expectedDraftHash)
    )
      throw new BadRequestException("Choose a saved draft");
    const deploymentId = randomUUID();
    const plan = await this.preflight(
      session,
      id,
      draftId,
      `Preflyt readiness ${deploymentId}`,
    );
    if (plan.draft.definitionHash !== expectedDraftHash)
      throw new ConflictException("Draft changed. Refresh and review again");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${plan.repo.id} FOR UPDATE`;
      if (
        await tx.gitHubRulesetDeployment.count({
          where: {
            repositoryId: plan.repo.id,
            state: {
              in: ["ACTIVE", "DEPLOYING", "UNKNOWN", "DRIFTED", "ROLLING_BACK"],
            },
          },
        })
      )
        throw new ConflictException(
          "Resolve or roll back the current managed deployment first",
        );
      const row = await tx.gitHubRulesetDeployment.create({
        data: {
          id: deploymentId,
          repositoryId: plan.repo.id,
          organizationId: session.organizationId!,
          draftId,
          draftHash: expectedDraftHash,
          definition: plan.definition,
          definitionHash: digest(plan.definition),
          preview: plan.preview,
          previewHash: plan.previewHash,
          proposedById: session.identityId,
          governanceAppId: plan.connection.config.appId,
          governanceInstallationId:
            plan.connection.config.installationId.toString(),
        },
      });
      await tx.auditEvent.create({
        data: {
          event: "github.ruleset_deployment_proposed",
          actorId: session.identityId,
          metadata: { deploymentId, previewHash: row.previewHash },
        },
      });
      return row;
    });
  }
  private async row(
    session: AuthenticatedSession,
    id: string,
    deploymentId: string,
    hash: string,
  ) {
    const repo = await this.authorize(session, id);
    const row = await this.prisma.gitHubRulesetDeployment.findFirst({
      where: {
        id: deploymentId,
        repositoryId: repo.id,
        organizationId: session.organizationId!,
      },
    });
    if (!row) throw new NotFoundException("Deployment unavailable");
    if (
      row.previewHash !== hash ||
      digest(row.preview) !== hash ||
      digest(row.definition) !== row.definitionHash
    )
      throw new ConflictException("Deployment preview changed");
    return { repo, row };
  }
  async approve(
    session: AuthenticatedSession,
    id: string,
    deploymentId: string,
    hash: string,
  ) {
    const { row } = await this.row(session, id, deploymentId, hash);
    if (row.proposedById === session.identityId)
      throw new ForbiddenException(
        "Another authorized administrator must approve ruleset activation",
      );
    const plan = await this.preflight(
      session,
      id,
      row.draftId,
      (row.definition as Record<string, any>).name,
    );
    if (plan.previewHash !== hash)
      throw new ConflictException(
        "Policy, pull requests, or readiness checks changed. Create a new preview",
      );
    const updated = await this.prisma.gitHubRulesetDeployment.updateMany({
      where: { id: row.id, state: "PREVIEW", previewHash: hash },
      data: { state: "APPROVED", approvedById: session.identityId },
    });
    if (!updated.count)
      throw new ConflictException("This deployment cannot be approved");
    await this.prisma.auditEvent.create({
      data: {
        event: "github.ruleset_deployment_approved",
        actorId: session.identityId,
        metadata: { deploymentId, previewHash: hash },
      },
    });
    return { state: "APPROVED" };
  }
  async deploy(
    session: AuthenticatedSession,
    id: string,
    deploymentId: string,
    hash: string,
  ) {
    const { repo, row } = await this.row(session, id, deploymentId, hash);
    if (
      !row.approvedById ||
      !["APPROVED", "UNKNOWN", "DEPLOYING"].includes(row.state)
    )
      throw new ConflictException(
        "An independently approved deployment is required",
      );
    await this.authorize({ ...session, identityId: row.approvedById }, id);
    await this.authorize({ ...session, identityId: row.proposedById }, id);
    const plan = await this.preflight(
      session,
      id,
      row.draftId,
      (row.definition as Record<string, any>).name,
    );
    if (plan.previewHash !== hash)
      throw new ConflictException(
        "Activation preview changed. Review a new preview before deploying",
      );
    const leaseToken = randomUUID();
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${repo.id} FOR UPDATE`;
      if (
        await tx.gitHubRulesetDeployment.count({
          where: {
            repositoryId: repo.id,
            id: { not: row.id },
            state: {
              in: ["ACTIVE", "DEPLOYING", "UNKNOWN", "DRIFTED", "ROLLING_BACK"],
            },
          },
        })
      )
        throw new ConflictException(
          "Another managed deployment must be resolved first",
        );
      return tx.gitHubRulesetDeployment.updateMany({
        where: {
          id: row.id,
          state: { in: ["APPROVED", "UNKNOWN", "DEPLOYING"] },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        data: {
          state: "DEPLOYING",
          leaseToken,
          leaseUntil: new Date(Date.now() + 300_000),
        },
      });
    });
    if (!claimed.count)
      throw new ConflictException("Deployment is already in progress");
    try {
      const latest = await this.preflight(
        session,
        id,
        row.draftId,
        (row.definition as Record<string, any>).name,
      );
      if (latest.previewHash !== hash)
        throw new ConflictException("Readiness changed before activation");
      const receipt = await plan.connection.create(plan.definition);
      await this.prisma.$transaction(async (tx) => {
        const saved = await tx.gitHubRulesetDeployment.updateMany({
          where: { id: row.id, leaseToken },
          data: {
            state: "ACTIVE",
            githubRulesetId: receipt.id,
            observedHash: receipt.hash,
            observedDefinition: receipt.definition,
            verifiedAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            message: null,
          },
        });
        if (!saved.count)
          throw new ConflictException("Deployment ownership changed");
        await tx.auditEvent.create({
          data: {
            event: "github.ruleset_activation_verified",
            actorId: session.identityId,
            metadata: {
              deploymentId,
              githubRulesetId: receipt.id,
              observedHash: receipt.hash,
            },
          },
        });
        await recordRulesetNotification(
          tx,
          repo,
          row.organizationId,
          session.identityId,
          row.id,
          "ACTIVE",
          receipt.hash,
        );
      });
      return { state: "ACTIVE", githubRulesetId: receipt.id };
    } catch {
      await this.prisma.gitHubRulesetDeployment.updateMany({
        where: { id: row.id, leaseToken },
        data: {
          state: "UNKNOWN",
          leaseToken: null,
          leaseUntil: null,
          message:
            "Activation outcome needs verification. Retry this deployment to recover the existing ruleset.",
        },
      });
      throw new ServiceUnavailableException(
        "Activation could not be verified. Refresh before retrying this deployment",
      );
    }
  }
  async refresh(
    session: AuthenticatedSession,
    id: string,
    deploymentId: string,
    hash: string,
  ) {
    const { repo, row } = await this.row(session, id, deploymentId, hash);
    if (!row.githubRulesetId)
      throw new ConflictException(
        "Retry activation to recover an unknown creation",
      );
    const connection = await this.governance.open(repo.fullName);
    const live = await connection.read(row.githubRulesetId);
    const drifted = live.hash !== row.observedHash;
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.gitHubRulesetDeployment.updateMany({
        where: { id: row.id, observedHash: row.observedHash, leaseToken: null },
        data: {
          state: drifted
            ? "DRIFTED"
            : row.state === "DRIFTED"
              ? live.definition.enforcement === "active"
                ? "ACTIVE"
                : "ROLLED_BACK"
              : row.state,
          verifiedAt: new Date(),
          message: drifted
            ? "GitHub protections changed outside Preflyt. Review them before making another change."
            : null,
        },
      });
      if (!saved.count)
        throw new ConflictException(
          "Deployment changed while verifying GitHub",
        );
      if (drifted) {
        await tx.auditEvent.create({
          data: {
            event: "github.ruleset_drift_detected",
            actorId: session.identityId,
            metadata: {
              deploymentId: row.id,
              observedHash: live.hash,
              expectedHash: row.observedHash,
            },
          },
        });
        await recordRulesetNotification(
          tx,
          repo,
          row.organizationId,
          session.identityId,
          row.id,
          "DRIFTED",
          live.hash,
        );
      }
    });
    return {
      state: drifted
        ? "DRIFTED"
        : row.state === "DRIFTED"
          ? live.definition.enforcement === "active"
            ? "ACTIVE"
            : "ROLLED_BACK"
          : row.state,
      observed: live.definition,
      observedHash: live.hash,
      expected: row.observedDefinition,
    };
  }
  async rollback(
    session: AuthenticatedSession,
    id: string,
    deploymentId: string,
    hash: string,
  ) {
    const { repo, row } = await this.row(session, id, deploymentId, hash);
    if (
      !row.githubRulesetId ||
      !row.observedHash ||
      !["ACTIVE", "ROLLING_BACK"].includes(row.state)
    )
      throw new ConflictException(
        "Only a verified managed ruleset can be rolled back",
      );
    const connection = await this.governance.open(repo.fullName);
    const leaseToken = randomUUID();
    const claim = await this.prisma.gitHubRulesetDeployment.updateMany({
      where: {
        id: row.id,
        state: { in: ["ACTIVE", "ROLLING_BACK"] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        state: "ROLLING_BACK",
        leaseToken,
        leaseUntil: new Date(Date.now() + 300_000),
      },
    });
    if (!claim.count)
      throw new ConflictException("Another ruleset operation is in progress");
    try {
      const live = await connection.read(row.githubRulesetId);
      // A timeout after PUT can be recovered only if the disabled definition exactly matches our receipt.
      const disabled = {
        ...(row.observedDefinition as Record<string, any>),
        enforcement: "disabled",
      };
      const receipt =
        live.hash === digest(disabled)
          ? live
          : await connection.disable(row.githubRulesetId, row.observedHash);
      await this.prisma.$transaction(async (tx) => {
        const saved = await tx.gitHubRulesetDeployment.updateMany({
          where: { id: row.id, leaseToken },
          data: {
            state: "ROLLED_BACK",
            observedHash: receipt.hash,
            observedDefinition: receipt.definition,
            verifiedAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            message: null,
          },
        });
        if (!saved.count)
          throw new ConflictException("Deployment ownership changed");
        await tx.auditEvent.create({
          data: {
            event: "github.ruleset_rollback_verified",
            actorId: session.identityId,
            metadata: {
              deploymentId,
              githubRulesetId: receipt.id,
              observedHash: receipt.hash,
            },
          },
        });
        await recordRulesetNotification(
          tx,
          repo,
          row.organizationId,
          session.identityId,
          row.id,
          "ROLLED_BACK",
          receipt.hash,
        );
      });
      return { state: "ROLLED_BACK" };
    } catch {
      await this.prisma.gitHubRulesetDeployment.updateMany({
        where: { id: row.id, leaseToken },
        data: {
          leaseToken: null,
          leaseUntil: null,
          message:
            "Rollback could not be verified. Refresh and retry; external changes will not be overwritten.",
        },
      });
      throw new ServiceUnavailableException(
        "Rollback could not be verified. Refresh and review the GitHub ruleset",
      );
    }
  }
}
