import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { disposableDatabase } from "./disposable-database.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import {
  FindingAiGuidanceService,
  type FindingAiScope,
} from "../src/findings/finding-ai-guidance.service.js";
import { digest } from "../src/assessments/assessment-digest.js";
import { runPromptInference } from "../src/intelligence/skill-inference.js";
import type { AuthenticatedSession } from "../src/auth/session.guard.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { AuthService } from "../src/auth/auth.service.js";
import { FindingAiGuidanceController } from "../src/findings/finding-ai-guidance.controller.js";

vi.mock("../src/intelligence/skill-inference.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/intelligence/skill-inference.js")
  >()),
  runPromptInference: vi.fn(),
}));
const sha = "a".repeat(40),
  fingerprint = "b".repeat(64);
let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let service: FindingAiGuidanceService,
  owner: AuthenticatedSession,
  outsider: AuthenticatedSession;
let scope: FindingAiScope, repo: { id: string }, model: any;
const source = {
  lines: [
    {
      number: 11,
      text: 'return db.execute(f"SELECT * FROM products WHERE name = {name}")',
    },
  ],
  reason: null,
  truncated: false,
};
const finding = {
  id: fingerprint,
  title: "Use parameterized SQL",
  ruleId: "sql-string-interpolation",
  category: "security",
  path: "catalogue.py",
  line: 11,
  endLine: 11,
  verification: "Verified analyzer receipt",
};

beforeAll(async () => {
  fixture = await disposableDatabase("aiguidance");
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.reset();
  vi.clearAllMocks();
  const db = fixture.prisma;
  const organization = await db.organization.create({
    data: { name: "AI guidance fixture" },
  });
  const identity = await db.identity.create({
    data: { issuer: "fixture", subject: "owner" },
  });
  await db.organizationMembership.create({
    data: {
      organizationId: organization.id,
      identityId: identity.id,
      role: "OWNER",
    },
  });
  owner = {
    authenticated: true,
    identityId: identity.id,
    organizationId: organization.id,
    subject: "owner",
    email: null,
    role: "OWNER",
  };
  const otherOrg = await db.organization.create({ data: { name: "Other" } });
  const otherIdentity = await db.identity.create({
    data: { issuer: "fixture", subject: "other" },
  });
  await db.organizationMembership.create({
    data: {
      organizationId: otherOrg.id,
      identityId: otherIdentity.id,
      role: "OWNER",
    },
  });
  outsider = {
    ...owner,
    identityId: otherIdentity.id,
    organizationId: otherOrg.id,
    subject: "other",
  };
  await db.gitHubInstallation.create({
    data: {
      id: 112n,
      connectedById: identity.id,
      organizationId: organization.id,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
    },
  });
  repo = await db.gitHubRepository.create({
    data: {
      githubId: 113n,
      installationId: 112n,
      name: "repo",
      fullName: "fixture/repo",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
      available: true,
      defaultBranch: "main",
    },
  });
  scope = {
    origin: "ci",
    repositoryId: "113",
    assessmentId: "assessment-1",
    findingId: fingerprint,
  };
  model = {
    route: { id: "route-1", revision: 1 },
    providers: [
      {
        id: "provider-1",
        revision: 1,
        name: "Test provider",
        modelId: "test-model",
        endpoint: {
          id: "test",
          name: "Test",
          baseUrl: "https://api.example.com",
          locality: "hosted",
          requiresKey: true,
          models: ["test-model"],
        },
      },
    ],
  };
  const access = new AuthorizationService(db);
  service = new FindingAiGuidanceService(
    db,
    access,
    {} as any,
    {} as any,
    { read: vi.fn().mockResolvedValue(source) } as any,
    {} as any,
  );
  vi.spyOn(service as any, "resolve").mockImplementation(
    async (session: AuthenticatedSession) => {
      await access.requireRepository(
        session,
        scope.repositoryId,
        "assessment.read",
      );
      return { repo, finding, sourceSha: sha };
    },
  );
  vi.spyOn(service as any, "model").mockImplementation(async () => model);
  vi.mocked(runPromptInference).mockImplementation(
    async (_provider, prompt, _limit, _signal, validate) => {
      const supplied = JSON.parse(prompt.user);
      return validate(
        JSON.stringify({
          version: 1,
          sourceSha: sha,
          contextHash: digest({
            version: supplied.version,
            sourceSha: supplied.sourceSha,
            finding: supplied.finding,
            lines: supplied.lines,
            truncated: supplied.truncated,
          }),
          problem: "Input is inserted into SQL text.",
          impact:
            "An input containing SQL syntax may change the query results.",
          solution: "Pass the value separately with a parameter placeholder.",
          evidenceLines: [11],
        }),
      );
    },
  );
});

it("falls back when AI is not configured and does not create a guidance row", async () => {
  model = null;
  expect(await service.get(owner, scope)).toMatchObject({
    available: false,
    state: "UNAVAILABLE",
  });
  expect(await fixture.prisma.aiFindingGuidance.count()).toBe(0);
});

it("queues once, saves assessed-commit AI guidance, reuses the cache, and invalidates it on route revision", async () => {
  expect(await service.get(owner, scope)).toMatchObject({
    available: true,
    state: "NONE",
  });
  const first = await service.request(owner, scope);
  const same = await service.request(owner, scope);
  expect(first).toMatchObject({ state: "QUEUED" });
  expect(same).toMatchObject({ state: "QUEUED" });
  expect(await fixture.prisma.aiFindingGuidance.count()).toBe(1);
  await service.reconcile();
  const saved = await service.get(owner, scope);
  expect(saved).toMatchObject({
    state: "SUCCEEDED",
    result: {
      sourceSha: sha,
      problem: "Input is inserted into SQL text.",
      evidenceLines: [11],
    },
  });
  expect(await service.request(owner, scope)).toMatchObject({
    state: "SUCCEEDED",
  });
  expect(runPromptInference).toHaveBeenCalledTimes(1);
  model = { ...model, route: { ...model.route, revision: 2 } };
  expect(await service.get(owner, scope)).toMatchObject({ state: "NONE" });
  expect(await fixture.prisma.aiFindingGuidance.count()).toBe(1);
});

it("denies another organization and stops queued work after repository access is revoked", async () => {
  await expect(service.get(outsider, scope)).rejects.toThrow();
  await expect(service.request(outsider, scope)).rejects.toThrow();
  await service.request(owner, scope);
  await fixture.prisma.gitHubRepository.update({
    where: { id: repo.id },
    data: { selected: false },
  });
  await expect(service.get(owner, scope)).rejects.toThrow();
  await service.reconcile();
  expect(runPromptInference).not.toHaveBeenCalled();
  expect(
    (await fixture.prisma.aiFindingGuidance.findFirstOrThrow()).state,
  ).toBe("FAILED");
});

it("requires a session, scoped access, CSRF origin and a strict finding scope over HTTP", async () => {
  const app = await NestFactory.create(
    {
      module: class TestFindingGuidanceModule {},
      controllers: [FindingAiGuidanceController],
      providers: [
        SessionGuard,
        {
          provide: AuthorizationService,
          useValue: new AuthorizationService(fixture.prisma),
        },
        { provide: FindingAiGuidanceService, useFactory: () => service },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "finding.sid",
            currentSession: async (token: string) =>
              (({ owner, outsider }) as Record<string, AuthenticatedSession>)[
                token
              ] ?? { authenticated: false },
            assertOrigin: (origin: string) => {
              if (origin !== "http://localhost:5173")
                throw new ForbiddenException();
            },
          },
        },
      ],
    },
    { logger: false },
  );
  app.use(cookieParser());
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server).get("/finding-guidance").query(scope).expect(401);
    await request(server)
      .get("/finding-guidance")
      .query(scope)
      .set("Cookie", "finding.sid=outsider")
      .expect(403);
    const read = await request(server)
      .get("/finding-guidance")
      .query(scope)
      .set("Cookie", "finding.sid=owner")
      .expect(200);
    expect(read.headers["cache-control"]).toBe("no-store");
    expect(read.body).toMatchObject({ available: true, state: "NONE" });
    const post = (body: object, origin = "http://localhost:5173") =>
      request(server)
        .post("/finding-guidance")
        .set("Cookie", "finding.sid=owner")
        .set("Origin", origin)
        .send(body);
    await post(scope, "https://wrong.example").expect(403);
    await post({ ...scope, source: "untrusted code" }).expect(400);
    await post({ ...scope, findingId: "bad" }).expect(400);
    const queued = await post(scope).expect(201);
    expect(queued.body).toMatchObject({ available: true, state: "QUEUED" });
    expect(queued.headers["cache-control"]).toBe("no-store");
  } finally {
    await app.close();
  }
});
