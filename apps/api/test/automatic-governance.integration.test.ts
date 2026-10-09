import { NestFactory } from "@nestjs/core";
import { ForbiddenException, type INestApplication } from "@nestjs/common";
import request from "supertest";
import cookieParser from "cookie-parser";
import { ReadinessAutomationController } from "../src/assessments/readiness-automation.controller.js";
import { RulesetDeploymentController } from "../src/github/ruleset-deployment.controller.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
import { AssessmentService } from "../src/assessments/assessment.service.js";
import { CheckPublicationService } from "../src/assessments/check-publication.service.js";
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import {
  ReadinessAutomationService,
  automaticExternalId,
} from "../src/assessments/readiness-automation.service.js";
import { RulesetDeploymentService } from "../src/github/ruleset-deployment.service.js";
import {
  GovernanceProvider,
  matchesRuleset,
  rulesetProjection,
} from "../src/github/governance-provider.js";
import { draftDefinition, draftHash } from "../src/github/ruleset-draft.js";
import { digest } from "../src/assessments/assessment-digest.js";
let app: INestApplication;
const name = "preflyt_automatic_test_" + randomUUID().replaceAll("-", "");
let db: PrismaService,
  admin: Client,
  created = false,
  repo: any,
  org: string,
  owner: any,
  reviewer: any,
  selection: any,
  policy: any,
  automation: ReadinessAutomationService,
  deployments: RulesetDeploymentService,
  access: AuthorizationService,
  task: any,
  draft: any;
const sha = "a".repeat(40);
const context = {
  version: 1,
  head: { repositoryId: "51", ref: "feature", sha },
  base: { repositoryId: "51", ref: "main", sha: "b".repeat(40) },
  state: "open",
  merged: false,
  draft: false,
};
const receipt = {
  checkRunId: "12",
  appId: "999",
  htmlUrl: "https://github.com/fixture/repo/runs/12",
};
const github = {
  readOpenReadinessPullRequests: vi.fn(),
  readPullRequest: vi.fn(),
  checkPublicationAccess: vi.fn(),
  publishReadinessCheck: vi.fn(),
  readPublishedReadinessCheck: vi.fn(),
  verifyReadinessBranch: vi.fn(),
  assertNoReadinessMergeQueue: vi.fn(),
};
const assessments = { createAutomatic: vi.fn() };
const checks = { plan: vi.fn() };
let live: any, connection: any;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Local PostgreSQL required");
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
  app = await NestFactory.create(
    {
      module: class AutomationTest {},
      controllers: [ReadinessAutomationController, RulesetDeploymentController],
      providers: [
        SessionGuard,
        AuthorizationService,
        ReadinessAutomationService,
        RulesetDeploymentService,
        { provide: PrismaService, useValue: db },
        { provide: GitHubProviderService, useValue: github },
        { provide: AssessmentService, useValue: assessments },
        { provide: CheckPublicationService, useValue: checks },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "test.sid",
            assertOrigin: (origin: string) => {
              if (origin !== "http://localhost:5173")
                throw new ForbiddenException("Invalid origin");
            },
            currentSession: async (identityId?: string) =>
              identityId
                ? {
                    authenticated: true,
                    identityId,
                    subject: "test",
                    role: "USER",
                    email: null,
                    organizationId: org,
                  }
                : { authenticated: false },
          },
        },
      ],
    },
    { logger: false },
  );
  app.use(cookieParser());
  await app.init();
}, 30000);
afterAll(async () => {
  await app?.close();
  await db?.$disconnect();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.stubEnv("NOTIFICATIONS_ENABLED", "false");
  await db.notificationEvent.deleteMany();
  await db.gitHubRepository.deleteMany();
  await db.gitHubInstallation.deleteMany();
  await db.organization.deleteMany();
  await db.identity.deleteMany();
  await db.auditEvent.deleteMany();
  for (const flag of [
    "GITHUB_CHECK_PUBLICATION_ENABLED",
    "AUTOMATIC_CHECK_PUBLICATION_ENABLED",
    "GITHUB_RULESET_ACTIVATION_ENABLED",
  ])
    vi.stubEnv(flag, "true");
  org = (await db.organization.create({ data: { name: "fixture" } })).id;
  const actors = [];
  for (const subject of ["owner", "reviewer"]) {
    const i = await db.identity.create({
      data: { issuer: "fixture", subject },
    });
    await db.organizationMembership.create({
      data: { identityId: i.id, organizationId: org, role: "OWNER" },
    });
    actors.push({
      authenticated: true,
      identityId: i.id,
      organizationId: org,
      subject,
      email: null,
      role: "OWNER",
    });
  }
  [owner, reviewer] = actors;
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      connectedById: owner.identityId,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
      organizationId: org,
    },
  });
  repo = await db.gitHubRepository.create({
    data: {
      githubId: 51n,
      installationId: 50n,
      name: "repo",
      fullName: "fixture/repo",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
    },
  });
  selection = await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repo.id,
      revision: 1,
      profile: "RECOMMENDED",
      packs: [],
      selectedById: owner.identityId,
    },
  });
  policy = await db.gatePolicyRevision.create({
    data: {
      repositoryId: repo.id,
      organizationId: org,
      branchRef: "refs/heads/main",
      revision: 1,
      selectionId: selection.id,
      state: "PUBLISHED",
      definition: {},
      definitionHash: digest({}),
      draftedById: owner.identityId,
      publishedAt: new Date(),
    },
  });
  await db.readinessAutomation.create({
    data: {
      repositoryId: repo.id,
      organizationId: org,
      actorId: owner.identityId,
      enabled: true,
    },
  });
  task = await db.readinessTask.create({
    data: { repositoryId: repo.id, prNumber: 7 },
  });
  access = new AuthorizationService(db);
  automation = new ReadinessAutomationService(
    db,
    access,
    github as any,
    assessments as any,
    checks as any,
  );
  deployments = new RulesetDeploymentService(
    db,
    access,
    github as any,
    checks as any,
  );
  github.readOpenReadinessPullRequests.mockResolvedValue([
    {
      number: 7,
      headSha: sha,
      headRepositoryId: "51",
      baseBranch: "main",
      draft: false,
    },
  ]);
  github.readPullRequest.mockResolvedValue({
    context: structuredClone(context),
    sourceObjectId: "77",
  });
  github.checkPublicationAccess.mockResolvedValue({ appId: "999" });
  github.verifyReadinessBranch.mockResolvedValue("b".repeat(40));
  github.publishReadinessCheck.mockResolvedValue(receipt);
  assessments.createAutomatic.mockResolvedValue({
    assessment: { id: "assessment" },
  });
  checks.plan.mockResolvedValue({
    previewHash: "preview",
    policy,
    policyEvaluation: { evaluationHash: "evaluation" },
    payload: {
      name: "Preflyt / Engineering Readiness",
      head_sha: sha,
      external_id: "c".repeat(64),
      status: "completed",
      conclusion: "success",
      output: { title: "Passed", summary: "Verified policy proof" },
    },
  });
  github.readPublishedReadinessCheck.mockResolvedValue({
    appId: "999",
    externalId: automaticExternalId(repo.id, 7, sha),
    conclusion: "success",
    output: { title: "Passed", summary: "Verified policy proof" },
  });
  live = undefined;
  connection = {
    config: { appId: "1001", installationId: 500n, localAcceptance: false },
    create: vi.fn(async (definition: any) => {
      live = { id: "321", definition, hash: digest(definition) };
      return live;
    }),
    read: vi.fn(async () => live),
    disable: vi.fn(async (id: string, expectedHash: string) => {
      if (live.hash !== expectedHash) throw new Error("drift");
      live = {
        ...live,
        definition: { ...live.definition, enforcement: "disabled" },
      };
      live.hash = digest(live.definition);
      return live;
    }),
  };
  vi.spyOn(GovernanceProvider.prototype, "open").mockResolvedValue(connection);
  const input = {
    name: "Protection",
    profile: "STANDARD" as const,
    branches: ["main"],
    approvals: 1,
    requirePullRequest: true,
    resolveConversations: false,
    preventForcePush: true,
    preventDeletion: true,
    expectedSelectionId: selection.id,
  };
  const definition = draftDefinition(input, "51");
  draft = await db.gitHubRulesetDraft.create({
    data: {
      repositoryId: repo.id,
      organizationId: org,
      name: "Protection",
      profile: "STANDARD",
      options: input,
      definition,
      definitionHash: draftHash({
        definition,
        selectionId: selection.id,
        packs: [],
      }),
      selectionId: selection.id,
      packs: [],
      draftedById: owner.identityId,
    },
  });
});
const row = () =>
  db.readinessTask.findUniqueOrThrow({ where: { id: task.id } });
const due = () =>
  db.readinessTask.update({
    where: { id: task.id },
    data: { nextAttemptAt: new Date(0) },
  });
it("publishes automatically after invalidating former green state and records verified policy proof", async () => {
  await automation.process(task.id);
  expect(
    github.publishReadinessCheck.mock.calls.map((c) => c[2].conclusion),
  ).toEqual(["action_required", "success"]);
  expect(await row()).toMatchObject({
    state: "PUBLISHED",
    sourceSha: sha,
    conclusion: "success",
    policyId: policy.id,
    evaluationHash: "evaluation",
    leaseToken: null,
  });
  expect(github.publishReadinessCheck.mock.calls[1][2].external_id).toBe(
    automaticExternalId(repo.id, 7, sha),
  );
});
it.each(["failure", "action_required"])(
  "keeps %s evaluations non-passing",
  async (conclusion) => {
    const plan = await checks.plan();
    checks.plan.mockResolvedValue({
      ...plan,
      payload: { ...plan.payload, conclusion },
    });
    await automation.process(task.id);
    expect((await row()).conclusion).toBe(conclusion);
  },
);
it("revoked publisher access invalidates the check and retries instead of passing", async () => {
  await automation.process(task.id);
  await due();
  github.publishReadinessCheck.mockClear();
  await db.organizationMembership.updateMany({
    where: { identityId: owner.identityId },
    data: { active: false },
  });
  await automation.process(task.id);
  expect(
    github.publishReadinessCheck.mock.calls.every(
      (c) => c[2].conclusion === "action_required",
    ),
  ).toBe(true);
  expect(await row()).toMatchObject({ state: "INCOMPLETE", attempts: 1 });
});
it("changed automation generation cannot finish or leave a green result", async () => {
  checks.plan.mockImplementation(async () => {
    await db.readinessAutomation.update({
      where: { repositoryId: repo.id },
      data: { revision: { increment: 1 } },
    });
    return { previewHash: "preview" };
  });
  await automation.process(task.id);
  expect(
    github.publishReadinessCheck.mock.calls.every(
      (c) => c[2].conclusion === "action_required",
    ),
  ).toBe(true);
  expect((await row()).leaseToken).toBeNull();
});
it("lease excludes concurrent workers and timeout outcomes stay UNKNOWN until recovery", async () => {
  await db.readinessTask.update({
    where: { id: task.id },
    data: { leaseToken: "other", leaseUntil: new Date(Date.now() + 60000) },
  });
  await automation.process(task.id);
  expect(github.publishReadinessCheck).not.toHaveBeenCalled();
  await db.readinessTask.update({
    where: { id: task.id },
    data: { leaseToken: null, leaseUntil: null },
  });
  github.publishReadinessCheck.mockRejectedValue(
    new DOMException("timeout", "TimeoutError"),
  );
  await automation.process(task.id);
  expect(await row()).toMatchObject({
    state: "UNKNOWN",
    attempts: 1,
    leaseToken: null,
  });
});
it("closed PR and disabled runtime invalidate formerly passing checks", async () => {
  await automation.process(task.id);
  await due();
  github.publishReadinessCheck.mockClear();
  github.readPullRequest.mockResolvedValue({
    context: { ...context, state: "closed" },
    sourceObjectId: "77",
  });
  await automation.process(task.id);
  expect((await row()).state).toBe("DISABLED");
  expect(
    github.publishReadinessCheck.mock.calls.every(
      (c) => c[2].conclusion === "action_required",
    ),
  ).toBe(true);
});
it("head changes invalidate the old commit before publishing on the new commit", async () => {
  await automation.process(task.id);
  await due();
  github.publishReadinessCheck.mockClear();
  const next = "d".repeat(40);
  github.readPullRequest.mockResolvedValue({
    context: { ...context, head: { ...context.head, sha: next } },
    sourceObjectId: "77",
  });
  const plan = await checks.plan();
  checks.plan.mockResolvedValue({
    ...plan,
    payload: { ...plan.payload, head_sha: next },
  });
  await automation.process(task.id);
  expect(github.publishReadinessCheck.mock.calls[0][2]).toMatchObject({
    head_sha: sha,
    conclusion: "action_required",
  });
  expect(github.publishReadinessCheck.mock.calls.at(-1)?.[2]).toMatchObject({
    head_sha: next,
    conclusion: "success",
  });
});
it("fails activation without an automatically verified passing canary", async () => {
  await expect(
    deployments.preview(owner, "51", draft.id, draft.definitionHash),
  ).rejects.toThrow("passing PR check");
  expect(connection.create).not.toHaveBeenCalled();
});
it("requires independent approval and binds activation to exact repo, branch and publisher App", async () => {
  await automation.process(task.id);
  const proposal = await deployments.preview(
    owner,
    "51",
    draft.id,
    draft.definitionHash,
  );
  await expect(
    deployments.approve(owner, "51", proposal.id, proposal.previewHash),
  ).rejects.toThrow("Another authorized");
  await expect(
    deployments.deploy(owner, "51", proposal.id, proposal.previewHash),
  ).rejects.toThrow("independently approved");
  await deployments.approve(reviewer, "51", proposal.id, proposal.previewHash);
  await deployments.deploy(owner, "51", proposal.id, proposal.previewHash);
  expect(live.definition.conditions).toEqual({
    repository_id: { repository_ids: [51] },
    ref_name: { include: ["refs/heads/main"], exclude: [] },
  });
  expect(
    live.definition.rules.find((r: any) => r.type === "required_status_checks")
      .parameters.required_status_checks,
  ).toEqual([
    { context: "Preflyt / Engineering Readiness", integration_id: 999 },
  ]);
  expect(live.definition.bypass_actors).toEqual([]);
  await expect(automation.configure(owner, "51", false, 1)).rejects.toThrow(
    "Roll back",
  );
  await deployments.rollback(owner, "51", proposal.id, proposal.previewHash);
  expect(live.definition.enforcement).toBe("disabled");
  await automation.configure(owner, "51", false, 1);
});
it("changed PR impact rejects an approved activation", async () => {
  await automation.process(task.id);
  const proposal = await deployments.preview(
    owner,
    "51",
    draft.id,
    draft.definitionHash,
  );
  await deployments.approve(reviewer, "51", proposal.id, proposal.previewHash);
  github.readOpenReadinessPullRequests.mockResolvedValue([]);
  await expect(
    deployments.deploy(owner, "51", proposal.id, proposal.previewHash),
  ).rejects.toThrow("passing PR check");
  expect(connection.create).not.toHaveBeenCalled();
});
it("detects drift and refuses blind rollback", async () => {
  await automation.process(task.id);
  const proposal = await deployments.preview(
    owner,
    "51",
    draft.id,
    draft.definitionHash,
  );
  await deployments.approve(reviewer, "51", proposal.id, proposal.previewHash);
  await deployments.deploy(owner, "51", proposal.id, proposal.previewHash);
  live.definition = {
    ...live.definition,
    bypass_actors: [{ actor_type: "OrganizationAdmin", bypass_mode: "always" }],
  };
  live.hash = digest(live.definition);
  expect(
    await deployments.refresh(owner, "51", proposal.id, proposal.previewHash),
  ).toMatchObject({ state: "DRIFTED" });
  await expect(
    deployments.rollback(owner, "51", proposal.id, proposal.previewHash),
  ).rejects.toThrow("Only a verified");
  expect(connection.disable).not.toHaveBeenCalled();
});
it("unknown activation writes recover the same durable proposal", async () => {
  await automation.process(task.id);
  const proposal = await deployments.preview(
    owner,
    "51",
    draft.id,
    draft.definitionHash,
  );
  await deployments.approve(reviewer, "51", proposal.id, proposal.previewHash);
  connection.create.mockRejectedValueOnce(new Error("timeout"));
  await expect(
    deployments.deploy(owner, "51", proposal.id, proposal.previewHash),
  ).rejects.toThrow("could not be verified");
  expect(
    (
      await db.gitHubRulesetDeployment.findUniqueOrThrow({
        where: { id: proposal.id },
      })
    ).state,
  ).toBe("UNKNOWN");
  await deployments.deploy(owner, "51", proposal.id, proposal.previewHash);
  expect(
    (
      await db.gitHubRulesetDeployment.findUniqueOrThrow({
        where: { id: proposal.id },
      })
    ).state,
  ).toBe("ACTIVE");
});
it("canonical draft hashes survive database JSON key ordering; rule verification refuses altered scope", () => {
  expect(draftHash({ a: 1, b: 2 })).toBe(draftHash({ b: 2, a: 1 }));
  expect(
    matchesRuleset(
      { conditions: { repository_id: { repository_ids: [51] } } },
      { conditions: { repository_id: { repository_ids: [51, 52] } } },
    ),
  ).toBe(false);
  expect(
    rulesetProjection({
      id: 1,
      name: "x",
      rules: [],
      enforcement: "active",
      target: "branch",
      conditions: {},
      source: "fixture",
    }),
  ).not.toHaveProperty("id");
});

it("HTTP routes reject unauthenticated users, wrong origins, malformed settings and viewers", async () => {
  const root = "/github/repositories/51/check-automation";
  await request(app.getHttpServer()).get(root).expect(401);
  const post = (body: unknown, origin = "http://localhost:5173") =>
    request(app.getHttpServer())
      .post(root)
      .set("Cookie", "test.sid=" + owner.identityId)
      .set("Origin", origin)
      .send(body);
  await post(
    { enabled: false, expectedRevision: 1 },
    "https://untrusted.example",
  ).expect(403);
  await post({ enabled: "yes", expectedRevision: 1 }).expect(400);
  await post({ enabled: false, expectedRevision: 1, extra: "field" }).expect(
    400,
  );
  await db.organizationMembership.updateMany({
    where: { identityId: owner.identityId },
    data: { role: "VIEWER" },
  });
  await post({ enabled: false, expectedRevision: 1 }).expect(403);
  await request(app.getHttpServer())
    .get(root + "?page=0")
    .set("Cookie", "test.sid=" + reviewer.identityId)
    .expect(400);
});
it("HTTP deployment permission remains distinct from policy publication and private scope is hidden", async () => {
  await db.organizationMembership.updateMany({
    where: { identityId: owner.identityId },
    data: { role: "POLICY_MANAGER" },
  });
  await request(app.getHttpServer())
    .post("/github/repositories/51/ruleset-deployments/preview")
    .set("Cookie", "test.sid=" + owner.identityId)
    .set("Origin", "http://localhost:5173")
    .send({ draftId: draft.id, expectedDraftHash: draft.definitionHash })
    .expect(403);
  await request(app.getHttpServer())
    .get("/github/repositories/52/check-automation")
    .set("Cookie", "test.sid=" + owner.identityId)
    .expect(403);
});

it("records only confirmed non-passing readiness changes once per PR head and policy", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  const plan = await checks.plan();
  checks.plan.mockResolvedValue({
    ...plan,
    policyEvaluation: { ...plan.policyEvaluation, status: "BLOCK" },
    payload: { ...plan.payload, conclusion: "failure" },
  });
  await automation.process(task.id);
  await due();
  await automation.process(task.id);
  expect(
    await db.notificationEvent.findMany({ where: { repositoryId: repo.id } }),
  ).toHaveLength(1);
  expect(
    await db.notificationEvent.findFirst({ where: { repositoryId: repo.id } }),
  ).toMatchObject({
    type: "READINESS_BLOCKED",
    severity: "error",
    sourceSha: sha,
    organizationId: org,
  });
});
it("creates activation, drift and rollback outbox events with verified deployment state", async () => {
  vi.stubEnv("NOTIFICATIONS_ENABLED", "true");
  const plan = await checks.plan();
  checks.plan.mockResolvedValue({
    ...plan,
    policyEvaluation: { ...plan.policyEvaluation, status: "PASS" },
  });
  await automation.process(task.id);
  const proposal = await deployments.preview(
    owner,
    "51",
    draft.id,
    draft.definitionHash,
  );
  await deployments.approve(reviewer, "51", proposal.id, proposal.previewHash);
  await deployments.deploy(owner, "51", proposal.id, proposal.previewHash);
  const original = structuredClone(live);
  live.definition = {
    ...live.definition,
    bypass_actors: [{ actor_type: "OrganizationAdmin", bypass_mode: "always" }],
  };
  live.hash = digest(live.definition);
  await deployments.refresh(owner, "51", proposal.id, proposal.previewHash);
  await deployments.refresh(owner, "51", proposal.id, proposal.previewHash);
  live = original;
  await deployments.refresh(owner, "51", proposal.id, proposal.previewHash);
  await deployments.rollback(owner, "51", proposal.id, proposal.previewHash);
  const events = await db.notificationEvent.findMany({
    where: { repositoryId: repo.id },
  });
  expect(events.map((e) => e.type).sort()).toEqual([
    "RULESET_ACTIVATED",
    "RULESET_DRIFTED",
    "RULESET_ROLLED_BACK",
  ]);
  expect(events.every((e) => e.organizationId === org)).toBe(true);
});
