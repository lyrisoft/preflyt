import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import { AiConfigurationService } from "../intelligence/ai-configuration.service.js";
import { effectiveAiRoute } from "../intelligence/effective-ai-route.js";
import { defaultVaptLimits } from "../intelligence/vapt-limits.js";
import { trackModelUsage } from "../intelligence/model-usage.js";
import {
  aiReviewsEnabled,
  providerEndpoint,
  endpointDigest,
  aiCredentialEndpointDigest,
  decryptAiCredential,
  aiApiBaseUrl,
} from "../intelligence/ai-configuration.js";
import { aiHttpRequest } from "../intelligence/ai-http.js";
import { providerUsage } from "../intelligence/skill-inference.js";
import type { GitHubProviderService } from "../github/github-provider.service.js";
import {
  Prisma,
  type RepositoryHealthAssessment,
} from "../generated/prisma/client.js";
import type { NativeSourceBundle } from '../execution/native-source.js';
import type { HealthReport } from "./health-report.js";
import { StrixClient, StrixRunnerBusyError } from "./strix-client.js";
import { STRIX_CHECK, strixReport, strixScope } from "./strix-report.js";
import { HealthSourceStore } from "./health-source-store.js";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const json = (v: unknown) => v as Prisma.InputJsonValue;
const sessionFor = (row: RepositoryHealthAssessment): AuthenticatedSession => ({
  authenticated: true,
  identityId: row.actorId,
  organizationId: row.organizationId,
  subject: "health-strix",
  email: null,
  role: "WORKER",
});
const noModel = () =>
  new BadRequestException(
    "Enable a tested AI security review model route with source sharing in AI Intelligence before running Strix.",
  );
export class HealthStrixService {
  readonly client: StrixClient;
  private readonly localModelTurns = new Map<string, Promise<void>>();
  constructor(
    private db: PrismaService,
    private access: AuthorizationService,
    private github: GitHubProviderService,
    client?: StrixClient,
    private sourceStore: HealthSourceStore = new HealthSourceStore(),
  ) {
    this.client = client ?? new StrixClient();
  }
  async selection(session: AuthenticatedSession, repository: string) {
    await this.access.requireRepository(session, repository, "execution.run");
    await this.access.requireRepository(session, repository, "ai.review.run");
    if (!aiReviewsEnabled()) throw noModel();
    const route = await effectiveAiRoute(
      this.db,
      session.organizationId!,
      "vapt",
    );
    if (!route?.enabled || !route.allowSource || !route.primaryId)
      throw noModel();
    const provider = await this.db.aiProviderConnection.findFirst({
      where: { id: route.primaryId, organizationId: session.organizationId! },
    });
    if (
      !provider ||
      !new AiConfigurationService(this.db, this.access).ready(provider)
    )
      throw noModel();
    return { route, provider, endpoint: providerEndpoint(provider)! };
  }
  async available(session: AuthenticatedSession, repository: string) {
    try {
      await this.selection(session, repository);
      const pkg = await this.client.call("/capabilities", {
        repositoryId: repository,
      });
      if (
        pkg.version !== 1 ||
        pkg.toolVersion !== "1.7.0" ||
        pkg.available !== true
      )
        return {
          available: false,
          reason: "Strix runner is not ready for this repository.",
        };
      return {
        available: true,
        reviewProfiles: Array.isArray(pkg.reviewProfiles) ? pkg.reviewProfiles.filter((profile:unknown)=>['general','payment-risk-v1','general-and-payment-risk-v1'].includes(profile as string)) as string[] : ['general'],
        reason:
          "Runs an optional AI security review using the security testing model. Suggestions do not change CI or merge evaluation.",
      };
    } catch (error) {
      return {
        available: false,
        reason:
          error instanceof BadRequestException
            ? error.message
            : error instanceof ForbiddenException
              ? "Your role does not allow security testing for this repository."
              : "Start the dedicated Strix runner to enable this scanner.",
      };
    }
  }
  async initialize(
    tx: any,
    row: RepositoryHealthAssessment,
    selection: Awaited<ReturnType<HealthStrixService["selection"]>>,
    preparedToken?: string,
  ) {
    const token =
      preparedToken ??
      this.client.token(await this.client.connection(), row.id);
    const limits = await tx.aiVaptSettings.findUnique({
      where: { organizationId: row.organizationId },
    });
    await tx.repositoryHealthStrixRun.create({
      data: {
        assessmentId: row.id,
        providerId: selection.provider.id,
        providerRevision: selection.provider.revision,
        routeId: selection.route.id,
        routeRevision: selection.route.revision,
        endpointDigest: endpointDigest(selection.endpoint),
        tokenHash: hash(token),
        maxInputTokens:
          limits?.maxInputTokens ?? defaultVaptLimits.maxInputTokens,
        maxOutputTokens:
          limits?.maxOutputTokens ?? defaultVaptLimits.maxOutputTokens,
        maxModelCalls: limits?.maxModelCalls ?? defaultVaptLimits.maxModelCalls,
      },
    });
  }
  private async live(row: RepositoryHealthAssessment, recovering = false) {
    const repo = await this.db.gitHubRepository.findUniqueOrThrow({
      where: { id: row.repositoryId },
    });
    const run = await this.db.repositoryHealthStrixRun.findUniqueOrThrow({
      where: { assessmentId: row.id },
    });
    const selected = await this.selection(
      sessionFor(row),
      repo.githubId.toString(),
    );
    if (
      (!recovering && run.finishedAt) ||
      run.failureCode ||
      row.state !== "RUNNING" ||
      row.cancelledAt ||
      !row.startedAt ||
      Date.now() - row.startedAt.getTime() > 3600000 ||
      run.providerId !== selected.provider.id ||
      run.providerRevision !== selected.provider.revision ||
      run.routeId !== selected.route.id ||
      run.routeRevision !== selected.route.revision ||
      run.endpointDigest !== endpointDigest(selected.endpoint)
    )
      throw new ForbiddenException(
        "Strix review access or model configuration changed",
      );
    return { ...selected, repo, run };
  }
  async process(
    row: RepositoryHealthAssessment,
    leaseToken: string,
  ): Promise<{
    state:
      "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SKIPPED";
    report?: HealthReport;
    sourceBundle?:NativeSourceBundle;
    reason?: string;
  }> {
    const run = await this.db.repositoryHealthStrixRun.findUniqueOrThrow({
      where: { assessmentId: row.id },
    });
    const stop = async (reason: string, cancelled = false) => {
      const current = await this.db.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: row.id },
      });
      if (current.dispatchedAt) {
        try {
          const stopped = await this.client.cancel(row.id);
          if (!stopped.cleanupConfirmed) return { state: "RUNNING" as const };
        } catch {
          return { state: "RUNNING" as const };
        }
      }
      return {
        state: cancelled ? ("CANCELLED" as const) : ("FAILED" as const),
        reason,
        ...((reason.endsWith("_LIMIT_REACHED") || reason.startsWith('STRIX_MODEL_')) && row.report
          ? {
              report: {
                ...(row.report as unknown as HealthReport),
                analyses: (row.report as unknown as HealthReport).analyses.map(
                  (analysis) => ({
                    ...analysis,
                    state: "INCOMPLETE" as const,
                    reason,
                  }),
                ),
              },
            }
          : {}),
      };
    };
    if (row.cancelledAt) return stop("EXECUTION_CANCELLED", true);
    // Recover an old worker's partially finalized failure without enabling model calls.
    if (run.failureCode)
      return stop(run.failureCode, run.failureCode === "EXECUTION_CANCELLED");
    try {
      const { repo, provider, endpoint } = await this.live(row, true);
      const plan = row.plan as any;
      let sourceHash = plan.sourceHash as string | undefined;
      let source:
        | Awaited<ReturnType<GitHubProviderService["readHealthScanSource"]>>
        | undefined;
      let sharedOwner: RepositoryHealthAssessment | null = null;
      if (row.parentId) {
        sharedOwner =
          await this.db.repositoryHealthAssessment.findUniqueOrThrow({
            where: { id: row.parentId },
          });
        if (
          sharedOwner.organizationId !== row.organizationId ||
          sharedOwner.repositoryId !== row.repositoryId ||
          sharedOwner.branch !== row.branch
        )
          throw new Error("HEALTH_SHARED_SOURCE_UNAVAILABLE");
        const shared = (sharedOwner.plan as any)?.sharedSource;
        if (!shared || !sharedOwner.sourceSha)
          return {
            state: "FAILED",
            reason: "HEALTH_SHARED_SOURCE_UNAVAILABLE",
          };
        if (
          (sourceHash && sourceHash !== shared.sourceHash) ||
          (row.sourceSha && row.sourceSha !== sharedOwner.sourceSha)
        )
          throw new Error("HEALTH_SHARED_SOURCE_UNAVAILABLE");
        sourceHash = shared.sourceHash;
      }
      const readSource = () =>
        sharedOwner
          ? this.sourceStore.read(sharedOwner)
          : this.github.readHealthScanSource(
              repo.installationId,
              repo.githubId,
              row.sourceSha!,
              AbortSignal.timeout(600000),
              false,
            );
      if (!row.sourceSha) {
        await this.db.repositoryHealthAssessment.updateMany({
          where: { id: row.id, leaseToken },
          data: { leaseUntil: new Date(Date.now() + 12 * 60000) },
        });
        const snapshot = sharedOwner
          ? {
              sourceSha: sharedOwner.sourceSha!,
              scanSource: await this.sourceStore.read(sharedOwner),
            }
          : await this.github.readRepositorySnapshot(
              repo.installationId,
              repo.githubId,
              row.branch,
              true,
            );
        source =
          snapshot.scanSource ??
          (await this.github.readHealthScanSource(
            repo.installationId,
            repo.githubId,
            snapshot.sourceSha,
            AbortSignal.timeout(600000),
            false,
          ));
        await this.live(row, true);
        sourceHash = source.source.sourceHash;
        const pending: HealthReport = {
          version: 1,
          selection: "security",
          mode: "INSPECTION_ONLY",
          completeness: "PARTIAL",
          comparisonKey: "strix-advisory-v1",
          inspection: {
            complete: false,
            fileCount: source.source.files.length,
            languages: [],
          },
          analyses: [
            {
              id: STRIX_CHECK,
              title: "Strix security review",
              scope: strixScope,
              state: "UNAVAILABLE",
              reason: "STRIX_REVIEW_PENDING",
            },
          ],
          findings: [],
          limits: ["Strix findings are suggestions only."],
        };
        const changed = await this.db.repositoryHealthAssessment.updateMany({
          where: { id: row.id, leaseToken, cancelledAt: null, sourceSha: null },
          data: {
            sourceSha: snapshot.sourceSha,
            report: json(pending),
            plan: json({
              ...plan,
              kind: "STRIX_HEALTH",
              stage: "SCANNING",
              sourceHash,
              excludedFiles: source.excludedFiles,
            }),
          },
        });
        if (!changed.count) return { state: "RUNNING" };
        row = await this.db.repositoryHealthAssessment.findUniqueOrThrow({
          where: { id: row.id },
        });
      }
      if (!sourceHash) throw new Error("STRIX_SOURCE_INVALID");
      const result = await this.client.status(row.id, sourceHash);
      if (result.state === "NOT_FOUND") {
        if (run.dispatchedAt || run.finishedAt)
          return stop("STRIX_RUNNER_STATE_LOST");
        source ??= await readSource();
        if (source.source.sourceHash !== sourceHash)
          throw new Error("STRIX_SOURCE_INVALID");
        await this.live(row);
        const dispatchedAt = new Date();
        const started = await this.db.repositoryHealthStrixRun.updateMany({
          where: { assessmentId: row.id, dispatchedAt: null, finishedAt: null },
          data: { dispatchedAt },
        });
        if (!started.count) return { state: "RUNNING" };
        const connection = await this.client.connection();
        const prefix =
          endpoint.preset === "anthropic"
            ? "anthropic"
            : endpoint.preset === "gemini"
              ? "gemini"
              : "openai";
        const callback = new URL(
          process.env.STRIX_CALLBACK_ORIGIN ?? "http://127.0.0.1:3000",
        );
        if (
          !["http:", "https:"].includes(callback.protocol) ||
          callback.username ||
          callback.password ||
          callback.pathname !== "/" ||
          callback.search ||
          callback.hash
        )
          throw new Error("STRIX_CALLBACK_INVALID");
        try {
          await this.client.admit({
            assessmentId: row.id,
            repositoryId: repo.githubId.toString(),
            source: source.source,
            model: prefix + "/" + provider.modelId.replace(/^models\//, ""),
            apiType: endpoint.preset === 'openai' ? 'responses' : 'chat_completions',
            reviewProfile: (row.plan as any)?.reviewProfile ?? 'general',
            maxModelCalls: run.maxModelCalls,
            maxSpecialists: endpoint.locality === "local" ? 1 : 2,
            modelToken: this.client.token(connection, row.id),
            callbackOrigin: callback.origin,
          });
        } catch (error) {
          if (!(error instanceof StrixRunnerBusyError)) throw error;
          // Only a typed, explicit pre-admission refusal permits another admission.
          const reset = await this.db.repositoryHealthStrixRun.updateMany({
            where: {
              assessmentId: row.id,
              dispatchedAt,
              finishedAt: null,
              modelCalls: 0,
            },
            data: { dispatchedAt: null },
          });
          if (!reset.count) throw new Error("STRIX_ADMISSION_CHANGED");
          return { state: "QUEUED", reason: "STRIX_RUNNER_BUSY" };
        }
        return { state: "RUNNING" };
      }
      if (result.state === "RUNNING") return { state: "RUNNING" };
      if (!result.cleanupConfirmed) return { state: "RUNNING" };
      if (result.assessmentId !== row.id || result.sourceHash !== sourceHash)
        throw new Error("STRIX_REPORT_SCOPE_INVALID");
      source ??= await readSource();
      row = await this.db.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: row.id },
      });
      if (row.cancelledAt) return stop("EXECUTION_CANCELLED", true);
      if (row.leaseToken !== leaseToken) return { state: "RUNNING" };
      await this.live(row, true);
      const report = strixReport(
        result,
        source.source,
        (row.plan as any).excludedFiles ?? 0,
        (row.plan as any)?.reviewProfile ?? 'general',
      );
      return {
        state: result.state === "COMPLETED" ? "COMPLETED" : "FAILED",
        report,
        sourceBundle:source.source,
        reason:
          result.state === "COMPLETED" ? undefined : result.reason === "PAYMENT_RISK_REPORT_INCOMPLETE" ? "PAYMENT_RISK_REPORT_INCOMPLETE" : "STRIX_REVIEW_INCOMPLETE",
      };
    } catch (error) {
      if (
        row.parentId &&
        !run.dispatchedAt &&
        (error instanceof BadRequestException ||
          error instanceof ForbiddenException)
      )
        return { state: "SKIPPED", reason: "AI_SECURITY_UNAVAILABLE" };
      if (
        row.parentId &&
        (error as Error)?.message === "HEALTH_SHARED_SOURCE_UNAVAILABLE"
      )
        return stop("HEALTH_SHARED_SOURCE_UNAVAILABLE");
      // Access/model revocation also cancels the owned sandbox; no paid scan is replayed.
      const reason =
        error instanceof ForbiddenException
          ? "ACCESS_REVOKED"
          : error instanceof Error && ["PAYMENT_RISK_REPORT_INVALID","PAYMENT_RISK_REPORT_INCOMPLETE"].includes(error.message) ? "PAYMENT_RISK_REPORT_INCOMPLETE" : "STRIX_REVIEW_UNAVAILABLE";
      return stop(reason);
    }
  }
  /** Queue local inference fairly instead of rejecting a coordinator behind its specialists. */
  private async localModelTurn<T>(id: string, local: boolean, operation: () => Promise<T>): Promise<T> {
    if (!local) return operation();
    const previous = this.localModelTurns.get(id) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => held);
    this.localModelTurns.set(id, tail);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([previous, new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new ServiceUnavailableException("Local model queue timed out")), 600000);
        timeout.unref();
      })]);
      return await operation();
    } finally {
      clearTimeout(timeout);
      release();
      void tail.then(() => { if (this.localModelTurns.get(id) === tail) this.localModelTurns.delete(id); });
    }
  }
  /** Narrow model broker. Strix never receives the actual provider credential. */
  async model(
    assessmentId: string,
    bearer: string | undefined,
    operation: string,
    input: unknown,
  ) {
    if (!/^[a-f0-9-]{36}$/.test(assessmentId) || !bearer?.startsWith("Bearer "))
      throw new ForbiddenException("Model authorization unavailable");
    const token = bearer.slice(7);
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new ForbiddenException("Model authorization unavailable");
    const row = await this.db.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: assessmentId },
    });
    const { run, provider, endpoint } = await this.live(row);
    if (
      !timingSafeEqual(
        Buffer.from(run.tokenHash, "hex"),
        Buffer.from(hash(token), "hex"),
      )
    )
      throw new ForbiddenException("Model authorization unavailable");
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Buffer.byteLength(JSON.stringify(input)) > 900000
    )
      throw new BadRequestException(
        "Strix model request exceeds its input limit",
      );
    return this.localModelTurn(assessmentId, endpoint.locality === "local", async () => {
    // A queued request may outlive cancellation, permissions or configuration.
    await this.live(await this.db.repositoryHealthAssessment.findUniqueOrThrow({ where: { id: assessmentId } }));
    const body = { ...(input as Record<string, any>) };
    let path: string,
      headers: Record<string, string> = { "content-type": "application/json" };
    const key = provider.encryptedCredential
      ? decryptAiCredential(
          provider.organizationId,
          provider.id,
          provider.encryptedCredential,
          aiCredentialEndpointDigest(endpoint),
        )
      : undefined;
    const model = provider.modelId.replace(/^models\//, "");
    const outputLimit = (value: unknown) =>
      Number.isSafeInteger(value) && (value as number) > 0
        ? Math.min(value as number, 8192)
        : 8192;
    if (endpoint.preset === 'openai' && operation.endsWith('/responses')) {
      const textOnly = (content: any) => typeof content === 'string' ||
        (Array.isArray(content) && content.every(part =>
          ['input_text', 'output_text', 'refusal'].includes(part?.type) &&
          typeof (part.text ?? part.refusal) === 'string'));
      const sourceOnlyInput = body.input === undefined || typeof body.input === 'string' ||
        (Array.isArray(body.input) && body.input.every((item: any) => {
          if (item?.type === 'reasoning') return typeof item.encrypted_content === 'string';
          if (item?.type === 'function_call') return typeof item.name === 'string' && typeof item.arguments === 'string';
          if (item?.type === 'function_call_output') return textOnly(item.output);
          return (item?.type === undefined || item.type === 'message') && textOnly(item?.content);
        }));
      if (body.model !== model || body.previous_response_id || body.conversation || body.prompt || !sourceOnlyInput ||
        (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.some((tool: any) => tool?.type !== 'function'))))
        throw new BadRequestException('Unsupported model operation');
      path = '/responses';
      if (key) headers.authorization = 'Bearer ' + key;
      body.max_output_tokens = outputLimit(body.max_output_tokens);
      // Keep history inside this assessment. No hosted tools, background work or
      // stored provider conversations can bypass the source-only sandbox.
      body.store = false;
      body.background = false;
      body.include = ['reasoning.encrypted_content'];
    } else if (endpoint.preset === "anthropic") {
      if (!operation.endsWith("/messages") || body.model !== model)
        throw new BadRequestException("Unsupported model operation");
      path = "/messages";
      headers["anthropic-version"] = "2023-06-01";
      if (key) headers["x-api-key"] = key;
      body.max_tokens = outputLimit(body.max_tokens);
    } else if (endpoint.preset === "gemini") {
      if (!operation.endsWith("/models/" + model + ":generateContent"))
        throw new BadRequestException("Unsupported model operation");
      path = "/models/" + encodeURIComponent(model) + ":generateContent";
      if (key) headers["x-goog-api-key"] = key;
      body.generationConfig = {
        ...body.generationConfig,
        maxOutputTokens: outputLimit(body.generationConfig?.maxOutputTokens),
      };
    } else {
      if (!operation.endsWith("/chat/completions") || body.model !== model)
        throw new BadRequestException("Unsupported model operation");
      path = "/chat/completions";
      if (key) headers.authorization = "Bearer " + key;
      const requestedOutput=body.max_completion_tokens??body.max_tokens;
      delete body.max_completion_tokens;
      body.max_tokens = outputLimit(requestedOutput);
      // Ollama Gemma defaults to thinking, which can consume an entire bounded
      // response without a tool call. Use its supported direct-generation mode
      // for this source-review tool loop; hosted providers retain their settings.
      if (endpoint.locality === "local" && /^gemma4(?::|$)/.test(model))
        body.reasoning_effort = "none";
      if (endpoint.preset === "openai") {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
      }
    }
    body.stream = false;
    const reservedOutput = path === '/responses' ? body.max_output_tokens
      : endpoint.preset === 'gemini' ? body.generationConfig.maxOutputTokens
        : endpoint.preset === 'openai' ? body.max_completion_tokens : body.max_tokens;
    if (Buffer.byteLength(JSON.stringify(body)) > 524288)
      throw new BadRequestException('Strix model request exceeds its input limit');
    const estimatedInput = Math.ceil(
      Buffer.byteLength(JSON.stringify(body)) / 3,
    );
    const reserved = await this.db.repositoryHealthStrixRun.updateMany({
      where: {
        assessmentId,
        finishedAt: null,
        failureCode: null,
        modelCalls: { lt: run.maxModelCalls },
        inFlight: { lt: 2 },
        inputTokens: { lte: run.maxInputTokens - estimatedInput },
        outputTokens: { lte: run.maxOutputTokens - reservedOutput },
      },
      data: {
        modelCalls: { increment: 1 },
        inFlight: { increment: 1 },
        inputTokens: { increment: estimatedInput },
        outputTokens: { increment: reservedOutput },
      },
    });
    if (!reserved.count) {
      const current = await this.db.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId },
      });
      const failureCode =
        current.modelCalls >= current.maxModelCalls
          ? "STRIX_REQUEST_LIMIT_REACHED"
          : current.inputTokens + estimatedInput > current.maxInputTokens
            ? "STRIX_INPUT_LIMIT_REACHED"
            : current.inFlight === 0 &&
                current.outputTokens + reservedOutput > current.maxOutputTokens
              ? "STRIX_OUTPUT_LIMIT_REACHED"
              : null;
      if (failureCode && !current.finishedAt) {
        await this.db.repositoryHealthStrixRun.updateMany({
          where: { assessmentId, finishedAt: null, failureCode: null },
          data: { failureCode },
        });
        // A cumulative allowance cannot recover with retries. The worker cancels
        // the owned runner and saves this explicit failure after cleanup.
        throw new BadRequestException({
          statusCode: 400,
          code: failureCode,
          message:
            "AI security review limit reached. Configure AI security review limits in AI Intelligence before starting a new scan.",
        });
      }
      throw new ServiceUnavailableException(
        "Strix model request is temporarily unavailable",
      );
    }
    const rejectModel = async (status: number | null): Promise<never> => {
      const failureCode = status === 401 || status === 403 ? 'STRIX_MODEL_ACCESS_DENIED'
        : status === 429 ? 'STRIX_MODEL_RATE_LIMITED'
          : status !== null && status >= 400 && status < 500 && status !== 408
            ? 'STRIX_MODEL_REQUEST_REJECTED' : 'STRIX_MODEL_UNAVAILABLE';
      // Explicit client rejections did not generate a completion. Unknown
      // transport/server outcomes retain their reservation as a spending bound.
      const rejected = status !== null && status >= 400 && status < 500 && status !== 408;
      await this.db.repositoryHealthStrixRun.updateMany({
        where: { assessmentId, finishedAt: null },
        data: { failureCode, ...(rejected ? {
          inputTokens: { decrement: estimatedInput },
          outputTokens: { decrement: reservedOutput },
        } : {}) },
      });
      await this.db.auditEvent.create({ data: {
        event: 'repository.health.strix.model_failed', actorId: row.actorId,
        metadata: { assessmentId, status, failureCode, reservationReleased: rejected },
      } });
      throw new BadRequestException({
        statusCode: 400, code: failureCode,
        message: 'The configured security review model could not complete the request. Check the model connection before starting another review.',
      });
    };
    try {
      return await trackModelUsage({ db: this.db, repositoryId: row.repositoryId, workload: "VAPT", sourceId: row.id }, provider, undefined, async (recordUsage) => {
      const response = await aiHttpRequest(
        new URL(aiApiBaseUrl(endpoint) + path),
        endpoint.locality,
        {
          headers,
          body: JSON.stringify(body),
          maxBodyBytes: 524288,
          signal: AbortSignal.timeout(endpoint.locality === "local" ? 600000 : 90000),
        },
      ).catch(()=>rejectModel(null));
      if (!response.ok) return rejectModel(response.status);
      const value = await response.json().catch(()=>rejectModel(null));
      const usage = providerUsage(endpoint.preset, value);
      await recordUsage(usage);
      await this.db.repositoryHealthStrixRun.update({
        where: { assessmentId },
        data: {
          inputTokens: {
            increment: Math.max(
              0,
              (usage.inputTokens ?? 0) -
                Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 3),
            ),
          },
          outputTokens: { increment: (usage.outputTokens ?? reservedOutput) - reservedOutput },
        },
      });
      const current =
        await this.db.repositoryHealthAssessment.findUniqueOrThrow({
          where: { id: assessmentId },
        });
      await this.live(current);
      return value;
      });
    } finally {
      await this.db.repositoryHealthStrixRun.updateMany({
        where: { assessmentId, inFlight: { gt: 0 } },
        data: { inFlight: { decrement: 1 } },
      });
    }
    });
  }
}
