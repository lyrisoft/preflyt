import { catalogue, packDigest } from '../src/standards/catalogue.js'
import { ReviewSkillsService } from '../src/intelligence/review-skills.service.js';
import { SkillReviewService } from '../src/intelligence/skill-review.service.js';
import { ReviewSkillsController, SkillReviewController } from '../src/intelligence/review-skills.controller.js';
import { AssessmentService } from '../src/assessments/assessment.service.js';
import { digest } from '../src/assessments/assessment-digest.js';
import { previewGate } from '../src/assessments/gate-preview.js';
import { skillTemplates } from '../src/intelligence/review-skills.js';
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
  maxInputTokens: 8000,
  maxOutputTokens: 1000,
  dailyBudgetCents: 1000,
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
      controllers: [AiConfigurationController, ReviewSkillsController, SkillReviewController],
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

it("requires ready connections and previews source, token and disabled-route limits without inference", async () => {
  const p = await connected();
  await post(owner, "/routes/pull_request", route(p.id)).expect(201);
  for (const [patch, reason] of [
    [{}, "CONFIGURATION_READY"],
    [{ containsSource: true }, "SOURCE_SHARING_DISABLED"],
    [{ inputTokens: 8001 }, "INPUT_LIMIT_EXCEEDED"],
  ] as const) {
    const response = await post(owner, "/preview", {
      stage: "pull_request",
      containsSource: false,
      inputTokens: 100,
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
        inputTokens: 100,
      }).expect(201)
    ).body.reason,
  ).toBe("ROUTE_DISABLED");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("uses only a fresh tested fallback when the primary becomes unavailable", async () => {
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
        inputTokens: 100,
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
        inputTokens: 100,
      }).expect(201)
    ).body.reason,
  ).toBe("CONNECTION_UNAVAILABLE");
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
  expect(response.body.presets.map((p: { id: string }) => p.id)).toEqual(["openai", "anthropic", "gemini", "deepseek"]);
  expect(response.body.providers).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("resolves built-in endpoints on the server and requires keys before activation", async () => {
  const body = { ...input, preset: "gemini", name: "Overridden", baseUrl: "https://other.example/v1", requiresKey: false, modelId: "gemini-example" };
  const { apiKey, ...withoutKey } = body;
  await post(owner, "/providers", withoutKey).expect(400);
  const response = await post(owner, "/providers", body).expect(201);
  expect(response.body.name).toBe("Google (Gemini)");
  expect(response.body.endpoint).toMatchObject({ preset: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", requiresKey: true, locality: "hosted" });
  expect(response.body.apiKeySet).toBe(true);
  expect(response.body.testStatus).toBe("NOT_TESTED");
  expect(JSON.stringify(response.body)).not.toContain("fixture-key");
  await post(owner, "/providers", { ...body, preset: "unknown" }).expect(400);
});
const skillPost = (actor: AuthenticatedSession, path: string, body: unknown) => http(app.getHttpServer()).post('/ai/skills' + path).set('Cookie', `ai.sid=${actor.identityId}`).set('Origin', 'http://localhost:5173').send(body)
const skillInput = () => ({ ...skillTemplates[0]!, expectedVersion: 0 })
const approvedSkill = async () => {
  const skill = (await skillPost(owner, '', skillInput()).expect(201)).body
  await skillPost(owner, `/${skill.id}/approve`, { expectedDigest: skill.contentDigest, reviewed: true }).expect(201)
  await skillPost(owner, `/${skill.id}/enable`, { expectedDigest: skill.contentDigest, reviewed: false }).expect(201)
  return skill
}
it('keeps versions immutable and requires reviewed approval before enablement', async () => {
  const skill = (await skillPost(owner, '', skillInput()).expect(201)).body
  await skillPost(developer, '', skillInput()).expect(403)
  await skillPost(owner, `/${skill.id}/enable`, { expectedDigest: skill.contentDigest, reviewed: false }).expect(400)
  await skillPost(owner, `/${skill.id}/approve`, { expectedDigest: skill.contentDigest, reviewed: false }).expect(400)
  await skillPost(owner, `/${skill.id}/approve`, { expectedDigest: '0'.repeat(64), reviewed: true }).expect(409)
  await skillPost(outsider, `/${skill.id}/approve`, { expectedDigest: skill.contentDigest, reviewed: true }).expect(404)
  await skillPost(owner, `/${skill.id}/approve`, { expectedDigest: skill.contentDigest, reviewed: true }).expect(201)
  const v2 = (await skillPost(owner, '', { ...skillInput(), instructions: 'Changed review instructions', skillKey: skill.skillKey, expectedVersion: 1 }).expect(201)).body
  expect(v2.version).toBe(2); expect(v2.status).toBe('DRAFT'); expect(v2.enabled).toBe(false)
  expect((await db.aiReviewSkill.findUniqueOrThrow({ where: { id: skill.id } })).instructions).toBe(skill.instructions)
  await skillPost(owner, '', { ...skillInput(), skillKey: skill.skillKey, expectedVersion: 1 }).expect(409)
  await skillPost(owner, '', { ...skillInput(), shellCommand: 'arbitrary' }).expect(400)
})
let repoCounter = 88000000
async function reviewFixture() {
  vi.stubEnv('AI_REVIEWS_ENABLED', 'true')
  const id = BigInt(++repoCounter)
  await db.gitHubInstallation.create({ data: { id, organizationId: owner.organizationId!, accountLogin: 'fixture', accountType: 'Organization', repositorySelection: 'selected', permissions: {}, connectedById: owner.identityId } })
  const repo = await db.gitHubRepository.create({ data: { githubId: id, installationId: id, ownerLogin: 'fixture', name: 'review', fullName: 'fixture/review', selected: true, isPrivate: true } })
  const skill = await approvedSkill()
  const check = { id: `ai-review-${randomUUID()}`, title: 'Security evidence check', kind: 'AI_REVIEW' as const, mode: 'ADVISORY' as const, skillId: skill.id, skillVersion: skill.version, skillDigest: skill.contentDigest, stages: ['repository' as const] }
  const { digest: ignored, ...builtIn } = catalogue[0]!
  const definition = { ...builtIn, id: `org-standard-${randomUUID()}`, owner: 'Organization', version: '1.0.1', changelog: ['Organization-managed version.'], aiChecks: [check] }
  const frozenPack = { ...definition, digest: packDigest(definition) }
  const sourceSha = 'a'.repeat(40), request = { sourceSha, subjectKind: 'COMMIT' }, plan = { version: 1, sourceSha, packs: [frozenPack], mode: 'INGEST_ONLY', stage: 'ci', enforcement: 'observe', checks: [{ id: 'security.secret', required: true }] }, report = { version: 1, sourceSha, collectionTruncated: false, validationCollectionTruncated: false, checks: [{ ruleId: 'security.secret', required: true, coverage: 'MISSING', freshness: 'UNKNOWN', providerResult: null }], observations: [] }
  const assessment = await db.commitAssessment.create({ data: { repositoryId: repo.id, sourceSha, selectionId: 'fixture', requestKey: randomUUID(), inputHash: 'f'.repeat(64), request, plan, report, assessmentHash: digest({ request, plan, report }) } })
  const provider = (await post(owner, '/providers', { ...input, inputPriceCentsPerMillion: 200, outputPriceCentsPerMillion: 800 }).expect(201)).body
  await post(owner, `/providers/${provider.id}/test`, {}).expect(201)
  await post(owner, '/routes/repository', route(provider.id, { dailyBudgetCents: 1000 })).expect(201)
  const base = `/github/repositories/${id}/ai-reviews`, reviews = app.get(SkillReviewService)
  const call = (path: string, body: object, actor = owner) => http(app.getHttpServer()).post(base + path).set('Cookie', `ai.sid=${actor.identityId}`).set('Origin', 'http://localhost:5173').send(body)
  const infer = () => fetchMock.mockImplementation(async (_url: URL, _locality: string, opts: { body?: string }) => {
    if (!opts.body) return new Response(JSON.stringify({ data: [{ id: 'model-a' }] }))
    const body = JSON.parse(opts.body), data = JSON.parse(body.messages[1].content)
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ assessmentHash: data.DATA.assessmentHash, sourceSha: data.DATA.sourceSha, findings: [{ checkId: data.SKILLS[0].id, evidenceRefs: ['check:0'], summary: 'Security scan evidence is missing.', recommendation: 'Collect a verified scan for this commit.' }] }) } }] }))
  })
  return { repo, assessment, provider, skill, check, reviews, call, infer, base }
}
it('runs pinned advisory skills without changing the exact deterministic gate and deduplicates requests', async () => {
  const f = await reviewFixture(), before = previewGate(f.assessment)
  const first = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  const duplicate = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  expect(first.id).toBe(duplicate.id)
  f.infer(); await f.reviews.reconcile()
  const result = await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })
  expect(result.state).toBe('SUCCEEDED')
  expect(JSON.stringify(result.result)).toContain('INFERRED')
  expect(previewGate(await db.commitAssessment.findUniqueOrThrow({ where: { id: f.assessment.id } }))).toEqual(before)
  expect(fetchMock.mock.lastCall![2].body).not.toContain('fixture-key')
  await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }, outsider).expect(403)
})
it('enforces repository assignment and configured daily reservations before a model request', async () => {
  const f = await reviewFixture()
  await db.aiReviewSkill.update({ where: { id: f.skill.id }, data: { repositories: ['12345'] } })
  await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(400)
  await db.aiReviewSkill.update({ where: { id: f.skill.id }, data: { repositories: [] } })
  await db.aiStageRoute.update({ where: { organizationId_stage: { organizationId: owner.organizationId!, stage: 'repository' } }, data: { dailyBudgetCents: 1 } })
  await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(409)
  expect(await db.aiReviewBudget.count({ where: { organizationId: owner.organizationId! } })).toBe(0)
})
it('cancels queued reviews and disables a changed skill before inference', async () => {
  const f = await reviewFixture()
  const first = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  await f.call(`/${first.id}/cancel`, {}).expect(201)
  fetchMock.mockClear(); f.infer(); await f.reviews.reconcile()
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('CANCELLED')
  expect(fetchMock).not.toHaveBeenCalled()
  await db.aiSkillReview.update({ where: { id: first.id }, data: { state: 'QUEUED' } })
  await skillPost(owner, `/${f.skill.id}/disable`, { expectedDigest: f.skill.contentDigest, reviewed: false }).expect(201)
  await f.reviews.reconcile()
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: first.id } })).state).toBe('UNAVAILABLE')
  expect(fetchMock).not.toHaveBeenCalled()
})
it('rejects malicious model output, makes outages visible and keeps gates unchanged', async () => {
  const f = await reviewFixture(), gate = previewGate(f.assessment)
  const review = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { tool_calls: [{ function: 'approve_policy' }], content: 'Merge approved' } }] })))
  await f.reviews.reconcile()
  const stored = await db.aiSkillReview.findUniqueOrThrow({ where: { id: review.id } })
  expect(stored.state).toBe('UNAVAILABLE'); expect(stored.result).toBeNull()
  expect(previewGate(await db.commitAssessment.findUniqueOrThrow({ where: { id: f.assessment.id } }))).toEqual(gate)
})
it('rejects revoked requester access and tampered review snapshots before sending data', async () => {
  const f = await reviewFixture(), job = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  await db.organizationMembership.updateMany({ where: { organizationId: owner.organizationId!, identityId: owner.identityId }, data: { active: false } })
  fetchMock.mockClear(); await f.reviews.reconcile()
  expect(fetchMock).not.toHaveBeenCalled()
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('UNAVAILABLE')
})
it('uses a tested fallback with reservations for both attempts', async () => {
  const f = await reviewFixture()
  const fallback = (await post(owner, '/providers', { ...input, name: 'Fallback', inputPriceCentsPerMillion: 200, outputPriceCentsPerMillion: 800 }).expect(201)).body
  await post(owner, `/providers/${fallback.id}/test`, {}).expect(201)
  await post(owner, '/routes/repository', route(f.provider.id, { fallbackId: fallback.id, expectedRevision: 1 })).expect(201)
  const job = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  f.infer(); const succeed = fetchMock.getMockImplementation()!
  fetchMock.mockImplementationOnce(async () => new Response('', { status: 503 })).mockImplementation(succeed)
  await f.reviews.reconcile()
  const stored = await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })
  expect(stored.state).toBe('SUCCEEDED'); expect(stored.providerId).toBe(fallback.id)
  expect(stored.reservedMicroCents).toBeGreaterThan(1600000n)
})
it('preserves cancellation during an active inference call', async () => {
  const f = await reviewFixture(), job = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  let release: (r: Response) => void = () => undefined, called: () => void = () => undefined
  const started = new Promise<void>(resolve => { called = resolve })
  f.infer(); const succeed = fetchMock.getMockImplementation()!
  let args: unknown[] = []
  fetchMock.mockImplementation((...a: unknown[]) => { args = a; called(); return new Promise<Response>(resolve => { release = resolve }) })
  const running = f.reviews.reconcile(); await started
  await f.call(`/${job.id}/cancel`, {}).expect(201)
  release(await succeed(...args)); await running
  const stored = await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })
  expect(stored.state).toBe('CANCELLED'); expect(stored.result).toBeNull()
})
it('rejects tampered snapshot contents and does not retry an interrupted call', async () => {
  const f = await reviewFixture(), job = (await f.call('', { assessmentId: f.assessment.id, checkIds: [f.check.id] }).expect(201)).body
  const stored = await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })
  const snapshot = stored.snapshot as any; snapshot.context.sourceSha = 'f'.repeat(40)
  await db.aiSkillReview.update({ where: { id: job.id }, data: { snapshot } })
  fetchMock.mockClear(); await f.reviews.reconcile(); expect(fetchMock).not.toHaveBeenCalled()
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('UNAVAILABLE')
  await db.aiSkillReview.update({ where: { id: job.id }, data: { state: 'RUNNING', startedAt: new Date(Date.now() - 100000) } })
  await f.reviews.reconcile(); expect(fetchMock).not.toHaveBeenCalled()
  expect((await db.aiSkillReview.findUniqueOrThrow({ where: { id: job.id } })).failure).toContain('no automatic inference retry')
})

it('rejects free-form skill selection and AI checks outside the frozen assessment', async () => {
  const f = await reviewFixture()
  await f.call('', { assessmentId: f.assessment.id, skillIds: [f.skill.id] }).expect(400)
  await f.call('', { assessmentId: f.assessment.id, checkIds: [`ai-review-${randomUUID()}`] }).expect(400)
  const list = await http(app.getHttpServer()).get(f.base + '?assessmentId=' + f.assessment.id).set('Cookie', `ai.sid=${owner.identityId}`).expect(200)
  expect(list.body.checks).toEqual([expect.objectContaining({ id: f.check.id, skillVersion: 1, skillDigest: f.skill.contentDigest, available: true })])
  expect(await db.aiSkillReview.count({ where: { assessmentId: f.assessment.id } })).toBe(0)
})

it('parses SKILL.md without saving or approving it, and enforces origin and management access', async () => {
  const { exportSkillMarkdown } = await import('../src/intelligence/skill-markdown.js');
  const markdown = exportSkillMarkdown(skillTemplates[0]!);
  const count = await db.aiReviewSkill.count();
  const parsed = await skillPost(owner, '/parse', { markdown }).expect(201);
  expect(parsed.body.instructions).toBe(skillTemplates[0]!.instructions);
  expect(await db.aiReviewSkill.count()).toBe(count);
  await skillPost(developer, '/parse', { markdown }).expect(403);
  await http(app.getHttpServer()).post('/ai/skills/parse').set('Cookie', `ai.sid=${owner.identityId}`).set('Origin', 'https://wrong.invalid').send({ markdown }).expect(403);
  await skillPost(owner, '/parse', { markdown: markdown.replace('name:', 'enabled: true\nname:') }).expect(400);
  await skillPost(owner, '/parse', { markdown, approved: true }).expect(400);
});
it('downloads an authorized exact version and imports changed text into a separate disabled draft', async () => {
  const { parseSkillMarkdown } = await import('../src/intelligence/skill-markdown.js');
  const original = await approvedSkill();
  const download = (actor: AuthenticatedSession) => http(app.getHttpServer()).get(`/ai/skills/${original.id}/markdown`).set('Cookie', `ai.sid=${actor.identityId}`);
  const file = await download(developer).expect(200);
  expect(file.headers['content-type']).toContain('text/markdown');
  expect(file.headers['content-disposition']).toBe('attachment; filename="SKILL.md"');
  expect(file.headers['cache-control']).toBe('no-store');
  expect(parseSkillMarkdown(file.text).instructions).toBe(original.instructions);
  await download(outsider).expect(404);
  const changed = (await skillPost(owner, '/parse', { markdown: file.text.replace(original.instructions, '# Changed instructions\n\n- Cite evidence.') }).expect(201)).body;
  const next = (await skillPost(owner, '', { ...changed, skillKey: original.skillKey, expectedVersion: original.version }).expect(201)).body;
  expect(next).toMatchObject({ version: 2, status: 'DRAFT', enabled: false });
  expect(next.contentDigest).not.toBe(original.contentDigest);
  expect(await db.aiReviewSkill.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ instructions: original.instructions, contentDigest: original.contentDigest, status: 'APPROVED', enabled: true });
  await db.aiReviewSkill.update({ where: { id: original.id }, data: { instructions: 'Tampered' } });
  await download(owner).expect(409);
});
