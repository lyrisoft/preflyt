import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  aiProviderPresets,
  aiCredentialEndpointDigest,
  encryptAiCredential,
} from "../src/intelligence/ai-configuration.js";
import {
  AiResponseError,
  runPromptInference,
  runSkillInference,
} from "../src/intelligence/skill-inference.js";
const transport = vi.hoisted(() => vi.fn());
vi.mock("../src/intelligence/ai-http.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/intelligence/ai-http.js")>()),
  aiHttpRequest: transport,
}));
const context = {
  assessmentHash: "a".repeat(64),
  sourceSha: "b".repeat(40),
  evidence: [
    {
      ref: "check:0",
      ruleId: "build",
      required: true,
      coverage: "UNKNOWN",
      freshness: "UNKNOWN",
      result: "UNKNOWN",
    },
  ],
};
const skills = [
  { id: "skill", version: 1, instructions: "Explain missing evidence." },
];
const output = JSON.stringify({
  assessmentHash: context.assessmentHash,
  sourceSha: context.sourceSha,
  findings: [
    {
      checkId: "skill",
      evidenceRefs: ["check:0"],
      summary: "Build evidence is missing.",
      recommendation: "Collect a verified build result.",
      severity: "low",
      impact: "The team cannot inspect the build outcome from this assessment.",
    },
  ],
});
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  transport.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it.each(aiProviderPresets)(
  "uses bounded native inference for $id without credentials in context",
  async (preset) => {
    const endpoint = {
      id: "provider",
      name: preset.name,
      baseUrl: preset.baseUrl,
      locality: "hosted" as const,
      requiresKey: true,
      models: [preset.exampleModel],
      preset: preset.id,
    };
    const provider = {
      id: "provider",
      organizationId: "org",
      endpoint,
      modelId: preset.exampleModel,
      encryptedCredential: encryptAiCredential(
        "org",
        "provider",
        "fixture-key",
        aiCredentialEndpointDigest(endpoint),
      ),
    } as any;
    const response =
      preset.id === "anthropic"
        ? { stop_reason: "end_turn", content: [{ type: "text", text: output }] }
        : preset.id === "gemini"
          ? {
              candidates: [
                {
                  finishReason: "STOP",
                  content: { parts: [{ text: output }] },
                },
              ],
            }
          : {
              choices: [
                { finish_reason: "stop", message: { content: output } },
              ],
            };
    transport.mockResolvedValue(new Response(JSON.stringify(response)));
    const findings = await runSkillInference(
      provider,
      skills,
      context,
      1000,
      AbortSignal.timeout(1000),
    );
    expect(findings[0]?.classification).toBe("INFERRED");
    const [url, locality, options] = transport.mock.lastCall!;
    expect(url.search).toBe("");
    expect(locality).toBe("hosted");
    expect(options.body).not.toContain("fixture-key");
    expect(JSON.parse(options.body)).not.toHaveProperty("tools");
    const body = JSON.parse(options.body);
    if (preset.id === "deepseek") {
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.response_format).toEqual({ type: "json_object" });
    } else expect(body).not.toHaveProperty("thinking");
    if (preset.id === "openai") {
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema).toMatchObject({ strict: true, schema: {
        properties: { findings: { items: { properties: {
          severity: { enum: ["critical", "high", "medium", "low"] }, impact: { type: "string" },
          checkId: { enum: ["skill"] }, evidenceRefs: { items: { enum: ["check:0"] } },
        } } } },
      } });
    } else if (preset.id === "deepseek") expect(body.response_format).toEqual({ type: "json_object" });
    expect(
      preset.id === "gemini"
        ? body.generationConfig.maxOutputTokens
        : preset.id === "openai"
          ? body.max_completion_tokens
          : body.max_tokens,
    ).toBe(1000);
    expect(
      options.headers[
        preset.id === "gemini"
          ? "x-goog-api-key"
          : preset.id === "anthropic"
            ? "x-api-key"
            : "authorization"
      ],
    ).toContain("fixture-key");
  },
);
it("rejects tool calls, truncated responses, unknown evidence and provider errors", async () => {
  const provider = {
    id: "provider",
    organizationId: "org",
    endpoint: {
      id: "provider",
      name: "Local",
      baseUrl: "http://127.0.0.1:1",
      locality: "local",
      requiresKey: false,
      models: ["model"],
    },
    modelId: "model",
    encryptedCredential: null,
  } as any;
  for (const response of [
    new Response("", { status: 503 }),
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: output } }],
      }),
    ),
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { tool_calls: [{}], content: output },
          },
        ],
      }),
    ),
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: output.replace("check:0", "invented") },
          },
        ],
      }),
    ),
  ]) {
    transport.mockResolvedValueOnce(response);
    await expect(
      runSkillInference(
        provider,
        skills,
        context,
        1000,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
  }
});

it("uses the same /v1 base for keyless Ollama reviews as connection testing", async () => {
  const provider = {
    id: "provider",
    organizationId: "org",
    modelId: "llama3.2:3b",
    encryptedCredential: null,
    endpoint: {
      id: "provider",
      name: "Ollama",
      baseUrl: "http://localhost:11434",
      locality: "local",
      requiresKey: false,
      models: ["llama3.2:3b"],
    },
  } as any;
  transport.mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: output } }],
      }),
    ),
  );
  await runSkillInference(
    provider,
    skills,
    context,
    400,
    AbortSignal.timeout(1000),
  );
  const [url, locality, options] = transport.mock.calls[0]!;
  expect(url.href).toBe("http://localhost:11434/v1/chat/completions");
  expect(locality).toBe("local");
  expect(options.headers.authorization).toBeUndefined();
  expect(JSON.parse(options.body)).toMatchObject({
    model: "llama3.2:3b",
    max_tokens: 400,
    stream: false,
  });
});

it("classifies only failed transport and upstream availability as outage signals, with redacted errors", async () => {
  const { AiTransportError } = await import("../src/intelligence/ai-http.js");
  const provider = {
    id: "provider",
    organizationId: "org",
    modelId: "model",
    encryptedCredential: null,
    endpoint: {
      id: "provider",
      name: "Local",
      baseUrl: "http://localhost:11434/v1",
      locality: "local",
      requiresKey: false,
      models: ["model"],
    },
  } as any;
  for (const status of [429, 502, 503]) {
    transport.mockResolvedValueOnce(
      new Response("private-provider-text", { status }),
    );
    const error = await runSkillInference(
      provider,
      skills,
      context,
      1000,
      new AbortController().signal,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiTransportError);
    expect(error.message).not.toContain("private-provider-text");
  }
  for (const response of [
    new Response("private-key", { status: 401 }),
    new Response("invalid JSON"),
    new Response(JSON.stringify({ choices: [{ finish_reason: "length" }] })),
  ]) {
    transport.mockResolvedValueOnce(response);
    const error = await runSkillInference(
      provider,
      skills,
      context,
      1000,
      new AbortController().signal,
    ).catch((e) => e);
    expect(error).not.toBeInstanceOf(AiTransportError);
  }
  transport.mockRejectedValueOnce(
    new Error("Model endpoint address is not allowed"),
  );
  await expect(
    runSkillInference(
      provider,
      skills,
      context,
      1000,
      new AbortController().signal,
    ),
  ).rejects.not.toBeInstanceOf(AiTransportError);
});
it("distinguishes an inference timeout from caller cancellation", async () => {
  const { AiTransportError } = await import("../src/intelligence/ai-http.js");
  const provider = {
    id: "provider",
    organizationId: "org",
    modelId: "model",
    encryptedCredential: null,
    endpoint: {
      id: "provider",
      name: "Local",
      baseUrl: "http://localhost:11434/v1",
      locality: "local",
      requiresKey: false,
      models: ["model"],
    },
  } as any;
  const controller = new AbortController();
  transport.mockImplementationOnce(async () => {
    controller.abort(new DOMException("deadline", "TimeoutError"));
    throw new Error("AbortError");
  });
  await expect(
    runSkillInference(provider, skills, context, 1000, controller.signal),
  ).rejects.toMatchObject({ code: "TIMEOUT", name: "AiTransportError" });
  const cancelled = new AbortController();
  transport.mockImplementationOnce(async () => {
    cancelled.abort();
    throw new Error("AbortError");
  });
  await expect(
    runSkillInference(provider, skills, context, 1000, cancelled.signal),
  ).rejects.not.toBeInstanceOf(AiTransportError);
});

it.each(["openai", "deepseek"])(
  "requests JSON for workflow rewriting with %s",
  async (presetId) => {
    const preset = aiProviderPresets.find((p) => p.id === presetId)!;
    const provider = {
      id: "provider",
      organizationId: "org",
      modelId: preset.exampleModel,
      encryptedCredential: null,
      endpoint: {
        id: "provider",
        name: preset.name,
        baseUrl: preset.baseUrl,
        locality: "hosted",
        requiresKey: true,
        models: [preset.exampleModel],
        preset: preset.id,
      },
    } as any;
    transport.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"workflow":"yaml","summary":"Added"}' },
            },
          ],
        }),
      ),
    );
    await runPromptInference(
      provider,
      { system: "Return JSON", user: "{}" },
      32768,
      new AbortController().signal,
      (raw) => JSON.parse(raw),
      undefined,
      { jsonOutput: true },
    );
    expect(JSON.parse(transport.mock.lastCall![2].body)).toMatchObject({
      response_format: { type: "json_object" },
      [presetId === "openai" ? "max_completion_tokens" : "max_tokens"]: 32768,
    });
  },
);

it.each(["openai", "anthropic", "gemini"])(
  "identifies truncated %s output before validating partial workflow YAML",
  async (presetId) => {
    const preset = aiProviderPresets.find((p) => p.id === presetId)!;
    const provider = {
      id: "provider",
      organizationId: "org",
      modelId: preset.exampleModel,
      encryptedCredential: null,
      endpoint: {
        id: "provider",
        name: preset.name,
        baseUrl: preset.baseUrl,
        locality: "hosted",
        requiresKey: true,
        models: [preset.exampleModel],
        preset: preset.id,
      },
    } as any;
    const response =
      presetId === "anthropic"
        ? {
            stop_reason: "max_tokens",
            content: [{ type: "text", text: '{"workflow":' }],
          }
        : presetId === "gemini"
          ? {
              candidates: [
                {
                  finishReason: "MAX_TOKENS",
                  content: { parts: [{ text: '{"workflow":' }] },
                },
              ],
            }
          : {
              choices: [
                {
                  finish_reason: "length",
                  message: { content: '{"workflow":' },
                },
              ],
            };
    transport.mockResolvedValue(new Response(JSON.stringify(response)));
    const validate = vi.fn();
    const error = await runPromptInference(
      provider,
      { system: "Return JSON", user: "{}" },
      8192,
      new AbortController().signal,
      validate,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiResponseError);
    expect(error.code).toBe("TRUNCATED");
    expect(validate).not.toHaveBeenCalled();
  },
);

it.each([
  ['OUTPUT_TOO_LARGE', 'x'.repeat(20001)],
  ['CREDENTIAL_ECHO', 'fixture-key'],
  ['PEM_OUTPUT', '-----BEGIN PRIVATE KEY-----'],
  ['BEARER_OUTPUT', 'Bearer fixture-secret'],
  ['API_KEY_OUTPUT', 'sk-fixture-secret-value'],
  ['SECRET_ASSIGNMENT_OUTPUT', 'password=fixture-secret'],
])('returns only the safe %s rejection category without retaining response content', async (code, content) => {
  const endpoint = { id: 'provider', name: 'Fixture', baseUrl: 'https://gateway.example.invalid/v1', locality: 'hosted' as const,
    requiresKey: true, models: ['fixture'] }
  const provider = { id: 'provider', organizationId: 'org', endpoint, modelId: 'fixture',
    encryptedCredential: encryptAiCredential('org', 'provider', 'fixture-key', aiCredentialEndpointDigest(endpoint)) } as any
  transport.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] })))
  try {
    await runSkillInference(provider, skills, context, 1000, AbortSignal.timeout(1000))
    throw new Error('Expected rejection')
  } catch (e) {
    expect(e).toBeInstanceOf(AiResponseError)
    expect((e as AiResponseError).code).toBe(code)
    expect((e as Error).message).toBe('Model response unavailable')
    expect(JSON.stringify(e)).not.toContain(content)
  }
})

it('sends three maximum-length Unicode skills completely within the bounded review request', async () => {
  const endpoint = { id: 'provider', name: 'Fixture', baseUrl: 'https://gateway.example.invalid/v1', locality: 'hosted' as const, requiresKey: true, models: ['fixture'] };
  const provider = { id: 'provider', organizationId: 'org', endpoint, modelId: 'fixture', encryptedCredential: encryptAiCredential('org', 'provider', 'fixture-key', aiCredentialEndpointDigest(endpoint)) } as any;
  transport.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: output } }] })));
  const instructions = '界'.repeat(23990) + 'LAST CHECK';
  await runSkillInference(provider, ['skill', 'skill2', 'skill3'].map(id => ({ id, version: 1, instructions })), context, 1000, AbortSignal.timeout(1000));
  const options = transport.mock.lastCall![2];
  expect(options.maxBodyBytes).toBe(384 * 1024);
  expect(Buffer.byteLength(options.body)).toBeGreaterThan(65536);
  expect(Buffer.byteLength(options.body)).toBeLessThan(options.maxBodyBytes);
  const prompt = JSON.parse(JSON.parse(options.body).messages[1].content);
  expect(prompt.SKILLS).toHaveLength(3);
  for (const skill of prompt.SKILLS) expect(skill.instructions).toBe(instructions);
});
