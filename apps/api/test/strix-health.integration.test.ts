import {readFileSync} from 'node:fs';
import "reflect-metadata";
import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HealthSourceStore } from "../src/health/health-source-store.js";
import { healthSourceFixture } from "./health-source-fixture.js";
import { nativeAdapters } from "../src/execution/native-plan.js";
import { disposableDatabase } from "./disposable-database.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { RepositoryHealthService } from "../src/health/repository-health.service.js";
import { HealthStrixService } from "../src/health/strix.service.js";
import { FindingsService } from "../src/findings/findings.service.js";
import { FindingSourceStore } from "../src/findings/finding-source-store.service.js";
import { endpointDigest } from "../src/intelligence/ai-configuration.js";
import { StrixRunnerBusyError } from "../src/health/strix-client.js";
import { queueFindingSources } from "../src/findings/finding-source-store.js";
vi.mock("../src/findings/finding-source-store.js", async (original) => ({
  ...(await original<any>()),
  queueFindingSources: vi.fn((await original<any>()).queueFindingSources),
}));
vi.mock("../src/intelligence/ai-configuration.js", async (original) => ({
  ...(await original<any>()),
  aiReviewsEnabled: () => true,
}));
let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  service: RepositoryHealthService,
  owner: any,
  repo: any,
  admitted: boolean;
const sha = "a".repeat(40);
const sourceFixture = healthSourceFixture();
const source = sourceFixture.source,
  sourceHash = source.sourceHash;
const github: any = {
  readRepositorySnapshot: vi.fn(),
  readHealthScanSource: vi.fn(),
  savedDisplay: vi.fn(),
};
const client: any = {
  connection: vi.fn(async () => ({
    apiKey: "test-only-key",
    origin: "https://localhost",
    ca: "fixture",
  })),
  token: () => "a".repeat(64),
  call: vi.fn(async () => ({
    version: 1,
    toolVersion: "1.7.0",
    available: true,
  })),
  admit: vi.fn(async () => {
    admitted = true;
    return { state: "RUNNING" };
  }),
  status: vi.fn(async (assessmentId: string) =>
    admitted
      ? {
          version: 1,
          assessmentId,
          sourceHash,
          state: "COMPLETED",
          toolVersion: "1.7.0",
          exitCode: 2,
          cleanupConfirmed: true,
          findings: [
            {
              title: "Missing tenant check",
              severity: "high",
              cwe: "CWE-862",
              impact: "Another tenant can request access.",
              code_locations: [{ file: "app.ts", start_line: 1 }],
            },
          ],
        }
      : { state: "NOT_FOUND" },
  ),
  cancel: vi.fn(async () => ({ cleanupConfirmed: true })),
};
beforeAll(async () => {
  fixture = await disposableDatabase("strix");
});
afterAll(async () => {
  await fixture?.close();
});
beforeEach(async () => {
  await fixture.reset();
  vi.clearAllMocks();
  admitted = false;
  const db = fixture.prisma,
    org = await db.organization.create({ data: { name: "Strix fixture" } }),
    actor = await db.identity.create({
      data: { issuer: "fixture", subject: "owner" },
    });
  await db.organizationMembership.create({
    data: { identityId: actor.id, organizationId: org.id, role: "OWNER" },
  });
  owner = {
    authenticated: true,
    identityId: actor.id,
    organizationId: org.id,
    role: "OWNER",
    subject: "owner",
    email: null,
  };
  await db.gitHubInstallation.create({
    data: {
      id: 50n,
      connectedById: actor.id,
      organizationId: org.id,
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
      defaultBranch: "main",
    },
  });
  const endpoint = {
    id: "local",
    name: "Local",
    baseUrl: "http://127.0.0.1:1234/v1",
    locality: "local",
    requiresKey: false,
    models: ["fixture-model"],
  };
  const provider = await db.aiProviderConnection.create({
    data: {
      organizationId: org.id,
      name: "Fixture",
      endpointId: "local",
      endpoint,
      modelId: "fixture-model",
      enabled: true,
      testStatus: "CONNECTED",
      testedAt: new Date(),
      testedRevision: 1,
      testedEndpointDigest: endpointDigest(endpoint as any),
      createdById: actor.id,
    },
  });
  await db.aiStageRoute.create({
    data: {
      organizationId: org.id,
      stage: "vapt",
      primaryId: provider.id,
      enabled: true,
      allowSource: true,
      updatedById: actor.id,
    },
  });
  github.readRepositorySnapshot.mockResolvedValue({
    sourceSha: sha,
    treeSha: "c".repeat(40),
    branch: "main",
    fullName: "fixture/repo",
    complete: true,
    files: [],
    warnings: [],
    scanSource: { source, excludedFiles: 0 },
  });
  github.readHealthScanSource.mockResolvedValue({ source, excludedFiles: 0 });
  github.savedDisplay.mockResolvedValue({
    head: sha,
    checkedAt: new Date().toISOString(),
  });
  const access = new AuthorizationService(db);
  service = new RepositoryHealthService(
    db,
    access,
    github,
    {} as any,
    new FindingSourceStore(db, github),
    undefined,
    new HealthStrixService(db, access, github, client),
  );
});
it("snapshots configured limits for new scans and stops exhausted scans after confirmed cleanup", async () => {
  await fixture.prisma.aiVaptSettings.create({
    data: {
      organizationId: owner.organizationId,
      updatedById: owner.identityId,
      maxInputTokens: 9000000,
      maxOutputTokens: 200000,
      maxModelCalls: 120,
    },
  });
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  const run = await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
    where: { assessmentId: queued.id },
  });
  expect(run).toMatchObject({
    maxInputTokens: 9000000,
    maxOutputTokens: 200000,
    maxModelCalls: 120,
  });
  await fixture.prisma.aiVaptSettings.update({
    where: { organizationId: owner.organizationId },
    data: { maxInputTokens: 10000000, revision: 2 },
  });
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: queued.id },
      })
    ).maxInputTokens,
  ).toBe(9000000);
  await fixture.prisma.repositoryHealthStrixRun.update({
    where: { assessmentId: queued.id },
    data: { failureCode: "STRIX_INPUT_LIMIT_REACHED" },
  });
  client.cancel.mockResolvedValueOnce({ cleanupConfirmed: false });
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("RUNNING");
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  const stopped =
    await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: queued.id },
    });
  expect(stopped).toMatchObject({
    state: "FAILED",
    reason: "STRIX_INPUT_LIMIT_REACHED",
  });
  expect(stopped.finishedAt).toBeTruthy();
  expect(stopped.report).toMatchObject({
    analyses: [{ state: "INCOMPLETE", reason: "STRIX_INPUT_LIMIT_REACHED" }],
  });
  expect(client.cancel).toHaveBeenCalledTimes(2);
  expect(
    (
      await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: queued.id },
      })
    ).finishedAt,
  ).toBeTruthy();
});
it("runs a revision-bound Strix scan from Health without CI, standards or native-scanner evidence", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  expect(client.admit).toHaveBeenCalledWith(
    expect.objectContaining({
      source: expect.objectContaining({ sourceSha: sha }),
      model: "openai/fixture-model",
    }),
  );
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  const saved =
    await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: queued.id },
    });
  expect(saved).toMatchObject({
    state: "COMPLETED",
    sourceSha: sha,
    report: {
      completeness: "PARTIAL",
      findings: [{ evidence: "AI_REPORTED", path: "app.ts" }],
    },
  });
  expect(await fixture.prisma.commitAssessment.count()).toBe(0);
  expect(await fixture.prisma.nativeExecutionRequest.count()).toBe(0);
  const view = await service.get(owner, "51");
  expect(view.assessment).toBeNull();
  expect(view.strixReview?.id).toBe(queued.id);
});
it("revocation cancels an owned Strix job before any new source read or inference", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  const reads = github.readHealthScanSource.mock.calls.length;
  await fixture.prisma.organizationMembership.deleteMany({
    where: { identityId: owner.identityId },
  });
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(client.cancel).toHaveBeenCalledWith(queued.id);
  expect(github.readHealthScanSource.mock.calls.length).toBe(reads);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("FAILED");
});
it("does not replay a paid scan after the runner loses job state", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  admitted = false;
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(client.admit).toHaveBeenCalledOnce();
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).reason,
  ).toBe("STRIX_RUNNER_STATE_LOST");
});

it("preserves the static Health result while Strix runs and after it completes", async () => {
  const baseline = await fixture.prisma.repositoryHealthAssessment.create({
    data: {
      repositoryId: repo.id,
      organizationId: owner.organizationId,
      actorId: owner.identityId,
      branch: "main",
      targetRevision: 1,
      requestKey: randomUUID(),
      state: "COMPLETED",
      sourceSha: sha,
      finishedAt: new Date(),
      report: {
        version: 1,
        mode: "INSPECTION_ONLY",
        completeness: "PARTIAL",
        inspection: { complete: true, fileCount: 1, languages: [] },
        analyses: [],
        findings: [],
      },
    },
  });
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  expect((await service.get(owner, "51")).assessment?.id).toBe(baseline.id);
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  const view = await service.get(owner, "51");
  expect(view.assessment?.id).toBe(baseline.id);
  expect(view.strixReview?.id).toBe(queued.id);
});
it("keeps an admitted scan tracked while runner cleanup cannot be confirmed", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  client.cancel.mockRejectedValueOnce(new Error("Runner offline"));
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null, cancelledAt: new Date() },
  });
  await service.process(queued.id);
  const saved =
    await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: queued.id },
    });
  expect(saved.state).toBe("RUNNING");
  expect(saved.finishedAt).toBeNull();
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("CANCELLED");
});

it("requeues an explicitly busy runner without consuming admission or cancelling another job", async () => {
  client.admit.mockRejectedValueOnce(new StrixRunnerBusyError());
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  const waiting =
    await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: queued.id },
    });
  expect(waiting).toMatchObject({
    state: "QUEUED",
    reason: "STRIX_RUNNER_BUSY",
    leaseToken: null,
    finishedAt: null,
  });
  expect(waiting.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
  expect(
    (
      await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: queued.id },
      })
    ).dispatchedAt,
  ).toBeNull();
  expect(client.cancel).not.toHaveBeenCalled();
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(client.admit).toHaveBeenCalledTimes(2);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("COMPLETED");
});

it("cancels a waiting review without retrying admission", async () => {
  client.admit.mockRejectedValueOnce(new StrixRunnerBusyError());
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  await service.cancel(owner, "51", queued.id);
  await service.process(queued.id);
  expect(client.admit).toHaveBeenCalledOnce();
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("CANCELLED");
  expect(
    (
      await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: queued.id },
      })
    ).finishedAt,
  ).not.toBeNull();
});

it("never retries an ambiguous admission failure", async () => {
  client.admit.mockRejectedValueOnce(new Error("STRIX_RUNNER_UNAVAILABLE"));
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  await service.process(queued.id);
  expect(client.admit).toHaveBeenCalledOnce();
  expect(client.cancel).toHaveBeenCalledWith(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("FAILED");
});

it("rolls back both terminal markers when saving finding sources fails, then recovers the receipt", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  vi.mocked(queueFindingSources).mockRejectedValueOnce(
    new Error("fixture transaction interruption"),
  );
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("RUNNING");
  expect(
    (
      await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: queued.id },
      })
    ).finishedAt,
  ).toBeNull();
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("COMPLETED");
  expect(
    (
      await fixture.prisma.repositoryHealthStrixRun.findUniqueOrThrow({
        where: { assessmentId: queued.id },
      })
    ).finishedAt,
  ).not.toBeNull();
  expect(client.admit).toHaveBeenCalledOnce();
});

it("recovers a completed receipt left behind by an older worker's non-atomic finalization", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  await fixture.prisma.repositoryHealthStrixRun.update({
    where: { assessmentId: queued.id },
    data: { finishedAt: new Date() },
  });
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  const saved =
    await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: queued.id },
    });
  expect(saved).toMatchObject({
    state: "COMPLETED",
    reason: null,
    report: { findings: [{ evidence: "AI_REPORTED" }] },
  });
  expect(client.admit).toHaveBeenCalledOnce();
});

it("rejects a receipt from another job instead of importing its findings", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  client.status.mockResolvedValueOnce({
    version: 1,
    assessmentId: randomUUID(),
    sourceHash,
    state: "COMPLETED",
    toolVersion: "1.7.0",
    cleanupConfirmed: true,
    findings: [],
  });
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("FAILED");
});

it("honors cancellation received while verifying a completed receipt", async () => {
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    scanner: "strix",
  });
  await service.process(queued.id);
  github.readHealthScanSource.mockImplementationOnce(async () => {
    await service.cancel(owner, "51", queued.id);
    return { source, excludedFiles: 0 };
  });
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: queued.id },
    data: { leaseUntil: null },
  });
  await service.process(queued.id);
  const saved =
    await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: queued.id },
    });
  expect(saved).toMatchObject({
    state: "CANCELLED",
    reason: "EXECUTION_CANCELLED",
    report: { findings: [] },
  });
});

const scratchDirectories: string[] = [];
afterAll(async () => {
  for (const directory of scratchDirectories)
    await rm(directory, { recursive: true, force: true });
});
async function combined() {
  const directory = await mkdtemp(join(tmpdir(), "preflyt-combined-test-"));
  scratchDirectories.push(directory);
  const store = new HealthSourceStore(directory, Buffer.alloc(32, 3));
  const access = new AuthorizationService(fixture.prisma);
  const ids = [
    "secrets.scan",
    "security.sast",
    "quality.reliability",
    "quality.maintainability",
    "quality.duplication",
    "security.hotspots",
  ] as const;
  const pair = generateKeyPairSync("ed25519");
  const pkg = {
    version: 1,
    environmentId: "source-fixture",
    runtime: "runc",
    controlsHash: "d".repeat(64),
    controllerPublicKey: pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    createdAt: new Date(Date.now() - 60000).toISOString(),
    tools: ids.map((ruleId) => ({
      ruleId,
      image: "sha256:" + "b".repeat(64),
      toolVersion: "fixture-1",
      license: nativeAdapters[ruleId].license,
      configHash: "c".repeat(64),
      reviewDigest: "d".repeat(64),
      expiresAt: "2099-01-01T00:00:00Z",
      databaseBuiltAt: null,
    })),
  };
  let staticAdmitted = false;
  const scanner: any = {
    package: vi.fn(async () => pkg),
    call: vi.fn(async (action: string) => {
      if (action === "status")
        return staticAdmitted
          ? { state: "COMPLETE", signature: "fixture", cleanupConfirmed: true }
          : { state: "NOT_FOUND" };
      if (action === "admit") {
        staticAdmitted = true;
        return { state: "RUNNING" };
      }
      return { state: "COMPLETE", cleanupConfirmed: true };
    }),
    verify: (_pkg: any, expected: any) => ({
      cancelled: false,
      checks: expected.ruleIds.map((ruleId: string) => ({
        ruleId,
        state: "INCOMPLETE",
        reason: "FIXTURE_PARTIAL",
        cleanupConfirmed: true,
        findings: [],
      })),
    }),
  };
  const build = () =>
    new RepositoryHealthService(
      fixture.prisma,
      access,
      github,
      {
        status: async () => ({
          executionAvailable: false,
          reason: "EXECUTION_UNAVAILABLE",
        }),
      } as any,
      new FindingSourceStore(fixture.prisma, github),
      scanner,
      new HealthStrixService(
        fixture.prisma,
        access,
        github,
        client,
        new HealthSourceStore(directory, Buffer.alloc(32, 3)),
      ),
      new HealthSourceStore(directory, Buffer.alloc(32, 3)),
    );
  service = build();
  return { directory, scanner, build };
}
async function advance(id: string) {
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id },
    data: { leaseUntil: null },
  });
  await service.process(id);
}
it("fetches once for a combined assessment, survives a worker replacement and pins both scanners to the same snapshot", async () => {
  const { directory, scanner, build } = await combined();
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  expect(queued.aiReviewId).toBeTruthy();
  await service.process(queued.aiReviewId!); // A child cannot claim the organization slot before source preparation.
  expect(github.readRepositorySnapshot).not.toHaveBeenCalled();
  await service.process(queued.id);
  const staticSource = scanner.call.mock.calls.find(
    (call: any[]) => call[0] === "admit",
  )?.[2];
  expect(staticSource.sourceHash).toBe(sourceHash);
  await service.process(queued.aiReviewId!);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("RUNNING");
  service = build();
  github.readRepositorySnapshot.mockResolvedValue({
    ...(await github.readRepositorySnapshot.mock.results[0].value),
    sourceSha: "c".repeat(40),
  });
  await advance(queued.id);
  expect(client.admit).toHaveBeenCalledWith(
    expect.objectContaining({
      source: expect.objectContaining({ sourceSha: sha, sourceHash }),
    }),
  );
  await advance(queued.aiReviewId!);
  expect(github.readRepositorySnapshot).toHaveBeenCalledOnce();
  expect(github.readHealthScanSource).not.toHaveBeenCalled();
  const view = await service.get(owner, "51");
  expect(view.assessment).toMatchObject({
    id: queued.id,
    state: "COMPLETED",
    sourceSha: sha,
  });
  expect(view.strixReview).toMatchObject({
    id: queued.aiReviewId,
    state: "COMPLETED",
    sourceSha: sha,
    parentId: queued.id,
  });
  expect(view.history).toHaveLength(1);
  expect(view.assessmentOptions.includeAiSecurity).toBe(true);
  const { readdir } = await import("node:fs/promises");
  expect(await readdir(directory)).toEqual([]);
  const standalone = await service.start(owner, "51", {requestKey:randomUUID(),scanner:"strix"});
  const current = await service.get(owner,"51");
  expect(current.strixReview).toMatchObject({id:standalone.id,state:"QUEUED",sourceSha:null});
  const historical = await service.get(owner,"51",queued.id);
  expect(historical.strixReview?.id).toBe(queued.aiReviewId);
});
it.each([
  "disconnected",
  "disabled-route",
  "source-sharing-disabled",
  "missing-route",
])(
  "skips AI when %s and completes normal checks without contacting the AI runner",
  async (reason) => {
    await combined();
    if (reason === "disconnected")
      await fixture.prisma.aiProviderConnection.updateMany({
        data: { testStatus: "UNAVAILABLE" },
      });
    if (reason === "disabled-route")
      await fixture.prisma.aiStageRoute.updateMany({
        data: { enabled: false },
      });
    if (reason === "source-sharing-disabled")
      await fixture.prisma.aiStageRoute.updateMany({
        data: { allowSource: false },
      });
    if (reason === "missing-route")
      await fixture.prisma.aiStageRoute.deleteMany();
    const queued = await service.start(owner, "51", {
      requestKey: randomUUID(),
      includeAiSecurity: true,
    });
    await service.process(queued.id);
    await advance(queued.id);
    const view = await service.get(owner, "51");
    expect(view.assessment?.state).toBe("COMPLETED");
    expect(view.strixReview).toMatchObject({
      state: "SKIPPED",
      reason: "AI_SECURITY_UNAVAILABLE",
    });
    expect(await fixture.prisma.repositoryHealthStrixRun.count()).toBe(0);
    expect(client.call).not.toHaveBeenCalled();
    expect(client.admit).not.toHaveBeenCalled();
  },
);
it("still runs the AI review of the prepared snapshot if the standard scanner fails", async () => {
  const { scanner } = await combined();
  scanner.package.mockRejectedValue(new Error("fixture scanner offline"));
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  await service.process(queued.id);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).state,
  ).toBe("FAILED");
  await service.process(queued.aiReviewId!);
  await advance(queued.aiReviewId!);
  expect(
    (
      await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: queued.aiReviewId! },
      })
    ).state,
  ).toBe("COMPLETED");
  expect(github.readRepositorySnapshot).toHaveBeenCalledOnce();
  expect(github.readHealthScanSource).not.toHaveBeenCalled();
});
it("skips AI if the connected model is disabled before dispatch and keeps the standard result", async () => {
  await combined();
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  await service.process(queued.id);
  await advance(queued.id);
  await fixture.prisma.aiProviderConnection.updateMany({
    data: { enabled: false },
  });
  await service.process(queued.aiReviewId!);
  const view = await service.get(owner, "51");
  expect(view.assessment?.state).toBe("COMPLETED");
  expect(view.strixReview?.state).toBe("SKIPPED");
  expect(client.admit).not.toHaveBeenCalled();
});
it("cancels both jobs before fetching source when a combined assessment is cancelled", async () => {
  await combined();
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  await service.cancel(owner, "51", queued.id);
  await service.process(queued.id);
  await service.process(queued.aiReviewId!);
  const rows = await fixture.prisma.repositoryHealthAssessment.findMany({
    where: { OR: [{ id: queued.id }, { parentId: queued.id }] },
  });
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.state === "CANCELLED")).toBe(true);
  expect(github.readRepositorySnapshot).not.toHaveBeenCalled();
  expect(client.admit).not.toHaveBeenCalled();
});
it("skips AI when protected source storage is unavailable and still completes standard checks", async () => {
  const { directory } = await combined();
  const blocked = new HealthSourceStore(directory, Buffer.alloc(32, 3));
  vi.spyOn(blocked, "save").mockRejectedValue(
    new Error("fixture scratch unavailable"),
  );
  const access = new AuthorizationService(fixture.prisma);
  const previous = service as any;
  service = new RepositoryHealthService(
    fixture.prisma,
    access,
    github,
    previous.runtime,
    new FindingSourceStore(fixture.prisma, github),
    previous.scanner,
    new HealthStrixService(fixture.prisma, access, github, client, blocked),
    blocked,
  );
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  await service.process(queued.id);
  await advance(queued.id);
  const view = await service.get(owner, "51");
  expect(view.assessment?.state).toBe("COMPLETED");
  expect(view.strixReview).toMatchObject({
    state: "SKIPPED",
    reason: "HEALTH_SHARED_SOURCE_UNAVAILABLE",
  });
  expect(client.admit).not.toHaveBeenCalled();
});
it("fails closed on a lost shared snapshot without fetching a newer branch", async () => {
  const { directory } = await combined();
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  await service.process(queued.id);
  await advance(queued.id);
  await rm(join(directory, queued.id + ".source"));
  await service.process(queued.aiReviewId!);
  const view = await service.get(owner, "51");
  expect(view.assessment?.state).toBe("COMPLETED");
  expect(view.strixReview).toMatchObject({
    state: "FAILED",
    reason: "HEALTH_SHARED_SOURCE_UNAVAILABLE",
  });
  expect(github.readRepositorySnapshot).toHaveBeenCalledOnce();
  expect(github.readHealthScanSource).not.toHaveBeenCalled();
  expect(client.admit).not.toHaveBeenCalled();
});
it("never opts automatic branch assessments into paid AI reviews", async () => {
  await combined();
  await fixture.prisma.repositoryHealthTarget.create({
    data: {
      repositoryId: repo.id,
      organizationId: owner.organizationId,
      actorId: owner.identityId,
      branch: "main",
      includeAiSecurity: true,
    },
  });
  const queued = await service.initial(owner.identityId, "51");
  expect(queued.includeAiSecurity).toBe(false);
  expect(queued.aiReviewId).toBeNull();
  expect(client.call).not.toHaveBeenCalled();
  expect(
    (
      await fixture.prisma.repositoryHealthTarget.findUniqueOrThrow({
        where: { repositoryId: repo.id },
      })
    ).includeAiSecurity,
  ).toBe(true);
});
it("keeps the combined request idempotent and rejects a different AI scope for the same key", async () => {
  await combined();
  const requestKey = randomUUID();
  const first = await service.start(owner, "51", {
    requestKey,
    includeAiSecurity: true,
  });
  const repeat = await service.start(owner, "51", {
    requestKey,
    includeAiSecurity: true,
  });
  expect(repeat.id).toBe(first.id);
  expect(repeat.aiReviewId).toBe(first.aiReviewId);
  expect(await fixture.prisma.repositoryHealthAssessment.count()).toBe(2);
  await expect(
    service.start(owner, "51", { requestKey, includeAiSecurity: false }),
  ).rejects.toThrow("different assessment scope");
});
it("skips the AI stage if its scanner connection disappears during preflight", async () => {
  await combined();
  client.connection.mockRejectedValueOnce(
    new Error("fixture connection unavailable"),
  );
  const queued = await service.start(owner, "51", {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  await service.process(queued.id);
  await advance(queued.id);
  const view = await service.get(owner, "51");
  expect(view.assessment?.state).toBe("COMPLETED");
  expect(view.strixReview?.state).toBe("SKIPPED");
  expect(await fixture.prisma.repositoryHealthStrixRun.count()).toBe(0);
  expect(client.admit).not.toHaveBeenCalled();
});

it('saves unverified VAPT issues in Findings with complete analysis and immediate source from the assessed snapshot',async()=>{
 github.readHealthSource=vi.fn();
 const analysis={reasoning:'The identifier reaches an unscoped lookup. '.repeat(30),impact:'A different tenant record may be disclosed.',remediation:'Bind the lookup to the authenticated tenant.',preconditions:'Caller must have route access.',verification_steps:'Test tenant A against tenant B records.',counterevidence:'An inherited guard requires verification.'};
 const status=client.status.getMockImplementation()!;
 client.status.mockImplementation(async(id:string)=>{
   const result=await status(id);
   return result.state==='COMPLETED'?{...result,findings:[{title:'Missing tenant-bound lookup',severity:'high',review_status:'NEEDS_REVIEW',source_analysis:analysis,code_locations:[{file:'app.ts',start_line:1,end_line:1}]}]}:result;
 });
 const queued=await service.start(owner,'51',{scanner:'strix',requestKey:randomUUID()});
 await service.process(queued.id);await advance(queued.id);
 const db=fixture.prisma;
 const saved=await db.repositoryHealthAssessment.findUniqueOrThrow({where:{id:queued.id}});
 const finding=(saved.report as any).findings[0];
 expect(finding.aiReview.reasoning).toBe(analysis.reasoning.trim());
 const findings=new FindingsService(db,new AuthorizationService(db),new FindingSourceStore(db,github));
 const list=await findings.list(owner,{repository:'51'});
 expect(list.rows).toEqual(expect.arrayContaining([expect.objectContaining({title:'Missing tenant-bound lookup',status:'Needs review',health:queued.id})]));
 const detail=await service.findingDetail(owner,'51',queued.id,finding.fingerprint);
 expect(detail.assessment.report.findings[0].aiReview?.remediation).toBe(analysis.remediation);
 const excerpt=await service.source(owner,'51',queued.id,finding.fingerprint);
 expect(excerpt.reason).toBeNull();expect(excerpt.lines.length).toBeGreaterThan(0);
 expect(excerpt.lines[0].number).toBe(1);
 expect(github.readHealthSource).not.toHaveBeenCalled();
 const outsider={...owner,organizationId:randomUUID()};
 await expect(service.source(outsider,'51',queued.id,finding.fingerprint)).rejects.toThrow();
});

it('pins the payment profile, isolates request keys and rejects reports across organizations', async () => {
  client.call.mockResolvedValueOnce({version:1,toolVersion:'1.7.0',available:true,reviewProfiles:['general','payment-risk-v1']})
  client.call.mockResolvedValueOnce({version:1,toolVersion:'1.7.0',available:true,reviewProfiles:['general','payment-risk-v1']})
  const requestKey=randomUUID()
  const queued=await service.start(owner,'51',{requestKey,scanner:'strix',reviewProfile:'payment-risk-v1'})
  expect(queued.reviewProfile).toBe('payment-risk-v1')
  await expect(service.start(owner,'51',{requestKey,scanner:'strix'})).rejects.toThrow('different review profile')
  await expect(service.start(owner,'51',{requestKey:randomUUID(),reviewProfile:'payment-risk-v1'})).rejects.toThrow('Choose a review profile')
  await expect(service.paymentRiskReport(owner,'51',queued.id)).rejects.toThrow('No completed payment risk report')
  await fixture.prisma.repositoryHealthAssessment.update({where:{id:queued.id},data:{report:{version:1,paymentRiskReport:{version:1,profile:'payment-risk-v1',executiveSummary:'Fixture payment report.'}}}})
  expect((await service.paymentRiskReport(owner,'51',queued.id)).report).toMatchObject({profile:'payment-risk-v1'})
  await expect(service.paymentRiskReport({...owner,organizationId:randomUUID()},'51',queued.id)).rejects.toThrow()
})


it('saves a complete payment report, serves compact health summaries and exposes its linked finding', async () => {
  client.call.mockResolvedValueOnce({version:1,toolVersion:'1.7.0',available:true,reviewProfiles:['general','payment-risk-v1']})
  client.call.mockResolvedValueOnce({version:1,toolVersion:'1.7.0',available:true,reviewProfiles:['general','payment-risk-v1']})
  const queued=await service.start(owner,'51',{requestKey:randomUUID(),scanner:'strix',reviewProfile:'payment-risk-v1'})
  await service.process(queued.id)
  expect(client.admit).toHaveBeenLastCalledWith(expect.objectContaining({reviewProfile:'payment-risk-v1',source:expect.objectContaining({sourceSha:sha})}))
  const paymentReport=JSON.parse(readFileSync(new URL('../../../tools/strix-runner/fixtures/payment-risk-v1.json',import.meta.url),'utf8'))
  for(const rows of [paymentReport.systemInventory,paymentReport.domains,paymentReport.paymentRiskRegister,paymentReport.attackScenarios])for(const row of rows)for(const ref of row.references){ref.path='app.ts';ref.startLine=1;ref.endLine=1}
  client.status.mockResolvedValueOnce({version:1,assessmentId:queued.id,sourceHash,state:'COMPLETED',toolVersion:'1.7.0',cleanupConfirmed:true,paymentRiskReport:paymentReport,findings:[{
    id:'issue-1',title:'Fixture payment concern',severity:'low',review_status:'NEEDS_REVIEW',code_locations:[{file:'app.ts',start_line:1,end_line:1}],source_analysis:{reasoning:'The fixture illustrates a missing guard.',impact:'A transfer may cross ownership boundaries.',remediation:'Validate ownership.',preconditions:'A caller can reach the handler.',verification_steps:'Verify with separate owners.',counterevidence:'Inspect inherited guards before confirming.'}
  }]})
  await fixture.prisma.repositoryHealthAssessment.update({where:{id:queued.id},data:{leaseUntil:null}})
  await service.process(queued.id)
  const saved=await fixture.prisma.repositoryHealthAssessment.findUniqueOrThrow({where:{id:queued.id}})
  expect(saved.state).toBe('COMPLETED')
  const report=(await service.paymentRiskReport(owner,'51',queued.id)).report as any
  expect(report.findings[0]).toMatchObject({severity:'critical',score:20})
  const view=await service.get(owner,'51')
  expect(view.strixReview?.report?.paymentRiskSummary).toMatchObject({findings:1})
  expect(view.strixReview?.report?.paymentRiskReport).toBeUndefined()
  const detail=await service.findingDetail(owner,'51',queued.id,report.findings[0].issueId)
  expect(JSON.stringify(detail)).toContain('NEEDS_REVIEW')
})

it('queues both AI scopes as one child and fetches their source only once',async()=>{
 const {scanner}=await combined()
 client.call.mockResolvedValueOnce({version:1,toolVersion:'1.7.0',available:true,reviewProfiles:['general','payment-risk-v1','general-and-payment-risk-v1']})
 const requestKey=randomUUID()
 const queued=await service.start(owner,'51',{requestKey,includeAiSecurity:true,reviewProfile:'general-and-payment-risk-v1'})
 expect(queued.reviewProfile).toBe('general-and-payment-risk-v1')
 expect(await fixture.prisma.repositoryHealthAssessment.count({where:{parentId:queued.id}})).toBe(1)
 await service.process(queued.id)
 await service.process(queued.aiReviewId!)
 expect(client.admit).toHaveBeenCalledOnce()
 const request=client.admit.mock.calls[0]![0]
 const staticSource=scanner.call.mock.calls.find((call:any[])=>call[0]==='admit')?.[2]
 expect(request.reviewProfile).toBe('general-and-payment-risk-v1')
 expect(request.source.sourceHash).toBe(staticSource.sourceHash)
 expect(github.readRepositorySnapshot).toHaveBeenCalledOnce()
 expect(github.readHealthScanSource).not.toHaveBeenCalled()
 client.call.mockResolvedValueOnce({version:1,toolVersion:'1.7.0',available:true,reviewProfiles:['general','payment-risk-v1']})
 await expect(service.start(owner,'51',{requestKey,includeAiSecurity:true,reviewProfile:'payment-risk-v1'})).rejects.toThrow('different review profile')
})
