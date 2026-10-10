import {disposableDatabase} from './disposable-database.js'
let fixture: Awaited<ReturnType<typeof disposableDatabase>>
import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import {
  ForbiddenException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import {
  GatePolicyService,
  composeGatePolicy,
  validPolicyBranch,
} from "../src/assessments/gate-policy.service.js";
import { GatePolicyController } from "../src/assessments/gate-policy.controller.js";
import { catalogue } from "../src/standards/catalogue.js";
let db: PrismaService, app: INestApplication;
let organizationId: string,
  repoId: string,
  selectionId: string,
  author: string,
  approver: string,
  viewer: string,
  foreign: string;
const base = "/github/repositories/51/gate-policies",
  origin = "http://localhost:5173";
const packs = () =>
  catalogue
    .slice(0, 1)
    .map(({ id, version, digest }) => ({ id, version, digest }));
const body = () => ({
  expectedSelectionId: selectionId,
  branchRef: "refs/heads/development",
  requiredRules: [],
});
const post = (actor: string, path: string, value: unknown) =>
  request(app.getHttpServer())
    .post(path)
    .set("Cookie", `policy.sid=${actor}`)
    .set("Origin", origin)
    .send(value);
const draft = () => post(author, base, body()).expect(201);
const approve = (p: any) =>
  post(approver, `${base}/${p.id}/approve`, {
    expectedHash: p.definitionHash,
  }).expect(201);
beforeAll(async () => {
  fixture = await disposableDatabase('gatepolicy')
  db = fixture.prisma
  app = await NestFactory.create(
    {
      module: class PoliciesTest {},
      controllers: [GatePolicyController],
      providers: [
        SessionGuard,
        AuthorizationService,
        GatePolicyService,
        { provide: PrismaService, useValue: db },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "policy.sid",
            assertOrigin: (value: string) => {
              if (value !== origin) throw new ForbiddenException();
            },
            currentSession: async (identityId?: string) =>
              identityId
                ? {
                    authenticated: true,
                    identityId,
                    subject: "test",
                    email: null,
                    role: "SUPER_ADMIN",
                    organizationId,
                  }
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
});
afterAll(async () => {
  await app?.close();
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.reset()
  await db.gitHubRepository.deleteMany();
  await db.gitHubInstallation.deleteMany();
  await db.organization.deleteMany();
  await db.identity.deleteMany();
  await db.auditEvent.deleteMany();
  organizationId = (await db.organization.create({ data: { name: "fixture" } }))
    .id;
  const second = (await db.organization.create({ data: { name: "foreign" } }))
    .id;
  const ids = [];
  for (const [subject, role, org] of [
    ["author", "POLICY_MANAGER", organizationId],
    ["approver", "OWNER", organizationId],
    ["viewer", "VIEWER", organizationId],
    ["foreign", "OWNER", second],
  ] as const) {
    const identity = await db.identity.create({
      data: { issuer: "test", subject },
    });
    ids.push(identity.id);
    await db.organizationMembership.create({
      data: { identityId: identity.id, organizationId: org, role },
    });
  }
  [author, approver, viewer, foreign] = ids;
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      accountLogin: "fixture",
      accountType: "Organization",
      permissions: {},
      repositorySelection: "selected",
      connectedById: approver,
      organizationId,
    },
  });
  repoId = (
    await db.gitHubRepository.create({
      data: {
        githubId: 51n,
        installationId: 50n,
        name: "fixture",
        fullName: "fixture/app",
        ownerLogin: "fixture",
        isPrivate: true,
        selected: true,
      },
    })
  ).id;
  for (const identityId of [author, viewer]) {
    const member = await db.organizationMembership.findFirstOrThrow({
      where: { identityId, organizationId },
    });
    await db.repositoryGrant.create({
      data: { membershipId: member.id, repositoryId: repoId },
    });
  }
  selectionId = (
    await db.repositoryStandardsSelection.create({
      data: {
        repositoryId: repoId,
        revision: 1,
        profile: "DEFAULT",
        packs: packs(),
        selectedById: approver,
      },
    })
  ).id;
});
it("freezes immutable versions and requires independent approval before advisory publication", async () => {
  const d = (await draft()).body;
  expect(d.definition).toMatchObject({
    mode: "ADVISORY",
    branchRef: "refs/heads/development",
    packs: packs(),
    enforcement: "DISABLED",
  });
  await post(author, `${base}/${d.id}/approve`, {
    expectedHash: d.definitionHash,
  }).expect(409);
  await post(author, `${base}/${d.id}/publish`, {
    expectedHash: d.definitionHash,
    expectedPublishedId: null,
  }).expect(409);
  await approve(d);
  const published = await post(author, `${base}/${d.id}/publish`, {
    expectedHash: d.definitionHash,
    expectedPublishedId: null,
  }).expect(201);
  expect(published.body).toMatchObject({
    state: "PUBLISHED",
    approvedById: approver,
    publishedById: author,
    definitionHash: d.definitionHash,
  });
  expect(
    await db.auditEvent.count({
      where: {
        event: {
          in: ["policy.drafted", "policy.approved", "policy.published"],
        },
      },
    }),
  ).toBe(3);
});
it("rejects anonymous, foreign organization, unassigned and read-only actors regardless of platform role label", async () => {
  await request(app.getHttpServer()).get(base).expect(401);
  await post(foreign, base, body()).expect(403);
  await post(viewer, base, body()).expect(403);
  await db.repositoryGrant.deleteMany({ where: { repositoryId: repoId } });
  await post(author, base, body()).expect(403);
  await request(app.getHttpServer())
    .get(base)
    .set("Cookie", `policy.sid=${viewer}`)
    .expect(403);
  expect(await db.gatePolicyRevision.count()).toBe(0);
});
it("fails closed for stale selection, changed hashes, cross-repository IDs and forbidden enforcement fields", async () => {
  await post(author, base, { ...body(), expectedSelectionId: "stale" }).expect(
    409,
  );
  await post(author, base, { ...body(), mode: "ENFORCE" }).expect(400);
  const d = (await draft()).body;
  await post(approver, `${base}/${d.id}/approve`, {
    expectedHash: "f".repeat(64),
  }).expect(409);
  await post(approver, `${base}/unavailable/approve`, {
    expectedHash: d.definitionHash,
  }).expect(404);
  await db.gatePolicyRevision.update({
    where: { id: d.id },
    data: { definition: { version: 99 } },
  });
  await post(approver, `${base}/${d.id}/approve`, {
    expectedHash: d.definitionHash,
  }).expect(409);
});
it("requires review of new baseline versions and rechecks the approver live at publication", async () => {
  const d = (await draft()).body;
  await approve(d);
  await db.organizationMembership.updateMany({
    where: { identityId: approver },
    data: { active: false },
  });
  await post(author, `${base}/${d.id}/publish`, {
    expectedHash: d.definitionHash,
    expectedPublishedId: null,
  }).expect(403);
  await db.organizationMembership.updateMany({
    where: { identityId: approver },
    data: { active: true },
  });
  await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repoId,
      revision: 2,
      profile: "STRICT",
      packs: packs(),
      selectedById: approver,
    },
  });
  await post(author, `${base}/${d.id}/publish`, {
    expectedHash: d.definitionHash,
    expectedPublishedId: null,
  }).expect(409);
});
it("requires optimistic concurrency and prevents older drafts replacing newer publications", async () => {
  const one = (await draft()).body,
    two = (await draft()).body;
  await approve(one);
  await approve(two);
  await post(author, `${base}/${two.id}/publish`, {
    expectedHash: two.definitionHash,
    expectedPublishedId: null,
  }).expect(201);
  await post(author, `${base}/${one.id}/publish`, {
    expectedHash: one.definitionHash,
    expectedPublishedId: null,
  }).expect(409);
  await post(author, `${base}/${one.id}/publish`, {
    expectedHash: one.definitionHash,
    expectedPublishedId: two.id,
  }).expect(409);
  const three = (await draft()).body;
  await approve(three);
  await post(author, `${base}/${three.id}/publish`, {
    expectedHash: three.definitionHash,
    expectedPublishedId: two.id,
  }).expect(201);
  expect(
    (await db.gatePolicyRevision.findUniqueOrThrow({ where: { id: two.id } }))
      .state,
  ).toBe("SUPERSEDED");
});
it("rolls back transitions if audit persistence fails", async () => {
  const d = (await draft()).body;
  const tx = db.$transaction.bind(db);
  const broken = {
    $transaction: (fn: any, options: any) =>
      tx(
        (client: any) =>
          fn(
            new Proxy(client, {
              get(target, key) {
                return key === "auditEvent"
                  ? {
                      create: () => {
                        throw Error("audit unavailable");
                      },
                    }
                  : Reflect.get(target, key);
              },
            }),
          ),
        options,
      ),
  } as PrismaService;
  const access = new AuthorizationService(db);
  const session = {
    authenticated: true as const,
    identityId: approver,
    organizationId,
    subject: "test",
    email: null,
    role: "OWNER",
  };
  await expect(
    new GatePolicyService(broken, access).approve(
      session,
      "51",
      d.id,
      d.definitionHash,
    ),
  ).rejects.toThrow("audit unavailable");
  expect(
    (await db.gatePolicyRevision.findUniqueOrThrow({ where: { id: d.id } }))
      .state,
  ).toBe("DRAFT");
});
it("allows strengthening advisory rules and preserves every mandatory baseline rule", () => {
  const base = composeGatePolicy(
    { id: selectionId, profile: "DEFAULT", packs: packs() },
    "refs/heads/development",
    [],
  );
  const advisory = base.rules.find((rule) => !rule.required)!;
  const stronger = composeGatePolicy(
    { id: selectionId, profile: "DEFAULT", packs: packs() },
    "refs/heads/development",
    [advisory.id],
  );
  expect(stronger.rules.find((rule) => rule.id === advisory.id)?.required).toBe(
    true,
  );
  expect(stronger.rules.filter((rule) => rule.required).length).toBe(
    base.rules.filter((rule) => rule.required).length + 1,
  );
  expect(() =>
    composeGatePolicy(
      { id: selectionId, profile: "DEFAULT", packs: packs() },
      "refs/heads/development",
      ["unknown"],
    ),
  ).toThrow();
});
it.each([
  "main",
  "refs/heads/",
  "refs/heads/a..b",
  "refs/heads/a.lock",
  "refs/heads/a b",
  "refs/heads/a*",
  "refs/heads/.hidden",
  "refs/heads/a/",
  "refs/heads/a@{1}",
])("rejects unsafe or ambiguous branch %s", (ref) =>
  expect(validPolicyBranch(ref)).toBe(false),
);

it("allows an active scoped Super Admin to self-approve, audits it, and rechecks the role before publishing", async () => {
  await db.membership.create({
    data: { identityId: author, role: "SUPER_ADMIN" },
  });
  const d = (await draft()).body;
  const approved = await post(author, `${base}/${d.id}/approve`, {
    expectedHash: d.definitionHash,
  }).expect(201);
  expect(approved.body.approvalKind).toBe("SUPER_ADMIN_SELF_APPROVAL");
  expect(
    await db.auditEvent.findFirst({
      where: { event: "policy.super_admin_self_approved" },
    }),
  ).toMatchObject({ actorId: author });
  await db.membership.update({
    where: { identityId: author },
    data: { active: false },
  });
  await post(author, `${base}/${d.id}/publish`, {
    expectedHash: d.definitionHash,
    expectedPublishedId: null,
  }).expect(409);
  await db.membership.update({
    where: { identityId: author },
    data: { active: true },
  });
  await post(author, `${base}/${d.id}/publish`, {
    expectedHash: d.definitionHash,
    expectedPublishedId: null,
  }).expect(201);
});

it("edits a stale draft in place using current standards, records the previous definition and requires approval again", async () => {
  const d = (await draft()).body;
  selectionId = (
    await db.repositoryStandardsSelection.create({
      data: {
        repositoryId: repoId,
        revision: 2,
        profile: "STRICT",
        packs: packs(),
        selectedById: approver,
      },
    })
  ).id;
  const edited = (
    await post(approver, `${base}/${d.id}/edit`, {
      ...body(),
      expectedHash: d.definitionHash,
    }).expect(201)
  ).body;
  expect(edited.id).toBe(d.id);
  expect(edited.revision).toBe(d.revision);
  expect(edited.selectionId).toBe(selectionId);
  expect(edited.definition.adoptionProfile).toBe("STRICT");
  expect(edited.definitionHash).not.toBe(d.definitionHash);
  expect(edited.draftedById).toBe(approver);
  expect(edited.approvedById).toBeNull();
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { event: "policy.draft_updated" },
  });
  expect(audit.metadata).toMatchObject({
    previousHash: d.definitionHash,
    previousSelectionId: d.selectionId,
    previousDefinition: d.definition,
  });
  await post(approver, `${base}/${d.id}/approve`, {
    expectedHash: edited.definitionHash,
  }).expect(409);
  await post(author, `${base}/${d.id}/approve`, {
    expectedHash: edited.definitionHash,
  }).expect(201);
  await post(author, `${base}/${d.id}/edit`, {
    ...body(),
    expectedHash: edited.definitionHash,
  }).expect(409);
});
it("rejects unauthorized, foreign, stale-hash and stale-standards draft edits", async () => {
  const d = (await draft()).body;
  const edit = { ...body(), expectedHash: d.definitionHash };
  await post(viewer, `${base}/${d.id}/edit`, edit).expect(403);
  await post(foreign, `${base}/${d.id}/edit`, edit).expect(403);
  await post(author, `${base}/${d.id}/edit`, {
    ...edit,
    expectedHash: "0".repeat(64),
  }).expect(409);
  await post(author, `${base}/${d.id}/edit`, {
    ...edit,
    expectedSelectionId: "older",
  }).expect(409);
  await post(author, `${base}/${d.id}/edit`, {
    ...edit,
    branchRef: "refs/heads/main",
  }).expect(400);
  await post(author, `${base}/${d.id}/edit`, {
    ...edit,
    requiredRules: ["unknown"],
  }).expect(400);
  expect(
    (await db.gatePolicyRevision.findUniqueOrThrow({ where: { id: d.id } }))
      .definitionHash,
  ).toBe(d.definitionHash);
});
