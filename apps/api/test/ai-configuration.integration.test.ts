import { prReviewSource } from "../src/intelligence/pr-review-context.js";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
import { composeGatePolicy } from "../src/assessments/gate-policy.service.js";
import { catalogue, packDigest } from "../src/standards/catalogue.js";
import { ReviewSkillsService } from "../src/intelligence/review-skills.service.js";
import { SkillReviewService } from "../src/intelligence/skill-review.service.js";
import {
  ReviewSkillsController,
  SkillReviewController,
} from "../src/intelligence/review-skills.controller.js";
import { AssessmentService } from "../src/assessments/assessment.service.js";
import { digest } from "../src/assessments/assessment-digest.js";
import { previewGate } from "../src/assessments/gate-preview.js";
import {
  skillTemplates,
  validateSkill,
} from "../src/intelligence/review-skills.js";
import "reflect-metadata";
import { randomUUID, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { NestFactory } from "@nestjs/core";
import {
  ForbiddenException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import cookieParser from "cookie-parser";
import http from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../src/auth/session.guard.js";
import { AiConfigurationController } from "../src/intelligence/ai-configuration.controller.js";
import { AiConfigurationService } from "../src/intelligence/ai-configuration.service.js";
let db: PrismaService,
  admin: Client,
  created = false,
  app: INestApplication,
  owner: AuthenticatedSession,
  developer: AuthenticatedSession,
  auditor: AuthenticatedSession,
  outsider: AuthenticatedSession,
  service: AiConfigurationService;
const name = "preflyt_ai_test_" + randomUUID().replaceAll("-", "");
const endpoint = {
  id: "reviewed",
  name: "Reviewed gateway",
  baseUrl: "https://gateway.example.invalid/v1",
  locality: "hosted",
  requiresKey: true,
  models: ["model-a", "model-b"],
};
const input = {
  name: "Primary",
  baseUrl: endpoint.baseUrl,
  locality: "hosted" as const,
  requiresKey: true,
  modelId: "model-a",
  enabled: true,
  apiKey: "fixture-key",
  expectedRevision: 0,
};
const route = (primaryId: string | null, patch: object = {}) => ({
  primaryId,
  fallbackId: null,
  enabled: true,
  allowSource: false,
  expectedRevision: 0,
  ...patch,
});
const root = "/ai/configuration";
const post = (actor: AuthenticatedSession, path: string, body: unknown) =>
  http(app.getHttpServer())
    .post(root + path)
    .set("Cookie", `ai.sid=${actor.identityId}`)
    .set("Origin", "http://localhost:5173")
    .send(body);
const get = (actor = owner) =>
  http(app.getHttpServer())
    .get(root)
    .set("Cookie", `ai.sid=${actor.identityId}`);
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../src/intelligence/ai-http.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/intelligence/ai-http.js")>()),
  aiHttpRequest: fetchMock,
}));
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Local disposable database required");
  admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = "/" + name;
  const sql = new Client({ connectionString: url.toString() });
  await sql.connect();
  try {
    for (const entry of (await readdir("prisma/migrations"))
      .filter((n) => /^\d/.test(n))
      .sort())
      await sql.query(
        await readFile(`prisma/migrations/${entry}/migration.sql`, "utf8"),
      );
  } finally {
    await sql.end();
  }
  vi.stubEnv("DATABASE_URL", url.toString());
  db = new PrismaService();
  await db.$connect();
  const access = new AuthorizationService(db);
  service = new AiConfigurationService(db, access);
  app = await NestFactory.create(
    {
      module: class AiTest {},
      controllers: [
        AiConfigurationController,
        ReviewSkillsController,
        SkillReviewController,
      ],
      providers: [
        SessionGuard,
        ReviewSkillsService,
        SkillReviewService,
        AssessmentService,
        { provide: PrismaService, useValue: db },
        { provide: AiConfigurationService, useValue: service },
        { provide: AuthorizationService, useValue: access },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "ai.sid",
            assertOrigin: (origin: string) => {
              if (origin !== "http://localhost:5173")
                throw new ForbiddenException("Invalid origin");
            },
            currentSession: async (id?: string) =>
              [owner, developer, auditor, outsider].find(
                (a) => a?.identityId === id,
              ) ?? { authenticated: false },
          },
        },
      ],
    },
    { logger: false },
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  // Each worker selects globally; isolate inference and publication mocks
  // from earlier fixtures. This database is disposable.
  await db.aiSkillReview.deleteMany();
  await db.repositoryPullRequest.deleteMany();
  vi.stubEnv("AI_CONFIGURATION_ENABLED", "true");
  vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }),
      ),
  );
  const org = (
    await db.organization.create({
      data: { name: "AI fixture " + randomUUID() },
    })
  ).id;
  const make = async (
    role: "OWNER" | "DEVELOPER" | "AUDITOR",
    organizationId = org,
  ) => {
    const subject = randomUUID(),
      identity = await db.identity.create({
        data: { issuer: "fixture", subject },
      });
    await db.organizationMembership.create({
      data: { identityId: identity.id, organizationId, role },
    });
    return {
      authenticated: true as const,
      identityId: identity.id,
      subject,
      email: null,
      role,
      organizationId,
    };
  };
  owner = await make("OWNER");
  developer = await make("DEVELOPER");
  auditor = await make("AUDITOR");
  outsider = await make(
    "OWNER",
    (await db.organization.create({ data: { name: "Other " + randomUUID() } }))
      .id,
  );
});
const connected = async () => {
  const p = (await post(owner, "/providers", input).expect(201)).body;
  await post(owner, `/providers/${p.id}/test`, {}).expect(201);
  return p;
};
it("encrypts keys and never returns them or writes them into audit metadata", async () => {
  const p = (await post(owner, "/providers", input).expect(201)).body;
  expect(p.apiKeySet).toBe(true);
  expect(p).not.toHaveProperty("encryptedCredential");
  expect(p).not.toHaveProperty("credentialEndpointDigest");
  const stored = await db.aiProviderConnection.findUniqueOrThrow({
    where: { id: p.id },
  });
  expect(stored.encryptedCredential).not.toContain("fixture-key");
  expect(JSON.stringify((await get().expect(200)).body)).not.toContain(
    "fixture-key",
  );
  expect(
    JSON.stringify(
      await db.auditEvent.findMany({ where: { actorId: owner.identityId } }),
    ),
  ).not.toContain("fixture-key");
});
it("creates and edits models and routes without prices or budgets and hides retained legacy fields", async () => {
  const provider = await connected();
  expect(provider).not.toHaveProperty("inputPriceCentsPerMillion");
  expect(provider).not.toHaveProperty("outputPriceCentsPerMillion");
  await db.aiProviderConnection.update({
    where: { id: provider.id },
    data: { inputPriceCentsPerMillion: 200, outputPriceCentsPerMillion: 800 },
  });
  const edited = (
    await post(owner, `/providers/${provider.id}`, {
      ...input,
      expectedRevision: provider.revision,
    }).expect(201)
  ).body;
  expect(edited).not.toHaveProperty("inputPriceCentsPerMillion");
  expect(edited).not.toHaveProperty("outputPriceCentsPerMillion");
  await post(owner, `/providers/${provider.id}/test`, {}).expect(201);
  const saved = (
    await post(owner, "/routes/repository", route(provider.id)).expect(201)
  ).body;
  for (const key of ["maxInputTokens", "maxOutputTokens", "dailyBudgetCents"])
    expect(saved).not.toHaveProperty(key);
  await db.aiStageRoute.update({
    where: { id: saved.id },
    data: { maxInputTokens: 100, maxOutputTokens: 128, dailyBudgetCents: 1 },
  });
  const listed = (await get().expect(200)).body;
  for (const key of ["inputPriceCentsPerMillion", "outputPriceCentsPerMillion"])
    expect(listed.providers[0]).not.toHaveProperty(key);
  for (const key of ["maxInputTokens", "maxOutputTokens", "dailyBudgetCents"])
    expect(listed.routes[0]).not.toHaveProperty(key);
  const preview = (
    await post(owner, "/preview", {
      stage: "repository",
      containsSource: false,
    }).expect(201)
  ).body;
  expect(preview.reason).toBe("CONFIGURATION_READY");
  expect(preview).not.toHaveProperty("maxOutputTokens");
  expect(preview).not.toHaveProperty("dailyBudgetCents");
});
it("enforces role, session, origin and strict DTO boundaries", async () => {
  await get(auditor).expect(200);
  await get(developer).expect(403);
  await post(developer, "/providers", input).expect(403);
  await post(auditor, "/providers", input).expect(403);
  await http(app.getHttpServer()).get(root).expect(401);
  await http(app.getHttpServer())
    .post(root + "/providers")
    .set("Cookie", `ai.sid=${owner.identityId}`)
    .set("Origin", "https://attacker.invalid")
    .send(input)
    .expect(403);
  await post(owner, "/providers", {
    ...input,
    shellCommand: "arbitrary",
  }).expect(400);
  await post(
    owner,
    "/routes/pull_request",
    route(null, { dailyBudgetCents: 5001 }),
  ).expect(400);
});
it("isolates provider reads, tests, edits and route choices by organization", async () => {
  const p = await connected();
  expect((await get(outsider).expect(200)).body.providers).toEqual([]);
  await post(outsider, `/providers/${p.id}/test`, {}).expect(404);
  await post(outsider, `/providers/${p.id}`, {
    ...input,
    expectedRevision: 1,
  }).expect(409);
  await post(outsider, "/routes/pull_request", route(p.id)).expect(400);
});
it("rejects stale edits and invalidates connection tests after edits", async () => {
  const p = await connected();
  await post(owner, `/providers/${p.id}`, input).expect(409);
  const updated = (
    await post(owner, `/providers/${p.id}`, {
      ...input,
      apiKey: undefined,
      expectedRevision: 1,
      modelId: "model-b",
    }).expect(201)
  ).body;
  expect(updated.revision).toBe(2);
  expect(updated.testStatus).toBe("NOT_TESTED");
  expect(updated.apiKeySet).toBe(true);
  await post(owner, "/routes/pull_request", route(p.id)).expect(400);
});
it("requires a new key for an endpoint change and never sends the saved key there", async () => {
  const p = await connected();
  fetchMock.mockClear();
  await post(owner, `/providers/${p.id}`, {
    ...input,
    apiKey: undefined,
    baseUrl: "https://changed.example.invalid/v1",
    expectedRevision: 1,
  }).expect(400);
  expect(fetchMock).not.toHaveBeenCalled();
  const previous = await db.aiProviderConnection.findUniqueOrThrow({
    where: { id: p.id },
  });
  await db.aiProviderConnection.update({
    where: { id: p.id },
    data: {
      endpoint: {
        ...(previous.endpoint as object),
        baseUrl: "https://changed.example.invalid/v1",
      },
    },
  });
  await post(owner, `/providers/${p.id}/test`, {}).expect(409);
  expect(fetchMock).not.toHaveBeenCalled();
  await post(owner, `/providers/${p.id}`, {
    ...input,
    baseUrl: "https://changed.example.invalid/v1",
    expectedRevision: 1,
  }).expect(201);
});

it("requires ready connections and previews source-sharing and disabled routes without inference", async () => {
  const p = await connected();
  await post(owner, "/routes/pull_request", route(p.id)).expect(201);
  for (const [patch, reason] of [
    [{}, "CONFIGURATION_READY"],
    [{ containsSource: true }, "SOURCE_SHARING_DISABLED"],
  ] as const) {
    const response = await post(owner, "/preview", {
      stage: "pull_request",
      containsSource: false,
      ...patch,
    }).expect(201);
    expect(response.body.reason).toBe(reason);
    expect(response.body.executionAvailable).toBe(false);
  }
  await post(owner, "/routes/pull_request", route(p.id)).expect(409);
  await post(
    owner,
    "/routes/pull_request",
    route(p.id, { enabled: false, expectedRevision: 1 }),
  ).expect(201);
  expect(
    (
      await post(owner, "/preview", {
        stage: "pull_request",
        containsSource: false,
      }).expect(201)
    ).body.reason,
  ).toBe("ROUTE_DISABLED");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("uses a tested fallback without a daily re-test requirement when the primary becomes unavailable", async () => {
  const p = await connected(),
    f = (
      await post(owner, "/providers", { ...input, name: "Fallback" }).expect(
        201,
      )
    ).body;
  await post(owner, `/providers/${f.id}/test`, {}).expect(201);
  await post(
    owner,
    "/routes/pull_request",
    route(p.id, { fallbackId: f.id }),
  ).expect(201);
  await db.aiProviderConnection.update({
    where: { id: p.id },
    data: { enabled: false },
  });
  expect(
    (
      await post(owner, "/preview", {
        stage: "pull_request",
        containsSource: false,
      }).expect(201)
    ).body.providerId,
  ).toBe(f.id);
  await db.aiProviderConnection.update({
    where: { id: f.id },
    data: { testedAt: new Date(Date.now() - 86400001) },
  });
  expect(
    (
      await post(owner, "/preview", {
        stage: "pull_request",
        containsSource: false,
      }).expect(201)
    ).body.reason,
  ).toBe("CONFIGURATION_READY");
});
it("redacts provider failures and detects endpoint removal during a test", async () => {
  const p = (await post(owner, "/providers", input).expect(201)).body;
  fetchMock.mockImplementationOnce(
    async () => new Response("secret upstream", { status: 401 }),
  );
  expect(
    (await post(owner, `/providers/${p.id}/test`, {}).expect(201)).body.status,
  ).toBe("AUTH_REJECTED");
  fetchMock.mockImplementationOnce(async () => {
    await db.aiProviderConnection.update({
      where: { id: p.id },
      data: { endpoint: {} },
    });
    return new Response(JSON.stringify({ data: [{ id: "model-a" }] }));
  });
  await post(owner, `/providers/${p.id}/test`, {}).expect(409);
});
it("rechecks authorization after upstream responses before storing success", async () => {
  const p = (await post(owner, "/providers", input).expect(201)).body;
  fetchMock.mockImplementationOnce(async () => {
    await db.organizationMembership.updateMany({
      where: { identityId: owner.identityId },
      data: { active: false },
    });
    return new Response(JSON.stringify({ data: [{ id: "model-a" }] }));
  });
  await post(owner, `/providers/${p.id}/test`, {}).expect(403);
  expect(
    (await db.aiProviderConnection.findUniqueOrThrow({ where: { id: p.id } }))
      .testStatus,
  ).toBe("NOT_TESTED");
});
it("keeps deployment-disabled AI unavailable without provider network calls", async () => {
  vi.stubEnv("AI_CONFIGURATION_ENABLED", "false");
  const result = (await get().expect(200)).body;
  expect(result.enabled).toBe(false);
  expect(result.providers).toEqual([]);
  await post(owner, "/providers", input).expect(503);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not store success over a concurrent provider edit", async () => {
  const p = (await post(owner, "/providers", input).expect(201)).body;
  fetchMock.mockImplementationOnce(async () => {
    await db.aiProviderConnection.update({
      where: { id: p.id },
      data: { revision: 2, testStatus: "NOT_TESTED" },
    });
    return new Response(JSON.stringify({ data: [{ id: "model-a" }] }));
  });
  await post(owner, `/providers/${p.id}/test`, {}).expect(409);
  expect(
    (await db.aiProviderConnection.findUniqueOrThrow({ where: { id: p.id } }))
      .testedAt,
  ).toBeNull();
});
it("bounds organization-wide connectivity testing before making another request", async () => {
  const p = (await post(owner, "/providers", input).expect(201)).body;
  for (let i = 0; i < 12; i++)
    await post(owner, `/providers/${p.id}/test`, {}).expect(201);
  await post(owner, `/providers/${p.id}/test`, {}).expect(429);
  expect(fetchMock).toHaveBeenCalledTimes(12);
});
it("protects AI configuration from accidental organization deletion", async () => {
  await post(owner, "/providers", input).expect(201);
  await expect(
    db.organization.delete({ where: { id: owner.organizationId! } }),
  ).rejects.toThrow();
  expect(
    await db.aiProviderConnection.count({
      where: { organizationId: owner.organizationId! },
    }),
  ).toBe(1);
});

it("approves a model created by an organization admin without deployment endpoint configuration", async () => {
  const model = (await post(owner, "/providers", input).expect(201)).body;
  expect(model.approved).toBe(true);
  expect(model.endpoint.baseUrl).toBe(input.baseUrl);
  expect(model.testStatus).toBe("NOT_TESTED");
  const saved = await db.auditEvent.findFirst({
    where: { actorId: owner.identityId, event: "ai.model.approved" },
  });
  expect(saved).not.toBeNull();
  const bad = { ...input, baseUrl: "https://169.254.169.254/latest" };
  await post(owner, "/providers", bad).expect(400);
});
it("creates a keyless self-hosted model only through admin approval", async () => {
  const p = (
    await post(owner, "/providers", {
      ...input,
      baseUrl: "http://model-server:4000/v1",
      locality: "local",
      requiresKey: false,
      apiKey: undefined,
      enabled: false,
    }).expect(201)
  ).body;
  expect(p.approved).toBe(true);
  expect(p.apiKeySet).toBe(false);
  expect(p.enabled).toBe(false);
  await post(developer, "/providers", {
    ...input,
    baseUrl: "http://model-server:4000/v1",
    locality: "local",
    requiresKey: false,
    apiKey: undefined,
  }).expect(403);
});

it("lists inactive built-ins without creating records or making network requests", async () => {
  const response = await get().expect(200);
  expect(response.body.presets.map((p: { id: string }) => p.id)).toEqual([
    "openai",
    "anthropic",
    "gemini",
    "deepseek",
  ]);
  expect(response.body.providers).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("resolves built-in endpoints on the server and requires keys before activation", async () => {
  const body = {
    ...input,
    preset: "gemini",
    name: "Overridden",
    baseUrl: "https://other.example/v1",
    requiresKey: false,
    modelId: "gemini-example",
  };
  const { apiKey, ...withoutKey } = body;
  await post(owner, "/providers", withoutKey).expect(400);
  const response = await post(owner, "/providers", body).expect(201);
  expect(response.body.name).toBe("Google (Gemini)");
  expect(response.body.endpoint).toMatchObject({
    preset: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresKey: true,
    locality: "hosted",
  });
  expect(response.body.apiKeySet).toBe(true);
  expect(response.body.testStatus).toBe("NOT_TESTED");
  expect(JSON.stringify(response.body)).not.toContain("fixture-key");
  await post(owner, "/providers", { ...body, preset: "unknown" }).expect(400);
});
const skillPost = (actor: AuthenticatedSession, path: string, body: unknown) =>
  http(app.getHttpServer())
    .post("/ai/skills" + path)
    .set("Cookie", `ai.sid=${actor.identityId}`)
    .set("Origin", "http://localhost:5173")
    .send(body);
const skillInput = () => ({
  ...validateSkill(skillTemplates[0]!),
  expectedVersion: 0,
});
const approvedSkill = async (selectors: object = {}) => {
  const skill = (
    await skillPost(owner, "", { ...skillInput(), ...selectors }).expect(201)
  ).body;
  await skillPost(owner, `/${skill.id}/approve`, {
    expectedDigest: skill.contentDigest,
    reviewed: true,
  }).expect(201);
  await skillPost(owner, `/${skill.id}/enable`, {
    expectedDigest: skill.contentDigest,
    reviewed: false,
  }).expect(201);
  return skill;
};
it("keeps versions immutable and requires reviewed approval before enablement", async () => {
  const skill = (await skillPost(owner, "", skillInput()).expect(201)).body;
  await skillPost(developer, "", skillInput()).expect(403);
  await skillPost(owner, `/${skill.id}/enable`, {
    expectedDigest: skill.contentDigest,
    reviewed: false,
  }).expect(400);
  await skillPost(owner, `/${skill.id}/approve`, {
    expectedDigest: skill.contentDigest,
    reviewed: false,
  }).expect(400);
  await skillPost(owner, `/${skill.id}/approve`, {
    expectedDigest: "0".repeat(64),
    reviewed: true,
  }).expect(409);
  await skillPost(outsider, `/${skill.id}/approve`, {
    expectedDigest: skill.contentDigest,
    reviewed: true,
  }).expect(404);
  await skillPost(owner, `/${skill.id}/approve`, {
    expectedDigest: skill.contentDigest,
    reviewed: true,
  }).expect(201);
  const v2 = (
    await skillPost(owner, "", {
      ...skillInput(),
      instructions: "Changed review instructions",
      skillKey: skill.skillKey,
      expectedVersion: 1,
    }).expect(201)
  ).body;
  expect(v2.version).toBe(2);
  expect(v2.status).toBe("DRAFT");
  expect(v2.enabled).toBe(false);
  expect(
    (await db.aiReviewSkill.findUniqueOrThrow({ where: { id: skill.id } }))
      .instructions,
  ).toBe(skill.instructions);
  await skillPost(owner, "", {
    ...skillInput(),
    skillKey: skill.skillKey,
    expectedVersion: 1,
  }).expect(409);
  await skillPost(owner, "", {
    ...skillInput(),
    shellCommand: "arbitrary",
  }).expect(400);
});
let repoCounter = 88000000;
async function reviewFixture(selectors: object = {}) {
  vi.stubEnv("AI_REVIEWS_ENABLED", "true");
  const id = BigInt(++repoCounter);
  await db.gitHubInstallation.create({
    data: {
      id,
      organizationId: owner.organizationId!,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
      connectedById: owner.identityId,
    },
  });
  const repo = await db.gitHubRepository.create({
    data: {
      githubId: id,
      installationId: id,
      ownerLogin: "fixture",
      name: "review",
      fullName: "fixture/review",
      selected: true,
      isPrivate: true,
    },
  });
  const skill = await approvedSkill(selectors);
  const check = {
    id: `ai-review-${randomUUID()}`,
    title: "Security evidence check",
    kind: "AI_REVIEW" as const,
    mode: "ADVISORY" as const,
    skillId: skill.id,
    skillVersion: skill.version,
    skillDigest: skill.contentDigest,
    stages: ["repository" as const],
  };
  const { digest: ignored, ...builtIn } = catalogue[0]!;
  const definition = {
    ...builtIn,
    id: `org-standard-${randomUUID()}`,
    owner: "Organization",
    version: "1.0.1",
    changelog: ["Organization-managed version."],
    aiChecks: [check],
  };
  const frozenPack = { ...definition, digest: packDigest(definition) };
  const sourceSha = "a".repeat(40),
    request = { sourceSha, subjectKind: "COMMIT" },
    plan = {
      version: 1,
      sourceSha,
      packs: [frozenPack],
      mode: "INGEST_ONLY",
      stage: "ci",
      enforcement: "observe",
      checks: [{ id: "security.secret", required: true }],
    },
    report = {
      version: 1,
      sourceSha,
      collectionTruncated: false,
      validationCollectionTruncated: false,
      checks: [
        {
          ruleId: "security.secret",
          required: true,
          coverage: "MISSING",
          freshness: "UNKNOWN",
          providerResult: null,
        },
      ],
      observations: [],
    };
  const assessment = await db.commitAssessment.create({
    data: {
      repositoryId: repo.id,
      sourceSha,
      selectionId: "fixture",
      requestKey: randomUUID(),
      inputHash: "f".repeat(64),
      request,
      plan,
      report,
      assessmentHash: digest({ request, plan, report }),
    },
  });
  const provider = (await post(owner, "/providers", input).expect(201)).body;
  await post(owner, `/providers/${provider.id}/test`, {}).expect(201);
  await post(owner, "/routes/repository", route(provider.id)).expect(201);
  const base = `/github/repositories/${id}/ai-reviews`,
    reviews = app.get(SkillReviewService);
  const call = (path: string, body: object, actor = owner) =>
    http(app.getHttpServer())
      .post(base + path)
      .set("Cookie", `ai.sid=${actor.identityId}`)
      .set("Origin", "http://localhost:5173")
      .send(body);
  const infer = () =>
    fetchMock.mockImplementation(
      async (_url: URL, _locality: string, opts: { body?: string }) => {
        if (!opts.body)
          return new Response(JSON.stringify({ data: [{ id: "model-a" }] }));
        const body = JSON.parse(opts.body),
          data = JSON.parse(body.messages[1].content);
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    assessmentHash: data.DATA.assessmentHash,
                    sourceSha: data.DATA.sourceSha,
                    findings: [
                      {
                        checkId: data.SKILLS[0].id,
                        evidenceRefs: ["check:0"],
                        summary: "Security scan evidence is missing.",
                        severity: "medium",
                        impact: "Unscanned changes may contain security defects that the supplied evidence cannot identify.",
                        recommendation:
                          "Collect a verified scan for this commit.",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      },
    );
  return {
    repo,
    assessment,
    provider,
    skill,
    check,
    reviews,
    call,
    infer,
    base,
  };
}
it("runs pinned advisory skills without changing the exact deterministic gate and deduplicates requests", async () => {
  const f = await reviewFixture(),
    before = previewGate(f.assessment);
  const first = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  const duplicate = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  expect(first.id).toBe(duplicate.id);
  f.infer();
  await f.reviews.reconcile();
  const result = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: first.id },
  });
  expect(result.state).toBe("SUCCEEDED");
  expect(JSON.stringify(result.result)).toContain("INFERRED");
  expect(
    previewGate(
      await db.commitAssessment.findUniqueOrThrow({
        where: { id: f.assessment.id },
      }),
    ),
  ).toEqual(before);
  expect(fetchMock.mock.lastCall![2].body).not.toContain("fixture-key");
  await f
    .call(
      "",
      { assessmentId: f.assessment.id, checkIds: [f.check.id] },
      outsider,
    )
    .expect(403);
});
it("enforces repository assignment and admits reviews without configured prices or budget reservations", async () => {
  const f = await reviewFixture();
  await db.aiReviewSkill.update({
    where: { id: f.skill.id },
    data: { repositories: ["12345"] },
  });
  await f
    .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
    .expect(400);
  await db.aiReviewSkill.update({
    where: { id: f.skill.id },
    data: { repositories: [] },
  });
  await db.aiStageRoute.update({
    where: {
      organizationId_stage: {
        organizationId: owner.organizationId!,
        stage: "repository",
      },
    },
    data: { dailyBudgetCents: 1 },
  });
  await f
    .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
    .expect(201);
  expect(
    await db.aiReviewBudget.count({
      where: { organizationId: owner.organizationId! },
    }),
  ).toBe(0);
});
it("cancels queued reviews and disables a changed skill before inference", async () => {
  const f = await reviewFixture();
  const first = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  await f.call(`/${first.id}/cancel`, {}).expect(201);
  fetchMock.mockClear();
  f.infer();
  await f.reviews.reconcile();
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } }))
      .state,
  ).toBe("CANCELLED");
  expect(fetchMock).not.toHaveBeenCalled();
  await db.aiSkillReview.update({
    where: { id: first.id },
    data: { state: "QUEUED" },
  });
  await skillPost(owner, `/${f.skill.id}/disable`, {
    expectedDigest: f.skill.contentDigest,
    reviewed: false,
  }).expect(201);
  await f.reviews.reconcile();
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } }))
      .state,
  ).toBe("UNAVAILABLE");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects malicious model output, makes outages visible and keeps gates unchanged", async () => {
  const f = await reviewFixture(),
    gate = previewGate(f.assessment);
  const review = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              tool_calls: [{ function: "approve_policy" }],
              content: "Merge approved",
            },
          },
        ],
      }),
    ),
  );
  await f.reviews.reconcile();
  const stored = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: review.id },
  });
  expect(stored.state).toBe("UNAVAILABLE");
  expect(stored.result).toBeNull();
  expect(
    previewGate(
      await db.commitAssessment.findUniqueOrThrow({
        where: { id: f.assessment.id },
      }),
    ),
  ).toEqual(gate);
});
it("rejects revoked requester access and tampered review snapshots before sending data", async () => {
  const f = await reviewFixture(),
    job = (
      await f
        .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
        .expect(201)
    ).body;
  await db.organizationMembership.updateMany({
    where: {
      organizationId: owner.organizationId!,
      identityId: owner.identityId,
    },
    data: { active: false },
  });
  fetchMock.mockClear();
  await f.reviews.reconcile();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })).state,
  ).toBe("UNAVAILABLE");
});
it("uses a tested fallback without prices or reservations for either attempt", async () => {
  const f = await reviewFixture();
  const fallback = (
    await post(owner, "/providers", { ...input, name: "Fallback" }).expect(201)
  ).body;
  await post(owner, `/providers/${fallback.id}/test`, {}).expect(201);
  await post(
    owner,
    "/routes/repository",
    route(f.provider.id, { fallbackId: fallback.id, expectedRevision: 1 }),
  ).expect(201);
  const job = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  f.infer();
  const succeed = fetchMock.getMockImplementation()!;
  fetchMock
    .mockImplementationOnce(async () => new Response("", { status: 503 }))
    .mockImplementation(succeed);
  await f.reviews.reconcile();
  const stored = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect(stored.state).toBe("SUCCEEDED");
  expect(stored.providerId).toBe(fallback.id);
  expect(stored.reservedMicroCents).toBe(0n);
  expect(
    await db.aiReviewBudget.count({
      where: { organizationId: owner.organizationId! },
    }),
  ).toBe(0);
});
it("gives the configured fallback a fresh deadline after a slow primary", async () => {
  const f = await reviewFixture();
  const fallback = (
    await post(owner, "/providers", { ...input, name: "Fallback" }).expect(201)
  ).body;
  await post(owner, `/providers/${fallback.id}/test`, {}).expect(201);
  await post(
    owner,
    "/routes/repository",
    route(f.provider.id, { fallbackId: fallback.id, expectedRevision: 1 }),
  ).expect(201);
  const job = (
    await f.call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)
  ).body;
  f.infer();
  const succeed = fetchMock.getMockImplementation()!;
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  const deadline = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
    originalTimeout(ms === 60000 ? 500 : ms === 120000 ? 1000 : ms),
  );
  const delayed = (
    ms: number,
    signal: AbortSignal,
    response: () => Promise<Response>,
  ) => new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      void response().then(resolve, reject);
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
  fetchMock
    .mockImplementationOnce(async (_url, _locality, options) =>
      delayed(350, options.signal, async () => new Response("", { status: 503 })),
    )
    .mockImplementation(async (...args) =>
      delayed(250, args[2].signal, async () => succeed(...args)),
    );
  try {
    await f.reviews.reconcile();
    const stored = await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.state).toBe("SUCCEEDED");
    expect(stored.providerId).toBe(fallback.id);
    expect(deadline).toHaveBeenCalledWith(120000);
    expect(deadline.mock.calls.filter(([ms]) => ms === 60000)).toHaveLength(2);
  } finally {
    deadline.mockRestore();
  }
});
it("preserves cancellation during an active inference call", async () => {
  const f = await reviewFixture(),
    job = (
      await f
        .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
        .expect(201)
    ).body;
  let release: (r: Response) => void = () => undefined,
    called: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    called = resolve;
  });
  f.infer();
  const succeed = fetchMock.getMockImplementation()!;
  let args: unknown[] = [];
  fetchMock.mockImplementation((...a: unknown[]) => {
    args = a;
    called();
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  });
  const running = f.reviews.reconcile();
  await started;
  await f.call(`/${job.id}/cancel`, {}).expect(201);
  release(await succeed(...args));
  await running;
  const stored = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect(stored.state).toBe("CANCELLED");
  expect(stored.result).toBeNull();
});
it("rejects tampered snapshot contents and does not retry an interrupted call", async () => {
  const f = await reviewFixture(),
    job = (
      await f
        .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
        .expect(201)
    ).body;
  const stored = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: job.id },
  });
  const snapshot = stored.snapshot as any;
  snapshot.context.sourceSha = "f".repeat(40);
  await db.aiSkillReview.update({ where: { id: job.id }, data: { snapshot } });
  fetchMock.mockClear();
  await f.reviews.reconcile();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })).state,
  ).toBe("UNAVAILABLE");
  await db.aiSkillReview.update({
    where: { id: job.id },
    data: { state: "RUNNING", startedAt: new Date(Date.now() - 100000) },
  });
  await f.reviews.reconcile();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } }))
      .failure,
  ).toContain("no automatic inference retry");
});

it("rejects free-form skill selection and AI checks outside the frozen assessment", async () => {
  const f = await reviewFixture();
  await f
    .call("", { assessmentId: f.assessment.id, skillIds: [f.skill.id] })
    .expect(400);
  await f
    .call("", {
      assessmentId: f.assessment.id,
      checkIds: [`ai-review-${randomUUID()}`],
    })
    .expect(400);
  const list = await http(app.getHttpServer())
    .get(f.base + "?assessmentId=" + f.assessment.id)
    .set("Cookie", `ai.sid=${owner.identityId}`)
    .expect(200);
  expect(list.body.checks).toEqual([
    expect.objectContaining({
      id: f.check.id,
      skillVersion: 1,
      skillDigest: f.skill.contentDigest,
      available: true,
    }),
  ]);
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(0);
});

it("parses SKILL.md without saving or approving it, and enforces origin and management access", async () => {
  const { exportSkillMarkdown } =
    await import("../src/intelligence/skill-markdown.js");
  const markdown = exportSkillMarkdown(skillTemplates[0]!);
  const count = await db.aiReviewSkill.count();
  const parsed = await skillPost(owner, "/parse", { markdown }).expect(201);
  expect(parsed.body.instructions).toBe(skillTemplates[0]!.instructions);
  expect(await db.aiReviewSkill.count()).toBe(count);
  await skillPost(developer, "/parse", { markdown }).expect(403);
  await http(app.getHttpServer())
    .post("/ai/skills/parse")
    .set("Cookie", `ai.sid=${owner.identityId}`)
    .set("Origin", "https://wrong.invalid")
    .send({ markdown })
    .expect(403);
  await skillPost(owner, "/parse", {
    markdown: markdown.replace("name:", "enabled: true\nname:"),
  }).expect(400);
  await skillPost(owner, "/parse", { markdown, approved: true }).expect(400);
});
it("downloads an authorized exact version and imports changed text into a separate disabled draft", async () => {
  const { parseSkillMarkdown } =
    await import("../src/intelligence/skill-markdown.js");
  const original = await approvedSkill();
  const download = (actor: AuthenticatedSession) =>
    http(app.getHttpServer())
      .get(`/ai/skills/${original.id}/markdown`)
      .set("Cookie", `ai.sid=${actor.identityId}`);
  const file = await download(developer).expect(200);
  expect(file.headers["content-type"]).toContain("text/markdown");
  expect(file.headers["content-disposition"]).toBe(
    'attachment; filename="SKILL.md"',
  );
  expect(file.headers["cache-control"]).toBe("no-store");
  expect(parseSkillMarkdown(file.text).instructions).toBe(
    original.instructions,
  );
  await download(outsider).expect(404);
  const changed = (
    await skillPost(owner, "/parse", {
      markdown: file.text.replace(
        original.instructions,
        "# Changed instructions\n\n- Cite evidence.",
      ),
    }).expect(201)
  ).body;
  const next = (
    await skillPost(owner, "", {
      ...changed,
      skillKey: original.skillKey,
      expectedVersion: original.version,
    }).expect(201)
  ).body;
  expect(next).toMatchObject({ version: 2, status: "DRAFT", enabled: false });
  expect(next.contentDigest).not.toBe(original.contentDigest);
  expect(
    await db.aiReviewSkill.findUniqueOrThrow({ where: { id: original.id } }),
  ).toMatchObject({
    instructions: original.instructions,
    contentDigest: original.contentDigest,
    status: "APPROVED",
    enabled: true,
  });
  await db.aiReviewSkill.update({
    where: { id: original.id },
    data: { instructions: "Tampered" },
  });
  await download(owner).expect(409);
});

// PR review fixtures execute the real admission/worker/storage path against this disposable database.
async function prFixture(
  patch: {
    source?: boolean;
    automatic?: boolean;
    summary?: boolean;
    selectors?: object;
  } = {},
) {
  const f = await reviewFixture(patch.selectors);
  const check = { ...f.check, stages: ["pull_request" as const] };
  const oldPlan = f.assessment.plan as any;
  const { digest: _digest, ...oldPack } = oldPlan.packs[0];
  const definition = { ...oldPack, aiChecks: [check] },
    pack = { ...definition, digest: packDigest(definition) };
  const context = {
    version: 1 as const,
    head: {
      repositoryId: f.repo.githubId.toString(),
      ref: "feature",
      sha: f.assessment.sourceSha,
    },
    base: {
      repositoryId: f.repo.githubId.toString(),
      ref: "main",
      sha: "b".repeat(40),
    },
    state: "open" as const,
    draft: false,
    merged: false,
  };
  const request = {
    sourceSha: f.assessment.sourceSha,
    subjectKind: "PULL_REQUEST",
    pullRequest: { ...context, number: 1, objectId: "pr:1" },
  };
  const plan = { ...oldPlan, packs: [pack] };
  const selection = await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: f.repo.id,
      revision: 1,
      profile: "RECOMMENDED",
      packs: [
        {
          id: pack.id,
          version: pack.version,
          digest: pack.digest,
          definition: pack,
        },
      ],
      selectedById: owner.identityId,
    },
  });
  const assessment = await db.commitAssessment.update({
    where: { id: f.assessment.id },
    data: {
      request,
      plan,
      selectionId: selection.id,
      assessmentHash: digest({ request, plan, report: f.assessment.report }),
    },
  });
  const definitionPolicy = {
    ...composeGatePolicy(selection, "refs/heads/main", []),
  };
  const policy = await db.gatePolicyRevision.create({
    data: {
      repositoryId: f.repo.id,
      organizationId: owner.organizationId!,
      branchRef: "refs/heads/main",
      revision: 1,
      selectionId: selection.id,
      definition: definitionPolicy,
      definitionHash: digest(definitionPolicy),
      state: "PUBLISHED",
      draftedById: owner.identityId,
      approvedById: owner.identityId,
      publishedById: owner.identityId,
      publishedAt: new Date(),
    },
  });
  const pr = await db.repositoryPullRequest.create({
    data: { repositoryId: f.repo.id, number: 1, objectId: "pr:1", context },
  });
  const routeRow = (
    await post(
      owner,
      "/routes/pull_request",
      route(f.provider.id, {
        allowSource: patch.source ?? true,
        automaticReviews: patch.automatic ?? true,
        publishSummary: patch.summary ?? false,
      }),
    ).expect(201)
  ).body;
  const github = {
    readPullRequest: vi.fn(async () => ({ context })),
    readPrReviewSource: vi.fn(async () =>
      prReviewSource(1, context, [
        { filename: "src/api.ts", patch: "@@ -0,0 +1 @@\n+handle(input)" },
      ]),
    ),
    publishAiReviewSummary: vi.fn(async () => ({
      htmlUrl: "https://github.com/fixture/review/runs/1",
      checkRunId: "1",
      appId: "1",
    })),
  };
  const reviews = new SkillReviewService(
    db,
    new AuthorizationService(db),
    new AssessmentService(db),
    service,
    github as unknown as GitHubProviderService,
  );
  const infer = () =>
    fetchMock.mockImplementation(
      async (_url: URL, _locality: string, opts: { body?: string }) => {
        const body = JSON.parse(opts.body!),
          data = JSON.parse(body.messages[1].content);
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    assessmentHash: data.DATA.assessmentHash,
                    sourceSha: data.DATA.sourceSha,
                    findings: [
                      {
                        checkId: data.SKILLS[0].id,
                        evidenceRefs: [data.DATA.source ? "diff:0" : "check:0"],
                        summary: "Unvalidated input reaches the database query.",
                        severity: "high",
                        impact: "Attacker-controlled input could allow unauthorized access if the query does not enforce validation.",
                        recommendation: "Validate inputs before use.",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      },
    );
  return {
    ...f,
    assessment,
    check,
    context,
    policy,
    pr,
    routeRow,
    github,
    reviews,
    infer,
  };
}
it("automatically dispatches a published PR policy once, reviews changed code and publishes a neutral advisory summary", async () => {
  vi.stubEnv("GITHUB_CHECK_PUBLICATION_ENABLED", "true");
  const f = await prFixture({ summary: true }),
    gate = previewGate(f.assessment);
  await f.reviews.dispatchAutomatic();
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(1);
  f.infer();
  await f.reviews.reconcile();
  const job = await db.aiSkillReview.findFirstOrThrow({
    where: { assessmentId: f.assessment.id },
  });
  expect(job.state).toBe("SUCCEEDED");
  expect(job.automaticKey).toBeTruthy();
  expect(JSON.stringify(job.result)).toContain("src/api.ts");
  expect(JSON.stringify(job.result)).not.toContain("handle(input)");
  expect(fetchMock.mock.lastCall![2].body).toContain("handle(input)");
  await f.reviews.publishPendingSummary();
  expect(f.github.publishAiReviewSummary).toHaveBeenCalledOnce();
  expect(f.github.publishAiReviewSummary.mock.lastCall).toEqual(
    expect.arrayContaining([f.assessment.sourceSha]),
  );
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } }))
      .feedbackState,
  ).toBe("PUBLISHED");
  expect(
    previewGate(
      await db.commitAssessment.findUniqueOrThrow({
        where: { id: f.assessment.id },
      }),
    ),
  ).toEqual(gate);
  await db.repositoryPullRequest.update({
    where: { id: f.pr.id },
    data: { aiReviewAttemptAt: null },
  });
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(1);
});
it("keeps automatic review evidence-only when source sharing is off", async () => {
  const f = await prFixture({ source: false });
  await f.reviews.dispatchAutomatic();
  f.infer();
  await f.reviews.reconcile();
  expect(f.github.readPrReviewSource).not.toHaveBeenCalled();
  expect(
    (
      await db.aiSkillReview.findFirstOrThrow({
        where: { assessmentId: f.assessment.id },
      })
    ).state,
  ).toBe("SUCCEEDED");
  expect(fetchMock.mock.lastCall![2].body).not.toContain("handle(input)");
});
it("does not send model requests after PR, policy, source-sharing or access changes", async () => {
  const f = await prFixture();
  await f.reviews.dispatchAutomatic();
  const job = await db.aiSkillReview.findFirstOrThrow({
    where: { assessmentId: f.assessment.id },
  });
  f.github.readPullRequest.mockResolvedValue({
    context: { ...f.context, head: { ...f.context.head, sha: "c".repeat(40) } },
  });
  fetchMock.mockClear();
  await f.reviews.reconcile();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })).state,
  ).toBe("UNAVAILABLE");
  await db.aiSkillReview.update({
    where: { id: job.id },
    data: { state: "QUEUED" },
  });
  f.github.readPullRequest.mockResolvedValue({ context: f.context });
  await db.aiStageRoute.update({
    where: { id: f.routeRow.id },
    data: { allowSource: false },
  });
  await f.reviews.reconcile();
  expect(fetchMock).not.toHaveBeenCalled();
});
it("requires a published policy and explicit route enablement, without token pricing or budgets", async () => {
  const f = await prFixture({ automatic: false });
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(0);
  await db.aiStageRoute.update({
    where: { id: f.routeRow.id },
    data: { automaticReviews: true, dailyBudgetCents: 1 },
  });
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(1);
  expect(
    await db.aiReviewBudget.count({
      where: { organizationId: owner.organizationId, stage: "pull_request" },
    }),
  ).toBe(0);
  await db.gatePolicyRevision.update({
    where: { id: f.policy.id },
    data: { state: "APPROVED" },
  });
  await db.repositoryPullRequest.update({
    where: { id: f.pr.id },
    data: { aiReviewAttemptAt: null },
  });
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(1);
});
it("rejects a manual code review when source sharing is off", async () => {
  const f = await prFixture({ source: false, automatic: false });
  await expect(
    f.reviews.request(
      owner,
      f.repo.githubId.toString(),
      f.assessment.id,
      [f.check.id],
      { includeSource: true },
    ),
  ).rejects.toThrow("source sharing");
  expect(f.github.readPrReviewSource).not.toHaveBeenCalled();
});

it.each(["policy", "route", "observed-head"])(
  "rejects queued automatic reviews after %s changes",
  async (change) => {
    const f = await prFixture();
    await f.reviews.dispatchAutomatic();
    const job = await db.aiSkillReview.findFirstOrThrow({
      where: { assessmentId: f.assessment.id },
    });
    if (change === "policy")
      await db.gatePolicyRevision.update({
        where: { id: f.policy.id },
        data: { state: "APPROVED" },
      });
    if (change === "route")
      await db.aiStageRoute.update({
        where: { id: f.routeRow.id },
        data: { automaticReviews: false },
      });
    if (change === "observed-head")
      await db.repositoryPullRequest.update({
        where: { id: f.pr.id },
        data: {
          context: {
            ...f.context,
            head: { ...f.context.head, sha: "c".repeat(40) },
          },
        },
      });
    fetchMock.mockClear();
    await f.reviews.reconcile();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("UNAVAILABLE");
  },
);

it("exposes built-in defaults and downloads Markdown without creating or approving organization skills", async () => {
  const list = await http(app.getHttpServer())
    .get("/ai/skills")
    .set("Cookie", `ai.sid=${owner.identityId}`)
    .expect(200);
  expect(list.body.templates.map((template: any) => template.id).sort()).toEqual(
    ["preflyt-ci-setup", ...skillTemplates.map((template) => template.id)].sort(),
  );
  const template = list.body.templates.find(
    (s: any) => s.id === "migration-safety",
  );
  expect(template.checkIds).toEqual(["build.required", "tests.required"]);
  const markdown = await http(app.getHttpServer())
    .get("/ai/skills/builtins/migration-safety/markdown")
    .set("Cookie", `ai.sid=${developer.identityId}`)
    .expect(200);
  expect(markdown.text).toContain(
    "Never suggest resetting, truncating or dropping the application database",
  );
  await http(app.getHttpServer())
    .get("/ai/skills/builtins/unknown/markdown")
    .set("Cookie", `ai.sid=${owner.identityId}`)
    .expect(404);
  await http(app.getHttpServer())
    .get("/ai/skills/builtins/migration-safety/markdown")
    .expect(401);
  const body = { ...validateSkill(template), expectedVersion: 0 };
  const created = (await skillPost(owner, "", body).expect(201)).body;
  expect(created).toMatchObject({
    status: "DRAFT",
    enabled: false,
    version: 1,
  });
  await skillPost(owner, `/${created.id}/enable`, {
    expectedDigest: created.contentDigest,
    reviewed: false,
  }).expect(400);
  await skillPost(owner, `/${created.id}/approve`, {
    expectedDigest: created.contentDigest,
    reviewed: true,
  }).expect(201);
  const changed = (
    await skillPost(owner, "", {
      ...body,
      skillKey: created.skillKey,
      expectedVersion: 1,
      instructions: body.instructions + "\nExtra organization guidance.",
    }).expect(201)
  ).body;
  expect(changed).toMatchObject({
    version: 2,
    status: "DRAFT",
    enabled: false,
  });
  expect(
    (await db.aiReviewSkill.findUniqueOrThrow({ where: { id: created.id } }))
      .contentDigest,
  ).toBe(created.contentDigest);
  expect(
    skillTemplates.find((s) => s.id === "migration-safety")!.instructions,
  ).toBe(template.instructions);
});

it("reuses one built-in skill lineage per organization without approving or duplicating it", async () => {
  const path = "/builtins/api-contract/use";
  await skillPost(developer, path, {}).expect(403);
  const first = (await skillPost(owner, path, {}).expect(201)).body;
  expect(first).toMatchObject({ status: "DRAFT", enabled: false, version: 1 });
  const again = (await skillPost(owner, path, {}).expect(201)).body;
  expect(again.id).toBe(first.id);
  const updated = (
    await skillPost(owner, "", {
      ...validateSkill(first),
      instructions: first.instructions + "\nOrganization extension.",
      skillKey: first.skillKey,
      expectedVersion: 1,
    }).expect(201)
  ).body;
  expect((await skillPost(owner, path, {}).expect(201)).body.id).toBe(
    updated.id,
  );
  expect(
    await db.aiReviewSkill.count({
      where: { organizationId: first.organizationId, skillKey: first.skillKey },
    }),
  ).toBe(2);
  const parallel = await Promise.all([
    skillPost(owner, "/builtins/container-security/use", {}),
    skillPost(owner, "/builtins/container-security/use", {}),
  ]);
  expect(parallel.map((result) => result.status)).toEqual([201, 201]);
  expect(parallel[0]!.body.id).toBe(parallel[1]!.body.id);
});

it("stores provider usage even when model output is rejected and restricts usage visibility", async () => {
  const f = await reviewFixture(),
    gate = previewGate(f.assessment);
  const job = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        usage: { prompt_tokens: 40, completion_tokens: 20 },
        choices: [{ finish_reason: "stop", message: { content: "invalid" } }],
      }),
    ),
  );
  await f.reviews.reconcile();
  const saved = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect(saved.state).toBe("UNAVAILABLE");
  expect(saved.usage).toEqual([
    expect.objectContaining({ inputTokens: 40, outputTokens: 20 }),
  ]);
  expect(
    previewGate(
      await db.commitAssessment.findUniqueOrThrow({
        where: { id: f.assessment.id },
      }),
    ),
  ).toEqual(gate);
  const ownerList = await http(app.getHttpServer())
    .get(f.base + "?assessmentId=" + f.assessment.id)
    .set("Cookie", `ai.sid=${owner.identityId}`)
    .expect(200);
  expect(ownerList.body.reviews[0].usage).toBeTruthy();
  const membership = await db.organizationMembership.findFirstOrThrow({
    where: {
      organizationId: owner.organizationId!,
      identityId: developer.identityId,
    },
  });
  await db.repositoryGrant.create({
    data: { membershipId: membership.id, repositoryId: f.repo.id },
  });
  const developerList = await http(app.getHttpServer())
    .get(f.base + "?assessmentId=" + f.assessment.id)
    .set("Cookie", `ai.sid=${developer.identityId}`)
    .expect(200);
  expect(developerList.body.reviews[0].usage).toBeNull();
  expect(developerList.body.reviews[0]).not.toHaveProperty("reservedCents");
});
it("requires explicit source sharing and automatic reviews for inline publication", async () => {
  const f = await reviewFixture();
  await post(
    owner,
    "/routes/pull_request",
    route(f.provider.id, { publishInline: true, automaticReviews: true }),
  ).expect(400);
  await post(
    owner,
    "/routes/pull_request",
    route(f.provider.id, {
      publishInline: true,
      allowSource: true,
      automaticReviews: true,
    }),
  ).expect(201);
});
it("publishes automatic inline feedback separately from summary publication and keeps gates unchanged", async () => {
  vi.stubEnv("GITHUB_CHECK_PUBLICATION_ENABLED", "true");
  const f = await prFixture({ summary: false }),
    gate = previewGate(f.assessment);
  await db.aiStageRoute.update({
    where: { id: f.routeRow.id },
    data: { publishInline: true },
  });
  const inline = vi.fn(async () => ({
    htmlUrl: "https://github.com/fixture/review/pull/1#pullrequestreview-1",
    reviewId: "1",
  }));
  (f.github as any).publishAiInlineReview = inline;
  await f.reviews.dispatchAutomatic();
  f.infer();
  await f.reviews.reconcile();
  await f.reviews.publishPendingSummary();
  expect(inline).toHaveBeenCalledTimes(1);
  expect(f.github.publishAiReviewSummary).not.toHaveBeenCalled();
  const stored = await db.aiSkillReview.findFirstOrThrow({
    where: { assessmentId: f.assessment.id },
  });
  expect(stored.inlineFeedbackUrl).toContain("pullrequestreview");
  expect(stored.feedbackState).toBe("PUBLISHED");
  expect(
    previewGate(
      await db.commitAssessment.findUniqueOrThrow({
        where: { id: f.assessment.id },
      }),
    ),
  ).toEqual(gate);
});
it("imports only pinned public upstream instructions with explicit management permission", async () => {
  const input = {
    repository: "example/reviews",
    commit: "c".repeat(40),
    path: "SKILL.md",
    licensePath: "LICENSE",
  };
  await skillPost(developer, "/upstream", input).expect(403);
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        "---\nname: Review inputs\ndescription: Input handling\n---\n\nInspect supplied inputs.",
      ),
    )
    .mockResolvedValueOnce(new Response("MIT License"));
  const before = await db.aiReviewSkill.count();
  const parsed = (await skillPost(owner, "/upstream", input).expect(201)).body;
  expect(parsed.manifest.source).toContain(input.commit);
  expect(parsed.manifest.license).toBe("");
  expect(await db.aiReviewSkill.count()).toBe(before);
});

it("dispatches language-constrained reviews only with an exact-commit profile", async () => {
  const f = await prFixture({ selectors: { languages: ["TypeScript"] } });
  const skipped = await f.reviews.list(
    owner,
    f.repo.githubId.toString(),
    f.assessment.id,
  );
  expect(skipped.checks[0]!.available).toBe(false);
  expect(skipped.checks[0]!.selection.reason).toContain(
    "no language/framework profile",
  );
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(0);
  const profile = await db.repositoryProfile.create({
    data: {
      repositoryId: f.repo.id,
      sourceSha: f.assessment.sourceSha,
      treeSha: "b".repeat(40),
      branch: "feature",
      fullName: f.repo.fullName,
      version: 1,
      complete: true,
      report: {
        signals: [
          { id: "languages", state: "detected", observations: ["TypeScript"] },
        ],
      },
    },
  });
  const request = {
    ...(f.assessment.request as object),
    profileSnapshotId: profile.id,
  };
  await db.commitAssessment.update({
    where: { id: f.assessment.id },
    data: {
      request,
      assessmentHash: digest({
        request,
        plan: f.assessment.plan,
        report: f.assessment.report,
      }),
    },
  });
  await db.repositoryPullRequest.update({
    where: { id: f.pr.id },
    data: { aiReviewAttemptAt: null },
  });
  await f.reviews.dispatchAutomatic();
  expect(
    await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } }),
  ).toBe(1);
});

it("ignores legacy token budgets and emits no budget alerts, without requiring model prices", async () => {
  const f = await reviewFixture();
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  await db.aiStageRoute.update({
    where: {
      organizationId_stage: {
        organizationId: owner.organizationId!,
        stage: "repository",
      },
    },
    data: { dailyBudgetCents: 1, maxInputTokens: 100, maxOutputTokens: 128 },
  });
  fetchMock.mockClear();
  const first = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  const duplicate = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  expect(duplicate.id).toBe(first.id);
  expect(first).not.toHaveProperty("reservedCents");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    await db.aiReviewBudget.count({
      where: { organizationId: owner.organizationId! },
    }),
  ).toBe(0);
  expect(
    await db.aiSkillReview.count({
      where: { organizationId: owner.organizationId! },
    }),
  ).toBe(1);
  const events = await db.notificationEvent.findMany({
    where: {
      organizationId: owner.organizationId!,
      type: "AI_REVIEW_BUDGET_REACHED",
    },
  });
  expect(events).toHaveLength(0);
});
it("records actual failed inference transport but excludes invalid output, cancellation and access rejection", async () => {
  const f = await reviewFixture();
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  const review = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  await db.aiSkillReview.updateMany({
    where: { state: "QUEUED", id: { not: review.id } },
    data: { state: "CANCELLED" },
  });
  fetchMock.mockResolvedValueOnce(
    new Response("private-provider-body", { status: 503 }),
  );
  await f.reviews.reconcile();
  const signals = await db.auditEvent.findMany({
    where: {
      event: "ai.inference.transport_failed",
      metadata: { path: ["organizationId"], equals: owner.organizationId! },
    },
  });
  expect(signals).toHaveLength(1);
  expect(signals[0].metadata).toMatchObject({
    reviewId: review.id,
    providerId: f.provider.id,
  });
  expect(JSON.stringify(signals)).not.toContain("private-provider-body");
  expect(
    await db.notificationEvent.count({
      where: {
        organizationId: owner.organizationId!,
        type: "AI_MODEL_UNAVAILABLE",
      },
    }),
  ).toBe(0);
  await db.aiSkillReview.update({
    where: { id: review.id },
    data: { state: "QUEUED" },
  });
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ choices: [{ finish_reason: "length" }] })),
  );
  await f.reviews.reconcile();
  expect(
    await db.auditEvent.count({
      where: {
        event: "ai.inference.transport_failed",
        metadata: { path: ["organizationId"], equals: owner.organizationId! },
      },
    }),
  ).toBe(1);
  await db.aiSkillReview.update({
    where: { id: review.id },
    data: { state: "QUEUED" },
  });
  await db.organizationMembership.updateMany({
    where: {
      organizationId: owner.organizationId!,
      identityId: owner.identityId,
    },
    data: { active: false },
  });
  fetchMock.mockClear();
  await f.reviews.reconcile();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(
    await db.auditEvent.count({
      where: {
        event: "ai.inference.transport_failed",
        metadata: { path: ["organizationId"], equals: owner.organizationId! },
      },
    }),
  ).toBe(1);
});

it("never invokes fallback because successful inference notification persistence failed", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  const f = await reviewFixture();
  const fallback = (
    await post(owner, "/providers", { ...input, name: "Fallback" }).expect(201)
  ).body;
  await post(owner, `/providers/${fallback.id}/test`, {}).expect(201);
  await post(
    owner,
    "/routes/repository",
    route(f.provider.id, { fallbackId: fallback.id, expectedRevision: 1 }),
  ).expect(201);
  const job = (
    await f
      .call("", { assessmentId: f.assessment.id, checkIds: [f.check.id] })
      .expect(201)
  ).body;
  await db.aiSkillReview.updateMany({
    where: { state: "QUEUED", id: { not: job.id } },
    data: { state: "CANCELLED" },
  });
  const notifications = await import("../src/notifications/ai-notification.js");
  const write = vi
    .spyOn(notifications, "recordAiInferenceOutcomeInTransaction")
    .mockRejectedValueOnce(new Error("Notification storage unavailable"));
  try {
    fetchMock.mockClear();
    f.infer();
    await f.reviews.reconcile();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerId: f.provider.id,
        outcome: "succeeded",
      }),
    );
    expect(
      (await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } }))
        .state,
    ).toBe("UNAVAILABLE");
  } finally {
    write.mockRestore();
  }
});

it("inherits a shared model, respects disabled stage overrides and guards returning to default", async () => {
  const provider = await connected();
  await post(owner, "/routes/default", route(provider.id)).expect(201);
  for (const stage of ["repository", "pull_request", "qa"]) {
    const result = (
      await post(owner, "/preview", { stage, containsSource: false }).expect(
        201,
      )
    ).body;
    expect(result.reason).toBe("CONFIGURATION_READY");
    expect(result.providerId).toBe(provider.id);
  }
  const override = (
    await post(
      owner,
      "/routes/repository",
      route(provider.id, { enabled: false }),
    ).expect(201)
  ).body;
  expect(
    (
      await post(owner, "/preview", {
        stage: "repository",
        containsSource: false,
      }).expect(201)
    ).body.reason,
  ).toBe("ROUTE_DISABLED");
  await post(outsider, "/routes/repository/inherit", {
    expectedRevision: override.revision,
  }).expect(409);
  await post(owner, "/routes/repository/inherit", {
    expectedRevision: override.revision + 1,
  }).expect(409);
  await post(owner, "/routes/repository/inherit", {
    expectedRevision: override.revision,
  }).expect(201);
  expect(
    (
      await post(owner, "/preview", {
        stage: "repository",
        containsSource: false,
      }).expect(201)
    ).body.reason,
  ).toBe("CONFIGURATION_READY");
});

it("retries a failed manual review without repeating a running or successful review", async () => {
  const f = await reviewFixture();
  const input = {assessmentId: f.assessment.id, checkIds: [f.check.id]};
  const first = (await f.call("", input).expect(201)).body;
  await db.aiSkillReview.update({where: {id: first.id}, data: {state: "UNAVAILABLE", failure: "Invalid response", finishedAt: new Date()}});
  const retry = (await f.call("", input).expect(201)).body;
  expect(retry.id).toBe(first.id);
  expect(retry.state).toBe("QUEUED");
  f.infer();
  await f.reviews.reconcile();
  expect((await db.aiSkillReview.findUniqueOrThrow({where: {id: first.id}})).state).toBe("SUCCEEDED");
  const duplicate = (await f.call("", input).expect(201)).body;
  expect(duplicate.id).toBe(first.id);
  expect(duplicate.state).toBe("SUCCEEDED");
});

async function scopedPrReviewFixture() {
  const f = await prFixture({automatic: false});
  const enabledAt = new Date();
  await db.readinessAutomation.create({data: {repositoryId: f.repo.id, organizationId: owner.organizationId!, actorId: owner.identityId, enabled: true, aiReviews: true, aiReviewsEnabledAt: enabledAt}});
  const run = await db.pipelineRunSubmission.create({data: {
    id: randomUUID(), repositoryId: f.repo.id, organizationId: owner.organizationId!,
    policyId: f.policy.id, policyHash: f.policy.definitionHash, sourceSha: f.context.head.sha,
    workflowSha: f.context.head.sha, runId: '100', runAttempt: 1, prNumber: f.pr.number,
    inputHash: digest({test:'scoped-pr'}), payload: {}, submittedById: owner.identityId,
    state: 'PENDING', assessmentId: f.assessment.id, createdAt: new Date(enabledAt.getTime() + 1),
  }});
  const inline = vi.fn(async () => ({htmlUrl:'https://github.com/fixture/review/pull/1#pullrequestreview-1', reviewId:'1'}));
  (f.github as any).publishAiInlineReview = inline;
  return {...f, run, inline};
}
it('reviews only an authorized repository after its verified PR run, then comments on the PR once', async () => {
  vi.stubEnv('GITHUB_CHECK_PUBLICATION_ENABLED','true');
  const f = await scopedPrReviewFixture();
  await f.reviews.dispatchAutomatic();
  expect(await db.aiSkillReview.count({where:{assessmentId:f.assessment.id}})).toBe(0);
  await db.pipelineRunSubmission.update({where:{id:f.run.id},data:{state:'COMPLETE'}});
  await db.repositoryPullRequest.update({where:{id:f.pr.id},data:{aiReviewAttemptAt:null}});
  await f.reviews.dispatchAutomatic();
  f.infer(); await f.reviews.reconcile(); await f.reviews.publishPendingSummary();
  expect(f.inline).toHaveBeenCalledOnce();
  expect(f.inline.mock.lastCall).toEqual(expect.arrayContaining([expect.stringContaining('Advisory review for PR #1')]));
  expect(f.github.publishAiReviewSummary).not.toHaveBeenCalled();
  const job = await db.aiSkillReview.findFirstOrThrow({where:{assessmentId:f.assessment.id}});
  expect(job).toMatchObject({state:'SUCCEEDED',feedbackState:'PUBLISHED'});
  await db.repositoryPullRequest.update({where:{id:f.pr.id},data:{aiReviewAttemptAt:null}});
  await f.reviews.dispatchAutomatic();
  expect(await db.aiSkillReview.count({where:{assessmentId:f.assessment.id}})).toBe(1);
});
it('does not review historic PR runs or continue after repository AI authorization is revoked', async () => {
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({where:{id:f.run.id},data:{state:'COMPLETE',createdAt:new Date(0)}});
  await f.reviews.dispatchAutomatic();
  expect(await db.aiSkillReview.count({where:{assessmentId:f.assessment.id}})).toBe(0);
  await db.pipelineRunSubmission.update({where:{id:f.run.id},data:{createdAt:new Date()}});
  await db.repositoryPullRequest.update({where:{id:f.pr.id},data:{aiReviewAttemptAt:null}});
  await f.reviews.dispatchAutomatic();
  await db.readinessAutomation.update({where:{repositoryId:f.repo.id},data:{aiReviews:false,revision:{increment:1}}});
  fetchMock.mockClear(); f.infer(); await f.reviews.reconcile();
  const job = await db.aiSkillReview.findFirstOrThrow({where:{assessmentId:f.assessment.id}});
  expect(job.state).toBe('UNAVAILABLE'); expect(fetchMock).not.toHaveBeenCalled();
});

it("publishes only actionable findings and a short summary while retaining full assessment analysis", async () => {
  vi.stubEnv("GITHUB_CHECK_PUBLICATION_ENABLED", "true");
  const f = await scopedPrReviewFixture();
  const gate = previewGate(f.assessment);
  await db.pipelineRunSubmission.update({
    where: { id: f.run.id },
    data: { state: "COMPLETE" },
  });
  await f.reviews.dispatchAutomatic();
  f.infer();
  await f.reviews.reconcile();
  const job = await db.aiSkillReview.findFirstOrThrow({
    where: { assessmentId: f.assessment.id },
  });
  const result = job.result as any;
  const finding = result.findings[0];
  const findings = [
    finding,
    {
      ...finding,
      summary: "The parameter binding is correct.",
      recommendation: "No change required.",
    },
    { ...finding, recommendation: "Optionally add another rounding test." },
  ];
  await db.aiSkillReview.update({
    where: { id: job.id },
    data: { result: { ...result, findings } },
  });
  await f.reviews.publishPendingSummary();
  expect(f.inline).toHaveBeenCalledOnce();
  const args = f.inline.mock.lastCall! as any[];
  expect(args[4]).toHaveLength(1);
  expect(args[5]).toContain("1 actionable issue");
  expect(args[5].length).toBeLessThan(250);
  expect(args[5]).not.toContain(finding.summary);
  const stored = await db.aiSkillReview.findUniqueOrThrow({
    where: { id: job.id },
  });
  expect((stored.result as any).findings).toHaveLength(3);
  expect(stored.feedbackState).toBe("PUBLISHED");
  expect(
    previewGate(
      await db.commitAssessment.findUniqueOrThrow({
        where: { id: f.assessment.id },
      }),
    ),
  ).toEqual(gate);
});

it('retries unavailable automatic PR reviews explicitly without rerunning checks or automatically repeating inference', async () => {
  vi.stubEnv('GITHUB_CHECK_PUBLICATION_ENABLED', 'true');
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({ where: { id: f.run.id }, data: { state: 'COMPLETE' } });
  await f.reviews.dispatchVerifiedPipeline(f.run.id);
  const first = await db.aiSkillReview.findFirstOrThrow({ where: { assessmentId: f.assessment.id } });
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE', failure: 'API_KEY_OUTPUT', finishedAt: new Date() } });
  fetchMock.mockClear();
  await db.repositoryPullRequest.update({ where: { id: f.pr.id }, data: { aiReviewAttemptAt: null } });
  await f.reviews.dispatchAutomatic();
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('UNAVAILABLE');
  const retry = await f.reviews.retry(owner, f.repo.githubId.toString(), first.id);
  expect(retry.id).toBe(first.id);
  expect(retry.state).toBe('QUEUED');
  expect(retry.feedbackState).toBe('PENDING');
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).automaticKey).toBe(first.automaticKey);
  f.infer(); await f.reviews.reconcile(); await f.reviews.publishPendingSummary();
  const saved = await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } });
  expect(saved.state).toBe('SUCCEEDED'); expect(saved.feedbackState).toBe('PUBLISHED');
  expect(f.inline).toHaveBeenCalledOnce();
  expect((await db.pipelineRunSubmission.findUniqueOrThrow({ where: { id: f.run.id } })).runAttempt).toBe(1);
  expect(previewGate(await db.commitAssessment.findUniqueOrThrow({ where: { id: f.assessment.id } }))).toEqual(previewGate(f.assessment));
});
it('adopts the current model route on explicit AI retry while preserving the old failed review', async () => {
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({ where: { id: f.run.id }, data: { state: 'COMPLETE' } });
  await f.reviews.dispatchVerifiedPipeline(f.run.id);
  const first = await db.aiSkillReview.findFirstOrThrow({ where: { assessmentId: f.assessment.id } });
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE', failure: 'NETWORK' } });
  const replacement = (await post(owner, '/providers', { ...input, name: 'Replacement model', modelId: 'model-b' }).expect(201)).body;
  await post(owner, `/providers/${replacement.id}/test`, {}).expect(201);
  await db.aiStageRoute.update({ where: { id: f.routeRow.id }, data: { primaryId: replacement.id, revision: { increment: 1 } } });
  const retried = await f.reviews.retry(owner, f.repo.githubId.toString(), first.id);
  expect(retried.id).not.toBe(first.id);
  const saved = await db.aiSkillReview.findUniqueOrThrow({ where: { id: retried.id } });
  expect((saved.snapshot as any).route.revision).toBe(f.routeRow.revision + 1);
  expect((saved.snapshot as any).providers[0].id).toBe(replacement.id);
  expect(saved.automaticKey).not.toBe(first.automaticKey);
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('UNAVAILABLE');
});
it('rechecks access and source authorization before retrying an automatic review', async () => {
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({ where: { id: f.run.id }, data: { state: 'COMPLETE' } });
  await f.reviews.dispatchVerifiedPipeline(f.run.id);
  const first = await db.aiSkillReview.findFirstOrThrow({ where: { assessmentId: f.assessment.id } });
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE' } });
  fetchMock.mockClear();
  await expect(f.reviews.retry(outsider, f.repo.githubId.toString(), first.id)).rejects.toThrow();
  await db.aiStageRoute.update({ where: { id: f.routeRow.id }, data: { allowSource: false, revision: { increment: 1 } } });
  await expect(f.reviews.retry(owner, f.repo.githubId.toString(), first.id)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('UNAVAILABLE');
});
it('protects the explicit AI retry endpoint with origin and repository permissions', async () => {
  const f = await reviewFixture();
  const first = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body;
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE' } });
  await http(app.getHttpServer()).post(f.base + `/${first.id}/retry`).set('Cookie', `ai.sid=${owner.identityId}`)
    .set('Origin', 'https://attacker.example.invalid').send({}).expect(403);
  await f.call(`/${first.id}/retry`, {}, auditor).expect(403);
  await f.call(`/${first.id}/retry`, {}, outsider).expect(403);
  const retry = (await f.call(`/${first.id}/retry`, {}).expect(201)).body;
  expect(retry.id).toBe(first.id); expect(retry.state).toBe('QUEUED');
  await f.call(`/${first.id}/retry`, {}).expect(404);
});
it('persists a fixed rejection code while discarding unsafe output and leaving feedback unpublished', async () => {
  const f = await reviewFixture();
  const first = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body;
  const rejected = 'sk-rejected-fixture-content';
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: rejected } }] })));
  await f.reviews.reconcile();
  const saved = await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } });
  expect(saved.state).toBe('UNAVAILABLE'); expect(saved.failure).toMatch(/^API_KEY_OUTPUT:/);
  expect(saved.failure).not.toContain(rejected); expect(saved.result).toBeNull(); expect(saved.feedbackState).toBe('NOT_REQUESTED');
});

it('does not retry automatic inference after its published policy has been withdrawn', async () => {
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({ where: { id: f.run.id }, data: { state: 'COMPLETE' } });
  await f.reviews.dispatchVerifiedPipeline(f.run.id);
  const first = await db.aiSkillReview.findFirstOrThrow({ where: { assessmentId: f.assessment.id } });
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE' } });
  await db.gatePolicyRevision.update({ where: { id: f.policy.id }, data: { state: 'DRAFT' } });
  fetchMock.mockClear();
  await expect(f.reviews.retry(owner, f.repo.githubId.toString(), first.id)).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('UNAVAILABLE');
});

it('adopts retested provider revisions on explicit retry even when the route revision is unchanged', async () => {
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({ where: { id: f.run.id }, data: { state: 'COMPLETE' } });
  await f.reviews.dispatchVerifiedPipeline(f.run.id);
  const first = await db.aiSkillReview.findFirstOrThrow({ where: { assessmentId: f.assessment.id } });
  const snapshot = first.snapshot as any;
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE' } });
  const pin = snapshot.providers[0];
  await post(owner, `/providers/${pin.id}`, { ...input, apiKey: 'fixture-new', expectedRevision: pin.revision }).expect(201);
  await post(owner, `/providers/${pin.id}/test`, {}).expect(201);
  const retry = await f.reviews.retry(owner, f.repo.githubId.toString(), first.id);
  expect(retry.id).not.toBe(first.id);
  const saved = await db.aiSkillReview.findUniqueOrThrow({ where: { id: retry.id } });
  expect((saved.snapshot as any).route.revision).toBe(snapshot.route.revision);
  expect((saved.snapshot as any).providers[0].revision).toBe(pin.revision + 1);
  await db.aiSkillReview.update({ where: { id: saved.id }, data: { state: 'UNAVAILABLE' } });
  const repeated = await f.reviews.retry(owner, f.repo.githubId.toString(), saved.id);
  expect(repeated.id).toBe(saved.id);
  expect(repeated.state).toBe('QUEUED');
});

it('retries with a replacement stage route even when its revision number matches the original route', async () => {
  const f = await scopedPrReviewFixture();
  await db.pipelineRunSubmission.update({ where: { id: f.run.id }, data: { state: 'COMPLETE' } });
  await f.reviews.dispatchVerifiedPipeline(f.run.id);
  const first = await db.aiSkillReview.findFirstOrThrow({ where: { assessmentId: f.assessment.id } });
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'UNAVAILABLE' } });
  const original = await db.aiStageRoute.findUniqueOrThrow({ where: { id: f.routeRow.id } });
  await db.aiStageRoute.delete({ where: { id: original.id } });
  const replacement = await db.aiStageRoute.create({ data: { ...original, id: randomUUID() } });
  const retry = await f.reviews.retry(owner, f.repo.githubId.toString(), first.id);
  const saved = await db.aiSkillReview.findUniqueOrThrow({ where: { id: retry.id } });
  expect(saved.id).not.toBe(first.id);
  expect((saved.snapshot as any).route).toEqual({ id: replacement.id, revision: original.revision });
  expect(saved.automaticKey).not.toBe(first.automaticKey);
  await db.aiSkillReview.update({ where: { id: saved.id }, data: { state: 'UNAVAILABLE' } });
  expect((await f.reviews.retry(owner, f.repo.githubId.toString(), saved.id)).id).toBe(saved.id);
});

it('keeps AI feedback queued without spending attempts when GitHub throttles publication', async () => {
  vi.stubEnv("GITHUB_CHECK_PUBLICATION_ENABLED", "true");
  const f = await prFixture({summary: true});
  await f.reviews.dispatchAutomatic(); f.infer(); await f.reviews.reconcile();
  const job = await db.aiSkillReview.findFirstOrThrow({where: {assessmentId: f.assessment.id}});
  await db.aiSkillReview.update({where: {id: job.id}, data: {feedbackAttempts: 4}});
  const {GitHubRateLimitError} = await import('../src/github/github-rate-limit.js');
  f.github.publishAiReviewSummary.mockRejectedValueOnce(new GitHubRateLimitError(600000));
  await f.reviews.publishPendingSummary();
  const saved = await db.aiSkillReview.findUniqueOrThrow({where: {id: job.id}});
  expect(saved.feedbackState).toBe('RETRY'); expect(saved.feedbackAttempts).toBe(4);
  expect(saved.feedbackAttemptAt!.getTime() + 60000).toBeGreaterThan(Date.now() + 590000);
  await f.reviews.publishPendingSummary();
  expect(f.github.publishAiReviewSummary).toHaveBeenCalledTimes(1);
});

it('uses local authorization for review cancellation polling and fresh authorization at execution boundaries', async () => {
  const permission = vi.fn().mockRejectedValue(new Error('stop after authorization'));
  const review = new SkillReviewService(db, {requireRepository: permission} as any, {} as any, {} as any);
  await expect((review as any).current(owner, '51', 'assessment', {}, true)).rejects.toThrow('stop after authorization');
  expect(permission).toHaveBeenLastCalledWith(owner, '51', 'ai.review.run', true, false);
  await expect((review as any).current(owner, '51', 'assessment', {})).rejects.toThrow('stop after authorization');
  expect(permission).toHaveBeenLastCalledWith(owner, '51', 'ai.review.run', true, true);
});

it('keeps a throttled pre-inference review queued without calling the model', async () => {
  const f = await prFixture({summary: true});
  await f.reviews.dispatchAutomatic();
  const {GitHubRateLimitError} = await import('../src/github/github-rate-limit.js');
  const verify = vi.spyOn(f.reviews as any, 'verifyLivePr').mockRejectedValue(new GitHubRateLimitError(60000));
  const calls = fetchMock.mock.calls.length;
  await f.reviews.reconcile();
  const job = await db.aiSkillReview.findFirstOrThrow({where: {assessmentId: f.assessment.id}});
  expect(job.state).toBe('QUEUED'); expect(job.startedAt).toBeNull(); expect(job.finishedAt).toBeNull();
  expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 59000);
  expect(fetchMock.mock.calls.length).toBe(calls);
  verify.mockClear();
  await f.reviews.reconcile();
  expect(verify).not.toHaveBeenCalled();
});
