import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  catalogue,
  organizationPack,
  packDigest,
  type StandardPack,
  type AiCheck,
} from "./catalogue.js";
import { skillDigest } from "../intelligence/review-skills.js";
import type { Prisma } from "../generated/prisma/client.js";
export type StandardInput = {
  title: string;
  description: string;
  ruleIds: string[];
  aiChecks?: { id: string; title: string; skillId: string; stages: string[] }[];
  expectedVersionId: string | null;
};
export async function organizationCatalogue(
  db: Pick<PrismaService, "organizationStandardVersion">,
  organizationId: string,
) {
  const versions = await db.organizationStandardVersion.findMany({
    where: { organizationId },
    orderBy: [{ revision: "desc" }, { id: "desc" }],
  });
  return versions.map((v) => {
    const definition = organizationPack(v.definition);
    if (
      !definition ||
      definition.digest !== v.digest ||
      definition.id !== v.packId ||
      definition.version !== `1.0.${v.revision}`
    )
      throw new ConflictException("Standard version could not be verified");
    return { ...definition, versionId: v.id, createdAt: v.createdAt };
  });
}
@Injectable()
export class OrganizationStandardsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  async list(session: AuthenticatedSession) {
    const member = await this.access.requireOrganization(
      session,
      "policy.read",
    );
    const versions = await organizationCatalogue(
      this.db,
      member.organizationId,
    );
    await this.access.requireOrganization(session, "policy.read");
    const reviewSkills = await this.db.aiReviewSkill.findMany({
      where: {
        organizationId: member.organizationId,
        status: "APPROVED",
        enabled: true,
      },
      orderBy: [{ name: "asc" }, { version: "desc" }],
      take: 200,
      select: { id: true, name: true, version: true, contentDigest: true },
    });
    await this.access.requireOrganization(session, "policy.read");
    return { builtIn: catalogue, versions, reviewSkills };
  }
  async save(
    session: AuthenticatedSession,
    input: StandardInput,
    packId?: string,
  ) {
    const member = await this.access.requireOrganization(
      session,
      "standards.manage",
      true,
    );
    if (packId && !/^org-standard-[a-f0-9-]{36}$/.test(packId))
      throw new BadRequestException("Choose an organization standard");
    if (
      !input.title.trim() ||
      input.title.length > 120 ||
      input.description.length > 2000 ||
      !input.ruleIds.length ||
      input.ruleIds.length > 64 ||
      new Set(input.ruleIds).size !== input.ruleIds.length
    )
      throw new BadRequestException("Add a name and choose supported checks");
    const available = new Map(
      catalogue.flatMap((p) => p.rules).map((r) => [r.id, r]),
    );
    if (input.ruleIds.some((id) => !available.has(id)))
      throw new BadRequestException("Choose supported checks from the library");
    const id = packId ?? `org-standard-${randomUUID()}`;
    try {
      const result = await this.db.$transaction(
        async (tx) => {
          await new AuthorizationService(
            tx as PrismaService,
          ).requireOrganization(session, "standards.manage");
          const previous = await tx.organizationStandardVersion.findFirst({
            where: { organizationId: member.organizationId, packId: id },
            orderBy: { revision: "desc" },
          });
          if (
            (previous?.id ?? null) !== input.expectedVersionId ||
            (packId && !previous)
          )
            throw new ConflictException(
              "Standard changed. Reload before saving.",
            );
          if (
            (await tx.organizationStandardVersion.count({
              where: { organizationId: member.organizationId },
            })) >= 500
          )
            throw new ConflictException(
              "Organization standard version limit reached",
            );
          const aiChecks: AiCheck[] = [];
          for (const check of input.aiChecks ?? []) {
            const skill = await tx.aiReviewSkill.findFirst({
              where: {
                id: check.skillId,
                organizationId: member.organizationId,
                status: "APPROVED",
                enabled: true,
              },
            });
            if (!skill || skillDigest(skill) !== skill.contentDigest)
              throw new BadRequestException(
                "Choose an approved, enabled skill version for every AI review",
              );
            aiChecks.push({
              id: check.id,
              title: check.title.trim(),
              kind: "AI_REVIEW",
              mode: "ADVISORY",
              skillId: skill.id,
              skillVersion: skill.version,
              skillDigest: skill.contentDigest,
              stages: [...check.stages].sort() as AiCheck["stages"],
            });
          }
          if (
            aiChecks.length > 12 ||
            new Set(aiChecks.map((c) => c.id)).size !== aiChecks.length
          )
            throw new BadRequestException(
              "Choose up to twelve distinct AI reviews",
            );
          const revision = (previous?.revision ?? 0) + 1;
          const definition: Omit<StandardPack, "digest"> = {
            schemaVersion: 1,
            version: `1.0.${revision}`,
            owner: "Organization",
            languages: ["*"],
            stages: ["repository", "pull_request", "ci"],
            changelog: ["Organization-managed version."],
            id,
            title: input.title.trim(),
            description: input.description.trim(),
            repositoryTypes: ["all"],
            ...(aiChecks.length
              ? { aiChecks: aiChecks.sort((a, b) => a.id.localeCompare(b.id)) }
              : {}),
            rules: [...input.ruleIds].sort().map((id) => available.get(id)!),
          };
          const digest = packDigest(definition);
          if (!organizationPack({ ...definition, digest }))
            throw new BadRequestException(
              "Enter a review name, skill and review stage for each AI review",
            );
          const saved = await tx.organizationStandardVersion.create({
            data: {
              organizationId: member.organizationId,
              packId: id,
              revision,
              definition: { ...definition, digest } as Prisma.InputJsonValue,
              digest,
              createdById: session.identityId,
            },
          });
          await tx.auditEvent.create({
            data: {
              event: previous
                ? "standards.version.created"
                : "standards.created",
              actorId: session.identityId,
              metadata: {
                organizationId: member.organizationId,
                packId: id,
                versionId: saved.id,
                previousVersionId: previous?.id ?? null,
                digest,
              },
            },
          });
          return saved;
        },
        { isolationLevel: "Serializable" },
      );
      await this.access.requireOrganization(session, "standards.manage");
      return result;
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        ["P2034", "P2002"].includes(String(e.code))
      )
        throw new ConflictException("Standard changed. Reload before saving.");
      throw e;
    }
  }
}
