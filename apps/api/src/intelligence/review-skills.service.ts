import { githubActionsWorkflowSkill } from "./github-actions-workflow-skill.js";
import { readUpstreamSkill } from "./upstream-skill.js";
import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { aiConfigurationEnabled } from "./ai-configuration.js";
import {
  skillDigest,
  skillTemplates,
  validateSkill,
  type SkillManifest,
} from "./review-skills.js";
import { parseSkillMarkdown, exportSkillMarkdown } from "./skill-markdown.js";
@Injectable()
export class ReviewSkillsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  private available() {
    if (!aiConfigurationEnabled())
      throw new ServiceUnavailableException("AI settings are disabled");
  }
  async list(session: AuthenticatedSession) {
    const member = await this.access.requireOrganization(
      session,
      "ai.skills.read",
    );
    const skills = await this.db.aiReviewSkill.findMany({
      where: { organizationId: member.organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    await this.access.requireOrganization(session, "ai.skills.read");
    return {
      skills,
      templates: [githubActionsWorkflowSkill, ...skillTemplates],
      executionMode: "instructions_only",
      context: "assessment_evidence",
    };
  }
  async upstream(session: AuthenticatedSession, input: Parameters<typeof readUpstreamSkill>[0]) {
    this.available();
    await this.access.requireOrganization(session,"ai.skills.manage",true);
    try {
      const result=await readUpstreamSkill(input);
      for (const id of result.manifest.repositories) await this.access.requireRepository(session,id,"ai.skills.manage");
      await this.access.requireOrganization(session,"ai.skills.manage");
      return result;
    } catch { throw new BadRequestException("Could not inspect the pinned skill and license. Check the public repository, commit and file paths."); }
  }
  async parseMarkdown(session: AuthenticatedSession, markdown: string) {
    this.available();
    await this.access.requireOrganization(session, "ai.skills.manage", true);
    let manifest: SkillManifest;
    try {
      manifest = parseSkillMarkdown(markdown);
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Invalid SKILL.md",
      );
    }
    for (const id of manifest.repositories)
      await this.access.requireRepository(session, id, "ai.skills.manage");
    await this.access.requireOrganization(session, "ai.skills.manage");
    return manifest;
  }
  async builtinMarkdown(session: AuthenticatedSession, id: string) {
    await this.access.requireOrganization(session, "ai.skills.read");
    const skill = [githubActionsWorkflowSkill, ...skillTemplates].find(
      (template) => template.id === id,
    );
    if (!skill) throw new NotFoundException("Built-in skill unavailable");
    return exportSkillMarkdown(skill);
  }
  async markdown(session: AuthenticatedSession, id: string) {
    const member = await this.access.requireOrganization(
      session,
      "ai.skills.read",
    );
    const skill = await this.db.aiReviewSkill.findFirst({
      where: { id, organizationId: member.organizationId },
    });
    if (!skill) throw new NotFoundException("Skill unavailable");
    if (skillDigest(skill) !== skill.contentDigest)
      throw new ConflictException(
        "Skill contents changed. Reload before downloading.",
      );
    const markdown = exportSkillMarkdown(skill);
    await this.access.requireOrganization(session, "ai.skills.read");
    return markdown;
  }
  async useBuiltin(session: AuthenticatedSession, id: string) {
    const template = skillTemplates.find((skill) => skill.id === id);
    if (!template) throw new NotFoundException("Built-in skill unavailable");
    const hash = createHash("sha256")
      .update(`preflyt-builtin-skill:${id}`)
      .digest("hex");
    const key = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.create(
          session,
          { ...validateSkill(template), expectedVersion: 0 },
          key,
        );
      } catch (error) {
        if (!(error instanceof ConflictException) || attempt === 1) throw error;
      }
    }
    throw new ConflictException("Could not use built-in skill. Try again.");
  }
  async create(
    session: AuthenticatedSession,
    input: SkillManifest & { skillKey?: string; expectedVersion: number },
    builtinKey?: string,
  ) {
    this.available();
    const member = await this.access.requireOrganization(
      session,
      "ai.skills.manage",
      true,
    );
    let manifest: SkillManifest;
    try {
      manifest = validateSkill(input);
    } catch {
      throw new BadRequestException(
        "Enter valid review instructions and provenance",
      );
    }
    for (const id of manifest.repositories)
      await this.access.requireRepository(session, id, "ai.skills.manage");
    try {
      return await this.db.$transaction(
        async (tx) => {
          await new AuthorizationService(
            tx as PrismaService,
          ).requireOrganization(session, "ai.skills.manage");
          const key = builtinKey ?? input.skillKey ?? randomUUID();
          const latest = await tx.aiReviewSkill.findFirst({
            where: { organizationId: member.organizationId, skillKey: key },
            orderBy: { version: "desc" },
          });
          if (builtinKey && latest) return latest;
          if (
            (latest?.version ?? 0) !== input.expectedVersion ||
            (input.skillKey && !latest)
          )
            throw new ConflictException(
              "Skill changed. Reload before creating a version.",
            );
          if (
            (await tx.aiReviewSkill.count({
              where: { organizationId: member.organizationId },
            })) >= 200
          )
            throw new ConflictException(
              "Organization skill version limit reached",
            );
          const skill = await tx.aiReviewSkill.create({
            data: {
              ...manifest,
              organizationId: member.organizationId,
              skillKey: key,
              version: input.expectedVersion + 1,
              contentDigest: skillDigest(manifest),
              createdById: session.identityId,
            },
          });
          await tx.auditEvent.create({
            data: {
              actorId: session.identityId,
              event: "ai.skill.created",
              metadata: {
                organizationId: member.organizationId,
                skillId: skill.id,
                version: skill.version,
                digest: skill.contentDigest,
              },
            },
          });
          return skill;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      if (
        (e as { code?: string }).code === "P2034" ||
        (e as { code?: string }).code === "P2002"
      )
        throw new ConflictException("Skill changed. Reload and try again.");
      throw e;
    }
  }
  async transition(
    session: AuthenticatedSession,
    id: string,
    action: "approve" | "enable" | "disable" | "retire",
    expectedDigest: string,
    reviewed: boolean,
  ) {
    this.available();
    const permission =
      action === "approve" ? "ai.skills.approve" : "ai.skills.manage";
    const member = await this.access.requireOrganization(
      session,
      permission,
      true,
    );
    return this.db.$transaction(
      async (tx) => {
        await new AuthorizationService(tx as PrismaService).requireOrganization(
          session,
          permission,
        );
        const skill = await tx.aiReviewSkill.findFirst({
          where: { id, organizationId: member.organizationId },
        });
        if (!skill) throw new NotFoundException("Skill unavailable");
        if (
          skill.contentDigest !== expectedDigest ||
          skillDigest(skill) !== expectedDigest
        )
          throw new ConflictException("Skill contents changed");
        if (action === "approve" && (skill.status !== "DRAFT" || !reviewed))
          throw new BadRequestException(
            "Review instructions, provenance and license before approving",
          );
        if (action === "enable" && skill.status !== "APPROVED")
          throw new BadRequestException(
            "Approve this version before enabling it",
          );
        if (skill.status === "RETIRED")
          throw new ConflictException(
            "Create a new version of a retired skill",
          );
        const result = await tx.aiReviewSkill.update({
          where: { id },
          data:
            action === "approve"
              ? {
                  status: "APPROVED",
                  approvedById: session.identityId,
                  approvedAt: new Date(),
                }
              : action === "retire"
                ? { status: "RETIRED", enabled: false }
                : { enabled: action === "enable" },
        });
        await tx.auditEvent.create({
          data: {
            actorId: session.identityId,
            event: "ai.skill." + action,
            metadata: {
              organizationId: member.organizationId,
              skillId: id,
              version: skill.version,
              digest: expectedDigest,
            },
          },
        });
        return result;
      },
      { isolationLevel: "Serializable" },
    );
  }
}
