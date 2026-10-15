import { createHash } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { GitHubConnectionService } from "../src/github/github-connection.service.js";
import { GitHubSyncService } from "../src/github/github-sync.service.js";
import { disposableDatabase } from "./disposable-database.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
let connection: GitHubConnectionService;
let actorId: string;
const installation = {
  id: 50n,
  accountId: 9n,
  accountLogin: "fixture",
  accountType: "Organization",
  repositorySelection: "selected",
  permissions: { metadata: "read", contents: "read", members: "read" },
};
const repository = (id = 51n) => ({
  id,
  name: `repo-${id}`,
  fullName: `fixture/repo-${id}`,
  ownerLogin: "fixture",
  defaultBranch: "main",
  isPrivate: true,
});
const app = {
  createInstallationUrl: vi.fn(
    (state: string) =>
      `https://github.com/apps/fixture/installations/new?state=${state}`,
  ),
  createUserAuthorizationUrl: vi.fn(
    (state: string) =>
      `https://github.com/login/oauth/authorize?state=${state}`,
  ),
  verifyInstallation: vi.fn(),
  exchangeUserCode: vi.fn(),
  revokeUserToken: vi.fn(),
  listInstallationRepositories: vi.fn(),
};
const github = { user: vi.fn(), verify: vi.fn() };
beforeAll(async () => {
  fixture = await disposableDatabase("connection");
});
afterAll(async () => {
  await fixture?.close();
});
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await fixture.reset();
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "111");
  app.verifyInstallation.mockResolvedValue(installation);
  app.exchangeUserCode.mockResolvedValue("ephemeral-verification-token");
  app.revokeUserToken.mockResolvedValue(undefined);
  app.listInstallationRepositories.mockResolvedValue([repository()]);
  github.user.mockResolvedValue({ id: 70n, login: "github-owner" });
  github.verify.mockResolvedValue({
    installation,
    organizationId: 9n,
    login: "fixture",
    owner: true,
    repositoryIds: [51n],
  });
  const identity = await fixture.prisma.identity.create({
    data: {
      issuer: "fixture",
      subject: "admin",
      membership: { create: { role: "SUPER_ADMIN" } },
    },
  });
  actorId = identity.id;
  await fixture.prisma.webSession.create({
    data: {
      tokenHash: hash("admin"),
      identityId: actorId,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  connection = new GitHubConnectionService(
    fixture.prisma,
    new AuthService(fixture.prisma),
    app as any,
    github as any,
  );
});
async function ready() {
  const start = await connection.begin("admin");
  const state = new URL(start.url).searchParams.get("state")!;
  const url = await connection.installed(
    state,
    start.binding,
    "admin",
    "50",
    "install",
  );
  return {
    binding: start.binding,
    state: new URL(url).searchParams.get("state")!,
  };
}
it("imports the installation selection and enters the workspace without changing admin identity or session", async () => {
  const flow = await ready();
  await connection.complete(flow.state, flow.binding, "admin", "one-use-code");
  const session = await fixture.prisma.webSession.findUniqueOrThrow({
    where: { tokenHash: hash("admin") },
    include: { identity: { include: { membership: true } } },
  });
  expect(await fixture.prisma.webSession.count()).toBe(1);
  expect(session.identityId).toBe(actorId);
  expect(session.identity.membership?.role).toBe("SUPER_ADMIN");
  expect(session.activeOrganizationId).toBeTruthy();
  expect(await fixture.prisma.gitHubUserAccount.count()).toBe(0);
  expect(
    await fixture.prisma.gitHubRepository.findUnique({
      where: { githubId: 51n },
    }),
  ).toMatchObject({ selected: true, available: true });
  expect(
    await fixture.prisma.gitHubInstallation.findUnique({ where: { id: 50n } }),
  ).toMatchObject({
    connectedById: actorId,
    organizationId: session.activeOrganizationId,
    repositoryTracking: "INSTALLATION",
  });
  expect(app.revokeUserToken).toHaveBeenCalledWith(
    "ephemeral-verification-token",
  );
  expect(await fixture.prisma.gitHubConnectionTransaction.count()).toBe(0);
  await expect(
    connection.complete(flow.state, flow.binding, "admin", "one-use-code"),
  ).rejects.toThrow();
});
it("binds both callbacks to the original session, browser, configured App and expiry", async () => {
  const flow = await ready();
  for (const [binding, token] of [
    [flow.binding, "another-session"],
    ["wrong-binding", "admin"],
  ])
    await expect(
      connection.complete(flow.state, binding, token, "code"),
    ).rejects.toThrow();
  expect(app.exchangeUserCode).not.toHaveBeenCalled();
  vi.stubEnv("GITHUB_APP_ID", "222");
  await expect(
    connection.complete(flow.state, flow.binding, "admin", "code"),
  ).rejects.toThrow();
  vi.stubEnv("GITHUB_APP_ID", "111");
  await fixture.prisma.gitHubConnectionTransaction.updateMany({
    data: { expiresAt: new Date(0) },
  });
  await expect(
    connection.complete(flow.state, flow.binding, "admin", "code"),
  ).rejects.toThrow();
  expect(await fixture.prisma.organization.count()).toBe(0);
});
it("requires verified GitHub organization ownership and does not retain verification credentials", async () => {
  const flow = await ready();
  github.verify.mockResolvedValueOnce({
    installation,
    organizationId: 9n,
    login: "fixture",
    owner: false,
    repositoryIds: [51n],
  });
  await expect(
    connection.complete(flow.state, flow.binding, "admin", "code"),
  ).rejects.toThrow("owner");
  expect(app.revokeUserToken).toHaveBeenCalledOnce();
  expect(await fixture.prisma.organization.count()).toBe(0);
  expect(await fixture.prisma.gitHubUserCredential.count()).toBe(0);
});
it("does not claim another workspace even for a deployment admin who proves GitHub ownership", async () => {
  const organization = await fixture.prisma.organization.create({
    data: { name: "Existing workspace" },
  });
  await fixture.prisma.gitHubInstallation.create({
    data: {
      id: installation.id,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      repositorySelection: installation.repositorySelection,
      permissions: installation.permissions,
      connectedById: actorId,
      organizationId: organization.id,
    },
  });
  const flow = await ready();
  await expect(
    connection.complete(flow.state, flow.binding, "admin", "code"),
  ).rejects.toThrow("existing workspace admin");
  expect(await fixture.prisma.organizationMembership.count()).toBe(0);
  expect(await fixture.prisma.gitHubRepository.count()).toBe(0);
});
it("rejects a revoked initiating admin session before exchanging the GitHub code", async () => {
  const flow = await ready();
  await fixture.prisma.membership.update({
    where: { identityId: actorId },
    data: { active: false },
  });
  await expect(
    connection.complete(flow.state, flow.binding, "admin", "code"),
  ).rejects.toThrow();
  expect(app.exchangeUserCode).not.toHaveBeenCalled();
});
it("imports newly granted GitHub repositories on sync while preserving explicit local exclusions", async () => {
  const flow = await ready();
  await connection.complete(flow.state, flow.binding, "admin", "code");
  await fixture.prisma.gitHubRepository.update({
    where: { githubId: 51n },
    data: { selected: false },
  });
  app.listInstallationRepositories.mockResolvedValue([
    repository(),
    repository(52n),
  ]);
  await new GitHubSyncService(fixture.prisma, app as any).sync(50n);
  expect(
    await fixture.prisma.gitHubRepository.findUnique({
      where: { githubId: 51n },
    }),
  ).toMatchObject({ selected: false });
  expect(
    await fixture.prisma.gitHubRepository.findUnique({
      where: { githubId: 52n },
    }),
  ).toMatchObject({ selected: true });
});
