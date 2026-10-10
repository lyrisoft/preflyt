import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { ForbiddenException, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AuthService } from "../src/auth/auth.service.js";
import {
  AuthorizationService,
  rolePermissions,
} from "../src/auth/authorization.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../src/auth/session.guard.js";
import { NotificationChannelsController } from "../src/notifications/notification-channels.controller.js";
import { NotificationChannelsService } from "../src/notifications/notification-channels.service.js";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import { apiCorsOptions } from "../src/config/api-cors.js";
import { disposableDatabase } from "./disposable-database.js";

let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  db: PrismaService,
  app: INestApplication,
  channels: NotificationChannelsService;
const org = "channels-org",
  otherOrg = "channels-other",
  owner = "channels-owner",
  admin = "channels-admin",
  developer = "channels-developer",
  outsider = "channels-other-owner";
const origin = "http://localhost:5173";
const freshGithub = vi.fn().mockResolvedValue(undefined);
// Deliberately stale session role: live organization membership determines permission.
const session = (identityId = owner): AuthenticatedSession => ({
  authenticated: true,
  identityId,
  subject: identityId,
  role: "OWNER",
  email: null,
  organizationId: identityId === outsider ? otherOrg : org,
});
const createBody = (name = "Engineering updates") => ({
  type: "EMAIL",
  name,
  recipients: ["team@example.com"],
  enabled: true,
});
const http = (
  method: "get" | "post" | "patch" | "delete",
  path = "",
  actor = owner,
) =>
  request(app.getHttpServer())
    [method]("/notifications/channels" + path)
    .set("Cookie", `channels.sid=${actor}`)
    .set("Origin", origin)
    .set("X-Preflyt-Organization", actor === outsider ? otherOrg : org);
const create = async (name?: string) =>
  (await http("post").send(createBody(name)).expect(201)).body;
const event = async () =>
  db.notificationEvent.create({
    data: {
      organizationId: org,
      repositoryId: "fixture-repository",
      repositoryGithubId: "123",
      repositoryName: "fixture/repository",
      type: "ASSESSMENT_FAILED",
      severity: "error",
    },
  });

beforeAll(async () => {
  fixture = await disposableDatabase("orgchannels");
  db = fixture.prisma;
  const authorization = new AuthorizationService(db, {
    repositoryIds: freshGithub,
  } as never);
  channels = new NotificationChannelsService(db, authorization);
  app = await NestFactory.create(
    {
      module: class ChannelsTestModule {},
      controllers: [NotificationChannelsController],
      providers: [
        SessionGuard,
        { provide: NotificationChannelsService, useValue: channels },
        { provide: AuthorizationService, useValue: authorization },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "channels.sid",
            currentSession: async (token?: string) =>
              [owner, admin, developer, outsider].includes(token ?? "")
                ? session(token)
                : { authenticated: false },
            assertOrigin: (value?: string) => {
              if (value !== origin)
                throw new ForbiddenException("Invalid request origin");
            },
          },
        },
      ],
    },
    { logger: false },
  );
  app.enableCors(apiCorsOptions(origin));
  app.use(cookieParser());
  await app.init();
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  await fixture.reset();
  freshGithub.mockClear();
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "true");
  vi.stubEnv("SMTP_HOST", "localhost");
  vi.stubEnv("SMTP_PORT", "1025");
  vi.stubEnv("SMTP_FROM", "preflyt@example.com");
  await db.organization.createMany({
    data: [
      { id: org, name: "Fixture" },
      { id: otherOrg, name: "Other fixture" },
    ],
  });
  for (const id of [owner, admin, developer, outsider])
    await db.identity.create({ data: { id, issuer: "fixture", subject: id } });
  for (const [id, role, organizationId] of [
    [owner, "OWNER", org],
    [admin, "ADMIN", org],
    [developer, "DEVELOPER", org],
    [outsider, "OWNER", otherOrg],
  ] as const)
    await db.organizationMembership.create({
      data: { identityId: id, role, organizationId },
    });
});

it("grants the dedicated channel permission only to Owner and Admin", () => {
  for (const [role, permissions] of Object.entries(rolePermissions))
    expect(permissions.includes("notifications.manage")).toBe(
      ["OWNER", "ADMIN"].includes(role),
    );
});
it("creates shared email channels with normalized addresses and no dependency on sign-in email", async () => {
  const response = await http("post")
    .send({
      type: "EMAIL",
      name: "  Engineering updates  ",
      recipients: [
        "Team@Example.com",
        "team@example.com",
        "  security@example.com ",
      ],
    })
    .expect(201);
  expect(response.body).toMatchObject({
    name: "Engineering updates",
    type: "EMAIL",
    recipients: ["team@example.com", "security@example.com"],
    enabled: true,
    revision: 1,
    lastDelivery: null,
  });
  const listed = await http("get", "", admin).expect(200);
  expect(listed.body).toMatchObject({
    organizationId: org,
    canManage: true,
    notificationsEnabled: true,
    emailEnabled: true,
    emailConfigured: true,
    items: [{ id: response.body.id }],
  });
  expect(listed.headers["cache-control"]).toBe("no-store");
  expect(freshGithub.mock.calls.every(([, , fresh]) => fresh === true)).toBe(
    true,
  );
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { event: "notification.channel.created" },
  });
  expect(audit.metadata).toMatchObject({
    channelId: response.body.id,
    organizationId: org,
    recipientCount: 2,
  });
  expect(JSON.stringify(audit.metadata)).not.toContain("@");
});
it("enforces active sessions, current roles and no recipient visibility for non-admin users", async () => {
  await create();
  await request(app.getHttpServer()).get("/notifications/channels").expect(401);
  await http("get", "", developer).expect(403);
  await http("post", "", developer).send(createBody()).expect(403);
  await db.organizationMembership.updateMany({
    where: { identityId: admin },
    data: { role: "DEVELOPER" },
  });
  await http("get", "", admin).expect(403);
  await db.organizationMembership.updateMany({
    where: { identityId: owner },
    data: { active: false },
  });
  await http("get").expect(403);
  await http("post").send(createBody("Revoked")).expect(403);
});
it("blocks writes when fresh GitHub authorization is revoked", async () => {
  freshGithub.mockRejectedValueOnce(
    new ForbiddenException("GitHub access revoked"),
  );
  await http("post").send(createBody()).expect(403);
  expect(await db.organizationNotificationChannel.count()).toBe(0);
});
it("does not reveal or modify channels belonging to another organization", async () => {
  const channel = await create();
  expect((await http("get", "", outsider).expect(200)).body.items).toEqual([]);
  await http("patch", "/" + channel.id, outsider)
    .send({ expectedRevision: 1, enabled: false })
    .expect(404);
  await http("delete", "/" + channel.id, outsider)
    .send({ expectedRevision: 1 })
    .expect(404);
  await http("post", "/" + channel.id + "/test", outsider)
    .send({ expectedRevision: 1 })
    .expect(404);
  expect(
    (
      await db.organizationNotificationChannel.findUniqueOrThrow({
        where: { id: channel.id },
      })
    ).enabled,
  ).toBe(true);
});
it("requires the trusted Origin for every mutation", async () => {
  const channel = await create();
  for (const [method, path, body] of [
    ["post", "", createBody("Unauthorized")],
    ["patch", "/" + channel.id, { expectedRevision: 1, enabled: false }],
    ["delete", "/" + channel.id, { expectedRevision: 1 }],
    ["post", "/" + channel.id + "/test", { expectedRevision: 1 }],
  ] as const)
    await http(method, path)
      .set("Origin", "https://attacker.invalid")
      .send(body)
      .expect(403);
  expect(await db.notificationChannelDelivery.count()).toBe(0);
  expect(await db.organizationNotificationChannel.count()).toBe(1);
});
it("rejects unsupported channel types, injected fields, malformed names and addresses", async () => {
  const invalid = [
    { ...createBody(), type: "SLACK" },
    { ...createBody(), organizationId: otherOrg },
    { ...createBody(), name: "x".repeat(81) },
    { ...createBody(), name: " " },
    { ...createBody(), name: "name\nBcc: recipient" },
    { ...createBody(), recipients: [] },
    { ...createBody(), recipients: Array(21).fill("team@example.com") },
    {
      ...createBody(),
      recipients: ["team@example.com\r\nBcc: victim@example.com"],
    },
    { ...createBody(), recipients: ["bad..email@example.com"] },
    { ...createBody(), recipients: ["team@example..com"] },
    { ...createBody(), recipients: [42] },
    { ...createBody(), enabled: "true" },
  ];
  for (const body of invalid) await http("post").send(body).expect(400);
  const channel = await create();
  await http("patch", "/" + channel.id)
    .send({ expectedRevision: 1, type: "EMAIL" })
    .expect(400);
  await http("patch", "/" + channel.id)
    .send({ expectedRevision: 1 })
    .expect(400);
  await http("delete", "/" + channel.id)
    .send({ expectedRevision: 0 })
    .expect(400);
});
it("prevents case-insensitive duplicate names under concurrent creation and rename", async () => {
  const created = await Promise.all([
    http("post").send(createBody("Engineering")),
    http("post").send(createBody("engineering")),
  ]);
  expect(created.map((response) => response.status).sort()).toEqual([201, 409]);
  const second = await create("Security");
  await http("patch", "/" + second.id)
    .send({ expectedRevision: 1, name: " ENGINEERING " })
    .expect(409);
});
it("keeps the organization channel limit deterministic during concurrent writes", async () => {
  for (let index = 0; index < 9; index++) await create("Channel " + index);
  const responses = await Promise.all([
    http("post").send(createBody("Concurrent A")),
    http("post").send(createBody("Concurrent B")),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 400,
  ]);
  expect(
    await db.organizationNotificationChannel.count({
      where: { organizationId: org, deletedAt: null },
    }),
  ).toBe(10);
});
it("rejects stale updates, delete and test requests without replacing newer settings", async () => {
  const channel = await create();
  const updates = await Promise.all([
    http("patch", "/" + channel.id).send({
      expectedRevision: 1,
      name: "New A",
    }),
    http("patch", "/" + channel.id).send({
      expectedRevision: 1,
      name: "New B",
    }),
  ]);
  expect(updates.map((response) => response.status).sort()).toEqual([200, 409]);
  await http("delete", "/" + channel.id)
    .send({ expectedRevision: 1 })
    .expect(409);
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 1 })
    .expect(409);
  expect(
    (
      await db.organizationNotificationChannel.findUniqueOrThrow({
        where: { id: channel.id },
      })
    ).revision,
  ).toBe(2);
});
it("queues generic email tests per recipient, throttles repeat tests and records redacted audit metadata", async () => {
  const channel = (
    await http("post")
      .send({
        ...createBody(),
        recipients: ["team@example.com", "security@example.com"],
      })
      .expect(201)
  ).body;
  expect(
    (
      await http("post", "/" + channel.id + "/test")
        .send({ expectedRevision: 1 })
        .expect(201)
    ).body,
  ).toEqual({ queued: 2 });
  const deliveries = await db.notificationChannelDelivery.findMany({
    where: { channelId: channel.id },
  });
  expect(deliveries).toHaveLength(2);
  expect(
    deliveries.every(
      (delivery) =>
        delivery.kind === "TEST" &&
        delivery.state === "PENDING" &&
        delivery.eventId === null &&
        delivery.requestedById === owner &&
        delivery.organizationId === org,
    ),
  ).toBe(true);
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 1 })
    .expect(409);
  const listed = (await http("get").expect(200)).body.items[0];
  expect(listed.lastDelivery).toMatchObject({
    state: "PENDING",
    attempts: 0,
    kind: "TEST",
    failureCode: null,
  });
  expect(listed.lastDelivery).not.toHaveProperty("recipient");
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { event: "notification.channel.test.queued" },
  });
  expect(audit.metadata).toMatchObject({ queued: 2 });
  expect(JSON.stringify(audit.metadata)).not.toContain("@");
});
it("cancels only pending delivery to removed recipients and preserves sent history", async () => {
  const channel = (
    await http("post")
      .send({
        ...createBody(),
        recipients: ["team@example.com", "security@example.com"],
      })
      .expect(201)
  ).body;
  const source = await event();
  for (const [recipient, state, eventId] of [
    ["team@example.com", "PENDING", source.id],
    ["security@example.com", "PENDING", source.id],
    ["security@example.com", "SENT", null],
  ] as const)
    await db.notificationChannelDelivery.create({
      data: {
        channelId: channel.id,
        organizationId: org,
        recipient,
        state,
        eventId,
      },
    });
  await http("patch", "/" + channel.id)
    .send({ expectedRevision: 1, recipients: ["team@example.com"] })
    .expect(200);
  const deliveries = await db.notificationChannelDelivery.findMany({
    where: { channelId: channel.id },
  });
  expect(
    deliveries.find((delivery) => delivery.recipient === "team@example.com")
      ?.state,
  ).toBe("PENDING");
  expect(
    deliveries.find(
      (delivery) =>
        delivery.recipient === "security@example.com" &&
        delivery.eventId !== null,
    ),
  ).toMatchObject({
    state: "SKIPPED",
    failureCode: "RECIPIENT_REMOVED",
    leaseUntil: null,
  });
  expect(deliveries.find((delivery) => delivery.eventId === null)?.state).toBe(
    "SENT",
  );
});
it("pauses or removes channels transactionally and frees removed channel capacity", async () => {
  const channel = await create();
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 1 })
    .expect(201);
  await http("patch", "/" + channel.id)
    .send({ expectedRevision: 1, enabled: false })
    .expect(200);
  expect(
    await db.notificationChannelDelivery.count({
      where: { channelId: channel.id, state: "PENDING" },
    }),
  ).toBe(0);
  expect(
    (
      await db.notificationChannelDelivery.findFirstOrThrow({
        where: { channelId: channel.id },
      })
    ).failureCode,
  ).toBe("CHANNEL_DISABLED");
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 2 })
    .expect(400);
  await http("delete", "/" + channel.id)
    .send({ expectedRevision: 2 })
    .expect(200);
  expect((await http("get").expect(200)).body.items).toEqual([]);
  expect(
    (
      await db.organizationNotificationChannel.findUniqueOrThrow({
        where: { id: channel.id },
      })
    ).deletedAt,
  ).not.toBeNull();
  await create();
});
it("saves channel settings while email is unavailable and prevents unusable test delivery", async () => {
  vi.stubEnv("SMTP_HOST", "");
  const channel = await create();
  expect((await http("get").expect(200)).body.emailConfigured).toBe(false);
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 1 })
    .expect(503);
  await http("patch", "/" + channel.id)
    .send({ expectedRevision: 1, name: "Saved without transport" })
    .expect(200);
  vi.stubEnv("SMTP_HOST", "localhost");
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "false");
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 2 })
    .expect(503);
  vi.stubEnv("NOTIFICATION_EMAIL_ENABLED", "true");
  vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
  await http("post", "/" + channel.id + "/test")
    .send({ expectedRevision: 2 })
    .expect(503);
  expect(await db.notificationChannelDelivery.count()).toBe(0);
});
it("never changes personal preferences or creates identities when organization destinations are saved", async () => {
  await db.notificationPreference.create({
    data: {
      identityId: owner,
      organizationId: org,
      email: false,
      assessments: false,
    },
  });
  await create();
  expect(await db.identity.count()).toBe(4);
  expect(
    await db.notificationPreference.findUniqueOrThrow({
      where: {
        identityId_organizationId: { identityId: owner, organizationId: org },
      },
    }),
  ).toMatchObject({ email: false, assessments: false });
  expect(await db.notificationEmailDelivery.count()).toBe(0);
});

it("binds channel reads and mutations to the organization displayed when the request started", async () => {
  const channel = await create();
  await request(app.getHttpServer())
    .get("/notifications/channels")
    .set("Cookie", `channels.sid=${owner}`)
    .expect(409);
  for (const [method, path, body] of [
    ["get", "", undefined],
    ["post", "", createBody("Wrong org")],
    ["patch", "/" + channel.id, { expectedRevision: 1, enabled: false }],
    ["delete", "/" + channel.id, { expectedRevision: 1 }],
    ["post", "/" + channel.id + "/test", { expectedRevision: 1 }],
  ] as const) {
    const call = http(method, path).set("X-Preflyt-Organization", otherOrg);
    await (body ? call.send(body) : call).expect(409);
  }
  expect(await db.organizationNotificationChannel.count()).toBe(1);
  expect(await db.notificationChannelDelivery.count()).toBe(0);
});

it("reports all pending recipient deliveries even when the latest recipient has been sent", async () => {
  const channel = await create();
  await db.notificationChannelDelivery.createMany({
    data: [
      {
        channelId: channel.id,
        organizationId: org,
        recipient: "team@example.com",
        kind: "TEST",
        requestedById: owner,
        state: "PENDING",
        createdAt: new Date(Date.now() - 1000),
      },
      {
        channelId: channel.id,
        organizationId: org,
        recipient: "security@example.com",
        kind: "TEST",
        requestedById: owner,
        state: "SENT",
        sentAt: new Date(),
        createdAt: new Date(),
      },
    ],
  });
  const listed = (await http("get").expect(200)).body.items[0];
  expect(listed.lastDelivery.state).toBe("SENT");
  expect(listed.pendingDeliveries).toBe(1);
  await db.notificationChannelDelivery.updateMany({
    where: { channelId: channel.id, state: "PENDING" },
    data: { state: "SENT", sentAt: new Date() },
  });
  expect((await http("get").expect(200)).body.items[0].pendingDeliveries).toBe(
    0,
  );
});

it("allows the browser removal preflight with the displayed-organization request header", async () => {
  const response = await request(app.getHttpServer())
    .options("/notifications/channels/fixture-channel")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "DELETE")
    .set(
      "Access-Control-Request-Headers",
      "content-type,x-preflyt-organization",
    )
    .expect(204);
  expect(response.headers["access-control-allow-origin"]).toBe(origin);
  expect(response.headers["access-control-allow-credentials"]).toBe("true");
  expect(response.headers["access-control-allow-methods"].split(",")).toContain(
    "DELETE",
  );
  expect(
    response.headers["access-control-allow-headers"].toLowerCase().split(","),
  ).toContain("x-preflyt-organization");
});
