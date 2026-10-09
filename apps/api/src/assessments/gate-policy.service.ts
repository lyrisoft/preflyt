import { executionContracts } from './execution-contract.js';
import { recordPolicyNotification } from "../notifications/notification-event.js";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import {
  adoptionProfiles,
  posture,
  resolvePacks,
  type AdoptionProfile,
  type PackRef,
} from "../standards/catalogue.js";
import { digest } from "./assessment-digest.js";

export function validPolicyBranch(ref: string) {
  return (
    typeof ref === "string" &&
    ref.length <= 255 &&
    ref.startsWith("refs/heads/") &&
    ref.length > 11 &&
    !/[\x00-\x20\x7f~^:?*\[\\]/.test(ref) &&
    !ref.includes("..") &&
    !ref.includes("@{") &&
    !ref.includes("//") &&
    !ref.endsWith("/") &&
    !ref.endsWith(".") &&
    !ref
      .split("/")
      .some((part) => part.startsWith(".") || part.endsWith(".lock"))
  );
}

export function composeGatePolicy(
  selection: { id: string; profile: string; packs: unknown },
  branchRef: string,
  requiredRules: string[],
) {
  if (!validPolicyBranch(branchRef))
    throw new BadRequestException("Choose one explicit refs/heads/ branch");
  if (
    !adoptionProfiles.includes(selection.profile as AdoptionProfile) ||
    !Array.isArray(selection.packs) ||
    !selection.packs.length ||
    selection.packs.length > 5
  )
    throw new ConflictException("Standards baseline is unsupported");
  if (
    selection.packs.some(
      (ref) =>
        !ref ||
        typeof ref !== "object" ||
        typeof ref.id !== "string" ||
        typeof ref.version !== "string" ||
        !/^[a-f0-9]{64}$/.test(ref.digest ?? ""),
    ) ||
    new Set(selection.packs.map((ref) => ref.id)).size !==
      selection.packs.length
  )
    throw new ConflictException("Standards baseline integrity failed");
  const refs = selection.packs as (PackRef & { digest: string })[];
  const packs = resolvePacks(refs);
  if (packs.some((p, i) => !p || p.digest !== refs[i].digest))
    throw new ConflictException("Standards baseline integrity failed");
  const rules = posture(refs, selection.profile as AdoptionProfile, [])
    .map(
      ({
        configuration: _configuration,
        evidence: _evidence,
        reason: _reason,
        assessmentResult: _assessment,
        ...rule
      }) => rule,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    !Array.isArray(requiredRules) ||
    requiredRules.length > 64 ||
    new Set(requiredRules).size !== requiredRules.length ||
    requiredRules.some((id) => !rules.some((rule) => rule.id === id))
  )
    throw new BadRequestException(
      "Required overrides must name unique rules in the baseline",
    );
  // This increment permits strengthening advisory rules only. Weakening/waivers need their own authority.
  for (const rule of rules)
    if (requiredRules.includes(rule.id)) rule.required = true;
  return {
    version: 1,
    mode: "ADVISORY",
    branchRef,
    selectionId: selection.id,
    adoptionProfile: selection.profile,
    packs: refs,
    rules,
    applicability: "EXACT_BRANCH",
    overrides: [...requiredRules].sort(),
    githubPublication: "DISABLED",
    enforcement: "DISABLED",
    executionContractDigest: executionContracts()?.digest ?? null,
  };
}

@Injectable()
export class GatePolicyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async list(session: AuthenticatedSession, githubId: string) {
    const repo = await this.authorization.requireRepository(
      session,
      githubId,
      "policy.read",
    );
    const [selection, revisions] = await Promise.all([
      this.prisma.repositoryStandardsSelection.findFirst({
        where: { repositoryId: repo.id },
        orderBy: { revision: "desc" },
      }),
      this.prisma.gatePolicyRevision.findMany({
        where: {
          repositoryId: repo.id,
          organizationId: session.organizationId!,
        },
        orderBy: { createdAt: "desc" },
        take: 51,
      }),
    ]);
    return {
      currentSelectionId: selection?.id ?? null,
      revisions: revisions.slice(0, 50),
      truncated: revisions.length > 50,
      githubPublication: "DISABLED",
      enforcement: "DISABLED",
    };
  }
  private async change<T>(
    session: AuthenticatedSession,
    githubId: string,
    permission: string,
    operation: (tx: any, repositoryId: string) => Promise<T>,
  ) {
    await this.authorization.requireRepository(session, githubId, permission);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const repo = await new AuthorizationService(
            tx as PrismaService,
          ).requireRepository(session, githubId, permission);
          return operation(tx, repo.id);
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error: any) {
      const status =
        typeof error?.getStatus === "function" ? error.getStatus() : null;
      if (
        [400, 403, 404, 409].includes(status) ||
        ["P2034", "P2002"].includes(error?.code)
      )
        await this.prisma.auditEvent.create({
          data: {
            event: "policy.transition_rejected",
            actorId: session.identityId,
            metadata: {
              organizationId: session.organizationId,
              repositoryGithubId: githubId,
              permission,
              status: status ?? 409,
            },
          },
        });
      if (["P2034", "P2002"].includes(error?.code))
        throw new ConflictException(
          "Policy changed concurrently; reload before retrying",
        );
      throw error;
    }
  }
  async draft(
    session: AuthenticatedSession,
    githubId: string,
    body: {
      expectedSelectionId: string;
      branchRef: string;
      requiredRules: string[];
    },
  ) {
    return this.change(
      session,
      githubId,
      "policy.draft",
      async (tx, repositoryId) => {
        const selection = await tx.repositoryStandardsSelection.findFirst({
          where: { repositoryId },
          orderBy: { revision: "desc" },
        });
        if (!selection || selection.id !== body.expectedSelectionId)
          throw new ConflictException(
            "Adopt or reload the current standards baseline first",
          );
        const definition = {
          ...composeGatePolicy(selection, body.branchRef, body.requiredRules),
          organizationId: session.organizationId!,
          repositoryGithubId: githubId,
        };
        const latest = await tx.gatePolicyRevision.findFirst({
          where: { repositoryId, branchRef: body.branchRef },
          orderBy: { revision: "desc" },
        });
        const policy = await tx.gatePolicyRevision.create({
          data: {
            repositoryId,
            organizationId: session.organizationId!,
            branchRef: body.branchRef,
            revision: (latest?.revision ?? 0) + 1,
            selectionId: selection.id,
            definition,
            definitionHash: digest(definition),
            draftedById: session.identityId,
          },
        });
        await this.audit(tx, session, "policy.drafted", policy);
        return policy;
      },
    );
  }
  async editDraft(
    session: AuthenticatedSession,
    githubId: string,
    id: string,
    body: {
      expectedHash: string;
      expectedSelectionId: string;
      branchRef: string;
      requiredRules: string[];
    },
  ) {
    return this.change(
      session,
      githubId,
      "policy.draft",
      async (tx, repositoryId) => {
        const policy = await tx.gatePolicyRevision.findFirst({
          where: { id, repositoryId, organizationId: session.organizationId! },
        });
        if (!policy) throw new NotFoundException("Policy is unavailable");
        if (policy.state !== "DRAFT")
          throw new ConflictException("Only draft policies can be edited");
        if (
          policy.definitionHash !== body.expectedHash ||
          digest(policy.definition) !== policy.definitionHash
        )
          throw new ConflictException(
            "The draft changed. Reload before editing it.",
          );
        if (policy.branchRef !== body.branchRef)
          throw new BadRequestException(
            "Create a new policy to target a different branch",
          );
        const selection = await tx.repositoryStandardsSelection.findFirst({
          where: { repositoryId },
          orderBy: { revision: "desc" },
        });
        if (!selection || selection.id !== body.expectedSelectionId)
          throw new ConflictException(
            "Standards changed. Reload before saving the draft.",
          );
        const definition = {
          ...composeGatePolicy(selection, policy.branchRef, body.requiredRules),
          organizationId: session.organizationId!,
          repositoryGithubId: githubId,
        };
        const updated = await tx.gatePolicyRevision.update({
          where: { id },
          data: {
            selectionId: selection.id,
            definition,
            definitionHash: digest(definition),
            draftedById: session.identityId,
            approvedById: null,
            approvedAt: null,
            approvalKind: "INDEPENDENT",
          },
        });
        await tx.auditEvent.create({
          data: {
            event: "policy.draft_updated",
            actorId: session.identityId,
            metadata: {
              organizationId: session.organizationId,
              repositoryId,
              policyId: id,
              revision: policy.revision,
              branchRef: policy.branchRef,
              previousDefinition: policy.definition,
              previousHash: policy.definitionHash,
              definitionHash: updated.definitionHash,
              previousSelectionId: policy.selectionId,
              selectionId: selection.id,
              previousDraftedById: policy.draftedById,
            },
          },
        });
        return updated;
      },
    );
  }
  async approve(
    session: AuthenticatedSession,
    githubId: string,
    id: string,
    expectedHash: string,
  ) {
    return this.change(
      session,
      githubId,
      "policy.publish",
      async (tx, repositoryId) => {
        const policy = await this.current(
          tx,
          session,
          repositoryId,
          id,
          expectedHash,
        );
        if (policy.state !== "DRAFT")
          throw new ConflictException("Policy is not awaiting approval");
        const selfApproval = policy.draftedById === session.identityId;
        if (selfApproval && !(await this.isSuperAdmin(tx, session.identityId)))
          throw new ConflictException(
            "Independent policy approval is required",
          );
        const approved = await tx.gatePolicyRevision.update({
          where: { id },
          data: {
            state: "APPROVED",
            approvalKind: selfApproval
              ? "SUPER_ADMIN_SELF_APPROVAL"
              : "INDEPENDENT",
            approvedById: session.identityId,
            approvedAt: new Date(),
          },
        });
        await this.audit(
          tx,
          session,
          selfApproval ? "policy.super_admin_self_approved" : "policy.approved",
          approved,
        );
        return approved;
      },
    );
  }
  async publish(
    session: AuthenticatedSession,
    githubId: string,
    id: string,
    expectedHash: string,
    expectedPublishedId: string | null,
  ) {
    return this.change(
      session,
      githubId,
      "policy.publish",
      async (tx, repositoryId) => {
        const policy = await this.current(
          tx,
          session,
          repositoryId,
          id,
          expectedHash,
        );
        if (
          policy.state !== "APPROVED" ||
          !policy.approvedById ||
          (policy.approvedById === policy.draftedById &&
            (policy.approvalKind !== "SUPER_ADMIN_SELF_APPROVAL" ||
              !(await this.isSuperAdmin(tx, policy.approvedById))))
        )
          throw new ConflictException(
            "Independent approval is required before publication",
          );
        await new AuthorizationService(tx as PrismaService).requireRepository(
          {
            ...session,
            identityId: policy.approvedById,
          },
          githubId,
          "policy.publish",
        );
        const previous = await tx.gatePolicyRevision.findFirst({
          where: {
            repositoryId,
            branchRef: policy.branchRef,
            state: "PUBLISHED",
          },
          orderBy: { publishedAt: "desc" },
        });
        if (
          (previous?.id ?? null) !== expectedPublishedId ||
          (previous && previous.revision >= policy.revision)
        )
          throw new ConflictException(
            "Published policy changed; review the current version",
          );
        if (previous)
          await tx.gatePolicyRevision.update({
            where: { id: previous.id },
            data: { state: "SUPERSEDED" },
          });
        const published = await tx.gatePolicyRevision.update({
          where: { id },
          data: {
            state: "PUBLISHED",
            publishedById: session.identityId,
            publishedAt: new Date(),
          },
        });
        await this.audit(tx, session, "policy.published", published);
        await recordPolicyNotification(tx, published, session.identityId);
        return published;
      },
    );
  }
  private async isSuperAdmin(tx: any, identityId: string) {
    const member = await tx.membership.findUnique({ where: { identityId } });
    return !!member?.active && member.role === "SUPER_ADMIN";
  }
  private async current(
    tx: any,
    session: AuthenticatedSession,
    repositoryId: string,
    id: string,
    expectedHash: string,
  ) {
    const policy = await tx.gatePolicyRevision.findFirst({
      where: { id, repositoryId, organizationId: session.organizationId! },
    });
    if (!policy) throw new NotFoundException("Policy is unavailable");
    const selection = await tx.repositoryStandardsSelection.findFirst({
      where: { repositoryId },
      orderBy: { revision: "desc" },
    });
    if (
      policy.definitionHash !== expectedHash ||
      digest(policy.definition) !== policy.definitionHash ||
      selection?.id !== policy.selectionId
    )
      throw new ConflictException(
        "Policy or standards baseline changed; draft and review a new version",
      );
    return policy;
  }
  private audit(
    tx: any,
    session: AuthenticatedSession,
    event: string,
    policy: any,
  ) {
    return tx.auditEvent.create({
      data: {
        event,
        actorId: session.identityId,
        metadata: {
          organizationId: session.organizationId,
          repositoryId: policy.repositoryId,
          policyId: policy.id,
          branchRef: policy.branchRef,
          revision: policy.revision,
          definitionHash: policy.definitionHash,
          approvedById: policy.approvedById,
          approvalKind: policy.approvalKind,
        },
      },
    });
  }
}
