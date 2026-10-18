import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import type { RepositorySnapshot } from "../src/github/repository-profile.js";
import {
  standalonePrWorkflow,
  standaloneWorkflowPath,
  validateStandalonePrWorkflow,
} from "../src/assessments/standalone-pr-workflow.js";
import { policyAction } from "../src/assessments/pipeline-action.js";

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
      rules,
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
      ref: "${{ github.event.pull_request.head.sha }}",
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
      "commands execute from the repository root",
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
        rules,
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
      "multiple or missing Dockerfiles",
    );
    expect(generated.notes.join(" ")).toContain("Additional project runtimes");
    expect(generated.workflow).not.toContain("docker build");
  });
});
