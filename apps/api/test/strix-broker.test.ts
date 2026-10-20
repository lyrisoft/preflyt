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
  vi.mocked(aiHttpRequest).mockReset().mockImplementation(async()=>new Response(JSON.stringify({choices:[{message:{content:'ok'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:2}}),{status:200}));
  db = {
    auditEvent: {create:vi.fn(async()=>({}))},
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
it('uses native OpenAI Responses with reasoning and accounts for its actual usage',async()=>{
  const selected={...endpoint,preset:'openai',locality:'hosted' as const,baseUrl:'https://api.openai.com/v1',requiresKey:true};
  db.aiProviderConnection.findFirst.mockResolvedValue({...provider,endpoint:selected,encryptedCredential:'encrypted-fixture',credentialEndpointDigest:aiCredentialEndpointDigest(selected),testedEndpointDigest:endpointDigest(selected)});
  const run=await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...run,endpointDigest:endpointDigest(selected)});
  const reply={object:'response',status:'completed',output:[{type:'function_call',name:'inspect',arguments:'{}'}],usage:{input_tokens:100,output_tokens:27,input_tokens_details:{cached_tokens:50},output_tokens_details:{reasoning_tokens:20}}};
  vi.mocked(aiHttpRequest).mockResolvedValueOnce(new Response(JSON.stringify(reply),{status:200}));
  const result=await service.model(id,'Bearer '+token,'/v1/responses',{model:'fixture-model',input:'Call inspect.',tools:[{type:'function',name:'inspect',parameters:{type:'object',properties:{}}}],reasoning:{effort:'high'},max_output_tokens:1024,store:true,background:true});
  expect(result).toEqual(reply);
  const call=vi.mocked(aiHttpRequest).mock.calls.at(-1)!;
  expect(String(call[0])).toBe('https://api.openai.com/v1/responses');
  expect(JSON.parse(call[2].body!)).toMatchObject({reasoning:{effort:'high'},max_output_tokens:1024,store:false,background:false,include:['reasoning.encrypted_content']});
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outputTokens:{increment:1024}})}));
  expect(db.repositoryHealthStrixRun.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outputTokens:{increment:-997}})}));
  expect(db.aiModelUsage.update).toHaveBeenCalledWith(expect.objectContaining({data:{inputTokens:100,outputTokens:27,cachedTokens:50}}));
});
it.each([{tools:[{type:'web_search_preview'}]},{previous_response_id:'resp_other_scan'},{conversation:'conv_other_scan'},{prompt:{id:'pmpt_other_scan'}},{input:[{type:'item_reference',id:'msg_other_scan'}]},{input:[{role:'user',content:[{type:'input_file',file_id:'file_other_scan'}]}]},{input:[{role:'user',content:[{type:'input_image',image_url:'https://example.invalid/private'}]}]},{model:'other'}])('rejects cross-assessment state and hosted tools before OpenAI inference: %j',async(patch)=>{
  const selected={...endpoint,preset:'openai',locality:'hosted' as const,baseUrl:'https://api.openai.com/v1',requiresKey:true};
  db.aiProviderConnection.findFirst.mockResolvedValue({...provider,endpoint:selected,encryptedCredential:'encrypted-fixture',credentialEndpointDigest:aiCredentialEndpointDigest(selected),testedEndpointDigest:endpointDigest(selected)});
  const run=await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...run,endpointDigest:endpointDigest(selected)});
  await expect(service.model(id,'Bearer '+token,'/responses',{model:'fixture-model',input:'Inspect fixture',...patch})).rejects.toThrow('Unsupported model operation');
  expect(aiHttpRequest).not.toHaveBeenCalled();
  expect(db.repositoryHealthStrixRun.updateMany).not.toHaveBeenCalled();
});
it('reserves the bounded output actually requested instead of charging every request 8192 tokens',async()=>{
  await service.model(id,'Bearer '+token,'/chat/completions',{model:'fixture-model',max_tokens:128});
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({outputTokens:{lte:131072-128}}),data:expect.objectContaining({outputTokens:{increment:128}})}));
  expect(db.repositoryHealthStrixRun.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outputTokens:{increment:-126}})}));
});
it.each(['openai','anthropic','gemini','deepseek','local'].flatMap(preset=>[[400,'STRIX_MODEL_REQUEST_REJECTED'],[401,'STRIX_MODEL_ACCESS_DENIED'],[403,'STRIX_MODEL_ACCESS_DENIED'],[429,'STRIX_MODEL_RATE_LIMITED'],[500,'STRIX_MODEL_UNAVAILABLE'],[408,'STRIX_MODEL_UNAVAILABLE']].map(([status,code])=>({preset,status:status as number,code:code as string}))))('stops $preset HTTP $status with the real failure and releases only explicit rejected-request reservations',async({preset,status,code})=>{
  let operation='/chat/completions';
  if(preset!=='local'){
    const selected={...endpoint,preset,baseUrl:aiProviderPresets.find(p=>p.id===preset)!.baseUrl,locality:'hosted' as const,requiresKey:true};
    db.aiProviderConnection.findFirst.mockResolvedValue({...provider,endpoint:selected,encryptedCredential:'encrypted-fixture',credentialEndpointDigest:aiCredentialEndpointDigest(selected),testedEndpointDigest:endpointDigest(selected)});
    const run=await db.repositoryHealthStrixRun.findUniqueOrThrow();
    db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...run,endpointDigest:endpointDigest(selected)});
    operation=preset==='openai'?'/responses':preset==='anthropic'?'/messages':preset==='gemini'?'/models/fixture-model:generateContent':operation;
  }
  vi.mocked(aiHttpRequest).mockResolvedValueOnce(new Response(JSON.stringify({error:{message:'PRIVATE_PROVIDER_DETAIL'}}),{status}));
  await expect(service.model(id,'Bearer '+token,operation,{model:'fixture-model'})).rejects.toMatchObject({status:400,response:expect.objectContaining({code})});
  const data=db.repositoryHealthStrixRun.updateMany.mock.calls.find((call:any[])=>call[0].data.failureCode)?.[0].data;
  expect(data).toMatchObject({failureCode:code});
  if(status<500&&status!==408)expect(data).toMatchObject({inputTokens:{decrement:expect.any(Number)},outputTokens:{decrement:8192}});
  else expect(data).not.toHaveProperty('outputTokens');
  expect(db.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({metadata:expect.objectContaining({status,failureCode:code})})}));
  expect(JSON.stringify(db.auditEvent.create.mock.calls)).not.toContain('PRIVATE_PROVIDER_DETAIL');
  expect(db.aiModelUsage.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({state:'FAILED'})}));
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:{inFlight:{decrement:1}}}));
  const run=await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...run,failureCode:code});
  await expect(service.model(id,'Bearer '+token,operation,{model:'fixture-model'})).rejects.toMatchObject({status:403});
  expect(aiHttpRequest).toHaveBeenCalledTimes(1);
});
it.each(['anthropic','gemini','deepseek'])('respects smaller output requests and settles native %s token usage',async(preset)=>{
  const selected={...endpoint,preset,baseUrl:aiProviderPresets.find(p=>p.id===preset)!.baseUrl,locality:'hosted' as const,requiresKey:true};
  db.aiProviderConnection.findFirst.mockResolvedValue({...provider,endpoint:selected,encryptedCredential:'encrypted-fixture',credentialEndpointDigest:aiCredentialEndpointDigest(selected),testedEndpointDigest:endpointDigest(selected)});
  const run=await db.repositoryHealthStrixRun.findUniqueOrThrow();
  db.repositoryHealthStrixRun.findUniqueOrThrow.mockResolvedValue({...run,endpointDigest:endpointDigest(selected)});
  const usage=preset==='anthropic'?{usage:{input_tokens:10,output_tokens:2}}:preset==='gemini'?{usageMetadata:{promptTokenCount:10,candidatesTokenCount:1,thoughtsTokenCount:1}}:{usage:{prompt_tokens:10,completion_tokens:2}};
  vi.mocked(aiHttpRequest).mockResolvedValueOnce(new Response(JSON.stringify(usage),{status:200}));
  const operation=preset==='anthropic'?'/messages':preset==='gemini'?'/models/fixture-model:generateContent':'/chat/completions';
  await service.model(id,'Bearer '+token,operation,{model:'fixture-model',...(preset==='gemini'?{generationConfig:{maxOutputTokens:128}}:{max_tokens:128})});
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outputTokens:{increment:128}})}));
  expect(db.repositoryHealthStrixRun.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({outputTokens:{increment:-126}})}));
  expect(db.aiModelUsage.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({inputTokens:10,outputTokens:2})}));
});
it('keeps unknown transport usage bounded and never calls it an output limit',async()=>{
  vi.mocked(aiHttpRequest).mockRejectedValueOnce(new Error('PRIVATE_TRANSPORT_DETAIL'));
  await expect(service.model(id,'Bearer '+token,'/chat/completions',{model:'fixture-model'})).rejects.toMatchObject({response:expect.objectContaining({code:'STRIX_MODEL_UNAVAILABLE'})});
  expect(db.repositoryHealthStrixRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{failureCode:'STRIX_MODEL_UNAVAILABLE'}}));
  expect(JSON.stringify(db.auditEvent.create.mock.calls)).not.toContain('PRIVATE_TRANSPORT_DETAIL');
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
