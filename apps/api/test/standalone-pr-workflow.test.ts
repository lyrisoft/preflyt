import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import type { RepositorySnapshot } from "../src/github/repository-profile.js";
import {
  standalonePrWorkflow,
  standaloneWorkflowPath,
  validateStandalonePrWorkflow,
} from "../src/assessments/standalone-pr-workflow.js";
import { policyAction } from "../src/assessments/pipeline-action.js";
import type { WorkflowRule } from "../src/assessments/pipeline-workflow.js";

const rules = [
  { id: "tests.required", title: "Unit tests", required: true },
  { id: "containers.scan", title: "Container scan", required: true },
];
const api = "https://preflyt.example/api";
function source(contents: Record<string, string>): RepositorySnapshot {
  return {
    sourceSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    branch: "development",
    fullName: "fixture/app",
    complete: true,
    warnings: [],
    files: Object.entries(contents).map(([path, content]) => ({
      path,
      content,
      size: Buffer.byteLength(content),
      sha: "c".repeat(40),
    })),
  };
}
const verification = stringify({
  name: "Verify",
  on: { workflow_call: null },
  defaults: { run: { shell: "bash" } },
  jobs: {
    test: {
      "runs-on": "ubuntu-latest",
      services: {
        postgres: {
          image: "postgres:16",
          env: { POSTGRES_PASSWORD: "fixture-only" },
        },
      },
      steps: [
        { uses: "actions/checkout@v6" },
        { uses: "actions/setup-node@v4", with: { "node-version": "22" } },
        { name: "Install", "working-directory": "api", run: "npm ci" },
        {
          name: "Migrate",
          "working-directory": "api",
          run: "npm run prisma:apply",
        },
        { name: "Test", "working-directory": "api", run: "npm test" },
        {
          name: "Deploy",
          run: "aws ecs update-service --force-new-deployment",
        },
      ],
    },
  },
});

describe("standalone PR workflow generation", () => {
  it("creates a complete target-branch workflow without requiring any existing workflow", () => {
    const generated = standalonePrWorkflow(
      source({
        "package.json": '{"engines":{"node":"22"}}',
        "package-lock.json": "{}",
      }),
      rules,
      api,
    );
    const yaml = parse(generated.workflow);
    expect(generated.path).toBe(standaloneWorkflowPath);
    expect(generated.exists).toBe(false);
    expect(yaml.on).toEqual({
      push: {branches: ["development"]},
      pull_request: {
        branches: ["development"],
        types: ["opened", "synchronize", "reopened", "ready_for_review"],
      },
    });
    expect(yaml.concurrency["cancel-in-progress"]).toBe(true);
    expect(yaml.jobs.preflyt_checks.permissions).toEqual({
      contents: "read",
      "id-token": "write",
    });
    expect(yaml.jobs.preflyt_checks.steps).toContainEqual({
      name: "Install dependencies (.)",
      "working-directory": ".",
      run: "npm ci",
    });
    expect(
      yaml.jobs.preflyt_checks.steps.find((s: any) => s.uses === policyAction)
        .with["job-name"],
    ).toBe("Preflyt policy checks");
    expect(yaml.jobs.preflyt_gate.needs).toEqual(["preflyt_checks"]);
    expect(() =>
      validateStandalonePrWorkflow(
        generated.workflow,
        rules,
        "refs/heads/development",
        api,
      ),
    ).not.toThrow();
  });
  it("copies real test prerequisites and services but excludes tests and deployment commands", () => {
    const generated = standalonePrWorkflow(
      source({
        ".github/workflows/merge-verify.yml": verification,
        "api/Dockerfile": "FROM node:22",
        "api/package.json": "{}",
        "api/package-lock.json": "{}",
      }),
      [{ ...rules[0]!, workflowCommand: "cd api && npm test" }, rules[1]!],
      api,
    );
    const job = parse(generated.workflow).jobs.preflyt_checks;
    expect(job.services.postgres.image).toBe("postgres:16");
    expect(job.defaults.run.shell).toBe("bash");
    expect(job.steps).toContainEqual({
      name: "Migrate",
      "working-directory": "api",
      run: "npm run prisma:apply",
    });
    expect(
      job.steps.some((s: any) => s.run === "npm test" || s.name === "Deploy"),
    ).toBe(false);
    expect(job.steps[0].with).toMatchObject({
      ref: "${{ github.event.pull_request.head.sha || github.sha }}",
      "persist-credentials": false,
    });
    expect(
      job.steps.find(
        (s: any) => s.name === "Build the image for container scanning",
      ),
    ).toMatchObject({
      "working-directory": ".",
      env: {
        PREFLYT_DOCKERFILE: "api/Dockerfile",
        PREFLYT_BUILD_CONTEXT: "api",
      },
    });
    expect(job.env.CONTAINER_IMAGE).toContain(
      "github.event.pull_request.head.sha",
    );
    expect(generated.setupSources).toEqual([
      ".github/workflows/merge-verify.yml → test",
    ]);
    expect(generated.notes.join(" ")).toContain(
      "test command and directory match",
    );
  });
  it("does not copy setup that requires deployment credentials or unresolved job inputs", () => {
    for (const unsafe of [
      verification.replace("npm ci", "aws sts get-caller-identity"),
      verification.replace(
        "npm ci",
        'echo "${{ needs.prepare.outputs.directory }}"',
      ),
    ]) {
      const generated = standalonePrWorkflow(
        source({ ".github/workflows/verify.yml": unsafe }),
        [{ ...rules[0]!, workflowCommand: "cd api && npm test" }],
        api,
      );
      expect(generated.setupSources).toEqual([]);
      expect(generated.workflow).not.toContain("aws sts");
      expect(generated.workflow).not.toContain("needs.prepare");
      expect(generated.notes.join(" ")).toContain("No reusable test setup");
    }
  });
  it("does not overwrite an unrelated workflow at the installation path", () => {
    expect(() =>
      standalonePrWorkflow(
        source({ [standaloneWorkflowPath]: "name: Customer CI\njobs: {}" }),
        rules,
        api,
      ),
    ).toThrow("not managed");
  });
  it("preserves reviewed setup in a valid installed Preflyt workflow", () => {
    const original = standalonePrWorkflow(
      source({}),
      rules,
      api,
    ).workflow.replace("timeout-minutes: 45", "timeout-minutes: 50");
    const generated = standalonePrWorkflow(
      source({ [standaloneWorkflowPath]: original }),
      rules,
      api,
    );
    expect(generated.workflow).toBe(original);
    expect(generated.original).toBe(original);
    expect(generated.exists).toBe(true);
  });
  it("rejects a changed branch, deployment trigger, API address, checkout or missing gate dependency", () => {
    const base = standalonePrWorkflow(source({}), rules, api).workflow;
    for (const alter of [
      (v: any) => {
        v.on.pull_request.branches = ["main"];
      },
      (v: any) => {
        v.on.push = {};
      },
      (v: any) => {
        v.jobs.preflyt_gate.needs = [];
      },
      (v: any) => {
        v.jobs.preflyt_checks.steps[0].with.ref = "main";
      },
      (v: any) => {
        v.jobs.preflyt_checks.steps.at(-1).with["api-url"] =
          "https://wrong.example";
      },
      (v: any) => {
        v.jobs.preflyt_checks.permissions.contents = "write";
      },
    ]) {
      const yaml = parse(base);
      alter(yaml);
      expect(() =>
        validateStandalonePrWorkflow(
          stringify(yaml),
          rules,
          "refs/heads/development",
          api,
        ),
      ).toThrow();
    }
  });
  it("flags ambiguous image builds and unsupported project setup instead of inventing configuration", () => {
    const generated = standalonePrWorkflow(
      source({
        "api/Dockerfile": "",
        "worker/Dockerfile": "",
        "Cargo.toml": "",
      }),
      rules,
      api,
    );
    expect(generated.notes.join(" ")).toContain(
      "Several Dockerfiles were detected",
    );
    expect(generated.notes.join(" ")).toContain("Additional project runtimes");
    expect(generated.workflow).not.toContain("docker build");
  });
});

const staticIds = [
  "security.sast",
  "secrets.scan",
  "security.dependencies",
  "iac.policy",
  "iac.exposures",
  "containers.scan",
  "lint.required",
  "types.required",
  "build.required",
];
const infrastructure = () => {
  const workflow = parse(verification);
  workflow.env = { DATABASE_URL: "${{ secrets.TEST_DATABASE_URL }}" };
  workflow.jobs.test.steps.splice(
    2,
    0,
    {
      name: "Start infra",
      run: "docker compose -f docker-compose.infra.yml up -d --wait postgres valkey neo4j clickhouse",
    },
    { name: "Compose test environment", run: "cp .env.example .env" },
    { name: "Seed RBAC", "working-directory": "api", run: "npm run seed:rbac" },
  );
  return stringify(workflow);
};
const projectFiles = () => ({
  ".github/workflows/merge-verify.yml": infrastructure(),
  "package.json": '{"engines":{"node":"22"}}',
  "package-lock.json": "{}",
  "api/package.json": "{}",
  "api/package-lock.json": "{}",
  "web/package.json": "{}",
  "web/package-lock.json": "{}",
  "requirements.txt": "pytest",
  "go.mod": "module fixture",
});
const selected = (id: string, workflowCommand?: string): WorkflowRule[] => [
  {
    id,
    title: id,
    required: true,
    ...(workflowCommand ? { workflowCommand } : {}),
  },
];

it.each(staticIds)(
  "omits test infrastructure for selected %s, including Compose and environment setup",
  (id) => {
    const generated = standalonePrWorkflow(
      source(projectFiles()),
      selected(id),
      api,
    );
    const job = parse(generated.workflow).jobs.preflyt_checks;
    expect(job.services).toBeUndefined();
    expect(job.defaults).toBeUndefined();
    expect(generated.workflow).not.toMatch(
      /postgres|valkey|neo4j|clickhouse|DATABASE_URL|\.env|prisma:apply|seed:rbac|setup-python|setup-go/,
    );
    expect(generated.setupSources).toEqual([]);
    const installs = job.steps.filter((step: any) => step.run === "npm ci");
    expect(installs.map((step: any) => step["working-directory"])).toEqual(
      ["lint.required", "types.required", "build.required"].includes(id)
        ? ["."]
        : [],
    );
    if (!["lint.required", "types.required", "build.required"].includes(id))
      expect(job.steps).toHaveLength(2); // Checkout and policy runner; image ambiguity is a review note.
  },
);
it("matches selected package and test script rather than borrowing a broader integration setup", () => {
  const workflow = parse(infrastructure());
  workflow.jobs.test.env = workflow.env;
  delete workflow.env;
  workflow.jobs.unit = {
    "runs-on": "ubuntu-latest",
    defaults: { run: { "working-directory": "api" } },
    steps: [
      { uses: "actions/checkout@v4" },
      { run: "npm ci" },
      { run: "npm run test:unit" },
    ],
  };
  const files = {
    ...projectFiles(),
    ".github/workflows/merge-verify.yml": stringify(workflow),
  };
  const generated = standalonePrWorkflow(
    source(files),
    selected("tests.required", "npm --prefix api run test:unit"),
    api,
  );
  expect(generated.setupSources).toEqual([
    ".github/workflows/merge-verify.yml → unit",
  ]);
  expect(generated.workflow).not.toMatch(
    /postgres|docker compose|DATABASE_URL|prisma:apply|seed:rbac/,
  );
  expect(generated.workflow).not.toContain("run: npm run test:unit");
});
it("does not mistake nested tests or integration scripts for the default root test recipe", () => {
  const generated = standalonePrWorkflow(
    source(projectFiles()),
    selected("tests.required"),
    api,
  );
  expect(generated.setupSources).toEqual([]);
  expect(generated.workflow).not.toContain("postgres");
  expect(generated.notes.join(" ")).toContain("No reusable test setup matched");
  const other = standalonePrWorkflow(
    source(projectFiles()),
    selected("tests.required", "cd api && npm run test:unit"),
    api,
  );
  expect(other.setupSources).toEqual([]);
  expect(other.workflow).not.toContain("postgres");
});
it("scopes fallback installation to the explicit package, or its workspace install root", () => {
  const files = projectFiles();
  const command = selected("lint.required", "cd api && npm run lint");
  const draft = standalonePrWorkflow(source(files), command, api);
  const directories = (workflow: string) =>
    parse(workflow)
      .jobs.preflyt_checks.steps.filter((s: any) => s.run === "npm ci")
      .map((s: any) => s["working-directory"]);
  expect(directories(draft.workflow)).toEqual(["api"]);
  files["package.json"] = '{"workspaces":["api","web"]}';
  expect(
    directories(standalonePrWorkflow(source(files), command, api).workflow),
  ).toEqual(["."]);
});
it("uses the actual override command to choose setup rather than the check title or report format", () => {
  const generated = standalonePrWorkflow(
    source(projectFiles()),
    selected("tests.required", "cd api && npm run lint"),
    api,
  );
  expect(generated.workflow).not.toContain("postgres");
  expect(generated.notes.join(" ")).not.toContain("No reusable test setup");
  const custom = standalonePrWorkflow(
    source(projectFiles()),
    selected(
      "custom-junit-12345678-1234-4123-8123-123456789abc",
      "./scripts/verify.sh",
    ),
    api,
  );
  expect(custom.workflow).not.toContain("postgres");
  expect(custom.notes.join(" ")).toContain("could not be determined");
  const unknown = standalonePrWorkflow(
    source(projectFiles()),
    selected("tests.required", "./scripts/verify.sh"),
    api,
  );
  expect(unknown.notes.join(" ")).toContain("could not be determined");
  expect(unknown.workflow).not.toContain("npm ci");
});
it("does not add a local image build when container scanning uses an approved command override", () => {
  const generated = standalonePrWorkflow(
    source({ ...projectFiles(), Dockerfile: "FROM node:22" }),
    selected("containers.scan", "./scan-image.sh"),
    api,
  );
  expect(generated.workflow).not.toContain("docker build");
});
it("regenerates installed test setup when checks or commands change, and exposes the original for review", () => {
  const files = projectFiles();
  const tests = selected("tests.required", "cd api && npm test");
  const original = standalonePrWorkflow(source(files), tests, api).workflow;
  expect(original).toContain("postgres");
  for (const policy of [
    selected("security.sast"),
    selected("tests.required", "cd api && npm run test:unit"),
  ]) {
    const generated = standalonePrWorkflow(
      source({ ...files, [standaloneWorkflowPath]: original }),
      policy,
      api,
    );
    expect(generated.original).toBe(original);
    expect(generated.workflow).not.toMatch(
      /postgres|prisma:apply|seed:rbac|DATABASE_URL/,
    );
    expect(generated.notes.join(" ")).toContain("setup have changed");
  }
});
it("does not preserve extra infrastructure under an unchanged policy stamp or in legacy installed workflows", () => {
  const policy = selected("security.sast");
  const original = standalonePrWorkflow(source({}), policy, api).workflow;
  const yaml = parse(original);
  yaml.jobs.preflyt_checks.services = { postgres: { image: "postgres:16" } };
  for (const installed of [
    original.split("\n").slice(0, 2).join("\n") + "\n" + stringify(yaml),
    original.replace(/^# Preflyt setup policy:.*\n/m, ""),
  ]) {
    const generated = standalonePrWorkflow(
      source({ [standaloneWorkflowPath]: installed }),
      policy,
      api,
    );
    expect(generated.workflow).toBe(original);
    expect(generated.notes.join(" ")).toContain("setup have changed");
  }
});

it("does not guess between different environments for the same test command", () => {
  const workflow = parse(verification);
  workflow.jobs.unit = {
    ...workflow.jobs.test,
    services: undefined,
    steps: [
      { uses: "actions/checkout@v4" },
      { run: "npm ci", "working-directory": "api" },
      { run: "npm test", "working-directory": "api" },
    ],
  };
  const draft = standalonePrWorkflow(
    source({
      ...projectFiles(),
      ".github/workflows/merge-verify.yml": stringify(workflow),
    }),
    selected("tests.required", "cd api && npm test"),
    api,
  );
  expect(draft.setupSources).toEqual([]);
  expect(draft.workflow).not.toContain("postgres");
  expect(draft.notes.join(" ")).toContain("unambiguously");
});
it("does not reuse a partial setup across different selected packages or test commands", () => {
  const policy = [
    ...selected("tests.required", "cd api && npm test"),
    ...selected("lint.required", "cd web && npm run lint"),
  ];
  const draft = standalonePrWorkflow(source(projectFiles()), policy, api);
  expect(draft.setupSources).toEqual([]);
  expect(draft.workflow).not.toContain("postgres");
  expect(
    parse(draft.workflow)
      .jobs.preflyt_checks.steps.filter((s: any) => s.run === "npm ci")
      .map((s: any) => s["working-directory"]),
  ).toEqual(["api", "web"]);
});
it("selecting a CI setup explicitly cannot bypass static-check filtering", () => {
  expect(() =>
    standalonePrWorkflow(
      source(projectFiles()),
      selected("security.sast"),
      api,
      ".github/workflows/merge-verify.yml → test",
    ),
  ).toThrow("unavailable");
});

it("does not borrow Python test infrastructure for the built-in Node test recipe", () => {
  const workflow = stringify({
    name: "Python checks",
    on: "pull_request",
    jobs: {
      python: {
        "runs-on": "ubuntu-latest",
        services: { postgres: { image: "postgres:16" } },
        steps: [{ uses: "actions/checkout@v4" }, { run: "pytest" }],
      },
    },
  });
  const draft = standalonePrWorkflow(
    source({ ...projectFiles(), ".github/workflows/python.yml": workflow }),
    selected("tests.required"),
    api,
  );
  expect(draft.setupSources).toEqual([]);
  expect(draft.workflow).not.toContain("postgres");
});
it("sets up only Python or Go when that runtime is selected by a project command", () => {
  for (const [command, runtime, excluded] of [
    ["pytest", "setup-python", "setup-node"],
    ["go test ./...", "setup-go", "setup-python"],
  ]) {
    const draft = standalonePrWorkflow(
      source(projectFiles()),
      selected("tests.required", command),
      api,
    );
    expect(draft.workflow).toContain(runtime);
    expect(draft.workflow).not.toContain(excluded);
    expect(draft.workflow).not.toContain("postgres");
  }
});

it("does not ask for unrelated runtime setup just because another language exists in the repository", () => {
  const draft = standalonePrWorkflow(
    source({ ...projectFiles(), "Cargo.toml": "[package]" }),
    selected("lint.required"),
    api,
  );
  expect(draft.notes.join(" ")).not.toContain("Additional project runtimes");
  const python = standalonePrWorkflow(
    source({ "requirements.txt": "pytest", "api/package.json": "{}" }),
    selected("tests.required"),
    api,
  );
  expect(python.notes.join(" ")).not.toContain(
    "commands execute from the repository root",
  );
});

it('preserves a configured coverage report path and rejects branch publication edits',()=>{
  const configured=source({'.github/workflows/ci.yml':stringify({on:{pull_request:null},jobs:{checks:{'runs-on':'ubuntu-latest',steps:[{uses:policyAction,with:{'coverage-report':'api/TestResults/coverage.info'}}]}}})});
  const generated=standalonePrWorkflow(configured,[],api),yaml=parse(generated.workflow);
  expect(yaml.jobs.preflyt_checks.steps.find((s:any)=>s.uses===policyAction).with['coverage-report']).toBe('api/TestResults/coverage.info');
  yaml.jobs.preflyt_gate.if='${{ always() }}';
  expect(()=>validateStandalonePrWorkflow(stringify(yaml),[],'refs/heads/development',api)).toThrow('only on same-repository');
});
