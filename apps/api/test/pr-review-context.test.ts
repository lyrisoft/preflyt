import { expect, it } from "vitest";
import {
  prReviewSource,
  sameReviewPr,
  publicPrSource,
} from "../src/intelligence/pr-review-context.js";
import {
  validateSkillOutput,
  reviewPrompt,
} from "../src/intelligence/review-skills.js";
const pr = {
  version: 1 as const,
  head: { repositoryId: "101", ref: "feature", sha: "a".repeat(40) },
  base: { repositoryId: "101", ref: "main", sha: "b".repeat(40) },
  state: "open" as const,
  draft: false,
  merged: false,
};
const files = [
  {
    filename: "src/api.ts",
    patch: "@@ -4,2 +4,3 @@\n old\n-oldValue\n+newValue\n+checkInput()",
  },
];
it("pins both commits and maps only actual added/deleted changed lines", () => {
  const source = prReviewSource(1, pr, files);
  expect(source.lines.map((l) => [l.line, l.side])).toEqual([
    [5, "LEFT"],
    [5, "RIGHT"],
    [6, "RIGHT"],
  ]);
  expect(
    sameReviewPr(pr, { ...pr, head: { ...pr.head, sha: "c".repeat(40) } }),
  ).toBe(false);
  expect(sameReviewPr(pr, { ...pr, draft: true })).toBe(false);
  expect(JSON.stringify(publicPrSource(source))).not.toContain("checkInput");
  const context = {
    assessmentHash: "d".repeat(64),
    sourceSha: pr.head.sha,
    evidence: [],
    source,
  };
  const raw = JSON.stringify({
    assessmentHash: context.assessmentHash,
    sourceSha: context.sourceSha,
    findings: [
      {
        checkId: "review",
        evidenceRefs: ["diff:2"],
        summary: "Input validation may be missing.",
        recommendation: "Validate the input before use.",
      },
    ],
  });
  expect(
    validateSkillOutput(raw, context, ["review"])[0]?.evidenceRefs,
  ).toEqual(["diff:2"]);
  expect(() =>
    validateSkillOutput(raw.replace("diff:2", "diff:99"), context, ["review"]),
  ).toThrow();
  expect(
    reviewPrompt(
      [{ id: "review", version: 1, instructions: "Review changed code" }],
      context,
    ).user,
  ).toContain("checkInput()");
});
it("omits secret-bearing files, binary patches and truncated hunks, never claiming full coverage", () => {
  const source = prReviewSource(1, pr, [
    ...files,
    { filename: ".env", patch: "@@ -0,0 +1 @@\n+API_KEY=secretpassword" },
    { filename: "binary.png" },
    {
      filename: "src/secret.ts",
      patch: '@@ -0,0 +1 @@\n+api_key="fixture-secret-key"',
    },
    { filename: "src/truncated.ts", patch: "@@ -0,0 +1,2 @@\n+one" },
  ]);
  expect(source.omittedFiles).toBe(4);
  expect(JSON.stringify(source)).not.toContain("fixture-secret");
});
it("bounds diff size, fails closed on unsafe paths and malformed hunks", () => {
  expect(() =>
    prReviewSource(1, pr, [{ ...files[0], filename: "../escape" }]),
  ).toThrow();
  expect(() =>
    prReviewSource(1, pr, [
      { filename: "x", patch: "@@ -0,0 +1 @@\n+one\n+two" },
    ]),
  ).toThrow();
  expect(() =>
    prReviewSource(
      1,
      pr,
      Array.from({ length: 201 }, (_, i) => ({
        ...files[0],
        filename: String(i),
      })),
    ),
  ).toThrow();
  const patch =
    "@@ -0,0 +1,400 @@\n" +
    Array.from({ length: 400 }, (_, i) => `+line${i}`).join("\n");
  const source = prReviewSource(1, pr, [{ filename: "large.ts", patch }]);
  expect(source.lines.length).toBeLessThanOrEqual(300);
  expect(source.omittedLines).toBeGreaterThan(0);
});

it("maps renamed deletion lines to the original file and additions to the current file", () => {
  const source = prReviewSource(1, pr, [
    {
      filename: "new.ts",
      previous_filename: "old.ts",
      patch: "@@ -1 +1 @@\n-before\n+after",
    },
  ]);
  expect(source.lines.map((l) => [l.path, l.side])).toEqual([
    ["old.ts", "LEFT"],
    ["new.ts", "RIGHT"],
  ]);
  expect(() =>
    prReviewSource(1, pr, [
      {
        filename: "new.ts",
        previous_filename: "../unsafe",
        patch: "@@ -1 +1 @@\n-before\n+after",
      },
    ]),
  ).toThrow();
});

it("excludes generated Preflyt integration files from the AI disclosure and comment scope", () => {
  const patch = "@@ -0,0 +1,400 @@\n" + Array.from({length: 400}, (_, i) => `+generatedLine${i}`).join("\n");
  const source = prReviewSource(1, pr, [
    {filename: ".github/actions/preflyt-policy/run.py", patch},
    {filename: ".github/workflows/preflyt-gate.yml", patch},
    {filename: ".preflyt/checks.json", patch},
    {filename: "catalogue.py", patch: "@@ -0,0 +1 @@\n+price = total + discount"},
  ]);
  expect(source.lines).toEqual([{ref: "diff:0", path: "catalogue.py", line: 1, side: "RIGHT", text: "price = total + discount"}]);
  expect(source.omittedFiles).toBe(3);
  expect(source.omittedLines).toBe(0);
  expect(JSON.stringify(source)).not.toContain("generatedLine");
});

it("keeps user workflows and custom Actions reviewable and excludes renamed Preflyt files", () => {
  const patch = "@@ -1 +1 @@\n-before\n+after";
  const source = prReviewSource(1, pr, [
    {filename: ".github/workflows/ci.yml", patch},
    {filename: ".github/actions/custom-build/action.yml", patch},
    {filename: "renamed.py", previous_filename: ".github/actions/preflyt-policy/run.py", patch},
    {filename: ".github/workflows/preflyt-gate.yaml", previous_filename: "gate.yaml", patch},
  ]);
  expect(source.omittedFiles).toBe(2);
  expect(new Set(source.lines.map(line => line.path))).toEqual(new Set([".github/workflows/ci.yml", ".github/actions/custom-build/action.yml"]));
  expect(() => prReviewSource(1, pr, [{filename: ".github/actions/preflyt-policy/run.py", previous_filename: "../unsafe", patch}])).toThrow("Invalid previous file identity");
  expect(() => prReviewSource(1, pr, [{filename: ".github/actions/preflyt-policy/run.py", patch}])).toThrow("No safe changed lines");
});
