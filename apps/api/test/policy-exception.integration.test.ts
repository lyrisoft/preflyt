import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import {
  ForbiddenException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { disposableDatabase } from "./disposable-database.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { PolicyExceptionController } from "../src/assessments/policy-exception.controller.js";
import { PolicyExceptionService } from "../src/assessments/policy-exception.service.js";
import { digest } from "../src/assessments/assessment-digest.js";
import { deliverNotification } from "../src/notifications/notification-delivery.js";
let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  db: PrismaService,
  app: INestApplication,
  service: PolicyExceptionService;
let org: string,
  repo: string,
  policy: any,
  requester: string,
  reviewer: string,
  viewer: string,
  foreign: string;
const sha = "a".repeat(40),
  origin = "http://localhost:5173";
const base = () =>
  `/github/repositories/51/gate-policies/${policy.id}/exceptions`;
const payload = () => ({
  expectedPolicyHash: policy.definitionHash,
  sourceSha: sha,
  ruleIds: ["security"],
  reason: "Upstream scanner false positive tracked in issue 123.",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const post = (actor: string, path: string, body: unknown) =>
  request(app.getHttpServer())
    .post(path)
    .set("Cookie", `fixture.sid=${actor}`)
    .set("Origin", origin)
    .send(body);
const create = async () =>
  (await post(requester, base(), payload()).expect(201)).body;
const decide = (actor: string, row: any, decision = "approve") =>
  post(actor, `${base()}/${row.id}/${decision}`, {
    expectedHash: row.requestHash,
    expectedRevision: row.revision,
  });
const session = () => ({
  authenticated: true as const,
  identityId: reviewer,
  organizationId: org,
  subject: "fixture",
  role: "SUPER_ADMIN",
  email: null,
});
const scope = () => ({
  organizationId: org,
  repositoryId: repo,
  policyId: policy.id,
  policyHash: policy.definitionHash,
  branchRef: policy.branchRef,
  sourceSha: sha,
});
beforeAll(async () => {
  fixture = await disposableDatabase("exceptions");
  db = fixture.prisma;
  app = await NestFactory.create(
    {
      module: class ExceptionTest {},
      controllers: [PolicyExceptionController],
      providers: [
        SessionGuard,
        AuthorizationService,
        PolicyExceptionService,
        { provide: PrismaService, useValue: db },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "fixture.sid",
            assertOrigin: (value: string) => {
              if (value !== origin) throw new ForbiddenException();
            },
            currentSession: async (identityId: string) =>
              identityId
                ? { ...session(), identityId }
                : { authenticated: false },
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
  service = app.get(PolicyExceptionService);
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  vi.stubEnv("AUTOMATIC_CHECK_PUBLICATION_ENABLED", "true");
  await fixture.reset();
  org = (await db.organization.create({ data: { name: "fixture" } })).id;
  const otherOrg = (await db.organization.create({ data: { name: "other" } }))
    .id;
  const actors: string[] = [];
  for (const [name, role, organizationId] of [
    ["requester", "DEVELOPER", org],
    ["reviewer", "OWNER", org],
    ["viewer", "VIEWER", org],
    ["foreign", "OWNER", otherOrg],
  ] as const) {
    const identity = await db.identity.create({
      data: { issuer: "test", subject: name },
    });
    actors.push(identity.id);
    await db.organizationMembership.create({
      data: { identityId: identity.id, organizationId, role },
    });
  }
  [requester, reviewer, viewer, foreign] = actors;
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      accountLogin: "fixture",
      accountType: "Organization",
      permissions: {},
      repositorySelection: "selected",
      connectedById: reviewer,
      organizationId: org,
    },
  });
  repo = (
    await db.gitHubRepository.create({
      data: {
        githubId: 51n,
        installationId: 50n,
        name: "app",
        fullName: "fixture/app",
        ownerLogin: "fixture",
        isPrivate: true,
        selected: true,
      },
    })
  ).id;
  for (const identityId of [requester, viewer]) {
    const membership = await db.organizationMembership.findFirstOrThrow({
      where: { identityId, organizationId: org },
    });
    await db.repositoryGrant.create({
      data: { membershipId: membership.id, repositoryId: repo },
    });
  }
  await db.readinessAutomation.create({
    data: {
      repositoryId: repo,
      organizationId: org,
      actorId: reviewer,
      enabled: true,
    },
  });
  const selection = await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repo,
      revision: 1,
      profile: "DEFAULT",
      packs: [],
      selectedById: reviewer,
    },
  });
  const definition = {
    selectionId: selection.id,
    branchRef: "refs/heads/main",
    rules: [
      { id: "security", required: true, operator: "verified_check_succeeded" },
      { id: "tests", required: true, operator: "verified_check_succeeded" },
    ],
  };
  policy = await db.gatePolicyRevision.create({
    data: {
      repositoryId: repo,
      organizationId: org,
      branchRef: definition.branchRef,
      revision: 1,
      selectionId: selection.id,
      definition,
      definitionHash: digest(definition),
      state: "PUBLISHED",
      draftedById: requester,
      approvedById: reviewer,
      publishedAt: new Date(),
    },
  });
  const saved = { request: { sourceSha: sha }, plan: {}, report: {} };
  await db.commitAssessment.create({
    data: {
      repositoryId: repo,
      selectionId: selection.id,
      sourceSha: sha,
      requestKey: "fixture",
      inputHash: digest(saved),
      ...saved,
      assessmentHash: digest(saved),
    },
  });
});
it("requires an independent reviewer and preserves published policy and original assessment", async () => {
  const row = await create();
  await decide(requester, row).expect(403);
  const before = await db.commitAssessment.findFirstOrThrow();
  const approved = (await decide(reviewer, row).expect(201)).body;
  expect(approved.state).toBe("APPROVED");
  expect(await service.active(session(), "51", scope())).toHaveLength(1);
  expect(
    (
      await db.gatePolicyRevision.findUniqueOrThrow({
        where: { id: policy.id },
      })
    ).definitionHash,
  ).toBe(policy.definitionHash);
  expect((await db.commitAssessment.findFirstOrThrow()).assessmentHash).toBe(
    before.assessmentHash,
  );
  await decide(reviewer, row).expect(409);
});
it("does not let a local Super Admin approve their own request through an Owner role", async () => {
  const row = (await post(reviewer, base(), payload()).expect(201)).body;
  await decide(reviewer, row).expect(409);
});
it("recognizes linked historical identity ids as the same reviewer", async () => {
  const row = await create();
  await db.identityLoginLink.create({
    data: {
      sourceIdentityId: requester,
      targetIdentityId: reviewer,
      githubUserId: 101n,
    },
  });
  await decide(reviewer, row).expect(409);
});
it("rejects cross-organization access, viewer requests, wrong origins and unknown actions", async () => {
  const row = await create();
  await decide(foreign, row).expect(403);
  await post(viewer, base(), payload()).expect(403);
  await request(app.getHttpServer())
    .post(base())
    .set("Cookie", `fixture.sid=${requester}`)
    .set("Origin", "https://evil.example")
    .send(payload())
    .expect(403);
  await decide(reviewer, row, "toString").expect(400);
});
it("invalidates approved exceptions when reviewer authority is revoked", async () => {
  const row = await create();
  await decide(reviewer, row).expect(201);
  await db.organizationMembership.updateMany({
    where: { identityId: reviewer },
    data: { role: "VIEWER" },
  });
  // A separate authorized reader can still see policy data, but cannot use this approval.
  const reader = { ...session(), identityId: requester };
  expect(await service.active(reader, "51", scope())).toHaveLength(0);
});
it("rechecks requester access at approval and rejects changed policy/hash/check scope", async () => {
  const row = await create();
  await db.repositoryGrant.deleteMany({
    where: { membership: { identityId: requester } },
  });
  await decide(reviewer, row).expect(403);
  await post(reviewer, base(), {
    ...payload(),
    expectedPolicyHash: "c".repeat(64),
  }).expect(409);
  await post(reviewer, base(), {
    ...payload(),
    ruleIds: ["security", "tests"],
  }).expect(400);
});
it("revocation and expiry wake automatic publication and produce durable notices", async () => {
  const row = await create();
  const approved = (await decide(reviewer, row).expect(201)).body;
  await db.readinessTask.create({
    data: {
      repositoryId: repo,
      prNumber: 1,
      sourceSha: sha,
      nextAttemptAt: new Date(Date.now() + 3600000),
    },
  });
  await decide(requester, approved, "revoke").expect(201);
  expect(await service.active(session(), "51", scope())).toHaveLength(0);
  expect(
    (await db.readinessTask.findFirstOrThrow()).nextAttemptAt.getTime(),
  ).toBeLessThanOrEqual(Date.now());
  const next = await create();
  await db.policyException.update({
    where: { id: next.id },
    data: {
      createdAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await service.expire();
  await service.expire();
  expect(
    (await db.policyException.findUniqueOrThrow({ where: { id: next.id } }))
      .state,
  ).toBe("EXPIRED");
  expect(
    await db.notificationEvent.count({
      where: { type: "POLICY_EXCEPTION_EXPIRED" },
    }),
  ).toBe(1);
});
it("routes governance notifications to the requester and current reviewers without widening access", async () => {
  const row = await create();
  const event = await db.notificationEvent.findFirstOrThrow({
    where: { type: "POLICY_EXCEPTION_REQUESTED" },
  });
  await deliverNotification(db, event.id);
  const inbox = await db.inboxNotification.findMany({
    where: { eventId: event.id },
  });
  expect(inbox.map((item) => item.identityId).sort()).toEqual(
    [requester, reviewer].sort(),
  );
  expect(
    await db.policyException.findUnique({ where: { id: row.id } }),
  ).not.toBeNull();
});

it("serializes concurrent approval and rejection without duplicate events", async () => {
  const row = await create();
  const responses = await Promise.all([
    decide(reviewer, row),
    decide(reviewer, row, "reject"),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);
  const final = await db.policyException.findUniqueOrThrow({
    where: { id: row.id },
  });
  expect(["APPROVED", "REJECTED"]).toContain(final.state);
  expect(final.revision).toBe(2);
  expect(
    await db.notificationEvent.count({
      where: {
        type: {
          in: ["POLICY_EXCEPTION_APPROVED", "POLICY_EXCEPTION_REJECTED"],
        },
      },
    }),
  ).toBe(1);
});
it("requires renewed review after changing the policy or stored request content", async () => {
  const row = await create();
  await db.policyException.update({
    where: { id: row.id },
    data: { reason: "A different reason after the original review" },
  });
  await decide(reviewer, row).expect(409);
  await db.gatePolicyRevision.update({
    where: { id: policy.id },
    data: { state: "SUPERSEDED" },
  });
  await post(reviewer, base(), payload()).expect(404);
});
it("invalidates authority when the requester loses repository access after approval", async () => {
  const row = await create();
  await decide(reviewer, row).expect(201);
  await db.repositoryGrant.deleteMany({
    where: { membership: { identityId: requester } },
  });
  expect(await service.active(session(), "51", scope())).toHaveLength(0);
});
it("stops issuing allowed results in the final minute before an exception expires", async () => {
  const row = await create();
  await decide(reviewer, row).expect(201);
  const future = new Date(Date.now() + 40_000);
  const current = await db.policyException.findUniqueOrThrow({
    where: { id: row.id },
  });
  const { exceptionRequestHash } =
    await import("../src/assessments/policy-exception-contract.js");
  const changed = {
    ...current,
    ruleIds: current.ruleIds as string[],
    expiresAt: future,
  };
  await db.policyException.update({
    where: { id: row.id },
    data: { expiresAt: future, requestHash: exceptionRequestHash(changed) },
  });
  expect(await service.active(session(), "51", scope())).toHaveLength(0);
});

it("does not use expiring approvals without enabled automatic check refresh", async () => {
  const row = await create();
  await decide(reviewer, row).expect(201);
  await db.readinessAutomation.update({
    where: { repositoryId: repo },
    data: { enabled: false },
  });
  expect(await service.active(session(), "51", scope())).toHaveLength(0);
  await db.readinessAutomation.update({
    where: { repositoryId: repo },
    data: { enabled: true },
  });
  vi.stubEnv("AUTOMATIC_CHECK_PUBLICATION_ENABLED", "false");
  expect(await service.active(session(), "51", scope())).toHaveLength(0);
});
