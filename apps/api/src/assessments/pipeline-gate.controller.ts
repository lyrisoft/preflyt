import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import { pipelineIdentity } from "./pipeline-identity.js";
import { currentStandards } from "../standards/policy-standards.js";
const numeric = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[1-9]\d{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v));
export function publicationGateResult(
  row: { state: string },
  publication: {
    state: string;
    verifiedAt: Date | null;
    conclusion: string | null;
  } | null,
) {
  if (["FAILED", "STALE"].includes(row.state))
    return {
      state: "FAILED",
      message:
        "Run verification failed or the PR/policy changed. Rerun the checks workflow.",
    };
  if (publication?.state === "PUBLISHED" && publication.verifiedAt)
    return publication.conclusion === "success"
      ? {
          state: "PASSED",
          message:
            "Preflyt verified the run and published a passing GitHub check.",
        }
      : {
          state: "FAILED",
          message: "Preflyt published a failed or incomplete policy result.",
        };
  return {
    state: "PENDING",
    message: "Waiting for verified GitHub publication.",
  };
}
@Controller("pipeline")
export class PipelineGateController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
  ) {}
  @Get("publication")
  @Header("Cache-Control", "no-store")
  async status(
    @Headers("authorization") authorization: string | undefined,
    @Query("run") runId: string,
    @Query("attempt") attempt: string,
  ) {
    const claims = await pipelineIdentity(authorization);
    if (
      !numeric(claims.repository_id) ||
      !numeric(claims.run_id) ||
      !numeric(claims.run_attempt) ||
      !numeric(runId) ||
      !numeric(attempt) ||
      claims.event_name !== "workflow_run" ||
      runId === claims.run_id
    )
      throw new ForbiddenException("Use the Preflyt publication gate workflow");
    const repo = await this.prisma.gitHubRepository.findFirst({
      where: {
        githubId: BigInt(claims.repository_id),
        selected: true,
        available: true,
        installation: { active: true },
      },
      include: { readinessAutomation: true },
    });
    const config = repo?.readinessAutomation;
    if (
      !repo ||
      !config?.enabled ||
      claims.repository !== repo.fullName ||
      claims.ref !== `refs/heads/${repo.defaultBranch}` ||
      claims.workflow_ref !==
        `${repo.fullName}/.github/workflows/preflyt-gate.yml@refs/heads/${repo.defaultBranch}`
    )
      throw new ForbiddenException(
        "Install the Preflyt gate on the connected repository default branch and enable PR checks",
      );
    const session = {
      authenticated: true as const,
      identityId: config.actorId,
      subject: config.actorId,
      email: null,
      role: "USER",
      organizationId: config.organizationId,
    };
    await this.access.requireRepository(
      session,
      claims.repository_id,
      "policy.publish",
    );
    const caller = await this.github.readReadinessWorkflowRun(
      repo.installationId,
      repo.githubId,
      claims.run_id,
    );
    if (
      caller.runAttempt !== Number(claims.run_attempt) ||
      caller.sourceSha !== claims.sha ||
      caller.event !== "workflow_run" ||
      caller.workflowPath !== ".github/workflows/preflyt-gate.yml" ||
      !["queued", "in_progress", "waiting"].includes(caller.status)
    )
      throw new ForbiddenException("Gate run identity changed");
    const source = await this.github.readReadinessWorkflowRun(
      repo.installationId,
      repo.githubId,
      runId,
    );
    if (
      source.runAttempt !== Number(attempt) ||
      source.status !== "completed" ||
      source.conclusion !== "success" ||
      source.event !== "pull_request"
    )
      return {
        state: "FAILED",
        message:
          "The source workflow must be a completed PR run at this attempt.",
      };
    const row = await this.prisma.pipelineRunSubmission.findFirst({
      where: {
        repositoryId: repo.id,
        organizationId: config.organizationId,
        runId,
        runAttempt: Number(attempt),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row)
      return {
        state: "PENDING",
        message: "Waiting for the checks workflow submission.",
      };
    const { context } = await this.github.readPullRequest(
      repo.installationId,
      repo.githubId,
      row.prNumber,
    );
    const policy = await this.prisma.gatePolicyRevision.findFirst({
      where: {
        repositoryId: repo.id,
        organizationId: config.organizationId,
        branchRef: `refs/heads/${context.base.ref}`,
        state: "PUBLISHED",
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    if (
      context.state !== "open" ||
      context.draft ||
      context.head.repositoryId !== claims.repository_id ||
      context.base.repositoryId !== claims.repository_id ||
      context.head.sha !== row.sourceSha ||
      source.sourceSha !== row.sourceSha ||
      policy?.id !== row.policyId ||
      policy.definitionHash !== row.policyHash
    )
      return {
        state: "FAILED",
        message:
          "The pull request or policy changed. Rerun the checks workflow.",
      };
    await currentStandards(this.prisma, repo.id, { policyId: policy.id });
    const publication = row.assessmentId
      ? await this.prisma.gitHubCheckPublication.findFirst({
          where: {
            repositoryId: repo.id,
            organizationId: config.organizationId,
            assessmentId: row.assessmentId,
            sourceSha: row.sourceSha,
            policyId: row.policyId,
            policyHash: row.policyHash,
          },
          orderBy: { updatedAt: "desc" },
        })
      : null;
    await this.access.requireRepository(
      session,
      claims.repository_id,
      "policy.publish",
    );
    if (
      publication?.state === "PUBLISHED" &&
      publication.verifiedAt &&
      publication.checkRunId
    ) {
      const remote = await this.github.readPublishedReadinessCheck(
        repo.installationId,
        repo.githubId,
        publication.checkRunId,
        row.sourceSha,
      );
      if (
        remote.externalId !== publication.id ||
        remote.conclusion !== publication.conclusion
      )
        return {
          state: "FAILED",
          message:
            "The published GitHub check changed or could not be verified.",
        };
    }
    return publicationGateResult(
      row,
      publication?.checkRunId ? publication : null,
    );
  }
}
