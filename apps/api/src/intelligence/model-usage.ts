import type { PrismaService } from "../prisma/prisma.service.js";
import type { AiProviderConnection } from "../generated/prisma/client.js";
import type { ProviderUsage } from "./skill-inference.js";

export type ModelUsageContext = {
  db: Pick<PrismaService, "aiModelUsage">;
  repositoryId: string;
  workload: "VAPT" | "AI_REVIEW" | "FINDING_GUIDANCE" | "WORKFLOW";
  sourceId: string;
};

/** Record each attempted inference, including usage returned before validation fails. */
export async function trackModelUsage<T>(
  context: ModelUsageContext | undefined,
  provider: AiProviderConnection,
  onUsage: ((usage: ProviderUsage) => Promise<void>) | undefined,
  execute: (report: (usage: ProviderUsage) => Promise<void>) => Promise<T>,
) {
  if (!context)
    return execute(async (usage) => {
      await onUsage?.(usage);
    });
  const row = await context.db.aiModelUsage.create({
    data: {
      organizationId: provider.organizationId,
      providerId: provider.id,
      providerRevision: provider.revision,
      modelId: provider.modelId,
      repositoryId: context.repositoryId,
      workload: context.workload,
      sourceId: context.sourceId,
    },
  });
  try {
    const result = await execute(async (usage) => {
      await context.db.aiModelUsage.update({
        where: { id: row.id },
        data: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
        },
      });
      await onUsage?.(usage);
    });
    await context.db.aiModelUsage.update({
      where: { id: row.id },
      data: { state: "COMPLETED", finishedAt: new Date() },
    });
    return result;
  } catch (error) {
    await context.db.aiModelUsage.update({
      where: { id: row.id },
      data: { state: "FAILED", finishedAt: new Date() },
    });
    throw error;
  }
}
