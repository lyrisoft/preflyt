import { randomUUID } from "node:crypto";
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { FindingsService } from "./findings.service.js";
import { RepositoryHealthService } from "../health/repository-health.service.js";
import { FindingSourceStore } from "./finding-source-store.service.js";
import { hiddenSource } from "./finding-source-store.js";
import { AiConfigurationService } from "../intelligence/ai-configuration.service.js";
import {
  aiReviewsEnabled,
  endpointDigest,
  providerEndpoint,
} from "../intelligence/ai-configuration.js";
import { effectiveAiRoute } from "../intelligence/effective-ai-route.js";
import {
  AiResponseError,
  runPromptInference,
} from "../intelligence/skill-inference.js";
import { digest } from "../assessments/assessment-digest.js";
import { Prisma, type AiFindingGuidance } from "../generated/prisma/client.js";
import {
  boundedFindingContext,
  findingAiPrompt,
  validateFindingAiResult,
  type FindingAiContext,
} from "./finding-ai-prompt.js";
export type FindingAiScope = {
  origin: "ci" | "health";
  repositoryId: string;
  assessmentId: string;
  findingId: string;
};
type Pin = { id: string; revision: number; endpointDigest: string };
type Snapshot = {
  scope: FindingAiScope;
  context: FindingAiContext;
  route: { id: string; revision: number };
  providers: Pin[];
};
const json = (value: unknown) => value as Prisma.InputJsonValue;
@Injectable()
export class FindingAiGuidanceService {
  private abort = new AbortController();
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(AuthorizationService) private access: AuthorizationService,
    @Inject(FindingsService) private findings: FindingsService,
    @Inject(RepositoryHealthService) private health: RepositoryHealthService,
    @Inject(FindingSourceStore) private sources: FindingSourceStore,
    @Inject(AiConfigurationService) private config: AiConfigurationService,
  ) {}
  close() {
    this.abort.abort();
  }
  private async resolve(session: AuthenticatedSession, scope: FindingAiScope) {
    const repo = await this.access.requireRepository(
      session,
      scope.repositoryId,
      "assessment.read",
    );
    const finding =
      scope.origin === "ci"
        ? (
            await this.findings.detail(
              session,
              scope.findingId,
              scope.assessmentId,
            )
          ).finding
        : (
            await this.health.get(
              session,
              scope.repositoryId,
              scope.assessmentId,
            )
          ).assessment?.report?.findings.find(
            (f) => f.fingerprint === scope.findingId,
          );
    if (
      !finding ||
      ("repositoryId" in finding && finding.repositoryId !== scope.repositoryId)
    )
      throw new NotFoundException("Finding is unavailable in this repository");
    const sourceSha =
      scope.origin === "ci"
        ? finding.sourceSha
        : (
            await this.db.repositoryHealthAssessment.findFirstOrThrow({
              where: {
                id: scope.assessmentId,
                repositoryId: repo.id,
                organizationId: session.organizationId!,
              },
            })
          ).sourceSha;
    if (!sourceSha)
      throw new ConflictException("Assessed source is unavailable");
    return { repo, finding, sourceSha };
  }
  private async model(organizationId: string) {
    if (!aiReviewsEnabled()) return null;
    const route = await effectiveAiRoute(this.db, organizationId, "repository");
    if (!route?.enabled || !route.allowSource) return null;
    const providers = await this.db.aiProviderConnection.findMany({
      where: {
        organizationId,
        id: {
          in: [route.primaryId, route.fallbackId].filter(
            (id): id is string => !!id,
          ),
        },
      },
    });
    const ready = [route.primaryId, route.fallbackId]
      .map((id) => providers.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && this.config.ready(p));
    return ready.length ? { route, providers: ready } : null;
  }
  private public(row: AiFindingGuidance | null) {
    if (!row)
      return { state: "NONE", result: null, model: null, finishedAt: null };
    const snapshot = row.snapshot as unknown as Snapshot;
    if (
      digest(snapshot) !== row.inputHash ||
      row.id !==
        digest([
          "finding-ai-v2",
          row.organizationId,
          row.repositoryId,
          row.inputHash,
        ])
    )
      throw new ConflictException("Saved AI guidance integrity check failed");
    const result =
      row.state === "SUCCEEDED" && row.result
        ? validateFindingAiResult(JSON.stringify(row.result), snapshot.context)
        : null;
    if (result && digest(result) !== row.resultHash)
      throw new ConflictException("Saved AI guidance integrity check failed");
    return {
      state: row.state,
      result,
      model: row.modelLabel,
      finishedAt: row.finishedAt,
      failure: row.failure,
    };
  }
  private async prepare(session: AuthenticatedSession, scope: FindingAiScope) {
    const { repo, finding, sourceSha } = await this.resolve(session, scope);
    const model = await this.model(session.organizationId!);
    if (!model || hiddenSource(finding) || !finding.path || !finding.line)
      return {
        available: false,
        canGenerate: false,
        state: "UNAVAILABLE",
        result: null,
        model: null,
        finishedAt: null,
        reason:
          "AI is not configured for this finding; analyzer guidance is shown.",
      } as const;
    let canGenerate = false;
    try {
      await this.access.requireRepository(
        session,
        scope.repositoryId,
        "ai.review.run",
      );
      canGenerate = true;
    } catch {}
    const source = await this.sources.read(
      repo.id,
      sourceSha,
      finding,
      scope.origin === "health" ? 5 : 8,
    );
    if (source.reason || !source.lines.length)
      return {
        available: false,
        canGenerate: false,
        state: "UNAVAILABLE",
        result: null,
        model: null,
        finishedAt: null,
        reason: "Verified code is unavailable; analyzer guidance is shown.",
      } as const;
    const context = boundedFindingContext(
      {
        title: finding.title,
        ruleId: finding.ruleId,
        category: finding.category,
        path: finding.path,
        line: finding.line,
        endLine: finding.endLine ?? finding.line,
        verification:
          "verification" in finding
            ? String(finding.verification)
            : "Verified analyzer receipt",
      },
      sourceSha,
      source.lines,
      source.truncated,
    );
    const snapshot: Snapshot = {
      scope,
      context,
      route: { id: model.route.id, revision: model.route.revision },
      providers: model.providers.map((p) => ({
        id: p.id,
        revision: p.revision,
        endpointDigest: endpointDigest(providerEndpoint(p)!),
      })),
    };
    const inputHash = digest(snapshot),
      id = digest([
        "finding-ai-v2",
        session.organizationId,
        repo.id,
        inputHash,
      ]);
    await this.access.requireRepository(
      session,
      scope.repositoryId,
      "assessment.read",
    );
    return { available: true, canGenerate, repo, id, inputHash, snapshot };
  }
  async get(session: AuthenticatedSession, scope: FindingAiScope) {
    const prepared = await this.prepare(session, scope);
    if (!prepared.available) return prepared;
    const row = await this.db.aiFindingGuidance.findFirst({
      where: {
        id: prepared.id,
        organizationId: session.organizationId!,
        repositoryId: prepared.repo.id,
      },
    });
    await this.access.requireRepository(
      session,
      scope.repositoryId,
      "assessment.read",
    );
    return {
      available: true,
      canGenerate: prepared.canGenerate,
      cacheKey: prepared.id,
      ...this.public(row),
    };
  }
  async request(
    session: AuthenticatedSession,
    scope: FindingAiScope,
    retry = false,
  ) {
    await this.access.requireRepository(
      session,
      scope.repositoryId,
      "ai.review.run",
    );
    const prepared = await this.prepare(session, scope);
    if (!prepared.available) throw new ConflictException(prepared.reason);
    let row: AiFindingGuidance;
    try {
      row = await this.db.$transaction(
        async (tx) => {
          await new AuthorizationService(tx as PrismaService).requireRepository(
            session,
            scope.repositoryId,
            "ai.review.run",
          );
          const existing = await tx.aiFindingGuidance.findUnique({
            where: { id: prepared.id },
          });
          if (
            existing &&
            (!retry || existing.state !== "FAILED" || existing.attempts >= 3)
          )
            return existing;
          const recent = await tx.aiFindingGuidance.count({
            where: {
              organizationId: session.organizationId!,
              createdAt: { gt: new Date(Date.now() - 3600000) },
            },
          });
          const day = await tx.aiFindingGuidance.count({
            where: {
              organizationId: session.organizationId!,
              createdAt: { gt: new Date(Date.now() - 86400000) },
            },
          });
          const attempts = await tx.auditEvent.count({
            where: {
              event: "finding.ai.requested",
              metadata: {
                path: ["organizationId"],
                equals: session.organizationId!,
              },
              createdAt: { gt: new Date(Date.now() - 3600000) },
            },
          });
          if (recent >= 20 || day >= 100 || attempts >= 20)
            throw new HttpException(
              "AI finding guidance limit reached; analyzer guidance is available.",
              429,
            );
          const data = {
            organizationId: session.organizationId!,
            actorId: session.identityId,
            ...scope,
            repositoryId: prepared.repo.id,
            sourceSha: prepared.snapshot.context.sourceSha,
            inputHash: prepared.inputHash,
            snapshot: json(prepared.snapshot),
            state: "QUEUED",
            result: Prisma.DbNull,
            resultHash: null,
            modelLabel: null,
            usage: Prisma.DbNull,
            leaseToken: null,
            leaseUntil: null,
            failure: null,
            finishedAt: null,
          };
          const saved = existing
            ? await tx.aiFindingGuidance.update({
                where: { id: prepared.id },
                data,
              })
            : await tx.aiFindingGuidance.create({
                data: { id: prepared.id, ...data },
              });
          await tx.auditEvent.create({
            data: {
              event: "finding.ai.requested",
              actorId: session.identityId,
              metadata: {
                organizationId: session.organizationId!,
                repositoryId: scope.repositoryId,
                guidanceId: saved.id,
                sourceSha: saved.sourceSha,
              },
            },
          });
          return saved;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (!["P2002", "P2034"].includes((error as { code?: string }).code ?? ""))
        throw error;
      const concurrent = await this.db.aiFindingGuidance.findUnique({
        where: { id: prepared.id },
      });
      if (!concurrent) throw error;
      row = concurrent;
    }
    return { available: true, canGenerate: true, ...this.public(row) };
  }
  async reconcile() {
    if (this.abort.signal.aborted) return;
    const rows = await this.db.aiFindingGuidance.findMany({
      where: {
        state: { in: ["QUEUED", "RUNNING"] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    for (const row of rows) await this.process(row);
  }
  async process(row: AiFindingGuidance) {
    const token = randomUUID(),
      leaseUntil = new Date(Date.now() + 250000);
    const claimed = await this.db.aiFindingGuidance.updateMany({
      where: { id: row.id, state: row.state, leaseUntil: row.leaseUntil },
      data: {
        state: "RUNNING",
        leaseToken: token,
        leaseUntil,
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: row.actorId,
      organizationId: row.organizationId,
      subject: "finding-ai",
      email: null,
      role: "WORKER",
    };
    const snapshot = row.snapshot as unknown as Snapshot;
    try {
      if (row.attempts >= 3 || digest(snapshot) !== row.inputHash)
        throw new Error("INVALID_CONTEXT");
      const current = await this.prepare(session, snapshot.scope);
      if (!current.available || current.id !== row.id || !current.canGenerate)
        throw new Error("CONFIGURATION_CHANGED");
      const model = await this.model(row.organizationId);
      const livePins = model?.providers.map((p) => ({
        id: p.id,
        revision: p.revision,
        endpointDigest: endpointDigest(providerEndpoint(p)!),
      }));
      if (
        !model ||
        model.route.id !== snapshot.route.id ||
        model.route.revision !== snapshot.route.revision ||
        digest(livePins) !== digest(snapshot.providers)
      )
        throw new Error("CONFIGURATION_CHANGED");
      let result, selected;
      for (const provider of model.providers) {
        try {
          result = await runPromptInference(
            provider,
            findingAiPrompt(snapshot.context),
            650,
            AbortSignal.any([this.abort.signal, AbortSignal.timeout(90000)]),
            (raw, key) => validateFindingAiResult(raw, snapshot.context, key),
            async (usage) => {
              await this.db.aiFindingGuidance.updateMany({
                where: { id: row.id, leaseToken: token },
                data: { usage: json(usage) },
              });
            },
            { jsonOutput: true },
          );
          selected = provider;
          break;
        } catch (error) {
          if (error instanceof AiResponseError) throw error;
          if (this.abort.signal.aborted) throw error;
        }
      }
      if (!result || !selected) throw new Error("INFERENCE_FAILED");
      const live = await this.prepare(session, snapshot.scope);
      if (!live.available || live.id !== row.id || !live.canGenerate)
        throw new Error("CONFIGURATION_CHANGED");
      await this.db.aiFindingGuidance.updateMany({
        where: {
          id: row.id,
          state: "RUNNING",
          leaseToken: token,
          leaseUntil: { gt: new Date() },
        },
        data: {
          state: "SUCCEEDED",
          result: json(result),
          resultHash: digest(result),
          modelLabel: selected.name + " / " + selected.modelId,
          finishedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
    } catch (error) {
      await this.db.aiFindingGuidance.updateMany({
        where: { id: row.id, state: "RUNNING", leaseToken: token },
        data: {
          state: "FAILED",
          failure:
            error instanceof AiResponseError
              ? error.code
              : "AI_GUIDANCE_UNAVAILABLE",
          finishedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }
  }
}
