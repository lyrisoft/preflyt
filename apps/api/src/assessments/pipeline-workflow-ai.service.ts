import { effectiveAiRoute } from "../intelligence/effective-ai-route.js";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { AiConfigurationService } from "../intelligence/ai-configuration.service.js";
import { aiReviewsEnabled } from "../intelligence/ai-configuration.js";
import {
  runPromptInference,
  AiResponseError,
} from "../intelligence/skill-inference.js";
import { AiTransportError } from "../intelligence/ai-http.js";
import {
  githubActionsWorkflowPrompt,
  githubActionsWorkflowSkillRef,
} from "../intelligence/github-actions-workflow-skill.js";
import { digest } from "./assessment-digest.js";
import { reviewOutputFailureMessages } from '../intelligence/review-skills.js';
import { checkReportFormat } from "./check-report-adapters.js";
import {
  readWorkflow,
  validateRewrite,
  WorkflowRewriteError,
  type WorkflowRule,
} from "./pipeline-workflow.js";

import { preflytCiSetupSkillRef } from '../intelligence/preflyt-ci-setup-skill.js';
import { ciSetupContext, setupContainsCredentials } from './preflyt-ci-setup.js';
import type { RepositorySnapshot } from '../github/repository-profile.js';

// Rewrites return an entire workflow, unlike short assessment review findings.
// Leave room for that YAML and model reasoning without adding user budget settings.
const workflowResponseTokenLimit = 32768;

function rewriteFailure(error: unknown) {
  if (error instanceof WorkflowRewriteError) {
    const job = error.location?.jobId;
    const messages = {
      INVALID_RESPONSE:
        "AI returned an invalid workflow response. Try another model or edit the YAML.",
      UNSAFE_RESPONSE:
        "AI returned credentials in its draft. The draft was rejected; use GitHub secret references.",
      TRIGGERS_CHANGED:
        "AI changed your existing workflow triggers. Ask it to add policy checks while keeping the triggers unchanged.",
      JOB_REMOVED: `AI removed existing job "${job}". Ask it to keep all existing jobs and add only the policy checks.`,
      JOB_CHANGED: `AI changed ${error.location?.field} in existing job "${job}". Ask it to preserve the job's current configuration.`,
      STEP_CHANGED: `AI changed or removed existing step ${error.location?.step} in job "${job}". Ask it to keep existing commands and add only the policy checks.`,
    };
    return {
      code: error.code,
      message: messages[error.code],
      location: error.location,
    };
  }
  if (error instanceof AiResponseError) {
    const messages = {
      MODEL_UNAVAILABLE: `The model rejected the rewrite request (HTTP ${error.status}). Check the model connection in Model Router.`,
      TRUNCATED:
        "The model stopped before returning the complete workflow. Try another model or rewrite a smaller workflow.",
      INVALID_RESPONSE:
        "AI returned an invalid workflow response. Try another model or edit the YAML.",
      UNSAFE_RESPONSE:
        "AI returned credentials in its draft. The draft was rejected; use GitHub secret references.",
      REFUSED:
        "The model declined to rewrite this workflow. Try a different request or model.",
      INVALID_REVIEW_SCHEMA: "AI returned an invalid structured response.",
      INVALID_EVIDENCE: "AI cited unavailable evidence.",
      UNSUPPORTED_CLAIM: "AI returned an unsupported claim.",
      ...reviewOutputFailureMessages,
    };
    return {
      code: error.code,
      message: messages[error.code],
      providerStatus: error.status,
    };
  }
  if (error instanceof AiTransportError) {
    const messages = {
      TIMEOUT:
        "The model did not finish the rewrite in time. Try again or select another model.",
      NETWORK:
        "Preflyt could not reach the model. Check its connection in Model Router.",
      UPSTREAM_UNAVAILABLE:
        "The model is busy or temporarily unavailable. Try again shortly.",
    };
    return { code: error.code, message: messages[error.code] };
  }
  return {
    code:
      error instanceof HttpException ? "VALIDATION_FAILED" : "REWRITE_FAILED",
    message:
      "Workflow rewriting failed. Try again or check the model connection in Model Router.",
  };
}

@Injectable()
export class PipelineWorkflowAiService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
    @Inject(AiConfigurationService)
    private readonly configuration: AiConfigurationService,
  ) {}
  private async model(session: AuthenticatedSession, repositoryId: string) {
    await this.access.requireRepository(session, repositoryId, "ai.review.run");
    if (!aiReviewsEnabled())
      throw new ConflictException(
        "AI execution is disabled in this deployment",
      );
    const route = await effectiveAiRoute(
      this.db,
      session.organizationId!,
      "repository",
    );
    if (!route?.enabled)
      throw new ConflictException(
        "Choose an enabled default model in Model Router",
      );
    if (!route.allowSource)
      throw new ConflictException(
        "Allow source sharing in Model Router to rewrite workflow code",
      );
    const providers = await this.db.aiProviderConnection.findMany({
      where: {
        organizationId: session.organizationId!,
        id: {
          in: [route.primaryId, route.fallbackId].filter(
            (id): id is string => !!id,
          ),
        },
      },
    });
    const provider = [route.primaryId, route.fallbackId]
      .map((id) => providers.find((p) => p.id === id))
      .find((p) => this.configuration.ready(p));
    if (!provider)
      throw new ConflictException(
        "Test and enable the Repository model connection",
      );
    return { route, provider };
  }
  async availability(session: AuthenticatedSession, repositoryId: string) {
    try {
      const { provider } = await this.model(session, repositoryId);
      return {
        available: true,
        skill: githubActionsWorkflowSkillRef,
        setupSkill: preflytCiSetupSkillRef,
        model: provider.name + " / " + provider.modelId,
        reason: null,
      };
    } catch (error) {
      return {
        available: false,
        skill: githubActionsWorkflowSkillRef,
        setupSkill: preflytCiSetupSkillRef,
        model: null,
        reason:
          error instanceof HttpException
            ? error.message
            : "AI workflow rewriting is unavailable",
      };
    }
  }
  async generate(
    session: AuthenticatedSession, repositoryId: string, policyId: string,
    rules: WorkflowRule[], snapshot: RepositorySnapshot, workflow: string,
    instructions: string, apiUrl: string, requestId: string, dockerfile?: string,
  ) {
    return this.rewrite(session, repositoryId, policyId, `refs/heads/${snapshot.branch}`,
      rules, workflow, instructions, apiUrl, requestId, snapshot, dockerfile);
  }
  async rewrite(
    session: AuthenticatedSession,
    repositoryId: string,
    policyId: string,
    branch: string,
    rules: WorkflowRule[],
    workflow: string,
    instructions: string,
    apiUrl: string,
    requestId: string,
    setupSnapshot?: RepositorySnapshot,
    setupDockerfile?: string,
  ) {
    readWorkflow(workflow);
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/.test(
        workflow + instructions,
      )
    )
      throw new BadRequestException(
        "Replace credentials with GitHub secret references before using AI",
      );
    const { route, provider } = await this.model(session, repositoryId);
    const setup = setupSnapshot ? ciSetupContext(setupSnapshot, rules, apiUrl, setupDockerfile) : null;
    if (setup && setupContainsCredentials(instructions)) throw new BadRequestException('Remove credentials from your setup request before using AI');
    const skill = setup ? preflytCiSetupSkillRef : githubActionsWorkflowSkillRef;
    const event = setup ? 'pipeline.workflow.generate' : 'pipeline.workflow.rewrite';
    const prompt = setup ? { ...setup.prompt, user: JSON.stringify({ mode: 'generate', context: JSON.parse(setup.prompt.user), request: instructions }) } : githubActionsWorkflowPrompt({
      policy: {
        branch,
        checks: rules.map((rule) => ({
          ...rule,
          format: checkReportFormat(rule.id) ?? null,
        })),
      },
      workflow,
      apiUrl,
      request:
        instructions ||
        "Add the checks required by this policy, retaining existing flows.",
    });
    const organizationId = session.organizationId!;
    const auditId = `workflow-${setup ? "generate" : "rewrite"}:${requestId}`;
    if (await this.db.auditEvent.findUnique({ where: { id: auditId } }))
      throw new ConflictException(
        "This rewrite request was already submitted. Start a new rewrite.",
      );
    await this.db.$transaction(async (tx) => {
      await new AuthorizationService(tx as PrismaService).requireRepository(
        session,
        repositoryId,
        "ai.review.run",
      );
      await new AuthorizationService(tx as PrismaService).requireRepository(
        session,
        repositoryId,
        "policy.publish",
      );
      const current = await tx.aiStageRoute.findFirst({
        where: {
          id: route.id,
          organizationId,
          revision: route.revision,
          enabled: true,
          allowSource: true,
        },
      });
      const effective = await effectiveAiRoute(
        tx as PrismaService,
        organizationId,
        "repository",
      );
      const currentProvider = await tx.aiProviderConnection.findFirst({
        where: { id: provider.id, organizationId, revision: provider.revision },
      });
      if (
        !current ||
        effective?.id !== route.id ||
        effective.revision !== route.revision ||
        !currentProvider ||
        !this.configuration.ready(currentProvider)
      )
        throw new ConflictException(
          "Model configuration changed. Refresh and try again.",
        );
      const hourly = await tx.auditEvent.count({
        where: {
          event: { in: ["pipeline.workflow.rewrite.requested", "pipeline.workflow.generate.requested"] },
          metadata: { path: ["organizationId"], equals: organizationId },
          createdAt: { gt: new Date(Date.now() - 3600000) },
        },
      });
      if (hourly >= 20)
        throw new HttpException("Hourly workflow rewrite limit reached", 429);
      await tx.auditEvent.create({
        data: {
          id: auditId,
          actorId: session.identityId,
          event: `${event}.requested`,
          metadata: {
            organizationId,
            repositoryId,
            policyId,
            requestId,
            skill,
            providerId: provider.id,
            routeRevision: route.revision,
            inputHash: setup?.inputHash ?? digest(workflow),
            ...(setupSnapshot ? { sourceSha: setupSnapshot.sourceSha } : {}),
          },
        },
      });
    });
    try {
      const result = await runPromptInference(
        provider,
        prompt,
        setup ? 2048 : workflowResponseTokenLimit,
        AbortSignal.timeout(90000),
        (raw, credential) => setup ? setup.validate(raw, credential) : validateRewrite(raw, workflow, credential),
        async (usage) => {
          await this.db.auditEvent.create({
            data: {
              event: `${event}.usage`,
              actorId: session.identityId,
              metadata: {
                organizationId,
                repositoryId,
                policyId,
                requestId,
                skill,
                ...usage,
              },
            },
          });
        },
        { jsonOutput: true, usageContext: { db: this.db,
          repositoryId: (await this.access.requireRepository(session, repositoryId, "ai.review.run")).id,
          workload: "WORKFLOW", sourceId: requestId } },
      );
      const current = await this.model(session, repositoryId);
      await this.access.requireRepository(
        session,
        repositoryId,
        "policy.publish",
      );
      if (
        current.route.revision !== route.revision ||
        current.provider.id !== provider.id ||
        current.provider.revision !== provider.revision
      )
        throw new ConflictException(
          "Model configuration changed during the rewrite",
        );
      await this.db.auditEvent.create({
        data: {
          event: `${event}.completed`,
          actorId: session.identityId,
          metadata: {
            organizationId,
            repositoryId,
            policyId,
            requestId,
            skill,
            outputHash: digest(result.workflow),
          },
        },
      });
      return {
        ...result,
        model: provider.name + " / " + provider.modelId,
        skill,
      };
    } catch (error) {
      const failure = rewriteFailure(error);
      await this.db.auditEvent.create({
        data: {
          event: `${event}.failed`,
          actorId: session.identityId,
          metadata: {
            organizationId,
            repositoryId,
            policyId,
            requestId,
            skill,
            failureCode: failure.code,
            ...("location" in failure && failure.location
              ? { location: failure.location }
              : {}),
            ...("providerStatus" in failure && failure.providerStatus
              ? { providerStatus: failure.providerStatus }
              : {}),
          },
        },
      });
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(failure.message);
    }
  }
}
