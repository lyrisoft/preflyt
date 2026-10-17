import { OrganizationStandardsService } from '../src/standards/organization-standards.service.js';
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
import { digest } from "../src/assessments/assessment-digest.js";
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
    read: (token: string, login: string, request:(path:string)=>Promise<Response>) => Promise<unknown>,
  ) => read("fixture-token", "fixture-org", path => fetch("https://api.github.com"+path)),
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
  expect(detail.impact).toEqual([
    expect.objectContaining({
      githubId: "101",
      branchRef: null,
      policyId: null,
      state: "NOT_ASSIGNED",
      current: false,
    }),
  ]);
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
  }).expect(409);
  // Removing scope must not erase mandatory inherited requirements, even for an Owner.
  const unchanged = (await get(owner, "/" + id).expect(200)).body;
  expect(unchanged.revision).toBe(detail.revision);
  await verifyTeamContext(db, draft.repositoryId, definition.teamContext);
  const removedRepo = await db.gitHubRepository.findUniqueOrThrow({
    where: { githubId: 103n },
  });
  expect(
    (
      await db.teamRepositoryScope.findUniqueOrThrow({
        where: {
          teamId_repositoryId: { teamId: id, repositoryId: removedRepo.id },
        },
      })
    ).policyScopeEnabled,
  ).toBe(true);
  // Explicit expansion still invalidates old sources and requires another preview.
  await post(owner, `/${id}/edit`, {
    name: detail.name,
    description: detail.description,
    memberIds: [],
    repositoryIds: ["101", "102", "103"],
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
  expect(discovered.teams[0].imported).toBe(false);
  await post(developer, "/github/discover", { installationId: "1001" }).expect(403);
  const id = (
    await post(owner, "/github/import", {
      installationId: "1001",
      teamId: "300",
    }).expect(201)
  ).body.id;
  const rediscovered = (
    await post(owner, "/github/discover", { installationId: "1001" }).expect(201)
  ).body;
  expect(rediscovered.teams[0].imported).toBe(true);
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
  expect(list.pageSize).toBe(10);
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
  await get(developer, "/baseline").expect(403);
  expect((await get(owner, "/baseline").expect(200)).body).toEqual({ id: null });
  await post(developer, "/baseline", {}).expect(403);
  const baseline = (await post(owner, "/baseline", {}).expect(201)).body;
  expect((await post(reviewer, "/baseline", {}).expect(201)).body.id).toBe(
    baseline.id,
  );
  expect((await get(owner, "/baseline").expect(200)).body.id).toBe(baseline.id);
  expect((await get(outsider, "/baseline").expect(200)).body).toEqual({ id: null });
  const detail = (await get(owner, "/" + baseline.id).expect(200)).body;
  expect(detail.source).toBe("ORGANIZATION");
  expect(detail.repositories).toHaveLength(12);
  expect(detail.members).toHaveLength(0);
  await post(owner, `/${baseline.id}/edit`, {
    name: detail.name,
    description: detail.description,
    memberIds: [],
    repositoryIds: ["101"],
    expectedRevision: detail.revision,
  }).expect(400);
  const preview = (
    await post(owner, `/${baseline.id}/preview`, assignment).expect(201)
  ).body;
  expect(preview.repositories).toHaveLength(12);
  expect(preview.conflicts).toBe(false);
  const applied = (
    await post(owner, `/${baseline.id}/assign`, {
      ...assignment,
      expectedPreviewHash: preview.previewHash,
    }).expect(201)
  ).body;
  expect(applied.drafts).toHaveLength(12);
  for (const draft of applied.drafts) {
    const policy = await db.gatePolicyRevision.findUniqueOrThrow({
      where: { id: draft.policyId },
    });
    expect(policy.approvedAt).toBeNull();
    expect(policy.publishedAt).toBeNull();
    expect(
      (policy.definition as any).teamContext.some(
        (c: any) => c.teamId === baseline.id,
      ),
    ).toBe(true);
  }
  const repo = await db.gitHubRepository.findUniqueOrThrow({
    where: { githubId: 112n },
  });
  const selected = await db.repositoryStandardsSelection.findFirstOrThrow({
    where: { repositoryId: repo.id },
    orderBy: { revision: "desc" },
  });
  const { StandardsService } =
    await import("../src/standards/standards.service.js");
  await expect(
    new StandardsService(db).assign(
      "112",
      {
        profile: "DEFAULT",
        packs: assignment.packs,
        expectedSelectionId: selected.id,
      },
      owner.identityId,
    ),
  ).rejects.toThrow("Keep the required team");
  const newRepo = await db.gitHubRepository.create({
    data: {
      githubId: 113n,
      installationId: 1001n,
      name: "new-repo",
      fullName: "fixture-org/new-repo",
      ownerLogin: "fixture-org",
      defaultBranch: "main",
      isPrivate: true,
      selected: true,
    },
  });
  const { inheritedTeamStandards } =
    await import("../src/teams/team-context.js");
  await expect(
    inheritedTeamStandards(db, newRepo.id, owner.organizationId!),
  ).rejects.toThrow("scope changed");
});
it("periodic team reconciliation uses the original authorized importer and runs once per interval", async () => {
  const reconcileService = new TeamsService(
    db,
    access,
    {} as GitHubProviderService,
  );
  const sync = vi
    .spyOn(reconcileService, "sync")
    .mockResolvedValue({ id: "fixture" });
  const imported = await db.preflytTeam.findFirstOrThrow({
    where: { source: "GITHUB" },
  });
  await db.preflytTeam.update({
    where: { id: imported.id },
    data: { syncedAt: new Date(Date.now() - 1000000) },
  });
  await reconcileService.reconcile();
  expect(sync).toHaveBeenCalledWith(
    expect.objectContaining({
      identityId: owner.identityId,
      platformAdmin: false,
    }),
    imported.id,
  );
  await reconcileService.reconcile();
  expect(sync).toHaveBeenCalledTimes(1);
});

it("upgrades an explicitly selected assignment without rewriting history or weakening controls", async () => {
  await db.gitHubInstallation.create({
    data: {
      id: 1002n,
      organizationId: outsider.organizationId!,
      accountLogin: "other",
      accountType: "Organization",
      repositorySelection: "all",
      permissions: {},
      connectedById: outsider.identityId,
    },
  });
  const repo = await db.gitHubRepository.create({
    data: {
      githubId: 201n,
      installationId: 1002n,
      name: "upgrade",
      fullName: "other/upgrade",
      ownerLogin: "other",
      defaultBranch: "main",
      isPrivate: true,
      selected: true,
    },
  });
  const id = (
    await post(outsider, "", {
      name: "Upgrade fixture",
      description: "",
      memberIds: [],
      repositoryIds: ["201"],
      expectedRevision: 0,
    }).expect(201)
  ).body.id;
  const preview = (
    await post(outsider, `/${id}/preview`, assignment).expect(201)
  ).body;
  const first = (
    await post(outsider, `/${id}/assign`, {
      ...assignment,
      expectedPreviewHash: preview.previewHash,
    }).expect(201)
  ).body;
  const old = await db.teamPolicyAssignment.findUniqueOrThrow({
    where: { id: first.assignmentId },
  });
  const oldDraft = await db.gatePolicyRevision.findUniqueOrThrow({
    where: { id: first.drafts[0].policyId },
  });
  const upgrade = {
    ...assignment,
    replacesAssignmentId: first.assignmentId,
    packs: [{ id: "baseline-engineering", version: "1.1.0" }],
  };
  const next = (await post(outsider, `/${id}/preview`, upgrade).expect(201))
    .body;
  expect(next.conflicts).toBe(false);
  await post(outsider, `/${id}/preview`, {
    ...upgrade,
    profile: "DEFAULT",
  }).expect(409);
  const applied = (
    await post(outsider, `/${id}/assign`, {
      ...upgrade,
      expectedPreviewHash: next.previewHash,
    }).expect(201)
  ).body;
  const retired = await db.teamPolicyAssignment.findUniqueOrThrow({
    where: { id: first.assignmentId },
  });
  expect(retired.digest).toBe(old.digest);
  expect(retired.packs).toEqual(old.packs);
  expect(retired.supersededAt).not.toBeNull();
  expect(
    (
      await db.gatePolicyRevision.findUniqueOrThrow({
        where: { id: oldDraft.id },
      })
    ).definitionHash,
  ).toBe(oldDraft.definitionHash);
  await expect(
    verifyTeamContext(db, repo.id, (oldDraft.definition as any).teamContext),
  ).rejects.toThrow("scope changed");
  const draft = await db.gatePolicyRevision.findUniqueOrThrow({
    where: { id: applied.drafts[0].policyId },
  });
  await expect(
    verifyTeamContext(db, repo.id, (draft.definition as any).teamContext),
  ).resolves.toBeUndefined();
  expect(draft.publishedAt).toBeNull();
  await post(outsider, `/${id}/assign`, {
    ...upgrade,
    expectedPreviewHash: next.previewHash,
  }).expect(409);
});

it("allows scope removal before a team has assigned standards", async () => {
  const id = await create(["101"]);
  const detail = (await get(owner, "/" + id).expect(200)).body;
  await post(owner, `/${id}/edit`, {
    name: detail.name,
    description: detail.description,
    memberIds: [],
    repositoryIds: [],
    expectedRevision: detail.revision,
  }).expect(201);
  const repo = await db.gitHubRepository.findUniqueOrThrow({
    where: { githubId: 101n },
  });
  expect(
    (
      await db.teamRepositoryScope.findUniqueOrThrow({
        where: { teamId_repositoryId: { teamId: id, repositoryId: repo.id } },
      })
    ).policyScopeEnabled,
  ).toBe(false);
});

it("shows the latest policy independently for every active branch without exposing unauthorized repositories", async () => {
  const repositories = await Promise.all(
    [301n, 302n].map((githubId) =>
      db.gitHubRepository.create({
        data: {
          githubId,
          installationId: 1001n,
          name: `impact-${githubId}`,
          fullName: `fixture-org/impact-${githubId}`,
          ownerLogin: "fixture-org",
          defaultBranch: "main",
          isPrivate: true,
          selected: true,
        },
      }),
    ),
  );
  const id = await create(["301", "302"]);
  const team = await db.preflytTeam.findUniqueOrThrow({ where: { id } });
  const branches = ["refs/heads/main", "refs/heads/develop"];
  const active = await Promise.all(
    branches.map((branchRef) => {
      const source = { branchRef, profile: "DEFAULT", packs: [] };
      return db.teamPolicyAssignment.create({
        data: {
          teamId: id,
          ...source,
          digest: digest(source),
          createdById: owner.identityId,
        },
      });
    }),
  );
  // Capped assignment history must not hide the older, still-active branches.
  await db.teamPolicyAssignment.createMany({
    data: Array.from({ length: 100 }, () => ({
      teamId: id,
      ...assignment,
      digest: digest(assignment),
      createdById: owner.identityId,
      createdAt: new Date(Date.now() + 1000),
      supersededAt: new Date(),
    })),
  });
  const selection = await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repositories[0].id,
      revision: 1,
      profile: "DEFAULT",
      packs: [],
      selectedById: owner.identityId,
    },
  });
  const policies = await Promise.all(
    active.map((source) => {
      const definition = {
        teamContext: [
          {
            teamId: id,
            organizationId: owner.organizationId!,
            revision: team.scopeRevision,
            assignmentId: source.id,
            digest: source.digest,
          },
        ],
      };
      return db.gatePolicyRevision.create({
        data: {
          repositoryId: repositories[0].id,
          organizationId: owner.organizationId!,
          branchRef: source.branchRef,
          revision: 1,
          selectionId: selection.id,
          definition,
          definitionHash: digest(definition),
          draftedById: owner.identityId,
        },
      });
    }),
  );
  const latestMain = await db.gatePolicyRevision.create({
    data: {
      repositoryId: repositories[0].id,
      organizationId: owner.organizationId!,
      branchRef: branches[0],
      revision: 2,
      selectionId: selection.id,
      definition: { teamContext: [] },
      definitionHash: digest({ teamContext: [] }),
      draftedById: owner.identityId,
      state: "PUBLISHED",
      createdAt: new Date("2025-01-01T00:00:00Z"),
    },
  });
  const initial = (await get(owner, "/" + id).expect(200)).body;
  expect(initial.assignments).toHaveLength(100);
  expect(
    initial.assignments.every(
      (a: { supersededAt: string | null }) => a.supersededAt,
    ),
  ).toBe(true);
  expect(initial.impact).toHaveLength(4);
  const visible = initial.impact.filter(
    (row: { githubId: string }) => row.githubId === "301",
  );
  expect(visible).toEqual([
    expect.objectContaining({
      branchRef: branches[1],
      policyId: policies[1].id,
      revision: 1,
      current: true,
    }),
    expect.objectContaining({
      branchRef: branches[0],
      policyId: latestMain.id,
      revision: 2,
      state: "PUBLISHED",
      current: false,
    }),
  ]);
  expect(
    initial.impact.filter(
      (row: { githubId: string }) => row.githubId === "302",
    ),
  ).toEqual(
    branches
      .slice()
      .sort()
      .map((branchRef) =>
        expect.objectContaining({
          branchRef,
          policyId: null,
          state: "NOT_ASSIGNED",
          current: false,
        }),
      ),
  );
  const membership = await db.organizationMembership.findUniqueOrThrow({
    where: {
      organizationId_identityId: {
        organizationId: developer.organizationId!,
        identityId: developer.identityId,
      },
    },
  });
  await db.repositoryGrant.create({
    data: { membershipId: membership.id, repositoryId: repositories[0].id },
  });
  const scoped = (await get(developer, "/" + id).expect(200)).body;
  expect(scoped.repositories).toHaveLength(1);
  expect(scoped.impact).toHaveLength(2);
  expect(
    scoped.impact.every((row: { githubId: string }) => row.githubId === "301"),
  ).toBe(true);
  await get(outsider, "/" + id).expect(404);

  await db.teamPolicyAssignment.update({
    where: { id: active[1].id },
    data: { digest: "b".repeat(64) },
  });
  const invalidSource = (await get(owner, "/" + id).expect(200)).body;
  expect(
    invalidSource.impact.find(
      (row: { githubId: string; branchRef: string }) =>
        row.githubId === "301" && row.branchRef === branches[1],
    ).current,
  ).toBe(false);
  await db.teamPolicyAssignment.update({
    where: { id: active[1].id },
    data: { digest: active[1].digest },
  });
  await db.repositoryStandardsSelection.create({
    data: {
      repositoryId: repositories[0].id,
      revision: 2,
      profile: "DEFAULT",
      packs: [],
      selectedById: owner.identityId,
    },
  });
  const newerSelection = (await get(owner, "/" + id).expect(200)).body;
  expect(
    newerSelection.impact
      .filter((row: { githubId: string }) => row.githubId === "301")
      .every((row: { current: boolean }) => !row.current),
  ).toBe(true);
  expect(
    (
      await db.gatePolicyRevision.findUniqueOrThrow({
        where: { id: latestMain.id },
      })
    ).revision,
  ).toBe(2);
});

it("explicitly previews and approves nested scope without changing existing policies", async () => {
  const parent = await create(["107"]);
  const child = await create(["108"]);
  const before = await db.gatePolicyRevision.count();
  const preview = (
    await post(owner, `/${parent}/child-scope/preview`, {
      childIds: [child],
    }).expect(201)
  ).body;
  expect(preview.repositories.map((r: any) => r.githubId).sort()).toEqual([
    "107",
    "108",
  ]);
  expect(
    (await get(owner, `/${parent}`).expect(200)).body.repositories,
  ).toHaveLength(1);
  await post(owner, `/${parent}/child-scope/approve`, {
    childIds: [child],
    expectedPreviewHash: "a".repeat(64),
  }).expect(409);
  await post(owner, `/${parent}/child-scope/approve`, {
    childIds: [child],
    expectedPreviewHash: preview.previewHash,
  }).expect(201);
  expect(await db.gatePolicyRevision.count()).toBe(before);
  const scoped = (await get(owner, `/${parent}`).expect(200)).body;
  expect(
    scoped.repositories.filter((r: any) => r.policyScopeEnabled),
  ).toHaveLength(2);
  const childRepository = await db.gitHubRepository.findUniqueOrThrow({
    where: { githubId: 108n },
  });
  await db.teamRepositoryScope.update({
    where: {
      teamId_repositoryId: { teamId: parent, repositoryId: childRepository.id },
    },
    data: { providerPresent: false },
  });
  const repair = (
    await post(owner, `/${parent}/child-scope/preview`, {
      childIds: [child],
    }).expect(201)
  ).body;
  await post(owner, `/${parent}/child-scope/approve`, {
    childIds: [child],
    expectedPreviewHash: repair.previewHash,
  }).expect(201);
  expect(
    (
      await db.teamRepositoryScope.findUniqueOrThrow({
        where: {
          teamId_repositoryId: {
            teamId: parent,
            repositoryId: childRepository.id,
          },
        },
      })
    ).providerPresent,
  ).toBe(true);
  await db.teamRepositoryScope.update({
    where: {
      teamId_repositoryId: { teamId: child, repositoryId: childRepository.id },
    },
    data: { providerPresent: false },
  });
  await post(owner, `/${parent}/child-scope/preview`, {
    childIds: [child],
  }).expect(409);
  await db.teamRepositoryScope.update({
    where: {
      teamId_repositoryId: { teamId: child, repositoryId: childRepository.id },
    },
    data: { providerPresent: true },
  });
  const input = { ...assignment, branchRef: "refs/heads/nested-acceptance" };
  const impact = (await post(owner, `/${parent}/preview`, input).expect(201))
    .body;
  expect(impact.repositories).toHaveLength(2);
  const applied = (
    await post(owner, `/${parent}/assign`, {
      ...input,
      expectedPreviewHash: impact.previewHash,
    }).expect(201)
  ).body;
  expect(applied.drafts).toHaveLength(2);
  await db.preflytTeam.update({
    where: { id: child },
    data: { scopeRevision: { increment: 1 } },
  });
  await post(owner, `/${parent}/preview`, input).expect(409);
  const draft = await db.gatePolicyRevision.findUniqueOrThrow({
    where: { id: applied.drafts[0].policyId },
  });
  await expect(
    verifyTeamContext(
      db,
      draft.repositoryId,
      (draft.definition as any).teamContext,
    ),
  ).rejects.toThrow("Child team scope changed");
  const updated = (
    await post(owner, `/${parent}/child-scope/preview`, {
      childIds: [child],
    }).expect(201)
  ).body;
  await post(owner, `/${parent}/child-scope/approve`, {
    childIds: [child],
    expectedPreviewHash: updated.previewHash,
  }).expect(201);
  await post(owner, `/${parent}/edit`, {
    name: scoped.name,
    description: scoped.description,
    memberIds: [],
    repositoryIds: ["107"],
    expectedRevision: scoped.revision + 2,
  }).expect(409);
});
it("rejects nested scope cycles, stale previews, cross-organization and unauthorized approvals", async () => {
  const parent = await create(["109"]);
  const child = await create(["110"]);
  await post(developer, `/${parent}/child-scope/preview`, {
    childIds: [child],
  }).expect(403);
  await post(outsider, `/${parent}/child-scope/preview`, {
    childIds: [child],
  }).expect(404);
  await post(owner, `/${parent}/child-scope/preview`, {
    childIds: [parent],
  }).expect(409);
  const preview = (
    await post(owner, `/${parent}/child-scope/preview`, {
      childIds: [child],
    }).expect(201)
  ).body;
  await db.preflytTeam.update({
    where: { id: child },
    data: { scopeRevision: { increment: 1 } },
  });
  await post(owner, `/${parent}/child-scope/approve`, {
    childIds: [child],
    expectedPreviewHash: preview.previewHash,
  }).expect(409);
  const current = (
    await post(owner, `/${parent}/child-scope/preview`, {
      childIds: [child],
    }).expect(201)
  ).body;
  await post(owner, `/${parent}/child-scope/approve`, {
    childIds: [child],
    expectedPreviewHash: current.previewHash,
  }).expect(201);
  await post(owner, `/${child}/child-scope/preview`, {
    childIds: [parent],
  }).expect(409);
  await post(owner, `/${parent}/child-scope/preview`, {
    childIds: [child, child],
  }).expect(400);
  await http(app.getHttpServer())
    .post(`/teams/${parent}/child-scope/approve`)
    .set("Cookie", `teams.sid=${owner.identityId}`)
    .set("Origin", "https://attacker.invalid")
    .send({ childIds: [child], expectedPreviewHash: current.previewHash })
    .expect(403);
});

it('offers only the latest workspace versions, without templates or another organization standards',async()=>{
 expect((await get(outsider,'/options').expect(200)).body.standards).toEqual([]);
 const standards = new OrganizationStandardsService(db,access);
 const input={title:'Workspace baseline',description:'Our checks',ruleIds:['ci.configured'],expectedVersionId:null};
 const first=await standards.save(owner,input);
 const second=await standards.save(owner,{...input,title:'Workspace baseline updated',expectedVersionId:first.id},first.packId);
 const choices=(await get(owner,'/options').expect(200)).body.standards;
 expect(choices.filter((p:any)=>p.id===first.packId)).toEqual([{id:first.packId,version:second.definition.version,title:'Workspace baseline updated'}]);
 expect(choices.every((p:any)=>p.id.startsWith('org-standard-'))).toBe(true);
 expect((await get(outsider,'/options').expect(200)).body.standards).toEqual([]);
})
it('identifies a deselected repository blocking the organization baseline and preserves its approved scope',async()=>{
 const baseline=(await post(owner,'/baseline',{}).expect(201)).body;
 await db.gitHubRepository.update({where:{githubId:101n},data:{selected:false}});
 try {
  const failed=(await post(owner,`/${baseline.id}/preview`,assignment).expect(403)).body;
  expect(failed.message).toContain('organization baseline');
  expect(failed.message).not.toContain('team policy');
  expect(failed.blockedRepositories).toContainEqual(expect.objectContaining({repositoryId:'101',name:'fixture-org/repo-101',reason:'NOT_SELECTED'}));
  expect(failed.blockedRepositories.find((r:any)=>r.repositoryId==='101').message).toContain('Select it in Repositories');
  expect(await db.teamRepositoryScope.count({where:{teamId:baseline.id,policyScopeEnabled:true}})).toBe(12);
 } finally {await db.gitHubRepository.update({where:{githubId:101n},data:{selected:true}})}
})
it('identifies unavailable repository access for a local Super Admin without bypassing the block',async()=>{
 const id=await create(['101']);
 owner.platformAdmin=true;
 await db.gitHubRepository.update({where:{githubId:101n},data:{available:false}});
 try {
  const failed=(await post(owner,`/${id}/preview`,assignment).expect(403)).body;
  expect(failed.blockedRepositories).toEqual([expect.objectContaining({name:'fixture-org/repo-101',reason:'ACCESS_UNAVAILABLE'})]);
  expect(failed.blockedRepositories[0].message).toContain('GitHub App connection');
 } finally {owner.platformAdmin=false;await db.gitHubRepository.update({where:{githubId:101n},data:{available:true}})}
})
it('does not expose a blocked repository name or id outside the callers grants',async()=>{
 const id=await create(['101','102']);
 const identity=await db.identity.create({data:{issuer:'fixture',subject:randomUUID()}});
 const member=await db.organizationMembership.create({data:{identityId:identity.id,organizationId:owner.organizationId!,role:'POLICY_MANAGER'}});
 const repo=await db.gitHubRepository.findUniqueOrThrow({where:{githubId:101n}});
 await db.repositoryGrant.create({data:{membershipId:member.id,repositoryId:repo.id}});
 const manager={...owner,identityId:identity.id,role:'POLICY_MANAGER',platformAdmin:false} as AuthenticatedSession; actors.push(manager);
 const failed=(await post(manager,`/${id}/preview`,assignment).expect(403)).body;
 expect(failed.blockedRepositories).toEqual([expect.objectContaining({repositoryId:null,name:null,reason:'PERMISSION_REQUIRED'})]);
 expect(JSON.stringify(failed)).not.toContain('repo-102');
 expect(failed.blockedRepositories[0].message).toContain('workspace Owner or Admin');
})
