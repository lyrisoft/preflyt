import { randomUUID, createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import type { AiProviderConnection } from "../generated/prisma/client.js";
import {
  aiConfigurationEnabled,
  aiReviewsEnabled,
  aiCredentialKey,
  validateAiEndpoint,
  providerEndpoint,
  aiStages,
  aiProviderPresets,
  encryptAiCredential,
  decryptAiCredential,
  endpointDigest,
  aiCredentialEndpointDigest,
  testAiEndpoint,
} from "./ai-configuration.js";
export type ProviderInput = {
  inputPriceCentsPerMillion?: number | null;
  outputPriceCentsPerMillion?: number | null;
  preset?: string;
  name: string;
  baseUrl: string;
  locality: "local" | "hosted";
  requiresKey: boolean;
  modelId: string;
  enabled: boolean;
  apiKey?: string;
  expectedRevision: number;
};
export type RouteInput = {
  primaryId: string | null;
  fallbackId: string | null;
  enabled: boolean;
  allowSource: boolean;
  automaticReviews?: boolean;
  publishSummary?: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  dailyBudgetCents: number;
  expectedRevision: number;
};
export function publicProvider(p: AiProviderConnection) {
  const { encryptedCredential, credentialEndpointDigest, ...safe } = p;
  return {
    ...safe,
    apiKeySet: !!encryptedCredential,
    approved: !!providerEndpoint(p),
  };
}
@Injectable()
export class AiConfigurationService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  onModuleInit() {
    if (aiConfigurationEnabled()) {
      aiCredentialKey();
    }
  }
  private available() {
    if (!aiConfigurationEnabled())
      throw new ServiceUnavailableException(
        "AI configuration is disabled. Ask your deployment administrator to enable it.",
      );
  }
  async list(session: AuthenticatedSession) {
    const member = await this.access.requireOrganization(
      session,
      "ai.usage.read",
    );
    if (!aiConfigurationEnabled())
      return {
        enabled: false,
        executionAvailable: false,
        providers: [],
        routes: [],
        stages: aiStages,
      };
    const providers = await this.db.aiProviderConnection.findMany({
      where: { organizationId: member.organizationId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const routes = await this.db.aiStageRoute.findMany({
      where: { organizationId: member.organizationId },
    });
    await this.access.requireOrganization(session, "ai.usage.read");
    return {
      enabled: true,
      executionAvailable: aiReviewsEnabled(),
      providers: providers.map(publicProvider),
      routes,
      stages: aiStages,
      presets: aiProviderPresets,
    };
  }
  async saveProvider(
    session: AuthenticatedSession,
    input: ProviderInput,
    id?: string,
  ) {
    this.available();
    const member = await this.access.requireOrganization(
      session,
      "ai.provider.manage",
      true,
    );
    if (input.preset !== undefined) {
      const preset = aiProviderPresets.find((p) => p.id === input.preset);
      if (!preset) throw new BadRequestException("Choose a supported provider");
      input = { ...input, name: preset.name, baseUrl: preset.baseUrl, locality: "hosted", requiresKey: true };
    }
    const providerId = id ?? randomUUID();
    let endpoint;
    try {
      endpoint = validateAiEndpoint({
        id: providerId,
        name: input.name,
        baseUrl: input.baseUrl,
        locality: input.locality,
        requiresKey: input.requiresKey,
        models: [input.modelId],
        ...(input.preset ? { preset: input.preset } : {}),
      });
    } catch {
      throw new BadRequestException(
        "Enter a valid model endpoint and model name",
      );
    }
    let encrypted: string | undefined;
    if (input.apiKey !== undefined) {
      try {
        encrypted = encryptAiCredential(
          member.organizationId,
          providerId,
          input.apiKey,
          aiCredentialEndpointDigest(endpoint),
        );
      } catch {
        throw new BadRequestException("Enter a valid provider key");
      }
    }
    try {
      const saved = await this.db.$transaction(
        async (tx) => {
          await new AuthorizationService(
            tx as PrismaService,
          ).requireOrganization(session, "ai.provider.manage");
          const previous = await tx.aiProviderConnection.findFirst({
            where: { id: providerId, organizationId: member.organizationId },
          });
          if (
            (id && !previous) ||
            (previous?.revision ?? 0) !== input.expectedRevision
          )
            throw new ConflictException(
              "Connection changed. Reload before saving.",
            );
          if (
            !previous &&
            (await tx.aiProviderConnection.count({
              where: { organizationId: member.organizationId },
            })) >= 32
          )
            throw new ConflictException(
              "Organization connection limit reached",
            );
          const credential =
            encrypted ??
            (previous?.endpointId === providerId &&
            previous.credentialEndpointDigest ===
              aiCredentialEndpointDigest(endpoint)
              ? previous.encryptedCredential
              : null);
          if (endpoint.requiresKey && !credential)
            throw new BadRequestException(
              "This endpoint requires a provider key",
            );
          const data = {
            inputPriceCentsPerMillion: input.inputPriceCentsPerMillion ?? null,
            outputPriceCentsPerMillion: input.outputPriceCentsPerMillion ?? null,
            name: input.name.trim(),
            endpointId: providerId,
            endpoint,
            modelId: input.modelId,
            enabled: input.enabled,
            encryptedCredential: credential,
            credentialEndpointDigest: credential
              ? aiCredentialEndpointDigest(endpoint)
              : null,
            revision: (previous?.revision ?? 0) + 1,
            testStatus: "NOT_TESTED",
            testedAt: null,
            testedRevision: null,
            testedEndpointDigest: null,
          };
          const result = previous
            ? await tx.aiProviderConnection.update({
                where: { id: providerId },
                data,
              })
            : await tx.aiProviderConnection.create({
                data: {
                  ...data,
                  id: providerId,
                  organizationId: member.organizationId,
                  createdById: session.identityId,
                },
              });
          await tx.auditEvent.create({
            data: {
              event: "ai.model.approved",
              actorId: session.identityId,
              metadata: {
                organizationId: member.organizationId,
                providerId,
                revision: result.revision,
                endpointId: providerId,
                endpointDigest: endpointDigest(endpoint),
                modelId: input.modelId,
                enabled: input.enabled,
                credentialChanged: input.apiKey !== undefined,
              },
            },
          });
          return publicProvider(result);
        },
        { isolationLevel: "Serializable" },
      );
      await this.access.requireOrganization(
        session,
        "ai.provider.manage",
        true,
      );
      return saved;
    } catch (error) {
      this.concurrent(error);
    }
  }
  private concurrent(error: unknown): never {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["P2034", "P2002"].includes(String(error.code))
    )
      throw new ConflictException(
        "AI configuration changed. Reload before retrying.",
      );
    throw error;
  }
  async testProvider(session: AuthenticatedSession, id: string) {
    this.available();
    const member = await this.access.requireOrganization(
      session,
      "ai.provider.manage",
      true,
    );
    const provider = await this.db.aiProviderConnection.findFirst({
      where: { id, organizationId: member.organizationId },
    });
    if (!provider) throw new NotFoundException("Connection not found");
    const endpoint = providerEndpoint(provider);
    if (!endpoint || !endpoint.models.includes(provider.modelId))
      throw new ConflictException(
        "The endpoint configuration changed. Edit this connection.",
      );
    if (
      provider.encryptedCredential &&
      provider.credentialEndpointDigest !== aiCredentialEndpointDigest(endpoint)
    )
      throw new ConflictException(
        "The endpoint changed. Enter a new provider key before testing.",
      );
    const windowStart = new Date(Math.floor(Date.now() / 600000) * 600000);
    const bucket = await this.db.authThrottle.upsert({
      where: {
        action_keyHash_windowStart: {
          action: "ai_connection_test",
          keyHash: createHash("sha256")
            .update(member.organizationId)
            .digest("hex"),
          windowStart,
        },
      },
      create: {
        action: "ai_connection_test",
        keyHash: createHash("sha256")
          .update(member.organizationId)
          .digest("hex"),
        windowStart,
        count: 1,
      },
      update: { count: { increment: 1 } },
    });
    if (bucket.count > 12)
      throw new HttpException(
        "Too many connection tests. Try again in ten minutes.",
        429,
      );
    let status = "UNAVAILABLE";
    try {
      status = await testAiEndpoint(
        endpoint,
        provider.modelId,
        provider.encryptedCredential
          ? decryptAiCredential(
              member.organizationId,
              id,
              provider.encryptedCredential,
              aiCredentialEndpointDigest(endpoint),
            )
          : undefined,
      );
    } catch {
      /* Never expose upstream details or credential errors. */
    }
    await this.access.requireOrganization(session, "ai.provider.manage", true);
    const currentProvider = await this.db.aiProviderConnection.findFirst({
      where: { id, organizationId: member.organizationId },
    });
    const currentEndpoint = currentProvider
      ? providerEndpoint(currentProvider)
      : null;
    if (
      !currentEndpoint ||
      endpointDigest(endpoint) !== endpointDigest(currentEndpoint)
    )
      throw new ConflictException(
        "Endpoint changed during the connection test",
      );
    const testedAt = new Date();
    await this.db.$transaction(async (tx) => {
      await new AuthorizationService(tx as PrismaService).requireOrganization(
        session,
        "ai.provider.manage",
      );
      const updated = await tx.aiProviderConnection.updateMany({
        where: {
          id,
          organizationId: member.organizationId,
          revision: provider.revision,
        },
        data: {
          testStatus: status,
          testedAt,
          testedRevision: provider.revision,
          testedEndpointDigest: endpointDigest(endpoint),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          "Connection changed during its test. Retry.",
        );
      await tx.auditEvent.create({
        data: {
          event: "ai.provider.tested",
          actorId: session.identityId,
          metadata: {
            organizationId: member.organizationId,
            providerId: id,
            revision: provider.revision,
            status,
          },
        },
      });
    });
    return { status, testedAt };
  }
  ready(provider: AiProviderConnection | undefined) {
    const endpoint = provider ? providerEndpoint(provider) : null;
    return (
      !!provider &&
      !!endpoint &&
      endpoint.models.includes(provider.modelId) &&
      provider.enabled &&
      (!provider.encryptedCredential ||
        provider.credentialEndpointDigest ===
          aiCredentialEndpointDigest(endpoint)) &&
      (!endpoint.requiresKey || !!provider.encryptedCredential) &&
      provider.testStatus === "CONNECTED" &&
      provider.testedRevision === provider.revision &&
      provider.testedEndpointDigest === endpointDigest(endpoint) &&
      !!provider.testedAt &&
      provider.testedAt.getTime() > Date.now() - 86400000
    );
  }
  async saveRoute(
    session: AuthenticatedSession,
    stage: string,
    input: RouteInput,
  ) {
    this.available();
    const member = await this.access.requireOrganization(
      session,
      "ai.routing.manage",
      true,
    );
    if (
      !aiStages.includes(stage as (typeof aiStages)[number]) ||
      (input.fallbackId && input.fallbackId === input.primaryId) ||
      (stage !== "pull_request" && (input.automaticReviews || input.publishSummary))
    )
      throw new BadRequestException(
        "Choose a lifecycle stage and different primary/fallback connections",
      );
    try {
      const route = await this.db.$transaction(
        async (tx) => {
          await new AuthorizationService(
            tx as PrismaService,
          ).requireOrganization(session, "ai.routing.manage");
          const previous = await tx.aiStageRoute.findUnique({
            where: {
              organizationId_stage: {
                organizationId: member.organizationId,
                stage,
              },
            },
          });
          if ((previous?.revision ?? 0) !== input.expectedRevision)
            throw new ConflictException("Route changed. Reload before saving.");
          const providers = await tx.aiProviderConnection.findMany({
            where: {
              organizationId: member.organizationId,
              id: {
                in: [input.primaryId, input.fallbackId].filter(
                  (id): id is string => !!id,
                ),
              },
            },
          });
          for (const id of [input.primaryId, input.fallbackId].filter(Boolean))
            if (!providers.some((p) => p.id === id))
              throw new BadRequestException(
                "Choose connections in this organization",
              );
          if (
            input.enabled &&
            (!input.primaryId ||
              ![input.primaryId, input.fallbackId]
                .filter(Boolean)
                .every((id) => this.ready(providers.find((p) => p.id === id))))
          )
            throw new BadRequestException(
              "Test and enable the selected connections before enabling this route",
            );
          const data = {
            primaryId: input.primaryId,
            fallbackId: input.fallbackId,
            enabled: input.enabled,
            allowSource: input.allowSource,
            automaticReviews: input.automaticReviews ?? false,
            publishSummary: input.publishSummary ?? false,
            maxInputTokens: input.maxInputTokens,
            maxOutputTokens: input.maxOutputTokens,
            dailyBudgetCents: input.dailyBudgetCents,
            revision: (previous?.revision ?? 0) + 1,
            updatedById: session.identityId,
          };
          const saved = await tx.aiStageRoute.upsert({
            where: {
              organizationId_stage: {
                organizationId: member.organizationId,
                stage,
              },
            },
            create: { organizationId: member.organizationId, stage, ...data },
            update: data,
          });
          await tx.auditEvent.create({
            data: {
              event: "ai.route.saved",
              actorId: session.identityId,
              metadata: {
                organizationId: member.organizationId,
                stage,
                ...data,
              },
            },
          });
          return saved;
        },
        { isolationLevel: "Serializable" },
      );
      await this.access.requireOrganization(session, "ai.routing.manage", true);
      return route;
    } catch (error) {
      this.concurrent(error);
    }
  }
  async preview(
    session: AuthenticatedSession,
    stage: string,
    containsSource: boolean,
    inputTokens: number,
  ) {
    this.available();
    const member = await this.access.requireOrganization(
      session,
      "ai.usage.read",
    );
    if (!aiStages.includes(stage as (typeof aiStages)[number]))
      throw new BadRequestException("Choose a lifecycle stage");
    const route = await this.db.aiStageRoute.findUnique({
      where: {
        organizationId_stage: { organizationId: member.organizationId, stage },
      },
    });
    const providers = await this.db.aiProviderConnection.findMany({
      where: {
        organizationId: member.organizationId,
        id: {
          in: [route?.primaryId, route?.fallbackId].filter(
            (id): id is string => !!id,
          ),
        },
      },
    });
    const id = [route?.primaryId, route?.fallbackId].find((id) =>
      this.ready(providers.find((p) => p.id === id)),
    );
    const reason = !route?.enabled
      ? "ROUTE_DISABLED"
      : containsSource && !route.allowSource
        ? "SOURCE_SHARING_DISABLED"
        : inputTokens > route.maxInputTokens
          ? "INPUT_LIMIT_EXCEEDED"
          : !id
            ? "CONNECTION_UNAVAILABLE"
            : "CONFIGURATION_READY";
    await this.access.requireOrganization(session, "ai.usage.read");
    return {
      reason,
      providerId: reason === "CONFIGURATION_READY" ? id : null,
      routeRevision: route?.revision ?? null,
      executionAvailable: aiReviewsEnabled(),
      maxOutputTokens: route?.maxOutputTokens ?? null,
      dailyBudgetCents: route?.dailyBudgetCents ?? null,
    };
  }
}
