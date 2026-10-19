import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { providerEndpoint } from "./ai-configuration.js";

export async function modelDetails(
  db: PrismaService,
  access: AuthorizationService,
  session: AuthenticatedSession,
  providerId: string,
  days: number,
  page: number,
  pageSize: number,
) {
  const member = await access.requireOrganization(session, "ai.usage.read");
  if (
    !/^[a-f0-9-]{36}$/i.test(providerId) ||
    ![7, 30, 90].includes(days) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    ![10, 25, 50, 100].includes(pageSize)
  )
    throw new BadRequestException("Choose a valid model, period and page.");
  const provider = await db.aiProviderConnection.findFirst({
    where: { id: providerId, organizationId: member.organizationId },
  });
  if (!provider) throw new NotFoundException("Model connection not found");
  const repos = await access.repositoryScope(
    session.identityId,
    member.organizationId,
    "assessment.read",
    false,
  );
  const repositoryIds = repos.map((r) => r.id);
  const since = new Date(Date.now() - days * 86400000);
  const where = {
    organizationId: member.organizationId,
    providerId,
    repositoryId: { in: repositoryIds },
    createdAt: { gte: since },
  };
  const [totals, byModel] = await Promise.all([
    db.aiModelUsage.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true, cachedTokens: true },
      _count: { _all: true, inputTokens: true, outputTokens: true },
    }),
    db.aiModelUsage.groupBy({
      by: ["modelId"],
      where,
      _sum: { inputTokens: true, outputTokens: true, cachedTokens: true },
      _count: { _all: true },
      orderBy: { modelId: "asc" },
    }),
  ]);
  // Scope before aggregation: token totals must not reveal inaccessible repositories.
  const filter = Prisma.sql`u."organizationId"=${member.organizationId} AND u."providerId"=${providerId} AND u."createdAt">=${since} AND u."repositoryId" IN (${Prisma.join(repositoryIds.length ? repositoryIds : [""])})`;
  const [count, activity, legacy] = await Promise.all([
    db.$queryRaw<any[]>(
      Prisma.sql`SELECT count(*)::int AS total FROM (SELECT 1 FROM "AiModelUsage" u WHERE ${filter} GROUP BY u."sourceId",u.workload,u."modelId",u."repositoryId") groups`,
    ),
    db.$queryRaw<any[]>(
      Prisma.sql`SELECT u."sourceId",u.workload,u."modelId",u."repositoryId",count(*)::int AS requests, count(*) FILTER (WHERE u.state='FAILED')::int AS "failedRequests",count(*) FILTER (WHERE u."inputTokens" IS NULL OR u."outputTokens" IS NULL)::int AS "unreportedRequests",sum(u."inputTokens")::float8 AS "inputTokens",sum(u."outputTokens")::float8 AS "outputTokens",sum(u."cachedTokens")::float8 AS "cachedTokens",max(u."createdAt") AS "lastUsedAt" FROM "AiModelUsage" u WHERE ${filter} GROUP BY u."sourceId",u.workload,u."modelId",u."repositoryId" ORDER BY max(u."createdAt") DESC,u."sourceId",u.workload,u."modelId",u."repositoryId" LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
    db.$queryRaw<any[]>(
      Prisma.sql`SELECT r."assessmentId",r."providerRevision",r."inputTokens",r."outputTokens",r."modelCalls",a."repositoryId",a.state,a."createdAt" FROM "RepositoryHealthStrixRun" r JOIN "RepositoryHealthAssessment" a ON a.id=r."assessmentId" WHERE r."providerId"=${providerId} AND a."organizationId"=${member.organizationId} AND a."repositoryId" IN (${Prisma.join(repositoryIds.length ? repositoryIds : [""])}) AND a."createdAt">=${since} AND NOT EXISTS (SELECT 1 FROM "AiModelUsage" u WHERE u."organizationId"=a."organizationId" AND u.workload='VAPT' AND u."sourceId"=a.id) ORDER BY a."createdAt" DESC,a.id DESC LIMIT 10`,
    ),
  ]);
  await access.requireOrganization(session, "ai.usage.read");
  // Recheck repository access after the reads, including live GitHub access.
  const currentRepos = await access.repositoryScope(
    session.identityId,
    member.organizationId,
    "assessment.read",
    false,
  );
  if (repositoryIds.some((id) => !currentRepos.some((r) => r.id === id)))
    throw new BadRequestException("Repository access changed. Refresh usage.");
  const repository = (id: string) => {
    const r = repos.find((r) => r.id === id)!;
    return { githubId: r.githubId.toString(), fullName: r.fullName };
  };
  const endpoint = providerEndpoint(provider);
  return {
    provider: {
      id: provider.id,
      name: provider.name,
      modelId: provider.modelId,
      revision: provider.revision,
      enabled: provider.enabled,
      testStatus: provider.testStatus,
      testedAt: provider.testedAt,
      preset: endpoint?.preset ?? null,
      baseUrl: endpoint?.baseUrl ?? null,
    },
    days,
    page,
    pageSize,
    total: count[0]?.total ?? 0,
    totals: {
      inputTokens: totals._sum.inputTokens,
      outputTokens: totals._sum.outputTokens,
      cachedTokens: totals._sum.cachedTokens,
      requests: totals._count._all,
      unreportedInput: totals._count._all - totals._count.inputTokens,
      unreportedOutput: totals._count._all - totals._count.outputTokens,
    },
    byModel: byModel.map((r) => ({
      modelId: r.modelId,
      inputTokens: r._sum.inputTokens,
      outputTokens: r._sum.outputTokens,
      cachedTokens: r._sum.cachedTokens,
      requests: r._count._all,
    })),
    activity: activity.map((r) => ({
      ...r,
      repository: repository(r.repositoryId),
    })),
    legacyVapt: legacy.map((r) => ({
      ...r,
      repository: repository(r.repositoryId),
      modelId:
        r.providerRevision === provider.revision ? provider.modelId : null,
    })),
  };
}
