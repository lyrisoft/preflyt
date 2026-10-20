/** Opt-in provider acceptance: two synthetic turns, no connected repository source. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { disposableDatabase } from "./disposable-database.js";
import { unpackConfiguration } from "../src/configuration/configuration-store.js";
import { applyConfiguration } from "../src/configuration/runtime-configuration.js";
import { effectiveAiRoute } from "../src/intelligence/effective-ai-route.js";
import { AiConfigurationService } from "../src/intelligence/ai-configuration.service.js";
import { providerEndpoint } from "../src/intelligence/ai-configuration.js";
import { HealthStrixService } from "../src/health/strix.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";

assert.equal(
  process.env.PREFLYT_STRIX_BROKER_ACCEPTANCE,
  "1",
  "Opt in to two small, normally billed model requests with PREFLYT_STRIX_BROKER_ACCEPTANCE=1.",
);
const original = new PrismaService();
let fixture: Awaited<ReturnType<typeof disposableDatabase>> | undefined;
try {
  applyConfiguration(
    unpackConfiguration(
      await original.deploymentConfiguration.findUniqueOrThrow({
        where: { id: "primary" },
      }),
    ),
    true,
  );
  const organizations = await original.aiStageRoute.findMany({
    where: { stage: { in: ["vapt", "default"] } },
    select: { organizationId: true },
  });
  let selection:
    Awaited<ReturnType<HealthStrixService["selection"]>> | undefined;
  for (const { organizationId } of organizations) {
    const route = await effectiveAiRoute(original, organizationId, "vapt");
    if (!route?.enabled || !route.allowSource || !route.primaryId) continue;
    const provider = await original.aiProviderConnection.findFirst({
      where: { id: route.primaryId, organizationId },
    });
    if (
      !provider ||
      !new AiConfigurationService(original, {} as any).ready(provider)
    )
      continue;
    const endpoint = providerEndpoint(provider)!;
    if (endpoint.preset === "openai") {
      selection = { route, provider, endpoint };
      break;
    }
  }
  assert(
    selection,
    "An enabled, tested OpenAI security review route is required.",
  );
  await original.$disconnect();
  process.env.NODE_ENV = "test";
  fixture = await disposableDatabase("strixbroker");
  await fixture.reset();
  const db = fixture.prisma;
  const actor = await db.identity.create({
    data: { issuer: "fixture", subject: randomUUID() },
  });
  await db.organization.create({
    data: {
      id: selection.route.organizationId,
      name: "Disposable broker acceptance",
    },
  });
  await db.organizationMembership.create({
    data: {
      identityId: actor.id,
      organizationId: selection.route.organizationId,
      role: "OWNER",
    },
  });
  await db.aiProviderConnection.create({
    data: {
      ...selection.provider,
      endpoint: selection.provider.endpoint as any,
      createdById: actor.id,
    },
  });
  await db.aiStageRoute.create({
    data: { ...selection.route, updatedById: actor.id },
  });
  await db.gitHubInstallation.create({
    data: {
      id: 999941n,
      connectedById: actor.id,
      organizationId: selection.route.organizationId,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
    },
  });
  const repo = await db.gitHubRepository.create({
    data: {
      githubId: 999942n,
      installationId: 999941n,
      name: "broker-fixture",
      fullName: "fixture/broker-fixture",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
      defaultBranch: "main",
    },
  });
  const row = await db.repositoryHealthAssessment.create({
    data: {
      repositoryId: repo.id,
      organizationId: selection.route.organizationId,
      actorId: actor.id,
      branch: "main",
      targetRevision: 1,
      requestKey: randomUUID(),
      sourceSha: "a".repeat(40),
      state: "RUNNING",
      startedAt: new Date(),
    },
  });
  const service = new HealthStrixService(
    db,
    new AuthorizationService(db),
    {} as any,
  );
  const token = randomBytes(32).toString("hex");
  await service.initialize(db, row, selection, token);
  const model = selection.provider.modelId.replace(/^models\//, "");
  const input = [
    {
      role: "user",
      content:
        "Call diagnostic_probe with ok true. After its result, reply READY.",
    },
  ];
  const tools = [
    {
      type: "function",
      name: "diagnostic_probe",
      description: "Report synthetic diagnostic success.",
      parameters: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];
  const first: any = await service.model(
    row.id,
    "Bearer " + token,
    "/v1/responses",
    { model, input, tools, tool_choice: "required", max_output_tokens: 1024 },
  );
  assert.equal(first.status, "completed");
  const call = first.output.find(
    (item: any) =>
      item.type === "function_call" && item.name === "diagnostic_probe",
  );
  assert(call, "The model must produce a real native tool call.");
  assert.deepEqual(JSON.parse(call.arguments), { ok: true });
  const second: any = await service.model(
    row.id,
    "Bearer " + token,
    "/v1/responses",
    {
      model,
      input: [
        ...input,
        ...first.output,
        {
          type: "function_call_output",
          call_id: call.call_id,
          output: '{"ok":true}',
        },
      ],
      tools,
      tool_choice: "none",
      max_output_tokens: 1024,
    },
  );
  assert.equal(second.status, "completed");
  assert(
    second.output.some(
      (item: any) =>
        item.type === "message" &&
        item.content.some(
          (part: any) =>
            part.type === "output_text" && part.text.includes("READY"),
        ),
    ),
  );
  const run = await db.repositoryHealthStrixRun.findUniqueOrThrow({
    where: { assessmentId: row.id },
  });
  const usage = await db.aiModelUsage.findMany({ where: { sourceId: row.id } });
  assert.equal(run.failureCode, null);
  assert.equal(run.inFlight, 0);
  assert.equal(run.modelCalls, 2);
  assert.equal(usage.length, 2);
  assert(
    usage.every(
      (item) => item.state === "COMPLETED" && item.outputTokens !== null,
    ),
  );
  assert.equal(
    run.outputTokens,
    usage.reduce((sum, item) => sum + item.outputTokens!, 0),
  );
  console.log(
    JSON.stringify({
      event: "strix_broker_acceptance_passed",
      model,
      protocol: "responses",
      toolCall: true,
      followUp: true,
      requests: run.modelCalls,
      outputTokens: run.outputTokens,
      remainingOutputTokens: run.maxOutputTokens - run.outputTokens,
      inFlight: run.inFlight,
      failureCode: run.failureCode,
      connectedSourceSent: false,
    }),
  );
} finally {
  await fixture?.close();
  await original.$disconnect();
}
