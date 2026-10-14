import { expect, it } from "vitest";
// @ts-expect-error Image-owned modules are deliberately also tested without executing repository configuration.
import {
  discoverTests,
  packageManager,
} from "../../../docs/deployment/native-runner/coverage/discovery.mjs";
// @ts-expect-error Shared image-owned LCOV projection.
import {
  parseLcov,
  mergeCoverage,
} from "../../../docs/deployment/native-runner/coverage/lcov.mjs";
import { validateHealthTestSettings } from "../src/health/health-test-settings.js";
import { validCoverageMeasurement } from "../src/health/health-measurements.js";
const pkg = (scripts: any, extra = {}) => JSON.stringify({ scripts, ...extra });
it("discovers configured package test commands without selecting tests or running configuration", () => {
  const result = discoverTests({
    "package.json": pkg({ test: "turbo run test" }, { workspaces: ["apps/*"] }),
    "apps/web/package.json": pkg({ test: "vitest run" }),
    "apps/api/package.json": pkg({ test: "NODE_ENV=test jest" }),
    "examples/unselected/package.json": pkg({ test: "jest" }),
  });
  expect(result.map((p: any) => [p.directory, p.framework, p.script])).toEqual([
    ["apps/api", "jest", "test"],
    ["apps/web", "vitest", "test"],
  ]);
});
it("keeps unsupported package commands visible and allows a scoped explicit override", () => {
  const files = { "package.json": pkg({ test: "custom-runner" }) };
  expect(discoverTests(files)[0].framework).toBe("unsupported");
  expect(
    discoverTests(files, {
      command: "npm run unit --",
      framework: "jest",
      directory: ".",
    })[0].command,
  ).toBe("npm run unit --");
  expect(() =>
    discoverTests(files, { command: "node test", framework: "auto" }),
  ).toThrow();
  expect(() =>
    discoverTests(files, {
      command: "jest",
      framework: "jest",
      directory: "../other",
    }),
  ).toThrow();
});
it("requires an unambiguous lockfile and uses pnpm workspace data including exclusions", () => {
  expect(packageManager({ "package-lock.json": "{}" }).manager).toBe("npm");
  expect(packageManager({ "pnpm-lock.yaml": "", "yarn.lock": "" }).reason).toBe(
    "AMBIGUOUS_LOCKFILES",
  );
  expect(packageManager({}).reason).toBe("LOCKFILE_REQUIRED");
  expect(
    discoverTests({
      "package.json": pkg({ test: "pnpm -r test" }),
      "packages/a/package.json": pkg({ test: "node --test" }),
      "packages/b/package.json": pkg({ test: "jest" }),
      __workspacePatterns: ["packages/*", "!packages/b"],
    }).map((p: any) => p.directory),
  ).toEqual(["packages/a"]);
});
it("unions overlapping physical source lines across packages instead of averaging percentages", () => {
  const source = new Map([["src/app.js", 4]]);
  const first = parseLcov(
    "SF:src/app.js\nDA:1,1\nDA:2,0\nend_of_record\n",
    ".",
    source,
  );
  const second = parseLcov(
    "SF:/project/src/app.js\nDA:2,1\nDA:3,0\nend_of_record\n",
    "packages/other",
    source,
  );
  expect(mergeCoverage([first, second])).toEqual({
    analyzedFiles: 1,
    analyzedLines: 3,
    coveredLines: 2,
  });
  for (const report of [
    "SF:/etc/passwd\nDA:1,1\nend_of_record",
    "SF:../src/app.js\nDA:1,1\nend_of_record",
    "SF:src/app.js\nDA:500,1\nend_of_record",
    "SF:src/app.js\nDA:1,1",
  ])
    expect(() => parseLcov(report, ".", source)).toThrow();
});
it("validates saved overrides and measured package coverage with no test/coverage fabrication", () => {
  expect(validateHealthTestSettings({})).toEqual({
    command: "",
    directory: ".",
    framework: "auto",
  });
  for (const value of [
    { command: "jest\0", framework: "jest" },
    { directory: "/tmp" },
    { framework: "unknown" },
    { secret: "abc" },
    { directory: "a/../b" },
  ])
    expect(() => validateHealthTestSettings(value)).toThrow();
  const measure = {
    version: 2,
    kind: "coverage",
    formula: "repository-lcov-lines-v1",
    scope: "configured-test-packages",
    analyzedLines: 10,
    coveredLines: 7,
    analyzedFiles: 1,
    tests: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    todo: 0,
    packages: [{ directory: ".", framework: "jest", manager: "npm" }],
  };
  expect(validCoverageMeasurement(measure)).toBe(true);
  for (const patch of [
    { passed: 1 },
    { packages: [] },
    {
      packages: [{ directory: "../other", framework: "jest", manager: "npm" }],
    },
    { coveredLines: 11 },
    { scope: "whole-repository" },
    { version: 1 },
  ])
    expect(validCoverageMeasurement({ ...measure, ...patch })).toBe(false);
});
