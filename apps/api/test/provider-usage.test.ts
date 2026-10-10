import { it, expect } from "vitest";
import { providerUsage } from "../src/intelligence/skill-inference.js";
const rates = {
  inputPriceCentsPerMillion: 100,
  outputPriceCentsPerMillion: 200,
};
it.each([
  ["openai", { usage: { prompt_tokens: 10, completion_tokens: 5 } }],
  ["anthropic", { usage: { input_tokens: 10, output_tokens: 5 } }],
  [
    "gemini",
    { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } },
  ],
])(
  "normalizes %s usage and estimates cost from administrator rates",
  (preset, data) => {
    expect(providerUsage(preset, data, rates)).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      costMicroCents: "2000",
      costStatus: "ESTIMATED_FROM_REPORTED_USAGE",
    });
  },
);
it("never fabricates usage, negative tokens or cache-specific prices", () => {
  expect(providerUsage(undefined, {}, rates)).toMatchObject({
    inputTokens: null,
    outputTokens: null,
    costMicroCents: null,
  });
  expect(
    providerUsage(
      "openai",
      { usage: { prompt_tokens: -1, completion_tokens: 5 } },
      rates,
    ).costMicroCents,
  ).toBeNull();
  expect(
    providerUsage(
      "anthropic",
      {
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 8,
        },
      },
      rates,
    ).costMicroCents,
  ).toBeNull();
});

it("includes Gemini reasoning tokens and rejects invalid reported reasoning usage", () => {
  expect(
    providerUsage(
      "gemini",
      {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          thoughtsTokenCount: 7,
        },
      },
      rates,
    ),
  ).toMatchObject({ outputTokens: 12, costMicroCents: "3400" });
  expect(
    providerUsage(
      "gemini",
      {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          thoughtsTokenCount: -1,
        },
      },
      rates,
    ).costMicroCents,
  ).toBeNull();
});
