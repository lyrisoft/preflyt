import { createHash, randomBytes } from "node:crypto";
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
import { FindingAgentService } from "../findings/finding-agent.service.js";
import { agentScope } from "../findings/finding-agent-contract.js";
import { digest } from "../assessments/assessment-digest.js";
const secret = (prefix: string) =>
  prefix + randomBytes(32).toString("base64url");
const future = (ms: number) => new Date(Date.now() + ms);
const minute = 60_000;
function object(input: any, keys: string[]) {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).some((k) => !keys.includes(k))
  )
    throw new BadRequestException("Invalid companion request.");
}
function text(value: unknown, max = 100): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f]/.test(value)
  )
    throw new BadRequestException("Invalid companion request.");
  return value;
}
const strings = (v: unknown): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? v : [];
@Injectable()
export class CompanionService {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(AuthorizationService) private access: AuthorizationService,
    @Inject(FindingAgentService) private findings: FindingAgentService,
  ) {}
  resource() {
    return (
      process.env.PREFLYT_PUBLIC_API_URL ||
      `${process.env.WEB_ORIGIN || "http://localhost:8080"}/api`
    ).replace(/\/$/, "");
  }
  async begin(input: any) {
    object(input, [
      "client_id",
      "code_challenge",
      "code_challenge_method",
      "state",
      "redirect_uri",
      "resource",
      "name",
      "agents",
      "repositories",
    ]);
    if (
      input.client_id !== "preflyt-companion" ||
      input.code_challenge_method !== "S256" ||
      !/^[\w-]{43}$/.test(input.code_challenge) ||
      !/^[\w-]{32,128}$/.test(input.state) ||
      input.resource !== this.resource()
    )
      throw new BadRequestException(
        "Invalid OAuth client, resource or PKCE challenge.",
      );
    let uri: URL;
    try {
      uri = new URL(text(input.redirect_uri, 200));
    } catch {
      throw new BadRequestException("Use a loopback callback on 127.0.0.1.");
    }
    if (
      uri.protocol !== "http:" ||
      uri.hostname !== "127.0.0.1" ||
      !uri.port ||
      uri.pathname !== "/callback" ||
      uri.search ||
      uri.hash ||
      uri.username ||
      uri.password
    )
      throw new BadRequestException("Use a loopback callback on 127.0.0.1.");
    const agents = strings(input.agents),
      repositories = strings(input.repositories);
    if (
      !agents.length ||
      agents.length > 2 ||
      agents.some((a) => !["codex", "claude"].includes(a)) ||
      !repositories.length ||
      repositories.length > 100 ||
      repositories.some((r) => !/^[\w.-]+\/[\w.-]+$/.test(r))
    )
      throw new BadRequestException(
        "Choose installed agents and local GitHub repositories.",
      );
    // Bound anonymous pending requests; no durable credential exists until browser approval.
    await this.db.companionAuthorization.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if ((await this.db.companionAuthorization.count()) >= 1000)
      throw new ConflictException("Pairing is busy. Try again later.");
    const row = await this.db.companionAuthorization.create({
      data: {
        challenge: input.code_challenge,
        state: input.state,
        redirectUri: uri.href,
        resource: input.resource,
        name: text(input.name, 80),
        agents: [...new Set(agents)],
        repositories: [...new Set(repositories)],
        expiresAt: future(5 * minute),
      },
    });
    return {
      authorization_url: `${process.env.WEB_ORIGIN || "http://localhost:8080"}/integrations?integration=mcp&companion=${row.id}`,
      expires_in: 300,
    };
  }
  private async authorization(id: string) {
    const row = await this.db.companionAuthorization.findUnique({
      where: { id },
    });
    if (!row || row.expiresAt <= new Date() || row.consumedAt || row.codeHash)
      throw new NotFoundException(
        "This pairing request has expired or was already approved. Restart the companion to pair again.",
      );
    return row;
  }
  async consent(session: AuthenticatedSession, id: string) {
    await this.access.requireOrganization(session, "ai.review.run", true);
    const row = await this.authorization(id);
    const repositories: { id: string; name: string }[] = [];
    for (const fullName of strings(row.repositories)) {
      const repo = await this.db.gitHubRepository.findFirst({
        where: {
          fullName,
          installation: { organizationId: session.organizationId! },
          selected: true,
          available: true,
        },
      });
      if (repo)
        try {
          await this.access.requireRepository(
            session,
            repo.githubId.toString(),
            "ai.review.run",
          );
          repositories.push({
            id: repo.githubId.toString(),
            name: repo.fullName,
          });
        } catch {}
    }
    return {
      id: row.id,
      name: row.name,
      agents: strings(row.agents),
      repositories,
      expiresAt: row.expiresAt,
    };
  }
  async approve(session: AuthenticatedSession, input: any) {
    object(input, ["id", "repositories"]);
    const consent = await this.consent(session, text(input.id));
    const approved = strings(input.repositories);
    if (
      !approved.length ||
      approved.some((r) => !consent.repositories.some((x) => x.id === r))
    )
      throw new ForbiddenException("Choose repositories you can review.");
    const code = secret("pfc_");
    const row = await this.authorization(consent.id);
    const updated = await this.db.companionAuthorization.updateMany({
      where: {
        id: row.id,
        codeHash: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        codeHash: digest(code),
        identityId: session.identityId,
        organizationId: session.organizationId!,
        approvedRepositories: [...new Set(approved)],
      },
    });
    if (updated.count !== 1)
      throw new ConflictException("Pairing was already approved.");
    const redirect = new URL(row.redirectUri);
    redirect.searchParams.set("code", code);
    redirect.searchParams.set("state", row.state);
    redirect.searchParams.set("iss", this.resource());
    return { redirect: redirect.href };
  }
  private credentials() {
    const access_token = secret("pfa_"),
      refresh_token = secret("pfr_");
    return {
      access_token,
      refresh_token,
      token_type: "Bearer",
      expires_in: 900,
    };
  }
  private async session(connection: {
    identityId: string;
    organizationId: string;
  }) {
    if (
      !(await this.db.membership.findFirst({
        where: { identityId: connection.identityId, active: true },
      }))
    )
      throw new UnauthorizedException("The connection owner is inactive.");
    const session: AuthenticatedSession = {
      authenticated: true,
      identityId: connection.identityId,
      organizationId: connection.organizationId,
      role: "DEVELOPER",
      subject: "companion",
      email: null,
    };
    const member = await this.access.requireOrganization(
      session,
      "ai.review.run",
      true,
    );
    session.role = member.role;
    return session;
  }
  async token(input: any) {
    object(input, [
      "grant_type",
      "client_id",
      "code",
      "code_verifier",
      "redirect_uri",
      "resource",
      "refresh_token",
    ]);
    if (
      input.client_id !== "preflyt-companion" ||
      input.resource !== this.resource()
    )
      throw new UnauthorizedException("Invalid OAuth client or resource.");
    const tokens = this.credentials();
    if (input.grant_type === "authorization_code") {
      if (
        typeof input.code !== "string" ||
        !/^[\w.~-]{43,128}$/.test(input.code_verifier)
      )
        throw new UnauthorizedException(
          "Invalid authorization code or verifier.",
        );
      const row = await this.db.companionAuthorization.findUnique({
        where: { codeHash: digest(input.code) },
      });
      if (
        !row ||
        row.consumedAt ||
        row.expiresAt <= new Date() ||
        row.redirectUri !== input.redirect_uri ||
        row.resource !== input.resource ||
        createHash("sha256").update(input.code_verifier).digest("base64url") !==
          row.challenge ||
        !row.identityId ||
        !row.organizationId
      )
        throw new UnauthorizedException(
          "Invalid or expired authorization code.",
        );
      await this.session({
        identityId: row.identityId,
        organizationId: row.organizationId,
      });
      const connection = await this.db.$transaction(async (tx) => {
        const claimed = await tx.companionAuthorization.updateMany({
          where: {
            id: row.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (claimed.count !== 1)
          throw new UnauthorizedException(
            "Authorization code was already used.",
          );
        return tx.companionConnection.create({
          data: {
            identityId: row.identityId!,
            organizationId: row.organizationId!,
            name: row.name,
            agents: row.agents!,
            repositories: row.approvedRepositories!,
            accessHash: digest(tokens.access_token),
            refreshHash: digest(tokens.refresh_token),
            accessExpiresAt: future(15 * minute),
            expiresAt: future(30 * 24 * 60 * minute),
          },
        });
      });
      await this.audit(connection, "companion.connected");
      return { ...tokens, connection_id: connection.id };
    }
    if (
      input.grant_type !== "refresh_token" ||
      typeof input.refresh_token !== "string"
    )
      throw new UnauthorizedException("Unsupported OAuth grant.");
    const row = await this.db.companionConnection.findUnique({
      where: { refreshHash: digest(input.refresh_token) },
    });
    if (!row || row.revokedAt || row.expiresAt <= new Date())
      throw new UnauthorizedException(
        "Pair this companion again in Integrations.",
      );
    await this.session(row);
    const changed = await this.db.companionConnection.updateMany({
      where: {
        id: row.id,
        refreshHash: row.refreshHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        accessHash: digest(tokens.access_token),
        refreshHash: digest(tokens.refresh_token),
        accessExpiresAt: future(15 * minute),
      },
    });
    if (changed.count !== 1)
      throw new UnauthorizedException("This refresh token was already used.");
    return { ...tokens, connection_id: row.id };
  }
  async native(header?: string) {
    if (!header || !/^Bearer pfa_[\w-]{43}$/.test(header))
      throw new UnauthorizedException("A companion access token is required.");
    const row = await this.db.companionConnection.findUnique({
      where: { accessHash: digest(header.slice(7)) },
    });
    if (
      !row ||
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.accessExpiresAt <= new Date()
    )
      throw new UnauthorizedException(
        "The companion connection expired or was disconnected.",
      );
    return { connection: row, session: await this.session(row) };
  }
  private async audit(
    c: { id: string; identityId: string; organizationId: string },
    event: string,
  ) {
    await this.db.auditEvent.create({
      data: {
        event,
        actorId: c.identityId,
        metadata: { connectionId: c.id, organizationId: c.organizationId },
      },
    });
  }
  async list(session: AuthenticatedSession) {
    await this.access.requireOrganization(session, "assessment.read");
    await this.expire();
    return this.db.companionConnection.findMany({
      where: {
        identityId: session.identityId,
        organizationId: session.organizationId!,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        agents: true,
        repositories: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
  async revoke(session: AuthenticatedSession, id: string) {
    const row = await this.db.companionConnection.findFirst({
      where: {
        id,
        identityId: session.identityId,
        organizationId: session.organizationId!,
      },
    });
    if (!row) throw new NotFoundException("Connection unavailable.");
    await this.db.$transaction(async (tx) => {
      await tx.companionConnection.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      const jobs = await tx.companionJob.findMany({
        where: { connectionId: id, state: { in: ["QUEUED", "RUNNING"] } },
      });
      await tx.findingAgentGrant.updateMany({
        where: {
          id: { in: jobs.flatMap((j) => (j.grantId ? [j.grantId] : [])) },
        },
        data: { revokedAt: new Date() },
      });
      await tx.companionJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: {
          state: "CANCELLED",
          cancelRequested: true,
          finishedAt: new Date(),
        },
      });
    });
    await this.audit(row, "companion.disconnected");
    return { revoked: true };
  }
  private async expire() {
    const stale = await this.db.companionJob.findMany({
      where: {
        OR: [
          { state: "RUNNING", leaseUntil: { lt: new Date() } },
          {
            state: "QUEUED",
            createdAt: { lt: new Date(Date.now() - 10 * minute) },
          },
        ],
      },
      take: 100,
    });
    for (const job of stale)
      await this.db.$transaction(async (tx) => {
        const changed = await tx.companionJob.updateMany({
          where: { id: job.id, state: job.state, leaseUntil: job.leaseUntil },
          data: {
            state: "FAILED",
            failure:
              "The companion stopped responding. Check it is running, then start a new task.",
            finishedAt: new Date(),
          },
        });
        if (changed.count && job.grantId)
          await tx.findingAgentGrant.updateMany({
            where: { id: job.grantId },
            data: { revokedAt: new Date() },
          });
      });
  }
  async jobs(session: AuthenticatedSession, input: unknown) {
    const scope = agentScope(input);
    await this.findings.resolve(session, scope);
    await this.expire();
    const rows = await this.db.companionJob.findMany({
      where: {
        scope: { equals: scope },
        connection: {
          identityId: session.identityId,
          organizationId: session.organizationId!,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        scope: true,
        agent: true,
        mode: true,
        state: true,
        failure: true,
        createdAt: true,
        finishedAt: true,
        cancelRequested: true,
      },
    });
    return rows
      .filter((j) => digest(j.scope) === digest(scope))
      .slice(0, 10)
      .map(({ scope, ...j }) => j);
  }
  async enqueue(session: AuthenticatedSession, input: any) {
    object(input, ["scope", "connectionId", "agent", "mode", "requestKey"]);
    const resolved = await this.findings.resolve(session, input.scope);
    await this.access.requireRepository(
      session,
      resolved.scope.repositoryId,
      "ai.review.run",
      true,
      true,
    );
    if (
      !["codex", "claude"].includes(input.agent) ||
      !["verify", "fix"].includes(input.mode) ||
      !/^[\w-]{8,80}$/.test(input.requestKey)
    )
      throw new BadRequestException("Choose an agent and task.");
    const connection = await this.db.companionConnection.findFirst({
      where: {
        id: text(input.connectionId),
        identityId: session.identityId,
        organizationId: session.organizationId!,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        lastSeenAt: { gt: new Date(Date.now() - 45_000) },
      },
    });
    if (
      !connection ||
      !strings(connection.agents).includes(input.agent) ||
      !strings(connection.repositories).includes(resolved.scope.repositoryId)
    )
      throw new ConflictException(
        "This companion is offline or has no access to this repository. Manage it in Integrations.",
      );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CompanionConnection" WHERE "id"=${connection.id} FOR UPDATE`;
      const prior = await tx.companionJob.findUnique({
        where: {
          connectionId_requestKey: {
            connectionId: connection.id,
            requestKey: input.requestKey,
          },
        },
      });
      if (prior) {
        if (
          digest(prior.scope) !== digest(resolved.scope) ||
          prior.agent !== input.agent ||
          prior.mode !== input.mode
        )
          throw new ConflictException("Request key was already used.");
        return { id: prior.id };
      }
      if (
        await tx.companionJob.count({
          where: {
            connectionId: connection.id,
            state: { in: ["QUEUED", "RUNNING"] },
          },
        })
      )
        throw new ConflictException(
          "This companion already has a task. Wait for it to finish.",
        );
      const job = await tx.companionJob.create({
        data: {
          connectionId: connection.id,
          requestKey: input.requestKey,
          scope: resolved.scope,
          sourceSha: resolved.sourceSha,
          agent: input.agent,
          mode: input.mode,
        },
      });
      return { id: job.id };
    });
  }
  async cancel(session: AuthenticatedSession, id: string) {
    const job = await this.db.companionJob.findFirst({
      where: {
        id,
        connection: {
          identityId: session.identityId,
          organizationId: session.organizationId!,
        },
      },
    });
    if (!job) throw new NotFoundException("Task unavailable.");
    await this.findings.resolve(session, job.scope);
    await this.db.$transaction(async (tx) => {
      await tx.companionJob.updateMany({
        where: { id, state: { in: ["QUEUED", "RUNNING"] } },
        data: {
          cancelRequested: true,
          state: "CANCELLED",
          finishedAt: new Date(),
        },
      });
      if (job.grantId)
        await tx.findingAgentGrant.updateMany({
          where: { id: job.grantId },
          data: { revokedAt: new Date() },
        });
    });
    return { cancelled: true };
  }
  async poll(header?: string) {
    const auth = await this.native(header);
    await this.expire();
    await this.db.companionConnection.update({
      where: { id: auth.connection.id },
      data: { lastSeenAt: new Date() },
    });
    const job = await this.db.companionJob.findFirst({
      where: { connectionId: auth.connection.id, state: "QUEUED" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return { job: null };
    const claimed = await this.db.companionJob.updateMany({
      where: {
        id: job.id,
        state: "QUEUED",
        cancelRequested: false,
        connection: { revokedAt: null },
      },
      data: {
        state: "RUNNING",
        startedAt: new Date(),
        leaseUntil: future(minute),
      },
    });
    if (!claimed.count) return { job: null };
    let grantId: string | undefined;
    try {
      const resolved = await this.findings.resolve(auth.session, job.scope);
      await this.access.requireRepository(
        auth.session,
        resolved.scope.repositoryId,
        "ai.review.run",
        true,
        true,
      );
      if (
        resolved.sourceSha !== job.sourceSha ||
        !strings(auth.connection.repositories).includes(
          resolved.scope.repositoryId,
        )
      )
        throw new ForbiddenException(
          "Task source or repository access changed.",
        );
      const grant = await this.findings.createGrant(auth.session, job.scope);
      grantId = grant.id;
      const saved = await this.db.companionJob.updateMany({
        where: {
          id: job.id,
          state: "RUNNING",
          cancelRequested: false,
          connection: { revokedAt: null },
        },
        data: { grantId: grant.id },
      });
      if (!saved.count) throw new ConflictException("Task cancelled.");
      return {
        job: {
          id: job.id,
          agent: job.agent,
          mode: job.mode,
          repository: resolved.repo.fullName,
          sourceSha: job.sourceSha,
          task: (await this.findings.task(auth.session, job.scope)).task,
          mcpUrl: `${this.resource()}/mcp`,
          token: grant.token,
        },
      };
    } catch {
      if (grantId)
        await this.db.findingAgentGrant.updateMany({
          where: { id: grantId },
          data: { revokedAt: new Date() },
        });
      await this.db.companionJob.updateMany({
        where: { id: job.id, state: "RUNNING" },
        data: {
          state: "FAILED",
          failure:
            "The task could not start. Check repository access and reconnect the companion.",
          finishedAt: new Date(),
        },
      });
      return { job: null };
    }
  }
  async update(header: string | undefined, input: any) {
    object(input, ["id", "state"]);
    const auth = await this.native(header);
    await this.expire();
    const job = await this.db.companionJob.findFirst({
      where: { id: text(input.id), connectionId: auth.connection.id },
    });
    if (!job) throw new NotFoundException("Task unavailable.");
    await this.findings.resolve(auth.session, job.scope);
    await this.access.requireRepository(
      auth.session,
      agentScope(job.scope).repositoryId,
      "ai.review.run",
      true,
    );
    if (job.state !== "RUNNING") return { cancelled: true };
    if (!["RUNNING", "COMPLETED", "FAILED"].includes(input.state))
      throw new BadRequestException("Invalid task state.");
    const hasEvidence =
      job.grantId &&
      (await this.db.findingAgentEvidence.count({
        where: { grantId: job.grantId, kind: "verification" },
      }));
    const state =
      input.state === "COMPLETED" && !hasEvidence ? "FAILED" : input.state;
    await this.db.companionJob.updateMany({
      where: { id: job.id, state: "RUNNING", cancelRequested: false },
      data:
        state === "RUNNING"
          ? { leaseUntil: future(minute) }
          : {
              state,
              finishedAt: new Date(),
              failure:
                state === "FAILED"
                  ? "The agent did not return a complete review. Check the companion terminal and start a new task."
                  : null,
            },
    });
    if (state !== "RUNNING" && job.grantId)
      await this.db.findingAgentGrant.updateMany({
        where: { id: job.grantId },
        data: { revokedAt: new Date() },
      });
    await this.db.companionConnection.update({
      where: { id: auth.connection.id },
      data: { lastSeenAt: new Date() },
    });
    return { cancelled: false, state };
  }
}
