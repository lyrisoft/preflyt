import { checkExecution, type SnippetRule } from "./workflow-snippets.js";
import { BadRequestException } from "@nestjs/common";
import { parseDocument } from "yaml";
import { digest } from "./assessment-digest.js";
import { checkReportFormat } from "./check-report-adapters.js";
import { setupConfiguration } from "./pipeline-setup-package.js";

export type WorkflowRule = SnippetRule & { required: boolean };
export const policyAction = "./.github/actions/preflyt-policy";
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function readWorkflow(yaml: string) {
  if (
    typeof yaml !== "string" ||
    Buffer.byteLength(yaml) > 32768 ||
    yaml.includes("\0")
  )
    throw new BadRequestException("Workflows must be UTF-8 YAML under 32 KB");
  const document = parseDocument(yaml, { uniqueKeys: true });
  if (document.errors.length) {
    const line = document.errors[0]?.linePos?.[0]?.line;
    throw new BadRequestException(
      `Invalid workflow YAML${line ? ` at line ${line}` : ""}`,
    );
  }
  let value: Record<string, any>;
  try {
    value = document.toJS({ maxAliasCount: 10 });
  } catch {
    throw new BadRequestException("Workflow YAML contains unsupported aliases");
  }
  if (
    !object(value) ||
    !object(value.jobs) ||
    !Object.keys(value.jobs).length ||
    Object.keys(value.jobs).length > 50
  )
    throw new BadRequestException("Add at least one GitHub Actions job");
  for (const [id, job] of Object.entries(value.jobs)) {
    if (
      !/^[a-zA-Z_][a-zA-Z0-9_-]{0,99}$/.test(id) ||
      !object(job) ||
      (job.steps !== undefined &&
        (!Array.isArray(job.steps) ||
          job.steps.length > 100 ||
          job.steps.some((s: unknown) => !object(s))))
    )
      throw new BadRequestException("Workflow jobs and steps are invalid");
  }
  return {
    document,
    value: value as Record<string, any> & {
      jobs: Record<string, Record<string, any>>;
    },
  };
}
export function workflowChecks(yaml: string) {
  const { value } = readWorkflow(yaml);
  const steps = Object.values(value.jobs)
    .flatMap((job: any) => job.steps ?? [])
    .filter((step: any) => step.uses === policyAction);
  return steps;
}
export function inspectWorkflow(
  yaml: string,
  rules: WorkflowRule[],
  branch: string,
) {
  branch = branch.replace(/^refs\/heads\//, "");
  const { value } = readWorkflow(yaml);
  const warnings: string[] = [];
  const triggers =
    typeof value.on === "string"
      ? [value.on]
      : Array.isArray(value.on)
        ? value.on
        : object(value.on)
          ? Object.keys(value.on)
          : [];
  if (!triggers.includes("pull_request"))
    warnings.push(
      `This workflow does not run on pull requests. Add a pull_request trigger for ${branch}; keep deployment jobs restricted to their existing events.`,
    );
  else if (
    object(value.on?.pull_request) &&
    Array.isArray(value.on.pull_request.branches) &&
    !value.on.pull_request.branches.includes(branch)
  )
    warnings.push(
      `Check that the pull_request branch filters include ${branch}.`,
    );
  const steps = workflowChecks(yaml);
  if (!steps.length)
    warnings.push(
      "Add the policy checks to a job before creating the setup PR.",
    );
  const ids: string[] = [];
  for (const step of steps) {
    if (typeof step.with?.checks === "string") {
      try {
        ids.push(...Object.keys(JSON.parse(step.with.checks)));
      } catch {
        warnings.push(
          "Use inline check configuration in this workflow, or keep the referenced checks file in the repository.",
        );
      }
    }
  }
  const missing = rules.filter(
    (rule) => checkReportFormat(rule.id) && !ids.includes(rule.id),
  );
  if (missing.length)
    warnings.push(
      `${missing.length} policy check${missing.length === 1 ? "" : "s"} still need a workflow step.`,
    );
  if (steps.length)
    warnings.push(
      "Preflyt runs supported check recipes automatically. Custom report checks need their configured command or an earlier report-producing step.",
    );
  const unsupported = rules.filter(
    (rule) => !checkReportFormat(rule.id) && rule.id !== "ci.configured",
  );
  if (unsupported.length)
    warnings.push(
      `${unsupported.length} checks use other evidence sources and cannot be added as pipeline report checks.`,
    );
  return {
    jobs: Object.entries(value.jobs)
      .filter(([, job]) => Array.isArray(job.steps))
      .map(([id, job]) => ({
        id,
        name: typeof job.name === "string" ? job.name : id,
      })),
    checkIds: [...new Set(ids)],
    warnings,
  };
}
/** Modify the YAML document itself so comments and unrelated jobs stay intact. */
export function addPolicyChecks(
  yaml: string,
  jobId: string,
  rules: WorkflowRule[],
  ids: string[],
  apiUrl: string,
) {
  const { document, value } = readWorkflow(yaml);
  if (
    typeof apiUrl !== "string" ||
    apiUrl.length > 2048 ||
    /[\x00-\x20]/.test(apiUrl)
  )
    throw new BadRequestException("Enter the Preflyt API URL");
  const job = value.jobs[jobId];
  if (!object(job) || !Array.isArray(job.steps))
    throw new BadRequestException("Choose a job with workflow steps");
  if (
    !ids.length ||
    ids.length > 10 ||
    ids.some((id) => !rules.some((r) => r.id === id) || !checkReportFormat(id))
  )
    throw new BadRequestException("Choose pipeline checks from this policy");
  if (workflowChecks(yaml).length > 1)
    throw new BadRequestException("Keep one Preflyt policy step per workflow");
  const index = job.steps.findIndex((step: any) => step.uses === policyAction);
  if (index < 0 && workflowChecks(yaml).length)
    throw new BadRequestException(
      "Add checks to the job that already contains the Preflyt step",
    );
  let checks: Record<string, unknown> = {};
  if (index >= 0) {
    try {
      checks = JSON.parse(job.steps[index].with?.checks);
    } catch {
      throw new BadRequestException(
        "Move the existing checks file configuration into this workflow before adding checks",
      );
    }
    if (!object(checks))
      throw new BadRequestException(
        "The existing check configuration is invalid",
      );
  }
  for (const id of ids)
    if (!(id in checks))
      checks[id] = checkExecution(rules.find((r) => r.id === id)!)!;
  if (Object.keys(checks).length > 10)
    throw new BadRequestException("A policy run supports up to 10 reports");
  const step = {
    ...(index >= 0 ? job.steps[index] : {}),
    name: "Preflyt policy",
    if: "${{ always() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}",
    uses: policyAction,
    with: {
      ...(index >= 0 ? job.steps[index].with : {}),
      "api-url": apiUrl,
      checks: JSON.stringify(checks, null, 2),
    },
  };
  if (index >= 0) document.setIn(["jobs", jobId, "steps", index], step);
  else document.addIn(["jobs", jobId, "steps"], step);
  // Explicit job permissions otherwise erase inherited permissions. Preserve them.
  const inherited = job.permissions ?? value.permissions;
  if (inherited !== "write-all") {
    const allRead = [
      "actions",
      "attestations",
      "checks",
      "contents",
      "deployments",
      "discussions",
      "issues",
      "packages",
      "pages",
      "pull-requests",
      "repository-projects",
      "security-events",
      "statuses",
    ];
    const permissions =
      inherited === "read-all" || inherited === undefined
        ? Object.fromEntries(allRead.map((key) => [key, "read"]))
        : object(inherited)
          ? inherited
          : {};
    document.setIn(["jobs", jobId, "permissions"], {
      ...permissions,
      contents: permissions.contents === "write" ? "write" : "read",
      "id-token": "write",
    });
  }
  const checkout = job.steps.findIndex(
    (step: any) =>
      typeof step.uses === "string" &&
      step.uses.startsWith("actions/checkout@"),
  );
  if (checkout >= 0) {
    document.setIn(
      ["jobs", jobId, "steps", checkout, "with", "ref"],
      "${{ github.event.pull_request.head.sha || github.sha }}",
    );
    document.setIn(
      ["jobs", jobId, "steps", checkout, "with", "persist-credentials"],
      false,
    );
  }
  const workflow = document.toString({ lineWidth: 0 });
  readWorkflow(workflow);
  return { workflow };
}
export function validateSetupWorkflow(yaml: string, rules: WorkflowRule[]) {
  const steps = workflowChecks(yaml);
  if (steps.length !== 1)
    throw new BadRequestException(
      "Keep exactly one Preflyt policy step in the workflow",
    );
  const step = steps[0];
  if (
    typeof step.with?.checks !== "string" ||
    typeof step.with?.["api-url"] !== "string"
  )
    throw new BadRequestException(
      "Add the policy checks and Preflyt API URL in the workflow",
    );
  setupConfiguration(
    step.with["api-url"],
    step.with.checks,
    rules.map((rule) => rule.id),
  );
  const { value } = readWorkflow(yaml);
  const jobs = Object.values(value.jobs);
  const job = jobs.find((job) =>
    job.steps?.some((s: any) => s.uses === policyAction),
  )!;
  if (
    !job.steps.some(
      (s: any) =>
        typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"),
    )
  )
    throw new BadRequestException(
      "Add actions/checkout before the local Preflyt Action",
    );
  const permissions = job.permissions ?? value.permissions;
  if (
    permissions !== "write-all" &&
    (!object(permissions) ||
      permissions["id-token"] !== "write" ||
      !["read", "write"].includes(permissions.contents))
  )
    throw new BadRequestException(
      "The Preflyt job needs contents: read and id-token: write permissions",
    );
}
export class WorkflowRewriteError extends Error {
  constructor(
    readonly code:
      | "INVALID_RESPONSE"
      | "UNSAFE_RESPONSE"
      | "TRIGGERS_CHANGED"
      | "JOB_REMOVED"
      | "JOB_CHANGED"
      | "STEP_CHANGED",
    message: string,
    readonly location?: { jobId: string; step?: number; field?: string },
  ) {
    super(message);
    this.name = "WorkflowRewriteError";
  }
}

/** AI may add steps and permissions; it may not silently delete existing flows. */
export function validateRewrite(
  raw: string,
  original: string,
  credential?: string,
) {
  if (credential && raw.includes(credential))
    throw new WorkflowRewriteError("UNSAFE_RESPONSE", "Unsafe model response");
  let result: { workflow?: unknown; summary?: unknown };
  try {
    // Some compatible models wrap otherwise valid JSON in a single code fence.
    // Unwrap only that envelope; do not repair partial JSON or accept prose.
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(raw.trim());
    result = JSON.parse(fenced?.[1] ?? raw);
  } catch {
    throw new WorkflowRewriteError(
      "INVALID_RESPONSE",
      "Invalid model response",
    );
  }
  if (
    !object(result) ||
    Object.keys(result).sort().join(",") !== "summary,workflow" ||
    typeof result.workflow !== "string" ||
    typeof result.summary !== "string" ||
    result.summary.length > 1500
  )
    throw new WorkflowRewriteError(
      "INVALID_RESPONSE",
      "Invalid model response",
    );
  const before = readWorkflow(original).value,
    after = readWorkflow(result.workflow).value;
  if (digest(before.on ?? null) !== digest(after.on ?? null))
    throw new WorkflowRewriteError(
      "TRIGGERS_CHANGED",
      "Model changed existing workflow triggers",
    );
  for (const [id, job] of Object.entries(before.jobs)) {
    const changed = after.jobs[id];
    if (!object(changed))
      throw new WorkflowRewriteError(
        "JOB_REMOVED",
        "Model removed an existing workflow job",
        { jobId: id },
      );
    for (const key of [
      "if",
      "needs",
      "environment",
      "runs-on",
      "uses",
      "strategy",
      "concurrency",
      "container",
      "services",
    ])
      if (digest(job[key] ?? null) !== digest(changed[key] ?? null))
        throw new WorkflowRewriteError(
          "JOB_CHANGED",
          "Model changed existing job behavior",
          { jobId: id, field: key },
        );
    const normalize = (step: any) => {
      if (
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/checkout@")
      ) {
        const {
          ref,
          "persist-credentials": credentials,
          ...rest
        } = step.with ?? {};
        return { ...step, with: rest };
      }
      return step;
    };
    let position = 0;
    for (const [index, step] of (job.steps ?? []).entries()) {
      if (step.uses === policyAction) continue;
      const found = (changed.steps ?? []).findIndex(
        (s: any, i: number) =>
          i >= position && digest(normalize(step)) === digest(normalize(s)),
      );
      if (found < 0)
        throw new WorkflowRewriteError(
          "STEP_CHANGED",
          "Model removed or changed an existing workflow step",
          { jobId: id, step: index + 1 },
        );
      position = found + 1;
    }
  }
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/.test(
      result.workflow,
    )
  )
    throw new WorkflowRewriteError(
      "UNSAFE_RESPONSE",
      "Use secret references in the workflow",
    );
  return { workflow: result.workflow, summary: result.summary };
}
