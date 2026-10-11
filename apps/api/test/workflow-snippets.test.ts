import { afterEach, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { policyAction } from "../src/assessments/pipeline-action.js";
import {
  checkExecution,
  publicPipelineUrl,
  workflowSnippet,
} from "../src/assessments/workflow-snippets.js";
import { validateConfiguration } from "../src/configuration/configuration-store.js";
import {
  catalogue,
  customRule,
  packDigest,
  organizationPack,
  ruleRequirementsDigest,
} from "../src/standards/catalogue.js";
afterEach(() => vi.unstubAllEnvs());
it("combines a standard into one copyable step and deduplicates its checks", () => {
  const rules = [
    { id: "tests.required", title: "Tests" },
    { id: "security.sast", title: "SAST" },
  ];
  const result = workflowSnippet(
    [...rules, rules[0]!],
    "https://preflyt.example/api",
  );
  const steps = parse(result.snippet);
  expect(steps).toHaveLength(1);
  expect(result.checkIds).toEqual(["tests.required", "security.sast"]);
  expect(result.ready).toBe(true);
  expect(steps[0].uses).toBe(policyAction);
  expect(JSON.parse(steps[0].with.checks)["tests.required"].argv).toEqual([
    "preflyt-recipe",
    "tests.required",
    ".preflyt/results/tests.required.xml",
  ]);
  expect(steps[0].if).toContain("head.repo.full_name == github.repository");
});
it("preserves custom check commands and the repository's report path", () => {
  const rule = {
    id: "custom-junit-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Contract tests",
    workflowCommand: "./ci/contracts.sh",
    reportPath: "reports/contracts.xml",
  };
  expect(checkExecution(rule)).toEqual({
    argv: ["bash", "-lc", "./ci/contracts.sh"],
    report: "reports/contracts.xml",
  });
  expect(workflowSnippet([rule], "https://preflyt.example").notes).toEqual([]);
});
it("keeps missing commands and unsupported checks explicit", () => {
  const result = workflowSnippet(
    [
      { id: "frontend.components", title: "Component tests" },
      { id: "coverage.required", title: "Coverage" },
    ],
    null,
  );
  expect(result.ready).toBe(false);
  expect(result.notes.join(" ")).toContain("Component tests");
  expect(result.notes.join(" ")).toContain("Coverage");
  expect(result.notes.join(" ")).toContain("administrator");
  expect(
    checkExecution({ id: "frontend.components", title: "Component tests" }),
  ).not.toHaveProperty("argv");
});
it("requires a public HTTPS deployment URL instead of a per-workflow localhost value", () => {
  for (const value of [
    "http://localhost:3000",
    "https://localhost",
    "https://user:secret@example.com",
    "https://preflyt.example?key=secret",
  ]) {
    expect(() =>
      validateConfiguration({ PREFLYT_PUBLIC_API_URL: value }),
    ).toThrow();
    vi.stubEnv("PREFLYT_PUBLIC_API_URL", value);
    expect(publicPipelineUrl()).toBeNull();
  }
  vi.stubEnv("PREFLYT_PUBLIC_API_URL", "https://preflyt.example/api/");
  expect(publicPipelineUrl()).toBe("https://preflyt.example/api");
});
it("keeps workflow metadata out of gate requirements and validates saved standards", () => {
  const base = catalogue
    .flatMap((p) => p.rules)
    .find((r) => r.id === "tests.required")!;
  const custom = {
    ...base,
    workflowCommand: "npm run test:ci",
    reportPath: "reports/tests.xml",
  };
  expect(ruleRequirementsDigest(custom)).toBe(ruleRequirementsDigest(base));
  const { digest: _digest, ...template } = catalogue[0]!;
  const pack = {
    ...template,
    version: "1.0.1",
    stages: ["repository", "pull_request", "ci"],
    languages: ["*"],
    repositoryTypes: ["all"],
    changelog: ["Organization-managed version."],
    id: "org-standard-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    owner: "Organization",
    rules: [custom],
  };
  expect(organizationPack({ ...pack, digest: packDigest(pack) })).toBeTruthy();
  expect(
    customRule({
      id: "custom-junit-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Tests",
      guidance: "",
      reportPath: "../outside.xml",
    }),
  ).toBeUndefined();
});
