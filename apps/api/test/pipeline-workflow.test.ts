import { policyAction, isPolicyAction } from "../src/assessments/pipeline-action.js";
import { describe, expect, it } from "vitest";
import {
  addPolicyChecks,
  inspectWorkflow,
  readWorkflow,
  validateRewrite,
  validateSetupWorkflow,
  type WorkflowRule,
} from "../src/assessments/pipeline-workflow.js";
const rules: WorkflowRule[] = [
  { id: "tests.required", title: "Tests", required: true },
  { id: "security.sast", title: "SAST", required: true },
];
const workflow = `# Repository CI
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
permissions:
  contents: read
  packages: write
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Existing tests
        run: npm test
  deploy:
    if: github.event_name == 'push'
    needs: test
    environment: production
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh
`;
const add = (yaml = workflow, ids = rules.map((rule) => rule.id)) =>
  addPolicyChecks(yaml, "test", rules, ids, "https://api.preflyt.example")
    .workflow;
describe("workflow YAML editor", () => {
  it("adds inline policy checks while retaining jobs, comments, triggers and inherited write permissions", () => {
    const result = add();
    const before = readWorkflow(workflow).value,
      after = readWorkflow(result).value;
    expect(result).toContain("# Repository CI");
    expect(after.on).toEqual(before.on);
    expect(after.jobs.deploy).toEqual(before.jobs.deploy);
    expect(after.jobs.test.steps[1]).toEqual(before.jobs.test.steps[1]);
    expect(after.jobs.test.permissions).toMatchObject({
      contents: "read",
      packages: "write",
      "id-token": "write",
    });
    expect(inspectWorkflow(result, rules, "refs/heads/main").checkIds).toEqual(
      rules.map((rule) => rule.id),
    );
    expect(
      inspectWorkflow(result, rules, "refs/heads/main").warnings.join(" "),
    ).not.toContain("branch filters");
    expect(() => validateSetupWorkflow(result, rules)).not.toThrow();
  });
  it("updates the same policy step on repeated additions without duplicating it or losing proof mappings", () => {
    let result = add(workflow, ["tests.required"]);
    const doc = readWorkflow(result).document;
    doc.setIn(
      ["jobs", "test", "steps", 2, "with", "proofs"],
      '{"tests.xml":"proof.json"}',
    );
    result = add(doc.toString(), ["security.sast"]);
    const steps = readWorkflow(result).value.jobs.test.steps;
    expect(
      steps.filter((s: any) => s.uses === policyAction),
    ).toHaveLength(1);
    expect(steps[2].with.proofs).toContain("proof.json");
  });
  it("rejects unknown checks, non-step jobs, invalid YAML and dangerous alias expansion", () => {
    expect(() => add(workflow, ["unapproved"])).toThrow();
    expect(() =>
      addPolicyChecks(
        workflow,
        "missing",
        rules,
        ["tests.required"],
        "https://api.preflyt.example",
      ),
    ).toThrow();
    expect(() => readWorkflow("jobs: [")).toThrow("Invalid workflow YAML");
    expect(() => readWorkflow("jobs:\n  test: {steps: [bad]}")).toThrow();
  });
  it("rejects incomplete configuration and URLs unusable by GitHub before a setup PR is created", () => {
    expect(() =>
      validateSetupWorkflow(add(workflow, ["tests.required"]), rules),
    ).toThrow();
    expect(() =>
      validateSetupWorkflow(
        add().replace("https://api.preflyt.example", "http://localhost:3000"),
        rules,
      ),
    ).toThrow("HTTPS");
  });
  it("explains missing PR triggers without changing deployment events automatically", () => {
    const pushOnly = workflow.replace(
      "  pull_request:\n    branches: [main]\n",
      "",
    );
    const result = add(pushOnly);
    expect(readWorkflow(result).value.on).toEqual(
      readWorkflow(pushOnly).value.on,
    );
    expect(
      inspectWorkflow(result, rules, "refs/heads/main").warnings[0],
    ).toContain("pull requests");
  });
  it("accepts an AI addition but rejects removed steps, deployment condition changes and replaced triggers", () => {
    const result = add();
    const response = (yaml: string) =>
      JSON.stringify({ workflow: yaml, summary: "Added policy result step" });
    expect(validateRewrite(response(result), workflow).workflow).toBe(result);
    expect(() =>
      validateRewrite(
        response(result.replace("npm test", "echo success")),
        workflow,
      ),
    ).toThrow("existing workflow step");
    expect(() =>
      validateRewrite(
        response(result.replace("github.event_name == 'push'", "always()")),
        workflow,
      ),
    ).toThrow("job behavior");
    expect(() =>
      validateRewrite(
        response((() => { const doc = readWorkflow(result).document; doc.setIn(["on", "pull_request", "branches"], ["other"]); return doc.toString(); })()),
        workflow,
      ),
    ).toThrow("triggers");
  });
  it("rejects a provider credential in AI output", () => {
    expect(() =>
      validateRewrite(
        JSON.stringify({ workflow: add(), summary: "credential-fixture" }),
        workflow,
        "credential-fixture",
      ),
    ).toThrow("Unsafe");
  });
  it("accepts a single JSON code fence without weakening workflow preservation", () => {
    const response = (yaml: string) =>
      "```json\n" +
      JSON.stringify({ workflow: yaml, summary: "Added policy checks" }) +
      "\n```";
    expect(validateRewrite(response(add()), workflow).workflow).toBe(add());
    expect(() =>
      validateRewrite(
        response(add().replace("./deploy.sh", "echo done")),
        workflow,
      ),
    ).toThrow("existing workflow step");
  });
  it("rejects partial JSON, commentary and invalid response shapes", () => {
    const valid = JSON.stringify({
      workflow: add(),
      summary: "Added policy checks",
    });
    for (const raw of [
      valid.slice(0, -2),
      "Here is your workflow:\n" + valid,
      "null",
      "[]",
      JSON.stringify({ workflow: add(), summary: "Added", extra: true }),
    ]) {
      expect(() => validateRewrite(raw, workflow)).toThrow(
        "Invalid model response",
      );
    }
  });
});

it("upgrades a local Action and its built-in recipe while preserving custom inputs", () => {
  const generated = add(workflow, ["tests.required"]);
  const doc = readWorkflow(generated).document;
  doc.setIn(["jobs", "test", "steps", 2, "uses"], "./.github/actions/preflyt-policy");
  doc.setIn(["jobs", "test", "steps", 2, "with", "checks"], JSON.stringify({
    "tests.required": { report: "reports/tests.xml", argv: ["python3", ".github/actions/preflyt-policy/recipes.py", "tests.required", "reports/tests.xml"] },
  }));
  doc.setIn(["jobs", "test", "steps", 2, "with", "proofs"], "{}");
  const upgraded = readWorkflow(add(doc.toString(), ["security.sast"])).value.jobs.test.steps;
  expect(upgraded.filter((step: any) => isPolicyAction(step.uses))).toHaveLength(1);
  expect(upgraded[2].uses).toBe(policyAction);
  expect(upgraded[2].with.proofs).toBe("{}");
  expect(JSON.parse(upgraded[2].with.checks)["tests.required"]).toEqual({
    report: "reports/tests.xml", argv: ["preflyt-recipe", "tests.required", "reports/tests.xml"],
  });
  expect(isPolicyAction("other/preflyt-action@v1.0.0")).toBe(false);
  expect(isPolicyAction("lyrisoft/preflyt-action@main")).toBe(false);
});
