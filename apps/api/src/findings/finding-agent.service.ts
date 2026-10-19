import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { digest } from "../assessments/assessment-digest.js";
import type { HealthReport } from "../health/health-report.js";
import { FindingSourceStore } from "./finding-source-store.service.js";
import { FindingsService } from "./findings.service.js";
import {
  agentScope,
  evidenceInput,
  verificationTask,
  verificationLaunchTask,
  type FindingAgentScope,
} from "./finding-agent-contract.js";

@Injectable()
export class FindingAgentService {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(AuthorizationService) private access: AuthorizationService,
    @Inject(FindingsService) private findings: FindingsService,
    @Inject(FindingSourceStore) private sources: FindingSourceStore,
  ) {}
  async resolve(session: AuthenticatedSession, input: unknown) {
    const scope = agentScope(input);
    const repo = await this.access.requireRepository(
      session,
      scope.repositoryId,
      "assessment.read",
    );
    let finding: any, sourceSha: string | null;
    if (scope.origin === "health") {
      const saved = await this.db.repositoryHealthAssessment.findFirst({
        where: {
          id: scope.assessmentId,
          repositoryId: repo.id,
          organizationId: session.organizationId!,
        },
      });
      finding = (
        saved?.report as unknown as HealthReport | null
      )?.findings.find((f) => f.fingerprint === scope.findingId);
      sourceSha = saved?.sourceSha ?? null;
    } else {
      finding = (
        await this.findings.detail(
          session,
          scope.findingId,
          scope.assessmentId,
          scope.origin === "ai" ? "ai" : undefined,
        )
      ).finding;
      sourceSha = finding.sourceSha;
      if (finding.repositoryId !== scope.repositoryId)
        throw new NotFoundException(
          "Finding is unavailable in this repository.",
        );
    }
    if (
      !finding ||
      !sourceSha ||
      ["check", "evidence"].includes(finding.category)
    )
      throw new NotFoundException(
        "Choose a source finding in a saved assessment.",
      );
    return {
      scope,
      repo,
      finding,
      sourceSha,
      context: {
        ...scope,
        repository: repo.fullName,
        sourceSha,
        title: finding.title,
        category: finding.category,
        severity: finding.severity,
        path: finding.path,
        line: finding.line,
        endLine: finding.endLine,
        analysis: finding.aiReview,
        guidance: finding.reportGuidance ?? finding.guidance,
        evidence: finding.evidence,
        status: "Needs review",
      },
    };
  }
  async context(session: AuthenticatedSession, scope: unknown) {
    const resolved = await this.resolve(session, scope);
    return resolved.context;
  }
  async source(session: AuthenticatedSession, scope: FindingAgentScope) {
    const resolved = await this.resolve(session, scope);
    if (scope.origin !== "health")
      return this.findings.source(
        session,
        scope.findingId,
        scope.assessmentId,
        scope.origin === "ai" ? "ai" : undefined,
      );
    const f = resolved.finding;
    const source =
      f.path && f.line
        ? await this.sources.read(resolved.repo.id, resolved.sourceSha, f, 5)
        : { lines: [], reason: "No exact source location was supplied." };
    await this.access.requireRepository(
      session,
      scope.repositoryId,
      "assessment.read",
    );
    return {
      path: f.path,
      line: f.line,
      endLine: f.endLine,
      sourceSha: resolved.sourceSha,
      ...source,
    };
  }
  async task(session: AuthenticatedSession, input: unknown) {
    const scope = agentScope(input),
      context = await this.context(session, scope),
      source = await this.source(session, scope);
    return { task: verificationTask(context, source) };
  }
  async launchTask(session: AuthenticatedSession, input: unknown) {
    const context = await this.context(session, agentScope(input));
    return {
      prompt: verificationLaunchTask(context),
      repository: context.repository,
    };
  }
  private where(session: AuthenticatedSession, scope: FindingAgentScope) {
    return {
      organizationId: session.organizationId!,
      repositoryGithubId: scope.repositoryId,
      origin: scope.origin,
      assessmentId: scope.assessmentId,
      findingId: scope.findingId,
    };
  }
  async history(session: AuthenticatedSession, input: unknown) {
    const { scope, sourceSha } = await this.resolve(session, input);
    const grants = await this.db.findingAgentGrant.findMany({
      where: { ...this.where(session, scope), sourceSha },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        identityId: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    const evidence = await this.db.findingAgentEvidence.findMany({
      where: { grant: { ...this.where(session, scope), sourceSha } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    if (evidence.some((row) => digest(row.content) !== row.contentHash))
      throw new ConflictException(
        "Saved external evidence could not be validated.",
      );
    let canConnect = false;
    try {
      await this.access.requireRepository(
        session,
        scope.repositoryId,
        "ai.review.run",
      );
      canConnect = true;
    } catch {}
    return {
      canConnect,
      grants: grants
        .filter((g) => g.identityId === session.identityId)
        .map(({ identityId, ...g }) => g),
      evidence: evidence.map(({ contentHash, requestKey, ...e }) => e),
    };
  }
  async createGrant(session: AuthenticatedSession, input: unknown) {
    const { scope, repo, sourceSha } = await this.resolve(session, input);
    await this.access.requireRepository(
      session,
      scope.repositoryId,
      "ai.review.run",
      true,
      true,
    );
    if (
      (await this.db.findingAgentGrant.count({
        where: {
          ...this.where(session, scope),
          identityId: session.identityId,
          oauthConnectionId: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      })) >= 5
    )
      throw new BadRequestException(
        "Revoke an existing connection before creating another.",
      );
    const token = "pfv_" + randomBytes(32).toString("base64url");
    return this.db.$transaction(async (tx) => {
      await new AuthorizationService(tx as PrismaService).requireRepository(
        session,
        scope.repositoryId,
        "ai.review.run",
      );
      const grant = await tx.findingAgentGrant.create({
        data: {
          ...this.where(session, scope),
          identityId: session.identityId,
          tokenHash: digest(token),
          sourceSha,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.auditEvent.create({
        data: {
          event: "finding.agent.connected",
          actorId: session.identityId,
          metadata: {
            grantId: grant.id,
            organizationId: session.organizationId!,
            repositoryId: repo.id,
            findingId: scope.findingId,
            assessmentId: scope.assessmentId,
            sourceSha,
          },
        },
      });
      return { id: grant.id, token, expiresAt: grant.expiresAt };
    });
  }
  async revoke(session: AuthenticatedSession, id: string) {
    const grant = await this.db.findingAgentGrant.findFirst({
      where: {
        id,
        identityId: session.identityId,
        organizationId: session.organizationId!,
      },
    });
    if (!grant) throw new NotFoundException("Connection is unavailable.");
    // Owners may revoke their own leaked credentials even after losing repository access.
    await this.db.$transaction(async (tx) => {
      await tx.findingAgentGrant.updateMany({
        where: {
          id,
          identityId: session.identityId,
          organizationId: session.organizationId!,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          event: "finding.agent.revoked",
          actorId: session.identityId,
          metadata: { grantId: id, organizationId: session.organizationId! },
        },
      });
    });
    return { revoked: true };
  }
  async authenticate(authorization?: string) {
    if (!authorization || !/^Bearer pfv_[A-Za-z0-9_-]{43}$/.test(authorization))
      throw new UnauthorizedException(
        "A finding connection token is required.",
      );
    const grant = await this.db.findingAgentGrant.findUnique({
      where: { tokenHash: digest(authorization.slice(7)) },
    });
    if (!grant || grant.revokedAt || grant.expiresAt <= new Date())
      throw new UnauthorizedException(
        "This finding connection has expired or was revoked.",
      );
    if (
      !(await this.db.membership.findFirst({
        where: { identityId: grant.identityId, active: true },
        select: { id: true },
      }))
    )
      throw new UnauthorizedException(
        "The connection owner's account is inactive.",
      );
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: grant.identityId,
      organizationId: grant.organizationId,
      role: "DEVELOPER",
      subject: "finding-agent",
      email: null,
    };
    const member = await this.access.requireOrganization(
      session,
      "ai.review.run",
      true,
    );
    session.role = member.role;
    const scope: FindingAgentScope = {
      origin: grant.origin as FindingAgentScope["origin"],
      repositoryId: grant.repositoryGithubId,
      assessmentId: grant.assessmentId,
      findingId: grant.findingId,
    };
    const resolved = await this.resolve(session, scope);
    if (resolved.sourceSha !== grant.sourceSha)
      throw new ForbiddenException(
        "The assessed commit changed. Create a new finding connection.",
      );
    return { grant, session, scope, repository: resolved.repo.fullName };
  }
  async append(
    auth: Awaited<ReturnType<FindingAgentService["authenticate"]>>,
    kind: string,
    input: unknown,
  ) {
    const content = evidenceInput(kind, input, auth.repository);
    if (content.sourceSha !== auth.grant.sourceSha)
      throw new ConflictException(
        "Evidence must identify the assessed commit. Put the tested fix commit in patchSha.",
      );
    const hash = digest(content);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "FindingAgentGrant" WHERE "id"=${auth.grant.id} FOR UPDATE`;
      const live = await tx.findingAgentGrant.findUniqueOrThrow({
        where: { id: auth.grant.id },
      });
      if (live.revokedAt || live.expiresAt <= new Date())
        throw new UnauthorizedException(
          "This finding connection has expired or was revoked.",
        );
      if (live.oauthConnectionId) {
        const connection = await tx.mcpOAuthConnection.findUnique({
          where: { id: live.oauthConnectionId },
        });
        if (
          !connection ||
          connection.revokedAt ||
          connection.expiresAt <= new Date() ||
          !connection.scopes.split(" ").includes("findings:review")
        )
          throw new UnauthorizedException(
            "The MCP connection was disconnected or has no review access.",
          );
      }
      await new AuthorizationService(tx as PrismaService).requireRepository(
        auth.session,
        auth.scope.repositoryId,
        "ai.review.run",
      );
      const prior = await tx.findingAgentEvidence.findUnique({
        where: {
          grantId_requestKey: {
            grantId: live.id,
            requestKey: content.requestKey,
          },
        },
      });
      if (prior) {
        if (prior.contentHash !== hash || prior.kind !== kind)
          throw new ConflictException(
            "This request key was already used for different evidence.",
          );
        return {
          id: prior.id,
          recorded: true,
          verification: "EXTERNAL_REPORTED",
        };
      }
      if (
        (await tx.findingAgentEvidence.count({
          where: {
            grant: {
              organizationId: live.organizationId,
              repositoryGithubId: live.repositoryGithubId,
              origin: live.origin,
              assessmentId: live.assessmentId,
              findingId: live.findingId,
            },
          },
        })) >= 50
      )
        throw new BadRequestException(
          "This finding already has 50 external evidence records.",
        );
      const row = await tx.findingAgentEvidence.create({
        data: {
          grantId: live.id,
          requestKey: content.requestKey,
          kind,
          content,
          contentHash: hash,
        },
      });
      await tx.auditEvent.create({
        data: {
          event: "finding.agent.evidence_received",
          actorId: live.identityId,
          metadata: {
            organizationId: live.organizationId,
            grantId: live.id,
            findingId: live.findingId,
            assessmentId: live.assessmentId,
            sourceSha: live.sourceSha,
            evidenceId: row.id,
            contentHash: hash,
            kind,
          },
        },
      });
      return { id: row.id, recorded: true, verification: "EXTERNAL_REPORTED" };
    });
  }
}
