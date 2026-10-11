import { publicationGateJob } from "./pipeline-gate-workflow.js";
import { stringify } from "yaml";
import { policyAction } from "./pipeline-action.js";
import { checkReportFormat } from "./check-report-adapters.js";
import { configurationValue } from "../configuration/runtime-configuration.js";

export type SnippetRule = {
  id: string;
  title: string;
  workflowCommand?: string;
  reportPath?: string;
};
const recipes = new Set([
  "tests.required",
  "types.required",
  "build.required",
  "lint.required",
  "security.sast",
  "secrets.scan",
  "security.dependencies",
  "containers.scan",
  "iac.policy",
  "iac.exposures",
]);
export function publicPipelineUrl() {
  const value = configurationValue("PREFLYT_PUBLIC_API_URL");
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ? url.toString().replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}
export function checkExecution(rule: SnippetRule) {
  const format = checkReportFormat(rule.id);
  if (!format) return null;
  const report =
    rule.reportPath ??
    `.preflyt/results/${rule.id}.${format === "sarif" ? "sarif" : "xml"}`;
  return {
    report,
    ...(rule.workflowCommand
      ? { argv: ["bash", "-lc", rule.workflowCommand] }
      : recipes.has(rule.id)
        ? {
            argv: [
              "preflyt-recipe",
              rule.id,
              report,
            ],
          }
        : {}),
  };
}
export function workflowSnippet(
  rules: SnippetRule[],
  apiUrl = publicPipelineUrl(),
) {
  const unique = [...new Map(rules.map((r) => [r.id, r])).values()];
  const checks = Object.fromEntries(
    unique.flatMap((r) => {
      const execution = checkExecution(r);
      return execution ? [[r.id, execution]] : [];
    }),
  );
  const notes: string[] = [];
  const unsupported = unique.filter(
    (r) =>
      !checkReportFormat(r.id) &&
      !["ci.configured", "dependencies.locked"].includes(r.id),
  );
  if (unsupported.length)
    notes.push(
      `Other evidence is needed for: ${unsupported.map((r) => r.title).join(", ")}.`,
    );
  const custom = unique.filter(
    (r) => checkReportFormat(r.id) && !r.workflowCommand && !recipes.has(r.id),
  );
  if (custom.length)
    notes.push(
      `Generate the named report in an earlier step, or add a workflow command to: ${custom.map((r) => r.title).join(", ")}.`,
    );
  if (unique.some((r) => r.id === "containers.scan" && !r.workflowCommand))
    notes.push(
      "Set CONTAINER_IMAGE to the image produced by your build in this job.",
    );
  if (!apiUrl)
    notes.push(
      "A deployment administrator must set the public Preflyt API URL once in Settings → Configuration.",
    );
  if (Object.keys(checks).length > 10)
    notes.push(
      "This policy exceeds the current limit of 10 execution reports per workflow run.",
    );
  const step = {
    name: "Preflyt policy",
    if: "${{ always() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}",
    uses: policyAction,
    with: {
      "api-url": apiUrl ?? "<PUBLIC_PREFLYT_API_URL>",
      checks: JSON.stringify(checks, null, 2),
    },
  };
  const snippet =
    '# Add these jobs to your PR workflow. Install project dependencies before the Preflyt step.\n' +
    '# If reusing existing jobs, keep their steps and make preflyt_gate depend on every check job.\n' +
    stringify({ jobs: { preflyt_checks: { 'runs-on': 'ubuntu-latest',
      permissions: { contents: 'read', 'id-token': 'write' }, steps: [
        { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
          with: { ref: '${{ github.event.pull_request.head.sha }}', 'persist-credentials': false } }, step,
      ] }, preflyt_gate: publicationGateJob(['preflyt_checks'], apiUrl ?? '<PUBLIC_PREFLYT_API_URL>') } }, { lineWidth: 0 });
  return {
    snippet,
    notes,
    ready: !!apiUrl && Object.keys(checks).length <= 10,
    checkIds: Object.keys(checks),
  };
}
