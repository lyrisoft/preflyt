import { McpOAuthService } from "../src/mcp/mcp-oauth.service.js";
import {
  McpDiscoveryController,
  McpOAuthController,
  McpConnectionsController,
} from "../src/mcp/mcp-oauth.controller.js";
import { createHash, randomBytes } from "node:crypto";
import { CompanionService } from "../src/companions/companion.service.js";
import {
  CompanionController,
  CompanionOAuthController,
} from "../src/companions/companion.controller.js";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { disposableDatabase } from "./disposable-database.js";
import { FindingAgentService } from "../src/findings/finding-agent.service.js";
import {
  FindingAgentController,
  FindingMcpController,
} from "../src/findings/finding-agent.controller.js";
import { FindingSourceStore } from "../src/findings/finding-source-store.service.js";
import { FindingsService } from "../src/findings/findings.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../src/auth/session.guard.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { digest } from "../src/assessments/assessment-digest.js";
import { verificationTask } from "../src/findings/finding-agent-contract.js";
let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  app: any,
  service: FindingAgentService,
  owner: AuthenticatedSession,
  outsider: AuthenticatedSession,
  repo: any,
  scope: any;
const sha = "a".repeat(40),
  fingerprint = "b".repeat(64);
const source = {
  read: vi.fn(async () => ({
    lines: [{ number: 12, text: "return run(input)" }],
    reason: null,
  })),
};
const ci = { detail: vi.fn(), source: vi.fn(), list: vi.fn() };
beforeAll(async () => {
  fixture = await disposableDatabase("findingagent");
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
beforeEach(async () => {
  await app?.close();
  await fixture.reset();
  vi.clearAllMocks();
  const db = fixture.prisma;
  const org = await db.organization.create({ data: { name: "Agent fixture" } });
  const identity = await db.identity.create({
    data: { issuer: "fixture", subject: "owner" },
  });
  await db.membership.create({
    data: { identityId: identity.id, role: "OWNER", active: true },
  });
  await db.organizationMembership.create({
    data: { organizationId: org.id, identityId: identity.id, role: "OWNER" },
  });
  owner = {
    authenticated: true,
    identityId: identity.id,
    organizationId: org.id,
    subject: "owner",
    email: null,
    role: "OWNER",
  };
  const other = await db.organization.create({ data: { name: "Other" } }),
    otherId = await db.identity.create({
      data: { issuer: "fixture", subject: "other" },
    });
  await db.organizationMembership.create({
    data: { organizationId: other.id, identityId: otherId.id, role: "OWNER" },
  });
  outsider = { ...owner, identityId: otherId.id, organizationId: other.id };
  await db.gitHubInstallation.create({
    data: {
      id: 119n,
      connectedById: identity.id,
      organizationId: org.id,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "all",
      permissions: {},
    },
  });
  repo = await db.gitHubRepository.create({
    data: {
      githubId: 120n,
      installationId: 119n,
      name: "repo",
      ownerLogin: "fixture",
      fullName: "fixture/repo",
      isPrivate: true,
      selected: true,
      available: true,
      defaultBranch: "main",
    },
  });
  const assessment = await db.repositoryHealthAssessment.create({
    data: {
      repositoryId: repo.id,
      organizationId: org.id,
      actorId: identity.id,
      branch: "main",
      targetRevision: 1,
      requestKey: "fixture-assessment",
      state: "COMPLETED",
      sourceSha: sha,
      report: {
        findings: [
          {
            fingerprint,
            title: "Unsafe command",
            path: "src/run.ts",
            line: 12,
            endLine: 12,
            category: "security",
            severity: "medium",
            evidence: "AI_REPORTED",
            aiReview: {
              reasoning: "Untrusted input reaches a shell.",
              remediation: "Use a fixed executable.",
            },
          },
        ],
      },
    },
  });
  scope = {
    origin: "health",
    repositoryId: "120",
    assessmentId: assessment.id,
    findingId: fingerprint,
  };
  const access = new AuthorizationService(db);
  service = new FindingAgentService(db, access, ci as any, source as any);
  const auth = {
    assertOrigin: (origin: string) => {
      if (origin !== "http://localhost:5173")
        throw new ForbiddenException("Wrong origin");
    },
  };
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [
        FindingAgentController,
        FindingMcpController,
        CompanionController,
        CompanionOAuthController,
        McpDiscoveryController,
        McpOAuthController,
        McpConnectionsController,
      ],
      providers: [
        { provide: FindingAgentService, useValue: service },
        {
          provide: McpOAuthService,
          useValue: new McpOAuthService(db, access, service, ci as any),
        },
        {
          provide: CompanionService,
          useValue: new CompanionService(db, access, service),
        },
        { provide: AuthService, useValue: auth },
        { provide: PrismaService, useValue: db },
        { provide: AuthorizationService, useValue: access },
      ],
    },
    { logger: false },
  );
  // The browser session is replaced only for these HTTP tests; MCP still requires its bearer token.
  const guard = app.get(SessionGuard, { strict: false });
  vi.spyOn(guard, "canActivate").mockImplementation((ctx: any) => {
    ctx.switchToHttp().getRequest().preflytSession = owner;
    return true;
  });
  await app.init();
});
const rpc = (token: string, method: string, params?: any) =>
  request(app.getHttpServer())
    .post("/mcp")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method, params });
const evidence = () => ({
  requestKey: "request-0001",
  agent: "Codex",
  sourceSha: sha,
  outcome: "INCONCLUSIVE",
  reasoning: "Source path confirmed; no execution was authorized.",
  commands: "No commands executed.",
  results: "Source review only.",
});
it("copies a complete commit-bound task without minting credentials", async () => {
  const response = await request(app.getHttpServer())
    .get("/finding-agents/task")
    .query(scope);
  expect(response.status).toBe(200);
  expect(response.body.task).toContain("12: return run(input)");
  expect(response.body.task).toContain(sha);
  expect(response.body.task).toContain("Use a fixed executable.");
  expect(await fixture.prisma.findingAgentGrant.count()).toBe(0);
});
it("initializes MCP, lists tools, reads evidence and source with an opaque hashed scoped credential", async () => {
  const grant = await service.createGrant(owner, scope);
  expect(
    (
      await fixture.prisma.findingAgentGrant.findUniqueOrThrow({
        where: { id: grant.id },
      })
    ).tokenHash,
  ).not.toBe(grant.token);
  const init = await rpc(grant.token, "initialize", {
    protocolVersion: "2025-11-25",
  });
  expect(init.body.result.protocolVersion).toBe("2025-11-25");
  expect((await rpc(grant.token, "tools/list")).body.result.tools).toHaveLength(
    4,
  );
  expect(
    JSON.parse(
      (
        await rpc(grant.token, "tools/call", {
          name: "preflyt_get_finding",
          arguments: {},
        })
      ).body.result.content[0].text,
    ).finding.sourceSha,
  ).toBe(sha);
  expect(
    JSON.parse(
      (
        await rpc(grant.token, "tools/call", {
          name: "preflyt_get_source_context",
          arguments: {},
        })
      ).body.result.content[0].text,
    ).lines[0].number,
  ).toBe(12);
  expect(
    (
      await rpc(grant.token, "tools/call", {
        name: "preflyt_get_finding",
        arguments: { findingId: "c".repeat(64) },
      })
    ).body.error.code,
  ).toBe(-32602);
  expect(
    (
      await request(app.getHttpServer())
        .post("/mcp")
        .set("Authorization", `Bearer ${grant.token}`)
        .send({ jsonrpc: "2.0", method: "notifications/initialized" })
    ).status,
  ).toBe(202);
  expect(
    (
      await request(app.getHttpServer())
        .get("/mcp")
        .set("Authorization", `Bearer ${grant.token}`)
    ).status,
  ).toBe(405);
});
it("appends idempotent external evidence without changing assessment or finding status", async () => {
  const grant = await service.createGrant(owner, scope),
    auth = await service.authenticate(`Bearer ${grant.token}`),
    input = evidence();
  const first = await service.append(auth, "verification", input),
    second = await service.append(auth, "verification", input);
  expect(first.id).toBe(second.id);
  expect(first.verification).toBe("EXTERNAL_REPORTED");
  await expect(
    service.append(auth, "verification", {
      ...input,
      reasoning: "Different conclusion",
    }),
  ).rejects.toThrow("different evidence");
  await expect(
    service.append(auth, "verification", {
      ...input,
      requestKey: "request-0002",
      sourceSha: "c".repeat(40),
    }),
  ).rejects.toThrow("assessed commit");
  const history = await service.history(owner, scope);
  expect(history.evidence).toHaveLength(1);
  expect(await fixture.prisma.findingDisposition.count()).toBe(0);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: scope.assessmentId },
      })
    ).state,
  ).toBe("COMPLETED");
  expect(
    await fixture.prisma.auditEvent.count({
      where: { event: "finding.agent.evidence_received" },
    }),
  ).toBe(1);
});
it("accepts only same-repository PR links, bounded non-secret evidence and valid outcomes", async () => {
  const grant = await service.createGrant(owner, scope),
    auth = await service.authenticate(`Bearer ${grant.token}`);
  const input = {
    requestKey: "fix-request-1",
    agent: "Claude Code",
    sourceSha: sha,
    url: "https://github.com/fixture/repo/pull/3",
    patchSha: "c".repeat(40),
    summary: "Parameterize the command.",
  };
  await service.append(auth, "fix_pr", input);
  for (const url of [
    "https://github.com/other/repo/pull/3",
    "https://evil.test/fixture/repo/pull/3",
    "https://github.com/fixture/repo/pull/3?x=1",
  ])
    await expect(
      service.append(auth, "fix_pr", { ...input, url }),
    ).rejects.toThrow("pull request");
  await expect(
    service.append(auth, "verification", {
      ...evidence(),
      results: "Bearer super-private-token",
    }),
  ).rejects.toThrow("credentials");
  await expect(
    service.append(auth, "verification", {
      ...evidence(),
      outcome: "VERIFIED",
    }),
  ).rejects.toThrow("outcome");
  await expect(
    service.append(auth, "verification", {
      ...evidence(),
      reasoning: "x".repeat(12001),
    }),
  ).rejects.toThrow("field limits");
});
it("rejects outsiders, expired/revoked tokens and current repository or membership revocation", async () => {
  await expect(service.createGrant(outsider, scope)).rejects.toThrow();
  const grant = await service.createGrant(owner, scope);
  await expect(service.revoke(outsider, grant.id)).rejects.toThrow();
  await service.revoke(owner, grant.id);
  await expect(service.authenticate(`Bearer ${grant.token}`)).rejects.toThrow(
    "expired or was revoked",
  );
  const expired = await service.createGrant(owner, scope);
  await fixture.prisma.findingAgentGrant.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(0) },
  });
  await expect(service.authenticate(`Bearer ${expired.token}`)).rejects.toThrow(
    "expired",
  );
  const current = await service.createGrant(owner, scope);
  await fixture.prisma.gitHubRepository.update({
    where: { id: repo.id },
    data: { selected: false },
  });
  await expect(
    service.authenticate(`Bearer ${current.token}`),
  ).rejects.toThrow();
  await fixture.prisma.gitHubRepository.update({
    where: { id: repo.id },
    data: { selected: true },
  });
  await fixture.prisma.organizationMembership.updateMany({
    where: { identityId: owner.identityId },
    data: { active: false },
  });
  await expect(
    service.authenticate(`Bearer ${current.token}`),
  ).rejects.toThrow();
});
it("fails closed for missing bearer authentication, malformed RPC and unsupported tools", async () => {
  expect(
    (await request(app.getHttpServer()).post("/mcp").send({})).status,
  ).toBe(401);
  const { token } = await service.createGrant(owner, scope);
  expect(
    (await rpc(token, "tools/call", { name: "run_shell", arguments: {} })).body
      .error.code,
  ).toBe(-32602);
  expect(
    (
      await request(app.getHttpServer())
        .post("/mcp")
        .set("Authorization", `Bearer ${token}`)
        .send([])
    ).body.error.code,
  ).toBe(-32600);
  expect(
    verificationTask(
      { title: "test", repository: "r", sourceSha: sha },
      { lines: [], reason: "Unavailable" },
    ),
  ).toContain("Unavailable");
});

it("checks browser origin before creating credentials and never returns token hashes in history", async () => {
  expect(
    (
      await request(app.getHttpServer())
        .post("/finding-agents/connections")
        .send(scope)
    ).status,
  ).toBe(403);
  const created = await request(app.getHttpServer())
    .post("/finding-agents/connections")
    .set("Origin", "http://localhost:5173")
    .send(scope);
  expect(created.status).toBe(201);
  const history = await request(app.getHttpServer())
    .get("/finding-agents")
    .query(scope);
  expect(history.status).toBe(200);
  expect(history.body.grants).toHaveLength(1);
  expect(JSON.stringify(history.body)).not.toContain(created.body.token);
  expect(JSON.stringify(history.body)).not.toContain("tokenHash");
  expect(
    (
      await rpc(created.body.token, "tools/list").set(
        "Origin",
        "https://evil.test",
      )
    ).status,
  ).toBe(403);
});
it("invalidates delegated access after a role downgrade and rejects mismatched repositories", async () => {
  const { token } = await service.createGrant(owner, scope);
  await fixture.prisma.organizationMembership.updateMany({
    where: { identityId: owner.identityId },
    data: { role: "VIEWER" },
  });
  await expect(service.authenticate(`Bearer ${token}`)).rejects.toThrow();
  await expect(service.createGrant(owner, scope)).rejects.toThrow();
  await fixture.prisma.organizationMembership.updateMany({
    where: { identityId: owner.identityId },
    data: { role: "OWNER" },
  });
  ci.detail.mockResolvedValue({
    finding: { repositoryId: "999", sourceSha: sha },
  });
  await expect(
    service.context(owner, { ...scope, origin: "ci" }),
  ).rejects.toThrow("repository");
});
it("retains immutable external evidence and rejects tampered saved content", async () => {
  const grant = await service.createGrant(owner, scope),
    auth = await service.authenticate(`Bearer ${grant.token}`);
  const row = await service.append(auth, "verification", evidence());
  await fixture.prisma.findingAgentEvidence.update({
    where: { id: row.id },
    data: { content: { changed: true } },
  });
  await expect(service.history(owner, scope)).rejects.toThrow(
    "could not be validated",
  );
});
it("invalidates the connector when the platform account is disabled", async () => {
  const { token } = await service.createGrant(owner, scope);
  await fixture.prisma.membership.updateMany({
    where: { identityId: owner.identityId },
    data: { active: false },
  });
  await expect(service.authenticate(`Bearer ${token}`)).rejects.toThrow(
    "inactive",
  );
});

async function pairCompanion() {
  const companions = app.get(CompanionService),
    verifier = randomBytes(32).toString("base64url");
  const redirect_uri = "http://127.0.0.1:43211/callback",
    resource = companions.resource();
  const begin = await companions.begin({
    client_id: "preflyt-companion",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "s".repeat(43),
    redirect_uri,
    resource,
    name: "Fixture computer",
    agents: ["codex", "claude"],
    repositories: ["fixture/repo"],
  });
  const id = new URL(begin.authorization_url).searchParams.get("companion")!;
  expect((await companions.consent(owner, id)).repositories).toEqual([
    { id: "120", name: "fixture/repo" },
  ]);
  const { redirect } = await companions.approve(owner, {
    id,
    repositories: ["120"],
  });
  const callback = new URL(redirect);
  expect(callback.origin).toBe("http://127.0.0.1:43211");
  expect(callback.searchParams.get("state")).toBe("s".repeat(43));
  expect(callback.searchParams.get("iss")).toBe(resource);
  return {
    companions,
    request: {
      client_id: "preflyt-companion",
      resource,
      grant_type: "authorization_code",
      code: callback.searchParams.get("code"),
      redirect_uri,
      code_verifier: verifier,
    },
  };
}
it("pairs once using PKCE, rejects code replay, rotates refresh tokens and never lists secrets", async () => {
  const { companions, request: grant } = await pairCompanion();
  await expect(
    companions.token({ ...grant, code_verifier: "z".repeat(43) }),
  ).rejects.toThrow();
  await expect(
    companions.token({
      ...grant,
      redirect_uri: "http://127.0.0.1:43212/callback",
    }),
  ).rejects.toThrow();
  await expect(
    companions.token({ ...grant, resource: "https://other.example/api" }),
  ).rejects.toThrow();
  const tokens = await companions.token(grant);
  await expect(companions.token(grant)).rejects.toThrow();
  expect(
    (await companions.native("Bearer " + tokens.access_token)).connection.id,
  ).toBe(tokens.connection_id);
  const list = await companions.list(owner);
  expect(JSON.stringify(list)).not.toMatch(/pfa_|pfr_|accessHash|refreshHash/);
  const next = await companions.token({
    grant_type: "refresh_token",
    client_id: "preflyt-companion",
    resource: companions.resource(),
    refresh_token: tokens.refresh_token,
  });
  await expect(
    companions.native("Bearer " + tokens.access_token),
  ).rejects.toThrow();
  await expect(
    companions.token({
      grant_type: "refresh_token",
      client_id: "preflyt-companion",
      resource: companions.resource(),
      refresh_token: tokens.refresh_token,
    }),
  ).rejects.toThrow();
  await companions.revoke(owner, next.connection_id);
  await expect(
    companions.native("Bearer " + next.access_token),
  ).rejects.toThrow();
});
it("rejects foreign consent scope and unsafe redirects before issuing credentials", async () => {
  const { companions, request: grant } = await pairCompanion();
  const row = await fixture.prisma.companionAuthorization.findFirstOrThrow();
  await expect(
    companions.approve(outsider, { id: row.id, repositories: ["120"] }),
  ).rejects.toThrow();
  const begin = {
    client_id: "preflyt-companion",
    code_challenge_method: "S256",
    code_challenge: "c".repeat(43),
    state: "s".repeat(43),
    resource: companions.resource(),
    name: "test",
    agents: ["codex"],
    repositories: ["fixture/repo"],
  };
  for (const redirect_uri of [
    "https://evil.example/callback",
    "http://localhost:1234/callback",
    "http://127.0.0.1:1234/other",
    "http://127.0.0.1:1234/callback?next=evil",
  ])
    await expect(
      companions.begin({ ...begin, redirect_uri }),
    ).rejects.toThrow();
  await fixture.prisma.companionAuthorization.update({
    where: { id: row.id },
    data: { expiresAt: new Date(0) },
  });
  await expect(companions.token(grant)).rejects.toThrow();
});
it("queues an exact finding, claims once, returns scoped MCP and completes only with evidence", async () => {
  const { companions, request: grant } = await pairCompanion(),
    tokens = await companions.token(grant),
    header = "Bearer " + tokens.access_token;
  const body = {
    scope,
    connectionId: tokens.connection_id,
    agent: "codex",
    mode: "verify",
    requestKey: "fixture-job-0001",
  };
  const job = await companions.enqueue(owner, body);
  expect(await companions.enqueue(owner, body)).toEqual(job);
  await expect(
    companions.enqueue(owner, { ...body, requestKey: "fixture-job-0002" }),
  ).rejects.toThrow();
  await expect(companions.enqueue(outsider, body)).rejects.toThrow();
  const [first, second] = await Promise.all([
    companions.poll(header),
    companions.poll(header),
  ]);
  const claimed = first.job ?? second.job;
  expect([first.job, second.job].filter(Boolean)).toHaveLength(1);
  expect(claimed.sourceSha).toBe(sha);
  expect(claimed.task).toContain("Unsafe command");
  const auth = await service.authenticate("Bearer " + claimed.token);
  expect(auth.scope).toEqual(scope);
  await service.append(auth, "verification", evidence());
  await companions.update(header, { id: job.id, state: "COMPLETED" });
  expect((await companions.jobs(owner, scope))[0].state).toBe("COMPLETED");
  await expect(
    service.authenticate("Bearer " + claimed.token),
  ).rejects.toThrow();
  expect((await service.context(owner, scope)).status).toBe("Needs review");
});
it("cancels and revokes live job access; offline, role loss and abandoned leases fail closed", async () => {
  const { companions, request: grant } = await pairCompanion(),
    tokens = await companions.token(grant),
    header = "Bearer " + tokens.access_token;
  const body = {
    scope,
    connectionId: tokens.connection_id,
    agent: "claude",
    mode: "fix",
    requestKey: "fixture-job-0003",
  };
  const job = await companions.enqueue(owner, body),
    { job: claimed } = await companions.poll(header);
  await companions.cancel(owner, job.id);
  await expect(
    service.authenticate("Bearer " + claimed.token),
  ).rejects.toThrow();
  expect(
    await companions.update(header, { id: job.id, state: "RUNNING" }),
  ).toEqual({ cancelled: true });
  const next = await companions.enqueue(owner, {
      ...body,
      requestKey: "fixture-job-0004",
    }),
    { job: claimed2 } = await companions.poll(header);
  await fixture.prisma.companionJob.update({
    where: { id: next.id },
    data: { leaseUntil: new Date(0) },
  });
  expect((await companions.jobs(owner, scope))[0].state).toBe("FAILED");
  await expect(
    service.authenticate("Bearer " + claimed2.token),
  ).rejects.toThrow();
  await fixture.prisma.companionConnection.update({
    where: { id: tokens.connection_id },
    data: { lastSeenAt: new Date(0) },
  });
  await expect(
    companions.enqueue(owner, { ...body, requestKey: "fixture-job-0005" }),
  ).rejects.toThrow();
  await fixture.prisma.membership.updateMany({
    where: { identityId: owner.identityId },
    data: { active: false },
  });
  await expect(companions.native(header)).rejects.toThrow();
});
it("does not mark a task completed when no verification was submitted, and disconnect cancels its jobs", async () => {
  const { companions, request: grant } = await pairCompanion(),
    tokens = await companions.token(grant),
    header = "Bearer " + tokens.access_token;
  const body = {
    scope,
    connectionId: tokens.connection_id,
    agent: "codex",
    mode: "verify",
    requestKey: "fixture-job-0006",
  };
  const job = await companions.enqueue(owner, body);
  await companions.poll(header);
  expect(
    (await companions.update(header, { id: job.id, state: "COMPLETED" })).state,
  ).toBe("FAILED");
  const next = await companions.enqueue(owner, {
      ...body,
      requestKey: "fixture-job-0007",
    }),
    { job: claimed } = await companions.poll(header);
  await companions.revoke(owner, tokens.connection_id);
  expect((await companions.jobs(owner, scope))[0].state).toBe("CANCELLED");
  await expect(
    service.authenticate("Bearer " + claimed.token),
  ).rejects.toThrow();
});

it("accepts Codex native OAuth registration metadata", async () => {
  const metadata = {
    client_name: "Codex",
    redirect_uris: ["http://127.0.0.1:53493/callback/vlqvVbGvDarh"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "none",
    response_types: ["code"],
    scope: "findings:read findings:review",
    application_type: "native",
  };
  const result = await request(app.getHttpServer())
    .post("/mcp-oauth/register")
    .send(metadata)
    .expect(201);
  expect(result.body.application_type).toBe("native");
  expect(result.body.redirect_uris).toEqual(metadata.redirect_uris);
  expect(result.body.client_id).toEqual(expect.any(String));
  await request(app.getHttpServer())
    .post("/mcp-oauth/register")
    .send({ ...metadata, application_type: "unsupported" })
    .expect(400);
});

async function hostedAuthorization(scopes = "findings:read findings:review") {
  const oauth = app.get(McpOAuthService),
    verifier = randomBytes(32).toString("base64url");
  const registered = await request(app.getHttpServer())
    .post("/mcp-oauth/register")
    .send({
      client_name: "Native MCP fixture",
      redirect_uris: ["http://127.0.0.1:45678/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    })
    .expect(201);
  const q = {
    client_id: registered.body.client_id,
    redirect_uri: "http://127.0.0.1:45678/callback",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "fixture-state-12345678901234567890",
    resource: oauth.resource(),
    scope: scopes,
  };
  const authorize = await request(app.getHttpServer())
    .get("/mcp-oauth/authorize")
    .query(q)
    .expect(302);
  const id = new URL(authorize.headers.location).searchParams.get("oauth");
  const consent = await request(app.getHttpServer())
    .get("/mcp-connections/consent")
    .query({ id })
    .expect(200);
  expect(consent.body.repositories).toContainEqual({
    id: "120",
    name: "fixture/repo",
  });
  expect(consent.body.scopes).toEqual(scopes.split(" "));
  const approved = await request(app.getHttpServer())
    .post("/mcp-connections/approve")
    .set("Origin", "http://localhost:5173")
    .send({ id, repositories: ["120"] })
    .expect(201);
  const callback = new URL(approved.body.redirect);
  expect(callback.searchParams.get("state")).toBe(q.state);
  expect(callback.searchParams.get("iss")).toBe(oauth.issuer());
  const exchange = {
    grant_type: "authorization_code",
    client_id: q.client_id,
    redirect_uri: q.redirect_uri,
    resource: q.resource,
    code: callback.searchParams.get("code"),
    code_verifier: verifier,
  };
  return { oauth, q, id, exchange };
}
it("advertises standard hosted MCP discovery and OAuth challenge without browser credentials", async () => {
  const denied = await request(app.getHttpServer())
    .post("/mcp")
    .send({ jsonrpc: "2.0", id: 1, method: "initialize" })
    .expect(401);
  expect(denied.headers["www-authenticate"]).toContain("resource_metadata=");
  const oauth = app.get(McpOAuthService);
  const resource = await request(app.getHttpServer())
    .get("/.well-known/oauth-protected-resource/api/mcp")
    .expect(200);
  expect(resource.body.resource).toBe(oauth.resource());
  expect(resource.body.authorization_servers).toEqual([oauth.issuer()]);
  const metadata = await request(app.getHttpServer())
    .get("/.well-known/oauth-authorization-server/api/mcp-oauth")
    .expect(200);
  expect(metadata.body.issuer).toBe(oauth.issuer());
  expect(metadata.body.token_endpoint_auth_methods_supported).toEqual(["none"]);
  expect(metadata.body.code_challenge_methods_supported).toEqual(["S256"]);
});
it("binds public-client codes to PKCE, exact callbacks, client and resource; rejects replay", async () => {
  const { oauth, exchange } = await hostedAuthorization();
  for (const override of [
    { code_verifier: "x".repeat(43) },
    { client_id: "other" },
    { resource: "https://evil.example/mcp" },
    { redirect_uri: "http://127.0.0.1:45679/callback" },
  ])
    await request(app.getHttpServer())
      .post("/mcp-oauth/token")
      .type("form")
      .send({ ...exchange, ...override })
      .expect(400);
  const issued = await request(app.getHttpServer())
    .post("/mcp-oauth/token")
    .type("form")
    .send(exchange)
    .expect(200);
  expect(issued.body).toMatchObject({
    token_type: "Bearer",
    expires_in: 900,
    scope: "findings:read findings:review",
  });
  expect(issued.headers["cache-control"]).toBe("no-store");
  await request(app.getHttpServer())
    .post("/mcp-oauth/token")
    .type("form")
    .send(exchange)
    .expect(400);
  const refresh = {
    grant_type: "refresh_token",
    client_id: exchange.client_id,
    resource: oauth.resource(),
    refresh_token: issued.body.refresh_token,
  };
  const rotated = await request(app.getHttpServer())
    .post("/mcp-oauth/token")
    .type("form")
    .send(refresh)
    .expect(200);
  await request(app.getHttpServer())
    .post("/mcp-oauth/token")
    .type("form")
    .send(refresh)
    .expect(400);
  await expect(
    oauth.authenticate("Bearer " + issued.body.access_token),
  ).rejects.toThrow();
  expect(
    (await oauth.authenticate("Bearer " + rotated.body.access_token)).connection
      .clientId,
  ).toBe(exchange.client_id);
  const list = await oauth.list(owner);
  expect(JSON.stringify(list)).not.toMatch(/mca_|mcr_|Hash/);
  await oauth.revokeConnection(owner, list[0].id);
  await expect(
    oauth.authenticate("Bearer " + rotated.body.access_token),
  ).rejects.toThrow();
});
it("reads exact source and appends external evidence over native OAuth without changing finding status", async () => {
  const { oauth, exchange } = await hostedAuthorization(),
    issued = await oauth.exchange(exchange),
    auth = await oauth.authenticate("Bearer " + issued.access_token);
  const tools = await rpc(issued.access_token, "tools/list").expect(200);
  expect(tools.body.result.tools.map((t: any) => t.name)).toContain(
    "preflyt_list_findings",
  );
  expect(
    tools.body.result.tools.find((t: any) => t.name === "preflyt_get_finding")
      .inputSchema.required,
  ).toEqual(["scope"]);
  const read = await rpc(issued.access_token, "tools/call", {
    name: "preflyt_get_finding",
    arguments: { scope },
  }).expect(200);
  expect(read.body.result.isError).toBe(false);
  expect(JSON.parse(read.body.result.content[0].text).finding.sourceSha).toBe(
    sha,
  );
  ci.list.mockResolvedValue({
    total: 1,
    rows: [
      {
        id: scope.findingId,
        origin: scope.origin,
        repositoryId: scope.repositoryId,
        assessmentId: scope.assessmentId,
        sourceSha: sha,
        title: "Unsafe command",
        severity: "medium",
        path: "src/run.ts",
        line: 12,
      },
    ],
  });
  const listed = await oauth.call(auth, "preflyt_list_findings", {
    repositoryId: "120",
  });
  expect(listed.rows[0].scope).toEqual(scope);
  const excerpt = await oauth.call(auth, "preflyt_get_source_context", {
    scope,
  });
  expect(excerpt.lines[0].number).toBe(12);
  await oauth.call(auth, "preflyt_submit_verification", {
    scope,
    ...evidence(),
  });
  expect((await service.history(owner, scope)).evidence).toHaveLength(1);
  expect((await service.context(owner, scope)).status).toBe("Needs review");
  const id = (await oauth.list(owner))[0].id;
  await oauth.revokeConnection(owner, id);
  await expect(
    oauth.authenticate("Bearer " + issued.access_token),
  ).rejects.toThrow();
  const grant = await fixture.prisma.findingAgentGrant.findFirstOrThrow({
    where: { oauthConnectionId: id },
  });
  expect(grant.revokedAt).not.toBeNull();
});
it("enforces OAuth read-only scope, approved repositories and current membership on every call", async () => {
  const { oauth, exchange } = await hostedAuthorization("findings:read"),
    issued = await oauth.exchange(exchange),
    auth = await oauth.authenticate("Bearer " + issued.access_token);
  await expect(
    oauth.call(auth, "preflyt_submit_verification", { scope, ...evidence() }),
  ).rejects.toThrow("read access only");
  await expect(
    oauth.call(auth, "preflyt_get_finding", {
      scope: { ...scope, repositoryId: "999" },
    }),
  ).rejects.toThrow("not approved");
  expect(
    (await oauth.call(auth, "preflyt_list_repositories", {})).repositories,
  ).toEqual([{ id: "120", repository: "fixture/repo" }]);
  await fixture.prisma.membership.updateMany({
    where: { identityId: owner.identityId },
    data: { active: false },
  });
  await expect(
    oauth.authenticate("Bearer " + issued.access_token),
  ).rejects.toThrow();
});
it("rejects unsafe registration, unregistered redirects, missing PKCE, scope escalation and cross-origin consent", async () => {
  for (const redirect of [
    "http://evil.example/callback",
    "file:///tmp/callback",
    "https://trusted.example/callback#fragment",
    "https://user:password@example.com/callback",
  ])
    await request(app.getHttpServer())
      .post("/mcp-oauth/register")
      .send({ redirect_uris: [redirect] })
      .expect(400);
  const { oauth, q, id, exchange } = await hostedAuthorization();
  for (const override of [
    { redirect_uri: "https://evil.example/callback" },
    { code_challenge_method: "plain" },
    { scope: "findings:read admin" },
    { resource: "https://evil.example/mcp" },
  ])
    await request(app.getHttpServer())
      .get("/mcp-oauth/authorize")
      .query({ ...q, ...override })
      .expect(400);
  await request(app.getHttpServer())
    .post("/mcp-connections/approve")
    .set("Origin", "https://evil.example")
    .send({ id, repositories: ["120"] })
    .expect(403);
  await fixture.prisma.mcpOAuthAuthorization.updateMany({
    where: { id },
    data: { expiresAt: new Date(0) },
  });
  await expect(oauth.exchange(exchange)).rejects.toThrow();
});
it("denies without issuing a credential and supports RFC 7009 revocation", async () => {
  const { oauth, q, exchange } = await hostedAuthorization();
  const redirect = await oauth.authorize(q),
    id = new URL(redirect).searchParams.get("oauth")!;
  const denied = await oauth.approve(owner, { id, deny: true });
  expect(new URL(denied.redirect).searchParams.get("error")).toBe(
    "access_denied",
  );
  expect(await fixture.prisma.mcpOAuthConnection.count()).toBe(0);
  const issued = await oauth.exchange(exchange);
  await request(app.getHttpServer())
    .post("/mcp-oauth/revoke")
    .type("form")
    .send({
      client_id: exchange.client_id,
      token: issued.refresh_token,
      token_type_hint: "refresh_token",
    })
    .expect(200);
  await expect(
    oauth.authenticate("Bearer " + issued.access_token),
  ).rejects.toThrow();
});

it("allows native loopback port changes while preserving callback path and code binding", async () => {
  const { oauth, q } = await hostedAuthorization();
  const changed = { ...q, redirect_uri: "http://127.0.0.1:45679/callback" };
  const requestUrl = await oauth.authorize(changed);
  const id = new URL(requestUrl).searchParams.get("oauth")!;
  const approved = await oauth.approve(owner, { id, repositories: ["120"] });
  expect(new URL(approved.redirect).port).toBe("45679");
  await expect(
    oauth.authorize({
      ...q,
      redirect_uri: "http://127.0.0.1:45679/another-path",
    }),
  ).rejects.toThrow();
  await expect(
    oauth.authorize({ ...q, redirect_uri: "http://localhost:45679/callback" }),
  ).rejects.toThrow();
  await expect(
    oauth.authorize({
      ...q,
      redirect_uri: "http://127.0.0.1:45679/callback?next=other",
    }),
  ).rejects.toThrow();
});

it("includes complete hosted MCP scope in the copied task", async () => {
  const task = await service.task(owner, scope);
  expect(task.task).toContain(`MCP scope: ${JSON.stringify(scope)}`);
  expect(task.task).toContain(sha);
  expect(task.task).toContain("scope");
});

it("prepares an authenticated desktop handoff without source text, credentials or agent execution", async () => {
  const result = await request(app.getHttpServer())
    .get("/finding-agents/launch-task")
    .query(scope)
    .expect(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.body.prompt).toContain(`MCP scope: ${JSON.stringify(scope)}`);
  expect(result.body.prompt).toContain(sha);
  expect(result.body.prompt).toContain("preflyt_get_source_context");
  expect(result.body.prompt).not.toContain("return run(input)");
  expect(result.body.prompt).not.toContain("Use a fixed executable.");
  expect(result.body.prompt.length).toBeLessThan(12000);
  expect(source.read).not.toHaveBeenCalled();
  expect(await fixture.prisma.findingAgentGrant.count()).toBe(0);
  await fixture.prisma.gitHubRepository.updateMany({
    data: { selected: false },
  });
  await request(app.getHttpServer())
    .get("/finding-agents/launch-task")
    .query(scope)
    .expect(403);
});
