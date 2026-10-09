import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  aiProviderPresets,
  aiCredentialEndpointDigest,
  encryptAiCredential,
} from "../src/intelligence/ai-configuration.js";
import { runSkillInference } from "../src/intelligence/skill-inference.js";
const transport = vi.hoisted(() => vi.fn());
vi.mock("../src/intelligence/ai-http.js", () => ({ aiHttpRequest: transport }));
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
      skillId: "skill",
      evidenceRefs: ["check:0"],
      summary: "Build evidence is missing.",
      recommendation: "Collect a verified build result.",
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
