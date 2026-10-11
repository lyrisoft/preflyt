import { expect, it } from "vitest";
import {
  actionableFindings,
  conciseReviewSummary,
  inlineIssues,
  sameInlineIssue,
} from "../src/intelligence/pr-review-feedback.js";
import { prReviewSource } from "../src/intelligence/pr-review-context.js";
const context = {
  version: 1 as const,
  head: { repositoryId: "101", ref: "feature", sha: "a".repeat(40) },
  base: { repositoryId: "101", ref: "main", sha: "b".repeat(40) },
  state: "open" as const,
  draft: false,
  merged: false,
};
const source = prReviewSource(1, context, [
  {
    filename: "src/api.ts",
    patch: "@@ -0,0 +1,2 @@\n+execute(input)\n+delete(input)",
  },
]);
const issue = {
  summary: "User input is interpolated into SQL and permits injection.",
  recommendation: "Replace interpolation with parameterized SQL queries.",
  evidenceRefs: ["diff:0"],
};
it("excludes praise, optional work, speculative checks and retains a concrete issue", () => {
  expect(
    actionableFindings([
      issue,
      ...[
        "No change required; keep the existing binding.",
        "Optionally add an extra test.",
        "Consider broadening the scanner for future query variants.",
        "Advisory: if forks need coverage, add another workflow.",
        "Advisory: verify that the workflow runs tests.",
        "Advisory: confirm the pinned action SHA corresponds to a reviewed release.",
        "Confirm whether omitted code handles errors.",
      ].map((recommendation) => ({ ...issue, recommendation })),
      {
        ...issue,
        summary: "Hypothesis only; omitted lines may validate input.",
      },
    ]),
  ).toEqual([issue]);
});
it("keeps the summary short without repeating findings", () => {
  const summary = conciseReviewSummary(7, context.head.sha, 12);
  expect(summary.length).toBeLessThan(200);
  expect(summary).toContain("12 actionable issues");
  expect(summary).not.toContain(issue.summary);
  expect(conciseReviewSummary(7, context.head.sha, 0)).toContain(
    "No actionable issues found",
  );
});
it("recognizes minor rewording but preserves distinct issues and locations", () => {
  const first = inlineIssues(source, [issue])[0]!;
  const reworded = inlineIssues(source, [
    {
      ...issue,
      summary:
        "User input permits injection because it is interpolated into SQL.",
    },
  ])[0]!;
  expect(sameInlineIssue(reworded, first)).toBe(true);
  const different = inlineIssues(source, [
    {
      summary: "Deleting data has no authorization check.",
      recommendation: "Require authorization before deleting records.",
      evidenceRefs: ["diff:0"],
    },
  ])[0]!;
  expect(sameInlineIssue(different, first)).toBe(false);
  const otherLocation = inlineIssues(source, [
    { ...issue, evidenceRefs: ["diff:1"] },
  ])[0]!;
  expect(sameInlineIssue(otherLocation, first)).toBe(false);
});
it("does not create inline comments for evidence-only findings", () => {
  expect(
    inlineIssues(source, [{ ...issue, evidenceRefs: ["check:0"] }]),
  ).toEqual([]);
});

it("discloses bounded review coverage in the concise PR summary", () => {
  const summary = conciseReviewSummary(7, context.head.sha, 0, {omittedFiles:254,omittedLines:1200});
  expect(summary).toContain('Partial review: 254 files and 1200 lines omitted.');
  expect(summary.length).toBeLessThan(280);
});
