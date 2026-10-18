import { expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  containerScanSetup,
  requireContainerSelection,
} from "../src/assessments/container-scan-setup.js";
import {
  standalonePrWorkflow,
  standaloneWorkflowPath,
} from "../src/assessments/standalone-pr-workflow.js";
import { ciSetupContext } from "../src/assessments/preflyt-ci-setup.js";
import type { RepositorySnapshot } from "../src/github/repository-profile.js";
const rules = [
  { id: "containers.scan", title: "Container scanning", required: true },
];
const api = "https://preflyt.example";
const source = (files: Record<string, string>): RepositorySnapshot => ({
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  branch: "development",
  fullName: "fixture/app",
  complete: true,
  warnings: [],
  files: Object.entries(files).map(([path, content]) => ({
    path,
    content,
    size: content.length,
    sha: "c".repeat(40),
  })),
});
it.each(["Dockerfile", "api/Dockerfile.production", "docker/api.Dockerfile"])(
  "automatically builds the only detected %s with a PR-bound image tag",
  (path) => {
    const draft = standalonePrWorkflow(
      source({ [path]: "FROM node:22" }),
      rules,
      api,
    );
    expect(draft.containerScan).toMatchObject({
      dockerfile: path,
      needsSelection: false,
    });
    const job = parse(draft.workflow).jobs.preflyt_checks;
    expect(job.env.CONTAINER_IMAGE).toBe(
      "preflyt-pr:${{ github.event.pull_request.head.sha }}",
    );
    expect(
      job.steps.find(
        (step: any) => step.name === "Build the image for container scanning",
      ),
    ).toMatchObject({
      "working-directory": ".",
      env: {
        PREFLYT_DOCKERFILE: path,
        PREFLYT_BUILD_CONTEXT: draft.containerScan!.buildContext,
      },
      run: 'docker build --file "$PREFLYT_DOCKERFILE" --tag "$CONTAINER_IMAGE" "$PREFLYT_BUILD_CONTEXT"',
    });
    expect(draft.workflow).not.toMatch(
      /docker push|build-push-action|services:/,
    );
  },
);
it("offers all detected Dockerfiles and generates only the user's selected build", () => {
  const snapshot = source({
    "api/Dockerfile": "",
    "web/Dockerfile.production": "",
    "docs/notDockerfile": "",
  });
  const initial = standalonePrWorkflow(snapshot, rules, api);
  expect(initial.containerScan).toEqual({
    dockerfiles: ["api/Dockerfile", "web/Dockerfile.production"],
    dockerfile: null,
    buildContext: null,
    needsSelection: true,
  });
  expect(() => requireContainerSelection(initial.containerScan)).toThrow(
    "Choose a Dockerfile",
  );
  const chosen = standalonePrWorkflow(
    snapshot,
    rules,
    api,
    undefined,
    "api/Dockerfile",
  );
  expect(chosen.containerScan).toMatchObject({
    dockerfile: "api/Dockerfile",
    buildContext: "api",
    needsSelection: false,
  });
  expect(chosen.workflow).toContain("PREFLYT_DOCKERFILE: api/Dockerfile");
  expect(chosen.workflow).not.toContain("web/Dockerfile.production");
  expect(chosen.inputHash).not.toBe(
    standalonePrWorkflow(
      snapshot,
      rules,
      api,
      undefined,
      "web/Dockerfile.production",
    ).inputHash,
  );
});
it("reuses a verified literal build context from CI without copying publishing or other setup", () => {
  const snapshot = source({
    "docker/Dockerfile": "COPY apps/api /app",
    ".github/workflows/build.yml": stringify({
      name: "Build",
      jobs: {
        deploy: {
          steps: [
            {
              uses: "docker/build-push-action@v6",
              with: { file: "./docker/Dockerfile", context: ".", push: true },
            },
          ],
        },
      },
    }),
  });
  const draft = standalonePrWorkflow(snapshot, rules, api);
  expect(draft.containerScan!.buildContext).toBe(".");
  expect(draft.workflow).toContain("PREFLYT_BUILD_CONTEXT: .");
  expect(draft.workflow).not.toContain("push: true");
});
it.each([
  "../external",
  "https://example.com/repo.git",
  "${{ github.workspace }}",
])("ignores unsupported build context %s", (context) => {
  const snapshot = source({
    "api/Dockerfile": "",
    ".github/workflows/build.yml": stringify({
      jobs: {
        build: {
          steps: [
            {
              uses: "docker/build-push-action@v6",
              with: { file: "api/Dockerfile", context },
            },
          ],
        },
      },
    }),
  });
  expect(containerScanSetup(snapshot, rules)!.buildContext).toBe("api");
});
it("rejects arbitrary paths and selections removed from the inspected commit", () => {
  const snapshot = source({
    "api/Dockerfile": "",
    "../outside/Dockerfile": "",
    "/tmp/Dockerfile": "",
    ".git/Dockerfile": "",
  });
  expect(containerScanSetup(snapshot, rules)!.dockerfiles).toEqual([
    "api/Dockerfile",
  ]);
  for (const path of [
    "web/Dockerfile",
    "../outside/Dockerfile",
    "/tmp/Dockerfile",
    ".git/Dockerfile",
  ])
    expect(() =>
      standalonePrWorkflow(snapshot, rules, api, undefined, path),
    ).toThrow("not found at this commit");
});
it("does not add container setup for an unselected check or a custom scanning command", () => {
  const snapshot = source({ "api/Dockerfile": "" });
  for (const policy of [[], [{ ...rules[0]!, workflowCommand: "./scan.sh" }]]) {
    expect(
      standalonePrWorkflow(snapshot, policy, api).containerScan,
    ).toBeNull();
    expect(() =>
      standalonePrWorkflow(snapshot, policy, api, undefined, "api/Dockerfile"),
    ).toThrow("does not use");
  }
});
it("explains a missing Dockerfile without inventing an image build", () => {
  const draft = standalonePrWorkflow(source({}), rules, api);
  expect(draft.containerScan).toMatchObject({
    dockerfiles: [],
    dockerfile: null,
    needsSelection: false,
  });
  expect(draft.notes.join(" ")).toContain("No Dockerfile was detected");
  expect(draft.workflow).not.toContain("docker build");
});
it("remembers an installed selection and replaces it when the user chooses another app", () => {
  const files = { "api/Dockerfile": "", "web/Dockerfile": "" };
  const installed = standalonePrWorkflow(
    source(files),
    rules,
    api,
    undefined,
    "api/Dockerfile",
  ).workflow;
  const snapshot = source({ ...files, [standaloneWorkflowPath]: installed });
  expect(
    standalonePrWorkflow(snapshot, rules, api).containerScan!.dockerfile,
  ).toBe("api/Dockerfile");
  const updated = standalonePrWorkflow(
    snapshot,
    rules,
    api,
    undefined,
    "web/Dockerfile",
  );
  expect(updated.workflow).toContain("PREFLYT_DOCKERFILE: web/Dockerfile");
  expect(updated.original).toBe(installed);
});
it("keeps every AI choice tied to the selected Dockerfile and refuses unresolved selection", () => {
  const snapshot = source({ "api/Dockerfile": "", "web/Dockerfile": "" });
  expect(() => ciSetupContext(snapshot, rules, api)).toThrow(
    "Choose a Dockerfile",
  );
  const context = ciSetupContext(snapshot, rules, api, "web/Dockerfile");
  for (const choice of context.choices) {
    expect(choice.workflow).toContain("PREFLYT_DOCKERFILE: web/Dockerfile");
    expect(
      context.validate(
        JSON.stringify({
          setupId: choice.setupId,
          summary: "Build the selected app.",
        }),
      ).containerScan!.dockerfile,
    ).toBe("web/Dockerfile");
  }
});

it("retains the selected build path without sharing sensitive Dockerfile content with AI", () => {
  const snapshot = source({
    "api/Dockerfile": "FROM node:22\nENV PASSWORD=do-not-share-this-value",
  });
  const context = ciSetupContext(snapshot, rules, api, "api/Dockerfile");
  expect(context.prompt.user).not.toContain("do-not-share-this-value");
  expect(context.choices[0]!.workflow).toContain(
    "PREFLYT_DOCKERFILE: api/Dockerfile",
  );
});
it("keeps Dockerfile paths literal in the generated shell command", () => {
  const path = "apps/space and $(not-executed)/Dockerfile";
  const draft = standalonePrWorkflow(source({ [path]: "" }), rules, api);
  const step = parse(draft.workflow).jobs.preflyt_checks.steps.find(
    (s: any) => s.name === "Build the image for container scanning",
  );
  expect(step.env.PREFLYT_DOCKERFILE).toBe(path);
  expect(step.run).not.toContain("not-executed");
  expect(step.run).toContain('"$PREFLYT_DOCKERFILE"');
});
