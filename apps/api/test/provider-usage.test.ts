import { it, expect } from "vitest";
import { providerUsage } from "../src/intelligence/skill-inference.js";
it.each([
  ["openai", { usage: { prompt_tokens: 10, completion_tokens: 5 } }],
  ["anthropic", { usage: { input_tokens: 10, output_tokens: 5 } }],
  [
    "gemini",
    { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } },
  ],
])(
  "normalizes %s usage without price configuration or cost estimates",
  (preset, data) => {
    expect(providerUsage(preset, data)).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 0,
    });
  },
);
it("never fabricates usage or negative token counts and retains cache counters", () => {
  expect(providerUsage(undefined, {})).toEqual({
    inputTokens: null,
    outputTokens: null,
    cachedTokens: 0,
  });
  expect(
    providerUsage("openai", {
      usage: { prompt_tokens: -1, completion_tokens: 5 },
    }).inputTokens,
  ).toBeNull();
  expect(
    providerUsage("anthropic", {
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 8,
      },
    }),
  ).toEqual({ inputTokens: 18, outputTokens: 5, cachedTokens: 8 });
});
it("includes Anthropic cache writes in total input and DeepSeek cache hits in cached input", () => {
  expect(
    providerUsage("anthropic", {
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 80,
        cache_creation_input_tokens: 20,
        output_tokens: 5,
      },
    }),
  ).toEqual({ inputTokens: 110, outputTokens: 5, cachedTokens: 80 });
  expect(
    providerUsage("deepseek", {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 5,
        prompt_cache_hit_tokens: 80,
      },
    }),
  ).toEqual({ inputTokens: 100, outputTokens: 5, cachedTokens: 80 });
});

it("includes Gemini reasoning tokens and rejects invalid reported reasoning usage", () => {
  expect(
    providerUsage("gemini", {
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 7,
      },
    }),
  ).toMatchObject({ outputTokens: 12 });
  expect(
    providerUsage("gemini", {
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: -1,
      },
    }).outputTokens,
  ).toBeNull();
});
