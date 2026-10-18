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
import { containerScanSetup } from "./container-scan-setup.js";
import {
  matchesTestTarget,
  workflowSetupTargets,
  type SetupTarget,
} from "./workflow-setup-requirements.js";
import {
  readWorkflow,
  validateSetupWorkflow,
  type WorkflowRule,
} from "./pipeline-workflow.js";

export const standaloneWorkflowPath = ".github/workflows/preflyt.yml";
/** Reuse a configured report path; otherwise use the selected test project's conventional LCOV output. */
export function coverageReportPath(
  snapshot: RepositorySnapshot,
  rules: WorkflowRule[],
) {
  for (const file of snapshot.files) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.path) || !file.content)
      continue;
    try {
      const steps = Object.values(
        readWorkflow(file.content).value.jobs,
      ).flatMap((job) => job.steps ?? []);
      const path = steps.find(
        (step: any) =>
          isPolicyAction(step.uses) &&
          typeof step.with?.["coverage-report"] === "string",
      )?.with?.["coverage-report"];
      if (
        typeof path === "string" &&
        /^[a-zA-Z0-9_./-]+$/.test(path) &&
        !path.startsWith("/") &&
        !path.split("/").includes("..")
      )
        return path;
    } catch {
      /* Other workflows may be outside the supported editing subset. */
    }
  }
  const tests = workflowSetupTargets(rules, snapshot).filter(
    (target) => target.tests,
  );
  return posix.join(
    tests.length === 1 ? tests[0]!.directory : ".",
    "coverage/lcov.info",
  );
}
const checkout = {
  uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  with: {
    ref: "${{ github.event.pull_request.head.sha || github.sha }}",
    "persist-credentials": false,
  },
};
const sameRepository =
  "${{ github.event_name == 'push' || (github.event.pull_request.head.repo.full_name == github.repository && !github.event.pull_request.draft) }}";
type Step = Record<string, any>;
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const projectCheck =
  /(?:\b(?:npm|pnpm|yarn)(?:\s+run)?\s+(?:test|lint|typecheck|check|build)\b|\b(?:pytest|vitest|jest|go test|cargo test)\b)/;
// Repository setup is proposed as text only. It is never executed by the API.
const deployStep =
  /configure-aws-credentials|amazon-ecr-login|build-push-action|\baws\s|\b(?:deploy|publish)\b|docker\s+(?:push|login)|--push\b/i;

/** Reuse an existing verification job's prerequisites, not its tests or deployments. */
function verificationSetups(
  snapshot: RepositorySnapshot,
  targets: SetupTarget[],
) {
  const candidates: {
    steps: Step[];
    env: unknown;
    defaults: unknown;
    services: unknown;
    directory: string;
    source: string;
  }[] = [];
  const tests = targets.filter((target) => target.tests);
  if (!tests.length) return candidates;
  if (targets.some((target) => target.directory !== tests[0]!.directory))
    return candidates;
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
      const defaults = job.defaults ?? value.defaults;
      const matched = tests.map((target) =>
        job.steps.findIndex(
          (step: Step) =>
            typeof step.run === "string" &&
            matchesTestTarget(
              target,
              step.run,
              step["working-directory"] ??
                defaults?.run?.["working-directory"] ??
                ".",
            ),
        ),
      );
      // Do not combine unrelated test jobs or assume an earlier check is setup.
      if (matched.some((index) => index < 0) || new Set(matched).size !== 1)
        continue;
      const end = Math.min(...matched);
      const steps: Step[] = job.steps.slice(0, end);
      if (
        steps.some(
          (step) => typeof step.run === "string" && projectCheck.test(step.run),
        )
      )
        continue;
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
      });
    }
  }
  // Identical commands can be used by unit and integration jobs with different
  // env/services. Do not guess that the largest job is the selected test setup.
  const signatures = new Set(
    candidates.map(({ steps, env, defaults, services }) =>
      digest({ steps, env, defaults, services }),
    ),
  );
  return signatures.size > 1
    ? []
    : candidates.sort((a, b) => a.source.localeCompare(b.source));
}

export function standaloneSetupSources(
  snapshot: RepositorySnapshot,
  rules: WorkflowRule[],
) {
  return verificationSetups(snapshot, workflowSetupTargets(rules, snapshot))
    .map((setup) => setup.source)
    .slice(0, 8);
}

function manifestSetup(
  snapshot: RepositorySnapshot,
  notes: string[],
  targets: SetupTarget[],
) {
  const steps: Step[] = [checkout];
  if (!targets.length) return steps;
  const allPackages = snapshot.files.filter(
    (f) => /(^|\/)package\.json$/.test(f.path) && f.content,
  );
  // Built-in project recipes execute at the root. Explicit commands may select
  // another package; only that package (or its workspace install root) is set up.
  const nodeTargets = targets.filter((target) => target.runtime === "node");
  const packages = [
    ...new Set(
      nodeTargets.flatMap((target) => {
        const file = allPackages.find(
          (item) => item.path === posix.join(target.directory, "package.json"),
        );
        if (!file) {
          notes.push(
            `No package.json was found in ${target.directory} for ${target.title}. Review its Workflow command in Standards and dependency setup in the YAML.`,
          );
          return [];
        }
        const parents = allPackages.filter(
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
        );
        return [
          parents.sort((a, b) => a.path.length - b.path.length)[0] ?? file,
        ];
      }),
    ),
  ];
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
  const pythonDirectories = targets
    .filter((target) => target.runtime === "python")
    .map((target) => target.directory);
  if (
    snapshot.files.some(
      (f) =>
        pythonDirectories.includes(posix.dirname(f.path)) &&
        /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/.test(f.path),
    )
  ) {
    steps.push({
      name: "Set up Python",
      uses: "actions/setup-python@v5",
      with: { "python-version": "3.x" },
    });
    const requirements = snapshot.files.filter(
      (f) =>
        /(^|\/)requirements\.txt$/.test(f.path) &&
        pythonDirectories.includes(posix.dirname(f.path)),
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
  const modules = snapshot.files.filter(
    (f) =>
      /(^|\/)go\.mod$/.test(f.path) &&
      targets.some(
        (target) =>
          target.runtime === "go" && target.directory === posix.dirname(f.path),
      ),
  );
  for (const module of modules) {
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
  for (const target of targets.filter(
    (target) =>
      target.runtime === "unknown" && target.command !== "default-tests",
  ))
    notes.push(
      `Setup for ${target.title} could not be determined from its Workflow command. Review its runtime, dependencies and any required services in the YAML. No unrelated test infrastructure was copied.`,
    );
  return steps;
}

export function standalonePrWorkflow(
  snapshot: RepositorySnapshot,
  rules: WorkflowRule[],
  apiUrl: string | null,
  setupSource?: string,
  dockerfile?: string,
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
    !/^# Preflyt pull request(?: and branch)? workflow\n/.test(previous.content)
  )
    throw new ConflictException(
      `${standaloneWorkflowPath} already exists and is not managed by this setup. Rename it or review it manually before installing.`,
    );
  const targets = workflowSetupTargets(rules, snapshot);
  const setups = verificationSetups(snapshot, targets);
  const setup = setupSource
    ? setups.find((item) => item.source === setupSource)
    : setups[0];
  if (setupSource && !setup)
    throw new BadRequestException(
      "The selected setup is unavailable at this commit",
    );
  const steps =
    setup?.steps.map((step) => ({ ...step })) ??
    manifestSetup(snapshot, notes, targets);
  if (setup)
    notes.push(
      `Test setup copied from ${setup.source} at commit ${snapshot.sourceSha.slice(0, 12)} because its test command and directory match this policy. Review which services, environment values and setup commands those tests need before creating the PR.`,
    );
  else if (targets.some((target) => target.tests))
    notes.push(
      "No reusable test setup matched the selected test commands and directories unambiguously. Review their required services and environment in the YAML before running tests.",
    );
  const rootPython = snapshot.files.some((file) =>
    /^(requirements[^/]*\.txt|pyproject\.toml)$/.test(file.path),
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
        ) &&
        !r.workflowCommand &&
        (r.id !== "tests.required" || !rootPython),
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
    targets.some(
      (target) =>
        target.runtime === "unknown" ||
        (target.command === "default-tests" &&
          target.runtime === "python" &&
          !rootPython),
    ) &&
    !setup
  )
    notes.push(
      "Additional project runtimes were found. Add their setup and dependency commands in the YAML before the policy checks.",
    );
  const env = { ...(object(setup?.env) ? setup.env : {}) };
  const containerScan = containerScanSetup(snapshot, rules, dockerfile);
  if (containerScan) {
    if (containerScan.dockerfile) {
      const path = containerScan.dockerfile;
      env.CONTAINER_IMAGE =
        "preflyt-pr:${{ github.event.pull_request.head.sha || github.sha }}";
      steps.push({
        name: "Build the image for container scanning",
        "working-directory": ".",
        env: {
          PREFLYT_DOCKERFILE: path,
          PREFLYT_BUILD_CONTEXT: containerScan.buildContext,
        },
        run: 'docker build --file "$PREFLYT_DOCKERFILE" --tag "$CONTAINER_IMAGE" "$PREFLYT_BUILD_CONTEXT"',
      });
      notes.push(
        `Container scanning builds ${path} on the GitHub Actions runner with build context ${containerScan.buildContext}. The build step and CONTAINER_IMAGE are configured automatically. Review any required build arguments or secrets.`,
      );
    } else
      notes.push(
        containerScan.needsSelection
          ? "Several Dockerfiles were detected. Choose the app's Dockerfile to generate its image build and image tag."
          : "No Dockerfile was detected at this commit. Add a Dockerfile to the repository, or remove Container scanning from this policy. You can also configure a reviewed image build in the YAML.",
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
  notes.push(
    `Checks run on pull requests and pushes to ${snapshot.branch}. Coverage is read from ${coverageReportPath(snapshot, rules)}; the published test command must generate this LCOV file. Health refreshes automatically when the default branch changes.`,
  );
  const url = apiUrl ?? "<PUBLIC_PREFLYT_API_URL>";
  steps.push({
    name: "Run published policy checks",
    uses: policyAction,
    with: {
      "api-url": url,
      "job-name": "Preflyt policy checks",
      "coverage-report": coverageReportPath(snapshot, rules),
    },
  });
  const workflow =
    "# Preflyt pull request and branch workflow\n" +
    `# Preflyt setup policy: ${digest(rules.map(({ id, workflowCommand, reportPath }) => ({ id, workflowCommand, reportPath })).sort((a, b) => a.id.localeCompare(b.id)))}\n` +
    "# Setup changes are reviewed through a PR. Check commands come from the published target-branch policy.\n" +
    stringify(
      {
        name: "Preflyt checks",
        on: {
          push: { branches: [snapshot.branch] },
          pull_request: {
            branches: [snapshot.branch],
            types: ["opened", "synchronize", "reopened", "ready_for_review"],
          },
        },
        concurrency: {
          group:
            "preflyt-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
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
            if: "${{ always() && !cancelled() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && !github.event.pull_request.draft }}",
          },
        },
      },
      { lineWidth: 0 },
    );
  readWorkflow(workflow);
  // Do not retain old test infrastructure after policy commands or setup change.
  // Preserve comments and timeout edits only when the actual setup still matches.
  let proposed = workflow;
  if (previous?.content && apiUrl && !setupSource) {
    try {
      validateStandalonePrWorkflow(
        previous.content,
        rules,
        `refs/heads/${snapshot.branch}`,
        apiUrl,
      );
      const shape = (text: string) => {
        const value = readWorkflow(text).value;
        for (const job of Object.values(value.jobs))
          delete job["timeout-minutes"];
        return digest(value);
      };
      if (
        previous.content.split("\n")[1] !== workflow.split("\n")[1] ||
        shape(previous.content) !== shape(workflow)
      )
        throw new Error("Policy or setup changed");
      proposed = previous.content;
    } catch {
      notes.push(
        "The selected checks or their setup have changed. Review the comparison before replacing the installed Preflyt workflow; previous setup is not carried forward automatically.",
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
    containerScan,
    inputHash: digest({
      sourceSha: snapshot.sourceSha,
      rules,
      apiUrl,
      dockerfile: containerScan?.dockerfile,
    }),
  };
}

/** Keep checks on this policy branch; PR publication runs only for pull requests. */
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
    Object.keys(value.on).sort().join(",") !== "pull_request,push" ||
    !object(value.on.push) ||
    digest(value.on.push) !== digest({ branches: [branch] }) ||
    !object(value.on.pull_request) ||
    digest(value.on.pull_request.branches) !== digest([branch]) ||
    digest(value.on.pull_request.types) !==
      digest(["opened", "synchronize", "reopened", "ready_for_review"]) ||
    value.on.pull_request.paths ||
    value.on.pull_request["paths-ignore"] ||
    value.on.pull_request["branches-ignore"]
  )
    throw new BadRequestException(
      "Keep the pull request and push triggers on the selected target branch",
    );
  const jobs = Object.entries(value.jobs);
  if (value.jobs.preflyt_checks?.if !== sameRepository)
    throw new BadRequestException(
      "Keep branch checks and same-repository PR checks enabled",
    );

  const gates = jobs.filter(([, job]) => job.name === FINAL_GATE_NAME);
  if (gates.length !== 1)
    throw new BadRequestException("Keep one Preflyt final gate job");
  const [gateId, gate] = gates[0]!;
  if (
    gate.if !==
    "${{ always() && !cancelled() && github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && !github.event.pull_request.draft }}"
  )
    throw new BadRequestException(
      "The final gate must run only on same-repository pull requests",
    );

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
        (step.with?.ref !==
          "${{ github.event.pull_request.head.sha || github.sha }}" ||
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
