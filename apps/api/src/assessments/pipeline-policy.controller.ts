import {
  Body,
  Controller,
  Get,
  Post,
  Header,
  Headers,
  Inject,
  Query,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { pipelineIdentity } from "./pipeline-identity.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GitHubProviderService } from "../github/github-provider.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import { currentStandards } from "../standards/policy-standards.js";
import { digest } from "./assessment-digest.js";
import { checkReportFormat } from "./check-report-adapters.js";
import { normalizePipelineSubmission } from "./pipeline-submission.js";
import { policyExecution, POLICY_EXECUTION_VERSION } from './policy-execution.js';

const numeric = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9]\d{0,15}$/.test(value) &&
  Number.isSafeInteger(Number(value));

/** OIDC identifies the run; only completed, verified submissions register sources. */
@Controller("pipeline")
export class PipelinePolicyController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GitHubProviderService)
    private readonly github: GitHubProviderService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}

  private async context(authorization: string | undefined, pr?: string) {
    const claims = await pipelineIdentity(authorization);
    if (
      !numeric(claims.repository_id) ||
      !numeric(claims.run_id) ||
      !numeric(claims.run_attempt) ||
      typeof claims.sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(claims.sha) ||
      !["pull_request", "push", "workflow_dispatch"].includes(
        String(claims.event_name),
      )
    )
      throw new ForbiddenException("This workflow event is unsupported");
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
    if (!repo || !config?.enabled || claims.repository !== repo.fullName)
      throw new ForbiddenException(
        "Enable PR checks for this connected repository first",
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
    const run = await this.github.readReadinessWorkflowRun(
      repo.installationId,
      repo.githubId,
      claims.run_id,
    );
    if (
      run.runAttempt !== Number(claims.run_attempt) ||
      !["queued", "in_progress", "waiting"].includes(run.status)
    )
      throw new ConflictException(
        "Workflow run changed or is no longer active",
      );
    let number: number;
    const fromRef = /^refs\/pull\/([1-9]\d*)\/merge$/.exec(
      String(claims.ref),
    )?.[1];
    if (pr !== undefined && !numeric(pr))
      throw new ForbiddenException("Invalid pull request");
    if (fromRef && pr && fromRef !== pr)
      throw new ForbiddenException(
        "Pull request does not match the workflow identity",
      );
    if (pr || fromRef) number = Number(pr ?? fromRef);
    else {
      const matches = (
        await this.github.readOpenReadinessPullRequests(
          repo.installationId,
          repo.githubId,
        )
      ).filter(
        (p) =>
          p.headSha === claims.sha &&
          p.headRepositoryId === claims.repository_id &&
          !p.draft,
      );
      if (matches.length !== 1)
        throw new ConflictException(
          "This commit must belong to exactly one open pull request",
        );
      number = matches[0].number;
    }
    const { context } = await this.github.readPullRequest(
      repo.installationId,
      repo.githubId,
      number,
    );
    if (
      context.state !== "open" ||
      context.draft ||
      context.head.repositoryId !== claims.repository_id ||
      context.base.repositoryId !== claims.repository_id ||
      run.sourceSha !== context.head.sha ||
      (!fromRef && claims.sha !== context.head.sha)
    )
      throw new ForbiddenException(
        "Only the current commit of a same-repository open pull request is supported",
      );
    const branchRef = `refs/heads/${context.base.ref}`;
    const policy = await this.prisma.gatePolicyRevision.findFirst({
      where: {
        repositoryId: repo.id,
        organizationId: config.organizationId,
        branchRef,
        state: "PUBLISHED",
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    if (!policy)
      throw new NotFoundException(
        "Publish a policy for the pull request target branch first",
      );
    const selection = await currentStandards(this.prisma, repo.id, {
      policyId: policy.id,
    });
    const definition = policy.definition as unknown as {
      rules: {
        id: string;
        title: string;
        required: boolean;
        capability: string;
        thresholds: unknown;
        workflowCommand?: string;
        reportPath?: string;
      }[];
    };
    if (
      digest(policy.definition) !== policy.definitionHash ||
      !Array.isArray(definition.rules) ||
      definition.rules.length > 64
    )
      throw new ConflictException(
        "Published policy integrity could not be verified",
      );
    if (!selection)
      throw new ConflictException("Published policy standards are unavailable");
    await this.access.requireRepository(
      session,
      claims.repository_id,
      "policy.publish",
    );
    const signerWorkflow =
      typeof claims.workflow_ref === "string"
        ? claims.workflow_ref.split("@")[0]
        : "";
    if (
      !signerWorkflow.startsWith(repo.fullName + "/.github/workflows/") ||
      !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/\.github\/workflows\/[a-zA-Z0-9_-]+\.ya?ml$/.test(
        signerWorkflow,
      )
    )
      throw new ForbiddenException("Unsupported signer workflow");
    const exported = {
      signerWorkflow,
      schemaVersion: 1,
      executionVersion: POLICY_EXECUTION_VERSION,
      id: policy.id,
      definitionHash: policy.definitionHash,
      repositoryId: claims.repository_id,
      state: policy.state,
      branchRef,
      stage: "pull_request",
      pullRequest: number,
      headSha: context.head.sha,
      sourceSha: claims.sha,
      checks: definition.rules.map((rule) => ({
        id: rule.id,
        title: rule.title,
        required: rule.required,
        capability: rule.capability,
        thresholds: rule.thresholds,
        format: checkReportFormat(rule.id) ?? null,
        execution: policyExecution(rule),
      })),
    };
    return { repo, config, session, run, claims, policy, exported };
  }

  @Get("policy")
  @Header("Cache-Control", "no-store")
  async policy(
    @Headers("authorization") authorization: string | undefined,
    @Query("pr") pr?: string,
  ) {
    return (await this.context(authorization, pr)).exported;
  }

  @Post("results")
  @Header("Cache-Control", "no-store")
  async submit(
    @Headers("authorization") authorization: string | undefined,
    @Query("pr") pr: string | undefined,
    @Body() body: unknown,
  ) {
    const { repo, config, session, claims, exported, run } = await this.context(
      authorization,
      pr,
    );
    const normalized = normalizePipelineSubmission(body, exported);
    let submissionJobId: string | undefined;
    if (normalized.verificationScope === 'jobs') {
      const jobName = (body as Record<string, unknown>).jobName;
      if (typeof jobName !== 'string' || !jobName || jobName.length > 200 || jobName === 'Preflyt final gate')
        throw new ForbiddenException('Identify the check job that submits these reports');
      const jobs = await this.github.readPipelineJobs(repo.installationId, repo.githubId, String(claims.run_id), Number(claims.run_attempt));
      const matches = jobs.filter(job => (job.name === jobName || job.name.endsWith(' / ' + jobName)) &&
        job.sourceSha === run.sourceSha && job.status === 'in_progress');
      if (matches.length !== 1) throw new ConflictException('The report-producing job could not be identified; set the Action job-name input to its display name');
      submissionJobId = matches[0].id;
    }
    const payload = { ...normalized, ...(submissionJobId ? { submissionJobId } : {}) };
    const inputHash = digest(payload);
    const id = digest({
      repository: repo.id,
      runId: claims.run_id,
      attempt: claims.run_attempt,
      policy: exported.id,
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "GitHubRepository" WHERE id = ${repo.id} FOR UPDATE`;
      await new AuthorizationService(tx as PrismaService).requireRepository(
        session,
        exported.repositoryId,
        "policy.publish",
      );
      const current = await tx.readinessAutomation.findUnique({
        where: { repositoryId: repo.id },
      });
      const policy = await tx.gatePolicyRevision.findUnique({
        where: { id: exported.id },
      });
      if (
        !current?.enabled ||
        current.revision !== config.revision ||
        policy?.state !== "PUBLISHED" ||
        policy.definitionHash !== exported.definitionHash
      )
        throw new ConflictException(
          "Policy or workflow configuration changed; run again",
        );
      await tx.pipelineRunSubmission.createMany({
        data: [
          {
            id,
            repositoryId: repo.id,
            organizationId: config.organizationId,
            policyId: exported.id,
            policyHash: exported.definitionHash,
            sourceSha: exported.headSha,
            workflowSha: exported.sourceSha,
            runId: String(claims.run_id),
            runAttempt: Number(claims.run_attempt),
            prNumber: exported.pullRequest,
            inputHash,
            payload,
            submittedById: config.actorId,
          },
        ],
        skipDuplicates: true,
      });
      const saved = await tx.pipelineRunSubmission.findUniqueOrThrow({
        where: { id },
      });
      if (saved.inputHash !== inputHash)
        throw new ConflictException(
          "Results for this run were already submitted with different content",
        );
      return {
        id: saved.id,
        state: saved.state,
        verification: "PENDING",
        result: normalized.result,
      };
    });
  }
}
