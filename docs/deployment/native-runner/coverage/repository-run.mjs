import { readFile, writeFile, readdir, mkdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { XMLParser } from "/opt/preflyt/test-tools/node_modules/fast-xml-parser/src/fxp.js";
import { parseLcov, mergeCoverage } from "./lcov.mjs";
const root = "/project";
async function bounded(file) {
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 8388608) throw new Error();
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) throw new Error();
    return bytes.subarray(0, bytesRead).toString();
  } finally {
    await handle.close();
  }
}
const execute = (command, cwd) =>
  new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], {
      cwd,
      detached: true,
      stdio: "ignore",
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/scratch",
        TMPDIR: "/scratch",
        CI: "true",
        npm_config_offline: "true",
        npm_config_update_notifier: "false",
      },
    });
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, 180000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve("TEST_RUNNER_FAILED");
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
      resolve(timeout ? "TESTS_TIMED_OUT" : code === 0 ? null : "TESTS_FAILED");
    });
  });
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
let reason = "TEST_RUNNER_FAILED",
  measurement;
const testResults = [];
try {
  const installed = JSON.parse(await bounded(root + "/.preflyt-install.json"));
  if (!installed.ready) {
    reason = installed.reason;
    throw new Error();
  }
  const { packages } = JSON.parse(
    await bounded(root + "/.preflyt-test-plan.json"),
  );
  if (!Array.isArray(packages) || !packages.length || packages.length > 40)
    throw new Error();
  const sourceFiles = new Map();
  const visit = async (dir) => {
    for (const entry of await readdir("/workspace/" + dir, {
      withFileTypes: true,
    })) {
      const rel = dir ? dir + "/" + entry.name : entry.name;
      if (entry.isDirectory()) await visit(rel);
      else if (entry.isFile())
        sourceFiles.set(
          rel,
          (await readFile("/workspace/" + rel, "utf8")).split(/\r?\n/).length,
        );
    }
  };
  await visit("");
  const reports = [];
  let tests = 0,
    passed = 0;
  for (let index = 0; index < packages.length; index++) {
    const pkg = packages[index],
      out = "/scratch/coverage-" + index;
    reason = "TEST_RUNNER_FAILED";
    try {
      await mkdir(out);
      let command =
        pkg.command ??
        `${pkg.manager} run ${pkg.script}${pkg.manager === "npm" ? " --" : ""}`;
      let flags;
      if (pkg.framework === "vitest")
        flags = `--run --coverage --coverage.reporter=lcov --coverage.reportsDirectory=${quote(out)} --reporter=json --outputFile=${quote(out + "/tests.json")}`;
      else if (pkg.framework === "jest")
        flags = `--runInBand --watchAll=false --coverage --coverageReporters=lcov --coverageDirectory=${quote(out)} --json --outputFile=${quote(out + "/tests.json")}`;
      else if (pkg.framework === "node")
        flags = `--test-coverage-exclude='**/*.test.*' --test-coverage-exclude='**/node_modules/**' --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=${quote(out + "/lcov.info")} --test-reporter=junit --test-reporter-destination=${quote(out + "/tests.xml")}`;
      else {
        reason = "UNSUPPORTED_TEST_COMMAND";
        throw new Error();
      }
      if (pkg.framework === "node") {
        // Node stops parsing its own flags at a positional test file. Inject before it,
        // preserving the repository's selected test paths and all existing options.
        if (pkg.command) {
          if (!/(^|[\s;&|])node(?=\s)/.test(command)) {
            reason = "UNSUPPORTED_TEST_COMMAND";
            throw new Error();
          }
          command = command.replace(
            /(^|[\s;&|])node(?=\s)/,
            (_, prefix) => prefix + "node " + flags,
          );
        } else {
          const manifestPath = root + "/" + pkg.directory + "/package.json";
          const manifest = JSON.parse(await bounded(manifestPath));
          if (
            typeof manifest.scripts?.[pkg.script] !== "string" ||
            !/(^|[\s;&|])node(?=\s)/.test(manifest.scripts[pkg.script])
          )
            throw new Error();
          manifest.scripts[pkg.script] = manifest.scripts[pkg.script].replace(
            /(^|[\s;&|])node(?=\s)/,
            (_, prefix) => prefix + "node " + flags,
          );
          await writeFile(manifestPath, JSON.stringify(manifest));
        }
      } else command += " " + flags;
      const failure = await execute(command, root + "/" + pkg.directory);
      if (failure) {
        reason = failure;
        throw new Error();
      }
      let count, success, skipped;
      if (pkg.framework === "node") {
        const xml = await bounded(out + "/tests.xml");
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error();
        const data = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: "",
          processEntities: false,
        }).parse(xml);
        const cases = [];
        const collect = (value) => {
          if (Array.isArray(value)) value.forEach(collect);
          else if (value && typeof value === "object")
            for (const [key, child] of Object.entries(value)) {
              if (key === "testcase")
                cases.push(...(Array.isArray(child) ? child : [child]));
              else collect(child);
            }
        };
        collect(data);
        count = cases.length;
        skipped = cases.filter((c) => Object.hasOwn(c, "skipped")).length;
        success = cases.filter(
          (c) =>
            !["skipped", "error", "failure"].some((k) => Object.hasOwn(c, k)),
        ).length;
      } else {
        const data = JSON.parse(await bounded(out + "/tests.json"));
        count = data.numTotalTests;
        success = data.numPassedTests;
        skipped = data.numPendingTests ?? 0;
      }
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        !Number.isSafeInteger(success)
      ) {
        reason = "NO_TESTS_EXECUTED";
        throw new Error();
      }
      if (count !== success || skipped) {
        reason = skipped ? "TESTS_SKIPPED" : "TESTS_FAILED";
        throw new Error();
      }
      tests += count;
      passed += success;
      reason = "NO_SOURCE_COVERAGE";
      reports.push(
        parseLcov(
          await bounded(out + "/lcov.info"),
          pkg.directory,
          sourceFiles,
        ),
      );
      testResults.push({
        directory: pkg.directory,
        framework: pkg.framework,
        state: "PASS",
        reason: "CHECKS_PASSED",
      });
    } catch {
      testResults.push({
        directory: pkg.directory,
        framework: pkg.framework,
        state: "INCOMPLETE",
        reason,
      });
    }
  }
  if (testResults.some((r) => r.state !== "PASS")) {
    reason = testResults.find((r) => r.state !== "PASS").reason;
    throw new Error();
  }

  measurement = {
    version: 2,
    kind: "coverage",
    formula: "repository-lcov-lines-v1",
    scope: "configured-test-packages",
    ...mergeCoverage(reports),
    tests,
    passed,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    todo: 0,
    packages: packages.map((p) => ({
      directory: p.directory,
      framework: p.framework,
      manager: p.manager,
    })),
  };
} catch {}
const report = {
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: {
          name: "Preflyt test coverage",
          version: process.versions.node,
        },
      },
      properties: {
        ...(measurement
          ? { preflytMeasurement: measurement }
          : { preflytCoverageUnavailable: reason }),
        ...(testResults.length ? { preflytTestResults: testResults } : {}),
      },
      results: [],
    },
  ],
};
await writeFile("/reports/report.sarif", JSON.stringify(report), {
  flag: "wx",
});
process.exitCode = measurement ? 0 : 2;
