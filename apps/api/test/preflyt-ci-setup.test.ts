import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseSkillMarkdown } from "../src/intelligence/skill-markdown.js";
import { validateSkill } from "../src/intelligence/review-skills.js";
import { preflytCiSetupSkill } from "../src/intelligence/preflyt-ci-setup-skill.js";
import {
  ciSetupContext,
  setupContainsCredentials,
} from "../src/assessments/preflyt-ci-setup.js";
import type { RepositorySnapshot } from "../src/github/repository-profile.js";

const rules = [{ id: "tests.required", title: "Tests", required: true }];
const file = (path: string, content?: string) => ({
  path,
  content,
  size: content?.length ?? 0,
  sha: "b".repeat(40),
});
const snapshot: RepositorySnapshot = {
  branch: "development",
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  fullName: "fixture/app",
  complete: true,
  warnings: [],
  files: [
    file(
      "package.json",
      JSON.stringify({
        packageManager: "pnpm@10.26.2",
        workspaces: ["apps/*"],
        scripts: { test: "pnpm -r test" },
      }),
    ),
    file("pnpm-lock.yaml"),
    file("pnpm-workspace.yaml"),
    file(
      "apps/api/package.json",
      JSON.stringify({
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "4" },
      }),
    ),
    file(
      ".github/workflows/ci.yml",
      `name: CI
on: pull_request
jobs:
  tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: \${{ secrets.TEST_DATABASE_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: {node-version: '24'}
      - run: npm install --global pnpm@10.26.2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
`,
    ),
  ],
};
const build = (source = snapshot) =>
  ciSetupContext(source, rules, "https://preflyt.example");
it("keeps the dedicated versioned skill identical to its inspectable Markdown", () => {
  expect(
    parseSkillMarkdown(
      readFileSync(
        "../../docs/skills/workflow/preflyt-ci-setup/SKILL.md",
        "utf8",
      ),
    ),
  ).toEqual(validateSkill(preflytCiSetupSkill));
  expect(preflytCiSetupSkill.contentDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(preflytCiSetupSkill.version).toBe(4);
});
it("grounds monorepo detection, scripts, lockfiles, services and setup in the exact commit", () => {
  const context = build(),
    evidence = JSON.parse(context.prompt.user);
  expect(evidence.sourceSha).toBe(snapshot.sourceSha);
  expect(evidence.packages.map((p: any) => p.path)).toEqual([
    "package.json",
    "apps/api/package.json",
  ]);
  expect(evidence.files).toContain("pnpm-lock.yaml");
  expect(evidence.packages[1].testTools).toEqual(["vitest"]);
  const choice = context.choices.find((c) => c.sources.length)!;
  expect(choice.workflow).toContain("postgres:16");
  const result = context.validate(
    JSON.stringify({
      setupId: choice.setupId,
      summary: "Reuse the API CI setup and review its secret reference.",
    }),
  );
  expect(result.workflow).toContain("lyrisoft/preflyt-action@v2.1.2");
  expect(result.workflow).not.toContain("run: pnpm test");
  expect(result.setupSources).toEqual([".github/workflows/ci.yml → tests"]);
  expect(result.sourceSha).toBe(snapshot.sourceSha);
});
it("rejects invented setup IDs, arbitrary YAML, extra keys, malformed responses and leaked credentials", () => {
  const context = build();
  for (const raw of [
    "{}",
    "not JSON",
    JSON.stringify({ setupId: "invented", summary: "Use it" }),
    JSON.stringify({
      setupId: context.choices[0].setupId,
      summary: "Use it",
      workflow: "unsafe",
    }),
    JSON.stringify({
      setupId: context.choices[0].setupId,
      summary: "Bearer abcdefghijklmnop",
    }),
  ])
    expect(() => context.validate(raw)).toThrow();
  expect(() =>
    context.validate(
      JSON.stringify({
        setupId: context.choices[0].setupId,
        summary: "provider-credential",
      }),
      "provider-credential",
    ),
  ).toThrow();
});
it("omits potential credentials from source context and explains missing setup without inventing a service", () => {
  const context = build({
    ...snapshot,
    complete: false,
    files: [
      ...snapshot.files.filter((f) => !f.path.endsWith("ci.yml")),
      file(
        ".github/workflows/credentials.yml",
        "password: do-not-share-this-value",
      ),
    ],
  });
  expect(context.prompt.user).not.toContain("do-not-share-this-value");
  expect(context.choices[0].workflow).not.toContain("postgres:16");
  expect(
    context
      .validate(
        JSON.stringify({
          setupId: context.choices[0].setupId,
          summary: "Manifest fallback; database setup remains unknown.",
        }),
      )
      .notes.join(" "),
  ).toContain("potential credentials");
  expect(context.choices[0].notes.join(" ")).toContain("partial");
});
it("bounds model context instead of silently accepting an oversized source setup", () => {
  const files = Array.from({ length: 16 }, (_, i) =>
    file(
      `apps/${i}/package.json`,
      JSON.stringify({ scripts: { test: "x".repeat(9000) } }),
    ),
  );
  expect(() => build({ ...snapshot, files })).toThrow("too large");
});

it("does not let an unrelated expression hide a literal credential assignment", () => {
  expect(
    setupContainsCredentials(
      "run: echo process.env.USER; PASSWORD=not-for-sharing",
    ),
  ).toBe(true);
  expect(
    setupContainsCredentials("POSTGRES_PASSWORD: ${{ secrets.TEST_PASSWORD }}"),
  ).toBe(false);
  expect(setupContainsCredentials("id-token: write")).toBe(false);
});

it.each([
  "security.sast",
  "security.dependencies",
  "lint.required",
  "types.required",
  "build.required",
])("never offers AI a test-infrastructure setup for selected %s", (id) => {
  const context = ciSetupContext(
    snapshot,
    [{ id, title: id, required: true }],
    "https://preflyt.example",
  );
  expect(context.choices).toHaveLength(1);
  for (const choice of context.choices) {
    expect(choice.sources).toEqual([]);
    expect(choice.workflow).not.toContain("postgres:16");
    expect(choice.workflow).not.toContain("TEST_DATABASE_PASSWORD");
    expect(
      context.validate(
        JSON.stringify({
          setupId: choice.setupId,
          summary: "Use the setup needed by this static check.",
        }),
      ).workflow,
    ).toBe(choice.workflow);
  }
  expect(context.prompt.system).toContain("selected executable policy checks");
});
it("excludes test jobs for other package directories from AI choices", () => {
  const context = ciSetupContext(
    snapshot,
    [{ ...rules[0]!, workflowCommand: "cd apps/api && pnpm test" }],
    "https://preflyt.example",
  );
  expect(context.choices).toHaveLength(1);
  expect(context.choices[0]!.workflow).not.toContain("postgres:16");
  expect(context.choices[0]!.notes.join(" ")).toContain(
    "No reusable test setup matched",
  );
});
