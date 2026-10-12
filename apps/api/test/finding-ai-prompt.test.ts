import { describe, expect, it } from "vitest";
import { AiResponseError } from "../src/intelligence/skill-inference.js";
import { digest } from "../src/assessments/assessment-digest.js";
import {
  boundedFindingContext,
  findingAiPrompt,
  validateFindingAiResult,
} from "../src/findings/finding-ai-prompt.js";

const sha = "a".repeat(40);
const context = boundedFindingContext(
  {
    title:
      "Use parameterized SQL instead of interpolating user input into a query.",
    ruleId: "sql-string-interpolation",
    category: "security",
    path: "src/catalogue.py",
    line: 11,
    endLine: 11,
    verification: "Verified analyzer receipt",
  },
  sha,
  [
    { number: 10, text: "def find_product(connection, name):" },
    {
      number: 11,
      text: '  return connection.execute(f"SELECT * FROM products WHERE name = {name}")',
    },
  ],
);
const result = () => ({
  version: 1,
  sourceSha: sha,
  contextHash: digest(context),
  problem: "The query inserts name directly into SQL text.",
  impact:
    "If name contains SQL operators, it could change which records the query returns.",
  solution: "Use a parameter placeholder and pass name separately to execute.",
  evidenceLines: [11],
});

describe("finding AI guidance contract", () => {
  it("uses only assessed code as untrusted input and requires distinct issue, effect and fix", () => {
    const prompt = findingAiPrompt(context);
    expect(prompt.system).toContain("untrusted data");
    expect(JSON.parse(prompt.user).sourceSha).toBe(sha);
    expect(validateFindingAiResult(JSON.stringify(result()), context)).toEqual(
      result(),
    );
  });

  it.each([
    { problem: result().solution },
    { problem: "The query should use parameterized SQL instead." },
    { problem: "The excerpt shows a test failure. ".repeat(8) },
    { solution: "Add the missing implementation to the assessed excerpt." },
    { impact: result().solution },
    { evidenceLines: [12] },
    { sourceSha: "b".repeat(40) },
    { contextHash: "wrong" },
    { problem: "<script>alert(1)</script>" },
    { solution: "Bearer abcdefghijklmnop" },
  ])("rejects unsupported or unsafe guidance (%j)", (change) => {
    expect(() =>
      validateFindingAiResult(
        JSON.stringify({ ...result(), ...change }),
        context,
      ),
    ).toThrow(AiResponseError);
  });

  it("keeps the reported line while bounding large source context", () => {
    const large = boundedFindingContext(context.finding, sha, [
      { number: 10, text: "a".repeat(20_000) },
      { number: 11, text: "reported code" },
      { number: 12, text: "z".repeat(20_000) },
    ]);
    expect(large.lines).toContainEqual({ number: 11, text: "reported code" });
    expect(large.truncated).toBe(true);
  });
});
