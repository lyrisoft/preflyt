/** Opt-in real-engine/provider acceptance. Never sends a connected repository's source. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { disposableDatabase } from "./disposable-database.js";
import { unpackConfiguration } from "../src/configuration/configuration-store.js";
import { applyConfiguration } from "../src/configuration/runtime-configuration.js";
import { AiConfigurationService } from "../src/intelligence/ai-configuration.service.js";
import { aiReviewsEnabled } from "../src/intelligence/ai-configuration.js";
import { effectiveAiRoute } from "../src/intelligence/effective-ai-route.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { RepositoryHealthService } from "../src/health/repository-health.service.js";
import { HealthStrixService } from "../src/health/strix.service.js";
import { StrixModelController } from "../src/health/strix-model.controller.js";
import { FindingSourceStore } from "../src/findings/finding-source-store.service.js";
import { HealthSourceStore } from "../src/health/health-source-store.js";
import { HealthScannerClient } from "../src/health/health-scanner-client.js";
import {
  gitObjectHash,
  readPinnedNativeSource,
} from "../src/execution/native-source.js";

assert.equal(
  process.env.PREFLYT_STRIX_ACCEPTANCE,
  "1",
  "Opt in with PREFLYT_STRIX_ACCEPTANCE=1. This uses the configured model and its normal charges.",
);
const root = resolve("../..");
const temp = await mkdtemp(join(tmpdir(), "preflyt-strix-acceptance-"));
const original = new PrismaService();
let fixture: Awaited<ReturnType<typeof disposableDatabase>> | undefined;
let app: NestExpressApplication | undefined;
let runner: ReturnType<typeof spawn> | undefined;
let runnerExited: Promise<unknown> | undefined;
let service: RepositoryHealthService | undefined;
let assessmentId: string | undefined;
let groupId: string | undefined;
let actor: any;
const repositoryId = "999942";
const started = Date.now();
try {
  const configuration =
    await original.deploymentConfiguration.findUniqueOrThrow({
      where: { id: "primary" },
    });
  applyConfiguration(unpackConfiguration(configuration), true);
  assert(aiReviewsEnabled(), "AI reviews must already be enabled");
  const organizations = await original.aiStageRoute.findMany({
    where: { stage: { in: ["vapt", "default"] } },
    select: { organizationId: true },
  });
  let selected: Awaited<ReturnType<typeof effectiveAiRoute>>;
  let provider: Awaited<
    ReturnType<typeof original.aiProviderConnection.findFirst>
  >;
  for (const { organizationId } of organizations) {
    const route = await effectiveAiRoute(original, organizationId, "vapt");
    if (!route?.enabled || !route.allowSource || !route.primaryId) continue;
    const connection = await original.aiProviderConnection.findFirst({
      where: { id: route.primaryId, organizationId },
    });
    if (
      !new AiConfigurationService(original, {} as any).ready(
        connection ?? undefined,
      )
    )
      continue;
    selected = route;
    provider = connection;
    break;
  }
  assert(
    selected! && provider!,
    "An enabled, tested VAPT/default route with source sharing is required",
  );
  await original.$disconnect();
  process.env.NODE_ENV = "test";
  fixture = await disposableDatabase("strixacceptance");
  await fixture.reset();
  const db = fixture.prisma;
  const identity = await db.identity.create({
    data: { issuer: "fixture", subject: randomUUID() },
  });
  // Preserve the provider's encryption binding only inside the disposable database.
  await db.organization.create({
    data: { id: selected!.organizationId, name: "Disposable VAPT acceptance" },
  });
  await db.organizationMembership.create({
    data: {
      identityId: identity.id,
      organizationId: selected!.organizationId,
      role: "OWNER",
    },
  });
  await db.aiProviderConnection.create({
    data: {
      ...provider!,
      endpoint: provider!.endpoint as any,
      createdById: identity.id,
    },
  });
  await db.aiStageRoute.create({
    data: { ...selected!, updatedById: identity.id },
  });
  await db.gitHubInstallation.create({
    data: {
      id: 999941n,
      connectedById: identity.id,
      organizationId: selected!.organizationId,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
    },
  });
  await db.gitHubRepository.create({
    data: {
      githubId: BigInt(repositoryId),
      installationId: 999941n,
      name: "source-fixture",
      fullName: "fixture/source-fixture",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
      defaultBranch: "main",
    },
  });
  actor = {
    authenticated: true,
    identityId: identity.id,
    organizationId: selected!.organizationId,
    role: "OWNER",
    subject: "fixture",
    email: null,
  };
  const code = Buffer.from(
    [
      '"""Invoice read service. Each caller may access only its own tenant invoices."""',
      'INVOICES = {"invoice-a": {"tenant_id": "tenant-a", "amount_cents": 100}}',
      "def read_invoice(caller_tenant, invoice_id):",
      "    return INVOICES[invoice_id]",
      'if __name__ == "__main__":',
      '    assert read_invoice("tenant-b", "invoice-a")["tenant_id"] == "tenant-a"',
      '    print("fixture: cross-tenant invoice access reproduced")',
      "",
    ].join("\n"),
  );
  const blobSha = gitObjectHash("blob", code);
  const treeSha = gitObjectHash(
    "tree",
    Buffer.concat([
      Buffer.from("100644 app.py\0"),
      Buffer.from(blobSha, "hex"),
    ]),
  );
  const commit = Buffer.from(
    `tree ${treeSha}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nDisposable acceptance fixture\n`,
  );
  const sourceSha = createHash("sha1")
    .update(Buffer.concat([Buffer.from(`commit ${commit.length}\0`), commit]))
    .digest("hex");
  const source = await readPinnedNativeSource(
    async <T>(path: string): Promise<T> => {
      if (path.includes("/git/commits/"))
        return { sha: sourceSha, tree: { sha: treeSha } } as T;
      if (path.includes("/git/trees/"))
        return {
          sha: treeSha,
          truncated: false,
          tree: [
            {
              path: "app.py",
              mode: "100644",
              type: "blob",
              sha: blobSha,
              size: code.length,
            },
          ],
        } as T;
      return {
        sha: blobSha,
        encoding: "base64",
        size: code.length,
        content: code.toString("base64"),
      } as T;
    },
    "/repos/fixture/source-fixture",
    repositoryId,
    sourceSha,
  );
  let sourceFetches = 0;
  const github: any = {
    readRepositorySnapshot: async () => {
      sourceFetches++;
      return {
        sourceSha,
        treeSha,
        branch: "main",
        fullName: "fixture/source-fixture",
        complete: true,
        warnings: [],
        files: [
          {
            path: "app.py",
            sha: blobSha,
            size: code.length,
            content: code.toString(),
          },
        ],
        scanSource: { source, excludedFiles: 0 },
      };
    },
    readHealthScanSource: async () => {
      throw new Error("Unexpected duplicate source fetch");
    },
    savedDisplay: async () => ({
      head: sourceSha,
      checkedAt: new Date().toISOString(),
    }),
  };
  const access = new AuthorizationService(db);
  const sourceStore = new HealthSourceStore(join(temp, "source-cache"));
  const strix = new HealthStrixService(
    db,
    access,
    github,
    undefined,
    sourceStore,
  );
  @Module({
    controllers: [StrixModelController],
    providers: [{ provide: HealthStrixService, useValue: strix }],
  })
  class BrokerModule {}
  app = await NestFactory.create<NestExpressApplication>(BrokerModule, {
    logger: false,
  });
  app.useBodyParser("json", { limit: "1mb" });
  await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl();
  process.env.STRIX_CALLBACK_ORIGIN = origin;
  process.env.STRIX_CONNECTION_FILE = join(temp, "state", "connection.json");
  runner = spawn(
    resolve(".preflyt/strix-env/bin/python"),
    [
      join(root, "tools/strix-runner/runner.py"),
      "--state",
      join(temp, "state"),
      "--port",
      "0",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PREFLYT_API_ORIGIN: origin,
        STRIX_SANDBOX_BASE:
          process.env.STRIX_SANDBOX_BASE ??
          "ghcr.io/usestrix/strix-sandbox@sha256:478e0b37ec83b2ba8c6e159593cb46d5dc9b624a45d6a9bb606851b83058d284",
      },
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  runnerExited = new Promise((done, reject) => {
    runner!.once("exit", done);
    runner!.once("error", reject);
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await readFile(process.env.STRIX_CONNECTION_FILE);
      break;
    } catch {
      assert(
        runner.exitCode === null && attempt < 180,
        "Isolated fixture runner failed to start",
      );
      await delay(1000);
    }
  }
  service = new RepositoryHealthService(
    db,
    access,
    github,
    {} as any,
    new FindingSourceStore(db, github),
    new HealthScannerClient(),
    strix,
    sourceStore,
  );
  const queued = await service.start(actor, repositoryId, {
    requestKey: randomUUID(),
    includeAiSecurity: true,
  });
  groupId = queued.id;
  assert(
    queued.aiReviewId,
    "The combined assessment must create a linked AI review",
  );
  assessmentId = queued.aiReviewId;
  console.log(
    JSON.stringify({
      event: "fixture_scan_started",
      model: provider!.modelId,
      sourceFiles: 1,
    }),
  );
  const deadline = Date.now() + 10 * 60000;
  for (;;) {
    await service.process(groupId);
    await service.process(assessmentId);
    const saved = await db.repositoryHealthAssessment.findUniqueOrThrow({
      where: { id: assessmentId },
    });
    if (!["QUEUED", "RUNNING"].includes(saved.state)) {
      const report = saved.report as any;
      const usage = await db.repositoryHealthStrixRun.findUnique({
        where: { assessmentId },
      });
      console.log(
        JSON.stringify({
          event: "fixture_scan_finished",
          state: saved.state,
          reason: saved.reason,
          suggestions: report?.findings?.length,
          coverageAvailable: report?.sourceReviewCoverage?.available,
          modelCalls: usage?.modelCalls ?? 0,
          sourceFetches,
          standardState: (
            await db.repositoryHealthAssessment.findUniqueOrThrow({
              where: { id: groupId },
            })
          ).state,
          standardReason: (
            await db.repositoryHealthAssessment.findUniqueOrThrow({
              where: { id: groupId },
            })
          ).reason,
          elapsedSeconds: Math.round((Date.now() - started) / 1000),
        }),
      );
      assert.equal(
        saved.state,
        "COMPLETED",
        "Real-engine source fixture did not complete",
      );
      assert(
        report.findings.some(
          (finding: any) =>
            finding.path === "app.py" && finding.evidence === "AI_REPORTED",
        ),
        "Expected a source-linked suggestion for the deliberately vulnerable fixture",
      );
      assert.equal(report.sourceReviewCoverage?.available, true);
      assert.equal(report.completeness, "PARTIAL");
      assert(usage?.finishedAt);
      const standard = await db.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: groupId },
      });
      assert.equal(
        standard.state,
        "COMPLETED",
        "Standard scanner fixture did not complete",
      );
      assert.equal(standard.sourceSha, saved.sourceSha);
      assert.equal(
        (standard.plan as any).sharedSource.sourceHash,
        (saved.plan as any).sourceHash,
      );
      assert.equal(
        sourceFetches,
        1,
        "Both scanners must reuse the same prepared snapshot",
      );
      assert.equal(await db.commitAssessment.count(), 0);
      assert.equal(await db.nativeExecutionRequest.count(), 0);
      break;
    }
    if (Date.now() >= deadline) {
      const standard = await db.repositoryHealthAssessment.findUniqueOrThrow({
        where: { id: groupId },
      });
      console.log(JSON.stringify({
        event: "fixture_scan_timed_out",
        standardState: standard.state,
        standardReason: standard.reason,
        aiState: saved.state,
        aiReason: saved.reason,
        sourceFetches,
      }));
      throw new Error("Fixture acceptance timed out");
    }
    await delay(5500);
  }
} finally {
  if (service && actor && groupId && fixture) {
    await service.cancel(actor, repositoryId, groupId).catch(() => {});
    await fixture.prisma.repositoryHealthAssessment
      .update({ where: { id: groupId }, data: { leaseUntil: null } })
      .catch(() => {});
    await service.process(groupId).catch(() => {});
  }
  if (service && actor && assessmentId && fixture) {
    await service.cancel(actor, repositoryId, assessmentId).catch(() => {});
    await fixture.prisma.repositoryHealthAssessment
      .update({ where: { id: assessmentId }, data: { leaseUntil: null } })
      .catch(() => {});
    await service.process(assessmentId).catch(() => {});
  }
  runner?.kill("SIGTERM");
  if (runnerExited) {
    const stopped = await Promise.race([
      runnerExited.then(() => true),
      delay(15000).then(() => false),
    ]);
    if (!stopped) {
      runner?.kill("SIGKILL");
      await runnerExited;
    }
  }
  await app?.close();
  await fixture?.close();
  await original.$disconnect();
  await rm(temp, { recursive: true, force: true });
}
