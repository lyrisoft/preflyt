import { type SnippetRule } from "./workflow-snippets.js";
import { BadRequestException } from "@nestjs/common";
import { parseDocument } from "yaml";
import { digest } from "./assessment-digest.js";
import { checkReportFormat } from "./check-report-adapters.js";

import { chainPublicationGate } from "./pipeline-gate-workflow.js";
import { policyAction, isPolicyAction } from "./pipeline-action.js";

export type WorkflowRule = SnippetRule & { required: boolean };
export { policyAction } from "./pipeline-action.js";
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
    .filter((step: any) => isPolicyAction(step.uses) && step.with?.mode !== "gate");
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
  const policyRunner = steps.length === 1 && steps[0].uses === policyAction &&
    steps[0].with?.checks === undefined;
  const ids = policyRunner ? rules.filter(rule => checkReportFormat(rule.id)).map(rule => rule.id) : [];
  if (steps.length && !policyRunner)
    warnings.push('Upgrade this workflow to the policy runner. Check lists and report mappings are managed in Preflyt.');
  if (steps.length)
    warnings.push(
      "Each run fetches the published policy. Scanner images are provisioned automatically; configure project and custom check commands in Standards.",
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
    policyRunner,
    warnings,
  };
}
/** Modify the YAML document itself so comments and unrelated jobs stay intact. */
export function addPolicyChecks(
  yaml: string,
  jobId: string,
  rules: WorkflowRule[],
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
    !rules.length || rules.length > 64
  )
    throw new BadRequestException("Choose a published policy with supported check limits");
  if (workflowChecks(yaml).length > 1)
    throw new BadRequestException("Keep one Preflyt policy step per workflow");
  const index = job.steps.findIndex((step: any) => isPolicyAction(step.uses) && step.with?.mode !== 'gate');
  if (index < 0 && workflowChecks(yaml).length)
    throw new BadRequestException(
      "Add checks to the job that already contains the Preflyt step",
    );
  const checkoutIndex = job.steps.findIndex((s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout@'));
  if (checkoutIndex < 0 || (index >= 0 && checkoutIndex >= index))
    throw new BadRequestException('Choose a check job with actions/checkout before the policy runner');
  const { checks: _legacyChecks, ...inputs } = index >= 0
    ? job.steps[index].with ?? {} : {};
  const step = {
    ...(index >= 0 ? job.steps[index] : {}),
    name: "Preflyt policy",
    if: "${{ always() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}",
    uses: policyAction,
    with: {
      ...inputs,
      "api-url": apiUrl,
      "job-name": typeof job.name === "string" ? job.name : jobId,
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
  const workflow = chainPublicationGate(document.toString({ lineWidth: 0 }), apiUrl);
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
    step.uses !== policyAction ||
    step.with?.checks !== undefined ||
    typeof step.with?.["api-url"] !== "string"
  )
    throw new BadRequestException(
      "Install the current policy runner and remove explicit check mappings from the workflow",
    );
  let url: URL;
  try { url = new URL(step.with["api-url"]); }
  catch { throw new BadRequestException('Use the public HTTPS Preflyt API URL'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash ||
    ['localhost','127.0.0.1','[::1]'].includes(url.hostname))
    throw new BadRequestException('Use the public HTTPS Preflyt API URL');
  const { value } = readWorkflow(yaml);
  const jobs = Object.values(value.jobs);
  const job = jobs.find((job) =>
    job.steps?.some((s: any) => isPolicyAction(s.uses)),
  )!;
  if (
    !job.steps.some(
      (s: any) =>
        typeof s.uses === "string" && s.uses.startsWith("actions/checkout@"),
    )
  )
    throw new BadRequestException(
      "Add actions/checkout before the Preflyt Action",
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
      if (isPolicyAction(step.uses)) continue;
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
