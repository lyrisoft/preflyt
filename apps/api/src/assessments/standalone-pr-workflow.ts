import { BadRequestException, ConflictException } from "@nestjs/common";
import { posix } from "node:path";
import { stringify } from "yaml";
import type { RepositorySnapshot } from "../github/repository-profile.js";
import { validProfileBranch } from "../github/repository-profile.js";
import { digest } from "./assessment-digest.js";
import { policyAction, isPolicyAction } from "./pipeline-action.js";
import { publicationGateJob } from "./pipeline-gate-workflow.js";
import { checkReportFormat } from "./check-report-adapters.js";
import { checkExecution } from "./workflow-snippets.js";
import { FINAL_GATE_NAME } from "./pipeline-jobs.js";
import {
  readWorkflow,
  validateSetupWorkflow,
  type WorkflowRule,
} from "./pipeline-workflow.js";

export const standaloneWorkflowPath = ".github/workflows/preflyt.yml";
const checkout = {
  uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  with: {
    ref: "${{ github.event.pull_request.head.sha }}",
    "persist-credentials": false,
  },
};
const sameRepository =
  "${{ github.event.pull_request.head.repo.full_name == github.repository && !github.event.pull_request.draft }}";
type Step = Record<string, any>;
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const projectCheck =
  /(?:\b(?:npm|pnpm|yarn)(?:\s+run)?\s+(?:test|lint|typecheck|check|build)\b|\b(?:pytest|vitest|jest|go test|cargo test)\b)/;
// Repository setup is proposed as text only. It is never executed by the API.
const deployStep =
  /configure-aws-credentials|amazon-ecr-login|build-push-action|\baws\s|\b(?:deploy|publish)\b|docker\s+(?:push|login)|--push\b/i;

/** Reuse an existing verification job's prerequisites, not its tests or deployments. */
function verificationSetups(snapshot: RepositorySnapshot) {
  const candidates: {
    steps: Step[];
    env: unknown;
    defaults: unknown;
    services: unknown;
    directory: string;
    source: string;
    score: number;
  }[] = [];
  for (const file of snapshot.files) {
    if (
      !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path) ||
      file.path === standaloneWorkflowPath ||
      !file.content
    )
      continue;
    let value: ReturnType<typeof readWorkflow>["value"];
    try {
      value = readWorkflow(file.content).value;
    } catch {
      continue;
    }
    for (const [id, job] of Object.entries(value.jobs)) {
      if (
        !Array.isArray(job.steps) ||
        job.strategy ||
        job.container ||
        job.environment ||
        job.needs ||
        (job["runs-on"] &&
          job["runs-on"] !== "ubuntu-latest" &&
          !/^ubuntu-\d+\.\d+$/.test(String(job["runs-on"])))
      )
        continue;
      const end = job.steps.findIndex(
        (step: Step) =>
          typeof step.run === "string" && projectCheck.test(step.run),
      );
      if (end < 0) continue;
      const steps: Step[] = job.steps.slice(0, end);
      if (
        !steps.some(
          (s) =>
            typeof s.uses === "string" &&
            s.uses.startsWith("actions/checkout@"),
        )
      )
        continue;
      if (
        steps.filter(
          (s) =>
            typeof s.uses === "string" &&
            s.uses.startsWith("actions/checkout@"),
        ).length !== 1 ||
        steps.some(
          (s) =>
            typeof s.uses === "string" &&
            s.uses.startsWith("actions/checkout@") &&
            (s.with?.path || s.with?.repository || s.with?.["sparse-checkout"]),
        )
      )
        continue;
      const context = JSON.stringify({
        steps,
        env: { ...value.env, ...job.env },
        defaults: job.defaults ?? value.defaults,
        services: job.services,
      });
      if (
        deployStep.test(context) ||
        /\$\{\{\s*(?:matrix|needs|inputs)\./.test(context) ||
        steps.some(
          (s) =>
            isPolicyAction(s.uses) ||
            s["continue-on-error"] ||
            (s.if && s.if !== "success()"),
        )
      )
        continue;
      candidates.push({
        steps: steps.map((step) =>
          typeof step.uses === "string" &&
          step.uses.startsWith("actions/checkout@")
            ? { ...step, ...checkout, with: { ...step.with, ...checkout.with } }
            : step,
        ),
        env: { ...value.env, ...job.env },
        defaults: job.defaults ?? value.defaults,
        services: job.services,
        directory:
          job.steps[end]["working-directory"] ??
          (job.defaults ?? value.defaults)?.run?.["working-directory"] ??
          ".",
        source: `${file.path} → ${id}`,
        score: (/test/i.test(id) ? 10 : 0) + steps.length,
      });
    }
  }
  return candidates.sort(
    (a, b) => b.score - a.score || a.source.localeCompare(b.source),
  );
}

export function standaloneSetupSources(snapshot: RepositorySnapshot) {
  return verificationSetups(snapshot).map((setup) => setup.source).slice(0, 8);
}

function manifestSetup(snapshot: RepositorySnapshot, notes: string[]) {
  const steps: Step[] = [checkout];
  const packages = snapshot.files.filter(
    (f) => /(^|\/)package\.json$/.test(f.path) && f.content,
  );
  if (packages.length > 8)
    notes.push(
      "More than eight JavaScript projects were found. Review dependency setup for the projects used by this policy.",
    );
  if (packages.length) {
    let version = "lts/*";
    try {
      const engine = JSON.parse(packages[0]!.content!).engines?.node;
      if (typeof engine === "string" && /^[\dv~^<>=.*| -]+$/.test(engine))
        version = engine;
    } catch {
      /* An unread manifest is reported below. */
    }
    steps.push({
      name: "Set up Node.js",
      uses: "actions/setup-node@v4",
      with: { "node-version": version },
    });
    const managers = new Set<string>();
    for (const file of packages.slice(0, 8)) {
      const directory = posix.dirname(file.path);
      const at = (name: string) =>
        snapshot.files.some((f) => f.path === posix.join(directory, name));
      let manifest: Record<string, any>;
      try {
        manifest = JSON.parse(file.content!);
      } catch {
        notes.push(
          `Could not read ${file.path}. Review dependency installation.`,
        );
        continue;
      }
      // Child packages in a workspace use the workspace root's installation.
      if (
        packages.some(
          (parent) =>
            parent !== file &&
            (posix.dirname(parent.path) === "." ||
              file.path.startsWith(posix.dirname(parent.path) + "/")) &&
            (snapshot.files.some(
              (f) =>
                f.path ===
                posix.join(posix.dirname(parent.path), "pnpm-workspace.yaml"),
            ) ||
              /"workspaces"\s*:/.test(parent.content ?? "")),
        )
      )
        continue;
      const manager = at("pnpm-lock.yaml")
        ? "pnpm"
        : at("yarn.lock")
          ? "yarn"
          : at("package-lock.json")
            ? "npm"
            : null;
      if (!manager) {
        notes.push(
          `No supported lockfile was found beside ${file.path}. Add a reviewed dependency installation step.`,
        );
        continue;
      }
      if (manager !== "npm" && !managers.has(manager)) {
        if (
          typeof manifest.packageManager === "string" &&
          new RegExp(`^${manager}@\\d+\\.\\d+\\.\\d+$`).test(
            manifest.packageManager,
          )
        )
          steps.push({
            name: `Set up ${manager}`,
            run: `npm install --global ${manifest.packageManager}`,
          });
        else {
          notes.push(
            `Set a pinned packageManager version in ${file.path} to install ${manager}.`,
          );
          continue;
        }
      }
      managers.add(manager);
      steps.push({
        name: `Install dependencies (${directory})`,
        "working-directory": directory,
        run:
          manager === "npm"
            ? "npm ci"
            : manager === "pnpm"
              ? "pnpm install --frozen-lockfile"
              : /^yarn@1\./.test(manifest.packageManager ?? "")
                ? "yarn install --frozen-lockfile"
                : "yarn install --immutable",
      });
    }
  }
  if (
    snapshot.files.some((f) =>
      /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/.test(f.path),
    )
  ) {
    steps.push({
      name: "Set up Python",
      uses: "actions/setup-python@v5",
      with: { "python-version": "3.x" },
    });
    const requirements = snapshot.files.filter((f) =>
      /(^|\/)requirements\.txt$/.test(f.path),
    );
    for (const file of requirements.slice(0, 4))
      steps.push({
        name: `Install Python dependencies (${posix.dirname(file.path)})`,
        env: { PREFLYT_REQUIREMENTS: file.path },
        run: 'python -m pip install -r "$PREFLYT_REQUIREMENTS"',
      });
    if (!requirements.length)
      notes.push(
        "Python project detected. Add its reviewed dependency installation command before the policy checks.",
      );
  }
  if (snapshot.files.some((f) => /(^|\/)go\.mod$/.test(f.path))) {
    const module = snapshot.files.find((f) => /(^|\/)go\.mod$/.test(f.path))!;
    steps.push({
      name: "Set up Go",
      uses: "actions/setup-go@v5",
      with: { "go-version-file": module.path, cache: false },
    });
    steps.push({
      name: "Download Go dependencies",
      "working-directory": posix.dirname(module.path),
      run: "go mod download",
    });
  }
  return steps;
}

export function standalonePrWorkflow(
  snapshot: RepositorySnapshot,
  rules: WorkflowRule[],
  apiUrl: string | null,
  setupSource?: string,
) {
  if (!validProfileBranch(snapshot.branch))
    throw new BadRequestException("Choose an existing target branch");
  const notes: string[] = [];
  const reportChecks = rules.filter((rule) => checkReportFormat(rule.id));
  if (reportChecks.length > 10)
    notes.push(
      "This policy exceeds the limit of 10 execution reports per workflow run. Reduce its report checks before installing.",
    );
  for (const rule of reportChecks)
    if (!checkExecution(rule)?.argv)
      notes.push(
        `Configure the Workflow command and Result file for ${rule.title} in Standards. This check cannot run without a project command.`,
      );
  const otherChecks = rules.filter(
    (rule) =>
      !checkReportFormat(rule.id) &&
      !["ci.configured", "dependencies.locked"].includes(rule.id),
  );
  if (otherChecks.length)
    notes.push(
      `These checks need other evidence sources: ${otherChecks.map((rule) => rule.title).join(", ")}. The standalone runner does not supply that evidence.`,
    );
  const previous = snapshot.files.find(
    (f) => f.path === standaloneWorkflowPath,
  );
  if (previous && !previous.content)
    throw new ConflictException(
      "The existing Preflyt workflow could not be read. Refresh before proposing changes.",
    );
  if (
    previous?.content &&
    !previous.content.startsWith("# Preflyt pull request workflow")
  )
    throw new ConflictException(
      `${standaloneWorkflowPath} already exists and is not managed by this setup. Rename it or review it manually before installing.`,
    );
  const setups = verificationSetups(snapshot);
  const setup = setupSource ? setups.find((item) => item.source === setupSource) : setups[0];
  if (setupSource && !setup) throw new BadRequestException('The selected setup is unavailable at this commit');
  const steps = setup?.steps ?? manifestSetup(snapshot, notes);
  if (setup)
    notes.push(
      `Project setup copied from ${setup.source} at commit ${snapshot.sourceSha.slice(0, 12)}. Review services, environment values and setup commands before creating the PR.`,
    );
  else if (
    rules.some((r) =>
      /^(tests\.required|frontend\.components|service\.resilience|custom-junit-)/.test(
        r.id,
      ),
    )
  )
    notes.push(
      "No reusable test setup was found. Review required databases, environment variables and migrations in the YAML before running project checks.",
    );
  const projectDirectory =
    setup?.directory ??
    (snapshot.files.some((f) => f.path === "package.json")
      ? "."
      : posix.dirname(
          snapshot.files.find((f) => /(^|\/)package\.json$/.test(f.path))
            ?.path ?? "package.json",
        ));
  if (
    projectDirectory !== "." &&
    rules.some(
      (r) =>
        /^(tests\.required|types\.required|build\.required|lint\.required)$/.test(
          r.id,
        ) && !r.workflowCommand,
    )
  )
    notes.push(
      `Project checks are configured under ${projectDirectory}, but policy commands execute from the repository root. Set their Workflow command and Result file in Standards to target that directory; job defaults do not change the Action's execution directory. Unconfigured checks remain incomplete.`,
    );
  if (!snapshot.complete || snapshot.warnings.length)
    notes.push(
      ...snapshot.warnings,
      ...(!snapshot.complete
        ? [
            "Repository inspection is partial. Review the setup against the target branch.",
          ]
        : []),
    );
  if (
    snapshot.files.some((f) =>
      /(^|\/)(Cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|Gemfile|composer\.json|[^/]+\.csproj)$/.test(
        f.path,
      ),
    ) &&
    !setup
  )
    notes.push(
      "Additional project runtimes were found. Add their setup and dependency commands in the YAML before the policy checks.",
    );
  const env = { ...(object(setup?.env) ? setup.env : {}) };
  if (rules.some((r) => r.id === "containers.scan") && !env.CONTAINER_IMAGE) {
    const dockerfiles = snapshot.files.filter((f) =>
      /(^|\/)Dockerfile$/.test(f.path),
    );
    if (dockerfiles.length === 1) {
      const path = dockerfiles[0]!.path;
      env.CONTAINER_IMAGE =
        "preflyt-pr:${{ github.event.pull_request.head.sha }}";
      steps.push({
        name: "Build the image for container scanning",
        "working-directory": ".",
        env: {
          PREFLYT_DOCKERFILE: path,
          PREFLYT_BUILD_CONTEXT: posix.dirname(path),
        },
        run: 'docker build --file "$PREFLYT_DOCKERFILE" --tag "$CONTAINER_IMAGE" "$PREFLYT_BUILD_CONTEXT"',
      });
      notes.push(
        `Container scan builds ${path} locally without pushing or deploying. Review its build context, arguments and any required build secrets.`,
      );
    } else
      notes.push(
        "Container scanning needs a local image. Set CONTAINER_IMAGE and add its build step; multiple or missing Dockerfiles prevent automatic selection.",
      );
  }
  for (const rule of rules)
    if (
      rule.workflowCommand &&
      /\b(?:cd\s|(?:npm|pnpm|yarn)\s+(?:--prefix|--dir|--cwd))/.test(
        rule.workflowCommand,
      )
    )
      notes.push(
        `Review working directories for ${rule.title}; its command selects a project directory.`,
      );
  if (!apiUrl)
    notes.push(
      "A deployment administrator must configure the public HTTPS Preflyt API URL before this workflow can run.",
    );
  const url = apiUrl ?? "<PUBLIC_PREFLYT_API_URL>";
  steps.push({
    name: "Run published policy checks",
    uses: policyAction,
    with: { "api-url": url, "job-name": "Preflyt policy checks" },
  });
  const workflow =
    "# Preflyt pull request workflow\n# Setup changes are reviewed through a PR. Check commands come from the published target-branch policy.\n" +
    stringify(
      {
        name: "Preflyt pull request checks",
        on: {
          pull_request: {
            branches: [snapshot.branch],
            types: ["opened", "synchronize", "reopened", "ready_for_review"],
          },
        },
        concurrency: {
          group:
            "preflyt-${{ github.workflow }}-${{ github.event.pull_request.number }}",
          "cancel-in-progress": true,
        },
        permissions: { contents: "read" },
        jobs: {
          preflyt_checks: {
            name: "Preflyt policy checks",
            if: sameRepository,
            "runs-on": "ubuntu-latest",
            "timeout-minutes": 45,
            permissions: { contents: "read", "id-token": "write" },
            ...(Object.keys(env).length ? { env } : {}),
            ...(setup?.defaults ? { defaults: setup.defaults } : {}),
            ...(setup?.services ? { services: setup.services } : {}),
            steps,
          },
          preflyt_gate: {
            ...publicationGateJob(["preflyt_checks"], url),
            if: "${{ always() && !cancelled() && github.event.pull_request.head.repo.full_name == github.repository && !github.event.pull_request.draft }}",
          },
        },
      },
      { lineWidth: 0 },
    );
  readWorkflow(workflow);
  // Preserve reviewed project customizations when the installed workflow already
  // satisfies the current contract. Policy check lists are fetched on each run.
  let proposed = workflow;
  if (previous?.content && apiUrl && !setupSource) {
    try {
      validateStandalonePrWorkflow(
        previous.content,
        rules,
        `refs/heads/${snapshot.branch}`,
        apiUrl,
      );
      proposed = previous.content;
    } catch {
      notes.push(
        "The installed Preflyt workflow needs an update. Review its previous setup in the comparison before replacing it.",
      );
    }
  }
  return {
    workflow: proposed,
    original: previous?.content ?? "",
    path: standaloneWorkflowPath,
    baseSha: snapshot.sourceSha,
    branch: snapshot.branch,
    exists: !!previous,
    notes: [...new Set(notes)],
    setupSources: setup ? [setup.source] : [],
    inputHash: digest({ sourceSha: snapshot.sourceSha, rules, apiUrl }),
  };
}

/** The submitted preview must remain a PR-only workflow for this exact policy branch. */
export function validateStandalonePrWorkflow(
  workflow: string,
  rules: WorkflowRule[],
  branchRef: string,
  apiUrl: string,
) {
  if (rules.filter((rule) => checkReportFormat(rule.id)).length > 10)
    throw new BadRequestException(
      "A standalone policy run supports at most 10 execution reports. Reduce the policy report checks before installing.",
    );
  validateSetupWorkflow(workflow, rules);
  const { value } = readWorkflow(workflow);
  const branch = branchRef.replace(/^refs\/heads\//, "");
  if (
    !object(value.on) ||
    Object.keys(value.on).join(",") !== "pull_request" ||
    !object(value.on.pull_request) ||
    digest(value.on.pull_request.branches) !== digest([branch]) ||
    digest(value.on.pull_request.types) !==
      digest(["opened", "synchronize", "reopened", "ready_for_review"]) ||
    value.on.pull_request.paths ||
    value.on.pull_request["paths-ignore"] ||
    value.on.pull_request["branches-ignore"]
  )
    throw new BadRequestException(
      "Keep the pull request trigger and selected target branch unchanged",
    );
  const jobs = Object.entries(value.jobs);
  const gates = jobs.filter(([, job]) => job.name === FINAL_GATE_NAME);
  if (gates.length !== 1)
    throw new BadRequestException("Keep one Preflyt final gate job");
  const [gateId, gate] = gates[0]!;
  const checks = jobs.filter(([id]) => id !== gateId);
  if (
    !Array.isArray(gate.needs) ||
    digest([...gate.needs].sort()) !== digest(checks.map(([id]) => id).sort())
  )
    throw new BadRequestException(
      "The final gate must depend on every check job",
    );
  for (const [, job] of jobs) {
    const permission = job.permissions ?? value.permissions;
    if (
      permission === "write-all" ||
      (object(permission) &&
        Object.entries(permission).some(
          ([key, level]) => level === "write" && key !== "id-token",
        ))
    )
      throw new BadRequestException(
        "PR checks may request only Contents read and identity token write access",
      );
    for (const step of job.steps ?? []) {
      if (isPolicyAction(step.uses) && step.with?.["api-url"] !== apiUrl)
        throw new BadRequestException("Use the configured Preflyt API address");
      if (
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/checkout@") &&
        (step.with?.ref !== "${{ github.event.pull_request.head.sha }}" ||
          step.with?.["persist-credentials"] !== false)
      )
        throw new BadRequestException(
          "Check out the exact PR head without persisting credentials",
        );
    }
  }
  if (
    !gate.steps?.some(
      (s: Step) => s.uses === policyAction && s.with?.mode === "gate",
    )
  )
    throw new BadRequestException("Keep the Preflyt final verification step");
}
