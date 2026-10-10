import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { ValidationPipe, ForbiddenException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import request from "supertest";
import { disposableDatabase } from "./disposable-database.js";
import { ConfigurationService } from "../src/configuration/configuration.service.js";
import { ConfigurationController } from "../src/configuration/configuration.controller.js";
import { AuthService } from "../src/auth/auth.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { configurationFields } from "../src/configuration/configuration-catalogue.js";
import {
  encryptConfigurationSecrets,
  decryptConfigurationSecrets,
  initializeConfiguration,
  validateConfiguration,
} from "../src/configuration/configuration-store.js";
let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  app: INestApplication;
const origin = "http://localhost:5173";
const patch = (body: unknown, token = "super") =>
  request(app.getHttpServer())
    .patch("/configuration")
    .set("Cookie", `sid=${token}`)
    .set("Origin", origin)
    .send(body);
beforeAll(async () => {
  fixture = await disposableDatabase("configuration");
  const service = new ConfigurationService(fixture.prisma);
  app = await NestFactory.create(
    {
      module: class TestModule {},
      controllers: [ConfigurationController],
      providers: [
        SessionGuard,
        { provide: ConfigurationService, useValue: service },
        {
          provide: AuthorizationService,
          useValue: new AuthorizationService(fixture.prisma),
        },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "sid",
            currentSession: async (token: string) =>
              ["super", "owner"].includes(token)
                ? {
                    authenticated: true,
                    identityId: "admin",
                    subject: "admin",
                    role: "OWNER",
                    platformAdmin: token === "super",
                  }
                : { authenticated: false },
            assertOrigin: (value: string) => {
              if (value !== origin) throw new ForbiddenException();
            },
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
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await fixture.reset();
  for (const field of configurationFields)
    vi.stubEnv(field.key, field.defaultValue);
  vi.stubEnv(
    "CONFIGURATION_ENCRYPTION_KEY",
    randomBytes(32).toString("base64"),
  );
  await fixture.prisma.identity.create({
    data: { id: "admin", issuer: "fixture", subject: "admin" },
  });
});
it("requires an authenticated platform administrator, including for reads", async () => {
  await request(app.getHttpServer()).get("/configuration").expect(401);
  await request(app.getHttpServer())
    .get("/configuration")
    .set("Cookie", "sid=owner")
    .expect(403);
  await patch(
    { expectedRevision: 1, values: {}, clearSecrets: [] },
    "owner",
  ).expect(403);
  await request(app.getHttpServer())
    .patch("/configuration")
    .set("Cookie", "sid=super")
    .set("Origin", "https://wrong.example")
    .send({ expectedRevision: 1, values: {}, clearSecrets: [] })
    .expect(403);
  expect(await fixture.prisma.deploymentConfiguration.count()).toBe(0);
});
it("imports legacy environment once and makes database values authoritative", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  const first = await initializeConfiguration(fixture.prisma);
  vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
  expect((await initializeConfiguration(fixture.prisma)).values).toEqual(
    first.values,
  );
});
it("encrypts credentials and never exposes them in API responses, public values or audit metadata", async () => {
  await patch({
    expectedRevision: 1,
    values: {
      SMTP_PASSWORD: "private-password",
      NOTIFICATIONS_ENABLED: "true",
    },
    clearSecrets: [],
  }).expect(200);
  const response = await request(app.getHttpServer())
    .get("/configuration")
    .set("Cookie", "sid=super")
    .expect(200);
  expect(JSON.stringify(response.body)).not.toContain("private-password");
  expect(
    response.body.fields.find(
      (field: { key: string }) => field.key === "SMTP_PASSWORD",
    ),
  ).toMatchObject({ value: "", configured: true });
  const row = await fixture.prisma.deploymentConfiguration.findUniqueOrThrow({
    where: { id: "primary" },
  });
  expect(JSON.stringify(row)).not.toContain("private-password");
  expect(decryptConfigurationSecrets(row.encryptedSecrets).SMTP_PASSWORD).toBe(
    "private-password",
  );
  expect(
    JSON.stringify(await fixture.prisma.auditEvent.findMany()),
  ).not.toContain("private-password");
  expect(response.headers["cache-control"]).toBe("no-store");
});
it("retains blank credentials, explicitly clears them, and rejects stale concurrent edits", async () => {
  await patch({
    expectedRevision: 1,
    values: { SMTP_PASSWORD: "private-password" },
    clearSecrets: [],
  }).expect(200);
  await patch({
    expectedRevision: 2,
    values: { SMTP_PASSWORD: "", SMTP_USER: "user" },
    clearSecrets: [],
  }).expect(200);
  const row = await fixture.prisma.deploymentConfiguration.findUniqueOrThrow({
    where: { id: "primary" },
  });
  expect(decryptConfigurationSecrets(row.encryptedSecrets).SMTP_PASSWORD).toBe(
    "private-password",
  );
  await patch({
    expectedRevision: 2,
    values: { SMTP_USER: "stale" },
    clearSecrets: [],
  }).expect(409);
  await patch({
    expectedRevision: 3,
    values: {},
    clearSecrets: ["SMTP_PASSWORD"],
  }).expect(200);
  expect(
    decryptConfigurationSecrets(
      (
        await fixture.prisma.deploymentConfiguration.findUniqueOrThrow({
          where: { id: "primary" },
        })
      ).encryptedSecrets,
    ).SMTP_PASSWORD,
  ).toBeUndefined();
});
it("rejects root secrets, malformed settings and feature activation without prerequisites", async () => {
  await patch({
    expectedRevision: 1,
    values: { DATABASE_URL: "anything" },
    clearSecrets: [],
  }).expect(400);
  await patch({
    expectedRevision: 1,
    values: { AI_CONFIGURATION_ENABLED: true },
    clearSecrets: [],
  }).expect(400);
  await patch({
    expectedRevision: 1,
    values: {},
    clearSecrets: ["SMTP_HOST"],
  }).expect(403);
  await patch({
    expectedRevision: 1,
    values: { NOTIFICATION_EMAIL_ENABLED: "true" },
    clearSecrets: [],
  }).expect(400);
  expect(() =>
    validateConfiguration({ RULESET_INSIGHTS_RETENTION_DAYS: "366" }),
  ).toThrow();
  expect(() =>
    validateConfiguration({ OIDC_ISSUER: "https://user:password@example.com" }),
  ).toThrow();
});
it("rejects tampered ciphertext and a changed encryption key without exposing secret material", () => {
  const encrypted = encryptConfigurationSecrets({
    SMTP_PASSWORD: "private-password",
  })!;
  expect(() =>
    decryptConfigurationSecrets(encrypted.slice(0, -5) + "AAAAA"),
  ).toThrow("could not be decrypted");
  vi.stubEnv(
    "CONFIGURATION_ENCRYPTION_KEY",
    randomBytes(32).toString("base64"),
  );
  expect(() => decryptConfigurationSecrets(encrypted)).toThrow(
    "could not be decrypted",
  );
});
it("uses optimistic updates to prevent two writers from losing each other changes", async () => {
  await initializeConfiguration(fixture.prisma);
  const responses = await Promise.all([
    patch({
      expectedRevision: 1,
      values: { SMTP_USER: "one" },
      clearSecrets: [],
    }),
    patch({
      expectedRevision: 1,
      values: { SMTP_USER: "two" },
      clearSecrets: [],
    }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(await fixture.prisma.auditEvent.count()).toBe(1);
});
