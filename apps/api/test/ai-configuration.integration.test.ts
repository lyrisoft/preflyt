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
  endpointId: "reviewed",
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
const fetchMock = vi.fn();
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
      controllers: [AiConfigurationController],
      providers: [
        SessionGuard,
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
  vi.stubEnv("AI_APPROVED_ENDPOINTS", JSON.stringify([endpoint]));
  vi.stubGlobal("fetch", fetchMock);
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
    baseUrl: "https://attacker.invalid",
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
it("never sends an old key to a changed endpoint, even with the same endpoint id", async () => {
  const p = await connected();
  fetchMock.mockClear();
  vi.stubEnv(
    "AI_APPROVED_ENDPOINTS",
    JSON.stringify([
      { ...endpoint, baseUrl: "https://changed.example.invalid/v1" },
    ]),
  );
  await post(owner, `/providers/${p.id}/test`, {}).expect(409);
  expect(fetchMock).not.toHaveBeenCalled();
  await post(owner, `/providers/${p.id}`, {
    ...input,
    apiKey: undefined,
    expectedRevision: 1,
  }).expect(400);
  await post(owner, `/providers/${p.id}`, {
    ...input,
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
    vi.stubEnv("AI_APPROVED_ENDPOINTS", "[]");
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
