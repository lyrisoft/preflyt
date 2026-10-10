import "reflect-metadata";
import { randomUUID } from "node:crypto";
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
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { AuthService } from "../src/auth/auth.service.js";
import {
  SessionGuard,
  type AuthenticatedSession,
} from "../src/auth/session.guard.js";
import { GitHubProviderService } from "../src/github/github-provider.service.js";
import { TeamsService } from "../src/teams/teams.service.js";
import { TeamsController } from "../src/teams/teams.controller.js";
import { GatePolicyService } from "../src/assessments/gate-policy.service.js";
import { verifyTeamContext } from "../src/teams/team-context.js";
let db: PrismaService,
  admin: Client,
  app: INestApplication,
  service: TeamsService,
  access: AuthorizationService,
  owner: AuthenticatedSession,
  reviewer: AuthenticatedSession,
  developer: AuthenticatedSession,
  outsider: AuthenticatedSession,
  created = false;
const name = "preflyt_teams_test_" + randomUUID().replace(/-/g, "");
const actors: AuthenticatedSession[] = [];
const membersRead = vi.fn(
  async (
    _installation: bigint,
    _org: bigint,
    read: (token: string, login: string) => Promise<unknown>,
  ) => read("fixture-token", "fixture-org"),
);
const fetchMock = vi.fn();
const post = (actor: AuthenticatedSession, path: string, body: unknown) =>
  http(app.getHttpServer())
    .post("/teams" + path)
    .set("Cookie", `teams.sid=${actor.identityId}`)
    .set("Origin", "http://localhost:5173")
    .send(body);
const get = (actor: AuthenticatedSession, path = "") =>
  http(app.getHttpServer())
    .get("/teams" + path)
    .set("Cookie", `teams.sid=${actor.identityId}`);
const assignment = {
  branchRef: "refs/heads/main",
  profile: "RECOMMENDED",
  packs: [{ id: "baseline-engineering", version: "1.0.0" }],
};
async function create(repositoryIds = ["101"], memberIds: string[] = []) {
  return (
    await post(owner, "", {
      name: "Platform " + randomUUID(),
      description: "Delivery",
      repositoryIds,
      memberIds,
      expectedRevision: 0,
    }).expect(201)
  ).body.id as string;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
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
  access = new AuthorizationService(db);
  service = new TeamsService(db, access, {
    withOrganizationMembers: membersRead,
  } as unknown as GitHubProviderService);
  const organization = await db.organization.create({
    data: { name: "Teams fixture" },
  });
  async function actor(
    role: "OWNER" | "DEVELOPER",
    organizationId = organization.id,
  ) {
    const identity = await db.identity.create({
      data: { issuer: "fixture", subject: randomUUID(), displayName: role },
    });
    await db.organizationMembership.create({
      data: { identityId: identity.id, organizationId, role },
    });
    const result = {
      authenticated: true as const,
      identityId: identity.id,
      subject: identity.subject,
      email: null,
      role,
      organizationId,
    };
    actors.push(result);
    return result;
  }
  owner = await actor("OWNER");
  reviewer = await actor("OWNER");
  developer = await actor("DEVELOPER");
  outsider = await actor(
    "OWNER",
    (await db.organization.create({ data: { name: "Other" } })).id,
  );
  await db.gitHubInstallation.create({
    data: {
      id: 1001n,
      organizationId: organization.id,
      accountLogin: "fixture-org",
      accountType: "Organization",
      repositorySelection: "all",
      permissions: { members: "read" },
      connectedById: owner.identityId,
    },
  });
  await db.gitHubOrganizationLink.create({
    data: {
      organizationId: organization.id,
      githubOrganizationId: 500n,
      host: "github.com",
      login: "fixture-org",
      verifiedAt: new Date(),
    },
  });
  for (let index = 101; index <= 112; index++)
    await db.gitHubRepository.create({
      data: {
        githubId: BigInt(index),
        installationId: 1001n,
        name: `repo-${index}`,
        fullName: `fixture-org/repo-${index}`,
        ownerLogin: "fixture-org",
        defaultBranch: "main",
        isPrivate: true,
        selected: true,
      },
    });
  app = await NestFactory.create(
    {
      module: class TeamsTest {},
      controllers: [TeamsController],
      providers: [
        SessionGuard,
        { provide: TeamsService, useValue: service },
        { provide: AuthorizationService, useValue: access },
        {
          provide: AuthService,
          useValue: {
            sessionCookieName: "teams.sid",
            assertOrigin: (origin: string) => {
              if (origin !== "http://localhost:5173")
                throw new ForbiddenException("Invalid origin");
            },
            currentSession: async (id?: string) =>
              actors.find((a) => a.identityId === id) ?? {
                authenticated: false,
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
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  await db?.$disconnect();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});
it("creates a local team without granting membership or repository access", async () => {
  const m = await db.organizationMembership.findUniqueOrThrow({
    where: {
      organizationId_identityId: {
        organizationId: developer.organizationId!,
        identityId: developer.identityId,
      },
    },
  });
  const id = await create(["101"], [m.id]);
  const detail = (await get(owner, "/" + id).expect(200)).body;
  expect(detail.members).toHaveLength(1);
  expect(detail.repositories[0].policyScopeEnabled).toBe(true);
  expect(
    await db.repositoryGrant.count({ where: { membershipId: m.id } }),
  ).toBe(0);
  expect(
    (await get(developer, "/" + id).expect(200)).body.repositories,
  ).toEqual([]);
});
it("protects organization, repository, origin and DTO boundaries", async () => {
  const id = await create();
  await get(outsider, "/" + id).expect(404);
  await post(developer, "", {
    name: "No",
    description: "",
    memberIds: [],
    repositoryIds: [],
    expectedRevision: 0,
  }).expect(403);
  await post(owner, "", {
    name: "No",
    description: "",
    memberIds: [],
    repositoryIds: ["9999"],
    expectedRevision: 0,
  }).expect(403);
  await post(owner, "", {
    name: "No",
    description: "",
    memberIds: [],
    repositoryIds: [],
    expectedRevision: 0,
    role: "OWNER",
  }).expect(400);
  await http(app.getHttpServer())
    .post("/teams")
    .set("Cookie", `teams.sid=${owner.identityId}`)
    .set("Origin", "https://attacker.invalid")
    .send({
      name: "No",
      description: "",
      memberIds: [],
      repositoryIds: [],
      expectedRevision: 0,
    })
    .expect(403);
  await http(app.getHttpServer()).get("/teams").expect(401);
});
it("previews, creates drafts atomically and reuses independent policy approval/publication", async () => {
  const id = await create(["102", "103"]);
  const before = await db.gatePolicyRevision.count();
  const preview = (await post(owner, `/${id}/preview`, assignment).expect(201))
    .body;
  expect(preview.repositories).toHaveLength(2);
  expect(preview.conflicts).toBe(false);
  expect(await db.gatePolicyRevision.count()).toBe(before);
  await post(owner, `/${id}/assign`, {
    ...assignment,
    expectedPreviewHash: "a".repeat(64),
  }).expect(409);
  expect(await db.gatePolicyRevision.count()).toBe(before);
  const applied = (
    await post(owner, `/${id}/assign`, {
      ...assignment,
      expectedPreviewHash: preview.previewHash,
    }).expect(201)
  ).body;
  expect(applied.drafts).toHaveLength(2);
  const draft = await db.gatePolicyRevision.findUniqueOrThrow({
    where: { id: applied.drafts[0].policyId },
  });
  const definition = draft.definition as any;
  expect(definition.teamContext[0].teamId).toBe(id);
  const policy = new GatePolicyService(db, access);
  await expect(
    policy.approve(owner, "102", draft.id, draft.definitionHash),
  ).rejects.toThrow("Independent policy approval");
  await policy.approve(reviewer, "102", draft.id, draft.definitionHash);
  await policy.publish(owner, "102", draft.id, draft.definitionHash, null);
  const detail = (await get(owner, "/" + id).expect(200)).body;
  await post(owner, `/${id}/edit`, {
    name: detail.name,
    description: detail.description,
    memberIds: [],
    repositoryIds: ["102"],
    expectedRevision: detail.revision,
  }).expect(201);
  await expect(
    verifyTeamContext(db, draft.repositoryId, definition.teamContext),
  ).rejects.toThrow("scope changed");
});
it("composes two teams without weakening an existing strict repository baseline", async () => {
  const a = await create(["104"]),
    b = await create(["104"]);
  const strict = { ...assignment, profile: "STRICT" };
  const p = (await post(owner, `/${a}/preview`, strict).expect(201)).body;
  await post(owner, `/${a}/assign`, {
    ...strict,
    expectedPreviewHash: p.previewHash,
  }).expect(201);
  const additional = {
    ...assignment,
    profile: "DEFAULT",
    packs: [{ id: "backend-service", version: "1.0.0" }],
  };
  const preview = (await post(owner, `/${b}/preview`, additional).expect(201))
    .body;
  expect(preview.repositories[0].profile).toBe("STRICT");
  expect(preview.repositories[0].sources[0].teamId).toBe(a);
  expect(preview.repositories[0].packs).toHaveLength(2);
});
it("imports 12 GitHub repository associations with empty policy scope and preserves scope on failed sync", async () => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes("/members?")
            ? [{ id: 1, login: "fixture-member" }]
            : url.includes("/repos?")
              ? Array.from({ length: 12 }, (_, i) => ({ id: 101 + i }))
              : [
                  {
                    id: 300,
                    name: "GitHub Platform",
                    slug: "platform",
                    description: "External",
                    parent: null,
                  },
                ],
        ),
      ),
  );
  const discovered = (
    await post(owner, "/github/discover", { installationId: "1001" }).expect(
      201,
    )
  ).body;
  expect(discovered.teams[0].id).toBe("300");
  const id = (
    await post(owner, "/github/import", {
      installationId: "1001",
      teamId: "300",
    }).expect(201)
  ).body.id;
  let detail = (await get(owner, "/" + id).expect(200)).body;
  expect(detail.repositories).toHaveLength(12);
  expect(detail.repositories.every((r: any) => !r.policyScopeEnabled)).toBe(
    true,
  );
  await post(owner, `/${id}/edit`, {
    name: detail.name,
    description: detail.description,
    memberIds: [],
    repositoryIds: ["105", "106"],
    expectedRevision: detail.revision,
  }).expect(201);
  fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
  await post(owner, `/${id}/sync`, {}).expect(503);
  detail = (await get(owner, "/" + id).expect(200)).body;
  expect(detail.syncState).toBe("STALE");
  expect(
    detail.repositories.filter((r: any) => r.policyScopeEnabled),
  ).toHaveLength(2);
  await post(owner, `/${id}/preview`, assignment)
    .expect(201)
    .then((r) => expect(r.body.conflicts).toBe(true));
  vi.unstubAllGlobals();
});
it("paginates team lists and does not leak another organization teams", async () => {
  const list = (await get(owner, "?page=1&q=Platform").expect(200)).body;
  expect(list.pageSize).toBe(20);
  expect(list.total).toBeGreaterThan(0);
  expect((await get(outsider).expect(200)).body.total).toBe(0);
  await get(owner, "?page=0").expect(400);
});
it("repository selection cannot drop mandatory team standards or lower their profile", async () => {
  const { StandardsService } =
    await import("../src/standards/standards.service.js");
  const id = await create(["107"]);
  const strict = { ...assignment, profile: "STRICT" };
  const preview = (await post(owner, `/${id}/preview`, strict).expect(201))
    .body;
  await post(owner, `/${id}/assign`, {
    ...strict,
    expectedPreviewHash: preview.previewHash,
  }).expect(201);
  const repo = await db.gitHubRepository.findUniqueOrThrow({
    where: { githubId: 107n },
  });
  const selection = await db.repositoryStandardsSelection.findFirstOrThrow({
    where: { repositoryId: repo.id },
    orderBy: { revision: "desc" },
  });
  const standards = new StandardsService(db);
  await expect(
    standards.assign(
      "107",
      {
        profile: "DEFAULT",
        packs: assignment.packs,
        expectedSelectionId: selection.id,
      },
      owner.identityId,
    ),
  ).rejects.toThrow("Keep the required team");
  await expect(
    standards.assign(
      "107",
      {
        profile: "STRICT",
        packs: [{ id: "backend-service", version: "1.0.0" }],
        expectedSelectionId: selection.id,
      },
      owner.identityId,
    ),
  ).rejects.toThrow("Keep the required team");
  const saved = await standards.assign(
    "107",
    {
      profile: "STRICT",
      packs: [...assignment.packs, { id: "backend-service", version: "1.0.0" }],
      expectedSelectionId: selection.id,
    },
    owner.identityId,
  );
  expect(saved.teamContext).toEqual(selection.teamContext);
});
it("unchanged team scope edits do not invalidate saved policy sources", async () => {
  const id = await create(["108"]);
  const preview = (await post(owner, `/${id}/preview`, assignment).expect(201))
    .body;
  const applied = (
    await post(owner, `/${id}/assign`, {
      ...assignment,
      expectedPreviewHash: preview.previewHash,
    }).expect(201)
  ).body;
  const draft = await db.gatePolicyRevision.findUniqueOrThrow({
    where: { id: applied.drafts[0].policyId },
  });
  const detail = (await get(owner, "/" + id).expect(200)).body;
  await post(owner, `/${id}/edit`, {
    name: detail.name,
    description: "Updated description",
    memberIds: [],
    repositoryIds: ["108"],
    expectedRevision: detail.revision,
  }).expect(201);
  await expect(
    verifyTeamContext(
      db,
      draft.repositoryId,
      (draft.definition as any).teamContext,
    ),
  ).resolves.toBeUndefined();
});

it("creates one organization baseline, previews every connected repository and preserves publication approval", async () => {
  await post(developer, "/baseline", {}).expect(403);
  const baseline = (await post(owner, "/baseline", {}).expect(201)).body;
  expect((await post(reviewer, "/baseline", {}).expect(201)).body.id).toBe(baseline.id);
  const detail = (await get(owner, "/" + baseline.id).expect(200)).body;
  expect(detail.source).toBe("ORGANIZATION");
  expect(detail.repositories).toHaveLength(12);
  expect(detail.members).toHaveLength(0);
  await post(owner, `/${baseline.id}/edit`, {
    name: detail.name, description: detail.description, memberIds: [],
    repositoryIds: ["101"], expectedRevision: detail.revision,
  }).expect(400);
  const preview = (await post(owner, `/${baseline.id}/preview`, assignment).expect(201)).body;
  expect(preview.repositories).toHaveLength(12);
  expect(preview.conflicts).toBe(false);
  const applied = (await post(owner, `/${baseline.id}/assign`, {
    ...assignment, expectedPreviewHash: preview.previewHash,
  }).expect(201)).body;
  expect(applied.drafts).toHaveLength(12);
  for (const draft of applied.drafts) {
    const policy = await db.gatePolicyRevision.findUniqueOrThrow({where: {id: draft.policyId}});
    expect(policy.approvedAt).toBeNull();
    expect(policy.publishedAt).toBeNull();
    expect((policy.definition as any).teamContext.some((c: any) => c.teamId === baseline.id)).toBe(true);
  }
  const repo = await db.gitHubRepository.findUniqueOrThrow({where: {githubId: 112n}});
  const selected = await db.repositoryStandardsSelection.findFirstOrThrow({where: {repositoryId: repo.id}, orderBy: {revision: "desc"}});
  const {StandardsService} = await import("../src/standards/standards.service.js");
  await expect(new StandardsService(db).assign("112", {
    profile: "DEFAULT", packs: assignment.packs, expectedSelectionId: selected.id,
  }, owner.identityId)).rejects.toThrow("Keep the required team");
  const newRepo = await db.gitHubRepository.create({data: {
    githubId: 113n, installationId: 1001n, name: "new-repo", fullName: "fixture-org/new-repo",
    ownerLogin: "fixture-org", defaultBranch: "main", isPrivate: true, selected: true,
  }});
  const {inheritedTeamStandards} = await import("../src/teams/team-context.js");
  await expect(inheritedTeamStandards(db, newRepo.id, owner.organizationId!)).rejects.toThrow("scope changed");
});
it("periodic team reconciliation uses the original authorized importer and runs once per interval", async () => {
  const reconcileService = new TeamsService(db, access, {} as GitHubProviderService);
  const sync = vi.spyOn(reconcileService, "sync").mockResolvedValue({id: "fixture"});
  const imported = await db.preflytTeam.findFirstOrThrow({where: {source: "GITHUB"}});
  await db.preflytTeam.update({where: {id: imported.id}, data: {syncedAt: new Date(Date.now() - 1000000)}});
  await reconcileService.reconcile();
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({identityId: owner.identityId, platformAdmin: false}), imported.id);
  await reconcileService.reconcile();
  expect(sync).toHaveBeenCalledTimes(1);
});

it("upgrades an explicitly selected assignment without rewriting history or weakening controls", async () => {
  await db.gitHubInstallation.create({data: {id: 1002n, organizationId: outsider.organizationId!, accountLogin: "other", accountType: "Organization", repositorySelection: "all", permissions: {}, connectedById: outsider.identityId}});
  const repo = await db.gitHubRepository.create({data: {githubId: 201n, installationId: 1002n, name: "upgrade", fullName: "other/upgrade", ownerLogin: "other", defaultBranch: "main", isPrivate: true, selected: true}});
  const id = (await post(outsider, "", {name: "Upgrade fixture", description: "", memberIds: [], repositoryIds: ["201"], expectedRevision: 0}).expect(201)).body.id;
  const preview = (await post(outsider, `/${id}/preview`, assignment).expect(201)).body;
  const first = (await post(outsider, `/${id}/assign`, {...assignment, expectedPreviewHash: preview.previewHash}).expect(201)).body;
  const old = await db.teamPolicyAssignment.findUniqueOrThrow({where: {id: first.assignmentId}});
  const oldDraft = await db.gatePolicyRevision.findUniqueOrThrow({where: {id: first.drafts[0].policyId}});
  const upgrade = {...assignment, replacesAssignmentId: first.assignmentId, packs: [{id: "baseline-engineering", version: "1.1.0"}]};
  const next = (await post(outsider, `/${id}/preview`, upgrade).expect(201)).body;
  expect(next.conflicts).toBe(false);
  await post(outsider, `/${id}/preview`, {...upgrade, profile: "DEFAULT"}).expect(409);
  const applied = (await post(outsider, `/${id}/assign`, {...upgrade, expectedPreviewHash: next.previewHash}).expect(201)).body;
  const retired = await db.teamPolicyAssignment.findUniqueOrThrow({where: {id: first.assignmentId}});
  expect(retired.digest).toBe(old.digest);
  expect(retired.packs).toEqual(old.packs);
  expect(retired.supersededAt).not.toBeNull();
  expect((await db.gatePolicyRevision.findUniqueOrThrow({where: {id: oldDraft.id}})).definitionHash).toBe(oldDraft.definitionHash);
  await expect(verifyTeamContext(db, repo.id, (oldDraft.definition as any).teamContext)).rejects.toThrow("scope changed");
  const draft = await db.gatePolicyRevision.findUniqueOrThrow({where: {id: applied.drafts[0].policyId}});
  await expect(verifyTeamContext(db, repo.id, (draft.definition as any).teamContext)).resolves.toBeUndefined();
  expect(draft.publishedAt).toBeNull();
  await post(outsider, `/${id}/assign`, {...upgrade, expectedPreviewHash: next.previewHash}).expect(409);
});
