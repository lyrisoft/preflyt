import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import {
  RulesetHistoryService,
  snapshotDetail,
} from "../src/github/ruleset-history.service.js";
import { digest } from "../src/assessments/assessment-digest.js";
import { GitHubRulesetService } from "../src/github/github-ruleset.service.js";
const name = "preflyt_history_test_" + randomUUID().replaceAll("-", "");
let admin: Client,
  db: PrismaService,
  created = false,
  repo: any,
  history: RulesetHistoryService;
const provider = { readRepositoryRuleSuites: vi.fn() };
const suite = (id = 1) => ({
  id,
  repository_id: 51,
  actor_name: "developer",
  ref: "refs/heads/main",
  after_sha: "a".repeat(40),
  pushed_at: new Date().toISOString(),
  result: "pass",
  rule_evaluations: [
    {
      rule_source: { type: "ruleset", id: 7 },
      rule_type: "required_status_checks",
      result: "fail",
      enforcement: "active",
      details: null,
    },
  ],
});
let raw: any;
const page = (details = [raw], hasMore = false) => ({
  details,
  hasMore,
  fetchedAt: new Date().toISOString(),
  repositoryName: "fixture/repo",
});
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
    for (const folder of (await readdir("prisma/migrations"))
      .filter((n) => /^\d/.test(n))
      .sort())
      await sql.query(
        await readFile(`prisma/migrations/${folder}/migration.sql`, "utf8"),
      );
  } finally {
    await sql.end();
  }
  vi.stubEnv("DATABASE_URL", url.toString());
  db = new PrismaService();
  await db.$connect();
}, 30000);
afterAll(async () => {
  await db?.$disconnect();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin?.end();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("RULESET_INSIGHTS_SYNC_ENABLED", "true");
  vi.stubEnv("RULESET_INSIGHTS_RETENTION_DAYS", "90");
  await db.gitHubRepository.deleteMany();
  await db.gitHubInstallation.deleteMany();
  await db.identity.deleteMany();
  const identity = await db.identity.create({
    data: { issuer: "fixture", subject: randomUUID() },
  });
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      connectedById: identity.id,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
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
  history = new RulesetHistoryService(db, provider as any);
  raw = suite();
  provider.readRepositoryRuleSuites.mockResolvedValue(page());
});
const ready = () =>
  db.gitHubInsightsSync.update({
    where: { repositoryId: repo.id },
    data: { nextRunAt: new Date(0) },
  });
const read = () =>
  history.read(repo.id, 51n, 7, "fixture/repo", { page: 1, period: "week" });
it("is disabled by default and excludes unselected repositories", async () => {
  vi.stubEnv("RULESET_INSIGHTS_SYNC_ENABLED", "false");
  await history.reconcile();
  expect(provider.readRepositoryRuleSuites).not.toHaveBeenCalled();
  vi.stubEnv("RULESET_INSIGHTS_SYNC_ENABLED", "true");
  await db.gitHubRepository.update({
    where: { id: repo.id },
    data: { selected: false },
  });
  await history.reconcile();
  expect(provider.readRepositoryRuleSuites).not.toHaveBeenCalled();
});
it("stores immutable details once and attributes only the selected ruleset", async () => {
  await history.sync(repo.id);
  await ready();
  await history.sync(repo.id);
  expect(await db.gitHubRuleSuiteSnapshot.count()).toBe(1);
  expect(await read()).toMatchObject({
    source: "RETAINED_GITHUB_RULE_SUITES",
    summary: { activeFail: 1, activePass: 0 },
    collection: { error: false, coverage: "COLLECTED_EVALUATIONS_ONLY" },
  });
  const other = await history.read(repo.id, 51n, 8, "fixture/repo", {
    page: 1,
    period: "week",
  });
  expect(other.suites).toEqual([]);
});
it("preserves original evidence and cursor when GitHub changes an existing suite", async () => {
  await history.sync(repo.id);
  await ready();
  provider.readRepositoryRuleSuites.mockResolvedValue(
    page([{ ...raw, result: "fail" }], true),
  );
  await history.sync(repo.id);
  const state = await db.gitHubInsightsSync.findUniqueOrThrow({
    where: { repositoryId: repo.id },
  });
  expect(state).toMatchObject({ error: true, nextPage: 1, leaseId: null });
  expect(
    (await db.gitHubRuleSuiteSnapshot.findFirstOrThrow()).raw,
  ).toMatchObject({ result: "pass" });
});
it("rejects a foreign repository and retries without partial evidence", async () => {
  provider.readRepositoryRuleSuites.mockResolvedValue(
    page([raw, { ...suite(2), repository_id: 52 }], true),
  );
  await history.sync(repo.id);
  expect(await db.gitHubRuleSuiteSnapshot.count()).toBe(0);
  expect((await read()).collection.error).toBe(true);
});
it("allows one lease owner and refuses persistence after installation revocation", async () => {
  let resolve!: (value: any) => void;
  provider.readRepositoryRuleSuites.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const first = history.sync(repo.id);
  await vi.waitFor(() =>
    expect(provider.readRepositoryRuleSuites).toHaveBeenCalledOnce(),
  );
  await history.sync(repo.id);
  expect(provider.readRepositoryRuleSuites).toHaveBeenCalledOnce();
  await db.gitHubInstallation.update({
    where: { id: 50n },
    data: { active: false, accessRevision: { increment: 1 } },
  });
  resolve(page());
  await first;
  expect(await db.gitHubRuleSuiteSnapshot.count()).toBe(0);
});
it("advances pages only after persistence and resets for another bounded sweep", async () => {
  provider.readRepositoryRuleSuites.mockResolvedValue(page([raw], true));
  await history.sync(repo.id);
  await ready();
  provider.readRepositoryRuleSuites.mockResolvedValue(page([suite(2)], false));
  await history.sync(repo.id);
  expect(provider.readRepositoryRuleSuites.mock.calls[1][2]).toMatchObject({
    page: 2,
    period: "month",
  });
  expect(
    await db.gitHubInsightsSync.findUnique({
      where: { repositoryId: repo.id },
    }),
  ).toMatchObject({ nextPage: 1, error: false, lastSweepAt: expect.any(Date) });
});
it("pagination and filters count only matching rules on the returned page", async () => {
  const rows = Array.from({ length: 21 }, (_, i) => suite(i + 1));
  await db.gitHubRuleSuiteSnapshot.createMany({
    data: rows.map((value) => ({
      ...snapshotDetail(value, "51"),
      repositoryId: repo.id,
      fetchedAt: new Date(),
    })),
  });
  const first = await read();
  expect(first.hasMore).toBe(true);
  expect(first.summary.activeFail).toBe(10);
  const large = await history.read(repo.id, 51n, 7, "fixture/repo", {page: 1, pageSize: 25, period: "week"});
  expect(large.scannedSuites).toBe(21);
  expect(large.hasMore).toBe(false);
  const second = await history.read(repo.id, 51n, 7, "fixture/repo", {
    page: 3,
    period: "week",
    actor: "developer",
    ref: "refs/heads/main",
    result: "fail",
  });
  expect(second.suites).toHaveLength(1);
  expect(second.hasMore).toBe(false);
  expect(
    (
      await history.read(repo.id, 51n, 7, "fixture/repo", {
        page: 1,
        period: "week",
        actor: "another",
      })
    ).suites,
  ).toEqual([]);
});
it("fails closed when retained payload or indexed metadata is tampered with", async () => {
  await history.sync(repo.id);
  const row = await db.gitHubRuleSuiteSnapshot.findFirstOrThrow();
  await db.gitHubRuleSuiteSnapshot.update({
    where: { id: row.id },
    data: { sourceSha: "b".repeat(40) },
  });
  await expect(read()).rejects.toThrow("identity changed");
  await db.gitHubRuleSuiteSnapshot.update({
    where: { id: row.id },
    data: { sourceSha: "a".repeat(40), raw: { ...raw, result: "fail" } },
  });
  await expect(read()).rejects.toThrow("could not be verified");
});
it("deletes expired history even for a repository no longer selected", async () => {
  const old = {
    ...raw,
    pushed_at: new Date(Date.now() - 91 * 86400000).toISOString(),
  };
  await db.gitHubRuleSuiteSnapshot.create({
    data: {
      ...snapshotDetail(old, "51"),
      repositoryId: repo.id,
      fetchedAt: new Date(),
    },
  });
  await db.gitHubRepository.update({
    where: { id: repo.id },
    data: { selected: false },
  });
  await history.reconcile();
  expect(await db.gitHubRuleSuiteSnapshot.count()).toBe(0);
});
it("rechecks policy access for retained history and rejects revoked access", async () => {
  const access = {
    requireRepository: vi
      .fn()
      .mockResolvedValueOnce(repo)
      .mockRejectedValueOnce(new Error("Revoked")),
  };
  const live = { savedDisplay: vi.fn().mockResolvedValue({}) };
  await expect(
    new GitHubRulesetService(access as any, live as any, history).insights(
      {} as any,
      repo.id,
      7,
      { page: 1, period: "quarter", source: "retained" },
    ),
  ).rejects.toThrow("Revoked");
});

it("resolves the public GitHub repository ID to its internal snapshot scope", async () => {
  await history.sync(repo.id);
  const access = { requireRepository: vi.fn().mockResolvedValue(repo) };
  const provider = { savedDisplay: vi.fn().mockResolvedValue({}) };
  const response = await new GitHubRulesetService(
    access as any,
    provider as any,
    history,
  ).insights({} as any, "51", 7, {
    page: 1,
    period: "week",
    source: "retained",
  });
  expect(response.summary.activeFail).toBe(1);
});

it('compares retained periods without mixing rulesets or suite-wide outcomes', async () => {
  const now = Date.now();
  const values = [
    { ...suite(101), pushed_at: new Date(now - 86400000).toISOString() },
    { ...suite(102), pushed_at: new Date(now - 8 * 86400000).toISOString(), rule_evaluations: [{ ...suite().rule_evaluations[0], result: 'pass' }] },
    { ...suite(103), pushed_at: new Date(now - 86400000).toISOString(), rule_evaluations: [{ ...suite().rule_evaluations[0], rule_source: { type: 'ruleset', id: 8 } }] },
    { ...suite(104), pushed_at: new Date(now - 86400000).toISOString(), rule_evaluations: [{ ...suite().rule_evaluations[0], enforcement: 'evaluate' }] },
  ];
  await db.gitHubRuleSuiteSnapshot.createMany({ data: values.map(value => ({ ...snapshotDetail(value, '51'), repositoryId: repo.id, fetchedAt: new Date() })) });
  const result = await read();
  expect(result.trend).toMatchObject({ truncated: false, previousWindowLimitedByRetention: false, current: { activeFail: 1, evaluateFail: 1, activePass: 0 }, previous: { activePass: 1, activeFail: 0 } });
  expect(result.trend.days).toHaveLength(1);
  expect(result.trend.days[0]).toMatchObject({ activeFail: 1, evaluateFail: 1 });
  expect((await history.read(repo.id, 51n, 7, 'fixture/repo', { page: 1, period: 'quarter' })).trend.previousWindowLimitedByRetention).toBe(true);
});
it('labels capped trends and includes more than the visible page', async () => {
  const values = Array.from({ length: 1001 }, (_, index) => suite(index + 1));
  await db.gitHubRuleSuiteSnapshot.createMany({ data: values.map(value => ({ ...snapshotDetail(value, '51'), repositoryId: repo.id, fetchedAt: new Date() })) });
  const result = await read();
  expect(result.summary.activeFail).toBe(10);
  expect(result.trend).toMatchObject({ truncated: true, scannedSuites: 1000, current: { activeFail: 1000 } });
});
it('verifies trend evidence beyond the current page', async () => {
  const values = Array.from({ length: 21 }, (_, index) => ({ ...suite(index + 1), pushed_at: new Date(Date.now() - index * 1000).toISOString() }));
  await db.gitHubRuleSuiteSnapshot.createMany({ data: values.map(value => ({ ...snapshotDetail(value, '51'), repositoryId: repo.id, fetchedAt: new Date() })) });
  await db.gitHubRuleSuiteSnapshot.update({ where: { repositoryId_suiteId: { repositoryId: repo.id, suiteId: 21n } }, data: { actor: 'tampered' } });
  await expect(read()).rejects.toThrow('identity changed');
});
it('links only verified assessments for the exact repository and commit', async () => {
  const value = { request: {}, plan: {}, report: {} };
  for (let i = 0; i < 6; i++) await db.commitAssessment.create({ data: { ...value, repositoryId: repo.id, sourceSha: 'a'.repeat(40), selectionId: 'fixture', requestKey: randomUUID(), inputHash: 'fixture', assessmentHash: digest(value) } });
  await db.commitAssessment.create({ data: { ...value, repositoryId: repo.id, sourceSha: 'b'.repeat(40), selectionId: 'fixture', requestKey: randomUUID(), inputHash: 'fixture', assessmentHash: digest(value) } });
  await history.sync(repo.id);
  const linked = await history.linkAssessments(repo.id, (await read()).suites);
  expect(linked[0].assessments).toHaveLength(5);
  expect(linked[0].moreAssessments).toBe(true);
  expect(await history.linkAssessments('another-repository', (await read()).suites)).toMatchObject([{ assessments: [] }]);
  await db.commitAssessment.updateMany({ data: { assessmentHash: 'tampered' } });
  await expect(history.linkAssessments(repo.id, (await read()).suites)).rejects.toThrow('assessment could not be verified');
});
