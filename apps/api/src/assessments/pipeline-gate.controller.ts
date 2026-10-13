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
      stage: row.state === 'STALE' ? 'CONTEXT_CHANGED' : 'RESULT_VERIFICATION_FAILED',
      message:
        "Run verification failed or the PR/policy changed. Rerun the checks workflow.",
    };
  if (publication?.state === "PUBLISHED" && publication.verifiedAt)
    return publication.conclusion === "success"
      ? {
          state: "PASSED",
          stage: 'COMPLETE',
          message:
            "Preflyt verified the run and published a passing GitHub check.",
        }
      : {
          state: "FAILED",
          stage: 'POLICY_RESULT_FAILED',
          message: "Preflyt published a failed or incomplete policy result.",
        };
  return {
    state: "PENDING",
    stage: row.state === 'COMPLETE' ? 'GITHUB_PUBLICATION' : 'RESULT_VERIFICATION',
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
      claims.event_name !== "pull_request" ||
      runId !== claims.run_id || attempt !== claims.run_attempt ||
      !/^refs\/pull\/[1-9]\d*\/merge$/.test(String(claims.ref))
    )
      throw new ForbiddenException("Run the final gate in the same PR workflow and attempt");
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
      claims.repository !== repo.fullName
    )
      throw new ForbiddenException(
        "Enable PR checks for this connected repository",
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
    const source = await this.github.readPipelineVerificationRun(
      repo.installationId, repo.githubId, runId,
    );
    if (source.runAttempt !== Number(attempt) || source.event !== 'pull_request' ||
      String(claims.workflow_ref).split('@')[0] !== `${repo.fullName}/${source.workflowPath}`)
      throw new ForbiddenException('Gate run identity changed');
    if (!source.verifiedJobs) return {
      state: 'PENDING', stage: 'CHECK_JOBS', message: 'Waiting for the completed check jobs in this workflow.',
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
        stage: 'RESULT_SUBMISSION',
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
      String(row.prNumber) !== /^refs\/pull\/([1-9]\d*)\/merge$/.exec(String(claims.ref))?.[1] ||
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
        stage: 'CONTEXT_CHANGED',
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
          stage: 'GITHUB_PUBLICATION_FAILED',
          message:
            "The published GitHub check changed or could not be verified.",
        };
    }
    const result = publicationGateResult(row, publication?.checkRunId ? publication : null);
    if (result.state !== 'PASSED') return result;
    if (source.verifiedJobs.conclusion !== 'success') return {
      state: 'FAILED', stage: 'CHECK_JOBS_FAILED', message: 'One or more check jobs failed.',
    };
    if (config.aiReviews) {
      const checks = ((policy.definition as any).aiChecks ?? []).filter((c: any) => c.stages?.includes('pull_request'));
      if (checks.length) {
        const reviews = await this.prisma.aiSkillReview.findMany({ where: {
          repositoryId: repo.id, organizationId: config.organizationId, stage: 'pull_request',
          AND: [
            { snapshot: { path: ['automatic', 'policyId'], equals: policy.id } },
            { snapshot: { path: ['automatic', 'policyHash'], equals: policy.definitionHash } },
            { snapshot: { path: ['automatic', 'number'], equals: row.prNumber } },
            { snapshot: { path: ['automatic', 'context', 'head', 'sha'], equals: row.sourceSha } },
          ],
        }, orderBy: { createdAt: 'desc' }, take: 101 });
        if (!reviews.length && row.state !== 'COMPLETE') return {
          state: 'PENDING', stage: 'RESULT_VERIFICATION',
          message: 'Waiting for verified result processing before AI review admission.',
        };
        const ai = pipelineAiResult(checks, reviews);
        if (ai.state !== 'PASSED') return ai;
      }
    }
    return result;
  }
}

/** Advisory findings do not block. Missing execution or failed PR publication does. */
export function pipelineAiResult(checks: { id: string }[], reviews: { state: string; feedbackState: string; snapshot: unknown }[]) {
  if (reviews.length > 100) return { state: 'FAILED', stage: 'AI_REVIEW_FAILED', message: 'AI review collection exceeds the verification limit.' };
  for (const check of checks) {
    const review = reviews.find(r => (r.snapshot as any)?.checks?.some((c: any) => c.id === check.id));
    if (!review) return { state: 'PENDING', stage: 'AI_REVIEW', message: 'Waiting for the configured PR AI review.' };
    if (['UNAVAILABLE', 'FAILED', 'CANCELLED'].includes(review.state) || review.feedbackState === 'FAILED')
      return { state: 'FAILED', stage: review.feedbackState === 'FAILED' ? 'AI_PUBLICATION_FAILED' : 'AI_REVIEW_FAILED', message: 'AI review or PR feedback publishing failed.' };
    if (review.state !== 'SUCCEEDED' || review.feedbackState !== 'PUBLISHED')
      return { state: 'PENDING', stage: review.state === 'SUCCEEDED' ? 'AI_PUBLICATION' : 'AI_REVIEW', message: 'Waiting for AI review and verified PR feedback publication.' };
  }
  return { state: 'PASSED', stage: 'COMPLETE', message: 'Configured AI reviews completed and published.' };
}
