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
import { sameIdentity } from "../auth/same-identity.js";
import { digest } from "./assessment-digest.js";
import { verifyTeamContext } from "../teams/team-context.js";
import { configurationValue } from "../configuration/runtime-configuration.js";
import { notificationsEnabled } from "../notifications/notification-event.js";
import {
  exceptionRequestHash,
  matchesExceptionScope,
  validateExceptionRequest,
  type ExceptionScope,
  type ApprovedException,
} from "./policy-exception-contract.js";

@Injectable()
export class PolicyExceptionService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  async list(
    session: AuthenticatedSession,
    githubId: string,
    policyId: string,
  ) {
    const repo = await this.access.requireRepository(
      session,
      githubId,
      "policy.read",
    );
    const rows = await this.db.policyException.findMany({
      where: {
        repositoryId: repo.id,
        organizationId: session.organizationId!,
        policyId,
      },
      orderBy: { createdAt: "desc" },
      take: 51,
    });
    return {
      exceptions: rows
        .slice(0, 50)
        .map((row) => ({
          ...row,
          state:
            ["REQUESTED", "APPROVED"].includes(row.state) &&
            row.expiresAt <= new Date()
              ? "EXPIRED"
              : row.state,
        })),
      truncated: rows.length > 50,
    };
  }
  async request(
    session: AuthenticatedSession,
    githubId: string,
    policyId: string,
    body: {
      expectedPolicyHash: string;
      sourceSha: string;
      ruleIds: string[];
      reason: string;
      expiresAt: string;
    },
  ) {
    const repo = await this.access.requireRepository(
      session,
      githubId,
      "policy.exception.request",
    );
    return this.db
      .$transaction(
        async (tx) => {
          const policy = await this.currentPolicy(
            tx,
            repo.id,
            session.organizationId!,
            policyId,
          );
          if (policy.definitionHash !== body.expectedPolicyHash)
            throw new ConflictException(
              "The policy changed. Refresh and review it again",
            );
          const values = validateExceptionRequest(
            body,
            policy.definition as any,
          );
          const assessment = await tx.commitAssessment.findFirst({
            where: {
              repositoryId: repo.id,
              sourceSha: body.sourceSha,
              selectionId: policy.selectionId,
            },
            orderBy: { createdAt: "desc" },
          });
          if (
            !assessment ||
            digest({
              request: assessment.request,
              plan: assessment.plan,
              report: assessment.report,
            }) !== assessment.assessmentHash
          )
            throw new BadRequestException(
              "Choose a commit with a current saved assessment for this policy",
            );
          const scope: ExceptionScope = {
            ...values,
            organizationId: session.organizationId!,
            repositoryId: repo.id,
            policyId,
            policyHash: policy.definitionHash,
            branchRef: policy.branchRef,
            requestedById: session.identityId,
          };
          const requestHash = exceptionRequestHash(scope);
          const existing = await tx.policyException.findUnique({
            where: { requestHash },
          });
          if (existing) return existing;
          const row = await tx.policyException.create({
            data: { ...scope, requestHash },
          });
          await this.record(tx, repo, row, "REQUESTED", session.identityId);
          return row;
        },
        { isolationLevel: "Serializable" },
      )
      .catch((error) => this.concurrentConflict(error));
  }
  async decide(
    session: AuthenticatedSession,
    githubId: string,
    policyId: string,
    id: string,
    body: { expectedHash: string; expectedRevision: number },
    decision: "APPROVED" | "REJECTED" | "REVOKED",
  ) {
    const permission =
      decision === "REVOKED"
        ? "policy.exception.request"
        : "policy.exception.approve";
    const repo = await this.access.requireRepository(
      session,
      githubId,
      permission,
    );
    return this.db
      .$transaction(
        async (tx) => {
          const row = await tx.policyException.findFirst({
            where: {
              id,
              policyId,
              repositoryId: repo.id,
              organizationId: session.organizationId!,
            },
          });
          if (!row)
            throw new NotFoundException("Exception request is unavailable");
          if (
            row.requestHash !== body.expectedHash ||
            row.revision !== body.expectedRevision
          )
            throw new ConflictException(
              "The exception request changed. Refresh before reviewing",
            );
          if (decision === "REVOKED") {
            if (!["REQUESTED", "APPROVED"].includes(row.state))
              throw new ConflictException("This exception is already closed");
            if (
              !(await sameIdentity(tx, row.requestedById, session.identityId))
            )
              await this.access.requireRepository(
                session,
                githubId,
                "policy.exception.approve",
              );
          } else {
            if (row.state !== "REQUESTED" || row.expiresAt <= new Date())
              throw new ConflictException(
                "Only a current pending exception can be reviewed",
              );
            if (await sameIdentity(tx, row.requestedById, session.identityId))
              throw new ConflictException(
                "Another authorized person must review this exception",
              );
            const policy = await this.currentPolicy(
              tx,
              repo.id,
              session.organizationId!,
              policyId,
            );
            if (policy.definitionHash !== row.policyHash)
              throw new ConflictException(
                "The published policy changed. Request a new exception",
              );
            validateExceptionRequest(
              {
                sourceSha: row.sourceSha,
                ruleIds: row.ruleIds as string[],
                reason: row.reason,
                expiresAt: row.expiresAt.toISOString(),
              },
              policy.definition as any,
            );
            if (
              row.requestHash !==
              exceptionRequestHash(row as unknown as ExceptionScope)
            )
              throw new ConflictException(
                "Exception request integrity could not be verified",
              );
            await this.actorAccess(
              row.requestedById,
              row.organizationId,
              githubId,
              "policy.exception.request",
            );
          }
          const updated = await tx.policyException.updateMany({
            where: { id, revision: row.revision, state: row.state },
            data: {
              state: decision,
              revision: { increment: 1 },
              ...(decision === "APPROVED"
                ? { approvedById: session.identityId, approvedAt: new Date() }
                : decision === "REVOKED"
                  ? { revokedById: session.identityId, revokedAt: new Date() }
                  : {}),
            },
          });
          if (!updated.count)
            throw new ConflictException(
              "The exception request changed. Refresh before reviewing",
            );
          const current = await tx.policyException.findUniqueOrThrow({
            where: { id },
          });
          await this.record(tx, repo, current, decision, session.identityId);
          await this.wake(tx, repo.id, row.sourceSha);
          return current;
        },
        { isolationLevel: "Serializable" },
      )
      .catch((error) => this.concurrentConflict(error));
  }
  /** Called for every publication preview and again immediately before publishing. */
  async active(
    session: AuthenticatedSession,
    githubId: string,
    scope: Omit<
      ExceptionScope,
      "ruleIds" | "reason" | "requestedById" | "expiresAt"
    >,
  ) {
    const repo = await this.access.requireRepository(
      session,
      githubId,
      "policy.read",
    );
    if (
      repo.id !== scope.repositoryId ||
      session.organizationId !== scope.organizationId
    )
      throw new ConflictException(
        "Exception scope does not match the current repository",
      );
    // Expiring approvals must have a live owner for automatic check invalidation.
    const automation = await this.db.readinessAutomation.findUnique({
      where: { repositoryId: repo.id },
    });
    if (
      configurationValue("AUTOMATIC_CHECK_PUBLICATION_ENABLED") !== "true" ||
      !automation?.enabled
    )
      return [];
    const rows = await this.db.policyException.findMany({
      where: {
        ...scope,
        state: "APPROVED",
        expiresAt: { gt: new Date(Date.now() + 60_000) },
      },
      take: 51,
    });
    if (rows.length > 50)
      throw new ConflictException(
        "Too many active exceptions. Review the policy before publishing",
      );
    const active: ApprovedException[] = [];
    for (const row of rows) {
      if (
        !matchesExceptionScope(row as unknown as ApprovedException, scope) ||
        (await sameIdentity(this.db, row.requestedById, row.approvedById!))
      )
        continue;
      try {
        await this.actorAccess(
          row.requestedById,
          row.organizationId,
          githubId,
          "policy.exception.request",
        );
        await this.actorAccess(
          row.approvedById!,
          row.organizationId,
          githubId,
          "policy.exception.approve",
        );
        active.push(row as unknown as ApprovedException);
      } catch (error) {
        if (
          error instanceof Error &&
          "getStatus" in error &&
          [403, 401].includes((error as any).getStatus())
        )
          continue;
        throw error;
      }
    }
    return active;
  }
  async expire() {
    const rows = await this.db.policyException.findMany({
      where: {
        state: { in: ["REQUESTED", "APPROVED"] },
        expiresAt: { lte: new Date() },
      },
      orderBy: { expiresAt: "asc" },
      take: 20,
      include: { repository: true },
    });
    for (const row of rows)
      await this.db.$transaction(async (tx) => {
        const changed = await tx.policyException.updateMany({
          where: {
            id: row.id,
            revision: row.revision,
            state: row.state,
            expiresAt: { lte: new Date() },
          },
          data: { state: "EXPIRED", revision: { increment: 1 } },
        });
        if (!changed.count) return;
        await this.record(
          tx,
          row.repository,
          { ...row, revision: row.revision + 1 },
          "EXPIRED",
          null,
        );
        await this.wake(tx, row.repositoryId, row.sourceSha);
      });
  }
  private concurrentConflict(error: unknown): never {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["P2034", "P2002"].includes(String(error.code))
    )
      throw new ConflictException(
        "Another review changed this exception. Refresh before continuing",
      );
    throw error;
  }
  private actorAccess(
    identityId: string,
    organizationId: string,
    githubId: string,
    permission: string,
  ) {
    return this.access.requireRepository(
      {
        authenticated: true,
        identityId,
        organizationId,
        subject: "policy-exception-review",
        email: null,
        role: "VIEWER",
      },
      githubId,
      permission,
    );
  }
  private async currentPolicy(
    tx: any,
    repositoryId: string,
    organizationId: string,
    id: string,
  ) {
    const row = await tx.gatePolicyRevision.findFirst({
      where: { id, repositoryId, organizationId, state: "PUBLISHED" },
    });
    if (!row)
      throw new NotFoundException(
        "Choose a published policy in this repository",
      );
    const latest = await tx.gatePolicyRevision.findFirst({
      where: { repositoryId, branchRef: row.branchRef, state: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    const selection = await tx.repositoryStandardsSelection.findFirst({
      where: { repositoryId },
      orderBy: { revision: "desc" },
    });
    if (
      latest?.id !== id ||
      selection?.id !== row.selectionId ||
      digest(row.definition) !== row.definitionHash
    )
      throw new ConflictException(
        "Policy or standards changed. Review the latest published policy",
      );
    await verifyTeamContext(tx, repositoryId, row.definition.teamContext);
    return row;
  }
  private wake(tx: any, repositoryId: string, sourceSha: string) {
    return tx.readinessTask.updateMany({
      where: { repositoryId, sourceSha },
      data: { nextAttemptAt: new Date(), revision: { increment: 1 } },
    });
  }
  private async record(
    tx: any,
    repo: { id: string; githubId: bigint; fullName: string },
    row: {
      id: string;
      requestHash: string;
      revision: number;
      organizationId: string;
      policyId: string;
      sourceSha: string;
      requestedById: string;
    },
    decision: string,
    actorId: string | null,
  ) {
    await tx.auditEvent.create({
      data: {
        actorId,
        event: `policy_exception_${decision.toLowerCase()}`,
        metadata: {
          organizationId: row.organizationId,
          repositoryId: repo.id,
          policyId: row.policyId,
          exceptionId: row.id,
          requestHash: row.requestHash,
          revision: row.revision,
        },
      },
    });
    if (!notificationsEnabled()) return;
    await tx.notificationEvent.create({
      data: {
        id: digest({ exceptionId: row.id, decision }),
        organizationId: row.organizationId,
        repositoryId: repo.id,
        repositoryGithubId: repo.githubId.toString(),
        repositoryName: repo.fullName,
        sourceSha: row.sourceSha,
        actorId: row.requestedById,
        type: `POLICY_EXCEPTION_${decision}`,
        severity: decision === "APPROVED" ? "warning" : "info",
      },
    });
  }
}
