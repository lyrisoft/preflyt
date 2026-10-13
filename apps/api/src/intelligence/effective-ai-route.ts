import type { PrismaService } from "../prisma/prisma.service.js";

/** An explicit stage setting, including disabled, always overrides the default. */
export async function effectiveAiRoute(
  db: Pick<PrismaService, "aiStageRoute">,
  organizationId: string,
  stage: string,
) {
  const route = await db.aiStageRoute.findUnique({
    where: { organizationId_stage: { organizationId, stage } },
  });
  return (
    route ??
    (stage === "default"
      ? null
      : db.aiStageRoute.findUnique({
          where: { organizationId_stage: { organizationId, stage: "default" } },
        }))
  );
}
