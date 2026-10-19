import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { HealthStrixService } from "../src/health/strix.service.js";
import { defaultVaptLimits } from "../src/intelligence/vapt-limits.js";
import {
  endpointDigest,
  aiCredentialEndpointDigest,
  aiProviderPresets,
} from "../src/intelligence/ai-configuration.js";
vi.mock("../src/intelligence/ai-configuration.js", async (original) => ({
  ...(await original<any>()),
  aiReviewsEnabled: () => true,
  decryptAiCredential: () => "fixture-native-key",
}));
vi.mock("../src/intelligence/ai-http.js", async (original) => ({
  ...(await original<any>()),
  aiHttpRequest: vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
        { status: 200 },
      ),
  ),
}));
import { aiHttpRequest } from "../src/intelligence/ai-http.js";
const id = "11111111-1111-4111-8111-111111111111",
  token = "a".repeat(64);
const endpoint = {
  id: "local-model",
  name: "Local",
  baseUrl: "http://127.0.0.1:1234/v1",
  locality: "local" as const,
  requiresKey: false,
  models: ["fixture-model"],
};
const provider = {
  id: "p",
  revision: 1,
  organizationId: "org",
  modelId: "fixture-model",
  enabled: true,
  endpoint,
  testStatus: "CONNECTED",
  testedRevision: 1,
  testedEndpointDigest: endpointDigest(endpoint),
  testedAt: new Date(),
  encryptedCredential: null,
};
const route = {
  id: "route",
  revision: 1,
  primaryId: "p",
  enabled: true,
  allowSource: true,
};
const row = {
  id,
  state: "RUNNING",
  actorId: "actor",
  organizationId: "org",
  repositoryId: "repo",
  startedAt: new Date(),
  cancelledAt: null,
};
let db: any, access: any, service: HealthStrixService;
beforeEach(() => {
  vi.clearAllMocks();
  db = {
    aiModelUsage: {
      create: vi.fn(async () => ({id:'usage-fixture'})),
      update: vi.fn(async () => ({})),
    },
    gitHubRepository: {
      findUniqueOrThrow: vi.fn(async () => ({ githubId: 51n })),
    },
    repositoryHealthAssessment: { findUniqueOrThrow: vi.fn(async () => row) },
    repositoryHealthStrixRun: {
      findUniqueOrThrow: vi.fn(async () => ({
        assessmentId: id,
        providerId: "p",
        providerRevision: 1,
        routeId: "route",
        routeRevision: 1,
        endpointDigest: endpointDigest(endpoint),
        tokenHash: createHash("sha256").update(token).digest("hex"),
        finishedAt: null,
        failureCode: null,
        ...defaultVaptLimits,
        modelCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        inFlight: 0,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(),
    },
    aiStageRoute: { findUnique: vi.fn(async () => route) },
    aiProviderConnection: { findFirst: vi.fn(async () => provider) },
  };
  access = { requireRepository: vi.fn(async () => ({})) };
  service = new HealthStrixService(db, access, {} as any);
});
it('gives local model inference a bounded ten minutes while retaining the hosted timeout', async () => {
  const timeout=vi.spyOn(AbortSignal,'timeout');
  try {
    await service.model(id,'Bearer '+token,'/v1/chat/completions',{model:'fixture-model',messages:[{role:'user',content:'fixture'}]});
    expect(timeout).toHaveBeenCalledWith(600000);
    timeout.mockClear();
    const remote={...endpoint,locality:'hosted' as const,baseUrl:'https://model.example.invalid/v1'};
    db.aiProviderConnection.findFirst.mockResolvedValue({...provider,endpoint:remote,testedEndpointDigest:endpointDigest(remote)});
    const original=await db.repositoryHealthStrixRun.findUniqueOrThrow();
    db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...original,endpointDigest:endpointDigest(remote)});
    await service.model(id,'Bearer '+token,'/v1/chat/completions',{model:'fixture-model',messages:[{role:'user',content:'fixture'}]});
    expect(timeout).toHaveBeenCalledWith(90000);
  } finally {timeout.mockRestore()}
});
it('uses direct generation for local Gemma without changing hosted inference', async () => {
  for (const locality of ['local', 'hosted'] as const) {
    const selected = {...endpoint, locality, models:['gemma4:12b-it-qat'], baseUrl: locality === 'local' ? endpoint.baseUrl : 'https://model.example.invalid/v1'};
    db.aiProviderConnection.findFirst.mockResolvedValue({...provider, modelId:'gemma4:12b-it-qat', endpoint:selected, testedEndpointDigest:endpointDigest(selected)});
    const run = await db.repositoryHealthStrixRun.findUniqueOrThrow();
    db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...run, endpointDigest:endpointDigest(selected)});
    await service.model(id, 'Bearer '+token, '/chat/completions', {model:'gemma4:12b-it-qat', reasoning_effort:'high'});
    const request=JSON.parse(vi.mocked(aiHttpRequest).mock.calls.at(-1)![2].body);
    expect(request.reasoning_effort).toBe(locality === 'local' ? 'none' : 'high');
  }
});
it("brokers the selected model without exposing provider credentials and records usage", async () => {
  const out: any = await service.model(
    id,
    "Bearer " + token,
    "/v1/chat/completions",
    {
      model: "fixture-model",
      messages: [{ role: "user", content: "fixture" }],
      stream: true,
    },
  );
  expect(out.choices).toHaveLength(1);
  expect(db.aiModelUsage.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({providerId:'p',modelId:'fixture-model',workload:'VAPT',sourceId:id,repositoryId:'repo'})}));
  expect(db.aiModelUsage.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({inputTokens:10,outputTokens:2})}));
  expect(db.aiStageRoute.findUnique).toHaveBeenCalledWith({
    where: { organizationId_stage: { organizationId: "org", stage: "vapt" } },
  });
  expect(aiHttpRequest).toHaveBeenCalledWith(
    expect.any(URL),
    "local",
    expect.objectContaining({
      body: expect.stringContaining('"stream":false'),
    }),
  );
  expect(db.repositoryHealthStrixRun.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        inputTokens: { increment: 0 },
        outputTokens: { increment: -8190 },
      },
    }),
  );
  expect(access.requireRepository).toHaveBeenCalledWith(
    expect.anything(),
    "51",
    "ai.review.run",
  );
});
it("rejects stale or cancelled access, wrong bearer, alternate models and unbounded input before inference", async () => {
  await expect(
    service.model(id, "Bearer " + "b".repeat(64), "/chat/completions", {
      model: "fixture-model",
    }),
  ).rejects.toThrow();
  await expect(
    service.model(id, "Bearer " + token, "/chat/completions", {
      model: "other",
    }),
  ).rejects.toThrow();
  await expect(
    service.model(id, "Bearer " + token, "/chat/completions", {
      model: "fixture-model",
      messages: ["x".repeat(900001)],
    }),
  ).rejects.toThrow();
  db.repositoryHealthAssessment.findUniqueOrThrow.mockResolvedValue({
    ...row,
    cancelledAt: new Date(),
  });
  await expect(
    service.model(id, "Bearer " + token, "/chat/completions", {
      model: "fixture-model",
    }),
  ).rejects.toThrow();
  expect(aiHttpRequest).not.toHaveBeenCalled();
});
it("stops inference when its per-review limits are exhausted", async () => {
  const run = await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({
    ...run,
    modelCalls: 80,
  });
  db.repositoryHealthStrixRun.updateMany.mockResolvedValue({ count: 0 });
  await expect(
    service.model(id, "Bearer " + token, "/chat/completions", {
      model: "fixture-model",
    }),
  ).rejects.toMatchObject({
    status: 400,
    response: expect.objectContaining({ code: "STRIX_REQUEST_LIMIT_REACHED" }),
  });
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: { failureCode: "STRIX_REQUEST_LIMIT_REACHED" },
    }),
  );
  expect(aiHttpRequest).not.toHaveBeenCalled();
});
it.each([
  [{ inputTokens: 99999, maxInputTokens: 100000 }, "STRIX_INPUT_LIMIT_REACHED"],
  [{ outputTokens: 1, maxOutputTokens: 8192 }, "STRIX_OUTPUT_LIMIT_REACHED"],
] as const)(
  "records a permanent failure when the configured allowance is exhausted",
  async (patch, code) => {
    const run = await db.repositoryHealthStrixRun.findUniqueOrThrow();
    db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({
      ...run,
      ...patch,
    });
    db.repositoryHealthStrixRun.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.model(id, "Bearer " + token, "/chat/completions", {
        model: "fixture-model",
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({ code }),
    });
    expect(aiHttpRequest).not.toHaveBeenCalled();
    expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { failureCode: code } }),
    );
  },
);
it("enforces the limits saved on the run rather than the former hard-coded values", async () => {
  const run = await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({
    ...run,
    maxInputTokens: 9000000,
    maxOutputTokens: 300000,
    maxModelCalls: 120,
  });
  await service.model(id, "Bearer " + token, "/chat/completions", {
    model: "fixture-model",
  });
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        modelCalls: { lt: 120 },
        inputTokens: {
          lte:
            9000000 -
            Math.ceil(
              JSON.stringify({
                model: "fixture-model",
                max_tokens: 8192,
                stream: false,
              }).length / 3,
            ),
        },
        outputTokens: { lte: 300000 - 8192 },
      }),
    }),
  );
});
it("does not permanently fail a run when only concurrent request slots are occupied", async () => {
  const run = await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({
    ...run,
    inFlight: 2,
  });
  db.repositoryHealthStrixRun.updateMany.mockResolvedValue({ count: 0 });
  await expect(
    service.model(id, "Bearer " + token, "/chat/completions", {
      model: "fixture-model",
    }),
  ).rejects.toMatchObject({ status: 503 });
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenCalledTimes(1);
  expect(aiHttpRequest).not.toHaveBeenCalled();
});

it.each(["anthropic", "gemini"] as const)(
  "forwards native %s tool-calling payloads only to its configured route",
  async (preset) => {
    const nativeEndpoint = {
      ...endpoint,
      preset,
      baseUrl: aiProviderPresets.find((p) => p.id === preset)!.baseUrl,
      locality: "hosted" as const,
      requiresKey: true,
    };
    db.aiProviderConnection.findFirst.mockResolvedValue({
      ...provider,
      encryptedCredential: "encrypted-fixture",
      credentialEndpointDigest: aiCredentialEndpointDigest(nativeEndpoint),
      testedEndpointDigest: endpointDigest(nativeEndpoint),
      endpoint: nativeEndpoint,
    });
    const original = await db.repositoryHealthStrixRun.findUniqueOrThrow();
    db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({
      ...original,
      endpointDigest: endpointDigest(nativeEndpoint),
    });
    const operation =
      preset === "anthropic"
        ? "/v1/messages"
        : "/v1/models/fixture-model:generateContent";
    const payload =
      preset === "anthropic"
        ? {
            model: "fixture-model",
            messages: [{ role: "user", content: "fixture" }],
            tools: [{ name: "inspect", input_schema: { type: "object" } }],
          }
        : {
            contents: [{ role: "user", parts: [{ text: "fixture" }] }],
            tools: [
              {
                functionDeclarations: [
                  { name: "inspect", parameters: { type: "object" } },
                ],
              },
            ],
          };
    await service.model(id, "Bearer " + token, operation, payload);
    const call = vi.mocked(aiHttpRequest).mock.calls[0];
    expect(JSON.parse(call[2]!.body!)).toMatchObject(payload);
    expect(String(call[0])).toContain(
      preset === "anthropic"
        ? "/messages"
        : "/models/fixture-model:generateContent",
    );
  },
);
